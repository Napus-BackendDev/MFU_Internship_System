import type { DeliveryRecord } from './correspondence.schema.js'

export type CampaignTargetIssue =
  | 'ASSIGNMENT_NOT_EDITABLE'
  | 'CYCLE_CLOSED'
  | 'ACTIVE_EVALUATOR_REQUIRED'
  | 'INVITATION_REISSUE_REQUIRED'
  | 'ACTIVE_INVITATION_REQUIRED'

export function campaignTargetIssue(input: {
  readonly type: 'invitation' | 'reminder'
  readonly assignmentStatus: string
  readonly assignmentDeadlineAt: Date
  readonly cycleStatus: string
  readonly cycleOpensAt: Date
  readonly cycleClosesAt: Date
  readonly evaluatorActive: boolean
  readonly assignmentEvaluatorId: string
  readonly now: Date
  readonly invitation?: {
    readonly status: string
    readonly evaluatorId: string
    readonly expiresAt: Date
  }
}): CampaignTargetIssue | undefined {
  const expectedStatus = input.type === 'reminder' ? 'inProgress' : 'pending'
  if (
    input.assignmentStatus !== expectedStatus ||
    input.assignmentDeadlineAt <= input.now
  ) {
    return 'ASSIGNMENT_NOT_EDITABLE'
  }
  if (
    input.cycleStatus !== 'active' ||
    input.cycleOpensAt > input.now ||
    input.cycleClosesAt <= input.now ||
    input.assignmentDeadlineAt > input.cycleClosesAt
  ) {
    return 'CYCLE_CLOSED'
  }
  if (!input.evaluatorActive) return 'ACTIVE_EVALUATOR_REQUIRED'
  if (input.type === 'invitation') {
    return input.invitation ? 'INVITATION_REISSUE_REQUIRED' : undefined
  }
  if (
    !input.invitation ||
    input.invitation.status !== 'active' ||
    input.invitation.expiresAt <= input.now ||
    input.invitation.evaluatorId !== input.assignmentEvaluatorId ||
    input.invitation.expiresAt > input.assignmentDeadlineAt
  ) {
    return 'ACTIVE_INVITATION_REQUIRED'
  }
  return undefined
}

/** SMTP-uncertain deliveries require operator reconciliation before resend. */
export function isDeliveryAutomaticallyRetryable(
  status: DeliveryRecord['status']
): boolean {
  return status === 'failed'
}
