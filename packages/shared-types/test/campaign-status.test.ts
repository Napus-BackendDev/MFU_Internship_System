import { describe, expect, it } from 'vitest'

import { campaignStatusFromDeliveryCounts } from '../src/index.js'

describe('campaign status projection', () => {
  it('completes only when every expected delivery was sent', () => {
    expect(campaignStatusFromDeliveryCounts(2, { sent: 2 })).toBe('completed')
  })

  it('keeps pending campaigns queued or processing', () => {
    expect(campaignStatusFromDeliveryCounts(2, { queued: 2 })).toBe('queued')
    expect(campaignStatusFromDeliveryCounts(2, { sent: 1, sending: 1 })).toBe(
      'processing'
    )
  })

  it('marks definitive and uncertain failures partial', () => {
    expect(campaignStatusFromDeliveryCounts(2, { sent: 1, failed: 1 })).toBe(
      'partial'
    )
    expect(campaignStatusFromDeliveryCounts(1, { uncertain: 1 })).toBe(
      'partial'
    )
  })

  it('does not report completion when expected delivery records are missing', () => {
    expect(campaignStatusFromDeliveryCounts(2, { sent: 1 })).toBe('partial')
    expect(campaignStatusFromDeliveryCounts(1, {})).toBe('partial')
  })

  it('fails closed for an empty campaign or an unknown delivery status', () => {
    expect(campaignStatusFromDeliveryCounts(0, {})).toBe('partial')
    expect(campaignStatusFromDeliveryCounts(1, { sending_unknown: 1 })).toBe(
      'partial'
    )
  })
})
