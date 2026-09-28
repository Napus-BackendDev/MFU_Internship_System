import type { AppEnvironment } from '@internship/config'
import type { Job } from 'bullmq'
import type { Logger } from 'pino'
import { describe, expect, it, vi } from 'vitest'

import {
  EmailProcessor,
  type EmailJob
} from '../src/runtime/email.processor.js'
import type { WorkerModels } from '../src/runtime/models.js'

describe('email worker campaign reconciliation', () => {
  it('reconciles campaign status when a duplicate job finds no claimable delivery', async () => {
    let campaignRevision = 0
    const campaignUpdate = vi.fn(
      (
        filter: { __v: number },
        update: { $set: { status: string }; $inc: { __v: number } }
      ) => {
        if (filter.__v !== campaignRevision) return { matchedCount: 0 }
        campaignRevision += update.$inc.__v
        return { matchedCount: 1 }
      }
    )
    const logger = { error: vi.fn(), info: vi.fn() } as unknown as Logger
    const models = {
      Delivery: {
        findOneAndUpdate: vi.fn().mockResolvedValue(null),
        findById: vi.fn(() => ({
          select: () => ({
            lean: () => Promise.resolve({ campaignId: 'campaign-a' })
          })
        })),
        aggregate: vi.fn().mockResolvedValue([{ _id: 'sent', count: 1 }])
      },
      Campaign: {
        findOneAndUpdate: vi.fn(() => {
          campaignRevision += 1
          const revision = campaignRevision
          return {
            select: () => ({
              lean: () => Promise.resolve({ total: 2, __v: revision })
            })
          }
        }),
        updateOne: campaignUpdate
      }
    } as unknown as WorkerModels
    const processor = new EmailProcessor(
      {
        SMTP_HOST: 'localhost',
        AUTH_JWT_SECRET: 'test-only-signing-secret'
      } as AppEnvironment,
      models,
      logger
    )

    await processor.process({
      name: 'send-delivery',
      data: { deliveryId: 'delivery-a', invitationId: 'invitation-a' }
    } as Job<EmailJob>)

    expect(campaignUpdate).toHaveBeenCalledWith(
      { _id: 'campaign-a', __v: 1 },
      { $set: { status: 'partial' }, $inc: { __v: 1 } }
    )
    expect(logger.error).toHaveBeenCalledWith(
      {
        campaignId: 'campaign-a',
        expectedDeliveries: 2,
        observedDeliveries: 1
      },
      'campaign delivery records do not match expected total'
    )
  })

  it('does not let stale reconciliation overwrite a newer completed status', async () => {
    let campaignStatus = 'queued'
    let campaignRevision = 0
    let releaseStaleCounts!: (
      counts: Array<{ _id: string; count: number }>
    ) => void
    let signalStaleRead!: () => void
    const staleReadStarted = new Promise<void>((resolve) => {
      signalStaleRead = resolve
    })
    const staleCounts = new Promise<Array<{ _id: string; count: number }>>(
      (resolve) => {
        releaseStaleCounts = resolve
      }
    )
    const aggregate = vi
      .fn()
      .mockImplementationOnce(() => {
        signalStaleRead()
        return staleCounts
      })
      .mockResolvedValueOnce([{ _id: 'sent', count: 1 }])
      .mockResolvedValueOnce([{ _id: 'sent', count: 1 }])
    const models = {
      Delivery: {
        findOneAndUpdate: vi.fn().mockResolvedValue(null),
        findById: vi.fn(() => ({
          select: () => ({
            lean: () => Promise.resolve({ campaignId: 'campaign-a' })
          })
        })),
        aggregate
      },
      Campaign: {
        findOneAndUpdate: vi.fn(() => {
          campaignRevision += 1
          const revision = campaignRevision
          return {
            select: () => ({
              lean: () => Promise.resolve({ total: 1, __v: revision })
            })
          }
        }),
        updateOne: vi.fn(
          (
            filter: { __v: number },
            update: {
              $set?: { status?: string }
              $inc: { __v: number }
            }
          ) => {
            if (filter.__v !== campaignRevision) return { matchedCount: 0 }
            if (update.$set?.status) campaignStatus = update.$set.status
            campaignRevision += update.$inc.__v
            return { matchedCount: 1 }
          }
        )
      }
    } as unknown as WorkerModels
    const processor = new EmailProcessor(
      {
        SMTP_HOST: 'localhost',
        AUTH_JWT_SECRET: 'test-only-signing-secret'
      } as AppEnvironment,
      models,
      { error: vi.fn(), info: vi.fn() } as unknown as Logger
    )
    const duplicateJob = {
      name: 'send-delivery',
      data: { deliveryId: 'delivery-a', invitationId: 'invitation-a' }
    } as Job<EmailJob>

    const staleReconciliation = processor.process(duplicateJob)
    await staleReadStarted
    await processor.process(duplicateJob)
    expect(campaignStatus).toBe('completed')

    releaseStaleCounts([{ _id: 'sending', count: 1 }])
    await staleReconciliation

    expect(campaignStatus).toBe('completed')
  })
})
