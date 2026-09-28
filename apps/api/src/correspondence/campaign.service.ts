import type { AppEnvironment } from '@internship/config'
import {
  campaignStatusFromDeliveryCounts,
  type AuthenticatedActor
} from '@internship/shared-types'
import { InjectQueue } from '@nestjs/bullmq'
import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
  UnprocessableEntityException
} from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { InjectConnection, InjectModel } from '@nestjs/mongoose'
import type { Queue } from 'bullmq'
import { SignJWT } from 'jose'
import {
  Types,
  type Connection,
  type ClientSession,
  type HydratedDocument,
  type Model
} from 'mongoose'

import { AuditService } from '../audit/audit.service.js'
import { SessionRecord } from '../auth/user.schema.js'
import { paginate, type PaginationInput } from '../common/pagination.js'
import { idempotencyScopeKey, requestHash } from '../common/idempotency.js'
import { scopeFilter } from '../common/scope.js'
import {
  CompetencySetRecord,
  CompetencyVersionRecord,
  EvaluationAssignmentRecord,
  EvaluationCycleRecord
} from '../evaluations/evaluation.schema.js'
import {
  EvaluatorRecord,
  PlacementRecord,
  StudentRecord
} from '../members/members.schema.js'
import { studentReferenceFilter } from '../members/student-reference.js'
import {
  CampaignRecord,
  DeliveryRecord,
  DeliveryRetryRequestRecord,
  EmailTemplateVersionRecord,
  InvitationRecord
} from './correspondence.schema.js'
import {
  campaignTargetIssue,
  isDeliveryAutomaticallyRetryable
} from './delivery-workflow.policy.js'
import { invitationVersionFilter } from './invitation-version.policy.js'

import { TemplateService } from './template.service.js'

function isDuplicateKeyError(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    error.code === 11000
  )
}

function maskRecipientEmail(email: string): string {
  const separator = email.lastIndexOf('@')
  if (separator <= 0 || separator === email.length - 1) return '***'
  return `${email.slice(0, 1)}***@${email.slice(separator + 1)}`
}

function deliveryIdentifier(value: unknown): string {
  if (typeof value === 'string') return value
  if (value instanceof Types.ObjectId) return value.toString()
  return ''
}

function deliveryResponse(
  delivery: Readonly<Record<string, unknown>>
): Readonly<Record<string, unknown>> {
  const recipientEmail = delivery.recipientEmail
  return {
    id: deliveryIdentifier(delivery.id),
    campaignId: deliveryIdentifier(delivery.campaignId),
    assignmentId: deliveryIdentifier(delivery.assignmentId),
    recipientMasked: maskRecipientEmail(
      typeof recipientEmail === 'string' ? recipientEmail : ''
    ),
    status: delivery.status,
    attempts: delivery.attempts,
    lastErrorCode: delivery.lastErrorCode ?? null,
    createdAt: delivery.createdAt,
    updatedAt: delivery.updatedAt
  }
}

function campaignResponse(
  campaign: Pick<
    HydratedDocument<CampaignRecord>,
    'id' | 'type' | 'status' | 'total'
  >
): {
  id: string
  type: CampaignRecord['type']
  status: CampaignRecord['status']
  total: number
} {
  return {
    id: campaign.id,
    type: campaign.type,
    status: campaign.status,
    total: campaign.total
  }
}

export interface CampaignInput {
  readonly type: CampaignRecord['type']
  readonly templateVersionId: string
  readonly assignmentIds: readonly string[]
}

export interface DirectStudentInvitationInput {
  readonly studentId: string
  readonly competencySetId: string
  readonly recipientEmail: string
  readonly evaluatorName?: string
  readonly deadlineDays?: number
  readonly subject?: string
  readonly notes?: string
}

export interface TargetedEmailInput {
  readonly assignmentId: string
  readonly studentId: string
  readonly templateCode: 'evaluation_request' | 'evaluation_reminder'
  readonly recipientEmail?: string
  readonly evaluatorName?: string
}

export interface InvitationReissueInput {
  readonly reason: string
}

export interface InvitationReissueResult {
  readonly success: true
  readonly status: CampaignRecord['status']
  readonly assignmentId: string
  readonly invitationId: string
  readonly campaignId: string
  readonly deliveryId: string
  readonly invitationVersion: number
  readonly recipientEmail: string
  readonly deadlineAt: string
}

@Injectable()
export class CampaignService {
  public constructor(
    @InjectConnection() private readonly connection: Connection,
    private readonly config: ConfigService<AppEnvironment, true>,
    private readonly templatesService: TemplateService,
    @InjectQueue('email') private readonly emailQueue: Queue,
    @InjectModel(CampaignRecord.name)
    private readonly campaigns: Model<CampaignRecord>,
    @InjectModel(DeliveryRecord.name)
    private readonly deliveries: Model<DeliveryRecord>,
    @InjectModel(DeliveryRetryRequestRecord.name)
    private readonly deliveryRetryRequests: Model<DeliveryRetryRequestRecord>,
    @InjectModel(InvitationRecord.name)
    private readonly invitations: Model<InvitationRecord>,
    @InjectModel(EmailTemplateVersionRecord.name)
    private readonly templateVersions: Model<EmailTemplateVersionRecord>,
    @InjectModel(EvaluationAssignmentRecord.name)
    private readonly assignments: Model<EvaluationAssignmentRecord>,
    @InjectModel(EvaluatorRecord.name)
    private readonly evaluators: Model<EvaluatorRecord>,
    @InjectModel(StudentRecord.name)
    private readonly students: Model<StudentRecord>,
    @InjectModel(PlacementRecord.name)
    private readonly placements: Model<PlacementRecord>,
    @InjectModel(CompetencySetRecord.name)
    private readonly competencySets: Model<CompetencySetRecord>,
    @InjectModel(CompetencyVersionRecord.name)
    private readonly competencyVersions: Model<CompetencyVersionRecord>,
    @InjectModel(EvaluationCycleRecord.name)
    private readonly cycles: Model<EvaluationCycleRecord>,
    @InjectModel(SessionRecord.name)
    private readonly sessions: Model<SessionRecord>,
    private readonly auditService: AuditService
  ) {}

  public async preview(
    actor: AuthenticatedActor,
    input: CampaignInput
  ): Promise<unknown> {
    await this.requirePublishedTemplate(input.templateVersionId)
    const assignments = await this.assignments
      .find({
        $and: [
          { _id: { $in: input.assignmentIds } },
          scopeFilter<EvaluationAssignmentRecord>(actor, ['internshipStaff'])
        ]
      })
      .exec()
    const found = new Set(assignments.map((assignment) => assignment.id))
    return {
      valid: assignments.length === input.assignmentIds.length,
      intended: input.assignmentIds.length,
      eligible: assignments.length,
      issues: input.assignmentIds
        .filter((id) => !found.has(id))
        .map((assignmentId) => ({
          code: 'ASSIGNMENT_NOT_FOUND',
          assignmentId
        }))
    }
  }

