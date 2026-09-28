import { MongoMemoryReplSet } from 'mongodb-memory-server-core'
import { createConnection, type Connection, type Model } from 'mongoose'
import type { AppEnvironment } from '@internship/config'
import type { ConfigService } from '@nestjs/config'
import type { Queue } from 'bullmq'
import type { AuthenticatedActor } from '@internship/shared-types'
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi
} from 'vitest'

import { AuditLogRecord, AuditLogSchema } from '../src/audit/audit.schema.js'
import { AuditService } from '../src/audit/audit.service.js'
import { SessionRecord, SessionSchema } from '../src/auth/user.schema.js'
import {
  CompetencySetRecord,
  CompetencySetSchema,
  CompetencyVersionRecord,
  CompetencyVersionSchema,
  EvaluationAssignmentRecord,
  EvaluationAssignmentSchema,
  EvaluationCycleRecord,
  EvaluationCycleSchema
} from '../src/evaluations/evaluation.schema.js'
import {
  PlacementRecord,
  PlacementSchema,
  EvaluatorRecord,
  EvaluatorSchema,
  StudentRecord,
  StudentSchema
} from '../src/members/members.schema.js'
import { CampaignService } from '../src/correspondence/campaign.service.js'
import {
  CampaignRecord,
  CampaignSchema,
  DeliveryRecord,
  DeliverySchema,
  DeliveryRetryRequestRecord,
  DeliveryRetryRequestSchema,
  EmailTemplateVersionRecord,
  EmailTemplateVersionSchema,
  InvitationRecord,
  InvitationSchema
} from '../src/correspondence/correspondence.schema.js'
import type { TemplateService } from '../src/correspondence/template.service.js'

