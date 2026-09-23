import { describe, expect, it } from 'vitest'

import {
  campaignTargetIssue,
  isDeliveryAutomaticallyRetryable
} from '../src/correspondence/delivery-workflow.policy.js'

const now = new Date('2026-09-23T00:00:00Z')
const openWindow = {
  assignmentDeadlineAt: new Date('2026-10-01T00:00:00Z'),
  cycleStatus: 'active',
  cycleOpensAt: new Date('2026-09-01T00:00:00Z'),
  cycleClosesAt: new Date('2026-10-02T00:00:00Z'),
  evaluatorActive: true,
  assignmentEvaluatorId: 'evaluator-a',
  now
}

describe('delivery retry policy', () => {
  it('allows a retry only when the provider definitively rejected delivery', () => {
    expect(isDeliveryAutomaticallyRetryable('failed')).toBe(true)
    expect(isDeliveryAutomaticallyRetryable('uncertain')).toBe(false)
    expect(isDeliveryAutomaticallyRetryable('sent')).toBe(false)
    expect(isDeliveryAutomaticallyRetryable('sending')).toBe(false)
  })
})

describe('campaign target policy', () => {
  it('allows an initial invitation only for a pending open assignment', () => {
    expect(
      campaignTargetIssue({
        ...openWindow,
        type: 'invitation',
        assignmentStatus: 'pending'
      })
    ).toBeUndefined()
    expect(
      campaignTargetIssue({
        ...openWindow,
        type: 'invitation',
        assignmentStatus: 'submitted'
      })
    ).toBe('ASSIGNMENT_NOT_EDITABLE')
  })

  it('allows reminders only with the original active evaluator invitation', () => {
    expect(
      campaignTargetIssue({
        ...openWindow,
        type: 'reminder',
        assignmentStatus: 'inProgress',
        invitation: {
          status: 'active',
          evaluatorId: 'evaluator-a',
          expiresAt: new Date('2026-10-01T00:00:00Z')
        }
      })
    ).toBeUndefined()
    expect(
      campaignTargetIssue({
        ...openWindow,
        type: 'reminder',
        assignmentStatus: 'inProgress',
        invitation: {
          status: 'active',
          evaluatorId: 'evaluator-b',
          expiresAt: new Date('2026-10-01T00:00:00Z')
        }
      })
    ).toBe('ACTIVE_INVITATION_REQUIRED')
  })

  it('blocks deadlines beyond a closed cycle and implicit invitation reissue', () => {
    expect(
      campaignTargetIssue({
        ...openWindow,
        type: 'invitation',
        assignmentStatus: 'pending',
        cycleClosesAt: new Date('2026-09-30T00:00:00Z')
      })
    ).toBe('CYCLE_CLOSED')
    expect(
      campaignTargetIssue({
        ...openWindow,
        type: 'invitation',
        assignmentStatus: 'pending',
        invitation: {
          status: 'revoked',
          evaluatorId: 'evaluator-a',
          expiresAt: new Date('2026-10-01T00:00:00Z')
        }
      })
    ).toBe('INVITATION_REISSUE_REQUIRED')
  })
})