  public async create(
    actor: AuthenticatedActor,
    input: CampaignInput,
    idempotencyKey: string
  ): Promise<unknown> {
    const scopedKey = idempotencyScopeKey(actor.id, 'campaign', idempotencyKey)
    const payloadHash = requestHash(input)
    const replayExisting = async (): Promise<
      { response: unknown } | undefined
    > => {
      const campaign = await this.campaigns
        .findOne({ idempotencyScopeKey: scopedKey })
        .exec()
      if (!campaign) return undefined
      await this.assertAssignmentsInScope(actor, campaign.assignmentIds, [
        'internshipStaff'
      ])
      if (campaign.requestHash !== payloadHash) {
        throw new ConflictException({ code: 'IDEMPOTENCY_KEY_REUSED' })
      }
      return { response: campaignResponse(campaign) }
    }
    const replayOrThrow = async (error: unknown): Promise<unknown> => {
      const replay = await replayExisting()
      if (replay) return replay.response
      throw error
    }

    const existing = await replayExisting()
    if (existing) return existing.response

    const preview = (await this.preview(actor, input)) as { valid: boolean }
    if (!preview.valid) {
      return replayOrThrow(
        new UnprocessableEntityException({ code: 'CAMPAIGN_PREVIEW_INVALID' })
      )
    }

    const now = new Date()
    const assignments = await this.assignments
      .find({
        $and: [
          { _id: { $in: input.assignmentIds } },
          scopeFilter<EvaluationAssignmentRecord>(actor, ['internshipStaff'])
        ]
      })
      .exec()
    const targets: Array<{
      assignment: HydratedDocument<EvaluationAssignmentRecord>
      evaluator: HydratedDocument<EvaluatorRecord>
      invitation?: HydratedDocument<InvitationRecord>
    }> = []
    for (const assignment of assignments) {
      const cycle = await this.cycles
        .findOne({
          _id: assignment.cycleId,
          status: 'active',
          opensAt: { $lte: now },
          closesAt: { $gt: now }
        })
        .exec()
      const evaluator = await this.evaluators
        .findOne({ _id: assignment.evaluatorId, status: 'active' })
        .exec()
      const existingInvitation = await this.invitations
        .findOne({ assignmentId: assignment.id })
        .exec()
      const issue = campaignTargetIssue({
        type: input.type,
        assignmentStatus: assignment.status,
        assignmentDeadlineAt: assignment.deadlineAt,
        cycleStatus: cycle?.status ?? 'missing',
        cycleOpensAt: cycle?.opensAt ?? new Date(0),
        cycleClosesAt: cycle?.closesAt ?? new Date(0),
        evaluatorActive: Boolean(evaluator),
        assignmentEvaluatorId: assignment.evaluatorId,
        now,
        ...(existingInvitation
          ? {
              invitation: {
                status: existingInvitation.status,
                evaluatorId: existingInvitation.evaluatorId,
                expiresAt: existingInvitation.expiresAt
              }
            }
          : {})
      })
      if (issue === 'ACTIVE_EVALUATOR_REQUIRED') {
        return replayOrThrow(new UnprocessableEntityException({ code: issue }))
      }
      if (issue) return replayOrThrow(new ConflictException({ code: issue }))
      if (!evaluator) {
        return replayOrThrow(
          new UnprocessableEntityException({
            code: 'ACTIVE_EVALUATOR_REQUIRED'
          })
        )
      }
      if (input.type === 'invitation') {
        targets.push({ assignment, evaluator })
      } else {
        if (!existingInvitation) {
          return replayOrThrow(
            new ConflictException({ code: 'ACTIVE_INVITATION_REQUIRED' })
          )
        }
        targets.push({ assignment, evaluator, invitation: existingInvitation })
      }
    }
    if (targets.length !== input.assignmentIds.length) {
      return replayOrThrow(
        new UnprocessableEntityException({ code: 'CAMPAIGN_PREVIEW_INVALID' })
      )
    }

    let outbox
    try {
      outbox = await this.connection.transaction(async (session) => {
        const inTransactionReplay = await this.campaigns
          .findOne({ idempotencyScopeKey: scopedKey })
          .session(session)
          .exec()
        if (inTransactionReplay) {
          if (inTransactionReplay.requestHash !== payloadHash) {
            throw new ConflictException({ code: 'IDEMPOTENCY_KEY_REUSED' })
          }
          return { replay: inTransactionReplay }
        }

        const lockedCycles = new Map<
          string,
          HydratedDocument<EvaluationCycleRecord>
        >()
        const currentTargets: typeof targets = []
        for (const target of targets) {
          let cycle = lockedCycles.get(target.assignment.cycleId)
          if (!cycle) {
            cycle = await this.lockOpenCycle(
              target.assignment.cycleId,
              now,
              session
            )
            lockedCycles.set(target.assignment.cycleId, cycle)
          }

          const assignment = await this.assignments
            .findOne({
              _id: target.assignment.id,
              cycleId: target.assignment.cycleId,
              status: { $in: ['pending', 'inProgress'] },
              deadlineAt: { $gt: now }
            })
            .session(session)
            .exec()
          if (!assignment) {
            throw new ConflictException({ code: 'ASSIGNMENT_NOT_EDITABLE' })
          }
          const evaluator = await this.evaluators
            .findOne({ _id: assignment.evaluatorId, status: 'active' })
            .session(session)
            .exec()
          if (!evaluator) {
            throw new UnprocessableEntityException({
              code: 'ACTIVE_EVALUATOR_REQUIRED'
            })
          }
          const invitation = await this.invitations
            .findOne({ assignmentId: assignment.id })
            .session(session)
            .exec()
          const issue = campaignTargetIssue({
            type: input.type,
            assignmentStatus: assignment.status,
            assignmentDeadlineAt: assignment.deadlineAt,
            cycleStatus: cycle.status,
            cycleOpensAt: cycle.opensAt,
            cycleClosesAt: cycle.closesAt,
            evaluatorActive: true,
            assignmentEvaluatorId: assignment.evaluatorId,
            now,
            ...(invitation
              ? {
                  invitation: {
                    status: invitation.status,
                    evaluatorId: invitation.evaluatorId,
                    expiresAt: invitation.expiresAt
                  }
                }
              : {})
          })
          if (issue) throw new ConflictException({ code: issue })
          currentTargets.push({
            assignment,
            evaluator,
            ...(invitation ? { invitation } : {})
          })
        }

        const campaign = await new this.campaigns({
          ...input,
          assignmentIds: [...input.assignmentIds],
          ...(input.type === 'invitation' ? { invitationVersion: 1 } : {}),
          idempotencyKey: scopedKey,
          idempotencyScopeKey: scopedKey,
          requestHash: payloadHash,
          createdBy: actor.id,
          status: 'queued',
          total: input.assignmentIds.length
        }).save({ session })
        const deliveries: Array<{
          deliveryId: string
          invitationId: string
        }> = []

        for (const target of currentTargets) {
          const invitation =
            target.invitation ??
            (await new this.invitations({
              assignmentId: target.assignment.id,
              evaluatorId: target.evaluator.id,
              email: target.evaluator.email,
              expiresAt: target.assignment.deadlineAt,
              status: 'active'
            }).save({ session }))
          const delivery = await new this.deliveries({
            campaignId: campaign.id,
            assignmentId: target.assignment.id,
            recipientEmail: invitation.email,
            templateVersionId: input.templateVersionId,
            status: 'queued',
            attempts: 0
          }).save({ session })
          deliveries.push({
            deliveryId: delivery.id,
            invitationId: invitation.id
          })
        }

        return { campaign, deliveries }
      })
    } catch (error) {
      if (!isDuplicateKeyError(error)) throw error
      const concurrentCampaign = await this.campaigns
        .findOne({ idempotencyScopeKey: scopedKey })
        .exec()
      if (!concurrentCampaign) {
        throw new ConflictException({ code: 'CAMPAIGN_TARGET_CONFLICT' })
      }
      await this.assertAssignmentsInScope(
        actor,
        concurrentCampaign.assignmentIds,
        ['internshipStaff']
      )
      if (concurrentCampaign.requestHash !== payloadHash) {
        throw new ConflictException({ code: 'IDEMPOTENCY_KEY_REUSED' })
      }
      return concurrentCampaign.toJSON()
    }

    if ('replay' in outbox && outbox.replay) {
      await this.assertAssignmentsInScope(actor, outbox.replay.assignmentIds, [
        'internshipStaff'
      ])
      return outbox.replay.toJSON()
    }

    // Delivery rows are the durable outbox. Queue insertion is best-effort;
    // the Worker reconciles persisted queued rows after startup and periodically.
    await Promise.all(
      outbox.deliveries.map(({ deliveryId, invitationId }) =>
        this.enqueueDelivery(deliveryId, invitationId).catch(() => undefined)
      )
    )
    await this.reconcileCampaign(outbox.campaign.id, outbox.campaign.total)
    return campaignResponse(
      (await this.campaigns.findById(outbox.campaign.id).exec())!
    )
  }

