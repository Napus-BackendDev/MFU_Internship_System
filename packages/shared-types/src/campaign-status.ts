export type CampaignStatus = 'queued' | 'processing' | 'completed' | 'partial'

const DELIVERY_STATUSES = [
  'queued',
  'sending',
  'sent',
  'failed',
  'uncertain'
] as const

export function campaignStatusFromDeliveryCounts(
  expectedTotal: number,
  counts: Readonly<Record<string, number>>
): CampaignStatus {
  if (!Number.isSafeInteger(expectedTotal) || expectedTotal < 0) {
    return 'partial'
  }

  const entries = Object.entries(counts)
  if (entries.some(([, count]) => !Number.isSafeInteger(count) || count < 0)) {
    return 'partial'
  }

  const observedTotal = entries.reduce((total, [, count]) => total + count, 0)
  const targetTotal = expectedTotal === 0 ? observedTotal : expectedTotal
  if (targetTotal === 0 || observedTotal !== targetTotal) return 'partial'
  if (
    entries.some(
      ([status, count]) =>
        count > 0 &&
        !DELIVERY_STATUSES.includes(
          status as (typeof DELIVERY_STATUSES)[number]
        )
    )
  ) {
    return 'partial'
  }

  const queued = counts.queued ?? 0
  const sending = counts.sending ?? 0
  if (queued > 0 || sending > 0) {
    return sending > 0 ? 'processing' : 'queued'
  }
  if ((counts.failed ?? 0) > 0 || (counts.uncertain ?? 0) > 0) {
    return 'partial'
  }
  return (counts.sent ?? 0) === targetTotal ? 'completed' : 'partial'
}
