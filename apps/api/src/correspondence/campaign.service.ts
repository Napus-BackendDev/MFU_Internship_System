import type { AppEnvironment } from '@internship/config'
import {
  campaignStatusFromDeliveryCounts,
  type AuthenticatedActor
} from '@internship/shared-types'
import { InjectQueue } from '@nestjs/bullmq'
import {
  ConflictException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException
} from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { InjectConnection, InjectModel } from '@nestjs/mongoose'
import type { Queue } from 'bullmq'
import { SignJWT } from 'jose'
import type { Connection, HydratedDocument, Model } from 'mongoose'

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
  EmailTemplateVersionRecord,
  InvitationRecord
} from './correspondence.schema.js'
import {
  campaignTargetIssue,
  isDeliveryAutomaticallyRetryable
} from './delivery-workflow.policy.js'

import { TemplateService } from './template.service.js'

function isDuplicateKeyError(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    error.code === 11000
  )
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
    private readonly cycles: Model<EvaluationCycleRecord>
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
          scopeFilter<EvaluationAssignmentRecord>(actor)
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
    const existing = await this.campaigns
      .findOne({ idempotencyScopeKey: scopedKey })
      .exec()
    if (existing) {
      await this.assertAssignmentsInScope(actor, existing.assignmentIds)
      if (existing.requestHash !== payloadHash) {
        throw new ConflictException({ code: 'IDEMPOTENCY_KEY_REUSED' })
      }
      return existing.toJSON()
    }
    const preview = (await this.preview(actor, input)) as { valid: boolean }
    if (!preview.valid) {
      throw new UnprocessableEntityException({
        code: 'CAMPAIGN_PREVIEW_INVALID'
      })
    }

    const now = new Date()
    const assignments = await this.assignments
      .find({
        $and: [
          { _id: { $in: input.assignmentIds } },
          scopeFilter<EvaluationAssignmentRecord>(actor)
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
        throw new UnprocessableEntityException({ code: issue })
      }
      if (issue) throw new ConflictException({ code: issue })
      if (!evaluator) {
        throw new UnprocessableEntityException({
          code: 'ACTIVE_EVALUATOR_REQUIRED'
        })
      }
      if (input.type === 'invitation') {
        targets.push({ assignment, evaluator })
      } else {
        if (!existingInvitation) {
          throw new ConflictException({ code: 'ACTIVE_INVITATION_REQUIRED' })
        }
        targets.push({ assignment, evaluator, invitation: existingInvitation })
      }
    }
    if (targets.length !== input.assignmentIds.length) {
      throw new UnprocessableEntityException({
        code: 'CAMPAIGN_PREVIEW_INVALID'
      })
    }

    let outbox
    try {
      outbox = await this.connection.transaction(async (session) => {
        const campaign = await new this.campaigns({
          ...input,
          assignmentIds: [...input.assignmentIds],
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

        for (const target of targets) {
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
        concurrentCampaign.assignmentIds
      )
      if (concurrentCampaign.requestHash !== payloadHash) {
        throw new ConflictException({ code: 'IDEMPOTENCY_KEY_REUSED' })
      }
      return concurrentCampaign.toJSON()
    }

    // Delivery rows are the durable outbox. Queue insertion is best-effort;
    // the Worker reconciles persisted queued rows after startup and periodically.
    await Promise.all(
      outbox.deliveries.map(({ deliveryId, invitationId }) =>
        this.enqueueDelivery(deliveryId, invitationId).catch(() => undefined)
      )
    )
    await this.reconcileCampaign(outbox.campaign.id, outbox.campaign.total)
    return (await this.campaigns.findById(outbox.campaign.id).exec())!.toJSON()
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
      { $group: { _id: '$status', count: { $sum: 1 } } }
    ])
    return { ...campaign.toJSON(), deliverySummary: summary }
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
    const assignments = await this.assignments
      .find(scopeFilter<EvaluationAssignmentRecord>(actor))
      .select('_id')
      .lean()
      .exec()
    return paginate(
      this.deliveries,
      {
        assignmentId: { $in: assignments.map((item) => item._id.toString()) },
        ...(input.campaignId ? { campaignId: input.campaignId } : {}),
        ...(input.status ? { status: input.status } : {})
      },
      input
    )
  }

  public async retry(
    actor: AuthenticatedActor,
    deliveryId: string
  ): Promise<unknown> {
    const delivery = await this.deliveries.findById(deliveryId).exec()
    if (!delivery) throw new NotFoundException({ code: 'RESOURCE_NOT_FOUND' })
    await this.assertAssignmentsInScope(actor, [delivery.assignmentId])
    if (!isDeliveryAutomaticallyRetryable(delivery.status)) {
      throw new ConflictException({ code: 'DELIVERY_NOT_RETRYABLE' })
    }
    const invitation = await this.invitations.findOne({
      assignmentId: delivery.assignmentId,
      status: 'active'
    })
    if (!invitation) throw new ConflictException({ code: 'INVITATION_INVALID' })
    delivery.status = 'queued'
    delivery.lastErrorCode = undefined
    await delivery.save()
    try {
      await this.enqueueDelivery(
        delivery.id,
        invitation.id,
        `-retry-${delivery.attempts + 1}`
      )
    } catch {
      delivery.status = 'failed'
      delivery.lastErrorCode = 'QUEUE_ENQUEUE_FAILED'
      await delivery.save()
      throw new ConflictException({ code: 'QUEUE_UNAVAILABLE' })
    }
    return delivery.toJSON()
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
      await this.assertAssignmentsInScope(actor, existingCampaign.assignmentIds)
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
          await this.enqueueDelivery(
            existingDelivery.id,
            existingInvitation.id,
            `-reconcile-${existingDelivery.attempts + 1}`
          )
          await this.campaigns.updateOne(
            { _id: existingCampaign.id },
            { $set: { status: 'queued' } }
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
          existingInvitation.expiresAt
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
          scopeFilter<StudentRecord>(actor)
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

    const systemTemplates =
      (await this.templatesService.getSystemTemplates()) as Array<{
        code: string
        versionId: string
      }>
    const matchedTemplate = systemTemplates.find(
      (template) => template.code === 'evaluation_request'
    )
    const templateVersionId = matchedTemplate?.versionId
    if (!templateVersionId) {
      throw new UnprocessableEntityException({
        code: 'PUBLISHED_TEMPLATE_REQUIRED'
      })
    }
    await this.requirePublishedTemplate(templateVersionId)

    let outbox
    try {
      outbox = await this.connection.transaction(async (session) => {
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
          assignment.deadlineAt
        )

        return { assignment, invitation, campaign, delivery, invitationUrl }
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

  private async buildInvitationUrl(
    invitationId: string,
    assignmentId: string,
    expiresAt: Date
  ): Promise<string> {
    const secret = this.config.get('AUTH_JWT_SECRET', { infer: true })
    const signingKey = new TextEncoder().encode(secret)
    const token = await new SignJWT({
      tokenUse: 'invitation',
      invitationId,
      assignmentId
    })
      .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
      .setIssuer('internship-transcript-v2')
      .setAudience('internship-transcript-api')
      .setIssuedAt()
      .setExpirationTime(Math.floor(expiresAt.getTime() / 1000))
      .sign(signingKey)
    const publicWebUrl =
      this.config.get('PUBLIC_WEB_URL', { infer: true }) ||
      'http://localhost:8180'
    return `${publicWebUrl}/evaluate?token=${encodeURIComponent(token)}&assignment=${assignmentId}`
  }

  private async assertAssignmentsInScope(
    actor: AuthenticatedActor,
    assignmentIds: readonly string[]
  ): Promise<void> {
    const count = await this.assignments.countDocuments({
      $and: [
        { _id: { $in: assignmentIds } },
        scopeFilter<EvaluationAssignmentRecord>(actor)
      ]
    })
    if (count !== new Set(assignmentIds).size) {
      throw new NotFoundException({ code: 'RESOURCE_NOT_FOUND' })
    }
  }

  private async enqueueDelivery(
    deliveryId: string,
    invitationId: string,
    jobSuffix = ''
  ): Promise<void> {
    await this.emailQueue.add(
      'send-delivery',
      { deliveryId, invitationId },
      {
        attempts: 5,
        backoff: { type: 'exponential', delay: 5000 },
        jobId: `delivery-${deliveryId}${jobSuffix}`,
        removeOnComplete: 500,
        removeOnFail: 1000
      }
    )
  }

  private async reconcileCampaign(
    campaignId: string,
    expectedTotal: number
  ): Promise<void> {
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
    await this.campaigns.updateOne({ _id: campaignId }, { $set: { status } })
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
    const existing = await this.campaigns
      .findOne({ idempotencyScopeKey: scopedKey })
      .exec()
    if (existing) {
      if (existing.requestHash !== payloadHash) {
        throw new ConflictException({ code: 'IDEMPOTENCY_KEY_REUSED' })
      }
      if (existing.assignmentIds.length !== 1) {
        throw new ConflictException({
          code: 'CAMPAIGN_RECONCILIATION_REQUIRED'
        })
      }
      await this.assertAssignmentsInScope(actor, existing.assignmentIds)
      const delivery = await this.deliveries
        .findOne({ campaignId: existing.id })
        .exec()
      return {
        status: existing.status,
        campaignId: existing.id,
        ...(delivery ? { deliveryId: delivery.id } : {}),
        assignmentId: existing.assignmentIds[0]
      }
    }

    const assignment = await this.assignments
      .findOne({
        $and: [
          { _id: input.assignmentId },
          scopeFilter<EvaluationAssignmentRecord>(actor)
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
    await this.assertAssignmentsInScope(actor, [assignment.id])

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

    const templateList =
      (await this.templatesService.getSystemTemplates()) as Array<{
        code: string
        versionId: string
      }>
    const templateVersionId = templateList.find(
      (template) => template.code === input.templateCode
    )?.versionId
    if (!templateVersionId) {
      throw new UnprocessableEntityException({
        code: 'PUBLISHED_TEMPLATE_REQUIRED'
      })
    }
    await this.requirePublishedTemplate(templateVersionId)

    const existingInvitation = await this.invitations
      .findOne({ assignmentId: assignment.id })
      .exec()
    if (input.templateCode === 'evaluation_reminder') {
      if (
        assignment.status !== 'inProgress' ||
        !existingInvitation ||
        existingInvitation.status !== 'active' ||
        existingInvitation.expiresAt <= now
      ) {
        throw new ConflictException({ code: 'ACTIVE_INVITATION_REQUIRED' })
      }
    } else if (existingInvitation) {
      throw new ConflictException({ code: 'INVITATION_REISSUE_REQUIRED' })
    }

    const recipientEmail = (input.recipientEmail || evaluator.email)
      .trim()
      .toLowerCase()
    let outbox
    try {
      outbox = await this.connection.transaction(async (session) => {
        let invitation = await this.invitations
          .findOne({ assignmentId: assignment.id })
          .session(session)
          .exec()
        if (input.templateCode === 'evaluation_reminder') {
          if (
            assignment.status !== 'inProgress' ||
            !invitation ||
            invitation.status !== 'active' ||
            invitation.expiresAt <= now
          ) {
            throw new ConflictException({ code: 'ACTIVE_INVITATION_REQUIRED' })
          }
        } else {
          if (invitation) {
            throw new ConflictException({ code: 'INVITATION_REISSUE_REQUIRED' })
          }
          invitation = await new this.invitations({
            assignmentId: assignment.id,
            evaluatorId: assignment.evaluatorId,
            email: recipientEmail,
            expiresAt: assignment.deadlineAt,
            status: 'active'
          }).save({ session })
        }
        const campaign = await new this.campaigns({
          type:
            input.templateCode === 'evaluation_reminder'
              ? 'reminder'
              : 'invitation',
          templateVersionId,
          assignmentIds: [assignment.id],
          idempotencyKey,
          idempotencyScopeKey: scopedKey,
          requestHash: payloadHash,
          createdBy: actor.id,
          status: 'queued',
          total: 1
        }).save({ session })
        const delivery = await new this.deliveries({
          campaignId: campaign.id,
          assignmentId: assignment.id,
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