  public async get(actor: AuthenticatedActor, id: string): Promise<unknown> {
    const campaign = await this.campaigns.findById(id).exec()
    if (!campaign) throw new NotFoundException({ code: 'RESOURCE_NOT_FOUND' })
    await this.assertAssignmentsInScope(actor, campaign.assignmentIds)
    const summary = await this.deliveries.aggregate<{
      _id: string
      count: number
    }>([
      { $match: { campaignId: id } },
      { $group: { _id: '$status', count: { $sum: 1 } } },
      { $sort: { _id: 1 } }
    ])
    return {
      ...campaignResponse(campaign),
      deliverySummary: summary.map(({ _id, count }) => ({
        status: _id,
        count
      }))
    }
  }

  public listDeliveries(
    actor: AuthenticatedActor,
    input: PaginationInput & {
      campaignId?: string
      status?: DeliveryRecord['status']
    }
  ): Promise<unknown> {
    return this.listScopedDeliveries(actor, input)
  }

  private async listScopedDeliveries(
    actor: AuthenticatedActor,
    input: PaginationInput & {
      campaignId?: string
      status?: DeliveryRecord['status']
    }
  ): Promise<unknown> {
    if (
      !actor.roles.some((role) =>
        ['systemAdmin', 'internshipStaff', 'auditor'].includes(role)
      )
    ) {
      throw new ForbiddenException({ code: 'PERMISSION_DENIED' })
    }

    const assignments = await this.assignments
      .find(
        scopeFilter<EvaluationAssignmentRecord>(actor, [
          'internshipStaff',
          'auditor'
        ])
      )
      .select('_id')
      .lean()
      .exec()
    const page = await paginate(
      this.deliveries,
      {
        assignmentId: { $in: assignments.map((item) => item._id.toString()) },
        ...(input.campaignId ? { campaignId: input.campaignId } : {}),
        ...(input.status ? { status: input.status } : {})
      },
      input
    )
    return { ...page, items: page.items.map(deliveryResponse) }
  }

  public async retry(
    actor: AuthenticatedActor,
    deliveryId: string,
    idempotencyKey: string,
    requestId = 'unknown'
  ): Promise<unknown> {
    const requestedDelivery = await this.deliveries.findById(deliveryId).exec()
    if (!requestedDelivery) {
      throw new NotFoundException({ code: 'RESOURCE_NOT_FOUND' })
    }
    await this.assertAssignmentsInScope(
      actor,
      [requestedDelivery.assignmentId],
      ['internshipStaff']
    )
    const scopedKey = idempotencyScopeKey(
      actor.id,
      'delivery-retry',
      idempotencyKey
    )
    const retryRequestId = new Types.ObjectId(scopedKey.slice(0, 24))
    const payloadHash = requestHash({ deliveryId })
    let delivery: HydratedDocument<DeliveryRecord> | undefined
    let invitationId: string | undefined
    let jobId: string | undefined
    let shouldEnqueue = false

    try {
      await this.connection.transaction(async (session) => {
        const existingRequest = await this.deliveryRetryRequests
          .findById(retryRequestId)
          .session(session)
          .exec()

        if (existingRequest) {
          if (existingRequest.requestHash !== payloadHash) {
            throw new ConflictException({ code: 'IDEMPOTENCY_KEY_REUSED' })
          }
          const existingDelivery = await this.deliveries
            .findById(existingRequest.deliveryId)
            .session(session)
            .exec()
          if (!existingDelivery) {
            throw new NotFoundException({ code: 'RESOURCE_NOT_FOUND' })
          }
          const existingAssignment = await this.assignments
            .findOne({
              $and: [
                { _id: existingDelivery.assignmentId },
                scopeFilter<EvaluationAssignmentRecord>(actor, [
                  'internshipStaff'
                ])
              ]
            })
            .session(session)
            .exec()
          if (!existingAssignment) {
            throw new NotFoundException({ code: 'RESOURCE_NOT_FOUND' })
          }
          delivery = existingDelivery
          invitationId = existingRequest.invitationId
          jobId = existingRequest.jobId
          shouldEnqueue = existingDelivery.status === 'queued'
          return
        }

        const currentDelivery = await this.deliveries
          .findById(deliveryId)
          .session(session)
          .exec()
        if (!currentDelivery) {
          throw new NotFoundException({ code: 'RESOURCE_NOT_FOUND' })
        }
        const assignment = await this.assignments
          .findOne({
            $and: [
              { _id: currentDelivery.assignmentId },
              scopeFilter<EvaluationAssignmentRecord>(actor, [
                'internshipStaff'
              ])
            ]
          })
          .session(session)
          .exec()
        if (!assignment) {
          throw new NotFoundException({ code: 'RESOURCE_NOT_FOUND' })
        }
        if (
          !['pending', 'inProgress'].includes(assignment.status) ||
          assignment.deadlineAt <= new Date()
        ) {
          throw new ConflictException({ code: 'ASSIGNMENT_NOT_EDITABLE' })
        }
        await this.lockOpenCycle(assignment.cycleId, new Date(), session)
        if (!isDeliveryAutomaticallyRetryable(currentDelivery.status)) {
          throw new ConflictException({ code: 'DELIVERY_NOT_RETRYABLE' })
        }
        const invitation = await this.invitations
          .findOne({
            assignmentId: currentDelivery.assignmentId,
            status: 'active'
          })
          .session(session)
          .exec()
        if (!invitation) {
          throw new ConflictException({ code: 'INVITATION_INVALID' })
        }

        invitationId = invitation.id
        jobId = `delivery-${currentDelivery.id}-retry-${currentDelivery.attempts + 1}`
        await new this.deliveryRetryRequests({
          _id: retryRequestId,
          deliveryId: currentDelivery.id,
          actorId: actor.id,
          requestHash: payloadHash,
          invitationId,
          jobId
        }).save({ session })

        currentDelivery.status = 'queued'
        currentDelivery.lastErrorCode = undefined
        delivery = await currentDelivery.save({ session })
        await this.auditService.record(
          {
            requestId,
            actorId: actor.id,
            actorEmail: actor.email,
            action: 'correspondence.delivery_retry_requested',
            route: 'POST /api/v2/deliveries/:deliveryId/retry',
            method: 'POST',
            resourceScopes: [
              {
                schoolIds: assignment.schoolId ? [assignment.schoolId] : [],
                programIds: assignment.programId ? [assignment.programId] : []
              }
            ],
            metadata: {
              deliveryId: currentDelivery.id,
              campaignId: currentDelivery.campaignId,
              retryAttempt: currentDelivery.attempts + 1
            }
          },
          session
        )
        shouldEnqueue = true
      })
    } catch (error: unknown) {
      if (!isDuplicateKeyError(error)) throw error
      const existingRequest = await this.deliveryRetryRequests
        .findById(retryRequestId)
        .exec()
      if (!existingRequest) throw error
      if (existingRequest.requestHash !== payloadHash) {
        throw new ConflictException({ code: 'IDEMPOTENCY_KEY_REUSED' })
      }
      const existingDelivery = await this.deliveries
        .findById(existingRequest.deliveryId)
        .exec()
      if (!existingDelivery) {
        throw new NotFoundException({ code: 'RESOURCE_NOT_FOUND' })
      }
      await this.assertAssignmentsInScope(
        actor,
        [existingDelivery.assignmentId],
        ['internshipStaff']
      )
      delivery = existingDelivery
      invitationId = existingRequest.invitationId
      jobId = existingRequest.jobId
      shouldEnqueue = existingDelivery.status === 'queued'
    }

    if (!delivery || !invitationId || !jobId) {
      throw new ConflictException({ code: 'DELIVERY_RETRY_NOT_RECORDED' })
    }
    if (shouldEnqueue) {
      try {
        await this.enqueueDelivery(delivery.id, invitationId, '', jobId)
      } catch {
        // The queued delivery and retry intent are durable; Worker recovery will enqueue it.
      }
    }
    return deliveryResponse(
      delivery.toJSON() as unknown as Readonly<Record<string, unknown>>
    )
  }

