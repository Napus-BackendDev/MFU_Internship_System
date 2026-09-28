import type { AppEnvironment } from '@internship/config'
import type { ReportExportField } from '@internship/shared-types'
import {
  DeleteObjectCommand,
  PutObjectCommand,
  S3Client
} from '@aws-sdk/client-s3'
import type { Job, Queue } from 'bullmq'
import { createHash, randomUUID } from 'node:crypto'
import type { Types } from 'mongoose'
import type { Logger } from 'pino'

import type { WorkerModels } from './models.js'
import { renderReportExportCsv } from './report-export.csv.js'

export interface ReportExportJob {
  readonly exportId: string
}

const EXPORT_LEASE_MS = 5 * 60 * 1000
const EXPORT_RECOVERY_BATCH_SIZE = 100

interface ExportSnapshotRow {
  readonly values: Readonly<Record<string, string>>
}

export class ReportExportProcessor {
  private readonly s3: S3Client

  public constructor(
    private readonly environment: AppEnvironment,
    private readonly models: WorkerModels,
    private readonly logger: Logger,
    private readonly exportQueue?: Queue<ReportExportJob>
  ) {
    this.s3 = new S3Client({
      endpoint: environment.S3_ENDPOINT,
      region: environment.S3_REGION,
      forcePathStyle: environment.S3_FORCE_PATH_STYLE,
      credentials: {
        accessKeyId: environment.S3_ACCESS_KEY_ID,
        secretAccessKey: environment.S3_SECRET_ACCESS_KEY
      }
    })
  }

  public async process(job: Job<ReportExportJob>): Promise<void> {
    const startedAt = new Date()
    const processingToken = randomUUID()
    const reportExport = await this.models.ReportExport.findOneAndUpdate(
      {
        _id: job.data.exportId,
        expiresAt: { $gt: startedAt },
        $or: [
          { status: 'queued' },
          { status: 'processing', processingLeaseUntil: { $lte: startedAt } }
        ]
      },
      {
        $set: {
          status: 'processing',
          processingStartedAt: startedAt,
          processingLeaseUntil: new Date(startedAt.getTime() + EXPORT_LEASE_MS),
          processingToken
        },
        $unset: { failureCode: 1 }
      },
      { returnDocument: 'after' }
    ).exec()
    if (!reportExport) return
    const leaseHeartbeat = setInterval(() => {
      void this.extendLease(reportExport.id, processingToken)
    }, 60_000)
    leaseHeartbeat.unref?.()

    try {
      if (reportExport.format !== 'csv') {
        throw new Error('UNSUPPORTED_EXPORT_FORMAT')
      }
      const rows = await this.models.ReportExportSnapshot.find({
        exportId: job.data.exportId
      })
        .select('+values')
        .sort({ _id: 1 })
        .lean<ExportSnapshotRow[]>()
        .exec()
      if (rows.length !== reportExport.rowCount) {
        throw new Error('EXPORT_SNAPSHOT_INCOMPLETE')
      }

      const fields = reportExport.fields as ReportExportField[]
      const bytes = Buffer.from(renderReportExportCsv(fields, rows), 'utf8')
      const sha256 = createHash('sha256').update(bytes).digest('hex')
      const objectKey = `report-exports/${job.data.exportId}/${sha256}.csv`
      await this.s3.send(
        new PutObjectCommand({
          Bucket: this.environment.S3_BUCKET,
          Key: objectKey,
          Body: bytes,
          ContentType: 'text/csv; charset=utf-8',
          ContentDisposition: `attachment; filename="report-${job.data.exportId}.csv"`,
          Metadata: { sha256 }
        })
      )
      const result = await this.models.ReportExport.updateOne(
        {
          _id: reportExport.id,
          status: 'processing',
          processingToken
        },
        {
          $set: {
            status: 'ready',
            objectKey,
            sha256,
            completedAt: new Date()
          },
          $unset: {
            processingStartedAt: 1,
            processingLeaseUntil: 1,
            processingToken: 1
          }
        }
      ).exec()
      if (result.matchedCount !== 1) {
        this.logger.warn(
          { exportId: job.data.exportId },
          'report export lease expired before completion'
        )
      }
    } catch (error: unknown) {
      const attempts = job.opts.attempts ?? 1
      const isLastAttempt = job.attemptsMade + 1 >= attempts
      await this.models.ReportExport.updateOne(
        {
          _id: reportExport.id,
          status: 'processing',
          processingToken
        },
        {
          $set: {
            status: isLastAttempt ? 'failed' : 'queued',
            failureCode: 'EXPORT_GENERATION_FAILED'
          },
          $unset: {
            processingStartedAt: 1,
            processingLeaseUntil: 1,
            processingToken: 1
          }
        }
      ).exec()
      this.logger.error(
        {
          exportId: job.data.exportId,
          failureCode: 'EXPORT_GENERATION_FAILED',
          errorName: error instanceof Error ? error.name : 'UnknownError'
        },
        'report export generation failed'
      )
      throw error
    } finally {
      clearInterval(leaseHeartbeat)
    }
  }

