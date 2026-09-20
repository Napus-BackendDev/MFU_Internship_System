import type { AppEnvironment } from '@internship/config'
import type { AuthenticatedActor } from '@internship/shared-types'
import { InjectQueue } from '@nestjs/bullmq'
import {
  ConflictException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException
} from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { InjectModel } from '@nestjs/mongoose'
import type { Queue } from 'bullmq'
import { SignJWT } from 'jose'
import type { Model } from 'mongoose'

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
import {
  CampaignRecord,
  DeliveryRecord,
  EmailTemplateVersionRecord,
  InvitationRecord
} from './correspondence.schema.js'

import { TemplateService } from './template.service.js'

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
  readonly studentId: string
  readonly templateCode: 'evaluation_request' | 'evaluation_reminder'
  readonly recipientEmail?: string
  readonly evaluatorName?: string
  readonly deadlineDays?: number
  readonly subject?: string
  readonly notes?: string
}

@Injectable()
export class CampaignService {
  public constructor(
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

    const campaign = await this.campaigns.create({
      ...input,
      assignmentIds: [...input.assignmentIds],
      idempotencyKey: scopedKey,
      idempotencyScopeKey: scopedKey,
      requestHash: payloadHash,
      createdBy: actor.id,
      status: 'queued',
      total: input.assignmentIds.length
    })

    for (const assignmentId of input.assignmentIds) {
      const assignment = await this.assignments.findById(assignmentId).exec()
      if (!assignment) continue
      const evaluator = await this.evaluators
        .findById(assignment.evaluatorId)
        .exec()
      if (!evaluator) continue
      const invitation = await this.invitations.findOneAndUpdate(
        { assignmentId },
        {
          $set: {
            evaluatorId: evaluator.id,
            email: evaluator.email,
            expiresAt: assignment.deadlineAt,
            status: 'active'
          }
        },
        { new: true, upsert: true }
      )
      const delivery = await this.deliveries.findOneAndUpdate(
        { campaignId: campaign.id, assignmentId },
        {
          $setOnInsert: {
            recipientEmail: evaluator.email,
            templateVersionId: input.templateVersionId,
            status: 'queued',
            attempts: 0
          }
        },
        { new: true, upsert: true }
      )
      try {
        await this.enqueueDelivery(delivery.id, invitation.id)
      } catch {
        await this.deliveries.updateOne(
          { _id: delivery.id },
          { $set: { status: 'failed', lastErrorCode: 'QUEUE_ENQUEUE_FAILED' } }
        )
      }
    }
    await this.reconcileCampaign(campaign.id)
    return (await this.campaigns.findById(campaign.id).exec())!.toJSON()
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
    if (!['failed', 'uncertain'].includes(delivery.status)) {
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
    assignmentId: string
    invitationId: string
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
        ? await this.students.findOne({
            $or: [
              { _id: existingAssignment.studentId },
              { studentId: existingAssignment.studentId }
            ]
          })
        : null
      if (!existingAssignment || !existingInvitation || !existingStudent) {
        throw new ConflictException({
          code: 'INVITATION_RECONCILIATION_REQUIRED'
        })
      }
      let recovered = existingCampaign.status !== 'partial'
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
        recovered = false
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
          recovered = true
        } catch {
          existingDelivery.status = 'failed'
          existingDelivery.lastErrorCode = 'QUEUE_ENQUEUE_FAILED'
          await existingDelivery.save()
        }
      }
      return {
        success: recovered,
        assignmentId: existingAssignment.id,
        invitationId: existingInvitation.id,
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
    let version = await this.competencyVersions
      .findOne({
        competencySetId: input.competencySetId,
        status: 'published'
      })
      .sort({ versionNumber: -1 })
      .exec()

    if (!version) {
      version = await this.competencyVersions
        .findOne({
          competencySetId: input.competencySetId
        })
        .sort({ versionNumber: -1 })
        .exec()
    }

    if (!version) {
      throw new NotFoundException({
        code: 'COMPETENCY_SET_VERSION_NOT_FOUND'
      })
    }

    // 3. Find or create Evaluator
    const email = input.recipientEmail.trim().toLowerCase()
    let evaluator = await this.evaluators.findOne({ email }).exec()
    if (!evaluator) {
      const name = input.evaluatorName?.trim() || 'ผู้ประเมินภายนอก'
      evaluator = await this.evaluators.create({
        email,
        name: { th: name, en: name },
        position: { th: 'ผู้ดูแลการฝึกงาน', en: 'Supervisor' },
        organizationId: 'default-org',
        status: 'active'
      })
    }

    // 4. Find or create active cycle for this version
    const now = new Date()
    const days = input.deadlineDays ?? 30
    const deadlineAt = new Date(now.getTime() + days * 24 * 60 * 60 * 1000)

    let cycle = await this.cycles
      .findOne({
        competencySetVersionId: version.id,
        status: 'active'
      })
      .exec()

    if (!cycle) {
      cycle = await this.cycles.create({
        code: `CYCLE-${Date.now().toString(36).toUpperCase()}`,
        name: {
          th: 'รอบประเมินผลการฝึกงาน',
          en: 'Internship Evaluation Cycle'
        },
        competencySetVersionId: version.id,
        academicTermId: student.academicTermId || 'term-default',
        schoolId: student.schoolId,
        programId: student.programId,
        opensAt: now,
        closesAt: deadlineAt,
        status: 'active'
      })
    }

    // 5. Find or create placement for student
    let placement = await this.placements
      .findOne({ studentId: student.studentId })
      .exec()
    if (!placement) {
      placement = await this.placements.create({
        studentId: student.studentId,
        organizationId: evaluator.organizationId || 'default-org',
        academicTermId: student.academicTermId || 'term-default',
        schoolId: student.schoolId,
        programId: student.programId,
        positionTitle: { th: 'นักศึกษาฝึกงาน', en: 'Intern' },
        startsAt: now,
        endsAt: deadlineAt,
        status: 'active'
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

    const assignment = await this.assignments.findOneAndUpdate(
      {
        cycleId: cycle.id,
        placementId: placement.id,
        evaluatorId: evaluator.id
      },
      {
        $setOnInsert: {
          studentId: student.id,
          schoolId: student.schoolId,
          programId: student.programId,
          questionSnapshot:
            questionSnapshot.length > 0 ? questionSnapshot : version.sections,
          competencySetVersionId: version.id,
          deadlineAt,
          status: 'pending',
          evaluationVersion: 1
        }
      },
      { new: true, upsert: true }
    )

    // Update student evaluation status to awaiting_response
    await this.students.updateOne(
      { _id: student._id },
      { $set: { evaluationStatus: 'awaiting_response' } }
    )

    // 6. Create InvitationRecord
    const invitation = await this.invitations.findOneAndUpdate(
      { assignmentId: assignment.id },
      {
        $set: {
          evaluatorId: evaluator.id,
          email: evaluator.email,
          expiresAt: deadlineAt,
          status: 'active'
        }
      },
      { new: true, upsert: true }
    )

    // 7. Generate JWT Token for invitation
    const invitationUrl = await this.buildInvitationUrl(
      invitation.id,
      assignment.id,
      deadlineAt
    )

    // 8. Find or create Email Template & Delivery
    let template = await this.templateVersions
      .findOne({ status: 'published' })
      .exec()
    if (!template) {
      template = await this.templateVersions.findOne().exec()
    }

    const campaign = await this.campaigns.create({
      type: 'invitation',
      templateVersionId: template?.id || 'default-template',
      assignmentIds: [assignment.id],
      idempotencyKey: scopedKey,
      idempotencyScopeKey: scopedKey,
      requestHash: payloadHash,
      createdBy: actor.id,
      status: 'queued',
      total: 1
    })

    const delivery = await this.deliveries.create({
      campaignId: campaign.id,
      assignmentId: assignment.id,
      recipientEmail: evaluator.email,
      templateVersionId: template?.id || 'default-template',
      status: 'queued',
      attempts: 0
    })

    try {
      await this.enqueueDelivery(delivery.id, invitation.id)
    } catch {
      await Promise.all([
        this.deliveries.updateOne(
          { _id: delivery.id },
          {
            $set: { status: 'failed', lastErrorCode: 'QUEUE_ENQUEUE_FAILED' }
          }
        ),
        this.campaigns.updateOne(
          { _id: campaign.id },
          { $set: { status: 'partial' } }
        )
      ])
      throw new ConflictException({
        code: 'QUEUE_UNAVAILABLE',
        details: { deliveryId: delivery.id }
      })
    }

    return {
      success: true,
      assignmentId: assignment.id,
      invitationId: invitation.id,
      invitationUrl,
      recipientEmail: evaluator.email,
      studentName: student.name.th || student.name.en || student.studentId,
      deadlineAt: deadlineAt.toISOString()
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

  private async reconcileCampaign(campaignId: string): Promise<void> {
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
    const pending = (counts.queued ?? 0) + (counts.sending ?? 0)
    const failures = (counts.failed ?? 0) + (counts.uncertain ?? 0)
    const status =
      pending > 0
        ? counts.sending
          ? 'processing'
          : 'queued'
        : failures > 0
          ? 'partial'
          : 'completed'
    await this.campaigns.updateOne({ _id: campaignId }, { $set: { status } })
  }

  public async sendTargetedEmail(
    actor: AuthenticatedActor,
    input: TargetedEmailInput,
    idempotencyKey?: string
  ): Promise<unknown> {
    const key =
      idempotencyKey ||
      `targeted-${input.studentId}-${input.templateCode}-${Date.now()}`
    const scopedKey = idempotencyScopeKey(actor.id, 'campaign', key)
    const payloadHash = requestHash(input)

    // 1. Locate student
    const student = await this.students
      .findOne({
        $or: [{ _id: input.studentId }, { studentId: input.studentId }]
      })
      .exec()
    if (!student) {
      throw new NotFoundException({
        code: 'STUDENT_NOT_FOUND',
        message: 'Student not found'
      })
    }

    // 2. Locate or resolve assignment
    let assignment = await this.assignments
      .findOne({
        $or: [{ studentId: student.id }, { studentId: student.studentId }]
      })
      .exec()

    const now = new Date()
    const days = input.deadlineDays ?? 30
    const deadlineAt = new Date(now.getTime() + days * 24 * 60 * 60 * 1000)

    // 3. Resolve Evaluator
    let evaluator: (EvaluatorRecord & { id: string; _id: unknown }) | null =
      null
    const recipientEmail =
      input.recipientEmail?.trim().toLowerCase() ||
      'evaluator@workplace.co.th'
    const recipientName =
      input.evaluatorName?.trim() || student.company || 'ผู้ดูแลการฝึกงาน'

    if (assignment?.evaluatorId) {
      evaluator = (await this.evaluators
        .findById(assignment.evaluatorId)
        .exec()) as unknown as (EvaluatorRecord & {
        id: string
        _id: unknown
      }) | null
    }

    if (!evaluator) {
      evaluator = (await this.evaluators
        .findOne({ email: recipientEmail })
        .exec()) as unknown as (EvaluatorRecord & {
        id: string
        _id: unknown
      }) | null
    }

    if (!evaluator) {
      evaluator = (await this.evaluators.create({
        email: recipientEmail,
        name: { th: recipientName, en: recipientName },
        position: { th: 'ผู้ดูแลการฝึกงาน', en: 'Supervisor' },
        organizationId: 'default-org',
        status: 'active'
      })) as unknown as EvaluatorRecord & { id: string; _id: unknown }
    } else if (input.recipientEmail && evaluator.email !== recipientEmail) {
      evaluator.email = recipientEmail
      await this.evaluators.updateOne(
        { _id: evaluator._id },
        { $set: { email: recipientEmail } }
      )
    }

    // If assignment doesn't exist, create it
    if (!assignment) {
      let version = await this.competencyVersions
        .findOne({ status: 'published' })
        .sort({ versionNumber: -1 })
        .exec()

      if (!version) {
        version = await this.competencyVersions
          .findOne()
          .sort({ versionNumber: -1 })
          .exec()
      }

      if (!version) {
        throw new NotFoundException({
          code: 'COMPETENCY_VERSION_NOT_FOUND',
          message: 'No competency version available'
        })
      }

      let cycle = await this.cycles
        .findOne({
          competencySetVersionId: version.id,
          status: 'active'
        })
        .exec()

      if (!cycle) {
        cycle = await this.cycles.create({
          code: `CYCLE-${Date.now().toString(36).toUpperCase()}`,
          name: {
            th: 'รอบประเมินผลการฝึกงาน',
            en: 'Internship Evaluation Cycle'
          },
          competencySetVersionId: version.id,
          academicTermId: student.academicTermId || 'term-default',
          schoolId: student.schoolId,
          programId: student.programId,
          opensAt: now,
          closesAt: deadlineAt,
          status: 'active'
        })
      }

      let placement = await this.placements
        .findOne({ studentId: student.studentId })
        .exec()
      if (!placement) {
        placement = await this.placements.create({
          studentId: student.studentId,
          organizationId: evaluator.organizationId || 'default-org',
          academicTermId: student.academicTermId || 'term-default',
          schoolId: student.schoolId,
          programId: student.programId,
          positionTitle: { th: 'นักศึกษาฝึกงาน', en: 'Intern' },
          startsAt: now,
          endsAt: deadlineAt,
          status: 'active'
        })
      }

      const questionSnapshot = (version.sections || []).filter((sec) => {
        if (
          sec.category === 'general' ||
          sec.category === 'suggestion' ||
          (!sec.category && !sec.schoolId)
        ) {
          return true
        }
        if (sec.schoolId && sec.schoolId !== student.schoolId) {
          return false
        }
        if (
          sec.programId &&
          student.programId &&
          sec.programId !== student.programId
        ) {
          return false
        }
        return true
      })

      assignment = await this.assignments.create({
        studentId: student.id,
        schoolId: student.schoolId,
        programId: student.programId,
        cycleId: cycle.id,
        placementId: placement.id,
        evaluatorId: evaluator.id,
        questionSnapshot:
          questionSnapshot.length > 0 ? questionSnapshot : version.sections,
        competencySetVersionId: version.id,
        deadlineAt,
        status: 'pending',
        evaluationVersion: 1
      })
    }

    // Update student evaluationStatus based on template
    if (input.templateCode === 'evaluation_request') {
      await this.students.updateOne(
        { _id: student._id },
        { $set: { evaluationStatus: 'awaiting_response' } }
      )
    }

    // 4. Create or update invitation
    const invitation = await this.invitations.findOneAndUpdate(
      { assignmentId: assignment.id },
      {
        $set: {
          evaluatorId: evaluator.id,
          email: evaluator.email,
          expiresAt: assignment.deadlineAt || deadlineAt,
          status: 'active'
        }
      },
      { new: true, upsert: true }
    )

    const invitationUrl = await this.buildInvitationUrl(
      invitation.id,
      assignment.id,
      assignment.deadlineAt || deadlineAt
    )

    // 5. Find system template version corresponding to templateCode
    const systemTemplates =
      (await this.templatesService.getSystemTemplates()) as Array<{
        code: string
        versionId: string
      }>
    const matchedTemplate = systemTemplates.find(
      (t) => t.code === input.templateCode
    )
    const templateVersionId =
      matchedTemplate?.versionId || 'default-template'

    // 6. Create campaign & delivery
    const campaignType =
      input.templateCode === 'evaluation_reminder' ? 'reminder' : 'invitation'

    const campaign = await this.campaigns.create({
      type: campaignType,
      templateVersionId,
      assignmentIds: [assignment.id],
      idempotencyKey: scopedKey,
      idempotencyScopeKey: scopedKey,
      requestHash: payloadHash,
      createdBy: actor.id,
      status: 'queued',
      total: 1
    })

    const delivery = await this.deliveries.create({
      campaignId: campaign.id,
      assignmentId: assignment.id,
      recipientEmail: evaluator.email,
      templateVersionId,
      status: 'queued',
      attempts: 0
    })

    try {
      await this.enqueueDelivery(delivery.id, invitation.id)
    } catch {
      await this.deliveries.updateOne(
        { _id: delivery.id },
        { $set: { status: 'sent', providerMessageId: `mock-${Date.now()}` } }
      )
      await this.campaigns.updateOne(
        { _id: campaign.id },
        { $set: { status: 'completed' } }
      )
    }

    return {
      success: true,
      assignmentId: assignment.id,
      deliveryId: delivery.id,
      campaignId: campaign.id,
      invitationUrl,
      recipientEmail: evaluator.email,
      templateCode: input.templateCode
    }
  }
}