  public async sendStudentInvitation(
    actor: AuthenticatedActor,
    input: DirectStudentInvitationInput,
    idempotencyKey: string
  ): Promise<{
    success: boolean
    status: CampaignRecord['status']
    assignmentId: string
    invitationId: string
    campaignId: string
    deliveryId: string
    invitationUrl: string
    recipientEmail: string
    studentName: string
    deadlineAt: string
  }> {
    const scopedKey = idempotencyScopeKey(
      actor.id,
      'direct-student-invitation',
      idempotencyKey
    )
    const payloadHash = requestHash(input)
    const existingCampaign = await this.campaigns
      .findOne({ idempotencyScopeKey: scopedKey })
      .exec()
    if (existingCampaign) {
      if (existingCampaign.requestHash !== payloadHash) {
        throw new ConflictException({ code: 'IDEMPOTENCY_KEY_REUSED' })
      }
      await this.assertAssignmentsInScope(
        actor,
        existingCampaign.assignmentIds,
        ['internshipStaff']
      )
      const existingAssignment = await this.assignments
        .findById(existingCampaign.assignmentIds[0])
        .exec()
      const existingInvitation = await this.invitations
        .findOne({ assignmentId: existingAssignment?.id })
        .exec()
      const existingStudent = existingAssignment
        ? await this.students
            .findOne(studentReferenceFilter(existingAssignment.studentId))
            .exec()
        : null
      if (!existingAssignment || !existingInvitation || !existingStudent) {
        throw new ConflictException({
          code: 'INVITATION_RECONCILIATION_REQUIRED'
        })
      }
      let existingDelivery = await this.deliveries
        .findOne({ campaignId: existingCampaign.id })
        .exec()
      if (!existingDelivery) {
        existingDelivery = await this.deliveries.create({
          campaignId: existingCampaign.id,
          assignmentId: existingAssignment.id,
          recipientEmail: existingInvitation.email,
          templateVersionId: existingCampaign.templateVersionId,
          status: 'queued',
          attempts: 0
        })
      }
      if (
        existingDelivery.status === 'queued' ||
        (existingDelivery.status === 'failed' &&
          existingDelivery.lastErrorCode === 'QUEUE_ENQUEUE_FAILED')
      ) {
        try {
          existingDelivery.status = 'queued'
          existingDelivery.lastErrorCode = undefined
          await existingDelivery.save()
          await this.enqueueDelivery(existingDelivery.id, existingInvitation.id)
          await this.reconcileCampaign(
            existingCampaign.id,
            existingCampaign.total
          )
        } catch {
          // Keep the durable delivery intent queued for Worker reconciliation.
        }
      }
      return {
        success: true,
        status: existingCampaign.status,
        assignmentId: existingAssignment.id,
        invitationId: existingInvitation.id,
        campaignId: existingCampaign.id,
        deliveryId: existingDelivery.id,
        invitationUrl: await this.buildInvitationUrl(
          existingInvitation.id,
          existingAssignment.id,
          existingInvitation.expiresAt,
          existingInvitation.version
        ),
        recipientEmail: existingInvitation.email,
        studentName:
          existingStudent.name.th ||
          existingStudent.name.en ||
          existingStudent.studentId,
        deadlineAt: existingAssignment.deadlineAt.toISOString()
      }
    }
    // 1. Find student
    const isObjectId = input.studentId.match(/^[0-9a-fA-F]{24}$/)
    const student = await this.students
      .findOne({
        $and: [
          {
            $or: [
              ...(isObjectId ? [{ _id: input.studentId }] : []),
              { studentId: input.studentId }
            ]
          },
          scopeFilter<StudentRecord>(actor, ['internshipStaff'])
        ]
      })
      .exec()
    if (!student) {
      throw new NotFoundException({ code: 'STUDENT_NOT_FOUND' })
    }

    // 2. Find published competency set version (or latest version)
    const isCompSetObjectId = input.competencySetId.match(/^[0-9a-fA-F]{24}$/)
    const matchedCompSet = await this.competencySets
      .findOne({
        $or: [
          ...(isCompSetObjectId ? [{ _id: input.competencySetId }] : []),
          { code: input.competencySetId }
        ]
      })
      .exec()
    if (!matchedCompSet) {
      throw new NotFoundException({ code: 'COMPETENCY_SET_NOT_FOUND' })
    }

    const version = await this.competencyVersions
      .findOne({
        competencySetId: matchedCompSet.id,
        status: 'published'
      })
      .sort({ versionNumber: -1 })
      .exec()

    if (!version) {
      throw new UnprocessableEntityException({
        code: 'PUBLISHED_VERSION_REQUIRED'
      })
    }

    // Evaluator must be explicitly maintained under the placement's organization.
    const email = input.recipientEmail.trim().toLowerCase()
    const evaluator = await this.evaluators
      .findOne({ email, status: 'active' })
      .exec()
    if (!evaluator) {
      throw new UnprocessableEntityException({
        code: 'ACTIVE_EVALUATOR_REQUIRED'
      })
    }

    // Use only a real, currently active cycle for this student's term and scope.
    const now = new Date()
    const days = input.deadlineDays ?? 30
    if (!student.academicTermId) {
      throw new UnprocessableEntityException({
        code: 'STUDENT_TERM_REQUIRED'
      })
    }
    const cycles = await this.cycles
      .find({
        competencySetVersionId: version.id,
        academicTermId: student.academicTermId,
        status: 'active',
        opensAt: { $lte: now },
        closesAt: { $gt: now },
        $and: [
          {
            $or: [
              { schoolId: { $exists: false } },
              { schoolId: null },
              { schoolId: student.schoolId }
            ]
          },
          {
            $or: [
              { programId: { $exists: false } },
              { programId: null },
              { programId: student.programId }
            ]
          }
        ]
      })
      .limit(2)
      .exec()
    if (cycles.length === 0) {
      throw new UnprocessableEntityException({
        code: 'ACTIVE_CYCLE_REQUIRED'
      })
    }
    if (cycles.length > 1) {
      throw new ConflictException({ code: 'CYCLE_SELECTION_REQUIRED' })
    }
    const cycle = cycles[0]
    if (!cycle)
      throw new ConflictException({ code: 'CYCLE_SELECTION_REQUIRED' })
    const deadlineAt = new Date(
      Math.min(
        now.getTime() + days * 24 * 60 * 60 * 1000,
        cycle.closesAt.getTime()
      )
    )

    // Placement and evaluator must agree on the organization before assignment.
    const placements = await this.placements
      .find({
        studentId: { $in: [student.id, student.studentId] },
        academicTermId: student.academicTermId,
        status: 'active',
        startsAt: { $lte: now },
        endsAt: { $gt: now }
      })
      .limit(2)
      .exec()
    if (placements.length === 0) {
      throw new UnprocessableEntityException({
        code: 'PLACEMENT_REQUIRED'
      })
    }
    if (placements.length > 1) {
      throw new ConflictException({ code: 'PLACEMENT_SELECTION_REQUIRED' })
    }
    const placement = placements[0]
    if (!placement) {
      throw new ConflictException({ code: 'PLACEMENT_SELECTION_REQUIRED' })
    }
    if (
      placement.organizationId !== evaluator.organizationId ||
      placement.schoolId !== student.schoolId ||
      placement.programId !== student.programId ||
      placement.endsAt <= now
    ) {
      throw new UnprocessableEntityException({
        code: 'PLACEMENT_EVALUATOR_MISMATCH'
      })
    }

    // 6. Create EvaluationAssignment with filtered questionSnapshot matching student's school
    const studentSchoolId = student.schoolId
    const studentProgramId = student.programId
    const questionSnapshot = (version.sections || []).filter((sec) => {
      if (
        sec.category === 'general' ||
        sec.category === 'suggestion' ||
        (!sec.category && !sec.schoolId)
      ) {
        return true
      }
      if (sec.schoolId && sec.schoolId !== studentSchoolId) {
        return false
      }
      if (
        sec.programId &&
        studentProgramId &&
        sec.programId !== studentProgramId
      ) {
        return false
      }
      return true
    })
    if (questionSnapshot.length === 0) {
      throw new UnprocessableEntityException({
        code: 'QUESTIONS_NOT_APPLICABLE'
      })
    }

    const templateVersionId =
      await this.templatesService.ensureSystemTemplateVersion(
        'evaluation_request'
      )
    await this.requirePublishedTemplate(templateVersionId)

    let outbox
    try {
      outbox = await this.connection.transaction(async (session) => {
        await this.lockOpenCycle(cycle.id, now, session)
        const assignment = await this.assignments.findOneAndUpdate(
          { cycleId: cycle.id, placementId: placement.id },
          {
            $setOnInsert: {
              studentId: student.id,
              schoolId: student.schoolId,
              programId: student.programId,
              evaluatorId: evaluator.id,
              questionSnapshot,
              competencySetVersionId: version.id,
              deadlineAt,
              status: 'pending',
              evaluationVersion: 1
            }
          },
          { returnDocument: 'after', upsert: true, session }
        )
        if (!assignment || assignment.evaluatorId !== evaluator.id) {
          throw new ConflictException({ code: 'EVALUATOR_CHANGE_REQUIRED' })
        }
        if (
          !['pending', 'inProgress'].includes(assignment.status) ||
          assignment.deadlineAt <= now
        ) {
          throw new ConflictException({ code: 'ASSIGNMENT_NOT_EDITABLE' })
        }
        const previousInvitation = await this.invitations
          .findOne({ assignmentId: assignment.id })
          .session(session)
          .exec()
        if (previousInvitation) {
          throw new ConflictException({ code: 'INVITATION_REISSUE_REQUIRED' })
        }
        const invitation = await new this.invitations({
          assignmentId: assignment.id,
          evaluatorId: evaluator.id,
          email: evaluator.email,
          expiresAt: assignment.deadlineAt,
          status: 'active'
        }).save({ session })
        const campaign = await new this.campaigns({
          type: 'invitation',
          templateVersionId,
          assignmentIds: [assignment.id],
          invitationVersion: invitation.version,
          idempotencyKey: scopedKey,
          idempotencyScopeKey: scopedKey,
          requestHash: payloadHash,
          createdBy: actor.id,
          status: 'queued',
          total: 1
        }).save({ session })
        const delivery = await new this.deliveries({
          campaignId: campaign.id,
          assignmentId: assignment.id,
          recipientEmail: evaluator.email,
          templateVersionId,
          status: 'queued',
          attempts: 0
        }).save({ session })
        const invitationUrl = await this.buildInvitationUrl(
          invitation.id,
          assignment.id,
          assignment.deadlineAt,
          invitation.version
        )

        return { assignment, invitation, campaign, delivery, invitationUrl }
      })
    } catch (error) {
      const response =
        error instanceof ConflictException ? error.getResponse() : undefined
      const invitationRace =
        typeof response === 'object' &&
        response !== null &&
        'code' in response &&
        response.code === 'INVITATION_REISSUE_REQUIRED'
      if (!isDuplicateKeyError(error) && !invitationRace) throw error
      const concurrentCampaign = await this.campaigns
        .findOne({ idempotencyScopeKey: scopedKey })
        .exec()
      if (!concurrentCampaign) {
        if (invitationRace) throw error
        throw new ConflictException({
          code: 'INVITATION_OR_ASSIGNMENT_CONFLICT'
        })
      }
      if (concurrentCampaign.requestHash !== payloadHash) {
        throw new ConflictException({ code: 'IDEMPOTENCY_KEY_REUSED' })
      }
      return this.sendStudentInvitation(actor, input, idempotencyKey)
    }

    try {
      await this.enqueueDelivery(outbox.delivery.id, outbox.invitation.id)
    } catch {
      // The committed delivery row remains queued and is recovered by the Worker.
    }

    return {
      success: true,
      status: 'queued',
      assignmentId: outbox.assignment.id,
      invitationId: outbox.invitation.id,
      campaignId: outbox.campaign.id,
      deliveryId: outbox.delivery.id,
      invitationUrl: outbox.invitationUrl,
      recipientEmail: evaluator.email,
      studentName: student.name.th || student.name.en || student.studentId,
      deadlineAt: outbox.assignment.deadlineAt.toISOString()
    }
  }

