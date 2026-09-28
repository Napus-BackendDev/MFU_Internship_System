import { describe, expect, it, vi } from 'vitest'

import { CorrespondenceController } from '../src/correspondence/correspondence.controller.js'
import type { CampaignService } from '../src/correspondence/campaign.service.js'
import type { AuthenticatedRequest } from '../src/common/http.js'

describe('CorrespondenceController retry contract', () => {
  it('requires a valid idempotency key and forwards the normalized key', async () => {
    const retry = vi.fn().mockResolvedValue({ status: 'queued' })
    const controller = new CorrespondenceController(
      undefined as never,
      undefined as never,
      { retry } as unknown as CampaignService,
      undefined as never
    )
    const request = {
      actor: { id: 'staff-1' }
    } as AuthenticatedRequest

    expect(() =>
      controller.retryDelivery(request, 'delivery-1', undefined)
    ).toThrow()
    expect(() =>
      controller.retryDelivery(request, 'delivery-1', 'short')
    ).toThrow()

    await expect(
      controller.retryDelivery(request, 'delivery-1', '  retry-key-123  ')
    ).resolves.toEqual({ status: 'queued' })
    expect(retry).toHaveBeenCalledWith(
      request.actor,
      'delivery-1',
      'retry-key-123',
      'unknown'
    )
  })
})