  public async recoverQueuedExports(): Promise<void> {
    const now = new Date()
    await this.models.ReportExport.updateMany(
      {
        status: 'processing',
        processingLeaseUntil: { $lte: now },
        expiresAt: { $gt: now }
      },
      {
        $set: { status: 'queued' },
        $unset: {
          processingStartedAt: 1,
          processingLeaseUntil: 1,
          processingToken: 1
        }
      }
    ).exec()
    let afterId: Types.ObjectId | undefined
    while (true) {
      const queued = await this.models.ReportExport.find({
        status: 'queued',
        expiresAt: { $gt: now },
        ...(afterId ? { _id: { $gt: afterId } } : {})
      })
        .select('_id')
        .sort({ _id: 1 })
        .limit(EXPORT_RECOVERY_BATCH_SIZE)
        .lean<Array<{ readonly _id: Types.ObjectId }>>()
        .exec()
      if (queued.length === 0) break

      for (const record of queued) {
        afterId = record._id
        try {
          const jobId = `report-export-${record._id.toString()}`
          const existingJob = await this.exportQueue?.getJob(jobId)
          if (existingJob) {
            const state = await existingJob.getState()
            if (
              [
                'active',
                'waiting',
                'delayed',
                'waiting-children',
                'paused'
              ].includes(state)
            ) {
              continue
            }
            await existingJob.remove()
          }
          await this.exportQueue?.add(
            'generate-csv',
            { exportId: record._id.toString() },
            {
              attempts: 3,
              backoff: { type: 'exponential', delay: 5000 },
              jobId,
              removeOnComplete: 500,
              removeOnFail: 1000
            }
          )
        } catch (error: unknown) {
          this.logger.warn(
            {
              exportId: record._id.toString(),
              errorName: error instanceof Error ? error.name : 'UnknownError'
            },
            'report export recovery enqueue failed'
          )
        }
      }
    }
  }

  public async expireExports(): Promise<void> {
    const expired = await this.models.ReportExport.find({
      expiresAt: { $lte: new Date() },
      $or: [
        { status: { $in: ['queued', 'ready', 'failed'] } },
        { status: 'processing', processingLeaseUntil: { $lte: new Date() } }
      ]
    })
      .select('+objectKey')
      .sort({ expiresAt: 1 })
      .limit(EXPORT_RECOVERY_BATCH_SIZE)
      .exec()
    for (const reportExport of expired) {
      try {
        if (reportExport.objectKey) {
          await this.s3.send(
            new DeleteObjectCommand({
              Bucket: this.environment.S3_BUCKET,
              Key: reportExport.objectKey
            })
          )
        }
        await this.models.ReportExport.updateOne(
          { _id: reportExport.id, status: { $ne: 'expired' } },
          {
            $set: { status: 'expired' },
            $unset: {
              objectKey: 1,
              sha256: 1,
              processingStartedAt: 1,
              processingLeaseUntil: 1,
              processingToken: 1
            }
          }
        ).exec()
        await this.models.ReportExportSnapshot.deleteMany({
          exportId: reportExport.id
        }).exec()
      } catch (error: unknown) {
        this.logger.error(
          {
            exportId: reportExport.id,
            errorName: error instanceof Error ? error.name : 'UnknownError'
          },
          'expired report export cleanup failed'
        )
      }
    }
  }

  private async extendLease(
    exportId: string,
    processingToken: string
  ): Promise<void> {
    try {
      const now = new Date()
      await this.models.ReportExport.updateOne(
        {
          _id: exportId,
          status: 'processing',
          processingToken
        },
        {
          $set: {
            processingStartedAt: now,
            processingLeaseUntil: new Date(now.getTime() + EXPORT_LEASE_MS)
          }
        }
      ).exec()
    } catch (error: unknown) {
      this.logger.warn(
        {
          exportId,
          errorName: error instanceof Error ? error.name : 'UnknownError'
        },
        'report export lease heartbeat failed'
      )
    }
  }
}