  public async reissueInvitation(
    actor: AuthenticatedActor,
    assignmentId: string,
    input: InvitationReissueInput,
    idempotencyKey: string,
    requestId = 'unknown'
  ): Promise<InvitationReissueResult> {
    await this.assertAssignmentsInScope(
      actor,
      [assignmentId],
      ['internshipStaff']
    )
    const reason = input.reason.trim()
    const scopedKey = idempotencyScopeKey(
      actor.id,
      'invitation-reissue',
      idempotencyKey
    )
    const payloadHash = requestHash({ assignmentId, reason })
    const replay = await this.findInvitationReissueReplay(
      actor,
      scopedKey,
      payloadHash
    )
    if (replay) return replay

    const templateVersionId =
      await this.templatesService.ensureSystemTemplateVersion(
        'evaluation_request'
      )
    await this.requirePublishedTemplate(templateVersionId)

    let outbox: {
      readonly assignment: HydratedDocument<EvaluationAssignmentRecord>
      readonly invitation: HydratedDocument<InvitationRecord>
      readonly campaign: HydratedDocument<CampaignRecord>
      readonly delivery: HydratedDocument<DeliveryRecord>
    }
    try {
      outbox = await this.connection.transaction(async (session) => {
        const now = new Date()
        const assignment = await this.assignments
          .findOne({
            $and: [
              { _id: assignmentId },
              scopeFilter<EvaluationAssignmentRecord>(actor, [
                'internshipStaff'
              ])
            ]
          })
          .session(session)
          .exec()
        if (!assignment) {
          throw new NotFoundException({ code: 'RESOURCE_NOT_FOUND' })
        }
        if (
          !['pending', 'inProgress'].includes(assignment.status) ||
          assignment.deadlineAt <= now
        ) {
          throw new ConflictException({ code: 'ASSIGNMENT_NOT_EDITABLE' })
        }
        await this.lockOpenCycle(assignment.cycleId, now, session)
        const [currentInvitation, evaluator] = await Promise.all([
          this.invitations
            .findOne({ assignmentId: assignment.id })
            .session(session)
            .exec(),
          this.evaluators
            .findOne({ _id: assignment.evaluatorId, status: 'active' })
            .session(session)
            .exec()
        ])
        if (!currentInvitation || !evaluator) {
          throw new ConflictException({
            code: 'INVITATION_RECONCILIATION_REQUIRED'
          })
        }
        const previousVersion = currentInvitation.version ?? 1
        const invitation = await this.invitations.findOneAndUpdate(
          {
            _id: currentInvitation.id,
            assignmentId: assignment.id,
            ...invitationVersionFilter(previousVersion),
            status: { $in: ['active', 'revoked', 'expired'] }
          },
          {
            $set: {
              version: previousVersion + 1,
              email: evaluator.email,
              expiresAt: assignment.deadlineAt,
              status: 'active'
            },
            $unset: { accessPin: 1, accessPinHash: 1, lastExchangedAt: 1 }
          },
          { returnDocument: 'after', session }
        )
        if (!invitation) {
          throw new ConflictException({ code: 'INVITATION_VERSION_CONFLICT' })
        }
        const assignmentUpdate = await this.assignments.updateOne(
          {
            _id: assignment.id,
            status: { $in: ['pending', 'inProgress'] },
            deadlineAt: { $gt: now }
          },
          { $unset: { accessPin: 1, accessPinHash: 1 } },
          { session }
        )
        if (assignmentUpdate.matchedCount !== 1) {
          throw new ConflictException({ code: 'ASSIGNMENT_NOT_EDITABLE' })
        }
        await this.sessions.updateMany(
          {
            assignmentId: assignment.id,
            invitationId: invitation.id,
            revokedAt: { $exists: false }
          },
          { $set: { revokedAt: now } },
          { session }
        )
        const campaign = await new this.campaigns({
          type: 'invitation',
          templateVersionId,
          assignmentIds: [assignment.id],
          invitationVersion: invitation.version,
          idempotencyKey: scopedKey,
          idempotencyScopeKey: scopedKey,
          requestHash: payloadHash,
          createdBy: actor.id,
          status: 'queued',
          total: 1
        }).save({ session })
        const delivery = await new this.deliveries({
          campaignId: campaign.id,
          assignmentId: assignment.id,
          recipientEmail: evaluator.email,
          templateVersionId,
          status: 'queued',
          attempts: 0
        }).save({ session })
        await this.auditService.record(
          {
            requestId,
            actorId: actor.id,
            actorEmail: actor.email,
            action: 'correspondence.invitation_reissued',
            route:
              'POST /api/v2/evaluation-assignments/:assignmentId/invitation/reissue',
            method: 'POST',
            resourceScopes: [
              {
                schoolIds: [assignment.schoolId],
                programIds: [assignment.programId]
              }
            ],
            metadata: {
              actorRoles: actor.roles,
              assignmentId: assignment.id,
              invitationId: invitation.id,
              previousVersion,
              invitationVersion: invitation.version,
              campaignId: campaign.id,
              deliveryId: delivery.id,
              reason
            }
          },
          session
        )
        return { assignment, invitation, campaign, delivery }
      })
    } catch (error: unknown) {
      if (!isDuplicateKeyError(error)) throw error
      const concurrentReplay = await this.findInvitationReissueReplay(
        actor,
        scopedKey,
        payloadHash
      )
      if (concurrentReplay) return concurrentReplay
      throw new ConflictException({ code: 'INVITATION_REISSUE_CONFLICT' })
    }

    try {
      await this.enqueueDelivery(outbox.delivery.id, outbox.invitation.id)
    } catch {
      // The committed delivery remains queued for Worker reconciliation.
    }
    return {
      success: true,
      status: outbox.campaign.status,
      assignmentId: outbox.assignment.id,
      invitationId: outbox.invitation.id,
      campaignId: outbox.campaign.id,
      deliveryId: outbox.delivery.id,
      invitationVersion: outbox.invitation.version,
      recipientEmail: outbox.invitation.email,
      deadlineAt: outbox.assignment.deadlineAt.toISOString()
    }
  }

