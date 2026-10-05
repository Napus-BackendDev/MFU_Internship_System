import { createHash, randomUUID } from 'node:crypto'
import fs from 'node:fs'

import type { AppEnvironment } from '@internship/config'
import {
  GetObjectCommand,
  PutObjectCommand,
  S3Client
} from '@aws-sdk/client-s3'
import fontkit from '@pdf-lib/fontkit'
import type { Job, Queue } from 'bullmq'
import { PDFDocument } from 'pdf-lib'
import type { PDFFont } from 'pdf-lib'
import type { Logger } from 'pino'
import type { Types } from 'mongoose'
import {
  parseCanonicalDocumentV1,
  parseCanonicalDocumentV2,
  type DocumentIssueSnapshotV1,
  type CanonicalDocumentV1,
  type CanonicalDocumentV2
} from '@internship/shared-types'

import type { WorkerModels } from './models.js'
import { persistDocumentIssue } from './document-issue.js'
import { renderDocumentTemplate } from './document-renderer.js'

export interface DocumentJob {
  readonly documentId: string
}

export type DocumentFontEmbedder = (
  pdf: unknown,
  fontBytes: Uint8Array
) => Promise<unknown>

const DOCUMENT_LEASE_MS = 5 * 60 * 1000
const DOCUMENT_LEASE_HEARTBEAT_MS = 60 * 1000
const DOCUMENT_RECOVERY_BATCH_SIZE = 100
const QUEUE_RETRYABLE_FAILURE = 'QUEUE_ENQUEUE_FAILED'
const ACTIVE_QUEUE_STATES = new Set([
  'active',
  'waiting',
  'delayed',
  'waiting-children',
  'paused',
  'prioritized'
])

export class DocumentProcessor {
  private readonly s3: S3Client

