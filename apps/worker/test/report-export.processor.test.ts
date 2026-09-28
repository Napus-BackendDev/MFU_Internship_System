import { PutObjectCommand } from '@aws-sdk/client-s3'
import type { Job } from 'bullmq'
import type { AppEnvironment } from '@internship/config'
import type { ReportExportField } from '@internship/shared-types'
import { describe, expect, it } from 'vitest'

import { ReportExportProcessor } from '../src/runtime/report-export.processor.js'
import type { ReportExportJob } from '../src/runtime/report-export.processor.js'
import type { WorkerModels } from '../src/runtime/models.js'

interface ExportUpdate {
  readonly $set?: Readonly<Record<string, unknown>>
  readonly $unset?: Readonly<Record<string, unknown>>
}

interface UpdateWrite {
  readonly filter: unknown
  readonly update: ExportUpdate
}

interface ExportSnapshotRow {
  readonly values: Readonly<Record<string, string>>
}

interface ProcessorHarness {
  readonly processor: ReportExportProcessor
  readonly uploadedCommands: PutObjectCommand[]
  readonly updates: UpdateWrite[]
}

interface SnapshotQuery {
  select(): SnapshotQuery
  sort(): SnapshotQuery
  lean(): SnapshotQuery
  exec(): Promise<ExportSnapshotRow[]>
}

function createProcessor(
  input: {
    readonly rows?: readonly ExportSnapshotRow[]
    readonly rowCount?: number
  } = {}
): ProcessorHarness {
  const uploadedCommands: PutObjectCommand[] = []
  const updates: UpdateWrite[] = []
  const processingRecord = {
    id: '64b000000000000000000001',
    status: 'processing',
    format: 'csv',
    fields: ['studentName', 'status'] as ReportExportField[],
    rowCount: input.rowCount ?? 1,
    expiresAt: new Date(Date.now() + 60_000)
  }
  const findOneAndUpdate = (
    _filter: unknown,
    update: { readonly $set: { readonly processingToken: string } }
  ): {
    exec: () => Promise<typeof processingRecord & { processingToken: string }>
  } => ({
    exec: () =>
      Promise.resolve({
        ...processingRecord,
        processingToken: update.$set.processingToken
      })
  })
  const updateOne = (
    filter: unknown,
    update: ExportUpdate
  ): { exec: () => Promise<{ matchedCount: number }> } => {
    updates.push({ filter, update })
    return { exec: () => Promise.resolve({ matchedCount: 1 }) }
  }
  const snapshotRows = [
    ...(input.rows ?? [
      { values: { studentName: 'Test Student', status: 'submitted' } }
    ])
  ]
  const snapshotQuery: SnapshotQuery = {
    select: () => snapshotQuery,
    sort: () => snapshotQuery,
    lean: () => snapshotQuery,
    exec: () => Promise.resolve(snapshotRows)
  }
  const snapshots = {
    find: (): SnapshotQuery => snapshotQuery
  }
  const models = {
    ReportExport: { findOneAndUpdate, updateOne },
    ReportExportSnapshot: snapshots
  } as unknown as WorkerModels
  const processor = new ReportExportProcessor(
    {
      S3_BUCKET: 'private-test',
      S3_ENDPOINT: 'http://127.0.0.1:9000',
      S3_REGION: 'us-east-1',
      S3_FORCE_PATH_STYLE: true,
      S3_ACCESS_KEY_ID: 'test-access-key',
      S3_SECRET_ACCESS_KEY: 'test-secret-key'
    } as AppEnvironment,
    models,
    {
      info: () => undefined,
      warn: () => undefined,
      error: () => undefined
    } as never
  )
  Object.defineProperty(processor, 's3', {
    configurable: true,
    value: {
      send: (command: PutObjectCommand): Promise<void> => {
        uploadedCommands.push(command)
        return Promise.resolve()
      }
    }
  })
  return { processor, uploadedCommands, updates }
}

describe('ReportExportProcessor', () => {
  it('uploads a deterministic private CSV and marks the export ready with its checksum', async () => {
    const { processor, uploadedCommands, updates } = createProcessor()
    const job = {
      data: { exportId: '64b000000000000000000001' },
      opts: { attempts: 3 },
      attemptsMade: 0
    } as Job<ReportExportJob>

    await processor.process(job)

    expect(uploadedCommands).toHaveLength(1)
    const command = uploadedCommands[0]
    if (!command) throw new Error('EXPECTED_PUT_OBJECT_COMMAND')
    expect(command).toBeInstanceOf(PutObjectCommand)
    expect(command.input.Bucket).toBe('private-test')
    expect(command.input.Key).toMatch(
      /^report-exports\/64b000000000000000000001\/[a-f\d]{64}\.csv$/
    )
    expect(command.input.ContentType).toBe('text/csv; charset=utf-8')
    expect(command.input.ContentDisposition).toBe(
      'attachment; filename="report-64b000000000000000000001.csv"'
    )
    const body = command.input.Body
    if (!Buffer.isBuffer(body)) throw new Error('EXPECTED_BUFFER_UPLOAD')
    expect(body.toString('utf8')).toBe(
      '\uFEFFStudent Name,Assignment Status\r\nTest Student,submitted\r\n'
    )
    expect(updates).toHaveLength(1)
    expect(updates[0]?.filter).toMatchObject({
      _id: '64b000000000000000000001',
      status: 'processing'
    })
    const readyUpdate = updates[0]?.update.$set
    expect(readyUpdate?.status).toBe('ready')
    expect(typeof readyUpdate?.objectKey).toBe('string')
    expect(typeof readyUpdate?.sha256).toBe('string')
  })

  it('does not publish partial output and leaves retryable work queued', async () => {
    const { processor, uploadedCommands, updates } = createProcessor({
      rowCount: 2
    })
    const job = {
      data: { exportId: '64b000000000000000000001' },
      opts: { attempts: 3 },
      attemptsMade: 0
    } as Job<ReportExportJob>

    await expect(processor.process(job)).rejects.toThrow(
      'EXPORT_SNAPSHOT_INCOMPLETE'
    )
    expect(uploadedCommands).toHaveLength(0)
    expect(updates).toHaveLength(1)
    expect(updates[0]?.update.$set?.status).toBe('queued')
  })
})