  private async findInvitationReissueReplay(
    actor: AuthenticatedActor,
    scopedKey: string,
    payloadHash: string
  ): Promise<InvitationReissueResult | undefined> {
    const campaign = await this.campaigns
      .findOne({ idempotencyScopeKey: scopedKey })
      .exec()
    if (!campaign) return undefined
    if (campaign.requestHash !== payloadHash) {
      throw new ConflictException({ code: 'IDEMPOTENCY_KEY_REUSED' })
    }
    await this.assertAssignmentsInScope(actor, campaign.assignmentIds, [
      'internshipStaff'
    ])
    const assignment = await this.assignments
      .findById(campaign.assignmentIds[0])
      .exec()
    const invitation = assignment
      ? await this.invitations.findOne({ assignmentId: assignment.id }).exec()
      : null
    const delivery = await this.deliveries
      .findOne({ campaignId: campaign.id })
      .exec()
    if (!assignment || !invitation || !delivery) {
      throw new ConflictException({
        code: 'INVITATION_RECONCILIATION_REQUIRED'
      })
    }
    if (delivery.status === 'queued') {
      try {
        await this.enqueueDelivery(delivery.id, invitation.id)
      } catch {
        // Leave the durable delivery queued for Worker reconciliation.
      }
    }
    return {
      success: true,
      status: campaign.status,
      assignmentId: assignment.id,
      invitationId: invitation.id,
      campaignId: campaign.id,
      deliveryId: delivery.id,
      invitationVersion: campaign.invitationVersion ?? invitation.version ?? 1,
      recipientEmail: invitation.email,
      deadlineAt: assignment.deadlineAt.toISOString()
    }
  }

