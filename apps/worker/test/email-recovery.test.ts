import type { AppEnvironment } from '@internship/config'
import type { Queue } from 'bullmq'
import type { Logger } from 'pino'
import { describe, expect, it, vi } from 'vitest'

import {
  EmailProcessor,
  type EmailJob
} from '../src/runtime/email.processor.js'
import type { WorkerModels } from '../src/runtime/models.js'

interface RecoveryRow {
  readonly _id: string
  readonly status: string
  readonly campaignId?: string
  readonly assignmentId?: string
  readonly attempts?: number
  readonly processingToken?: string
  readonly processingLeaseUntil?: Date
  readonly providerAttemptStartedAt?: Date
  readonly lastErrorCode?: string
}

interface RowsQuery<T> {
  select: (fields: string) => {
    sort: (sort: Record<string, number>) => {
      limit: (limit: number) => {
        lean: () => { exec: () => Promise<readonly T[]> }
      }
    }
    lean: () => Promise<readonly T[]>
  }
}

function findQuery<T>(rows: readonly T[]): RowsQuery<T> {
  return {
    select: () => ({
      sort: () => ({
        limit: (limit) => ({
          lean: () => ({ exec: () => Promise.resolve(rows.slice(0, limit)) })
        })
      }),
      lean: () => Promise.resolve(rows)
    })
  }
}

function createCampaignModels(rows: readonly RecoveryRow[]): {
  readonly models: WorkerModels
  readonly deliveryUpdate: ReturnType<typeof vi.fn>
} {
  const deliveryUpdate = vi.fn().mockResolvedValue({ matchedCount: 1 })
  const models = {
    Delivery: {
      find: vi.fn(
        (filter: {
          status?: string
          $or?: readonly unknown[]
          _id?: { $gt: unknown }
        }) =>
          findQuery(
            rows.filter((row) => {
              const matchesStatus = filter.status
                ? row.status === filter.status
                : row.status === 'queued' ||
                  (row.status === 'failed' &&
                    [
                      'WORKER_INTERRUPTED_BEFORE_SEND',
                      'QUEUE_ENQUEUE_FAILED'
                    ].includes(row.lastErrorCode ?? ''))
              return (
                matchesStatus &&
                (!filter._id || row._id > String(filter._id.$gt))
              )
            })
          )
      ),
      updateOne: deliveryUpdate,
      aggregate: vi.fn().mockResolvedValue([{ _id: 'uncertain', count: 1 }])
    },
    Campaign: {
      findById: vi.fn(() => ({
        select: () => ({ lean: () => Promise.resolve({ total: 1 }) })
      })),
      updateOne: vi.fn().mockResolvedValue({ matchedCount: 1 })
    },
    Invitation: {
      findOne: vi.fn(() => ({
        select: () => ({ lean: () => Promise.resolve({ _id: 'invitation-a' }) })
      }))
    }
  } as unknown as WorkerModels
  return { models, deliveryUpdate }
}

function createQueue(existingJob?: {
  getState: () => Promise<string>
  remove: () => Promise<void>
}): {
  readonly queue: Queue<EmailJob>
  readonly add: ReturnType<typeof vi.fn>
} {
  const add = vi.fn().mockResolvedValue(undefined)
  const getJob = vi.fn().mockResolvedValue(existingJob ?? null)
  return { queue: { add, getJob } as unknown as Queue<EmailJob>, add }
}

function createProcessor(
  models: WorkerModels,
  queue: Queue<EmailJob>
): EmailProcessor {
  return new EmailProcessor(
    {
      SMTP_HOST: 'localhost',
      AUTH_JWT_SECRET: 'test-only-signing-secret'
    } as AppEnvironment,
    models,
    { error: vi.fn(), info: vi.fn(), warn: vi.fn() } as unknown as Logger,
    queue
  )
}

