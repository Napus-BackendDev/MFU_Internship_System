import { randomUUID } from 'node:crypto'

import { MongoMemoryReplSet } from 'mongodb-memory-server-core'
import { Queue, Worker } from 'bullmq'
import { Redis } from 'ioredis'
import { createConnection, Types, type Connection } from 'mongoose'
import type { Logger } from 'pino'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

import type { AppEnvironment } from '@internship/config'
import { ReportExportProcessor } from '../../worker/src/runtime/report-export.processor.js'
import type { ReportExportJob } from '../../worker/src/runtime/report-export.processor.js'
import { createModels } from '../../worker/src/runtime/models.js'

const testRedisUrl = process.env.TEST_REDIS_URL

if (process.env.CI === 'true' && !testRedisUrl) {
  throw new Error(
    'CI must configure TEST_REDIS_URL for Mongo and report-export recovery tests.'
  )
}

describe.skipIf(!testRedisUrl)(
  'Report export recovery with isolated MongoDB and Redis',
  () => {
    let replicaSet: MongoMemoryReplSet
    let connection: Connection

    beforeAll(async () => {
      replicaSet = await MongoMemoryReplSet.create({
        binary: {
          ...(process.env.TEST_MONGODB_SYSTEM_BINARY
            ? { systemBinary: process.env.TEST_MONGODB_SYSTEM_BINARY }
            : {}),
          ...(process.platform === 'win32' && process.arch === 'arm64'
            ? { arch: 'x64' as const }
            : {}),
          version: process.env.TEST_MONGODB_VERSION ?? '8.0.28'
        },
        replSet: { count: 1, storageEngine: 'wiredTiger' }
      })
      connection = await createConnection(replicaSet.getUri()).asPromise()
    }, 60_000)

    afterAll(async () => {
      await connection?.close()
      await replicaSet?.stop()
    }, 30_000)

    it('replaces retained failed BullMQ job when Mongo still says queued', async () => {
      const models = createModels(connection)
      const exportId = new Types.ObjectId()
      const jobId = `report-export-${exportId.toString()}`
      const prefix = `internship-report-export-test-${randomUUID()}`
      const queueName = `report-export-recovery-${randomUUID()}`
      const redisConnections: Redis[] = []
      let queue: Queue<ReportExportJob> | undefined
      let worker: Worker<ReportExportJob, void> | undefined

      const createRedisConnection = (): Redis => {
        const redis = new Redis(testRedisUrl!, { maxRetriesPerRequest: null })
        redisConnections.push(redis)
        return redis
      }

      try {
        await models.ReportExport.create({
          _id: exportId,
          requestedBy: 'isolated-admin',
          requestHash: 'isolated-export-request-hash',
          filters: {},
          fields: ['studentId'],
          format: 'csv',
          status: 'queued',
          rowCount: 1,
          snapshotAt: new Date(),
          expiresAt: new Date(Date.now() + 60 * 60 * 1000),
          resourceScopes: []
        })

        queue = new Queue<ReportExportJob>(queueName, {
          connection: createRedisConnection(),
          prefix
        })
        await queue.waitUntilReady()
        let resolveFailed!: () => void
        let rejectFailed!: (error: Error) => void
        const failed = new Promise<void>((resolve, reject) => {
          resolveFailed = resolve
          rejectFailed = reject
        })
        worker = new Worker<ReportExportJob, void>(
          queueName,
          () => {
            throw new Error('isolated worker crash')
          },
          {
            connection: createRedisConnection(),
            concurrency: 1,
            prefix
          }
        )
        worker.on('failed', (job) => {
          if (job?.id === jobId) resolveFailed()
        })
        worker.on('error', rejectFailed)
        await worker.waitUntilReady()

        await queue.add(
          'generate-report',
          { exportId: exportId.toString() },
          { attempts: 1, jobId, removeOnFail: 1000 }
        )
        await failed
        expect(await (await queue.getJob(jobId))?.getState()).toBe('failed')
        await expect(
          models.ReportExport.findById(exportId).lean()
        ).resolves.toMatchObject({ status: 'queued' })
        await worker.close()
        worker = undefined

        const processor = new ReportExportProcessor(
          {
            S3_BUCKET: 'isolated-test-bucket',
            S3_ENDPOINT: 'http://127.0.0.1:9000',
            S3_REGION: 'us-east-1',
            S3_FORCE_PATH_STYLE: true,
            S3_ACCESS_KEY_ID: 'isolated-test-key',
            S3_SECRET_ACCESS_KEY: 'isolated-test-secret'
          } as AppEnvironment,
          models,
          { error() {}, info() {}, warn() {} } as unknown as Logger,
          queue
        )
        await processor.recoverQueuedExports()
        await processor.recoverQueuedExports()

        expect(await queue.getWaitingCount()).toBe(1)
        expect(await (await queue.getJob(jobId))?.getState()).toBe('waiting')
        await expect(
          models.ReportExport.findById(exportId).lean()
        ).resolves.toMatchObject({ status: 'queued' })
      } finally {
        await worker?.close()
        if (queue) {
          await queue.obliterate({ force: true })
          await queue.close()
        }
        await Promise.all(
          redisConnections.map(async (redis) => {
            if (redis.status !== 'end') await redis.quit()
          })
        )
        await models.ReportExport.deleteMany({})
      }
    }, 60_000)

    it('continues past one failed recovery batch instead of starving later exports', async () => {
      const models = createModels(connection)
      const prefix = `internship-report-export-batch-test-${randomUUID()}`
      const queueName = `report-export-batch-${randomUUID()}`
      const redisConnections: Redis[] = []
      let queue: Queue<ReportExportJob> | undefined
      let restoreAddSpy: (() => void) | undefined
      let enqueueAttempts = 0

      const createRedisConnection = (): Redis => {
        const redis = new Redis(testRedisUrl!, { maxRetriesPerRequest: null })
        redisConnections.push(redis)
        return redis
      }

      try {
        const expiresAt = new Date(Date.now() + 60 * 60 * 1000)
        await models.ReportExport.create(
          Array.from({ length: 205 }, (_, index) => ({
            requestedBy: 'isolated-admin',
            requestHash: `isolated-export-request-${index}`,
            filters: {},
            fields: ['studentId'],
            format: 'csv' as const,
            status: 'queued' as const,
            rowCount: 1,
            snapshotAt: new Date(),
            expiresAt,
            resourceScopes: []
          }))
        )

        const activeQueue = new Queue<ReportExportJob>(queueName, {
          connection: createRedisConnection(),
          prefix
        })
        queue = activeQueue
        await activeQueue.waitUntilReady()
        const add = activeQueue.add.bind(activeQueue)
        const addSpy = vi
          .spyOn(activeQueue, 'add')
          .mockImplementation(async (...args) => {
            enqueueAttempts += 1
            if (enqueueAttempts <= 100) {
              throw new Error('simulated transient enqueue failure')
            }
            return add(...args)
          })
        restoreAddSpy = () => addSpy.mockRestore()

        const processor = new ReportExportProcessor(
          {
            S3_BUCKET: 'isolated-test-bucket',
            S3_ENDPOINT: 'http://127.0.0.1:9000',
            S3_REGION: 'us-east-1',
            S3_FORCE_PATH_STYLE: true,
            S3_ACCESS_KEY_ID: 'isolated-test-key',
            S3_SECRET_ACCESS_KEY: 'isolated-test-secret'
          } as AppEnvironment,
          models,
          { error() {}, info() {}, warn() {} } as unknown as Logger,
          activeQueue
        )
        await processor.recoverQueuedExports()

        expect(enqueueAttempts).toBe(205)
        expect(await activeQueue.getWaitingCount()).toBe(105)
      } finally {
        restoreAddSpy?.()
        if (queue) {
          await queue.obliterate({ force: true })
          await queue.close()
        }
        await Promise.all(
          redisConnections.map(async (redis) => {
            if (redis.status !== 'end') await redis.quit()
          })
        )
        await models.ReportExport.deleteMany({})
      }
    }, 60_000)
  }
)