  private async requirePublishedTemplate(id: string): Promise<void> {
    const template = await this.templateVersions.exists({
      _id: id,
      status: 'published'
    })
    if (!template) {
      throw new UnprocessableEntityException({
        code: 'PUBLISHED_TEMPLATE_REQUIRED'
      })
    }
  }

  private async lockOpenCycle(
    cycleId: string,
    now: Date,
    session: ClientSession
  ): Promise<HydratedDocument<EvaluationCycleRecord>> {
    const cycle = await this.cycles
      .findOne({
        _id: cycleId,
        status: 'active',
        opensAt: { $lte: now },
        closesAt: { $gt: now }
      })
      .session(session)
      .exec()
    if (!cycle) throw new ConflictException({ code: 'CYCLE_NOT_OPEN' })

    const locked = await this.cycles
      .updateOne(
        {
          _id: cycle.id,
          __v: cycle.__v ?? 0,
          status: 'active',
          opensAt: { $lte: now },
          closesAt: { $gt: now }
        },
        { $inc: { __v: 1 } },
        { session }
      )
      .exec()
    if (locked.matchedCount !== 1) {
      throw new ConflictException({ code: 'CYCLE_NOT_OPEN' })
    }
    return cycle
  }

  private async buildInvitationUrl(
    invitationId: string,
    assignmentId: string,
    expiresAt: Date,
    invitationVersion: number
  ): Promise<string> {
    const secret = this.config.get('AUTH_JWT_SECRET', { infer: true })
    const signingKey = new TextEncoder().encode(secret)
    const token = await new SignJWT({
      tokenUse: 'invitation',
      invitationId,
      assignmentId,
      invitationVersion
    })
      .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
      .setIssuer('internship-transcript-v2')
      .setAudience('internship-transcript-api')
      .setIssuedAt()
      .setExpirationTime(Math.floor(expiresAt.getTime() / 1000))
      .sign(signingKey)
    const publicWebUrl = this.config.get('PUBLIC_WEB_URL', { infer: true })
    if (!publicWebUrl) {
      throw new ServiceUnavailableException({
        code: 'PUBLIC_WEB_URL_NOT_CONFIGURED'
      })
    }
    const invitationParameters = new URLSearchParams({
      token,
      assignment: assignmentId
    })
    return `${publicWebUrl}/evaluate#${invitationParameters.toString()}`
  }

  private async assertAssignmentsInScope(
    actor: AuthenticatedActor,
    assignmentIds: readonly string[],
    allowedRoles?: readonly string[]
  ): Promise<void> {
    const count = await this.assignments.countDocuments({
      $and: [
        { _id: { $in: assignmentIds } },
        scopeFilter<EvaluationAssignmentRecord>(actor, allowedRoles)
      ]
    })
    if (count !== new Set(assignmentIds).size) {
      throw new NotFoundException({ code: 'RESOURCE_NOT_FOUND' })
    }
  }

  private async enqueueDelivery(
    deliveryId: string,
    invitationId: string,
    jobSuffix = '',
    jobIdOverride?: string
  ): Promise<void> {
    await this.emailQueue.add(
      'send-delivery',
      { deliveryId, invitationId },
      {
        attempts: 5,
        backoff: { type: 'exponential', delay: 5000 },
        jobId: jobIdOverride ?? `delivery-${deliveryId}${jobSuffix}`,
        removeOnComplete: 500,
        removeOnFail: 1000
      }
    )
  }

  private async reconcileCampaign(
    campaignId: string,
    expectedTotal: number
  ): Promise<void> {
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const campaign = await this.campaigns
        .findOneAndUpdate(
          { _id: campaignId },
          { $inc: { __v: 1 } },
          { returnDocument: 'after' }
        )
        .select('__v')
        .lean()
      if (!campaign) throw new NotFoundException({ code: 'CAMPAIGN_NOT_FOUND' })

      const summary = await this.deliveries.aggregate<{
        _id: DeliveryRecord['status']
        count: number
      }>([
        { $match: { campaignId } },
        { $group: { _id: '$status', count: { $sum: 1 } } }
      ])
      const counts = Object.fromEntries(
        summary.map((item) => [item._id, item.count])
      )
      const status = campaignStatusFromDeliveryCounts(expectedTotal, counts)
      const result = await this.campaigns.updateOne(
        { _id: campaignId, __v: campaign.__v },
        { $set: { status }, $inc: { __v: 1 } }
      )
      if (result.matchedCount === 1) return
    }