describe('email delivery lease recovery', () => {
  it('requeues only an expired delivery known to have stopped before SMTP', async () => {
    const now = new Date('2026-09-23T00:10:00.000Z')
    const { models, deliveryUpdate } = createCampaignModels([
      {
        _id: 'delivery-a',
        status: 'sending',
        campaignId: 'campaign-a',
        assignmentId: 'assignment-a',
        attempts: 1,
        processingToken: 'worker-token-a',
        processingLeaseUntil: new Date(now.getTime() - 1_000)
      },
      {
        _id: 'delivery-a',
        status: 'failed',
        assignmentId: 'assignment-a',
        attempts: 1,
        lastErrorCode: 'WORKER_INTERRUPTED_BEFORE_SEND'
      }
    ])
    const { queue, add } = createQueue()

    await createProcessor(models, queue).recoverExpiredDeliveries(now)

    expect(deliveryUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        _id: 'delivery-a',
        status: 'sending',
        processingToken: 'worker-token-a',
        providerAttemptStartedAt: { $exists: false }
      }),
      expect.objectContaining({
        $set: {
          status: 'failed',
          lastErrorCode: 'WORKER_INTERRUPTED_BEFORE_SEND'
        }
      })
    )
    expect(add).toHaveBeenCalledWith(
      'send-delivery',
      { deliveryId: 'delivery-a', invitationId: 'invitation-a' },
      expect.objectContaining({ jobId: 'delivery-delivery-a-retry-2' })
    )
  })

  it('recovers queued delivery intent if API stopped before queue insertion', async () => {
    const { models } = createCampaignModels([
      {
        _id: 'delivery-queued',
        status: 'queued',
        assignmentId: 'assignment-queued',
        attempts: 0
      },
      {
        _id: 'delivery-api-queue-failed',
        status: 'failed',
        assignmentId: 'assignment-queue-failed',
        attempts: 0,
        lastErrorCode: 'QUEUE_ENQUEUE_FAILED'
      }
    ])
    const { queue, add } = createQueue()

    await createProcessor(models, queue).recoverExpiredDeliveries()

    expect(add).toHaveBeenCalledWith(
      'send-delivery',
      { deliveryId: 'delivery-queued', invitationId: 'invitation-a' },
      expect.objectContaining({ jobId: 'delivery-delivery-queued' })
    )
    expect(add).toHaveBeenCalledWith(
      'send-delivery',
      {
        deliveryId: 'delivery-api-queue-failed',
        invitationId: 'invitation-a'
      },
      expect.objectContaining({
        jobId: 'delivery-delivery-api-queue-failed'
      })
    )
  })

  it('drains pending delivery intent beyond one recovery batch', async () => {
    const rows = Array.from({ length: 101 }, (_, index) => ({
      _id: `delivery-${String(index).padStart(3, '0')}`,
      status: 'queued',
      assignmentId: `assignment-${index}`,
      attempts: 0
    }))
    const { models } = createCampaignModels(rows)
    const { queue, add } = createQueue()

    await createProcessor(models, queue).recoverExpiredDeliveries()

    expect(add).toHaveBeenCalledTimes(101)
  })

  it('does not duplicate a queued BullMQ job during reconciliation', async () => {
    const { models } = createCampaignModels([
      {
        _id: 'delivery-waiting',
        status: 'queued',
        assignmentId: 'assignment-waiting',
        attempts: 0
      }
    ])
    const existingJob = {
      getState: vi.fn().mockResolvedValue('waiting'),
      remove: vi.fn()
    }
    const { queue, add } = createQueue(existingJob)

    await createProcessor(models, queue).recoverExpiredDeliveries()

    expect(add).not.toHaveBeenCalled()
    expect(existingJob.remove).not.toHaveBeenCalled()
  })

  it('marks an expired SMTP attempt uncertain and never re-enqueues it', async () => {
    const now = new Date('2026-09-23T00:10:00.000Z')
    const { models, deliveryUpdate } = createCampaignModels([
      {
        _id: 'delivery-b',
        status: 'sending',
        campaignId: 'campaign-b',
        assignmentId: 'assignment-b',
        attempts: 1,
        processingToken: 'worker-token-b',
        processingLeaseUntil: new Date(now.getTime() - 1_000),
        providerAttemptStartedAt: new Date(now.getTime() - 30_000)
      }
    ])
    const { queue, add } = createQueue()

    await createProcessor(models, queue).recoverExpiredDeliveries(now)

    expect(deliveryUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ processingToken: 'worker-token-b' }),
      expect.objectContaining({
        $set: {
          status: 'uncertain',
          lastErrorCode: 'PROVIDER_STATE_UNCERTAIN'
        }
      })
    )
    expect(add).not.toHaveBeenCalled()
  })

  it('fails closed for pre-lease legacy sending rows', async () => {
    const now = new Date('2026-09-23T00:10:00.000Z')
    const { models, deliveryUpdate } = createCampaignModels([
      {
        _id: 'delivery-legacy',
        status: 'sending',
        campaignId: 'campaign-legacy',
        assignmentId: 'assignment-legacy',
        attempts: 1
      }
    ])
    const { queue, add } = createQueue()

    await createProcessor(models, queue).recoverExpiredDeliveries(now)

    expect(deliveryUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        processingLeaseUntil: { $exists: false },
        processingStartedAt: { $lte: new Date(now.getTime() - 120_000) }
      }),
      expect.objectContaining({
        $set: {
          status: 'uncertain',
          lastErrorCode: 'PROVIDER_STATE_UNCERTAIN'
        }
      })
    )
    expect(add).not.toHaveBeenCalled()
  })
})
