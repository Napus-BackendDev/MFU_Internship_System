import { randomUUID } from 'node:crypto'

import { MongoMemoryReplSet } from 'mongodb-memory-server-core'
import { Queue, Worker } from 'bullmq'
import { Redis } from 'ioredis'
import { createConnection, Types, type Connection } from 'mongoose'
import type { Logger } from 'pino'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import type { AppEnvironment } from '@internship/config'
import {
  EmailProcessor,
  type EmailJob
} from '../../worker/src/runtime/email.processor.js'
import { createModels } from '../../worker/src/runtime/models.js'

const testRedisUrl = process.env.TEST_REDIS_URL

if (process.env.CI === 'true' && !testRedisUrl) {
  throw new Error(
    'CI must configure TEST_REDIS_URL for Mongo and BullMQ integration tests.'
  )
}

describe.skipIf(!testRedisUrl)(
  'Worker delivery recovery with isolated MongoDB and Redis',
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

    it('reconciles persisted delivery state and stable queue jobs across restart', async () => {
      const now = new Date('2026-09-28T12:00:00.000Z')
      const campaignId = new Types.ObjectId()
      const queuedDeliveryId = new Types.ObjectId()
      const interruptedDeliveryId = new Types.ObjectId()
      const uncertainDeliveryId = new Types.ObjectId()
      const queuedAssignmentId = 'assignment-queued-integration'
      const interruptedAssignmentId = 'assignment-interrupted-integration'
      const uncertainAssignmentId = 'assignment-uncertain-integration'
      const models = createModels(connection)
      const prefix = `internship-mongo-redis-test-${randomUUID()}`
      const queueName = `worker-recovery-${randomUUID()}`
      const redisConnections: Redis[] = []
      let queue: Queue<EmailJob> | undefined
      let worker: Worker<EmailJob, void> | undefined
      const processedDeliveryIds = new Set<string>()

      const createRedisConnection = (): Redis => {
        const redis = new Redis(testRedisUrl!, { maxRetriesPerRequest: null })
        redisConnections.push(redis)
        return redis
      }

      const createQueue = (): Queue<EmailJob> =>
        new Queue<EmailJob>(queueName, {
          connection: createRedisConnection(),
          prefix
        })

      try {
        await models.Campaign.create({
          _id: campaignId,
          type: 'invitation',
          status: 'queued',
          invitationVersion: 1,
          total: 3
        })
        await models.Invitation.create([
          {
            assignmentId: queuedAssignmentId,
            evaluatorId: new Types.ObjectId().toString(),
            email: 'queued@example.test',
            expiresAt: new Date(now.getTime() + 60 * 60 * 1000),
            status: 'active'
          },
          {
            assignmentId: interruptedAssignmentId,
            evaluatorId: new Types.ObjectId().toString(),
            email: 'retry@example.test',
            expiresAt: new Date(now.getTime() + 60 * 60 * 1000),
            status: 'active'
          },
          {
            assignmentId: uncertainAssignmentId,
            evaluatorId: new Types.ObjectId().toString(),
            email: 'uncertain@example.test',
            expiresAt: new Date(now.getTime() + 60 * 60 * 1000),
            status: 'active'
          }
        ])
        await models.Delivery.create([
          {
            _id: queuedDeliveryId,
            campaignId: campaignId.toString(),
            assignmentId: queuedAssignmentId,
            recipientEmail: 'queued@example.test',
            templateVersionId: new Types.ObjectId().toString(),
            status: 'queued',
            attempts: 0
          },
          {
            _id: interruptedDeliveryId,
            campaignId: campaignId.toString(),
            assignmentId: interruptedAssignmentId,
            recipientEmail: 'retry@example.test',
            templateVersionId: new Types.ObjectId().toString(),
            status: 'sending',
            attempts: 1,
            processingStartedAt: new Date(now.getTime() - 130_000),
            processingLeaseUntil: new Date(now.getTime() - 1_000),
            processingToken: 'expired-pre-smtp-lease'
          },
          {
            _id: uncertainDeliveryId,
            campaignId: campaignId.toString(),
            assignmentId: uncertainAssignmentId,
            recipientEmail: 'uncertain@example.test',
            templateVersionId: new Types.ObjectId().toString(),
            status: 'sending',
            attempts: 1,
            processingStartedAt: new Date(now.getTime() - 130_000),
            processingLeaseUntil: new Date(now.getTime() - 1_000),
            processingToken: 'expired-after-smtp-started',
            providerAttemptStartedAt: new Date(now.getTime() - 30_000)
          }
        ])

        queue = createQueue()
        await queue.waitUntilReady()
        const processor = new EmailProcessor(
          {
            SMTP_HOST: 'localhost',
            AUTH_JWT_SECRET: 'isolated-mongo-redis-worker-test-secret'
          } as AppEnvironment,
          models,
          { error() {}, info() {}, warn() {} } as unknown as Logger,
          queue
        )

        await processor.recoverExpiredDeliveries(now)
        await processor.recoverExpiredDeliveries(now)

        const queuedJobId = `delivery-${queuedDeliveryId.toString()}`
        const retryJobId = `delivery-${interruptedDeliveryId.toString()}-retry-2`
        expect(await queue.getWaitingCount()).toBe(2)
        expect(await queue.getJob(queuedJobId)).toBeDefined()
        expect(await queue.getJob(retryJobId)).toBeDefined()
        await expect(
          models.Delivery.findById(interruptedDeliveryId).lean()
        ).resolves.toMatchObject({
          status: 'failed',
          lastErrorCode: 'WORKER_INTERRUPTED_BEFORE_SEND'
        })
        await expect(
          models.Delivery.findById(uncertainDeliveryId).lean()
        ).resolves.toMatchObject({
          status: 'uncertain',
          lastErrorCode: 'PROVIDER_STATE_UNCERTAIN'
        })
        expect(
          await queue.getJob(`delivery-${uncertainDeliveryId.toString()}`)
        ).toBeUndefined()

        await queue.close()
        queue = createQueue()
        await queue.waitUntilReady()
        expect(await queue.getWaitingCount()).toBe(2)
        expect(await (await queue.getJob(queuedJobId))?.getState()).toBe(
          'waiting'
        )
        expect(await (await queue.getJob(retryJobId))?.getState()).toBe(
          'waiting'
        )

        let resolveProcessed!: () => void
        let rejectProcessed!: (error: Error) => void
        const allProcessed = new Promise<void>((resolve, reject) => {
          resolveProcessed = resolve
          rejectProcessed = reject
        })
        let completedJobs = 0
        worker = new Worker<EmailJob, void>(
          queueName,
          async (job) => {
            if (!('deliveryId' in job.data)) {
              throw new Error('Unexpected SMTP test job in delivery queue')
            }
            const deliveryId = job.data.deliveryId
            if (processedDeliveryIds.has(deliveryId)) {
              throw new Error('Duplicate delivery job execution')
            }
            processedDeliveryIds.add(deliveryId)
            const result = await models.Delivery.updateOne(
              {
                _id: new Types.ObjectId(deliveryId),
                status: { $in: ['queued', 'failed'] }
              },
              { $set: { status: 'sent' } }
            )
            if (result.matchedCount !== 1) {
              throw new Error('Recovered delivery was not claimable')
            }
          },
          {
            connection: createRedisConnection(),
            concurrency: 1,
            prefix
          }
        )
        worker.on('completed', () => {
          completedJobs += 1
          if (completedJobs === 2) resolveProcessed()
        })
        worker.on('failed', (_job, error) => rejectProcessed(error))
        worker.on('error', rejectProcessed)
        await worker.waitUntilReady()
        await allProcessed

        expect([...processedDeliveryIds].sort()).toEqual(
          [queuedDeliveryId.toString(), interruptedDeliveryId.toString()].sort()
        )
        await processor.recoverExpiredDeliveries(now)
        expect(await queue.getWaitingCount()).toBe(0)
        expect(await queue.getCompletedCount()).toBe(2)
        await expect(
          models.Delivery.findById(queuedDeliveryId).lean()
        ).resolves.toMatchObject({ status: 'sent' })
        await expect(
          models.Delivery.findById(interruptedDeliveryId).lean()
        ).resolves.toMatchObject({ status: 'sent' })
        await expect(
          models.Delivery.findById(uncertainDeliveryId).lean()
        ).resolves.toMatchObject({ status: 'uncertain' })
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
        await models.Delivery.deleteMany({})
        await models.Invitation.deleteMany({})
        await models.Campaign.deleteMany({})
      }
    }, 60_000)
  }
)