  public constructor(
    private readonly environment: AppEnvironment,
    private readonly models: WorkerModels,
    private readonly logger: Logger,
    private readonly documentQueue?: Queue<DocumentJob>,
    private readonly embedDocumentFont: DocumentFontEmbedder = (pdf, bytes) =>
      (pdf as PDFDocument).embedFont(bytes, { subset: true })
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

  public async process(job: Job<DocumentJob>): Promise<void> {
    const startedAt = new Date()
    const processingToken = randomUUID()
    const document = await this.models.GeneratedDocument.findOneAndUpdate(
      {
        _id: job.data.documentId,
        status: { $in: ['queued', 'failed'] }
      },
      {
        $set: {
          status: 'processing',
          processingStartedAt: startedAt,
          processingLeaseUntil: new Date(
            startedAt.getTime() + DOCUMENT_LEASE_MS
          ),
          processingToken
        },
        $unset: { failureCode: 1 }
      },
      { returnDocument: 'after' }
    ).select('+resourceScopes +sourceSnapshot')
    if (!document || document.status === 'ready') return

    const leaseHeartbeat = setInterval(() => {
      void this.extendLease(document.id, processingToken)
    }, DOCUMENT_LEASE_HEARTBEAT_MS)
    leaseHeartbeat.unref?.()

    try {
      const snapshot = parseDocumentIssueSnapshot(document.sourceSnapshot)
      if (
        snapshot.student.recordId !== document.studentId ||
        snapshot.template.versionId !== document.templateVersionId ||
        !sameStringSet(
          snapshot.evaluations.map((evaluation) => evaluation.id),
          document.evaluationIds
        )
      ) {
        throw new Error('DOCUMENT_SOURCE_INVALID')
      }
      if (!snapshot.evaluations.length) {
        throw new Error('DOCUMENT_EVALUATION_REQUIRED')
      }
      const canonical = parseCanonicalDocument(
        snapshot.template.canonicalJson,
        snapshot.template.schemaVersion,
        snapshot.template.placeholders
      )
      let fontBytes: Uint8Array
      if (snapshot.template.fontAssets.length === 1) {
        const fontAsset = snapshot.template.fontAssets[0]
        if (!fontAsset) throw new Error('FONT_ASSET_REQUIRED')
        const fontResponse = await this.s3.send(
          new GetObjectCommand({
            Bucket: this.environment.S3_BUCKET,
            Key: fontAsset.key
          })
        )
        if (!fontResponse.Body) throw new Error('FONT_ASSET_NOT_FOUND')
        fontBytes = await fontResponse.Body.transformToByteArray()
        if (
          createHash('sha256').update(fontBytes).digest('hex') !==
          fontAsset.sha256
        ) {
          throw new Error('FONT_ASSET_CHECKSUM_MISMATCH')
        }
      } else if (snapshot.template.fontAssets.length === 0) {
        try {
          const fontResponse = await this.s3.send(
            new GetObjectCommand({
              Bucket: this.environment.S3_BUCKET,
              Key: 'approved-fonts/tahoma.ttf'
            })
          )
          if (fontResponse.Body) {
            fontBytes = await fontResponse.Body.transformToByteArray()
          } else {
            throw new Error('FONT_NOT_IN_S3')
          }
        } catch {
          const localFallback = new URL('../../../assets/tahoma.ttf', import.meta.url)
          fontBytes = await fs.promises.readFile(localFallback)
        }
      } else {
        throw new Error('DOCUMENT_FONT_MAPPING_UNSUPPORTED')
      }

      const imageBytes = new Map<string, Uint8Array>()
      if (snapshot.template.schemaVersion === 2) {
        const requiredImageAssets = collectImageAssetRequirements(canonical)
        const registeredImageAssets = snapshot.template.imageAssets ?? []
        if (requiredImageAssets.size > 0) {
          if (
            requiredImageAssets.size !== registeredImageAssets.length ||
            new Set(registeredImageAssets.map((asset) => asset.key)).size !==
              registeredImageAssets.length
          ) {
            throw new Error('DOCUMENT_IMAGE_ASSET_SOURCE_INVALID')
          }
          for (const asset of registeredImageAssets) {
            if (requiredImageAssets.get(asset.key) !== asset.assetType) {
              throw new Error('DOCUMENT_IMAGE_ASSET_SOURCE_INVALID')
            }
          }
          const images = await Promise.all(
            registeredImageAssets.map(async (asset) => {
              const response = await this.s3.send(
                new GetObjectCommand({
                  Bucket: this.environment.S3_BUCKET,
                  Key: asset.key
                })
              )
              if (!response.Body)
                throw new Error('DOCUMENT_IMAGE_ASSET_NOT_FOUND')
              const bytes = await response.Body.transformToByteArray()
              if (
                createHash('sha256').update(bytes).digest('hex') !== asset.sha256
              ) {
                throw new Error('DOCUMENT_IMAGE_ASSET_CHECKSUM_MISMATCH')
              }
              return [asset.key, bytes] as const
            })
          )
          for (const [key, bytes] of images) imageBytes.set(key, bytes)
        }
      } else if ((snapshot.template.imageAssets?.length ?? 0) > 0) {
        throw new Error('DOCUMENT_IMAGE_ASSET_SOURCE_INVALID')
      }

      const pdf = await PDFDocument.create()
      pdf.registerFontkit(fontkit)
      pdf.setTitle(
        snapshot.template.documentType === 'certificate'
          ? 'Internship Certificate'
          : 'Internship Transcript'
      )
      pdf.setCreator('Internship Transcript System V2')
      pdf.setProducer('Internship Transcript System V2')
      pdf.setCreationDate(new Date(0))
      pdf.setModificationDate(new Date(0))
      const font = (await this.embedDocumentFont(pdf, fontBytes)) as PDFFont
      const page = pdf.addPage([canonical.width, canonical.height])
      await renderDocumentTemplate(
        pdf,
        page,
        canonical,
        snapshot.template.schemaVersion,
        snapshot,
        font,
        imageBytes
      )

      const bytes = await pdf.save({
        addDefaultPage: false,
        objectsPerTick: 50,
        useObjectStreams: true,
        updateFieldAppearances: false
      })
      const sha256 = createHash('sha256').update(bytes).digest('hex')
      const objectKey = `generated-documents/${document.studentId}/${document.id}-${sha256}.pdf`
      await this.s3.send(
        new PutObjectCommand({
          Bucket: this.environment.S3_BUCKET,
          Key: objectKey,
          Body: bytes,
          ContentType: 'application/pdf',
          Metadata: { sha256 }
        })
      )
      await persistDocumentIssue(
        this.models,
        {
          id: document.id,
          studentId: document.studentId,
          templateVersionId: document.templateVersionId,
          evaluationIds: document.evaluationIds,
          requestedBy: document.requestedBy,
          requestedByEmail: document.requestedByEmail,
          requestId: document.requestId,
          resourceScopes: document.resourceScopes,
          processingToken
        },
        objectKey,
        sha256
      )
      this.logger.info({ documentId: document.id, sha256 }, 'PDF generated')
    } catch (error: unknown) {
      const code =
        error instanceof Error ? error.message.slice(0, 100) : 'PDF_FAILED'
      await this.models.GeneratedDocument.updateOne(
        {
          _id: document.id,
          status: 'processing',
          processingToken
        },
        {
          $set: { status: 'failed', failureCode: code },
          $unset: {
            processingStartedAt: 1,
            processingLeaseUntil: 1,
            processingToken: 1
          }
        }
      )
      throw error
    } finally {
      clearInterval(leaseHeartbeat)
    }
  }

  public async recoverStuckDocuments(now = new Date()): Promise<void> {
    if (!this.documentQueue) return

    const legacyCutoff = new Date(now.getTime() - DOCUMENT_LEASE_MS)
    let afterId: Types.ObjectId | undefined
    while (true) {
      const stale = await this.models.GeneratedDocument.find({
        status: 'processing',
        $or: [
          { processingLeaseUntil: { $lte: now } },
          {
            processingLeaseUntil: { $exists: false },
            processingStartedAt: { $lte: legacyCutoff }
          }
        ],
        ...(afterId ? { _id: { $gt: afterId } } : {})
      })
        .select('_id processingLeaseUntil processingStartedAt processingToken')
        .sort({ _id: 1 })
        .limit(DOCUMENT_RECOVERY_BATCH_SIZE)
        .lean()
        .exec()
      if (stale.length === 0) break

      for (const document of stale) {
        afterId = document._id
        const legacyLease = !document.processingLeaseUntil
        const recovered = await this.models.GeneratedDocument.updateOne(
          {
            _id: document._id,
            status: 'processing',
            ...(document.processingToken
              ? { processingToken: document.processingToken }
              : {}),
            ...(legacyLease
              ? {
                  processingLeaseUntil: { $exists: false },
                  processingStartedAt: { $lte: legacyCutoff }
                }
              : { processingLeaseUntil: { $lte: now } })
          },
          {
            $set: { status: 'queued' },
            $unset: {
              processingStartedAt: 1,
              processingLeaseUntil: 1,
              processingToken: 1
            }
          }
        )
        if (recovered.matchedCount === 1) {
          this.logger.warn(
            { documentId: document._id.toString() },
            'stale PDF generation returned to queue'
          )
        }
      }
    }

    await this.enqueueRecoverableDocuments()
  }

  private async enqueueRecoverableDocuments(): Promise<void> {
    const queue = this.documentQueue
    if (!queue) return
    let afterId: Types.ObjectId | undefined
    while (true) {
      const documents = await this.models.GeneratedDocument.find({
        $or: [
          { status: 'queued' },
          {
            status: 'failed',
            failureCode: QUEUE_RETRYABLE_FAILURE
          }
        ],
        ...(afterId ? { _id: { $gt: afterId } } : {})
      })
        .select('_id')
        .sort({ _id: 1 })
        .limit(DOCUMENT_RECOVERY_BATCH_SIZE)
        .lean()
        .exec()
      if (documents.length === 0) break

      for (const document of documents) {
        afterId = document._id
        const jobId = `document-${document._id.toString()}`
        try {
          const existingJob = await queue.getJob(jobId)
          if (existingJob) {
            const state = await existingJob.getState()
            if (ACTIVE_QUEUE_STATES.has(state)) continue
            await existingJob.remove()
          }
          await queue.add(
            'generate-pdf',
            { documentId: document._id.toString() },
            {
              attempts: 3,
              backoff: { type: 'exponential', delay: 10_000 },
              jobId,
              removeOnComplete: 500,
              removeOnFail: 1000
            }
          )
        } catch (error: unknown) {
          this.logger.error(
            {
              documentId: document._id.toString(),
              error: error instanceof Error ? error.message : 'QUEUE_FAILED'
            },
            'could not re-enqueue pending PDF generation'
          )
        }
      }
    }
  }

  private async extendLease(
    documentId: string,
    processingToken: string
  ): Promise<void> {
    try {
      const result = await this.models.GeneratedDocument.updateOne(
        {
          _id: documentId,
          status: 'processing',
          processingToken
        },
        {
          $set: {
            processingLeaseUntil: new Date(Date.now() + DOCUMENT_LEASE_MS)
          }
        }
      )
      if (result.matchedCount !== 1) {
        this.logger.warn(
          { documentId },
          'PDF generation lease is no longer owned'
        )
      }
    } catch {
      this.logger.error({ documentId }, 'PDF generation lease heartbeat failed')
    }
  }
}

function parseDocumentIssueSnapshot(value: unknown): DocumentIssueSnapshotV1 {
  if (
    typeof value !== 'object' ||
    value === null ||
    Array.isArray(value) ||
    (value as { snapshotVersion?: unknown }).snapshotVersion !== 1
  ) {
    throw new Error('DOCUMENT_SOURCE_SNAPSHOT_REQUIRED')
  }
  return value as DocumentIssueSnapshotV1
}

function sameStringSet(
  left: readonly string[],
  right: readonly string[]
): boolean {
  return (
    left.length === right.length &&
    new Set(left).size === left.length &&
    new Set(right).size === right.length &&
    left.every((value) => right.includes(value))
  )
}

function parseCanonicalDocument(
  input: unknown,
  schemaVersion: number,
  declaredPlaceholders: readonly string[]
): CanonicalDocumentV1 | CanonicalDocumentV2 {
  if (schemaVersion === 1) {
    const document = parseCanonicalDocumentV1(
      input,
      schemaVersion,
      declaredPlaceholders
    )
    if (!document) throw new Error('DOCUMENT_TEMPLATE_INVALID')
    return document
  }
  const document = parseCanonicalDocumentV2(
    input,
    schemaVersion,
    declaredPlaceholders
  )
  if (!document) throw new Error('DOCUMENT_TEMPLATE_INVALID')
  return document
}

function collectImageAssetRequirements(
  canonical: CanonicalDocumentV1 | CanonicalDocumentV2
): Map<string, 'emblem' | 'signature'> {
  if (
    !('elements' in canonical) ||
    !canonical.elements.some((element) => 'id' in element)
  ) {
    return new Map()
  }
  const requirements = new Map<string, 'emblem' | 'signature'>()
  for (const element of canonical.elements as CanonicalDocumentV2['elements']) {
    if (element.type === 'emblem' && element.assetKey) {
      requirements.set(element.assetKey, 'emblem')
    }
    if (element.type === 'signature' && element.assetKeys) {
      for (const key of element.assetKeys) {
        if (requirements.has(key)) {
          throw new Error('DOCUMENT_IMAGE_ASSET_SOURCE_INVALID')
        }
        requirements.set(key, 'signature')
      }
    }
  }
  return requirements
}
