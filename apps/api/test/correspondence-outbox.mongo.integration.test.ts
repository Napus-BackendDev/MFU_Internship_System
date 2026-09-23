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
  let invitations: Model<InvitationRecord>
  let assignments: Model<EvaluationAssignmentRecord>
  let cycles: Model<EvaluationCycleRecord>
  let evaluators: Model<EvaluatorRecord>
  let students: Model<StudentRecord>
  let placements: Model<PlacementRecord>
  let competencySets: Model<CompetencySetRecord>
  let competencyVersions: Model<CompetencyVersionRecord>
  let templateVersions: Model<EmailTemplateVersionRecord>
  let queueAdd: ReturnType<typeof vi.fn>
  let failDeliverySave = false
  let actor: AuthenticatedActor
  let assignmentId: string
  let studentId: string
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

    queueAdd = vi.fn().mockRejectedValue(new Error('queue unavailable'))
    const queue = { add: queueAdd } as unknown as Queue
    service = new CampaignService(
      connection,
      { get: vi.fn() } as unknown as ConfigService<AppEnvironment, true>,
      {
        getSystemTemplates: vi.fn(() =>
          Promise.resolve([
            { code: 'evaluation_request', versionId: templateVersionId },
            { code: 'evaluation_reminder', versionId: templateVersionId }
          ])
        )
      } as unknown as TemplateService,
      queue,
      campaigns,
      deliveries,
      invitations,
      templateVersions,
      assignments,
      evaluators,
      students,
      placements,
      competencySets,
      competencyVersions,
      cycles
    )

    await Promise.all([
      campaigns.init(),
      deliveries.init(),
      invitations.init(),
      assignments.init(),
      cycles.init(),
      evaluators.init(),
      students.init(),
      placements.init(),
      competencySets.init(),
      competencyVersions.init(),
      templateVersions.init()
    ])
  }, 180_000)

  afterAll(async () => {
    await connection?.close()
    await replicaSet?.stop()
  }, 30_000)

  beforeEach(async () => {
    failDeliverySave = false
    queueAdd.mockClear()
    queueAdd.mockRejectedValue(new Error('queue unavailable'))
    await Promise.all([
      campaigns.deleteMany({}),
      deliveries.deleteMany({}),
      invitations.deleteMany({}),
      assignments.deleteMany({}),
      cycles.deleteMany({}),
      evaluators.deleteMany({}),
      students.deleteMany({}),
      placements.deleteMany({}),
      competencySets.deleteMany({}),
      competencyVersions.deleteMany({}),
      templateVersions.deleteMany({})
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
})
