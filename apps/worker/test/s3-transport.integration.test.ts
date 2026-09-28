import { createServer, type IncomingMessage } from 'node:http'

import type { AppEnvironment } from '@internship/config'
import type { ReportExportField } from '@internship/shared-types'
import type { Job } from 'bullmq'
import type { Server } from 'node:http'
import { afterEach, describe, expect, it } from 'vitest'

import { ReportExportProcessor } from '../src/runtime/report-export.processor.js'
import type { ReportExportJob } from '../src/runtime/report-export.processor.js'
import type { WorkerModels } from '../src/runtime/models.js'

interface CapturedRequest {
  readonly method: string | undefined
  readonly path: string
  readonly headers: IncomingMessage['headers']
  readonly body: Buffer
}

interface SnapshotRow {
  readonly values: Readonly<Record<string, string>>
}

class SnapshotQuery {
  public constructor(private readonly rows: readonly SnapshotRow[]) {}

  public select(): this {
    return this
  }

  public sort(): this {
    return this
  }

  public lean(): this {
    return this
  }

  public exec(): Promise<readonly SnapshotRow[]> {
    return Promise.resolve(this.rows)
  }
}

describe('ReportExportProcessor S3 transport integration', () => {
  let activeServer: Server | undefined

  afterEach(async () => {
    if (!activeServer?.listening) return
    await new Promise<void>((resolve, reject) =>
      activeServer!.close((error) => (error ? reject(error) : resolve()))
    )
    activeServer = undefined
  })

  it('sends a signed path-style PutObject and marks the export ready', async () => {
    const requests: CapturedRequest[] = []
    activeServer = createServer((request, response) => {
      const chunks: Buffer[] = []
      request.on('data', (chunk: Buffer | string) => {
        chunks.push(Buffer.from(chunk))
      })
      request.on('end', () => {
        requests.push({
          method: request.method,
          path: request.url ?? '',
          headers: request.headers,
          body: Buffer.concat(chunks)
        })
        response.writeHead(200, { ETag: '"local-s3-test-etag"' })
        response.end()
      })
    })
    await new Promise<void>((resolve) =>
      activeServer!.listen(0, '127.0.0.1', resolve)
    )

    const address = activeServer.address()
    if (!address || typeof address === 'string') {
      throw new Error('S3 test server did not bind to a TCP port')
    }

    const exportId = '64b000000000000000000001'
    const updateCalls: Array<{ filter: unknown; update: unknown }> = []
    const reportExport = {
      id: exportId,
      status: 'processing',
      format: 'csv',
      fields: ['studentName', 'status'] as ReportExportField[],
      rowCount: 1,
      expiresAt: new Date(Date.now() + 60_000)
    }
    const models = {
      ReportExport: {
        findOneAndUpdate: (
          _filter: unknown,
          update: { $set: { processingToken: string } }
        ) => ({
          exec: () =>
            Promise.resolve({
              ...reportExport,
              processingToken: update.$set.processingToken
            })
        }),
        updateOne: (filter: unknown, update: unknown) => {
          updateCalls.push({ filter, update })
          return { exec: () => Promise.resolve({ matchedCount: 1 }) }
        }
      },
      ReportExportSnapshot: {
        find: () =>
          new SnapshotQuery([
            { values: { studentName: 'Ada Lovelace', status: 'submitted' } }
          ])
      }
    } as unknown as WorkerModels
    const processor = new ReportExportProcessor(
      {
        S3_BUCKET: 'private-test-bucket',
        S3_ENDPOINT: `http://127.0.0.1:${address.port}`,
        S3_REGION: 'us-east-1',
        S3_FORCE_PATH_STYLE: true,
        S3_ACCESS_KEY_ID: 'test-only-access-key',
        S3_SECRET_ACCESS_KEY: 'test-only-secret-key'
      } as AppEnvironment,
      models,
      {
        info: () => undefined,
        warn: () => undefined,
        error: () => undefined
      } as never
    )
    const s3Client = (processor as unknown as { s3: { destroy: () => void } })
      .s3

    try {
      await processor.process({
        data: { exportId },
        opts: { attempts: 3 },
        attemptsMade: 0
      } as Job<ReportExportJob>)
    } finally {
      s3Client.destroy()
    }

    expect(requests).toHaveLength(1)
    const request = requests[0]
    if (!request) throw new Error('S3 client did not issue a request')
    const requestUrl = new URL(request.path, 'http://local-s3.test')
    expect(request.method).toBe('PUT')
    expect(requestUrl.pathname).toMatch(
      /^\/private-test-bucket\/report-exports\/64b000000000000000000001\/[a-f\d]{64}\.csv$/
    )
    expect(requestUrl.searchParams.get('x-id')).toBe('PutObject')
    expect(request.headers.authorization).toMatch(
      /^AWS4-HMAC-SHA256 Credential=test-only-access-key\//
    )
    expect(request.headers['x-amz-acl']).toBeUndefined()
    expect(request.headers['content-type']).toBe('text/csv; charset=utf-8')
    expect(request.headers['content-disposition']).toBe(
      `attachment; filename="report-${exportId}.csv"`
    )
    expect(request.body.toString('utf8')).toBe(
      '\uFEFFStudent Name,Assignment Status\r\nAda Lovelace,submitted\r\n'
    )
    expect(updateCalls).toHaveLength(1)
    expect(updateCalls[0]?.update).toMatchObject({
      $set: {
        status: 'ready',
        objectKey: requestUrl.pathname.slice('/private-test-bucket/'.length)
      }
    })
  })
})
