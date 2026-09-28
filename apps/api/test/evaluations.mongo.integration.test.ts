import { MongoMemoryReplSet } from 'mongodb-memory-server-core'
import { createConnection, Types, type Connection, type Model } from 'mongoose'
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
import { AcademicService } from '../src/academic/academic.service.js'
import {
  AcademicTermRecord,
  AcademicTermSchema,
  CourseRecord,
  CourseSchema,
  ProgramRecord,
  ProgramSchema,
  SchoolRecord,
  SchoolSchema
} from '../src/academic/academic.schema.js'
import { AuditLogRecord, AuditLogSchema } from '../src/audit/audit.schema.js'
import { AuditService } from '../src/audit/audit.service.js'
import {
  EmailProcessor,
  type EmailJob
} from '../../worker/src/runtime/email.processor.js'
import {
  createModels as createWorkerModels,
  type WorkerModels
} from '../../worker/src/runtime/models.js'
import {
  EvaluatorRecord,
  EvaluatorSchema,
  OrganizationRecord,
  OrganizationSchema,
  PlacementRecord,
  PlacementSchema,
  StudentRecord,
  StudentSchema
} from '../src/members/members.schema.js'
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

const testSchoolId = '64b000000000000000000001'
const testProgramId = '64b000000000000000000002'

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
  let auditLogs: Model<AuditLogRecord>
  let placements: Model<PlacementRecord>
  let evaluators: Model<EvaluatorRecord>
  let organizations: Model<OrganizationRecord>
  let academicTerms: Model<AcademicTermRecord>
  let schools: Model<SchoolRecord>
  let programs: Model<ProgramRecord>
  let courses: Model<CourseRecord>
  let auditService: AuditService
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
    academicTerms = connection.model(
      AcademicTermRecord.name,
      AcademicTermSchema
    )
    schools = connection.model(SchoolRecord.name, SchoolSchema)
    programs = connection.model(ProgramRecord.name, ProgramSchema)
    courses = connection.model(CourseRecord.name, CourseSchema)
    placements = connection.model(PlacementRecord.name, PlacementSchema)
    evaluators = connection.model(EvaluatorRecord.name, EvaluatorSchema)
    organizations = connection.model(
      OrganizationRecord.name,
      OrganizationSchema
    )
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
    auditLogs = connection.model(AuditLogRecord.name, AuditLogSchema)
    auditService = new AuditService(auditLogs)
    workerModels = createWorkerModels(connection)
    await Promise.all([
      students.init(),
      academicTerms.init(),
      schools.init(),
      programs.init(),
      courses.init(),
      competencySets.init(),
      competencyVersions.init(),
      cycles.init(),
      assignments.init(),
      drafts.init(),
      evaluations.init(),
      placements.init(),
      evaluators.init(),
      organizations.init(),
      auditLogs.init(),
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
      academicTerms,
      students,
      placements,
      evaluators,
      organizations,
      schools,
      programs,
      auditService
    )
  }, 180_000)

  afterAll(async () => {
    await connection?.close()
    await replicaSet?.stop()
  }, 30_000)

  beforeEach(async () => {
    await Promise.all([
      students.deleteMany({}),
      academicTerms.deleteMany({}),
      schools.deleteMany({}),
      programs.deleteMany({}),
      competencySets.deleteMany({}),
      competencyVersions.deleteMany({}),
      cycles.deleteMany({}),
      assignments.deleteMany({}),
      drafts.deleteMany({}),
      evaluations.deleteMany({}),
      placements.deleteMany({}),
      evaluators.deleteMany({}),
      organizations.deleteMany({}),
      auditLogs.deleteMany({}),
      courses.deleteMany({}),
      workerModels.Delivery.deleteMany({}),
      workerModels.Campaign.deleteMany({}),
      workerModels.Invitation.deleteMany({})
    ])
    await schools.create({
      _id: new Types.ObjectId(testSchoolId),
      schoolCode: 'TEST',
      name: { th: 'สำนักวิชาทดสอบ', en: 'Test School' },
      status: 'active'
    })
    await programs.create({
      _id: new Types.ObjectId(testProgramId),
      schoolId: testSchoolId,
      programCode: 'TEST',
      name: { th: 'หลักสูตรทดสอบ', en: 'Test Program' },
      status: 'active'
    })
  })

  it('rejects an assignment whose placement, student, and evaluator references are unverified', async () => {
    const { assignment, student } = await seedWorkflow('assignment-target')
    const staff: AuthenticatedActor = {
      id: 'staff-assignment-test',
      email: 'staff@example.test',
      displayName: 'Test staff',
      roles: ['internshipStaff'],
      scope: {
        tenant: false,
        schoolIds: [testSchoolId],
        programIds: [testProgramId]
      }
    }

    await expect(
      service.createAssignment(staff, {
        cycleId: assignment.cycleId,
        placementId: '64b64c2f81c2a545b8e19654',
        evaluatorId: '64b64c2f81c2a545b8e19655',
        studentId: student.studentId,
        schoolId: testSchoolId,
        programId: testProgramId,
        deadlineAt: new Date(Date.now() + 1_800_000),
        status: 'pending',
        evaluationVersion: 1
      })
    ).rejects.toMatchObject({ status: 404 })

    await expect(assignments.countDocuments({})).resolves.toBe(1)
  })

  it('never serializes invitation PIN secrets from assignment listings', async () => {
    const { assignment, actor } = await seedWorkflow('assignment-pin-redaction')
    await assignments.updateOne(
      { _id: assignment.id },
      { $set: { accessPin: 'DO-NOT-EXPOSE', accessPinHash: 'private-hash' } }
    )

    const listed = (await service.listAssignments(actor, {
      page: 1,
      pageSize: 10
    })) as { items: Readonly<Record<string, unknown>>[] }

    expect(listed.items).toHaveLength(1)
    expect(listed.items[0]).not.toHaveProperty('accessPin')
    expect(listed.items[0]).not.toHaveProperty('accessPinHash')

    const explicitlySelected = await assignments
      .findById(assignment.id)
      .select('+accessPin +accessPinHash')
      .exec()
    expect(explicitlySelected?.accessPin).toBe('DO-NOT-EXPOSE')
    expect(explicitlySelected?.toJSON()).not.toHaveProperty('accessPin')
    expect(explicitlySelected?.toJSON()).not.toHaveProperty('accessPinHash')
  })

  it('does not let a Student assignment filter widen their own assignment scope', async () => {
    const own = await seedWorkflow('student-assignment-list-own')
    const other = await seedWorkflow(
      'student-assignment-list-other',
      'cycle-student-list-other'
    )
    await assignments.updateOne(
      { _id: other.assignment.id },
      { $set: { studentId: other.student.id } }
    )
    const studentActor: AuthenticatedActor = {
      id: `student-user-${own.student.studentId}`,
      email: `${own.student.studentId}-student@example.test`,
      displayName: 'Test student',
      roles: ['student'],
      scope: {
        tenant: false,
        schoolIds: [],
        programIds: [],
        studentId: own.student.studentId
      }
    }

    const ownAssignments = (await service.listAssignments(studentActor, {
      page: 1,
      pageSize: 25
    })) as { items: readonly { id: string }[]; meta: { total: number } }
    expect(ownAssignments.meta.total).toBe(1)
    expect(ownAssignments.items.map(({ id }) => id)).toEqual([
      own.assignment.id
    ])

    const widenedAssignments = (await service.listAssignments(studentActor, {
      page: 1,
      pageSize: 25,
      studentId: other.student.id
    })) as { items: readonly { id: string }[]; meta: { total: number } }
    expect(widenedAssignments.meta.total).toBe(0)
    expect(widenedAssignments.items).toEqual([])
  })

  it('combines Student own assignments with another role scope authorized for reads', async () => {
    const own = await seedWorkflow('student-multi-role-own')
    const scoped = await seedWorkflow(
      'student-multi-role-scoped',
      'cycle-multi-role-scoped'
    )
    const foreign = await seedWorkflow(
      'student-multi-role-foreign',
      'cycle-multi-role-foreign'
    )
    await assignments.updateOne(
      { _id: scoped.assignment.id },
      { $set: { schoolId: 'school-scope', programId: 'program-scope' } }
    )
    await assignments.updateOne(
      { _id: foreign.assignment.id },
      { $set: { schoolId: 'school-foreign', programId: 'program-foreign' } }
    )
    const actor: AuthenticatedActor = {
      id: 'student-and-coordinator',
      email: 'multi-role@example.test',
      displayName: 'Student and Coordinator',
      roles: ['student', 'coordinator'],
      scope: {
        tenant: false,
        schoolIds: ['school-scope'],
        programIds: ['program-scope'],
        studentId: own.student.studentId
      },
      roleScopes: [
        {
          role: 'coordinator',
          tenant: false,
          schoolIds: ['school-scope'],
          programIds: ['program-scope']
        }
      ]
    }

    const result = (await service.listAssignments(actor, {
      page: 1,
      pageSize: 25
    })) as { items: readonly { id: string }[]; meta: { total: number } }
    expect(result.meta.total).toBe(2)
    expect(new Set(result.items.map(({ id }) => id))).toEqual(
      new Set([own.assignment.id, scoped.assignment.id])
    )
  })

  it('creates canonical assignments and rejects concurrent duplicates', async () => {
    const { assignment, student } = await seedWorkflow('assignment-canonical')
    const canonicalStudent = await students.create({
      studentId: 'assignment-canonical-student',
      name: { th: 'นักศึกษาทดสอบ', en: 'Canonical student' },
      email: 'assignment-canonical-student@example.test',
      schoolId: testSchoolId,
      programId: testProgramId,
      academicTermId: student.academicTermId
    })
    const organization = await organizations.create({
      organizationCode: 'ORG-CANONICAL',
      name: { th: 'บริษัททดสอบ', en: 'Test Company' },
      status: 'active'
    })
    const evaluator = await evaluators.create({
      organizationId: organization.id,
      email: 'evaluator-canonical@example.test',
      name: { th: 'ผู้ประเมิน', en: 'Evaluator' },
      position: { th: 'หัวหน้างาน', en: 'Supervisor' },
      status: 'active'
    })
    const placement = await placements.create({
      studentId: canonicalStudent.id,
      organizationId: organization.id,
      academicTermId: canonicalStudent.academicTermId,
      schoolId: testSchoolId,
      programId: testProgramId,
      positionTitle: { th: 'นักศึกษาฝึกงาน', en: 'Intern' },
      startsAt: new Date(Date.now() - 86_400_000),
      endsAt: new Date(Date.now() + 86_400_000),
      status: 'active'
    })
    const staff: AuthenticatedActor = {
      id: 'staff-assignment-canonical',
      email: 'staff@example.test',
      displayName: 'Test staff',
      roles: ['internshipStaff'],
      scope: {
        tenant: false,
        schoolIds: [testSchoolId],
        programIds: [testProgramId]
      }
    }
    const createInput = {
      cycleId: assignment.cycleId,
      placementId: placement.id,
      evaluatorId: evaluator.id,
      studentId: canonicalStudent.studentId,
      schoolId: testSchoolId,
      programId: testProgramId,
      deadlineAt: new Date(Date.now() + 1_800_000),
      status: 'pending' as const,
      evaluationVersion: 1
    }
    const initialStudentVersion = await students
      .findById(canonicalStudent.id)
      .select('__v')
      .lean()
      .exec()

    const created = (await service.createAssignment(
      staff,
      createInput,
      'request-assignment-canonical'
    )) as {
      id: string
      studentId: string
      placementId: string
      evaluatorId: string
      status: string
    }

    expect(created).toMatchObject({
      studentId: canonicalStudent.id,
      placementId: placement.id,
      evaluatorId: evaluator.id,
      status: 'pending'
    })
    await expect(
      students.findById(canonicalStudent.id).select('__v').lean().exec()
    ).resolves.toMatchObject({ __v: (initialStudentVersion?.__v ?? 0) + 1 })
    await expect(
      auditLogs.findOne({ action: 'evaluations.assignment_created' }).lean()
    ).resolves.toMatchObject({
      requestId: 'request-assignment-canonical',
      metadata: {
        assignmentId: created.id,
        studentId: canonicalStudent.id,
        placementId: placement.id,
        evaluatorId: evaluator.id
      },
      resourceScopes: [
        { schoolIds: [testSchoolId], programIds: [testProgramId] }
      ]
    })

    await assignments.deleteOne({ _id: created.id })
    await auditLogs.deleteOne({ requestId: 'request-assignment-canonical' })
    const concurrentCreates = await Promise.allSettled([
      service.createAssignment(
        staff,
        createInput,
        'request-assignment-race-first'
      ),
      service.createAssignment(
        staff,
        createInput,
        'request-assignment-race-second'
      )
    ])
    const successfulCreates = concurrentCreates.filter(
      (result) => result.status === 'fulfilled'
    )
    const rejectedCreates = concurrentCreates.filter(
      (result): result is PromiseRejectedResult => result.status === 'rejected'
    )

    expect(successfulCreates).toHaveLength(1)
    expect(rejectedCreates).toHaveLength(1)
    expect(rejectedCreates[0]?.reason).toMatchObject({
      status: 409,
      response: { code: 'ASSIGNMENT_ALREADY_EXISTS' }
    })
    await expect(
      assignments.countDocuments({
        cycleId: assignment.cycleId,
        studentId: canonicalStudent.id
      })
    ).resolves.toBe(1)
    await expect(
      auditLogs.countDocuments({ action: 'evaluations.assignment_created' })
    ).resolves.toBe(1)

    await expect(
      service.createAssignment(staff, createInput)
    ).rejects.toMatchObject({ status: 409 })

    const duplicatePlacementId = new Types.ObjectId()
    await placements.collection.insertOne({
      _id: duplicatePlacementId,
      // Legacy placement reference by student number must still resolve to the canonical student.
      studentId: canonicalStudent.studentId,
      organizationId: organization.id,
      academicTermId: canonicalStudent.academicTermId,
      schoolId: testSchoolId,
      programId: testProgramId,
      positionTitle: { th: 'ตำแหน่งใหม่', en: 'Another position' },
      startsAt: new Date(Date.now() - 86_400_000),
      endsAt: new Date(Date.now() + 86_400_000),
      status: 'active'
    })
    await expect(
      service.createAssignment(staff, {
        ...createInput,
        placementId: duplicatePlacementId.toHexString()
      })
    ).rejects.toMatchObject({
      status: 409,
      response: { code: 'ASSIGNMENT_ALREADY_EXISTS' }
    })

    const auditStudent = await students.create({
      studentId: 'assignment-audit-failure',
      name: { th: 'นักศึกษาอีกคน', en: 'Another student' },
      email: 'assignment-audit-failure@example.test',
      schoolId: testSchoolId,
      programId: testProgramId,
      academicTermId: student.academicTermId
    })
    const auditStudentPlacement = await placements.create({
      studentId: auditStudent.id,
      organizationId: organization.id,
      academicTermId: auditStudent.academicTermId,
      schoolId: testSchoolId,
      programId: testProgramId,
      positionTitle: { th: 'นักศึกษาฝึกงาน', en: 'Intern' },
      startsAt: new Date(Date.now() - 86_400_000),
      endsAt: new Date(Date.now() + 86_400_000),
      status: 'active'
    })
    const auditWrite = vi
      .spyOn(auditService, 'record')
      .mockRejectedValue(new Error('simulated assignment audit failure'))
    try {
      await expect(
        service.createAssignment(staff, {
          ...createInput,
          placementId: auditStudentPlacement.id,
          studentId: auditStudent.studentId
        })
      ).rejects.toThrow('simulated assignment audit failure')
    } finally {
      auditWrite.mockRestore()
    }
    await expect(
      assignments.countDocuments({ cycleId: assignment.cycleId })
    ).resolves.toBe(2)
    await expect(
      auditLogs.countDocuments({ action: 'evaluations.assignment_created' })
    ).resolves.toBe(1)
  })

  it('snapshots only global and matching School/Program competency sections', async () => {
    const { assignment, student } = await seedWorkflow(
      'assignment-competency-scope'
    )
    const matchingStudent = await students.create({
      studentId: 'assignment-matching-competencies',
      name: { th: 'นักศึกษาตรงแบบ', en: 'Matching set' },
      email: 'assignment-matching-competencies@example.test',
      schoolId: testSchoolId,
      programId: testProgramId,
      academicTermId: student.academicTermId
    })
    const cycle = await cycles.findById(assignment.cycleId).lean().exec()
    if (!cycle) throw new Error('Expected seeded cycle')
    const sourceVersion = await competencyVersions
      .findById(cycle.competencySetVersionId)
      .lean()
      .exec()
    if (!sourceVersion) throw new Error('Expected seeded competency version')
    const makeSection = (
      id: string,
      schoolId?: string,
      programId?: string
    ): SectionRecord => ({
      id,
      title: { th: id, en: id },
      category: 'special',
      ...(schoolId ? { schoolId } : {}),
      ...(programId ? { programId } : {}),
      questions: [
        {
          id: `${id}-question`,
          label: { th: 'ทักษะ', en: 'Skill' },
          type: 'rating',
          required: true,
          scaleMin: 1,
          scaleMax: 5
        }
      ]
    })
    await competencyVersions.updateOne(
      { _id: cycle.competencySetVersionId },
      {
        $set: {
          sections: [
            makeSection('global'),
            makeSection('other-school', 'school-other'),
            makeSection('other-program', testSchoolId, 'program-other'),
            makeSection('matching', testSchoolId, testProgramId)
          ]
        }
      }
    )
    const organization = await organizations.create({
      organizationCode: 'ORG-COMPETENCY-SCOPE',
      name: { th: 'บริษัททดสอบ', en: 'Test Company' },
      status: 'active'
    })
    const evaluator = await evaluators.create({
      organizationId: organization.id,
      email: 'evaluator-competency-scope@example.test',
      name: { th: 'ผู้ประเมิน', en: 'Evaluator' },
      position: { th: 'หัวหน้างาน', en: 'Supervisor' },
      status: 'active'
    })
    const placement = await placements.create({
      studentId: matchingStudent.id,
      organizationId: organization.id,
      academicTermId: matchingStudent.academicTermId,
      schoolId: testSchoolId,
      programId: testProgramId,
      positionTitle: { th: 'นักศึกษาฝึกงาน', en: 'Intern' },
      startsAt: new Date(Date.now() - 86_400_000),
      endsAt: new Date(Date.now() + 86_400_000),
      status: 'active'
    })
    const staff: AuthenticatedActor = {
      id: 'staff-competency-scope',
      email: 'staff@example.test',
      displayName: 'Test staff',
      roles: ['internshipStaff'],
      scope: {
        tenant: false,
        schoolIds: [testSchoolId],
        programIds: [testProgramId]
      }
    }
    const createInput = {
      cycleId: assignment.cycleId,
      placementId: placement.id,
      evaluatorId: evaluator.id,
      studentId: matchingStudent.studentId,
      schoolId: testSchoolId,
      programId: testProgramId,
      deadlineAt: new Date(Date.now() + 1_800_000),
      status: 'pending' as const,
      evaluationVersion: 1
    }

    const created = (await service.createAssignment(staff, createInput)) as {
      id: string
      questionSnapshot: readonly SectionRecord[]
    }
    expect(created.questionSnapshot.map(({ id }) => id)).toEqual([
      'global',
      'matching'
    ])
    const scopedVersion = (await service.getCompetencyVersion(
      staff,
      cycle.competencySetVersionId
    )) as { sections: readonly SectionRecord[] }
    expect(scopedVersion.sections.map(({ id }) => id)).toEqual([
      'global',
      'matching'
    ])
    const scopedVersions = (await service.listCompetencyVersions(
      staff,
      sourceVersion.competencySetId
    )) as readonly { sections: readonly SectionRecord[] }[]
    expect(scopedVersions).toHaveLength(1)
    expect(scopedVersions[0]?.sections.map(({ id }) => id)).toEqual([
      'global',
      'matching'
    ])
    const scopedSets = (await service.listCompetencySets(staff, {
      page: 1,
      pageSize: 20
    })) as { items: readonly { id: string }[] }
    expect(scopedSets.items.map(({ id }) => id)).toContain(
      sourceVersion.competencySetId
    )
    const searchedScopedSets = (await service.listCompetencySets(
      staff,
      { page: 1, pageSize: 20 },
      { search: `SET-${'assignment-competency-scope'}`, archived: false }
    )) as { items: readonly { id: string }[] }
    expect(searchedScopedSets.items.map(({ id }) => id)).toEqual([
      sourceVersion.competencySetId
    ])
    const foreignSet = await competencySets.create({
      code: 'SET-OUTSIDE-COMPETENCY-SCOPE',
      name: { th: 'แบบประเมินนอกขอบเขต', en: 'Out-of-scope set' }
    })
    await competencyVersions.create({
      competencySetId: foreignSet.id,
      versionNumber: 1,
      status: 'published',
      sections: [makeSection('outside-only', 'school-outside')],
      publishedAt: new Date(),
      publishedBy: 'test-admin'
    })
    const foreignSetLookup = (await service.listCompetencySets(
      staff,
      { page: 1, pageSize: 20 },
      { search: 'SET-OUTSIDE', archived: false }
    )) as { items: readonly { id: string }[] }
    expect(foreignSetLookup.items).toEqual([])
    const archivedSet = await competencySets.create({
      code: 'ARCHIVED-ONLY-SET',
      name: { th: 'แบบประเมินเก่า', en: 'Archived set' },
      status: 'archived'
    })

    const unrelatedProgramActor: AuthenticatedActor = {
      ...staff,
      id: 'staff-other-program-scope',
      scope: {
        tenant: false,
        schoolIds: ['school-other'],
        programIds: ['program-other']
      }
    }
    const unrelatedProgramVersion = (await service.getCompetencyVersion(
      unrelatedProgramActor,
      cycle.competencySetVersionId
    )) as { sections: readonly SectionRecord[] }
    expect(unrelatedProgramVersion.sections.map(({ id }) => id)).toEqual([
      'global',
      'other-school'
    ])
    for (const role of ['coordinator', 'auditor'] as const) {
      const reader: AuthenticatedActor = {
        ...staff,
        id: `${role}-competency-scope`,
        roles: [role]
      }
      const scoped = (await service.getCompetencyVersion(
        reader,
        cycle.competencySetVersionId
      )) as { sections: readonly SectionRecord[] }
      expect(scoped.sections.map(({ id }) => id)).toEqual([
        'global',
        'matching'
      ])
    }
    const tenantAdmin: AuthenticatedActor = {
      ...staff,
      id: 'admin-competency-scope',
      roles: ['systemAdmin'],
      scope: { tenant: true, schoolIds: [], programIds: [] }
    }
    const activeOnlyArchivedLookup = (await service.listCompetencySets(
      tenantAdmin,
      { page: 1, pageSize: 20 },
      { search: 'ARCHIVED-ONLY', archived: false }
    )) as { items: readonly { id: string }[] }
    expect(activeOnlyArchivedLookup.items).toEqual([])
    const includeArchivedLookup = (await service.listCompetencySets(
      tenantAdmin,
      { page: 1, pageSize: 20 },
      { search: 'ARCHIVED-ONLY', archived: true }
    )) as { items: readonly { id: string }[] }
    expect(includeArchivedLookup.items.map(({ id }) => id)).toEqual([
      archivedSet.id
    ])
    const unfilteredVersion = (await service.getCompetencyVersion(
      tenantAdmin,
      cycle.competencySetVersionId
    )) as { sections: readonly SectionRecord[] }
    expect(unfilteredVersion.sections.map(({ id }) => id)).toEqual([
      'global',
      'other-school',
      'other-program',
      'matching'
    ])
    const invalidTenantCoordinator: AuthenticatedActor = {
      ...staff,
      id: 'invalid-tenant-coordinator',
      roles: ['coordinator'],
      scope: { tenant: true, schoolIds: [], programIds: [] },
      roleScopes: [
        {
          role: 'coordinator',
          tenant: true,
          schoolIds: [],
          programIds: []
        }
      ]
    }
    await expect(
      service.getCompetencyVersion(
        invalidTenantCoordinator,
        cycle.competencySetVersionId
      )
    ).rejects.toMatchObject({ status: 404 })

    const pairedRoleActor: AuthenticatedActor = {
      ...staff,
      id: 'paired-competency-scope',
      roles: ['internshipStaff', 'coordinator'],
      scope: {
        tenant: false,
        schoolIds: [testSchoolId, 'school-other'],
        programIds: [testProgramId, 'program-other']
      },
      roleScopes: [
        {
          role: 'internshipStaff',
          tenant: false,
          schoolIds: [testSchoolId],
          programIds: [testProgramId]
        },
        {
          role: 'coordinator',
          tenant: false,
          schoolIds: ['school-other'],
          programIds: ['program-other']
        }
      ]
    }
    const pairedVersion = (await service.getCompetencyVersion(
      pairedRoleActor,
      cycle.competencySetVersionId
    )) as { sections: readonly SectionRecord[] }
    expect(pairedVersion.sections.map(({ id }) => id)).toEqual([
      'global',
      'other-school',
      'matching'
    ])

    const studentActor: AuthenticatedActor = {
      id: 'student-competency-scope',
      email: 'student@example.test',
      displayName: 'Test student',
      roles: ['student'],
      scope: {
        tenant: false,
        schoolIds: [testSchoolId],
        programIds: [testProgramId],
        studentId: matchingStudent.studentId
      }
    }
    const studentVersion = (await service.getCompetencyVersion(
      studentActor,
      cycle.competencySetVersionId
    )) as { status: string; sections: readonly SectionRecord[] }
    expect(studentVersion.status).toBe('published')
    expect(studentVersion.sections.map(({ id }) => id)).toEqual([
      'global',
      'matching'
    ])

    const evaluatorActor: AuthenticatedActor = {
      id: 'evaluator-competency-scope',
      email: 'evaluator@example.test',
      displayName: 'Test evaluator',
      roles: ['evaluator'],
      scope: {
        tenant: false,
        schoolIds: [],
        programIds: [],
        assignmentId: created.id
      }
    }
    await expect(
      service.getCompetencyVersion(evaluatorActor, cycle.competencySetVersionId)
    ).rejects.toMatchObject({ status: 404 })

    await competencyVersions.updateOne(
      { _id: cycle.competencySetVersionId },
      { $set: { status: 'draft' } }
    )
    await expect(
      service.getCompetencyVersion(studentActor, cycle.competencySetVersionId)
    ).rejects.toMatchObject({ status: 404 })
    const studentVersions = await service.listCompetencyVersions(
      studentActor,
      sourceVersion.competencySetId
    )
    expect(studentVersions).toEqual([])
    const studentSets = (await service.listCompetencySets(studentActor, {
      page: 1,
      pageSize: 20
    })) as { items: readonly { id: string }[] }
    expect(studentSets.items.map(({ id }) => id)).not.toContain(
      sourceVersion.competencySetId
    )
    await expect(
      service.getCompetencyVersion(staff, cycle.competencySetVersionId)
    ).resolves.toMatchObject({ status: 'draft' })

    await competencyVersions.updateOne(
      { _id: cycle.competencySetVersionId },
      {
        $set: {
          status: 'published',
          sections: [makeSection('unrelated', 'school-other')]
        }
      }
    )
    await expect(
      service.getCompetencyVersion(staff, cycle.competencySetVersionId)
    ).rejects.toMatchObject({ status: 404 })
    const noMatchStudent = await students.create({
      studentId: 'assignment-no-matching-competencies',
      name: { th: 'นักศึกษาไม่ตรงแบบ', en: 'No matching set' },
      email: 'assignment-no-matching-competencies@example.test',
      schoolId: testSchoolId,
      programId: testProgramId,
      academicTermId: student.academicTermId
    })
    const noMatchPlacement = await placements.create({
      studentId: noMatchStudent.id,
      organizationId: organization.id,
      academicTermId: noMatchStudent.academicTermId,
      schoolId: testSchoolId,
      programId: testProgramId,
      positionTitle: { th: 'นักศึกษาฝึกงาน', en: 'Intern' },
      startsAt: new Date(Date.now() - 86_400_000),
      endsAt: new Date(Date.now() + 86_400_000),
      status: 'active'
    })
    await expect(
      service.createAssignment(staff, {
        ...createInput,
        placementId: noMatchPlacement.id,
        studentId: noMatchStudent.studentId
      })
    ).rejects.toMatchObject({
      status: 422,
      response: { code: 'COMPETENCY_SET_NOT_APPLICABLE' }
    })
    await expect(
      assignments.countDocuments({ studentId: noMatchStudent.id })
    ).resolves.toBe(0)
    await cycles.updateOne(
      { _id: cycle._id },
      {
        $set: {
          status: 'draft',
          schoolId: testSchoolId,
          programId: testProgramId
        }
      }
    )
    await expect(
      service.previewCycle(staff, String(cycle._id))
    ).resolves.toMatchObject({
      valid: false,
      issues: [{ code: 'COMPETENCY_SET_NOT_APPLICABLE' }]
    })
    await expect(
      service.activateCycle(staff, String(cycle._id))
    ).rejects.toMatchObject({
      status: 422,
      response: {
        code: 'CYCLE_ACTIVATION_INVALID',
        details: { issues: [{ code: 'COMPETENCY_SET_NOT_APPLICABLE' }] }
      }
    })
  })

  it('prevents scoped Staff from editing a Draft competency version outside their scope', async () => {
    const competencySet = await competencySets.create({
      code: 'COMPETENCY-OUT-OF-SCOPE',
      name: { th: 'แบบประเมินอื่น', en: 'Other-scope form' }
    })
    const foreignSections: SectionRecord[] = [
      questions[1]!,
      {
        id: 'foreign-specialty',
        title: { th: 'สำนักอื่น', en: 'Other school' },
        category: 'special',
        schoolId: 'school-other',
        programId: 'program-other',
        questions: [
          {
            id: 'foreign-question',
            label: { th: 'คำถามเดิม', en: 'Original question' },
            type: 'rating',
            required: true,
            scaleMin: 1,
            scaleMax: 5
          }
        ]
      }
    ]
    const version = await competencyVersions.create({
      competencySetId: competencySet.id,
      versionNumber: 1,
      status: 'published',
      sections: foreignSections,
      publishedAt: new Date(),
      publishedBy: 'system-admin'
    })
    const scopedStaff: AuthenticatedActor = {
      id: 'scoped-competency-editor',
      email: 'scoped-staff@example.test',
      displayName: 'Scoped staff',
      roles: ['internshipStaff'],
      scope: {
        tenant: false,
        schoolIds: [testSchoolId],
        programIds: [testProgramId]
      }
    }

    const updatedSections = foreignSections.map((section) => ({
      ...section,
      questions: section.questions.map((question) => ({
        ...question,
        label: { th: 'แก้ไขโดยไม่มีสิทธิ์', en: 'Unauthorized edit' }
      }))
    }))
    const ownSections: SectionRecord[] = [
      {
        ...foreignSections[1]!,
        schoolId: testSchoolId,
        programId: testProgramId,
        id: 'own-specialty',
        questions: [
          {
            ...foreignSections[1]!.questions[0]!,
            id: 'own-question'
          }
        ]
      }
    ]
    await expect(
      service.updateCompetencyVersion(scopedStaff, version.id, updatedSections)
    ).rejects.toMatchObject({ status: 404 })
    await expect(
      service.publishCompetencyVersion(version.id, scopedStaff)
    ).rejects.toMatchObject({ status: 404 })
    await expect(
      service.createCompetencyVersion(
        scopedStaff,
        competencySet.id,
        foreignSections
      )
    ).rejects.toMatchObject({ status: 403 })
    await expect(
      service.createCompetencyVersion(scopedStaff, competencySet.id, [
        ...ownSections,
        foreignSections[0]!
      ])
    ).resolves.toMatchObject({
      sections: [
        { id: 'own-specialty' },
        { id: 'soft' },
        { id: 'foreign-specialty' }
      ]
    })
    const pairedStaffCoordinator: AuthenticatedActor = {
      ...scopedStaff,
      id: 'paired-scoped-competency-editor',
      roles: ['internshipStaff', 'coordinator'],
      scope: {
        tenant: false,
        schoolIds: [testSchoolId, 'school-other'],
        programIds: [testProgramId, 'program-other']
      },
      roleScopes: [
        {
          role: 'internshipStaff',
          tenant: false,
          schoolIds: [testSchoolId],
          programIds: [testProgramId]
        },
        {
          role: 'coordinator',
          tenant: false,
          schoolIds: ['school-other'],
          programIds: ['program-other']
        }
      ]
    }
    await expect(
      service.updateCompetencyVersion(
        pairedStaffCoordinator,
        version.id,
        updatedSections
      )
    ).rejects.toMatchObject({ status: 404 })
    const unchanged = await competencyVersions
      .findById(version.id)
      .lean()
      .exec()
    expect(
      unchanged?.sections.find(({ id }) => id === 'foreign-specialty')
        ?.questions[0]?.label.en
    ).toBe('Original question')

    const ownVersion = (await competencyVersions.findOne({
      competencySetId: competencySet.id,
      versionNumber: 2
    })) as { id: string }
    const ownUpdatedSections = ownSections.map((section) => ({
      ...section,
      questions: section.questions.map((question) => ({
        ...question,
        label: { th: 'คำถามที่แก้ไข', en: 'Authorized edit' }
      }))
    }))
    const updated = (await service.updateCompetencyVersion(
      scopedStaff,
      ownVersion.id,
      [...ownUpdatedSections, foreignSections[0]!]
    )) as { sections: readonly SectionRecord[] }
    expect(updated.sections.map(({ id }) => id)).toEqual([
      'own-specialty',
      'soft',
      'foreign-specialty'
    ])
    expect(updated.sections[1]?.questions[0]?.label.en).toBe(
      'General skill one'
    )
    expect(updated.sections[2]?.questions[0]?.label.en).toBe(
      'Original question'
    )
    expect(updated.sections[0]?.questions[0]?.label.en).toBe('Authorized edit')
    await expect(
      service.publishCompetencyVersion(ownVersion.id, scopedStaff)
    ).resolves.toMatchObject({ status: 'published' })

    const tenantStaff: AuthenticatedActor = {
      ...scopedStaff,
      id: 'tenant-competency-editor',
      roles: ['internshipStaff'],
      scope: { tenant: true, schoolIds: [], programIds: [] }
    }
    const tenantSet = (await service.createCompetencySet(tenantStaff, {
      code: 'COMPETENCY-TENANT-SCOPE',
      name: { th: 'แบบประเมินกลาง', en: 'Tenant-wide form' },
      status: 'active'
    })) as { id: string }
    const tenantVersion = (await service.createCompetencyVersion(
      tenantStaff,
      tenantSet.id,
      [questions[1]!]
    )) as { id: string }
    await expect(
      service.publishCompetencyVersion(tenantVersion.id, tenantStaff)
    ).resolves.toMatchObject({ status: 'published' })
  })

  it('rejects a placement linked to another student and a placement outside actor scope', async () => {
    const { assignment, student } = await seedWorkflow('assignment-scope')
    const otherStudent = await students.create({
      studentId: 'assignment-other-student',
      name: { th: 'นักศึกษาอีกคน', en: 'Another student' },
      email: 'assignment-other-student@example.test',
      schoolId: testSchoolId,
      programId: testProgramId,
      academicTermId: student.academicTermId
    })
    const organization = await organizations.create({
      organizationCode: 'ORG-SCOPE',
      name: { th: 'บริษัททดสอบ', en: 'Test Company' },
      status: 'active'
    })
    const evaluator = await evaluators.create({
      organizationId: organization.id,
      email: 'evaluator-scope@example.test',
      name: { th: 'ผู้ประเมิน', en: 'Evaluator' },
      position: { th: 'หัวหน้างาน', en: 'Supervisor' },
      status: 'active'
    })
    const otherPlacement = await placements.create({
      studentId: otherStudent.id,
      organizationId: organization.id,
      academicTermId: student.academicTermId,
      schoolId: testSchoolId,
      programId: testProgramId,
      positionTitle: { th: 'นักศึกษาฝึกงาน', en: 'Intern' },
      startsAt: new Date(Date.now() - 86_400_000),
      endsAt: new Date(Date.now() + 86_400_000),
      status: 'active'
    })
    const staff: AuthenticatedActor = {
      id: 'staff-assignment-scope',
      email: 'staff@example.test',
      displayName: 'Test staff',
      roles: ['internshipStaff'],
      scope: {
        tenant: false,
        schoolIds: [testSchoolId],
        programIds: [testProgramId]
      }
    }

    await expect(
      service.createAssignment(staff, {
        cycleId: assignment.cycleId,
        placementId: otherPlacement.id,
        evaluatorId: evaluator.id,
        studentId: student.studentId,
        schoolId: testSchoolId,
        programId: testProgramId,
        deadlineAt: new Date(Date.now() + 1_800_000),
        status: 'pending',
        evaluationVersion: 1
      })
    ).rejects.toMatchObject({
      status: 422,
      response: { code: 'ASSIGNMENT_STUDENT_MISMATCH' }
    })

    const unrelatedOrganization = await organizations.create({
      organizationCode: 'ORG-SCOPE-OTHER',
      name: { th: 'บริษัทอื่น', en: 'Other Company' },
      status: 'active'
    })
    const unrelatedEvaluator = await evaluators.create({
      organizationId: unrelatedOrganization.id,
      email: 'unrelated-evaluator@example.test',
      name: { th: 'ผู้ประเมินอีกคน', en: 'Another evaluator' },
      position: { th: 'หัวหน้างาน', en: 'Supervisor' },
      status: 'active'
    })
    await expect(
      service.createAssignment(staff, {
        cycleId: assignment.cycleId,
        placementId: otherPlacement.id,
        evaluatorId: unrelatedEvaluator.id,
        studentId: otherStudent.studentId,
        schoolId: testSchoolId,
        programId: testProgramId,
        deadlineAt: new Date(Date.now() + 1_800_000),
        status: 'pending',
        evaluationVersion: 1
      })
    ).rejects.toMatchObject({
      status: 422,
      response: { code: 'EVALUATOR_ORGANIZATION_MISMATCH' }
    })
    await expect(
      service.createAssignment(staff, {
        cycleId: assignment.cycleId,
        placementId: otherPlacement.id,
        evaluatorId: evaluator.id,
        studentId: otherStudent.studentId,
        schoolId: testSchoolId,
        programId: testProgramId,
        deadlineAt: new Date(Date.now() + 7_200_000),
        status: 'pending',
        evaluationVersion: 1
      })
    ).rejects.toMatchObject({
      status: 422,
      response: { code: 'ASSIGNMENT_DEADLINE_INVALID' }
    })

    const outOfScopeStudent = await students.create({
      studentId: 'assignment-outside-student',
      name: { th: 'นักศึกษานอกขอบเขต', en: 'Out-of-scope student' },
      email: 'assignment-outside-student@example.test',
      schoolId: 'school-outside',
      programId: 'program-outside',
      academicTermId: student.academicTermId
    })
    const outOfScopePlacement = await placements.create({
      studentId: outOfScopeStudent.id,
      organizationId: organization.id,
      academicTermId: student.academicTermId,
      schoolId: 'school-outside',
      programId: 'program-outside',
      positionTitle: { th: 'นักศึกษาฝึกงาน', en: 'Intern' },
      startsAt: new Date(Date.now() - 86_400_000),
      endsAt: new Date(Date.now() + 86_400_000),
      status: 'active'
    })

    await expect(
      service.createAssignment(staff, {
        cycleId: assignment.cycleId,
        placementId: outOfScopePlacement.id,
        evaluatorId: evaluator.id,
        studentId: outOfScopeStudent.studentId,
        schoolId: testSchoolId,
        programId: testProgramId,
        deadlineAt: new Date(Date.now() + 1_800_000),
        status: 'pending',
        evaluationVersion: 1
      })
    ).rejects.toMatchObject({ status: 404 })
    await expect(
      assignments.countDocuments({ cycleId: assignment.cycleId })
    ).resolves.toBe(1)
  })

  it('rejects assignment cycles whose term or school applicability differs from the placement', async () => {
    const { assignment, student } = await seedWorkflow('assignment-cycle-match')
    const organization = await organizations.create({
      organizationCode: 'ORG-CYCLE-MATCH',
      name: { th: 'บริษัททดสอบ', en: 'Test Company' },
      status: 'active'
    })
    const evaluator = await evaluators.create({
      organizationId: organization.id,
      email: 'evaluator-cycle-match@example.test',
      name: { th: 'ผู้ประเมิน', en: 'Evaluator' },
      position: { th: 'หัวหน้างาน', en: 'Supervisor' },
      status: 'active'
    })
    const placement = await placements.create({
      studentId: student.id,
      organizationId: organization.id,
      academicTermId: student.academicTermId,
      schoolId: testSchoolId,
      programId: testProgramId,
      positionTitle: { th: 'นักศึกษาฝึกงาน', en: 'Intern' },
      startsAt: new Date(Date.now() - 86_400_000),
      endsAt: new Date(Date.now() + 86_400_000),
      status: 'active'
    })
    const staff: AuthenticatedActor = {
      id: 'staff-assignment-cycle-match',
      email: 'staff@example.test',
      displayName: 'Test staff',
      roles: ['internshipStaff'],
      scope: {
        tenant: false,
        schoolIds: [testSchoolId],
        programIds: [testProgramId]
      }
    }
    const input = {
      cycleId: assignment.cycleId,
      placementId: placement.id,
      evaluatorId: evaluator.id,
      studentId: student.studentId,
      schoolId: testSchoolId,
      programId: testProgramId,
      deadlineAt: new Date(Date.now() + 1_800_000),
      status: 'pending' as const,
      evaluationVersion: 1
    }

    await placements.updateOne(
      { _id: placement.id },
      { $set: { status: 'completed' } }
    )
    await expect(service.createAssignment(staff, input)).rejects.toMatchObject({
      status: 409,
      response: { code: 'PLACEMENT_NOT_ASSIGNABLE' }
    })
    await placements.updateOne(
      { _id: placement.id },
      { $set: { status: 'active' } }
    )

    await cycles.updateOne(
      { _id: assignment.cycleId },
      { $set: { academicTermId: 'term-other' } }
    )
    await expect(service.createAssignment(staff, input)).rejects.toMatchObject({
      status: 422,
      response: { code: 'ASSIGNMENT_TERM_MISMATCH' }
    })

    await cycles.updateOne(
      { _id: assignment.cycleId },
      {
        $set: {
          academicTermId: student.academicTermId,
          schoolId: 'school-outside',
          programId: 'program-outside'
        }
      }
    )
    await expect(service.createAssignment(staff, input)).rejects.toMatchObject({
      status: 404
    })
    await expect(
      assignments.countDocuments({ cycleId: assignment.cycleId })
    ).resolves.toBe(1)
  })

  it('summarizes cycle roster readiness without returning student records', async () => {
    const { assignment, student } = await seedWorkflow('cycle-readiness')
    const cycle = await cycles.findById(assignment.cycleId).exec()
    if (!cycle) throw new Error('Expected seeded cycle')
    await cycles.updateOne(
      { _id: cycle._id },
      { $set: { schoolId: testSchoolId, programId: testProgramId } }
    )
    const staff: AuthenticatedActor = {
      id: 'staff-cycle-readiness',
      email: 'staff-readiness@example.test',
      displayName: 'Test staff',
      roles: ['internshipStaff'],
      scope: {
        tenant: false,
        schoolIds: [testSchoolId],
        programIds: [testProgramId]
      }
    }

    const withoutPlacement = (await service.previewCycle(
      staff,
      assignment.cycleId
    )) as {
      readiness: {
        candidateStudentCount: number
        eligibleStudentCount: number
        missingStudentDataCount: number
        missingPlacementCount: number
        missingEvaluatorCount: number
      }
    }
    expect(withoutPlacement.readiness).toEqual({
      candidateStudentCount: 1,
      eligibleStudentCount: 0,
      missingStudentDataCount: 0,
      missingPlacementCount: 1,
      missingEvaluatorCount: 0
    })

    const organization = await organizations.create({
      organizationCode: 'ORG-CYCLE-READINESS',
      name: { th: 'สถานประกอบการทดสอบ', en: 'Readiness Company' },
      status: 'active'
    })
    await placements.create({
      studentId: student.id,
      organizationId: organization.id,
      academicTermId: student.academicTermId,
      schoolId: testSchoolId,
      programId: testProgramId,
      positionTitle: { th: 'นักศึกษาฝึกงาน', en: 'Intern' },
      startsAt: new Date(cycle.opensAt.getTime() - 86_400_000),
      endsAt: new Date(cycle.closesAt.getTime() + 86_400_000),
      status: 'planned'
    })
    const withoutEvaluator = (await service.previewCycle(
      staff,
      assignment.cycleId
    )) as {
      readiness: {
        missingPlacementCount: number
        missingEvaluatorCount: number
      }
    }
    expect(withoutEvaluator.readiness).toMatchObject({
      missingPlacementCount: 0,
      missingEvaluatorCount: 1
    })

    await evaluators.create({
      organizationId: organization.id,
      email: 'evaluator-cycle-readiness@example.test',
      name: { th: 'ผู้ประเมิน', en: 'Evaluator' },
      position: { th: 'หัวหน้างาน', en: 'Supervisor' },
      status: 'active'
    })
    const ready = (await service.previewCycle(staff, assignment.cycleId)) as {
      readiness: {
        candidateStudentCount: number
        eligibleStudentCount: number
        missingStudentDataCount: number
        missingPlacementCount: number
        missingEvaluatorCount: number
      }
      students?: unknown
    }
    expect(ready.readiness).toEqual({
      candidateStudentCount: 1,
      eligibleStudentCount: 1,
      missingStudentDataCount: 0,
      missingPlacementCount: 0,
      missingEvaluatorCount: 0
    })
    expect(ready).not.toHaveProperty('students')
  })

  it('restricts cycle preview and activation to the scope of the role granting cycle management', async () => {
    const { assignment } = await seedWorkflow('cycle-scope-authorization')
    await cycles.updateOne(
      { _id: assignment.cycleId },
      {
        $set: {
          status: 'draft',
          schoolId: 'school-a',
          programId: 'program-a'
        }
      }
    )
    const multiRoleStaff: AuthenticatedActor = {
      id: 'multi-role-cycle-staff',
      email: 'multi-role-staff@example.test',
      displayName: 'Multi-role staff',
      roles: ['internshipStaff', 'coordinator'],
      scope: {
        tenant: false,
        schoolIds: ['school-a', 'school-b'],
        programIds: ['program-a', 'program-b']
      },
      roleScopes: [
        {
          role: 'internshipStaff',
          tenant: false,
          schoolIds: ['school-a'],
          programIds: ['program-a']
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
      service.previewCycle(multiRoleStaff, assignment.cycleId)
    ).resolves.toMatchObject({ valid: true })
    await expect(
      service.activateCycle(
        multiRoleStaff,
        assignment.cycleId,
        'request-cycle-activation'
      )
    ).resolves.toMatchObject({ status: 'active' })
    await expect(
      auditLogs.countDocuments({ action: 'cycles.activated' })
    ).resolves.toBe(1)

    await cycles.updateOne(
      { _id: assignment.cycleId },
      {
        $set: {
          status: 'draft',
          schoolId: 'school-b',
          programId: 'program-b'
        }
      }
    )
    await expect(
      service.previewCycle(multiRoleStaff, assignment.cycleId)
    ).rejects.toMatchObject({ status: 404 })
    await expect(
      service.activateCycle(multiRoleStaff, assignment.cycleId)
    ).rejects.toMatchObject({ status: 404 })
    await expect(
      cycles.findById(assignment.cycleId).select('status').lean()
    ).resolves.toMatchObject({ status: 'draft' })
    await expect(
      auditLogs.countDocuments({ action: 'cycles.activated' })
    ).resolves.toBe(1)
  })

  it('lists applicable global cycles only when they contain placements in the actor scope', async () => {
    const { student } = await seedWorkflow(
      'cycle-global-visible',
      'cycle-global-visible'
    )
    const unrelated = await seedWorkflow(
      'cycle-global-unrelated',
      'cycle-global-unrelated'
    )
    const visibleCycle = await cycles.findOne({ code: 'cycle-global-visible' })
    if (!visibleCycle) throw new Error('Expected global cycle')
    const organization = await organizations.create({
      organizationCode: 'ORG-CYCLE-GLOBAL-VISIBILITY',
      name: { th: 'บริษัททดสอบ', en: 'Test Company' },
      status: 'active'
    })
    const placementInput = {
      organizationId: organization.id,
      academicTermId: student.academicTermId,
      positionTitle: { th: 'นักศึกษาฝึกงาน', en: 'Intern' },
      startsAt: new Date(Date.now() - 86_400_000),
      endsAt: new Date(Date.now() + 86_400_000),
      status: 'active' as const
    }
    await placements.create({
      ...placementInput,
      studentId: student.id,
      schoolId: testSchoolId,
      programId: testProgramId
    })
    await placements.create({
      ...placementInput,
      studentId: 'foreign-cycle-student',
      schoolId: 'school-foreign',
      programId: 'program-foreign'
    })
    await cycles.create({
      code: 'cycle-foreign-scoped',
      name: { th: 'รอบต่างสำนัก', en: 'Foreign cycle' },
      competencySetVersionId: visibleCycle.competencySetVersionId,
      academicTermId: student.academicTermId,
      schoolId: 'school-foreign',
      programId: 'program-foreign',
      opensAt: visibleCycle.opensAt,
      closesAt: visibleCycle.closesAt,
      status: 'active'
    })
    const staff: AuthenticatedActor = {
      id: 'staff-global-cycle-list',
      email: 'staff-global-cycle@example.test',
      displayName: 'Test staff',
      roles: ['internshipStaff'],
      scope: {
        tenant: false,
        schoolIds: [testSchoolId],
        programIds: [testProgramId]
      }
    }

    const result = (await service.listCycles(staff, {
      page: 1,
      pageSize: 25
    })) as {
      items: readonly {
        code: string
        academicTerm?: {
          id: string
          academicYear: number
          semester: string
        }
      }[]
      meta: { total: number }
    }

    expect(result.items.map(({ code }) => code)).toEqual([visibleCycle.code])
    expect(result.items[0]?.academicTerm).toEqual({
      id: student.academicTermId,
      academicYear: 2569,
      semester: '1'
    })
    expect(result.meta.total).toBe(1)
    expect(unrelated.assignment.cycleId).not.toBe(visibleCycle.id)
  })

  it('limits Student and Evaluator cycle reads to own placements and assignments', async () => {
    const own = await seedWorkflow(
      'cycle-participant-own',
      'cycle-participant-own'
    )
    const foreign = await seedWorkflow(
      'cycle-participant-foreign',
      'cycle-participant-foreign'
    )
    const ownCycle = await cycles.findById(own.assignment.cycleId).exec()
    if (!ownCycle) throw new Error('Expected own cycle')
    const organization = await organizations.create({
      organizationCode: 'ORG-CYCLE-PARTICIPANT',
      name: { th: 'บริษัททดสอบ', en: 'Test Company' },
      status: 'active'
    })
    await placements.create({
      studentId: own.student.id,
      organizationId: organization.id,
      academicTermId: own.student.academicTermId,
      schoolId: testSchoolId,
      programId: testProgramId,
      positionTitle: { th: 'นักศึกษาฝึกงาน', en: 'Intern' },
      startsAt: new Date(Date.now() - 86_400_000),
      endsAt: new Date(Date.now() + 86_400_000),
      status: 'active'
    })
    const unassignedOwnCycle = await cycles.create({
      code: 'cycle-participant-own-unassigned',
      name: { th: 'รอบของนักศึกษา', en: 'Student cycle' },
      competencySetVersionId: ownCycle.competencySetVersionId,
      academicTermId: own.student.academicTermId,
      opensAt: ownCycle.opensAt,
      closesAt: ownCycle.closesAt,
      status: 'active'
    })
    await cycles.create({
      code: 'cycle-participant-own-draft',
      name: { th: 'รอบร่าง', en: 'Draft cycle' },
      competencySetVersionId: ownCycle.competencySetVersionId,
      academicTermId: own.student.academicTermId,
      opensAt: ownCycle.opensAt,
      closesAt: ownCycle.closesAt,
      status: 'draft'
    })
    const student: AuthenticatedActor = {
      id: `student-user-${own.student.studentId}`,
      email: `${own.student.studentId}-student@example.test`,
      displayName: 'Test student',
      roles: ['student'],
      scope: {
        tenant: false,
        schoolIds: [],
        programIds: [],
        studentId: own.student.studentId
      }
    }

    const studentCycles = (await service.listCycles(student, {
      page: 1,
      pageSize: 25
    })) as {
      items: readonly {
        id: string
        academicTerm?: { id: string; academicYear: number; semester: string }
      }[]
      meta: { total: number }
    }
    expect(studentCycles.items.map(({ id }) => id).sort()).toEqual(
      [ownCycle.id, unassignedOwnCycle.id].sort()
    )
    expect(studentCycles.meta.total).toBe(2)
    expect(studentCycles.items).toContainEqual(
      expect.objectContaining({
        academicTerm: {
          id: own.student.academicTermId,
          academicYear: 2569,
          semester: '1'
        }
      })
    )

    const evaluatorCycles = (await service.listCycles(own.actor, {
      page: 1,
      pageSize: 25
    })) as { items: readonly { id: string }[]; meta: { total: number } }
    expect(evaluatorCycles.items.map(({ id }) => id)).toEqual([ownCycle.id])
    expect(evaluatorCycles.meta.total).toBe(1)
    expect(foreign.assignment.cycleId).not.toBe(ownCycle.id)
  })

  it('validates cycle references and commits creation with its audit event', async () => {
    const { assignment, student } = await seedWorkflow('cycle-create-contract')
    const sourceCycle = await cycles.findById(assignment.cycleId).exec()
    if (!sourceCycle) throw new Error('Expected seeded cycle')
    const staff: AuthenticatedActor = {
      id: 'staff-cycle-create',
      email: 'staff@example.test',
      displayName: 'Test staff',
      roles: ['internshipStaff'],
      scope: {
        tenant: false,
        schoolIds: [testSchoolId],
        programIds: [testProgramId]
      }
    }
    const cycleInput = {
      code: 'cycle-created-through-service',
      name: { th: 'รอบใหม่', en: 'New cycle' },
      competencySetVersionId: sourceCycle.competencySetVersionId,
      academicTermId: student.academicTermId,
      schoolId: testSchoolId,
      programId: testProgramId,
      opensAt: new Date(Date.now() + 60_000),
      closesAt: new Date(Date.now() + 3_600_000),
      status: 'draft' as const
    }

    await expect(
      service.createCycle(staff, {
        ...cycleInput,
        academicTermId: 'not-an-object-id'
      })
    ).rejects.toMatchObject({
      status: 422,
      response: { code: 'CYCLE_REFERENCE_INVALID' }
    })

    const created = (await service.createCycle(
      staff,
      cycleInput,
      'request-cycle-create'
    )) as { id: string; status: string }
    expect(created.status).toBe('draft')
    await expect(
      schools.findById(testSchoolId).select('__v').lean()
    ).resolves.toMatchObject({ __v: 1 })
    await expect(
      programs.findById(testProgramId).select('__v').lean()
    ).resolves.toMatchObject({ __v: 1 })
    await expect(
      academicTerms.findById(student.academicTermId).select('__v').lean()
    ).resolves.toMatchObject({ __v: 1 })
    await expect(
      auditLogs.findOne({ action: 'cycles.created' }).lean()
    ).resolves.toMatchObject({
      requestId: 'request-cycle-create',
      metadata: { cycleId: created.id }
    })

    const archivedTerm = await academicTerms.create({
      code: 'TERM-ARCHIVED-CYCLE',
      academicYear: 2569,
      semester: '1',
      startsAt: new Date(Date.now() - 86_400_000),
      endsAt: new Date(Date.now() + 86_400_000),
      status: 'archived'
    })
    await expect(
      service.createCycle(staff, {
        ...cycleInput,
        code: 'cycle-archived-term',
        academicTermId: archivedTerm.id
      })
    ).rejects.toMatchObject({
      status: 422,
      response: { code: 'ACTIVE_ACADEMIC_TERM_REQUIRED' }
    })

    const auditWrite = vi
      .spyOn(auditService, 'record')
      .mockRejectedValue(new Error('simulated cycle audit failure'))
    try {
      await expect(
        service.createCycle(staff, {
          ...cycleInput,
          code: 'cycle-audit-failure'
        })
      ).rejects.toThrow('simulated cycle audit failure')
    } finally {
      auditWrite.mockRestore()
    }
    await expect(
      cycles.countDocuments({ code: 'cycle-audit-failure' })
    ).resolves.toBe(0)
    await expect(
      auditLogs.countDocuments({ action: 'cycles.created' })
    ).resolves.toBe(1)
  })

  it('serializes cycle creation against Program archival', async () => {
    const { assignment } = await seedWorkflow('cycle-program-archive-race')
    const sourceCycle = await cycles.findById(assignment.cycleId).exec()
    if (!sourceCycle) throw new Error('Expected seeded cycle')
    await cycles.updateOne(
      { _id: sourceCycle._id },
      { $set: { status: 'closed' } }
    )
    const academic = new AcademicService(
      schools,
      programs,
      courses,
      academicTerms,
      auditService,
      cycles,
      placements
    )
    const admin: AuthenticatedActor = {
      id: 'admin-cycle-archive-race',
      email: 'admin@example.test',
      displayName: 'Test admin',
      roles: ['systemAdmin'],
      scope: { tenant: true, schoolIds: [], programIds: [] }
    }
    const staff: AuthenticatedActor = {
      id: 'staff-cycle-archive-race',
      email: 'staff@example.test',
      displayName: 'Test staff',
      roles: ['internshipStaff'],
      scope: {
        tenant: false,
        schoolIds: [testSchoolId],
        programIds: [testProgramId]
      }
    }

    const [archiveResult, cycleResult] = await Promise.allSettled([
      academic.updateProgram(admin, testProgramId, { status: 'archived' }),
      service.createCycle(staff, {
        code: 'cycle-created-during-program-archive',
        name: { th: 'รอบแข่งกัน', en: 'Race cycle' },
        competencySetVersionId: sourceCycle.competencySetVersionId,
        academicTermId: sourceCycle.academicTermId,
        schoolId: testSchoolId,
        programId: testProgramId,
        opensAt: new Date(Date.now() + 60_000),
        closesAt: new Date(Date.now() + 3_600_000),
        status: 'draft'
      })
    ])

    expect(
      [archiveResult, cycleResult].filter(
        (result) => result.status === 'fulfilled'
      )
    ).toHaveLength(1)
    const savedProgram = await programs
      .findById(testProgramId)
      .select('status')
      .lean()
      .exec()
    const racingCycles = await cycles.countDocuments({
      code: 'cycle-created-during-program-archive'
    })
    if (savedProgram?.status === 'archived') {
      expect(racingCycles).toBe(0)
    } else {
      expect(savedProgram?.status).toBe('active')
      expect(racingCycles).toBe(1)
    }
  })

  it('closes an in-scope cycle atomically and prevents later draft or submit writes', async () => {
    const { assignment, actor } = await seedWorkflow('cycle-close-flow')
    await cycles.updateOne(
      { _id: assignment.cycleId },
      { $set: { schoolId: testSchoolId, programId: testProgramId } }
    )
    const staff: AuthenticatedActor = {
      id: 'staff-cycle-close',
      email: 'staff@example.test',
      displayName: 'Test staff',
      roles: ['internshipStaff'],
      scope: {
        tenant: false,
        schoolIds: [testSchoolId],
        programIds: [testProgramId]
      }
    }
    const outsideStaff: AuthenticatedActor = {
      ...staff,
      id: 'staff-cycle-close-outside',
      scope: {
        tenant: false,
        schoolIds: ['64b000000000000000000099'],
        programIds: ['64b000000000000000000098']
      }
    }

    await expect(
      service.closeCycle(outsideStaff, assignment.cycleId)
    ).rejects.toMatchObject({ status: 404 })

    const closed = (await service.closeCycle(
      staff,
      assignment.cycleId,
      'request-cycle-close'
    )) as { status: string }
    expect(closed.status).toBe('closed')
    await expect(
      cycles.findById(assignment.cycleId).select('__v').lean()
    ).resolves.toMatchObject({ __v: 1 })
    await expect(
      assignments.findById(assignment.id).select('status').lean()
    ).resolves.toMatchObject({ status: 'expired' })
    await expect(
      auditLogs.findOne({ action: 'cycles.closed' }).lean()
    ).resolves.toMatchObject({
      requestId: 'request-cycle-close',
      resourceScopes: [
        { schoolIds: [testSchoolId], programIds: [testProgramId] }
      ],
      metadata: { cycleId: assignment.cycleId, expiredAssignmentCount: 1 }
    })

    await expect(
      service.saveDraft(actor, assignment.id, {
        answers: { 'hard-1': 4, 'soft-1': 3 },
        revision: 0
      })
    ).rejects.toMatchObject({
      status: 409,
      response: { code: 'ASSIGNMENT_NOT_EDITABLE' }
    })
    await expect(
      service.submit(actor, assignment.id, {
        answers: { 'hard-1': 4, 'soft-1': 3 },
        idempotencyKey: 'cycle-close-submit'
      })
    ).rejects.toMatchObject({
      status: 409,
      response: { code: 'ASSIGNMENT_NOT_EDITABLE' }
    })
    await expect(
      drafts.countDocuments({ assignmentId: assignment.id })
    ).resolves.toBe(0)
    await expect(
      evaluations.countDocuments({ assignmentId: assignment.id })
    ).resolves.toBe(0)

    await expect(
      service.closeCycle(
        staff,
        assignment.cycleId,
        'request-cycle-close-replay'
      )
    ).resolves.toMatchObject({ status: 'closed' })
    await expect(
      auditLogs.countDocuments({ action: 'cycles.closed' })
    ).resolves.toBe(1)
  })

  it('submits atomically, removes the draft, keeps assignment status canonical, and replays idempotently', async () => {
    const { assignment, actor, student } = await seedWorkflow('student-1001')
    const studentActor: AuthenticatedActor = {
      id: `student-user-${student.studentId}`,
      email: `${student.studentId}-student@example.test`,
      displayName: 'Test student',
      roles: ['student'],
      scope: {
        tenant: false,
        schoolIds: [],
        programIds: [],
        studentId: student.studentId
      }
    }
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
    const evaluatorView = (await service.getEvaluation(
      actor,
      assignment.id
    )) as {
      draft: { answers: Readonly<Record<string, unknown>> } | null
    }
    expect(evaluatorView.draft?.answers).toEqual(answers)
    const studentViewBeforeSubmit = (await service.getEvaluation(
      studentActor,
      assignment.id
    )) as {
      draft: unknown
      evaluations: readonly unknown[]
    }
    expect(studentViewBeforeSubmit.draft).toBeNull()
    expect(studentViewBeforeSubmit.evaluations).toHaveLength(0)

    const first = (await service.submit(
      actor,
      assignment.id,
      {
        answers,
        idempotencyKey: 'submit-once'
      },
      'request-evaluation-submit'
    )) as {
      id: string
      aggregateScore: number | null
      categoryScores: {
        hardSkill: { average: number | null; answeredCount: number }
        softSkill: { average: number | null; answeredCount: number }
      }
    }
    expect(
      await auditLogs.countDocuments({
        action: 'evaluations.submitted',
        requestId: 'request-evaluation-submit'
      })
    ).toBe(1)
    const replay = (await service.submit(actor, assignment.id, {
      answers,
      idempotencyKey: 'submit-once'
    })) as { id: string }

    expect(replay.id).toBe(first.id)
    expect(
      await auditLogs.countDocuments({ action: 'evaluations.submitted' })
    ).toBe(1)
    await expect(
      auditLogs.findOne({ action: 'evaluations.submitted' }).lean()
    ).resolves.toMatchObject({
      resourceScopes: [
        {
          schoolIds: [testSchoolId],
          programIds: [testProgramId]
        }
      ]
    })
    expect(first.aggregateScore).toBeNull()
    expect(first.categoryScores.hardSkill).toEqual({
      average: 4,
      answeredCount: 1,
      scaleMin: 1,
      scaleMax: 5
    })
    expect(first.categoryScores.softSkill.average).toBe(3)
    expect(first.categoryScores.softSkill.answeredCount).toBe(1)
    const studentViewAfterSubmit = (await service.getEvaluation(
      studentActor,
      assignment.id
    )) as { draft: unknown; evaluations: readonly { id: string }[] }
    expect(studentViewAfterSubmit.draft).toBeNull()
    expect(studentViewAfterSubmit.evaluations).toHaveLength(1)
    expect(studentViewAfterSubmit.evaluations[0]?.id).toBe(first.id)
    await expect(
      drafts.countDocuments({ assignmentId: assignment.id })
    ).resolves.toBe(0)
    await expect(
      evaluations.countDocuments({ assignmentId: assignment.id })
    ).resolves.toBe(1)
    await expect(
      assignments.findById(assignment.id).select('status').lean()
    ).resolves.toMatchObject({ status: 'submitted' })
    expect(
      await auditLogs.countDocuments({ action: 'evaluations.submitted' })
    ).toBe(1)
    const studentProjection = await students
      .findById(student.id)
      .select('evaluationStatus')
      .lean()
    expect(studentProjection?.evaluationStatus).toBeUndefined()

    await expect(
      service.submit(actor, assignment.id, {
        answers: { ...answers, 'hard-1': 5 },
        idempotencyKey: 'submit-once'
      })
    ).rejects.toMatchObject({ status: 409 })
  })

  it('saves evaluator drafts with optimistic revisions and enforces assignment ownership and expiry', async () => {
    const own = await seedWorkflow('student-draft-owner')
    const other = await seedWorkflow('student-draft-other', 'cycle-draft-other')
    const firstAnswers = { 'hard-1': 2, 'soft-1': 3 }
    const secondAnswers = { 'hard-1': 4, 'soft-1': 5 }

    await expect(
      service.saveDraft(own.actor, own.assignment.id, {
        answers: firstAnswers,
        revision: 0
      })
    ).resolves.toMatchObject({ revision: 1, answers: firstAnswers })
    await expect(
      service.saveDraft(own.actor, own.assignment.id, {
        answers: secondAnswers,
        revision: 1
      })
    ).resolves.toMatchObject({ revision: 2, answers: secondAnswers })

    await expect(
      service.saveDraft(own.actor, own.assignment.id, {
        answers: firstAnswers,
        revision: 1
      })
    ).rejects.toMatchObject({
      status: 409,
      response: { code: 'VERSION_CONFLICT' }
    })

    await expect(
      service.saveDraft(other.actor, own.assignment.id, {
        answers: firstAnswers,
        revision: 2
      })
    ).rejects.toMatchObject({ status: 404 })

    await expect(
      service.getEvaluation(own.actor, own.assignment.id)
    ).resolves.toMatchObject({
      draft: { revision: 2, answers: secondAnswers }
    })
    await expect(
      drafts.countDocuments({ assignmentId: own.assignment.id })
    ).resolves.toBe(1)
    await expect(
      assignments.findById(own.assignment.id).select('status').lean()
    ).resolves.toMatchObject({ status: 'inProgress' })
    await expect(
      drafts.countDocuments({ assignmentId: other.assignment.id })
    ).resolves.toBe(0)

    const expired = await seedWorkflow('student-draft-expired', 'cycle-expired')
    await assignments.updateOne(
      { _id: expired.assignment.id },
      { $set: { deadlineAt: new Date(Date.now() - 1_000) } }
    )
    await expect(
      service.saveDraft(expired.actor, expired.assignment.id, {
        answers: firstAnswers,
        revision: 0
      })
    ).rejects.toMatchObject({
      status: 409,
      response: { code: 'ASSIGNMENT_NOT_EDITABLE' }
    })
    await expect(
      drafts.countDocuments({ assignmentId: expired.assignment.id })
    ).resolves.toBe(0)
    await expect(
      assignments.findById(expired.assignment.id).select('status').lean()
    ).resolves.toMatchObject({ status: 'pending' })

    const closedCycle = await seedWorkflow(
      'student-draft-closed-cycle',
      'cycle-draft-closed'
    )
    await cycles.updateOne(
      { _id: closedCycle.assignment.cycleId },
      { $set: { closesAt: new Date(Date.now() - 1_000) } }
    )
    await expect(
      service.saveDraft(closedCycle.actor, closedCycle.assignment.id, {
        answers: firstAnswers,
        revision: 0
      })
    ).rejects.toMatchObject({
      status: 409,
      response: { code: 'CYCLE_CLOSED' }
    })
    await expect(
      drafts.countDocuments({ assignmentId: closedCycle.assignment.id })
    ).resolves.toBe(0)
    await expect(
      assignments.findById(closedCycle.assignment.id).select('status').lean()
    ).resolves.toMatchObject({ status: 'pending' })
  })

  it('does not expose a Student assignment draft through another Evaluator role', async () => {
    const ownStudent = await seedWorkflow('dual-role-own-student')
    const evaluatorWork = await seedWorkflow(
      'dual-role-evaluator-work',
      'cycle-dual-role-evaluator'
    )
    const ownAnswers = { 'hard-1': 2, 'soft-1': 3 }
    const evaluatorAnswers = { 'hard-1': 5, 'soft-1': 4 }

    await service.saveDraft(ownStudent.actor, ownStudent.assignment.id, {
      answers: ownAnswers,
      revision: 0
    })
    await service.saveDraft(evaluatorWork.actor, evaluatorWork.assignment.id, {
      answers: evaluatorAnswers,
      revision: 0
    })

    const combinedActor: AuthenticatedActor = {
      id: 'dual-role-user',
      email: 'dual-role@example.test',
      displayName: 'Dual role user',
      roles: ['student', 'evaluator'],
      scope: {
        tenant: false,
        schoolIds: [],
        programIds: [],
        studentId: ownStudent.student.studentId,
        assignmentId: evaluatorWork.assignment.id
      },
      roleScopes: [
        { role: 'student', tenant: false, schoolIds: [], programIds: [] },
        { role: 'evaluator', tenant: false, schoolIds: [], programIds: [] }
      ]
    }

    await expect(
      service.getEvaluation(combinedActor, ownStudent.assignment.id)
    ).resolves.toMatchObject({ draft: null, evaluations: [] })
    await expect(
      service.getEvaluation(combinedActor, evaluatorWork.assignment.id)
    ).resolves.toMatchObject({
      draft: { answers: evaluatorAnswers },
      evaluations: []
    })
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
    expect(
      await auditLogs.countDocuments({ action: 'evaluations.submitted' })
    ).toBe(1)
  })

  it('rejects missing required answers without changing workflow state', async () => {
    const { assignment, actor, student } =
      await seedWorkflow('student-required')

    await expect(
      service.submit(actor, assignment.id, {
        answers: { 'hard-1': 4 },
        idempotencyKey: 'missing-soft-skill'
      })
    ).rejects.toMatchObject({ status: 422 })

    await expect(
      evaluations.countDocuments({ assignmentId: assignment.id })
    ).resolves.toBe(0)
    await expect(
      assignments.findById(assignment.id).select('status').lean()
    ).resolves.toMatchObject({ status: 'pending' })
    expect(
      (await students.findById(student.id).select('evaluationStatus').lean())
        ?.evaluationStatus
    ).toBeUndefined()
    expect(
      await auditLogs.countDocuments({ action: 'evaluations.submitted' })
    ).toBe(0)
  })

  it('rejects out-of-range and wrong-type ratings without partial writes', async () => {
    const { assignment, actor } = await seedWorkflow('student-invalid-rating')

    await expect(
      service.submit(actor, assignment.id, {
        answers: { 'hard-1': 6, 'soft-1': 3 },
        idempotencyKey: 'rating-out-of-range'
      })
    ).rejects.toMatchObject({ status: 422 })
    await expect(
      service.submit(actor, assignment.id, {
        answers: { 'hard-1': '4', 'soft-1': 3 },
        idempotencyKey: 'rating-wrong-type'
      })
    ).rejects.toMatchObject({ status: 422 })

    await expect(
      evaluations.countDocuments({ assignmentId: assignment.id })
    ).resolves.toBe(0)
    await expect(
      assignments.findById(assignment.id).select('status').lean()
    ).resolves.toMatchObject({ status: 'pending' })
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

  it('rolls back final record and assignment status when draft cleanup fails', async () => {
    const { assignment, actor, student } = await seedWorkflow('student-1005')
    const draftCleanup = vi
      .spyOn(drafts, 'deleteOne')
      .mockImplementationOnce(() => {
        throw new Error('simulated draft cleanup failure')
      })

    try {
      await expect(
        service.submit(actor, assignment.id, {
          answers: { 'hard-1': 3, 'soft-1': 4 },
          idempotencyKey: 'rollback-check'
        })
      ).rejects.toThrow('simulated draft cleanup failure')
    } finally {
      draftCleanup.mockRestore()
    }

    await expect(
      evaluations.countDocuments({ assignmentId: assignment.id })
    ).resolves.toBe(0)
    await expect(
      assignments.findById(assignment.id).select('status').lean()
    ).resolves.toMatchObject({ status: 'pending' })
    expect(
      (await students.findById(student.id).select('evaluationStatus').lean())
        ?.evaluationStatus
    ).toBeUndefined()
    expect(
      await auditLogs.countDocuments({ action: 'evaluations.submitted' })
    ).toBe(0)
  })

  it('rolls back evaluation submission when its audit write fails', async () => {
    const { assignment, actor, student } = await seedWorkflow('student-audit')
    const auditWrite = vi
      .spyOn(auditService, 'record')
      .mockRejectedValueOnce(new Error('simulated audit persistence failure'))

    try {
      await expect(
        service.submit(
          actor,
          assignment.id,
          {
            answers: { 'hard-1': 3, 'soft-1': 4 },
            idempotencyKey: 'audit-failure'
          },
          'request-evaluation-audit-failure'
        )
      ).rejects.toThrow('simulated audit persistence failure')
    } finally {
      auditWrite.mockRestore()
    }

    await expect(
      evaluations.countDocuments({ assignmentId: assignment.id })
    ).resolves.toBe(0)
    await expect(
      assignments.findById(assignment.id).select('status').lean()
    ).resolves.toMatchObject({ status: 'pending' })
    expect(
      (await students.findById(student.id).select('evaluationStatus').lean())
        ?.evaluationStatus
    ).toBeUndefined()
    expect(
      await auditLogs.countDocuments({
        requestId: 'request-evaluation-audit-failure'
      })
    ).toBe(0)
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
    assignment: { id: string; cycleId: string }
    actor: AuthenticatedActor
    student: {
      id: string
      studentId: string
      academicTermId: string
    }
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
    const term = await academicTerms.create({
      code: `TERM-${studentId}`,
      academicYear: 2569,
      semester: '1',
      startsAt: new Date(Date.now() - 86_400_000),
      endsAt: new Date(Date.now() + 86_400_000),
      status: 'open'
    })
    const cycle = await cycles.create({
      code: cycleCode,
      name: { th: 'รอบทดสอบ', en: 'Test cycle' },
      competencySetVersionId: version.id,
      academicTermId: term.id,
      opensAt: new Date(Date.now() - 60_000),
      closesAt: new Date(Date.now() + 3_600_000),
      status: 'active'
    })
    const student = await students.create({
      studentId,
      name: { th: 'นักศึกษาทดสอบ', en: 'Test student' },
      email: `${studentId}@example.test`,
      schoolId: testSchoolId,
      programId: testProgramId,
      academicTermId: term.id
    })
    const assignment = await assignments.create({
      cycleId: cycle.id,
      placementId: `placement-${studentId}`,
      evaluatorId: `evaluator-${studentId}`,
      studentId,
      schoolId: testSchoolId,
      programId: testProgramId,
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

    return {
      assignment,
      actor,
      student: {
        id: student.id,
        studentId: student.studentId,
        academicTermId: term.id
      }
    }
  }
})
