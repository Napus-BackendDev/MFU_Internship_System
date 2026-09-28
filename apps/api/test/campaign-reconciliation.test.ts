import { describe, expect, it, vi } from 'vitest'

import { CampaignService } from '../src/correspondence/campaign.service.js'

interface ReconciliationService {
  campaigns: {
    findOneAndUpdate: ReturnType<typeof vi.fn>
    updateOne: ReturnType<typeof vi.fn>
  }
  deliveries: { aggregate: ReturnType<typeof vi.fn> }
  reconcileCampaign: (
    campaignId: string,
    expectedTotal: number
  ) => Promise<void>
}

describe('campaign reconciliation concurrency', () => {
  it('retries stale delivery counts instead of overwriting a newer completed status', async () => {
    let revision = 0
    let status = 'queued'
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

    const service = Object.create(
      CampaignService.prototype
    ) as ReconciliationService
    service.campaigns = {
      findOneAndUpdate: vi.fn(() => {
        revision += 1
        const observedRevision = revision
        return {
          select: () => ({
            lean: () => Promise.resolve({ __v: observedRevision })
          })
        }
      }),
      updateOne: vi.fn(
        (
          filter: { __v: number },
          update: { $set: { status: string }; $inc: { __v: number } }
        ) => {
          if (filter.__v !== revision) return { matchedCount: 0 }
          status = update.$set.status
          revision += update.$inc.__v
          return { matchedCount: 1 }
        }
      )
    }
    service.deliveries = { aggregate }

    const staleReconciliation = service.reconcileCampaign('campaign-a', 1)
    await staleReadStarted
    await service.reconcileCampaign('campaign-a', 1)
    expect(status).toBe('completed')

    releaseStaleCounts([{ _id: 'sending', count: 1 }])
    await staleReconciliation

    expect(status).toBe('completed')
    expect(aggregate).toHaveBeenCalledTimes(3)
  })
})
