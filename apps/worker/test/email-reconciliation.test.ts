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
    const campaignUpdate = vi.fn().mockResolvedValue({ matchedCount: 1 })
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
        findById: vi.fn(() => ({
          select: () => ({ lean: () => Promise.resolve({ total: 2 }) })
        })),
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
      { _id: 'campaign-a' },
      { $set: { status: 'partial' } }
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
})
