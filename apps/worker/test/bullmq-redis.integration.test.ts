import { randomUUID } from 'node:crypto'

import type { AppEnvironment } from '@internship/config'
import { Queue, Worker, type Job } from 'bullmq'
import { Redis } from 'ioredis'
import { Types } from 'mongoose'
import type { Logger } from 'pino'
import { describe, expect, it, vi } from 'vitest'

import {
  EmailProcessor,
  type EmailJob
} from '../src/runtime/email.processor.js'
import type { WorkerModels } from '../src/runtime/models.js'

const testRedisUrl = process.env.TEST_REDIS_URL

if (process.env.CI === 'true' && !testRedisUrl) {
  throw new Error(
    'CI must configure TEST_REDIS_URL for BullMQ integration tests.'
  )
}

interface RowsQuery<T> {
  select(fields: string): RowsQuery<T>
  sort(order: Record<string, number>): RowsQuery<T>
  limit(limit: number): RowsQuery<T>
  lean(): { exec(): Promise<readonly T[]> }
}

function rowsQuery<T>(rows: readonly T[]): RowsQuery<T> {
  const query: RowsQuery<T> = {
    select: () => query,
    sort: () => query,
    limit: () => query,
    lean: () => ({ exec: () => Promise.resolve(rows) })
  }
  return query
}

describe.skipIf(!testRedisUrl)('BullMQ recovery against isolated Redis', () => {
  it('persists recovered delivery across queue restart and processes one stable job', async () => {
    const redisUrl = testRedisUrl!
    const prefix = `internship-test-${randomUUID()}`
    const queueName = `worker-recovery-${randomUUID()}`
    const deliveryId = new Types.ObjectId()
    const invitationId = new Types.ObjectId()
    const deliveryRow = {
      _id: deliveryId,
      assignmentId: 'assignment-redis-integration',
      attempts: 0,
      status: 'queued' as const
    }
    let deliveryStatus = 'queued'
    const deliveryFind = vi.fn((filter: Record<string, unknown>) => {
      if (filter.status === 'sending') return rowsQuery([])
      return rowsQuery(
        deliveryStatus === 'queued' && !filter._id ? [deliveryRow] : []
      )
    })
    const invitationFindOne = vi.fn(() => ({
      select: () => ({ lean: () => Promise.resolve({ _id: invitationId }) })
    }))
    const deliveryUpdate = vi.fn(() => {
      deliveryStatus = 'sent'
      return Promise.resolve({ matchedCount: 1 })
    })
    const models = {
      Delivery: {
        find: deliveryFind,
        updateOne: deliveryUpdate
      },
      Invitation: { findOne: invitationFindOne }
    } as unknown as WorkerModels
    const logger = {
      error: vi.fn(),
      info: vi.fn(),
      warn: vi.fn()
    } as unknown as Logger
    const redisConnections: Redis[] = []
    let recoveryQueue: Queue<EmailJob> | undefined
    let restartedQueue: Queue<EmailJob> | undefined
    let worker: Worker<EmailJob, void> | undefined
    let processedCount = 0

    const createRedisConnection = (): Redis => {
      const connection = new Redis(redisUrl, { maxRetriesPerRequest: null })
      redisConnections.push(connection)
      return connection
    }

    try {
      recoveryQueue = new Queue<EmailJob>(queueName, {
        connection: createRedisConnection(),
        prefix
      })
      await recoveryQueue.waitUntilReady()
      const recoveryProcessor = new EmailProcessor(
        {
          SMTP_HOST: 'localhost',
          AUTH_JWT_SECRET: 'redis-integration-test-secret'
        } as AppEnvironment,
        models,
        logger,
        recoveryQueue
      )

      await recoveryProcessor.recoverExpiredDeliveries()
      await recoveryProcessor.recoverExpiredDeliveries()

      const jobId = `delivery-${deliveryId.toString()}`
      const recoveredJob = await recoveryQueue.getJob(jobId)
      expect(recoveredJob).toBeDefined()
      expect(recoveredJob?.data).toEqual({
        deliveryId: deliveryId.toString(),
        invitationId: invitationId.toString()
      })
      expect(await recoveryQueue.getWaitingCount()).toBe(1)
      await recoveryQueue.close()
      recoveryQueue = undefined

      const activeQueue = new Queue<EmailJob>(queueName, {
        connection: createRedisConnection(),
        prefix
      })
      restartedQueue = activeQueue
      await activeQueue.waitUntilReady()
      const persistedJob = await activeQueue.getJob(jobId)
      expect(persistedJob).toBeDefined()
      expect(await persistedJob?.getState()).toBe('waiting')

      let resolveCompleted!: (job: Job<EmailJob>) => void
      let rejectCompleted!: (error: Error) => void
      const completed = new Promise<Job<EmailJob>>((resolve, reject) => {
        resolveCompleted = resolve
        rejectCompleted = reject
      })
      const activeWorker = new Worker<EmailJob, void>(
        queueName,
        async (job) => {
          if (!('deliveryId' in job.data)) {
            throw new Error('Unexpected SMTP test job in delivery queue')
          }
          expect(job.data.deliveryId).toBe(deliveryId.toString())
          processedCount += 1
          await models.Delivery.updateOne(
            { _id: job.data.deliveryId },
            { $set: { status: 'sent' } }
          )
        },
        {
          connection: createRedisConnection(),
          concurrency: 1,
          prefix
        }
      )
      worker = activeWorker
      activeWorker.on('completed', (job) => resolveCompleted(job))
      activeWorker.on('failed', (_job, error) => rejectCompleted(error))

      await activeWorker.waitUntilReady()
      const processedJob = await completed
      expect(processedJob.id).toBe(jobId)
      if (!('deliveryId' in processedJob.data)) {
        throw new Error('Unexpected SMTP test job completed')
      }
      expect(processedJob.data.deliveryId).toBe(deliveryId.toString())
      expect(processedCount).toBe(1)

      await recoveryProcessor.recoverExpiredDeliveries()
      expect(await activeQueue.getCompletedCount()).toBe(1)
      expect(deliveryFind).toHaveBeenCalled()
      expect(deliveryUpdate).toHaveBeenCalledTimes(1)
    } finally {
      await worker?.close()
      await (restartedQueue ?? recoveryQueue)?.obliterate({ force: true })
      await restartedQueue?.close()
      await recoveryQueue?.close()
      await Promise.all(
        redisConnections.map(async (connection) => {
          if (connection.status !== 'end') await connection.quit()
        })
      )
    }
  }, 30_000)
})