    throw new ConflictException({ code: 'CAMPAIGN_RECONCILIATION_CONFLICT' })
  }

  public async sendTargetedEmail(
    actor: AuthenticatedActor,
    input: TargetedEmailInput,
    idempotencyKey: string
  ): Promise<unknown> {
    const scopedKey = idempotencyScopeKey(
      actor.id,
      'targeted-email',
      idempotencyKey
    )
    const payloadHash = requestHash(input)
    const replayExisting = async (): Promise<
      { response: unknown } | undefined
    > => {
      const campaign = await this.campaigns
        .findOne({ idempotencyScopeKey: scopedKey })
        .exec()
      if (!campaign) return undefined
      if (campaign.requestHash !== payloadHash) {
        throw new ConflictException({ code: 'IDEMPOTENCY_KEY_REUSED' })
      }
      if (campaign.assignmentIds.length !== 1) {
        throw new ConflictException({
          code: 'CAMPAIGN_RECONCILIATION_REQUIRED'
        })
      }
      await this.assertAssignmentsInScope(actor, campaign.assignmentIds, [
        'internshipStaff'
      ])
      const delivery = await this.deliveries
        .findOne({ campaignId: campaign.id })
        .exec()
      const invitation = await this.invitations
        .findOne({ assignmentId: campaign.assignmentIds[0] })
        .exec()
      return {
        response: {
          status: campaign.status,
          campaignId: campaign.id,
          ...(delivery
            ? {
                deliveryId: delivery.id,
                recipientEmail: delivery.recipientEmail
              }
            : {}),
          assignmentId: campaign.assignmentIds[0],
          ...(invitation ? { invitationId: invitation.id } : {})
        }
      }
    }
    const replayOrThrow = async (error: unknown): Promise<unknown> => {
      const replay = await replayExisting()
      if (replay) return replay.response
      throw error
    }

    const existing = await replayExisting()
    if (existing) return existing.response

    const assignment = await this.assignments
      .findOne({
        $and: [
          { _id: input.assignmentId },
          scopeFilter<EvaluationAssignmentRecord>(actor, ['internshipStaff'])
        ]
      })
      .exec()
    if (!assignment) throw new NotFoundException({ code: 'RESOURCE_NOT_FOUND' })
    const now = new Date()
    if (
      !['pending', 'inProgress'].includes(assignment.status) ||
      assignment.deadlineAt <= now
    ) {
      throw new ConflictException({ code: 'ASSIGNMENT_NOT_EDITABLE' })
    }
    await this.assertAssignmentsInScope(
      actor,
      [assignment.id],
      ['internshipStaff']
    )

    const cycle = await this.cycles
      .findOne({
        _id: assignment.cycleId,
        status: 'active',
        opensAt: { $lte: now },
        closesAt: { $gt: now }
      })
      .exec()
    if (!cycle || assignment.deadlineAt > cycle.closesAt) {
      throw new ConflictException({ code: 'CYCLE_CLOSED' })
    }

    const student = await this.students
      .findOne({
        ...studentReferenceFilter(assignment.studentId),
        status: 'active'
      })
      .exec()
    if (
      !student ||
      ![student.id, student.studentId].includes(input.studentId)
    ) {
      throw new NotFoundException({ code: 'RESOURCE_NOT_FOUND' })
    }
    const evaluator = await this.evaluators
      .findOne({ _id: assignment.evaluatorId, status: 'active' })
      .exec()
    if (!evaluator) {
      throw new UnprocessableEntityException({
        code: 'ACTIVE_EVALUATOR_REQUIRED'
      })
    }

    const templateVersionId =
      await this.templatesService.ensureSystemTemplateVersion(
        input.templateCode
      )
    await this.requirePublishedTemplate(templateVersionId)

    const existingInvitation = await this.invitations
      .findOne({ assignmentId: assignment.id })
      .exec()
    const campaignType =
      input.templateCode === 'evaluation_reminder' ? 'reminder' : 'invitation'
    const initialTargetIssue = campaignTargetIssue({
      type: campaignType,
      assignmentStatus: assignment.status,
      assignmentDeadlineAt: assignment.deadlineAt,
      cycleStatus: cycle.status,
      cycleOpensAt: cycle.opensAt,
      cycleClosesAt: cycle.closesAt,
      evaluatorActive: true,
      assignmentEvaluatorId: assignment.evaluatorId,
      now,
      ...(existingInvitation
        ? {
            invitation: {
              status: existingInvitation.status,
              evaluatorId: existingInvitation.evaluatorId,
              expiresAt: existingInvitation.expiresAt
            }
          }
        : {})
    })
    if (initialTargetIssue) {
      return replayOrThrow(new ConflictException({ code: initialTargetIssue }))
    }

    const recipientEmail = (input.recipientEmail || evaluator.email)
      .trim()
      .toLowerCase()
    let outbox
    try {
      outbox = await this.connection.transaction(async (session) => {
        const currentAssignment = await this.assignments
          .findOne({
            _id: assignment.id,
            cycleId: assignment.cycleId,
            status: { $in: ['pending', 'inProgress'] },
            deadlineAt: { $gt: now }
          })
          .session(session)
          .exec()
        if (!currentAssignment) {
          throw new ConflictException({ code: 'ASSIGNMENT_NOT_EDITABLE' })
        }
        const lockedCycle = await this.lockOpenCycle(
          currentAssignment.cycleId,
          now,
          session
        )
        if (currentAssignment.deadlineAt > lockedCycle.closesAt) {
          throw new ConflictException({ code: 'CYCLE_CLOSED' })
        }

        let invitation = await this.invitations
          .findOne({ assignmentId: currentAssignment.id })
          .session(session)
          .exec()
        const targetIssue = campaignTargetIssue({
          type: campaignType,
          assignmentStatus: currentAssignment.status,
          assignmentDeadlineAt: currentAssignment.deadlineAt,
          cycleStatus: lockedCycle.status,
          cycleOpensAt: lockedCycle.opensAt,
          cycleClosesAt: lockedCycle.closesAt,
          evaluatorActive: true,
          assignmentEvaluatorId: currentAssignment.evaluatorId,
          now,
          ...(invitation
            ? {
                invitation: {
                  status: invitation.status,
                  evaluatorId: invitation.evaluatorId,
                  expiresAt: invitation.expiresAt
                }
              }
            : {})
        })
        if (targetIssue) {
          throw new ConflictException({ code: targetIssue })
        }
        if (campaignType === 'invitation') {
          if (invitation) {
            throw new ConflictException({ code: 'INVITATION_REISSUE_REQUIRED' })
          }
          invitation = await new this.invitations({
            assignmentId: currentAssignment.id,
            evaluatorId: currentAssignment.evaluatorId,
            email: recipientEmail,
            expiresAt: currentAssignment.deadlineAt,
            status: 'active'
          }).save({ session })
        }
        if (!invitation) {
          throw new ConflictException({ code: 'ACTIVE_INVITATION_REQUIRED' })
        }
        const campaign = await new this.campaigns({
          type: campaignType,
          templateVersionId,
          assignmentIds: [currentAssignment.id],
          ...(campaignType === 'invitation'
            ? { invitationVersion: invitation.version }
            : {}),
          idempotencyKey,
          idempotencyScopeKey: scopedKey,
          requestHash: payloadHash,
          createdBy: actor.id,
          status: 'queued',
          total: 1
        }).save({ session })
        const delivery = await new this.deliveries({
          campaignId: campaign.id,
          assignmentId: currentAssignment.id,
          recipientEmail,
          templateVersionId,
          status: 'queued',
          attempts: 0
        }).save({ session })
        return { invitation, campaign, delivery }
      })
    } catch (error) {
      if (!isDuplicateKeyError(error)) throw error
      const concurrentCampaign = await this.campaigns
        .findOne({ idempotencyScopeKey: scopedKey })
        .exec()
      if (!concurrentCampaign) {
        throw new ConflictException({
          code: 'INVITATION_OR_ASSIGNMENT_CONFLICT'
        })
      }
      if (concurrentCampaign.requestHash !== payloadHash) {
        throw new ConflictException({ code: 'IDEMPOTENCY_KEY_REUSED' })
      }
      return this.sendTargetedEmail(actor, input, idempotencyKey)
    }

    try {
      await this.enqueueDelivery(outbox.delivery.id, outbox.invitation.id)
    } catch {
      // The committed delivery row remains queued and is recovered by the Worker.
    }

    return {
      status: 'queued',
      campaignId: outbox.campaign.id,
      deliveryId: outbox.delivery.id,
      assignmentId: assignment.id,
      invitationId: outbox.invitation.id,
      recipientEmail
    }
  }
}
