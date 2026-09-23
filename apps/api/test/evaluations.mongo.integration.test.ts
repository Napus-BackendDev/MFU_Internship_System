import { MongoMemoryReplSet } from 'mongodb-memory-server-core'
import { createConnection, type Connection, type Model } from 'mongoose'
import type { AppEnvironment } from '@internship/config'
import type { Queue } from 'bullmq'
import type { Logger } from 'pino'
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi
} from 'vitest'

import type { AuthenticatedActor } from '@internship/shared-types'
import {
  EmailProcessor,
  type EmailJob
} from '../../worker/src/runtime/email.processor.js'
import {
  createModels as createWorkerModels,
  type WorkerModels
} from '../../worker/src/runtime/models.js'
import { StudentRecord, StudentSchema } from '../src/members/members.schema.js'
import {
  CompetencySetRecord,
  CompetencySetSchema,
  CompetencyVersionRecord,
  CompetencyVersionSchema,
  EvaluationAssignmentRecord,
  EvaluationAssignmentSchema,
  EvaluationCycleRecord,
  EvaluationCycleSchema,
  EvaluationDraftRecord,
  EvaluationDraftSchema,
  EvaluationRecord,
  EvaluationSchema,
  type SectionRecord
} from '../src/evaluations/evaluation.schema.js'
import { EvaluationsService } from '../src/evaluations/evaluations.service.js'

const questions: SectionRecord[] = [
  {
    id: 'hard',
    title: { th: 'ทักษะวิชาชีพ', en: 'Professional skills' },
    category: 'special',
    questions: [
      {
        id: 'hard-1',
        label: { th: 'ทักษะหนึ่ง', en: 'Skill one' },
        type: 'rating',
        required: true,
        scaleMin: 1,
        scaleMax: 5
      }
    ]
  },
  {
    id: 'soft',
    title: { th: 'ทักษะทั่วไป', en: 'General skills' },
    category: 'general',
    questions: [
      {
        id: 'soft-1',
        label: { th: 'ทักษะทั่วไปหนึ่ง', en: 'General skill one' },
        type: 'rating',
        required: true,
        scaleMin: 1,
        scaleMax: 5
      }
    ]
  },
  {
    id: 'situation',
    title: { th: 'สถานการณ์', en: 'Situation' },
    category: 'suggestion',
    questions: [
      {
        id: 'situation-1',
        label: { th: 'เล่าเหตุการณ์', en: 'Describe an event' },
        type: 'text',
        required: false
      }
    ]
  }
]