describe('campaign outbox on an isolated MongoDB replica set', () => {
  let replicaSet: MongoMemoryReplSet
  let connection: Connection
  let service: CampaignService
  let campaigns: Model<CampaignRecord>
  let deliveries: Model<DeliveryRecord>
  let deliveryRetryRequests: Model<DeliveryRetryRequestRecord>
  let invitations: Model<InvitationRecord>
  let assignments: Model<EvaluationAssignmentRecord>
  let cycles: Model<EvaluationCycleRecord>
  let evaluators: Model<EvaluatorRecord>
  let students: Model<StudentRecord>
  let placements: Model<PlacementRecord>
  let competencySets: Model<CompetencySetRecord>
  let competencyVersions: Model<CompetencyVersionRecord>
  let templateVersions: Model<EmailTemplateVersionRecord>
  let sessions: Model<SessionRecord>
  let auditLogs: Model<AuditLogRecord>
  let auditService: AuditService
  let templateService: TemplateService
  let ensureSystemTemplateVersion: TemplateService['ensureSystemTemplateVersion']
  let queueAdd: ReturnType<typeof vi.fn>
  let failDeliverySave = false
  let publicWebUrl: string | undefined = 'https://internship.example.test'
  let actor: AuthenticatedActor
  let assignmentId: string
  let studentId: string
  let evaluatorId: string
  let templateVersionId: string

  beforeAll(async () => {
    replicaSet = await MongoMemoryReplSet.create({
      binary: {
        ...(process.env.TEST_MONGODB_SYSTEM_BINARY
          ? { systemBinary: process.env.TEST_MONGODB_SYSTEM_BINARY }
          : {}),
        ...(process.platform === 'win32' && process.arch === 'arm64'
          ? { arch: 'x64' as const }
          : {}),
        version: process.env.TEST_MONGODB_VERSION ?? '8.0.28'
      },
      replSet: { count: 1, storageEngine: 'wiredTiger' }
    })
    connection = await createConnection(replicaSet.getUri()).asPromise()

    const faultableDeliverySchema = DeliverySchema.clone()
    faultableDeliverySchema.pre('save', function () {
      if (failDeliverySave)
        throw new Error('injected delivery persistence fault')
    })
    campaigns = connection.model(CampaignRecord.name, CampaignSchema)
    deliveries = connection.model(DeliveryRecord.name, faultableDeliverySchema)
    deliveryRetryRequests = connection.model(
      DeliveryRetryRequestRecord.name,
      DeliveryRetryRequestSchema
    )
    invitations = connection.model(InvitationRecord.name, InvitationSchema)
    assignments = connection.model(
      EvaluationAssignmentRecord.name,
      EvaluationAssignmentSchema
    )
    cycles = connection.model(EvaluationCycleRecord.name, EvaluationCycleSchema)
    evaluators = connection.model(EvaluatorRecord.name, EvaluatorSchema)
    students = connection.model(StudentRecord.name, StudentSchema)
    placements = connection.model(PlacementRecord.name, PlacementSchema)
    competencySets = connection.model(
      CompetencySetRecord.name,
      CompetencySetSchema
    )
    competencyVersions = connection.model(
      CompetencyVersionRecord.name,
      CompetencyVersionSchema
    )
    templateVersions = connection.model(
      EmailTemplateVersionRecord.name,
      EmailTemplateVersionSchema
    )
    sessions = connection.model(SessionRecord.name, SessionSchema)
    auditLogs = connection.model(AuditLogRecord.name, AuditLogSchema)
    auditService = new AuditService(auditLogs)

    queueAdd = vi.fn().mockRejectedValue(new Error('queue unavailable'))
    const queue = { add: queueAdd } as unknown as Queue
    ensureSystemTemplateVersion = () => Promise.resolve(templateVersionId)
    templateService = {
      ensureSystemTemplateVersion
    } as unknown as TemplateService
    service = new CampaignService(
      connection,
      {
        get: vi.fn((key: string) =>
          key === 'AUTH_JWT_SECRET'
            ? 'isolated-outbox-test-secret-at-least-32-bytes'
            : key === 'PUBLIC_WEB_URL'
              ? publicWebUrl
              : undefined
        )
      } as unknown as ConfigService<AppEnvironment, true>,
      templateService,
      queue,
      campaigns,
      deliveries,
      deliveryRetryRequests,
      invitations,
      templateVersions,
      assignments,
      evaluators,
      students,
      placements,
      competencySets,
      competencyVersions,
      cycles,
      sessions,
      auditService
    )

    await Promise.all([
      campaigns.init(),
      deliveries.init(),
      deliveryRetryRequests.init(),
      invitations.init(),
      assignments.init(),
      cycles.init(),
      evaluators.init(),
      students.init(),
      placements.init(),
      competencySets.init(),
      competencyVersions.init(),
      templateVersions.init(),
      sessions.init(),
      auditLogs.init()
    ])
  }, 180_000)

  afterAll(async () => {
    await connection?.close()
    await replicaSet?.stop()
  }, 30_000)

  beforeEach(async () => {
    failDeliverySave = false
    publicWebUrl = 'https://internship.example.test'
    queueAdd.mockClear()
    queueAdd.mockRejectedValue(new Error('queue unavailable'))
    await Promise.all([
      campaigns.deleteMany({}),
      deliveries.deleteMany({}),
      deliveryRetryRequests.deleteMany({}),
      invitations.deleteMany({}),
      assignments.deleteMany({}),
      cycles.deleteMany({}),
      evaluators.deleteMany({}),
      students.deleteMany({}),
      placements.deleteMany({}),
      competencySets.deleteMany({}),
      competencyVersions.deleteMany({}),
      templateVersions.deleteMany({}),
      sessions.deleteMany({}),
      auditLogs.deleteMany({})
    ])

    const competencySet = await competencySets.create({
      code: 'OUTBOX',
      name: { th: 'ทดสอบ', en: 'Test' }
    })
    const competencyVersion = await competencyVersions.create({
      competencySetId: competencySet.id,
      versionNumber: 1,
      status: 'published',
      sections: [
        {
          id: 'general',
          title: { th: 'ทักษะทั่วไป', en: 'General skills' },
          category: 'general',
          questions: [
            {
              id: 'question-1',
              label: { th: 'ทักษะ', en: 'Skill' },
              type: 'rating',
              required: true,
              scaleMin: 1,
              scaleMax: 5
            }
          ]
        }
      ]
    })
    const cycle = await cycles.create({
      code: 'cycle-outbox',
      name: { th: 'รอบทดสอบ', en: 'Test cycle' },
      competencySetVersionId: competencyVersion.id,
      academicTermId: 'term-outbox',
      opensAt: new Date(Date.now() - 60_000),
      closesAt: new Date(Date.now() + 3_600_000),
      status: 'active'
    })
    const evaluator = await evaluators.create({
      organizationId: 'organization-outbox',
      email: 'evaluator@example.test',
      name: { th: 'ผู้ประเมิน', en: 'Evaluator' },
      position: { th: 'ผู้จัดการ', en: 'Manager' },
      status: 'active'
    })
    evaluatorId = evaluator.id
    const student = await students.create({
      studentId: 'student-outbox',
      name: { th: 'นักศึกษาทดสอบ', en: 'Test student' },
      email: 'student@example.test',
      schoolId: 'school-outbox',
      programId: 'program-outbox',
      academicTermId: 'term-outbox',
      status: 'active'
    })
    await placements.create({
      studentId: student.id,
      organizationId: 'organization-outbox',
      academicTermId: 'term-outbox',
      schoolId: 'school-outbox',
      programId: 'program-outbox',
      positionTitle: { th: 'นักศึกษาฝึกงาน', en: 'Intern' },
      startsAt: new Date(Date.now() - 60_000),
      endsAt: new Date(Date.now() + 3_600_000),
      status: 'active'
    })
    const assignment = await assignments.create({
      cycleId: cycle.id,
      placementId: 'placement-outbox',
      evaluatorId: evaluator.id,
      studentId: student.id,
      schoolId: 'school-outbox',
      programId: 'program-outbox',
      questionSnapshot: [],
      competencySetVersionId: competencyVersion.id,
      deadlineAt: new Date(Date.now() + 1_800_000),
      status: 'pending'
    })
    const template = await templateVersions.create({
      templateId: 'template-outbox',
      versionNumber: 1,
      status: 'published',
      subject: 'Evaluation request',
      html: '<p>Request</p>',
      text: 'Request',
      placeholders: []
    })
    assignmentId = assignment.id
    studentId = student.id
    templateVersionId = template.id
    actor = {
      id: 'staff-outbox',
      email: 'staff@example.test',
      displayName: 'Test staff',
      roles: ['systemAdmin'],
      scope: {
        tenant: true,
        schoolIds: [],
        programIds: []
      }
    }
  })

  it('filters scoped deliveries and returns only masked recipient metadata', async () => {
    await deliveries.create({
      campaignId: 'campaign-delivery-list',
      assignmentId,
      recipientEmail: 'alice.smith@example.test',
      templateVersionId,
      status: 'uncertain',
      attempts: 2,
      providerMessageId: 'private-provider-id',
      processingToken: 'private-worker-token'
    })
    await deliveries.create({
      campaignId: 'campaign-delivery-list-other',
      assignmentId,
      recipientEmail: 'bob@example.test',
      templateVersionId,
      status: 'failed',
      attempts: 1
    })

    const page = (await service.listDeliveries(actor, {
      page: 1,
      pageSize: 10,
      status: 'uncertain'
    })) as {
      items: readonly Record<string, unknown>[]
      meta: { total: number }
    }

    expect(page.meta.total).toBe(1)
    expect(page.items).toHaveLength(1)
    expect(page.items[0]).toMatchObject({
      recipientMasked: 'a***@example.test',
      status: 'uncertain',
      attempts: 2
    })
    expect(page.items[0]).toHaveProperty('assignmentId', assignmentId)
    expect(page.items[0]).not.toHaveProperty('recipientEmail')
    expect(page.items[0]).not.toHaveProperty('providerMessageId')
    expect(page.items[0]).not.toHaveProperty('processingToken')
  })

  it('does not expose delivery rows to summary-only Coordinator scope', async () => {
    const coordinator: AuthenticatedActor = {
      ...actor,
      roles: ['coordinator'],
      roleScopes: [
        {
          role: 'coordinator',
          tenant: false,
          schoolIds: ['school-outbox'],
          programIds: ['program-outbox']
        }
      ]
    }

    await expect(
      service.listDeliveries(coordinator, { page: 1, pageSize: 10 })
    ).rejects.toMatchObject({ status: 403 })
  })

  it('returns only campaign summary fields to Coordinator scope', async () => {
    const campaign = await campaigns.create({
      idempotencyKey: 'hashed-idempotency-key',
      idempotencyScopeKey: 'hashed-idempotency-scope',
      requestHash: 'hashed-request-payload',
      type: 'invitation',
      templateVersionId,
      assignmentIds: [assignmentId],
      createdBy: actor.id,
      status: 'completed',
      total: 1
    })
    await deliveries.create({
      campaignId: campaign.id,
      assignmentId,
      recipientEmail: 'evaluator@example.test',
      templateVersionId,
      status: 'sent',
      attempts: 1
    })
    const coordinator: AuthenticatedActor = {
      ...actor,
      roles: ['coordinator'],
      scope: {
        tenant: false,
        schoolIds: ['school-outbox'],
        programIds: ['program-outbox']
      },
      roleScopes: [
        {
          role: 'coordinator',
          tenant: false,
          schoolIds: ['school-outbox'],
          programIds: ['program-outbox']
        }
      ]
    }

    const response = (await service.get(coordinator, campaign.id)) as Record<
      string,
      unknown
    >

    expect(response).toMatchObject({
      id: campaign.id,
      type: 'invitation',
      status: 'completed',
      total: 1,
      deliverySummary: [{ status: 'sent', count: 1 }]
    })
    expect(Object.keys(response).sort()).toEqual(
      ['deliverySummary', 'id', 'status', 'total', 'type'].sort()
    )
  })

  it('hides a campaign summary if any assignment is outside Coordinator scope', async () => {
    const baseAssignment = await assignments.findById(assignmentId).exec()
    if (!baseAssignment) throw new Error('Expected base assignment')
    const outsideStudent = await students.create({
      studentId: 'student-campaign-outside-scope',
      name: { th: 'นักศึกษานอกขอบเขต', en: 'Out-of-scope student' },
      email: 'student-campaign-outside-scope@example.test',
      schoolId: 'school-other',
      programId: 'program-other',
      academicTermId: 'term-outbox',
      status: 'active'
    })
    const outsideAssignment = await assignments.create({
      cycleId: baseAssignment.cycleId,
      placementId: 'placement-campaign-outside-scope',
      evaluatorId: baseAssignment.evaluatorId,
      studentId: outsideStudent.id,
      schoolId: 'school-other',
      programId: 'program-other',
      questionSnapshot: [],
      competencySetVersionId: baseAssignment.competencySetVersionId,
      deadlineAt: baseAssignment.deadlineAt,
      status: 'pending'
    })
    const campaign = await campaigns.create({
      idempotencyKey: 'private-idempotency-key',
      idempotencyScopeKey: 'private-idempotency-scope',
      requestHash: 'private-request-hash',
      type: 'invitation',
      templateVersionId,
      assignmentIds: [assignmentId, outsideAssignment.id],
      createdBy: actor.id,
      status: 'completed',
      total: 2
    })
    const coordinator: AuthenticatedActor = {
      ...actor,
      roles: ['coordinator'],
      scope: {
        tenant: false,
        schoolIds: ['school-outbox'],
        programIds: ['program-outbox']
      },
      roleScopes: [
        {
          role: 'coordinator',
          tenant: false,
          schoolIds: ['school-outbox'],
          programIds: ['program-outbox']
        }
      ]
    }

    await expect(service.get(coordinator, campaign.id)).rejects.toMatchObject({
      status: 404
    })
  })

  it('persists retry idempotency and audits one accepted retry', async () => {
    queueAdd.mockResolvedValue(undefined)
    const delivery = await deliveries.create({
      campaignId: 'campaign-retry-idempotent',
      assignmentId,
      recipientEmail: 'evaluator@example.test',
      templateVersionId,
      status: 'failed',
      attempts: 1
    })
    await invitations.create({
      assignmentId,
      evaluatorId,
      email: 'evaluator@example.test',
      expiresAt: new Date(Date.now() + 60_000),
      status: 'active'
    })
    const idempotencyKey = 'retry-delivery-idempotency-001'

    const first = (await service.retry(
      actor,
      delivery.id,
      idempotencyKey,
      'request-retry-first'
    )) as Record<string, unknown>
    const replay = (await service.retry(
      actor,
      delivery.id,
      idempotencyKey,
      'request-retry-replay'
    )) as Record<string, unknown>

    expect(first).toMatchObject({ status: 'queued', attempts: 1 })
    expect(first).not.toHaveProperty('recipientEmail')
    expect(replay).toMatchObject({ id: delivery.id, status: 'queued' })
    expect(queueAdd).toHaveBeenCalledTimes(2)
    expect(queueAdd.mock.calls[0]?.[2]).toMatchObject({
      jobId: `delivery-${delivery.id}-retry-2`
    })
    expect(queueAdd.mock.calls[1]?.[2]).toMatchObject({
      jobId: `delivery-${delivery.id}-retry-2`
    })
    await expect(deliveryRetryRequests.countDocuments({})).resolves.toBe(1)
    await expect(
      auditLogs.countDocuments({
        action: 'correspondence.delivery_retry_requested'
      })
    ).resolves.toBe(1)

    const otherDelivery = await deliveries.create({
      campaignId: 'campaign-retry-other-resource',
      assignmentId,
      recipientEmail: 'evaluator@example.test',
      templateVersionId,
      status: 'failed',
      attempts: 1
    })
    await expect(
      service.retry(actor, otherDelivery.id, idempotencyKey)
    ).rejects.toMatchObject({
      status: 409,
      response: { code: 'IDEMPOTENCY_KEY_REUSED' }
    })
  })

  it('keeps retry intent queued when BullMQ enqueue is unavailable', async () => {
    const delivery = await deliveries.create({
      campaignId: 'campaign-retry-queue-offline',
      assignmentId,
      recipientEmail: 'evaluator@example.test',
      templateVersionId,
      status: 'failed',
      attempts: 1
    })
    await invitations.create({
      assignmentId,
      evaluatorId,
      email: 'evaluator@example.test',
      expiresAt: new Date(Date.now() + 60_000),
      status: 'active'
    })

    const accepted = (await service.retry(
      actor,
      delivery.id,
      'retry-queue-unavailable-001'
    )) as Record<string, unknown>

    expect(accepted).toMatchObject({ id: delivery.id, status: 'queued' })
    await expect(
      deliveries.findById(delivery.id).lean().exec()
    ).resolves.toMatchObject({ status: 'queued' })
    await expect(
      deliveryRetryRequests.countDocuments({ deliveryId: delivery.id })
    ).resolves.toBe(1)
  })

  it('rolls back retry intent and delivery state when retry audit fails', async () => {
    const delivery = await deliveries.create({
      campaignId: 'campaign-retry-audit-fails',
      assignmentId,
      recipientEmail: 'evaluator@example.test',
      templateVersionId,
      status: 'failed',
      attempts: 1
    })
    await invitations.create({
      assignmentId,
      evaluatorId,
      email: 'evaluator@example.test',
      expiresAt: new Date(Date.now() + 60_000),
      status: 'active'
    })
    const auditWrite = vi
      .spyOn(auditService, 'record')
      .mockRejectedValue(new Error('simulated retry audit failure'))

    try {
      await expect(
        service.retry(actor, delivery.id, 'retry-audit-failure-001')
      ).rejects.toThrow('simulated retry audit failure')
    } finally {
      auditWrite.mockRestore()
    }

    await expect(
      deliveries.findById(delivery.id).lean().exec()
    ).resolves.toMatchObject({ status: 'failed' })
    await expect(
      deliveryRetryRequests.countDocuments({ deliveryId: delivery.id })
    ).resolves.toBe(0)
    expect(queueAdd).not.toHaveBeenCalled()
  })

  it('never serializes plaintext invitation PINs or their hashes', async () => {
    const invitation = await invitations.create({
      assignmentId,
      evaluatorId: 'evaluator-pin-redaction',
      email: 'evaluator@example.test',
      expiresAt: new Date(Date.now() + 60_000),
      accessPin: 'DO-NOT-EXPOSE',
      accessPinHash: 'private-hash'
    })
    const explicitlySelected = await invitations
      .findById(invitation.id)
      .select('+accessPin +accessPinHash')
      .exec()

    expect(explicitlySelected?.accessPin).toBe('DO-NOT-EXPOSE')
    expect(explicitlySelected?.toJSON()).not.toHaveProperty('accessPin')
    expect(explicitlySelected?.toJSON()).not.toHaveProperty('accessPinHash')
  })

  it('does not send a campaign using a separate Coordinator scope', async () => {
    const baseAssignment = await assignments.findById(assignmentId).exec()
    if (!baseAssignment) throw new Error('Expected base assignment')
    const outOfStaffScopeStudent = await students.create({
      studentId: 'student-coordinator-only',
      name: { th: 'นักศึกษานอกขอบเขต', en: 'Out-of-scope student' },
      email: 'student-coordinator-only@example.test',
      schoolId: 'school-b',
      programId: 'program-b',
      academicTermId: 'term-outbox',
      status: 'active'
    })
    await placements.create({
      studentId: outOfStaffScopeStudent.id,
      organizationId: 'organization-outbox',
      academicTermId: 'term-outbox',
      schoolId: 'school-b',
      programId: 'program-b',
      positionTitle: { th: 'นักศึกษาฝึกงาน', en: 'Intern' },
      startsAt: new Date(Date.now() - 60_000),
      endsAt: new Date(Date.now() + 3_600_000),
      status: 'active'
    })
    const outOfStaffScopeAssignment = await assignments.create({
      cycleId: baseAssignment.cycleId,
      placementId: 'placement-coordinator-only',
      evaluatorId: baseAssignment.evaluatorId,
      studentId: outOfStaffScopeStudent.id,
      schoolId: 'school-b',
      programId: 'program-b',
      questionSnapshot: [],
      competencySetVersionId: baseAssignment.competencySetVersionId,
      deadlineAt: baseAssignment.deadlineAt,
      status: 'pending'
    })
    const multiRoleActor: AuthenticatedActor = {
      ...actor,
      roles: ['internshipStaff', 'coordinator'],
      scope: {
        tenant: false,
        schoolIds: ['school-outbox', 'school-b'],
        programIds: ['program-outbox', 'program-b']
      },
      roleScopes: [
        {
          role: 'internshipStaff',
          tenant: false,
          schoolIds: ['school-outbox'],
          programIds: ['program-outbox']
        },
        {
          role: 'coordinator',
          tenant: false,
          schoolIds: ['school-b'],
          programIds: ['program-b']
        }
      ]
    }

    await expect(
      service.create(
        multiRoleActor,
        {
          type: 'invitation',
          templateVersionId,
          assignmentIds: [outOfStaffScopeAssignment.id]
        },
        'cross-role-campaign-key-0001'
      )
    ).rejects.toMatchObject({
      status: 422,
      response: { code: 'CAMPAIGN_PREVIEW_INVALID' }
    })
    await expect(campaigns.countDocuments({})).resolves.toBe(0)
    await expect(invitations.countDocuments({})).resolves.toBe(0)
    await expect(deliveries.countDocuments({})).resolves.toBe(0)
    expect(queueAdd).not.toHaveBeenCalled()
    await expect(
      service.preview(multiRoleActor, {
        type: 'invitation',
        templateVersionId,
        assignmentIds: [assignmentId]
      })
    ).resolves.toMatchObject({ valid: true, eligible: 1 })

    const competencySet = await competencySets
      .findOne({ code: 'OUTBOX' })
      .exec()
    if (!competencySet) throw new Error('Expected published competency set')
    await expect(
      service.sendStudentInvitation(
        multiRoleActor,
        {
          studentId: outOfStaffScopeStudent.studentId,
          competencySetId: competencySet.code,
          recipientEmail: 'evaluator@example.test'
        },
        'cross-role-direct-invitation-key-0001'
      )
    ).rejects.toMatchObject({
      status: 404,
      response: { code: 'STUDENT_NOT_FOUND' }
    })
    await expect(
      service.sendTargetedEmail(
        multiRoleActor,
        {
          assignmentId: outOfStaffScopeAssignment.id,
          studentId: outOfStaffScopeStudent.studentId,
          templateCode: 'evaluation_request'
        },
        'cross-role-targeted-email-key-0001'
      )
    ).rejects.toMatchObject({ status: 404 })
    await expect(
      service.reissueInvitation(
        multiRoleActor,
        outOfStaffScopeAssignment.id,
        { reason: 'Rotate invitation outside the Staff scope' },
        'cross-role-reissue-key-0001'
      )
    ).rejects.toMatchObject({ status: 404 })
    await expect(campaigns.countDocuments({})).resolves.toBe(0)
    await expect(invitations.countDocuments({})).resolves.toBe(0)
    await expect(deliveries.countDocuments({})).resolves.toBe(0)
    expect(queueAdd).not.toHaveBeenCalled()
  })

  it('commits campaign, invitation, and delivery before best-effort queueing', async () => {
    const result = (await service.create(
      actor,
      {
        type: 'invitation',
        templateVersionId,
        assignmentIds: [assignmentId]
      },
      'outbox-key-0001'
    )) as { id: string; status: string }

    expect(result.status).toBe('queued')
    expect(await campaigns.countDocuments({ _id: result.id })).toBe(1)
    expect(await invitations.countDocuments({ assignmentId })).toBe(1)
    expect(
      await deliveries.countDocuments({
        campaignId: result.id,
        status: 'queued'
      })
    ).toBe(1)
    expect(queueAdd).toHaveBeenCalledTimes(1)
  })

  it('sends a reminder to a pending assignment with the same active invitation', async () => {
    const assignment = await assignments.findById(assignmentId).orFail().exec()
    const invitation = await invitations.create({
      assignmentId,
      evaluatorId,
      email: 'evaluator@example.test',
      expiresAt: assignment.deadlineAt,
      version: 3,
      status: 'active'
    })

    const result = (await service.sendTargetedEmail(
      actor,
      {
        assignmentId,
        studentId,
        templateCode: 'evaluation_reminder'
      },
      'targeted-reminder-pending-0001'
    )) as {
      status: string
      campaignId: string
      deliveryId: string
      invitationId: string
    }

    expect(result).toMatchObject({
      status: 'queued',
      assignmentId,
      invitationId: invitation.id
    })
    expect(result.deliveryId).toMatch(/^[a-f\d]{24}$/i)
    expect(
      await assignments
        .findById(assignmentId)
        .select('status deadlineAt')
        .lean()
    ).toMatchObject({ status: 'pending', deadlineAt: assignment.deadlineAt })
    expect(await invitations.findById(invitation.id).lean()).toMatchObject({
      version: 3,
      expiresAt: assignment.deadlineAt,
      status: 'active'
    })
    expect(await campaigns.findById(result.campaignId).lean()).toMatchObject({
      type: 'reminder',
      assignmentIds: [assignmentId]
    })
    expect(await deliveries.findById(result.deliveryId).lean()).toMatchObject({
      assignmentId,
      recipientEmail: invitation.email,
      status: 'queued'
    })
    expect(queueAdd).toHaveBeenCalledTimes(1)
  })

  it('rechecks the cycle inside the transaction before creating an outbox', async () => {
    const assignment = await assignments.findById(assignmentId).exec()
    if (!assignment) throw new Error('Expected seeded assignment')

    const runTransaction = connection.transaction.bind(connection)
    const transactionSpy = vi.spyOn(connection, 'transaction')
    transactionSpy.mockImplementation(async (callback, options) => {
      await cycles.updateOne(
        { _id: assignment.cycleId },
        { $set: { status: 'closed' } }
      )
      return runTransaction(callback, options)
    })

    try {
      await expect(
        service.create(
          actor,
          {
            type: 'invitation',
            templateVersionId,
            assignmentIds: [assignmentId]
          },
          'outbox-cycle-close-race-0001'
        )
      ).rejects.toMatchObject({
        status: 409,
        response: { code: 'CYCLE_NOT_OPEN' }
      })
    } finally {
      transactionSpy.mockRestore()
    }

    await expect(campaigns.countDocuments({})).resolves.toBe(0)
    await expect(invitations.countDocuments({})).resolves.toBe(0)
    await expect(deliveries.countDocuments({})).resolves.toBe(0)
    expect(queueAdd).not.toHaveBeenCalled()
  })

  it('rolls back all outbox records when delivery persistence fails', async () => {
    failDeliverySave = true

    await expect(
      service.create(
        actor,
        {
          type: 'invitation',
          templateVersionId,
          assignmentIds: [assignmentId]
        },
        'outbox-key-0002'
      )
    ).rejects.toThrow('injected delivery persistence fault')

    expect(await campaigns.countDocuments({})).toBe(0)
    expect(await invitations.countDocuments({})).toBe(0)
    expect(await deliveries.countDocuments({})).toBe(0)
    expect(queueAdd).not.toHaveBeenCalled()
  })

  it('replays a concurrent campaign request with the same idempotency key', async () => {
    const input = {
      type: 'invitation' as const,
      templateVersionId,
      assignmentIds: [assignmentId]
    }
    const [first, second] = await Promise.all([
      service.create(actor, input, 'concurrent-key-0001'),
      service.create(actor, input, 'concurrent-key-0001')
    ])

    expect((first as { id: string }).id).toBe((second as { id: string }).id)
    expect(await campaigns.countDocuments({})).toBe(1)
    expect(await invitations.countDocuments({})).toBe(1)
    expect(await deliveries.countDocuments({})).toBe(1)
  })

  it('replays after a concurrent invitation commits during preflight', async () => {
    const input = {
      type: 'invitation' as const,
      templateVersionId,
      assignmentIds: [assignmentId]
    }
    let previewCalls = 0
    let signalFirstPreview!: () => void
    let signalSecondPreview!: () => void
    let releaseFirstPreview!: () => void
    let releaseSecondPreview!: () => void
    const firstPreviewStarted = new Promise<void>((resolve) => {
      signalFirstPreview = resolve
    })
    const secondPreviewStarted = new Promise<void>((resolve) => {
      signalSecondPreview = resolve
    })
    const firstPreviewGate = new Promise<void>((resolve) => {
      releaseFirstPreview = resolve
    })
    const secondPreviewGate = new Promise<void>((resolve) => {
      releaseSecondPreview = resolve
    })
    const originalPreview = service.preview.bind(service)
    const previewSpy = vi
      .spyOn(service, 'preview')
      .mockImplementation(async (...args) => {
        previewCalls += 1
        if (previewCalls === 1) {
          signalFirstPreview()
          await firstPreviewGate
        } else {
          signalSecondPreview()
          await secondPreviewGate
        }
        return originalPreview(...args)
      })

    const first = service.create(actor, input, 'preflight-race-key-0001')
    await firstPreviewStarted
    const second = service.create(actor, input, 'preflight-race-key-0001')
    await secondPreviewStarted

    try {
      releaseFirstPreview()
      const firstResult = (await first) as { id: string }
      releaseSecondPreview()
      const secondResult = (await second) as { id: string }

      expect(secondResult.id).toBe(firstResult.id)
      expect(await campaigns.countDocuments({})).toBe(1)
      expect(await invitations.countDocuments({})).toBe(1)
      expect(await deliveries.countDocuments({})).toBe(1)
    } finally {
      releaseFirstPreview()
      releaseSecondPreview()
      previewSpy.mockRestore()
    }
  })

  it('replays a targeted invitation when the first send commits during preflight', async () => {
    let templateCalls = 0
    let signalFirstTemplate!: () => void
    let signalSecondTemplate!: () => void
    let releaseFirstTemplate!: () => void
    let releaseSecondTemplate!: () => void
    const firstTemplateStarted = new Promise<void>((resolve) => {
      signalFirstTemplate = resolve
    })
    const secondTemplateStarted = new Promise<void>((resolve) => {
      signalSecondTemplate = resolve
    })
    const firstTemplateGate = new Promise<void>((resolve) => {
      releaseFirstTemplate = resolve
    })
    const secondTemplateGate = new Promise<void>((resolve) => {
      releaseSecondTemplate = resolve
    })
    const originalEnsure = ensureSystemTemplateVersion
    const ensureSpy = vi
      .spyOn(templateService, 'ensureSystemTemplateVersion')
      .mockImplementation(async (code) => {
        templateCalls += 1
        if (templateCalls === 1) {
          signalFirstTemplate()
          await firstTemplateGate
        } else {
          signalSecondTemplate()
          await secondTemplateGate
        }
        return originalEnsure(code)
      })
    const input = {
      assignmentId,
      studentId,
      templateCode: 'evaluation_request' as const
    }
    const first = service.sendTargetedEmail(
      actor,
      input,
      'targeted-race-key-0001'
    )

    await vi.waitFor(() => expect(templateCalls).toBe(1))
    await firstTemplateStarted
    const second = service.sendTargetedEmail(
      actor,
      input,
      'targeted-race-key-0001'
    )
    await vi.waitFor(() => expect(templateCalls).toBe(2))
    await secondTemplateStarted

    try {
      releaseFirstTemplate()
      const firstResult = (await first) as {
        campaignId: string
        deliveryId: string
      }
      releaseSecondTemplate()
      const secondResult = (await second) as {
        campaignId: string
        deliveryId: string
      }

      expect(secondResult).toMatchObject(firstResult)
      expect(await campaigns.countDocuments({})).toBe(1)
      expect(await invitations.countDocuments({ assignmentId })).toBe(1)
      expect(await deliveries.countDocuments({})).toBe(1)
      expect(queueAdd).toHaveBeenCalledTimes(1)
    } finally {
      releaseFirstTemplate()
      releaseSecondTemplate()
      ensureSpy.mockRestore()
    }
  })

  it('rolls back targeted invitation, campaign, and delivery as one unit', async () => {
    failDeliverySave = true

    await expect(
      service.sendTargetedEmail(
        actor,
        {
          assignmentId,
          studentId,
          templateCode: 'evaluation_request'
        },
        'targeted-key-0001'
      )
    ).rejects.toThrow('injected delivery persistence fault')

    expect(await campaigns.countDocuments({})).toBe(0)
    expect(await invitations.countDocuments({})).toBe(0)
    expect(await deliveries.countDocuments({})).toBe(0)
    expect(queueAdd).not.toHaveBeenCalled()
  })

  it('rolls back direct assignment creation with its invitation outbox', async () => {
    failDeliverySave = true
    await assignments.deleteOne({ _id: assignmentId })

    await expect(
      service.sendStudentInvitation(
        actor,
        {
          studentId,
          competencySetId: 'OUTBOX',
          recipientEmail: 'evaluator@example.test'
        },
        'direct-key-0001'
      )
    ).rejects.toThrow('injected delivery persistence fault')

    expect(await assignments.countDocuments({})).toBe(0)
    expect(await campaigns.countDocuments({})).toBe(0)
    expect(await invitations.countDocuments({})).toBe(0)
    expect(await deliveries.countDocuments({})).toBe(0)
    expect(queueAdd).not.toHaveBeenCalled()
  })

  it('fails closed when the public web URL is missing', async () => {
    publicWebUrl = undefined
    await assignments.deleteOne({ _id: assignmentId })

    await expect(
      service.sendStudentInvitation(
        actor,
        {
          studentId,
          competencySetId: 'OUTBOX',
          recipientEmail: 'evaluator@example.test'
        },
        'direct-missing-web-url-0001'
      )
    ).rejects.toMatchObject({
      status: 503,
      response: { code: 'PUBLIC_WEB_URL_NOT_CONFIGURED' }
    })

    expect(await campaigns.countDocuments({})).toBe(0)
    expect(await invitations.countDocuments({})).toBe(0)
    expect(await deliveries.countDocuments({})).toBe(0)
    expect(await assignments.countDocuments({})).toBe(0)
    expect(queueAdd).not.toHaveBeenCalled()
  })

  it('replays concurrent direct invitations with one idempotency key', async () => {
    await assignments.deleteOne({ _id: assignmentId })
    const cycle = await cycles.findOne({ code: 'cycle-outbox' }).orFail().exec()
    const input = {
      studentId,
      competencySetId: 'OUTBOX',
      recipientEmail: 'evaluator@example.test'
    }

    const [first, second] = await Promise.all([
      service.sendStudentInvitation(actor, input, 'direct-concurrent-key-0001'),
      service.sendStudentInvitation(actor, input, 'direct-concurrent-key-0001')
    ])

    expect(first).toMatchObject({ status: 'queued' })
    expect(second).toMatchObject({
      assignmentId: first.assignmentId,
      invitationId: first.invitationId,
      campaignId: first.campaignId,
      deliveryId: first.deliveryId
    })
    expect(await assignments.countDocuments({ cycleId: cycle.id })).toBe(1)
    expect(await campaigns.countDocuments({})).toBe(1)
    expect(await invitations.countDocuments({})).toBe(1)
    expect(await deliveries.countDocuments({})).toBe(1)
    expect(queueAdd).toHaveBeenCalledTimes(2)
    for (const [, , options] of queueAdd.mock.calls) {
      expect(options).toMatchObject({ jobId: `delivery-${first.deliveryId}` })
    }
  })

  it('rejects a concurrent direct invitation that reuses the key with another payload', async () => {
    await assignments.deleteOne({ _id: assignmentId })
    const requests = await Promise.allSettled([
      service.sendStudentInvitation(
        actor,
        {
          studentId,
          competencySetId: 'OUTBOX',
          recipientEmail: 'evaluator@example.test',
          deadlineDays: 1
        },
        'direct-conflict-key-0001'
      ),
      service.sendStudentInvitation(
        actor,
        {
          studentId,
          competencySetId: 'OUTBOX',
          recipientEmail: 'evaluator@example.test',
          deadlineDays: 2
        },
        'direct-conflict-key-0001'
      )
    ])

    expect(
      requests.filter(({ status }) => status === 'fulfilled')
    ).toHaveLength(1)
    expect(requests.filter(({ status }) => status === 'rejected')).toHaveLength(
      1
    )
    const rejected = requests.find(({ status }) => status === 'rejected')
    expect(rejected).toMatchObject({
      reason: {
        status: 409,
        response: { code: 'IDEMPOTENCY_KEY_REUSED' }
      }
    })
    expect(await campaigns.countDocuments({})).toBe(1)
    expect(await invitations.countDocuments({})).toBe(1)
    expect(await deliveries.countDocuments({})).toBe(1)
  })

  it('reissues one scoped invitation, revokes its session, and is idempotent', async () => {
    await service.create(
      actor,
      { type: 'invitation', templateVersionId, assignmentIds: [assignmentId] },
      'reissue-seed-0001'
    )
    const invitation = await invitations.findOne({ assignmentId }).exec()
    if (!invitation) throw new Error('Expected initial invitation')
    await invitations.updateOne(
      { _id: invitation.id },
      { $set: { accessPinHash: 'old-pin-hash' } }
    )
    const session = await sessions.create({
      tokenHash: 'old-evaluator-refresh-hash',
      actorId: `evaluator:${invitation.evaluatorId}`,
      assignmentId,
      invitationId: invitation.id,
      expiresAt: new Date(Date.now() + 60_000)
    })
    queueAdd.mockReset().mockResolvedValue({})

    const first = await service.reissueInvitation(
      actor,
      assignmentId,
      { reason: 'PIN was exposed to the wrong recipient' },
      'reissue-key-0001',
      'request-reissue-0001'
    )
    const replay = await service.reissueInvitation(
      actor,
      assignmentId,
      { reason: 'PIN was exposed to the wrong recipient' },
      'reissue-key-0001',
      'request-reissue-replay'
    )

    expect(first).toMatchObject({
      status: 'queued',
      invitationId: invitation.id,
      invitationVersion: 2,
      assignmentId
    })
    expect(replay).toMatchObject({
      campaignId: first.campaignId,
      deliveryId: first.deliveryId,
      invitationVersion: 2
    })
    const currentInvitation = await invitations
      .findById(invitation.id)
      .select('+accessPinHash')
      .exec()
    expect(currentInvitation).toMatchObject({ version: 2, status: 'active' })
    expect(currentInvitation?.accessPinHash).toBeUndefined()
    const revokedSession = await sessions
      .findById(session.id)
      .select('revokedAt')
      .lean()
    expect(revokedSession?.revokedAt).toBeInstanceOf(Date)
    await expect(
      campaigns.countDocuments({ type: 'invitation' })
    ).resolves.toBe(2)
    await expect(deliveries.countDocuments({ assignmentId })).resolves.toBe(2)
    await expect(
      auditLogs.countDocuments({
        action: 'correspondence.invitation_reissued'
      })
    ).resolves.toBe(1)
  })

  it('rolls back invitation rotation and session revocation when reissue audit fails', async () => {
    await service.create(
      actor,
      { type: 'invitation', templateVersionId, assignmentIds: [assignmentId] },
      'reissue-seed-0002'
    )
    const invitation = await invitations.findOne({ assignmentId }).exec()
    if (!invitation) throw new Error('Expected initial invitation')
    const session = await sessions.create({
      tokenHash: 'reissue-audit-failure-session',
      actorId: `evaluator:${invitation.evaluatorId}`,
      assignmentId,
      invitationId: invitation.id,
      expiresAt: new Date(Date.now() + 60_000)
    })
    const auditWrite = vi
      .spyOn(AuditService.prototype, 'record')
      .mockRejectedValueOnce(new Error('simulated audit persistence failure'))

    try {
      await expect(
        service.reissueInvitation(
          actor,
          assignmentId,
          { reason: 'PIN was exposed to the wrong recipient' },
          'reissue-audit-key-0001',
          'request-reissue-audit-failure'
        )
      ).rejects.toThrow('simulated audit persistence failure')
    } finally {
      auditWrite.mockRestore()
    }

    await expect(
      invitations.findById(invitation.id).select('version status').lean()
    ).resolves.toMatchObject({ version: 1, status: 'active' })
    const unchangedSession = await sessions
      .findById(session.id)
      .select('revokedAt')
      .lean()
    expect(unchangedSession?.revokedAt).toBeUndefined()
    await expect(
      campaigns.countDocuments({ type: 'invitation' })
    ).resolves.toBe(1)
    await expect(deliveries.countDocuments({ assignmentId })).resolves.toBe(1)
  })
})