describe('evaluation workflow on an isolated MongoDB replica set', () => {
  let replicaSet: MongoMemoryReplSet
  let connection: Connection
  let service: EvaluationsService
  let students: Model<StudentRecord>
  let competencySets: Model<CompetencySetRecord>
  let competencyVersions: Model<CompetencyVersionRecord>
  let cycles: Model<EvaluationCycleRecord>
  let assignments: Model<EvaluationAssignmentRecord>
  let drafts: Model<EvaluationDraftRecord>
  let evaluations: Model<EvaluationRecord>
  let workerModels: WorkerModels

  function createEmailQueueMock(): {
    readonly queue: Queue<EmailJob>
    readonly add: ReturnType<typeof vi.fn>
  } {
    const add = vi.fn().mockResolvedValue(undefined)
    const getJob = vi.fn().mockResolvedValue(null)
    return { queue: { add, getJob } as unknown as Queue<EmailJob>, add }
  }

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

    students = connection.model(StudentRecord.name, StudentSchema)
    competencySets = connection.model(
      CompetencySetRecord.name,
      CompetencySetSchema
    )
    competencyVersions = connection.model(
      CompetencyVersionRecord.name,
      CompetencyVersionSchema
    )
    cycles = connection.model(EvaluationCycleRecord.name, EvaluationCycleSchema)
    assignments = connection.model(
      EvaluationAssignmentRecord.name,
      EvaluationAssignmentSchema
    )
    drafts = connection.model(EvaluationDraftRecord.name, EvaluationDraftSchema)
    evaluations = connection.model(EvaluationRecord.name, EvaluationSchema)
    workerModels = createWorkerModels(connection)
    await Promise.all([
      students.init(),
      competencySets.init(),
      competencyVersions.init(),
      cycles.init(),
      assignments.init(),
      drafts.init(),
      evaluations.init(),
      workerModels.Delivery.init()
    ])
    service = new EvaluationsService(
      connection,
      competencySets,
      competencyVersions,
      cycles,
      assignments,
      drafts,
      evaluations,
      students
    )
  }, 180_000)

  afterAll(async () => {
    await connection?.close()
    await replicaSet?.stop()
  }, 30_000)

  beforeEach(async () => {
    await Promise.all([
      students.deleteMany({}),
      competencySets.deleteMany({}),
      competencyVersions.deleteMany({}),
      cycles.deleteMany({}),
      assignments.deleteMany({}),
      drafts.deleteMany({}),
      evaluations.deleteMany({}),
      workerModels.Delivery.deleteMany({}),
      workerModels.Campaign.deleteMany({}),
      workerModels.Invitation.deleteMany({})
    ])
  })

  it('submits atomically, removes the draft, projects status, and replays idempotently', async () => {
    const { assignment, actor, student } = await seedWorkflow('student-1001')
    const answers = {
      'hard-1': 4,
      'soft-1': 3,
      'situation-1': 'Handled a difficult customer request.'
    }
    const evaluationView = (await service.getEvaluation(
      actor,
      assignment.id
    )) as { student: { id: string; studentId: string } }
    expect(evaluationView.student).toMatchObject({
      id: student.id,
      studentId: student.studentId
    })

    const draft = (await service.saveDraft(actor, assignment.id, {
      answers,
      revision: 0
    })) as { revision: number }
    expect(draft.revision).toBe(1)

    const first = (await service.submit(actor, assignment.id, {
      answers,
      idempotencyKey: 'submit-once'
    })) as {
      id: string
      aggregateScore: number | null
      categoryScores: {
        hardSkill: { average: number | null; answeredCount: number }
        softSkill: { average: number | null; answeredCount: number }
      }
    }
    const replay = (await service.submit(actor, assignment.id, {
      answers,
      idempotencyKey: 'submit-once'
    })) as { id: string }

    expect(replay.id).toBe(first.id)
    expect(first.aggregateScore).toBeNull()
    expect(first.categoryScores.hardSkill).toEqual({
      average: 4,
      answeredCount: 1,
      scaleMin: 1,
      scaleMax: 5
    })
    expect(first.categoryScores.softSkill.average).toBe(3)
    expect(first.categoryScores.softSkill.answeredCount).toBe(1)
    await expect(
      drafts.countDocuments({ assignmentId: assignment.id })
    ).resolves.toBe(0)
    await expect(
      evaluations.countDocuments({ assignmentId: assignment.id })
    ).resolves.toBe(1)
    await expect(
      assignments.findById(assignment.id).select('status').lean()
    ).resolves.toMatchObject({ status: 'submitted' })
    await expect(
      students.findById(student.id).select('evaluationStatus').lean()
    ).resolves.toMatchObject({ evaluationStatus: 'submitted' })

    await expect(
      service.submit(actor, assignment.id, {
        answers: { ...answers, 'hard-1': 5 },
        idempotencyKey: 'submit-once'
      })
    ).rejects.toMatchObject({ status: 409 })
  })

  it('returns one final result to concurrent identical submits', async () => {
    const { assignment, actor } = await seedWorkflow('student-1002')
    const input = {
      answers: { 'hard-1': 5, 'soft-1': 2 },
      idempotencyKey: 'concurrent-submit'
    }

    const results = await Promise.all([
      service.submit(actor, assignment.id, input),
      service.submit(actor, assignment.id, input)
    ])

    expect(
      new Set(results.map((result) => (result as { id: string }).id)).size
    ).toBe(1)
    await expect(
      evaluations.countDocuments({ assignmentId: assignment.id })
    ).resolves.toBe(1)
    await expect(
      assignments.findById(assignment.id).select('status').lean()
    ).resolves.toMatchObject({ status: 'submitted' })
  })

  it('rejects another evaluator scope without creating a final record', async () => {
    const own = await seedWorkflow('student-1003')
    const other = await seedWorkflow('student-1004', 'cycle-other')

    await expect(
      service.submit(own.actor, other.assignment.id, {
        answers: { 'hard-1': 3, 'soft-1': 4 },
        idempotencyKey: 'cross-owner'
      })
    ).rejects.toMatchObject({ status: 404 })

    await expect(evaluations.countDocuments({})).resolves.toBe(0)
    await expect(
      assignments.findById(other.assignment.id).select('status').lean()
    ).resolves.toMatchObject({ status: 'pending' })
  })

  it('rolls back final record and assignment status when a later transactional write fails', async () => {
    const { assignment, actor, student } = await seedWorkflow('student-1005')
    const studentWrite = vi
      .spyOn(students, 'updateOne')
      .mockImplementationOnce(() => {
        throw new Error('simulated student projection failure')
      })

    try {
      await expect(
        service.submit(actor, assignment.id, {
          answers: { 'hard-1': 3, 'soft-1': 4 },
          idempotencyKey: 'rollback-check'
        })
      ).rejects.toThrow('simulated student projection failure')
    } finally {
      studentWrite.mockRestore()
    }

    await expect(
      evaluations.countDocuments({ assignmentId: assignment.id })
    ).resolves.toBe(0)
    await expect(
      assignments.findById(assignment.id).select('status').lean()
    ).resolves.toMatchObject({ status: 'pending' })
    await expect(
      students.findById(student.id).select('evaluationStatus').lean()
    ).resolves.toMatchObject({ evaluationStatus: 'awaiting_evaluator' })
  })

  it('rejects an assignment whose student reference is missing without partial writes', async () => {
    const { assignment, actor } = await seedWorkflow('student-1006')
    await assignments.updateOne(
      { _id: assignment.id },
      { $set: { studentId: 'missing-student-reference' } }
    )

    await expect(
      service.submit(actor, assignment.id, {
        answers: { 'hard-1': 4, 'soft-1': 3 },
        idempotencyKey: 'orphan-student'
      })
    ).rejects.toMatchObject({ status: 422 })

    await expect(
      evaluations.countDocuments({ assignmentId: assignment.id })
    ).resolves.toBe(0)
    await expect(
      assignments.findById(assignment.id).select('status').lean()
    ).resolves.toMatchObject({ status: 'pending' })
  })

  it('requeues expired delivery only when SMTP had not started', async () => {
    const now = new Date()
    const campaign = await workerModels.Campaign.create({
      type: 'invitation',
      status: 'processing',
      total: 1
    })
    const invitation = await workerModels.Invitation.create({
      assignmentId: 'assignment-queue-recover',
      evaluatorId: 'evaluator-queue-recover',
      email: 'evaluator@example.test',
      expiresAt: new Date(now.getTime() + 60_000),
      status: 'active'
    })
    const delivery = await workerModels.Delivery.create({
      campaignId: campaign.id,
      assignmentId: 'assignment-queue-recover',
      recipientEmail: 'evaluator@example.test',
      templateVersionId: 'template-version-test',
      status: 'sending',
      attempts: 1,
      processingStartedAt: new Date(now.getTime() - 180_000),
      processingLeaseUntil: new Date(now.getTime() - 1_000),
      processingToken: 'worker-owner-test'
    })
    const { queue, add } = createEmailQueueMock()
    const processor = new EmailProcessor(
      {
        SMTP_HOST: 'localhost',
        AUTH_JWT_SECRET: 'test-only-signing-secret'
      } as AppEnvironment,
      workerModels,
      { error: vi.fn(), info: vi.fn(), warn: vi.fn() } as unknown as Logger,
      queue
    )

    await processor.recoverExpiredDeliveries(now)

    const recovered = await workerModels.Delivery.findById(delivery.id).lean()
    expect(recovered).toMatchObject({
      status: 'failed',
      lastErrorCode: 'WORKER_INTERRUPTED_BEFORE_SEND'
    })
    expect(recovered?.processingToken).toBeUndefined()
    expect(add).toHaveBeenCalledWith(
      'send-delivery',
      { deliveryId: delivery.id, invitationId: invitation.id },
      expect.objectContaining({ jobId: `delivery-${delivery.id}-retry-2` })
    )
  })

  it('marks SMTP-started and legacy deliveries uncertain without auto-resending', async () => {
    const now = new Date()
    const campaign = await workerModels.Campaign.create({
      type: 'invitation',
      status: 'processing',
      total: 2
    })
    const started = await workerModels.Delivery.create({
      campaignId: campaign.id,
      assignmentId: 'assignment-smtp-started',
      recipientEmail: 'started@example.test',
      templateVersionId: 'template-version-test',
      status: 'sending',
      attempts: 1,
      processingStartedAt: new Date(now.getTime() - 180_000),
      processingLeaseUntil: new Date(now.getTime() - 1_000),
      processingToken: 'worker-owner-started',
      providerAttemptStartedAt: new Date(now.getTime() - 120_000)
    })
    const legacy = await workerModels.Delivery.create({
      campaignId: campaign.id,
      assignmentId: 'assignment-legacy-sending',
      recipientEmail: 'legacy@example.test',
      templateVersionId: 'template-version-test',
      status: 'sending',
      attempts: 1,
      processingStartedAt: new Date(now.getTime() - 180_000)
    })
    const { queue, add } = createEmailQueueMock()
    const processor = new EmailProcessor(
      {
        SMTP_HOST: 'localhost',
        AUTH_JWT_SECRET: 'test-only-signing-secret'
      } as AppEnvironment,
      workerModels,
      { error: vi.fn(), info: vi.fn(), warn: vi.fn() } as unknown as Logger,
      queue
    )

    await processor.recoverExpiredDeliveries(now)

    const recovered = await workerModels.Delivery.find({
      _id: { $in: [started.id, legacy.id] }
    })
      .select('status lastErrorCode')
      .lean()
      .exec()
    expect(recovered).toHaveLength(2)
    expect(
      recovered.every(
        (delivery) =>
          delivery.status === 'uncertain' &&
          delivery.lastErrorCode === 'PROVIDER_STATE_UNCERTAIN'
      )
    ).toBe(true)
    expect(add).not.toHaveBeenCalled()
  })

  it('reconciles a persisted queued delivery whose BullMQ enqueue was interrupted', async () => {
    const campaign = await workerModels.Campaign.create({
      type: 'invitation',
      status: 'queued',
      total: 1
    })
    const invitation = await workerModels.Invitation.create({
      assignmentId: 'assignment-queue-outbox',
      evaluatorId: 'evaluator-queue-outbox',
      email: 'outbox@example.test',
      expiresAt: new Date(Date.now() + 60_000),
      status: 'active'
    })
    const delivery = await workerModels.Delivery.create({
      campaignId: campaign.id,
      assignmentId: 'assignment-queue-outbox',
      recipientEmail: invitation.email,
      templateVersionId: 'template-version-test',
      status: 'queued',
      attempts: 0
    })
    const { queue, add } = createEmailQueueMock()
    const processor = new EmailProcessor(
      {
        SMTP_HOST: 'localhost',
        AUTH_JWT_SECRET: 'test-only-signing-secret'
      } as AppEnvironment,
      workerModels,
      { error: vi.fn(), info: vi.fn(), warn: vi.fn() } as unknown as Logger,
      queue
    )

    await processor.recoverExpiredDeliveries()

    expect(add).toHaveBeenCalledWith(
      'send-delivery',
      { deliveryId: delivery.id, invitationId: invitation.id },
      expect.objectContaining({ jobId: `delivery-${delivery.id}` })
    )
  })

  async function seedWorkflow(
    studentId: string,
    cycleCode = 'cycle-main'
  ): Promise<{
    assignment: { id: string }
    actor: AuthenticatedActor
    student: { id: string; studentId: string }
  }> {
    const competencySet = await competencySets.create({
      code: `SET-${studentId}`,
      name: { th: 'แบบประเมิน', en: 'Evaluation set' }
    })
    const version = await competencyVersions.create({
      competencySetId: competencySet.id,
      versionNumber: 1,
      status: 'published',
      sections: questions,
      publishedAt: new Date(),
      publishedBy: 'test-admin'
    })
    const cycle = await cycles.create({
      code: cycleCode,
      name: { th: 'รอบทดสอบ', en: 'Test cycle' },
      competencySetVersionId: version.id,
      academicTermId: 'term-test',
      opensAt: new Date(Date.now() - 60_000),
      closesAt: new Date(Date.now() + 3_600_000),
      status: 'active'
    })
    const student = await students.create({
      studentId,
      name: { th: 'นักศึกษาทดสอบ', en: 'Test student' },
      email: `${studentId}@example.test`,
      schoolId: 'school-test',
      programId: 'program-test'
    })
    const assignment = await assignments.create({
      cycleId: cycle.id,
      placementId: `placement-${studentId}`,
      evaluatorId: `evaluator-${studentId}`,
      studentId,
      schoolId: 'school-test',
      programId: 'program-test',
      questionSnapshot: questions,
      competencySetVersionId: version.id,
      deadlineAt: new Date(Date.now() + 1_800_000),
      status: 'pending',
      evaluationVersion: 1
    })
    const actor: AuthenticatedActor = {
      id: `evaluator-user-${studentId}`,
      email: `${studentId}-evaluator@example.test`,
      displayName: 'Test evaluator',
      roles: ['evaluator'],
      scope: {
        tenant: false,
        schoolIds: [],
        programIds: [],
        assignmentId: assignment.id
      }
    }

    return { assignment, actor, student }
  }
})
