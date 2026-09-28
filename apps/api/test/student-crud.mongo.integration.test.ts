import { MongoMemoryReplSet } from 'mongodb-memory-server-core'
import { createConnection, Types, type Connection, type Model } from 'mongoose'
import { HttpException } from '@nestjs/common'
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

import { AcademicService } from '../src/academic/academic.service.js'
import { AcademicController } from '../src/academic/academic.controller.js'
import type { AuthenticatedRequest } from '../src/common/http.js'
import { AuditLogRecord, AuditLogSchema } from '../src/audit/audit.schema.js'
import { AuditService } from '../src/audit/audit.service.js'
import {
  DocumentTemplateRecord,
  DocumentTemplateSchema,
  DocumentTemplateVersionRecord,
  DocumentTemplateVersionSchema,
  GeneratedDocumentRecord,
  GeneratedDocumentSchema
} from '../src/documents/document.schema.js'
import { DocumentsService } from '../src/documents/documents.service.js'
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
import {
  EvaluationAssignmentRecord,
  EvaluationAssignmentSchema,
  EvaluationCycleRecord,
  EvaluationCycleSchema
} from '../src/evaluations/evaluation.schema.js'
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
  MembersService,
  type StudentCreateInput
} from '../src/members/members.service.js'
import {
  migrateStudentEmailUniqueIndex,
  profileStudentEmailUniqueness
} from '../src/members/student-email-preflight.js'

const admin: AuthenticatedActor = {
  id: 'admin-1',
  email: 'admin@mfu.ac.th',
  displayName: 'Admin',
  roles: ['systemAdmin'],
  scope: { tenant: true, schoolIds: [], programIds: [] }
}

describe('Student CRUD email integrity on an isolated MongoDB replica set', () => {
  let replicaSet: MongoMemoryReplSet
  let connection: Connection
  let students: Model<StudentRecord>
  let assignments: Model<EvaluationAssignmentRecord>
  let cycles: Model<EvaluationCycleRecord>
  let terms: Model<AcademicTermRecord>
  let schools: Model<SchoolRecord>
  let programs: Model<ProgramRecord>
  let courses: Model<CourseRecord>
  let organizations: Model<OrganizationRecord>
  let evaluators: Model<EvaluatorRecord>
  let placements: Model<PlacementRecord>
  let documents: Model<GeneratedDocumentRecord>
  let documentTemplates: Model<DocumentTemplateRecord>
  let documentTemplateVersions: Model<DocumentTemplateVersionRecord>
  let service: MembersService
  let auditLogs: Model<AuditLogRecord>
  let auditService: AuditService
  let documentService: DocumentsService
  let schoolId: string
  let programId: string
  let courseId: string
  let otherSchoolId: string
  let otherProgramId: string
  let otherCourseId: string
  let organizationId: string

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
    organizations = connection.model(
      OrganizationRecord.name,
      OrganizationSchema
    )
    evaluators = connection.model(EvaluatorRecord.name, EvaluatorSchema)
    placements = connection.model(PlacementRecord.name, PlacementSchema)
    terms = connection.model(AcademicTermRecord.name, AcademicTermSchema)
    schools = connection.model(SchoolRecord.name, SchoolSchema)
    programs = connection.model(ProgramRecord.name, ProgramSchema)
    courses = connection.model(CourseRecord.name, CourseSchema)
    auditLogs = connection.model(AuditLogRecord.name, AuditLogSchema)
    auditService = new AuditService(auditLogs)
    assignments = connection.model(
      EvaluationAssignmentRecord.name,
      EvaluationAssignmentSchema
    )
    cycles = connection.model(EvaluationCycleRecord.name, EvaluationCycleSchema)
    documents = connection.model(
      GeneratedDocumentRecord.name,
      GeneratedDocumentSchema
    )
    documentTemplates = connection.model(
      DocumentTemplateRecord.name,
      DocumentTemplateSchema
    )
    documentTemplateVersions = connection.model(
      DocumentTemplateVersionRecord.name,
      DocumentTemplateVersionSchema
    )
    service = new MembersService(
      students,
      organizations,
      evaluators,
      placements,
      terms,
      assignments,
      cycles,
      schools,
      programs,
      courses,
      auditService
    )
    const documentConfig = {
      get: (key: string) =>
        ({
          S3_BUCKET: 'mfu-test-documents',
          S3_ENDPOINT: 'http://127.0.0.1:9000',
          S3_REGION: 'us-east-1',
          S3_FORCE_PATH_STYLE: true,
          S3_ACCESS_KEY_ID: 'test-access-key',
          S3_SECRET_ACCESS_KEY: 'test-secret-key'
        })[key]
    }
    documentService = new DocumentsService(
      { add: () => Promise.resolve({}) } as never,
      documentTemplates,
      documentTemplateVersions,
      documents,
      students,
      {} as never,
      assignments,
      documentConfig as never,
      { record: () => Promise.resolve() } as never,
      {} as never,
      terms,
      schools,
      programs,
      placements,
      organizations
    )
    await Promise.all([
      students.init(),
      organizations.init(),
      evaluators.init(),
      placements.init(),
      terms.init(),
      assignments.init(),
      cycles.init(),
      schools.init(),
      programs.init(),
      courses.init(),
      auditLogs.init(),
      documents.init(),
      documentTemplates.init(),
      documentTemplateVersions.init()
    ])
  }, 180_000)

  afterAll(async () => {
    await connection?.close()
    await replicaSet?.stop()
  }, 30_000)

  beforeEach(async () => {
    await Promise.all([
      students.deleteMany({}),
      connection.collection('organizations').deleteMany({}),
      connection.collection('evaluators').deleteMany({}),
      connection.collection('placements').deleteMany({}),
      terms.deleteMany({}),
      connection.collection('evaluationAssignments').deleteMany({}),
      cycles.deleteMany({}),
      documentTemplates.deleteMany({}),
      documentTemplateVersions.deleteMany({}),
      schools.deleteMany({}),
      programs.deleteMany({}),
      courses.deleteMany({}),
      auditLogs.deleteMany({}),
      documents.deleteMany({})
    ])
    const school = await schools.create({
      schoolCode: 'ADT',
      name: { th: 'สำนักวิชาเทคโนโลยีดิจิทัล', en: 'Digital Technology' },
      status: 'active'
    })
    schoolId = school.id
    const program = await programs.create({
      schoolId,
      programCode: 'SE',
      name: { th: 'วิศวกรรมซอฟต์แวร์', en: 'Software Engineering' },
      status: 'active'
    })
    programId = program.id
    const course = await courses.create({
      courseCode: 'INT100',
      programIds: [programId],
      name: { th: 'ฝึกงาน', en: 'Internship' },
      status: 'active'
    })
    courseId = course.id
    const otherSchool = await schools.create({
      schoolCode: 'LAW',
      name: { th: 'สำนักวิชานิติศาสตร์', en: 'Law' },
      status: 'active'
    })
    otherSchoolId = otherSchool.id
    const otherProgram = await programs.create({
      schoolId: otherSchoolId,
      programCode: 'LAW1',
      name: { th: 'นิติศาสตร์', en: 'Law' },
      status: 'active'
    })
    otherProgramId = otherProgram.id
    const otherCourse = await courses.create({
      courseCode: 'LAW100',
      programIds: [otherProgramId],
      name: { th: 'กฎหมาย', en: 'Law' },
      status: 'active'
    })
    otherCourseId = otherCourse.id
    const organization = await organizations.create({
      organizationCode: 'MFU-TEST',
      name: { th: 'องค์กรทดสอบ', en: 'Test Organization' },
      status: 'active'
    })
    organizationId = organization.id
  })

  function input(studentId: string, email: string): StudentCreateInput {
    return {
      studentId,
      name: { th: 'นักศึกษาตัวอย่าง', en: 'Example Student' },
      email,
      schoolId,
      programId
    }
  }

  it('blocks Program and School archive with live descendants, then preserves history', async () => {
    const academic = new AcademicService(
      schools,
      programs,
      courses,
      terms,
      auditService,
      cycles,
      placements
    )
    const cycle = await cycles.create({
      code: 'PROGRAM-ARCHIVE-CYCLE',
      name: { th: 'รอบทดสอบ', en: 'Test cycle' },
      competencySetVersionId: new Types.ObjectId().toString(),
      academicTermId: 'term-archive-test',
      schoolId,
      programId,
      opensAt: new Date('2026-06-01T00:00:00.000Z'),
      closesAt: new Date('2026-10-31T00:00:00.000Z'),
      status: 'draft'
    })

    await expect(
      academic.updateProgram(admin, programId, { status: 'archived' })
    ).rejects.toMatchObject({
      status: 409,
      response: { code: 'PROGRAM_HAS_OPEN_WORK' }
    })
    await expect(
      academic.updateSchool(admin, schoolId, { status: 'archived' })
    ).rejects.toMatchObject({
      status: 409,
      response: { code: 'SCHOOL_HAS_ACTIVE_PROGRAMS' }
    })

    await cycles.updateOne({ _id: cycle._id }, { $set: { status: 'closed' } })
    const placement = await placements.create({
      studentId: 'historical-student',
      organizationId,
      academicTermId: 'term-archive-test',
      schoolId,
      programId,
      positionTitle: { th: 'ฝึกงาน', en: 'Internship' },
      startsAt: new Date('2026-06-01T00:00:00.000Z'),
      endsAt: new Date('2026-10-31T00:00:00.000Z'),
      status: 'planned'
    })
    await expect(
      academic.updateProgram(admin, programId, { status: 'archived' })
    ).rejects.toMatchObject({
      status: 409,
      response: { code: 'PROGRAM_HAS_OPEN_WORK' }
    })

    await placements.updateOne(
      { _id: placement._id },
      { $set: { status: 'completed' } }
    )
    await expect(
      academic.updateProgram(admin, programId, { status: 'archived' })
    ).resolves.toMatchObject({ status: 'archived' })
    await expect(
      academic.updateSchool(admin, schoolId, { status: 'archived' })
    ).resolves.toMatchObject({ status: 'archived' })
    await expect(cycles.countDocuments({ _id: cycle._id })).resolves.toBe(1)
    await expect(
      placements.countDocuments({ _id: placement._id })
    ).resolves.toBe(1)
  })

  it('fails closed when School or Program archive guards are unavailable', async () => {
    const unguardedAcademic = new AcademicService(
      schools,
      programs,
      courses,
      terms,
      auditService
    )
    const emptySchool = await schools.create({
      schoolCode: 'EMPTY',
      name: { th: 'ว่าง', en: 'Empty' },
      status: 'active'
    })
    const emptyProgram = await programs.create({
      schoolId: emptySchool.id,
      programCode: 'EMPTY',
      name: { th: 'ว่าง', en: 'Empty' },
      status: 'active'
    })

    await expect(
      unguardedAcademic.updateProgram(admin, emptyProgram.id, {
        status: 'archived'
      })
    ).rejects.toMatchObject({
      status: 503,
      response: { code: 'ACADEMIC_REFERENCE_ARCHIVE_GUARD_UNAVAILABLE' }
    })
    await expect(
      unguardedAcademic.updateSchool(admin, emptySchool.id, {
        status: 'archived'
      })
    ).rejects.toMatchObject({
      status: 503,
      response: { code: 'ACADEMIC_REFERENCE_ARCHIVE_GUARD_UNAVAILABLE' }
    })
  })

  it('serializes Program archive against Placement creation', async () => {
    const academic = new AcademicService(
      schools,
      programs,
      courses,
      terms,
      auditService,
      cycles,
      placements
    )
    const term = await terms.create({
      code: 'PROGRAM-ARCHIVE-RACE',
      academicYear: 2581,
      semester: '1',
      startsAt: new Date('2038-06-01T00:00:00.000Z'),
      endsAt: new Date('2038-10-31T00:00:00.000Z'),
      status: 'open'
    })
    const student = await students.create({
      ...input('6631503991', 'program-archive-race@example.com'),
      academicTermId: term.id
    })

    const [archiveResult, placementResult] = await Promise.allSettled([
      academic.updateProgram(admin, programId, { status: 'archived' }),
      service.createPlacement(admin, {
        studentId: student.id,
        organizationId,
        academicTermId: term.id,
        schoolId,
        programId,
        positionTitle: { th: 'ฝึกงาน', en: 'Internship' },
        startsAt: new Date('2038-06-01T00:00:00.000Z'),
        endsAt: new Date('2038-10-31T00:00:00.000Z'),
        status: 'planned'
      })
    ])

    expect(
      [archiveResult, placementResult].filter(
        (result) => result.status === 'fulfilled'
      )
    ).toHaveLength(1)
    const savedProgram = await programs
      .findById(programId)
      .select('status')
      .lean()
      .exec()
    const livePlacementCount = await placements.countDocuments({
      schoolId,
      programId,
      status: { $in: ['planned', 'active'] }
    })
    if (savedProgram?.status === 'archived') {
      expect(livePlacementCount).toBe(0)
    } else {
      expect(savedProgram?.status).toBe('active')
      expect(livePlacementCount).toBe(1)
    }
  })

  it('serializes School archive against Program creation', async () => {
    const academic = new AcademicService(
      schools,
      programs,
      courses,
      terms,
      auditService,
      cycles,
      placements
    )
    const emptySchool = await schools.create({
      schoolCode: 'SCHOOL-ARCHIVE-RACE',
      name: { th: 'สำนักวิชาทดสอบ', en: 'Race School' },
      status: 'active'
    })

    const [archiveResult, programResult] = await Promise.allSettled([
      academic.updateSchool(admin, emptySchool.id, { status: 'archived' }),
      academic.createProgram(admin, {
        schoolId: emptySchool.id,
        programCode: 'RACE-PROGRAM',
        name: { th: 'หลักสูตรทดสอบ', en: 'Race Program' },
        status: 'active'
      })
    ])

    expect(
      [archiveResult, programResult].filter(
        (result) => result.status === 'fulfilled'
      )
    ).toHaveLength(1)
    const savedSchool = await schools
      .findById(emptySchool.id)
      .select('status')
      .lean()
      .exec()
    const activeProgramCount = await programs.countDocuments({
      schoolId: emptySchool.id,
      status: 'active'
    })
    if (savedSchool?.status === 'archived') {
      expect(activeProgramCount).toBe(0)
    } else {
      expect(savedSchool?.status).toBe('active')
      expect(activeProgramCount).toBe(1)
    }
  })

  it('blocks Academic Term archive while a cycle or placement still has live work', async () => {
    const term = await terms.create({
      code: 'ARCHIVE-GUARD-1',
      academicYear: 2581,
      semester: '1',
      startsAt: new Date('2038-06-01T00:00:00.000Z'),
      endsAt: new Date('2038-10-31T00:00:00.000Z'),
      status: 'open'
    })
    const academic = new AcademicService(
      schools,
      programs,
      courses,
      terms,
      auditService,
      cycles,
      placements
    )
    await cycles.create({
      code: 'archive-guard-cycle',
      name: { th: 'รอบฝึกงาน', en: 'Internship cycle' },
      competencySetVersionId: new Types.ObjectId().toString(),
      academicTermId: term.id,
      opensAt: new Date('2038-06-01T00:00:00.000Z'),
      closesAt: new Date('2038-10-31T00:00:00.000Z'),
      status: 'active'
    })

    await expect(
      academic.updateTerm(admin, term.id, { status: 'archived' })
    ).rejects.toMatchObject({
      status: 409,
      response: { code: 'ACADEMIC_TERM_HAS_OPEN_WORK' }
    })
    await expect(
      terms.findById(term.id).select('status').lean()
    ).resolves.toMatchObject({
      status: 'open'
    })

    await cycles.updateOne(
      { academicTermId: term.id },
      { $set: { status: 'draft' } }
    )
    await expect(
      academic.updateTerm(admin, term.id, { status: 'archived' })
    ).rejects.toMatchObject({
      status: 409,
      response: { code: 'ACADEMIC_TERM_HAS_OPEN_WORK' }
    })
    await cycles.updateOne(
      { academicTermId: term.id },
      { $set: { status: 'closed' } }
    )
    await placements.create({
      studentId: new Types.ObjectId().toString(),
      organizationId,
      academicTermId: term.id,
      schoolId,
      programId,
      positionTitle: { th: 'นักศึกษาฝึกงาน', en: 'Intern' },
      startsAt: new Date('2038-06-15T00:00:00.000Z'),
      endsAt: new Date('2038-08-15T00:00:00.000Z'),
      status: 'planned'
    })
    await expect(
      academic.updateTerm(admin, term.id, { status: 'archived' })
    ).rejects.toMatchObject({
      status: 409,
      response: { code: 'ACADEMIC_TERM_HAS_OPEN_WORK' }
    })

    await placements.updateOne(
      { academicTermId: term.id },
      { $set: { status: 'completed' } }
    )
    await expect(
      academic.updateTerm(admin, term.id, { status: 'archived' })
    ).resolves.toMatchObject({ status: 'archived' })
  })

  it('serializes Academic Term archive against concurrent placement creation', async () => {
    const term = await terms.create({
      code: 'ARCHIVE-RACE-1',
      academicYear: 2581,
      semester: '1',
      startsAt: new Date('2038-06-01T00:00:00.000Z'),
      endsAt: new Date('2038-10-31T00:00:00.000Z'),
      status: 'open'
    })
    const student = await students.create({
      ...input('6631503999', 'archive-race@example.test'),
      academicTermId: term.id,
      semester: '1',
      academicYear: 2581
    })
    const academic = new AcademicService(
      schools,
      programs,
      courses,
      terms,
      auditService,
      cycles,
      placements
    )
    const placementInput: PlacementRecord = {
      studentId: student.id,
      organizationId,
      academicTermId: term.id,
      schoolId,
      programId,
      positionTitle: { th: 'นักศึกษาฝึกงาน', en: 'Intern' },
      startsAt: new Date('2038-06-15T00:00:00.000Z'),
      endsAt: new Date('2038-08-15T00:00:00.000Z'),
      status: 'planned'
    }

    const [archiveResult, placementResult] = await Promise.allSettled([
      academic.updateTerm(admin, term.id, { status: 'archived' }),
      service.createPlacement(admin, placementInput)
    ])
    expect(
      [archiveResult.status, placementResult.status].filter(
        (status) => status === 'fulfilled'
      )
    ).toHaveLength(1)

    const savedTerm = await terms.findById(term.id).select('status').lean()
    const placementCount = await placements.countDocuments({
      academicTermId: term.id
    })
    if (archiveResult.status === 'fulfilled') {
      if (placementResult.status !== 'rejected') {
        throw new Error('Expected placement creation to lose the archive race')
      }
      const placementError: unknown = placementResult.reason as unknown
      if (!(placementError instanceof HttpException)) {
        throw new Error('Expected a mapped placement conflict')
      }
      expect([409, 422]).toContain(placementError.getStatus())
      const placementErrorBody: unknown = placementError.getResponse()
      const placementErrorCode =
        typeof placementErrorBody === 'object' &&
        placementErrorBody !== null &&
        'code' in placementErrorBody &&
        typeof placementErrorBody.code === 'string'
          ? placementErrorBody.code
          : undefined
      expect([
        'ACADEMIC_TERM_CHANGED',
        'ACADEMIC_TERM_REFERENCE_NOT_FOUND'
      ]).toContain(placementErrorCode)
      expect(savedTerm?.status).toBe('archived')
      expect(placementCount).toBe(0)
    } else {
      expect(placementResult.status).toBe('fulfilled')
      const archiveError: unknown = archiveResult.reason as unknown
      if (!(archiveError instanceof HttpException)) {
        throw new Error('Expected a mapped archive conflict')
      }
      expect(archiveError.getStatus()).toBe(409)
      const archiveErrorBody: unknown = archiveError.getResponse()
      const archiveErrorCode =
        typeof archiveErrorBody === 'object' &&
        archiveErrorBody !== null &&
        'code' in archiveErrorBody &&
        typeof archiveErrorBody.code === 'string'
          ? archiveErrorBody.code
          : undefined
      expect([
        'ACADEMIC_TERM_CHANGED',
        'ACADEMIC_TERM_HAS_OPEN_WORK'
      ]).toContain(archiveErrorCode)
      expect(savedTerm?.status).toBe('open')
      expect(placementCount).toBe(1)
    }
  })

  it('filters the student directory by academic term', async () => {
    const firstTerm = await terms.create({
      code: '1/2571',
      academicYear: 2571,
      semester: '1',
      startsAt: new Date('2027-06-01T00:00:00.000Z'),
      endsAt: new Date('2027-10-31T00:00:00.000Z'),
      status: 'open'
    })
    const secondTerm = await terms.create({
      code: '2/2571',
      academicYear: 2571,
      semester: '2',
      startsAt: new Date('2027-11-01T00:00:00.000Z'),
      endsAt: new Date('2028-03-31T00:00:00.000Z'),
      status: 'open'
    })
    const firstStudent = await students.create({
      ...input('6631503001', 'first.term@example.com'),
      academicTermId: firstTerm.id
    })
    await students.create({
      ...input('6631503002', 'second.term@example.com'),
      academicTermId: secondTerm.id
    })

    const result = (await service.listStudents(admin, {
      page: 1,
      pageSize: 25,
      academicTermId: firstTerm.id
    })) as { items: Array<{ id: string }> }

    expect(result.items.map((student) => student.id)).toEqual([firstStudent.id])
  })

  it('filters the student directory by displayed academic year and semester', async () => {
    const firstStudent = await students.create({
      ...input('6631503011', 'year-semester.first@example.com'),
      academicYear: 2571,
      semester: 'ภาคการศึกษาต้น'
    })
    await students.create({
      ...input('6631503012', 'year-semester.second@example.com'),
      academicYear: 2571,
      semester: 'ภาคการศึกษาปลาย'
    })
    const gregorianStudent = await students.create({
      ...input('6631503013', 'year-semester.gregorian@example.com'),
      academicYear: 2028,
      semester: 'first'
    })

    const result = (await service.listStudents(admin, {
      page: 1,
      pageSize: 25,
      academicYear: 2571,
      semester: 'first'
    })) as { items: Array<{ id: string }> }

    expect(result.items.map((student) => student.id).sort()).toEqual(
      [firstStudent.id, gregorianStudent.id].sort()
    )
  })

  it('filters evaluation status from the selected cycle assignment, not the stale student projection', async () => {
    const term = await terms.create({
      code: '1/2572',
      academicYear: 2572,
      semester: '1',
      startsAt: new Date('2028-06-01T00:00:00.000Z'),
      endsAt: new Date('2028-10-31T00:00:00.000Z'),
      status: 'open'
    })
    const cycle = await cycles.create({
      code: 'cycle-status-filter',
      name: { th: 'รอบทดสอบ', en: 'Test cycle' },
      competencySetVersionId: new Types.ObjectId().toString(),
      academicTermId: term.id,
      schoolId,
      programId,
      opensAt: new Date('2028-06-01T00:00:00.000Z'),
      closesAt: new Date('2028-10-31T00:00:00.000Z'),
      status: 'active'
    })
    const staleSubmitted = await students.create({
      ...input('6631503001', 'stale.submitted@example.com'),
      academicTermId: term.id,
      evaluationStatus: 'submitted'
    })
    const actualSubmitted = await students.create({
      ...input('6631503002', 'actual.submitted@example.com'),
      courseId,
      academicTermId: term.id,
      evaluationStatus: 'awaiting_response'
    })
    const notAssigned = await students.create({
      ...input('6631503003', 'not.assigned@example.com'),
      academicTermId: term.id,
      evaluationStatus: 'submitted'
    })
    const inProgressStudent = await students.create({
      ...input('6631503004', 'in.progress@example.com'),
      academicTermId: term.id,
      evaluationStatus: 'awaiting_evaluator'
    })
    const expiredStudent = await students.create({
      ...input('6631503005', 'expired@example.com'),
      academicTermId: term.id,
      evaluationStatus: 'awaiting_evaluator'
    })
    const assignedEvaluator = await evaluators.create({
      organizationId,
      email: 'cycle-status-evaluator@example.com',
      name: { th: 'ผู้ประเมินรอบนี้', en: 'Cycle evaluator' },
      position: { th: 'หัวหน้างาน', en: 'Supervisor' },
      phone: 'private-evaluator-phone',
      status: 'active'
    })
    const addPlacement = async (studentId: string): Promise<string> => {
      const placement = await placements.create({
        studentId,
        organizationId,
        academicTermId: term.id,
        schoolId,
        programId,
        positionTitle: { th: 'นักศึกษาฝึกงาน', en: 'Intern' },
        startsAt: new Date('2028-06-15T00:00:00.000Z'),
        endsAt: new Date('2028-08-15T00:00:00.000Z'),
        status: 'active'
      })
      return placement.id
    }
    const [
      stalePlacementId,
      actualPlacementId,
      ,
      inProgressPlacementId,
      expiredPlacementId
    ] = await Promise.all([
      addPlacement(staleSubmitted.id),
      addPlacement(actualSubmitted.id),
      addPlacement(notAssigned.id),
      addPlacement(inProgressStudent.id),
      addPlacement(expiredStudent.id)
    ])
    await connection.collection('evaluationAssignments').insertMany([
      {
        cycleId: cycle.id,
        placementId: stalePlacementId,
        studentId: staleSubmitted.id,
        evaluatorId: assignedEvaluator.id,
        schoolId,
        programId,
        status: 'pending'
      },
      {
        cycleId: cycle.id,
        placementId: actualPlacementId,
        studentId: actualSubmitted.id,
        evaluatorId: assignedEvaluator.id,
        schoolId,
        programId,
        status: 'submitted',
        accessPin: 'LEGACY-PRIVATE-PIN'
      },
      {
        cycleId: cycle.id,
        placementId: inProgressPlacementId,
        studentId: inProgressStudent.id,
        evaluatorId: assignedEvaluator.id,
        schoolId,
        programId,
        status: 'inProgress'
      },
      {
        cycleId: cycle.id,
        placementId: expiredPlacementId,
        studentId: expiredStudent.id,
        evaluatorId: assignedEvaluator.id,
        schoolId,
        programId,
        status: 'expired'
      }
    ])

    const result = (await service.listStudents(admin, {
      page: 1,
      pageSize: 25,
      cycleId: cycle.id,
      evaluationStatus: 'submitted'
    })) as { items: Array<{ id: string }> }

    expect(result.items.map((student) => student.id)).toEqual([
      actualSubmitted.id
    ])
    const cycleTermMatch = (await service.listStudents(admin, {
      page: 1,
      pageSize: 25,
      cycleId: cycle.id,
      academicYear: 2572,
      semester: 'ภาคการศึกษาต้น',
      includeDirectoryData: true
    })) as {
      items: Array<{
        id: string
        directoryRelations: {
          school?: { id: string; schoolCode: string; name: { th: string } }
          program?: { id: string; programCode: string; name: { th: string } }
          course?: { id: string; courseCode: string; name: { th: string } }
          assignments: Array<{
            accessPin?: string
            evaluator?: {
              email: string
              position: { en: string }
              phone?: string
            }
          }>
          placements: Array<{
            organization?: { name: { en: string } }
          }>
        }
      }>
      directory: {
        summary: Record<string, number>
        facets: {
          academicYears: number[]
          semesters: string[]
          schoolIds: string[]
          schools: Array<{
            id: string
            schoolCode: string
            name: { th: string }
          }>
          statuses: string[]
        }
      }
    }
    expect(new Set(cycleTermMatch.items.map((student) => student.id))).toEqual(
      new Set([
        staleSubmitted.id,
        actualSubmitted.id,
        notAssigned.id,
        inProgressStudent.id,
        expiredStudent.id
      ])
    )
    const actualSubmittedDirectory = cycleTermMatch.items.find(
      (student) => student.id === actualSubmitted.id
    )!
    expect(actualSubmittedDirectory.directoryRelations).toMatchObject({
      school: {
        id: schoolId,
        schoolCode: 'ADT',
        name: { th: 'สำนักวิชาเทคโนโลยีดิจิทัล' }
      },
      program: { id: programId, programCode: 'SE' },
      course: { id: courseId, courseCode: 'INT100' }
    })
    expect(
      actualSubmittedDirectory.directoryRelations.assignments
    ).toHaveLength(1)
    expect(
      actualSubmittedDirectory.directoryRelations.assignments[0]?.evaluator
    ).toMatchObject({
      email: assignedEvaluator.email,
      position: { en: 'Supervisor' }
    })
    expect(
      actualSubmittedDirectory.directoryRelations.assignments[0]?.evaluator
    ).not.toHaveProperty('phone')
    expect(
      actualSubmittedDirectory.directoryRelations.assignments[0]
    ).not.toHaveProperty('accessPin')
    expect(
      actualSubmittedDirectory.directoryRelations.placements[0]?.organization
        ?.name.en
    ).toBe('Test Organization')
    expect(cycleTermMatch.directory.summary).toEqual({
      all: 5,
      submitted: 1,
      inProgress: 1,
      emailError: 0,
      pending: 2,
      expired: 1,
      assignmentAmbiguous: 0
    })
    expect(cycleTermMatch.directory.facets.academicYears).toEqual([2572])
    expect(cycleTermMatch.directory.facets.semesters).toEqual(['1'])
    expect(cycleTermMatch.directory.facets.schoolIds).toEqual([schoolId])
    expect(cycleTermMatch.directory.facets.schools).toEqual([
      expect.objectContaining({ id: schoolId, schoolCode: 'ADT' })
    ])
    expect(cycleTermMatch.directory.facets.statuses.sort()).toEqual(
      ['expired', 'inProgress', 'pending', 'submitted'].sort()
    )
    const organizationSearch = (await service.listStudents(admin, {
      page: 1,
      pageSize: 25,
      cycleId: cycle.id,
      search: 'Test Organization'
    })) as { items: Array<{ id: string }> }
    expect(
      new Set(organizationSearch.items.map((student) => student.id))
    ).toEqual(
      new Set([
        staleSubmitted.id,
        actualSubmitted.id,
        notAssigned.id,
        inProgressStudent.id,
        expiredStudent.id
      ])
    )
    const evaluatorSearch = (await service.listStudents(admin, {
      page: 1,
      pageSize: 25,
      cycleId: cycle.id,
      search: 'Cycle evaluator'
    })) as { items: Array<{ id: string }> }
    expect(new Set(evaluatorSearch.items.map((student) => student.id))).toEqual(
      new Set([
        staleSubmitted.id,
        actualSubmitted.id,
        inProgressStudent.id,
        expiredStudent.id
      ])
    )
    const cycleTermMismatch = (await service.listStudents(admin, {
      page: 1,
      pageSize: 25,
      cycleId: cycle.id,
      academicYear: 2571
    })) as { items: Array<{ id: string }> }
    expect(cycleTermMismatch.items).toHaveLength(0)

    const awaitingResponse = (await service.listStudents(admin, {
      page: 1,
      pageSize: 25,
      cycleId: cycle.id,
      evaluationStatus: 'awaiting_response'
    })) as { items: Array<{ id: string }> }
    expect(
      new Set(awaitingResponse.items.map((student) => student.id))
    ).toEqual(
      new Set([staleSubmitted.id, inProgressStudent.id, expiredStudent.id])
    )
    const awaitingEvaluator = (await service.listStudents(admin, {
      page: 1,
      pageSize: 25,
      cycleId: cycle.id,
      evaluationStatus: 'awaiting_evaluator'
    })) as { items: Array<{ id: string }> }
    expect(awaitingEvaluator.items.map((student) => student.id)).toEqual([
      notAssigned.id
    ])
    const pending = (await service.listStudents(admin, {
      page: 1,
      pageSize: 25,
      cycleId: cycle.id,
      evaluationStatus: 'pending'
    })) as { items: Array<{ id: string }> }
    expect(new Set(pending.items.map((student) => student.id))).toEqual(
      new Set([staleSubmitted.id, notAssigned.id])
    )
    const exactInProgress = (await service.listStudents(admin, {
      page: 1,
      pageSize: 25,
      cycleId: cycle.id,
      evaluationStatus: 'inProgress'
    })) as { items: Array<{ id: string; evaluationStatus?: string }> }
    expect(exactInProgress.items.map((student) => student.id)).toEqual([
      inProgressStudent.id
    ])
    expect(exactInProgress.items[0]?.evaluationStatus).toBe('inProgress')
    const exactExpired = (await service.listStudents(admin, {
      page: 1,
      pageSize: 25,
      cycleId: cycle.id,
      evaluationStatus: 'expired'
    })) as { items: Array<{ id: string; evaluationStatus?: string }> }
    expect(exactExpired.items.map((student) => student.id)).toEqual([
      expiredStudent.id
    ])
    expect(exactExpired.items[0]?.evaluationStatus).toBe('expired')
    const withoutCycle = (await service.listStudents(admin, {
      page: 1,
      pageSize: 25
    })) as { items: Array<{ id: string; evaluationStatus?: string }> }
    expect(
      withoutCycle.items.find((student) => student.id === staleSubmitted.id)
        ?.evaluationStatus
    ).toBeUndefined()
    await expect(
      service.getStudent(admin, staleSubmitted.id)
    ).resolves.not.toHaveProperty('evaluatorEmail')
    await expect(
      service.getStudent(admin, staleSubmitted.id)
    ).resolves.not.toHaveProperty('evaluationStatus')
    await expect(
      service.listStudents(admin, {
        page: 1,
        pageSize: 25,
        evaluationStatus: 'submitted'
      })
    ).rejects.toMatchObject({
      status: 422,
      response: { code: 'EVALUATION_STATUS_REQUIRES_CYCLE' }
    })

    const outOfScopeStaff: AuthenticatedActor = {
      ...admin,
      roles: ['internshipStaff'],
      scope: {
        tenant: false,
        schoolIds: [otherSchoolId],
        programIds: [otherProgramId]
      }
    }
    await expect(
      service.listStudents(outOfScopeStaff, {
        page: 1,
        pageSize: 25,
        cycleId: cycle.id
      })
    ).rejects.toMatchObject({ status: 404 })
  })

  it('normalizes email and rejects case-insensitive duplicate on create', async () => {
    await students.create(input('6631503001', 'Case@Example.com'))

    await expect(
      service.createStudent(admin, input('6631503002', 'case@example.com'))
    ).rejects.toMatchObject({
      status: 409,
      response: { code: 'STUDENT_EMAIL_ALREADY_USED' }
    })
    await expect(students.countDocuments({})).resolves.toBe(1)
  })

  it('stores primary email trimmed and lowercase', async () => {
    const created = (await service.createStudent(
      admin,
      input('6631503001', '  NEW.Student@Example.com  ')
    )) as { email: string }

    expect(created.email).toBe('new.student@example.com')
    await expect(
      students.countDocuments({ email: 'new.student@example.com' })
    ).resolves.toBe(1)
  })

  it('stores academic term record ID and derives consistent semester and year', async () => {
    const term = await terms.create({
      code: '1/2566',
      academicYear: 2566,
      semester: '1',
      startsAt: new Date('2023-06-01T00:00:00.000Z'),
      endsAt: new Date('2023-10-31T00:00:00.000Z'),
      status: 'open'
    })

    const created = (await service.createStudent(admin, {
      ...input('6631503001', 'student@example.com'),
      semester: 'ภาคการศึกษาต้น',
      academicYear: 2566
    })) as { academicTermId: string; semester: string; academicYear: number }

    expect(created).toMatchObject({
      academicTermId: term.id,
      semester: '1',
      academicYear: 2566
    })
  })

  it('makes direct Student creation visible to Staff in its verified scope', async () => {
    const scopedStaff: AuthenticatedActor = {
      id: 'staff-student-create-scope',
      email: 'staff@mfu.ac.th',
      displayName: 'Scoped Staff',
      roles: ['internshipStaff'],
      scope: { tenant: false, schoolIds: [schoolId], programIds: [programId] }
    }

    const created = (await service.createStudent(
      scopedStaff,
      input('6631503120', 'scoped-create@example.com')
    )) as { id: string }

    const audit = await auditService.list(scopedStaff, {
      page: 1,
      pageSize: 25
    })
    expect(audit.items).toContainEqual(
      expect.objectContaining({
        action: 'students.created',
        resourceScopes: [
          { tenant: false, schoolIds: [schoolId], programIds: [programId] }
        ],
        metadata: { studentRecordId: created.id }
      })
    )
  })

  it.each(['create', 'profile update'] as const)(
    'rolls back Student %s when its scoped audit write fails',
    async (operation) => {
      const failingService = new MembersService(
        students,
        organizations,
        evaluators,
        placements,
        terms,
        assignments,
        cycles,
        schools,
        programs,
        courses,
        {
          record: vi.fn().mockRejectedValue(new Error('audit write failed'))
        } as never
      )

      if (operation === 'create') {
        await expect(
          failingService.createStudent(
            admin,
            input('6631503127', 'student-create-audit-failure@example.com')
          )
        ).rejects.toThrow('audit write failed')
        await expect(students.countDocuments({})).resolves.toBe(0)
      } else {
        const student = await students.create(
          input('6631503128', 'student-update-audit-failure@example.com')
        )
        await expect(
          failingService.updateStudent(admin, student.id, {
            name: { th: 'เปลี่ยนชื่อ', en: 'Changed name' }
          })
        ).rejects.toThrow('audit write failed')
        await expect(
          students.findById(student.id).select('name').lean().exec()
        ).resolves.toMatchObject({
          name: { th: 'นักศึกษาตัวอย่าง', en: 'Example Student' }
        })
      }

      await expect(auditLogs.countDocuments({})).resolves.toBe(0)
    }
  )

  it('makes generic Student profile updates visible to Staff in the resource scope', async () => {
    const student = await students.create(
      input('6631503121', 'scoped-update@example.com')
    )
    const scopedStaff: AuthenticatedActor = {
      id: 'staff-student-update-scope',
      email: 'staff@mfu.ac.th',
      displayName: 'Scoped Staff',
      roles: ['internshipStaff'],
      scope: { tenant: false, schoolIds: [schoolId], programIds: [programId] }
    }

    await service.updateStudent(scopedStaff, student.id, {
      name: { th: 'แก้ไขชื่อ', en: 'Updated name' }
    })

    const audit = await auditService.list(scopedStaff, {
      page: 1,
      pageSize: 25
    })
    expect(audit.items).toContainEqual(
      expect.objectContaining({
        action: 'students.updated',
        resourceScopes: [
          { tenant: false, schoolIds: [schoolId], programIds: [programId] }
        ],
        metadata: { studentRecordId: student.id }
      })
    )
  })

  it('records Student scope transfers against both verified source and destination scopes', async () => {
    const student = await students.create(
      input('6631503122', 'scoped-transfer-audit@example.com')
    )
    const transferStaff: AuthenticatedActor = {
      id: 'staff-student-transfer-audit',
      email: 'staff@mfu.ac.th',
      displayName: 'Scoped Staff',
      roles: ['internshipStaff'],
      scope: {
        tenant: false,
        schoolIds: [schoolId, otherSchoolId],
        programIds: [programId, otherProgramId]
      },
      roleScopes: [
        {
          role: 'internshipStaff',
          tenant: false,
          schoolIds: [schoolId],
          programIds: [programId]
        },
        {
          role: 'internshipStaff',
          tenant: false,
          schoolIds: [otherSchoolId],
          programIds: [otherProgramId]
        }
      ]
    }

    await service.updateStudent(transferStaff, student.id, {
      schoolId: otherSchoolId,
      programId: otherProgramId
    })

    const audit = await auditService.list(transferStaff, {
      page: 1,
      pageSize: 25
    })
    expect(audit.items).toContainEqual(
      expect.objectContaining({
        action: 'students.scope_transferred',
        resourceScopes: [
          { tenant: false, schoolIds: [schoolId], programIds: [programId] },
          {
            tenant: false,
            schoolIds: [otherSchoolId],
            programIds: [otherProgramId]
          }
        ],
        metadata: { studentRecordId: student.id }
      })
    )
  })

  it('rejects mismatched or archived academic references on student create/update', async () => {
    await expect(
      service.createStudent(admin, {
        ...input('6631503001', 'student@example.com'),
        programId: otherProgramId
      })
    ).rejects.toMatchObject({
      status: 422,
      response: { code: 'PROGRAM_SCHOOL_MISMATCH', field: 'programId' }
    })
    await expect(
      service.createStudent(admin, {
        ...input('6631503002', 'other@example.com'),
        courseId: otherCourseId
      })
    ).rejects.toMatchObject({
      status: 422,
      response: { code: 'COURSE_PROGRAM_MISMATCH', field: 'courseId' }
    })

    const student = await students.create(
      input('6631503003', 'third@example.com')
    )
    await expect(
      service.updateStudent(admin, student.id, { courseId: otherCourseId })
    ).rejects.toMatchObject({
      status: 422,
      response: { code: 'COURSE_PROGRAM_MISMATCH', field: 'courseId' }
    })
    const unchanged = await students
      .findById(student.id)
      .select('courseId')
      .lean()
      .exec()
    expect(unchanged?.courseId).toBeUndefined()
  })

  it('creates a placement only from matching student, organization and term records', async () => {
    const term = await terms.create({
      code: '1/2567',
      academicYear: 2567,
      semester: '1',
      startsAt: new Date('2024-06-01T00:00:00.000Z'),
      endsAt: new Date('2024-10-31T00:00:00.000Z'),
      status: 'open'
    })
    const student = await students.create({
      ...input('6631503001', 'student@example.com'),
      courseId,
      academicTermId: term.id,
      semester: '1',
      academicYear: 2567
    })
    const placementInput: PlacementRecord = {
      studentId: student.studentId,
      organizationId,
      academicTermId: term.code,
      schoolId,
      programId,
      positionTitle: { th: 'นักศึกษาฝึกงาน', en: 'Intern' },
      startsAt: new Date('2024-06-15T00:00:00.000Z'),
      endsAt: new Date('2024-08-15T00:00:00.000Z'),
      status: 'active'
    }

    const created = (await service.createPlacement(admin, placementInput)) as {
      studentId: string
      academicTermId: string
    }
    expect(created).toMatchObject({
      studentId: student.id,
      academicTermId: term.id
    })
    await expect(
      terms.findById(term.id).select('__v').lean()
    ).resolves.toMatchObject({ __v: 1 })

    await expect(
      service.createPlacement(admin, {
        ...placementInput,
        studentId: student.id
      })
    ).rejects.toMatchObject({
      status: 409,
      response: { code: 'PLACEMENT_ALREADY_EXISTS' }
    })
    await students.create({
      ...input('6631503002', 'second@example.com'),
      schoolId: otherSchoolId,
      programId: otherProgramId,
      academicTermId: term.id,
      semester: '1',
      academicYear: 2567
    })
    await expect(
      service.createPlacement(admin, {
        ...placementInput,
        studentId: '6631503002',
        schoolId,
        programId
      })
    ).rejects.toMatchObject({
      status: 422,
      response: { code: 'PLACEMENT_STUDENT_SCOPE_MISMATCH' }
    })
  })

  it('does not let generic student updates bypass open-work archive protection', async () => {
    const term = await terms.create({
      code: '1/2570',
      academicYear: 2570,
      semester: '1',
      startsAt: new Date('2026-06-01T00:00:00.000Z'),
      endsAt: new Date('2026-10-31T00:00:00.000Z'),
      status: 'open'
    })
    const student = await students.create({
      ...input('6631503099', 'open-work@example.com'),
      academicTermId: term.id
    })
    await placements.create({
      studentId: student.id,
      organizationId,
      academicTermId: term.id,
      schoolId,
      programId,
      positionTitle: { th: 'นักศึกษาฝึกงาน', en: 'Intern' },
      startsAt: new Date('2026-06-15T00:00:00.000Z'),
      endsAt: new Date('2026-08-15T00:00:00.000Z'),
      status: 'active'
    })

    await expect(
      service.updateStudent(admin, student.id, { status: 'archived' })
    ).rejects.toMatchObject({
      status: 409,
      response: { code: 'STUDENT_HAS_OPEN_PLACEMENT' }
    })
    await expect(
      service.archiveStudent(admin, student.id)
    ).rejects.toMatchObject({
      status: 409,
      response: { code: 'STUDENT_HAS_OPEN_PLACEMENT' }
    })
    await expect(
      students.findById(student.id).select('status').lean().exec()
    ).resolves.toMatchObject({ status: 'active' })

    await placements.updateOne(
      { studentId: student.id },
      { $set: { status: 'completed' } }
    )
    const archived = await service.updateStudent(admin, student.id, {
      status: 'archived'
    })
    expect(archived).toMatchObject({ status: 'archived' })
    expect((archived as Record<string, unknown>).archivedAt).toBeInstanceOf(
      Date
    )
    await expect(
      service.updateStudent(admin, student.id, { status: 'active' })
    ).resolves.toMatchObject({ status: 'active' })
    const reactivated = await students
      .findById(student.id)
      .select('status archivedAt')
      .lean()
      .exec()
    expect(reactivated?.status).toBe('active')
    expect(reactivated).not.toHaveProperty('archivedAt')
  })

  it.each(['DELETE', 'PATCH'] as const)(
    'makes Student archive via %s visible to staff in the verified resource scope',
    async (method) => {
      const student = await students.create(
        input('6631503110', 'scoped-archive@example.com')
      )
      const scopedStaff: AuthenticatedActor = {
        id: 'staff-school-scope',
        email: 'staff@mfu.ac.th',
        displayName: 'Scoped Staff',
        roles: ['internshipStaff'],
        scope: { tenant: false, schoolIds: [schoolId], programIds: [programId] }
      }

      if (method === 'PATCH') {
        await service.updateStudent(scopedStaff, student.id, {
          status: 'archived'
        })
      } else {
        await service.archiveStudent(scopedStaff, student.id)
      }

      const audit = await auditService.list(scopedStaff, {
        page: 1,
        pageSize: 25
      })
      expect(audit.items).toContainEqual(
        expect.objectContaining({
          action: 'students.archived',
          resourceScopes: [
            {
              tenant: false,
              schoolIds: [schoolId],
              programIds: [programId]
            }
          ],
          metadata: { studentRecordId: student.id }
        })
      )
    }
  )

  it.each(['DELETE', 'PATCH'] as const)(
    'rolls back Student archive via %s when its transactional audit write fails',
    async (method) => {
      const student = await students.create(
        input('6631503111', 'archive-audit-failure@example.com')
      )
      const failingAuditService = {
        record: vi.fn().mockRejectedValue(new Error('audit write failed'))
      }
      const failingService = new MembersService(
        students,
        organizations,
        evaluators,
        placements,
        terms,
        assignments,
        cycles,
        schools,
        programs,
        courses,
        failingAuditService as never
      )

      const archive =
        method === 'PATCH'
          ? failingService.updateStudent(admin, student.id, {
              status: 'archived'
            })
          : failingService.archiveStudent(admin, student.id)

      await expect(archive).rejects.toThrow('audit write failed')
      await expect(
        students.findById(student.id).select('status').lean().exec()
      ).resolves.toMatchObject({ status: 'active' })
      await expect(
        auditLogs.countDocuments({ action: 'students.archived' })
      ).resolves.toBe(0)
    }
  )

  it.each(['dedicated archive', 'generic update'] as const)(
    '%s cannot race with placement creation after the open-work check',
    async (archiveMode) => {
      const term = await terms.create({
        code: '1/2570',
        academicYear: 2570,
        semester: '1',
        startsAt: new Date('2026-06-01T00:00:00.000Z'),
        endsAt: new Date('2026-10-31T00:00:00.000Z'),
        status: 'open'
      })
      const student = await students.create({
        ...input('6631503100', 'archive-race@example.com'),
        academicTermId: term.id,
        semester: '1',
        academicYear: 2570
      })
      let releaseArchiveCheck!: () => void
      let signalArchiveCheck!: () => void
      const archiveCheckReached = new Promise<void>((resolve) => {
        signalArchiveCheck = resolve
      })
      const releaseArchive = new Promise<void>((resolve) => {
        releaseArchiveCheck = resolve
      })
      const originalExists = placements.exists.bind(placements)
      const gateArchiveCheck = async (
        filter: unknown
      ): Promise<Awaited<ReturnType<typeof originalExists>>> => {
        const result = await originalExists(
          filter as Parameters<typeof originalExists>[0]
        )
        const query = filter as Record<string, unknown> | undefined
        const status = query?.status as Record<string, unknown> | undefined
        if (status?.$in && !result) {
          signalArchiveCheck()
          await releaseArchive
        }
        return result
      }
      const existsSpy = vi
        .spyOn(placements, 'exists')
        .mockImplementation(gateArchiveCheck as never)

      try {
        const archivePromise: Promise<unknown> =
          archiveMode === 'dedicated archive'
            ? service.archiveStudent(admin, student.id)
            : service.updateStudent(admin, student.id, { status: 'archived' })
        await archiveCheckReached
        await service.createPlacement(admin, {
          studentId: student.id,
          organizationId,
          academicTermId: term.id,
          schoolId,
          programId,
          positionTitle: { th: 'นักศึกษาฝึกงาน', en: 'Intern' },
          startsAt: new Date('2026-06-15T00:00:00.000Z'),
          endsAt: new Date('2026-08-15T00:00:00.000Z'),
          status: 'active'
        })
        releaseArchiveCheck()

        await expect(archivePromise).rejects.toMatchObject({
          status: 409,
          response: { code: 'STUDENT_HAS_OPEN_PLACEMENT' }
        })
        await expect(
          students.findById(student.id).select('status').lean().exec()
        ).resolves.toMatchObject({ status: 'active' })
      } finally {
        releaseArchiveCheck()
        existsSpy.mockRestore()
      }
    }
  )

  it('intersects a Student placement filter with own scope for record ID and student number', async () => {
    const term = await terms.create({
      code: '1/2567',
      academicYear: 2567,
      semester: '1',
      startsAt: new Date('2024-06-01T00:00:00.000Z'),
      endsAt: new Date('2024-10-31T00:00:00.000Z'),
      status: 'open'
    })
    const ownStudent = await students.create({
      ...input('6631503011', 'own-student@example.com'),
      courseId,
      academicTermId: term.id,
      semester: '1',
      academicYear: 2567
    })
    const otherStudent = await students.create({
      ...input('6631503012', 'other-student@example.com'),
      schoolId: otherSchoolId,
      programId: otherProgramId,
      courseId: otherCourseId,
      academicTermId: term.id,
      semester: '1',
      academicYear: 2567
    })
    const placement = {
      organizationId,
      academicTermId: term.code,
      positionTitle: { th: 'นักศึกษาฝึกงาน', en: 'Intern' },
      startsAt: new Date('2024-06-15T00:00:00.000Z'),
      endsAt: new Date('2024-08-15T00:00:00.000Z'),
      status: 'active' as const
    }
    await service.createPlacement(admin, {
      ...placement,
      studentId: ownStudent.studentId,
      schoolId,
      programId
    })
    await service.createPlacement(admin, {
      ...placement,
      studentId: otherStudent.studentId,
      schoolId: otherSchoolId,
      programId: otherProgramId
    })
    const ownActor: AuthenticatedActor = {
      id: ownStudent.id,
      email: ownStudent.email,
      displayName: 'Student',
      roles: ['student'],
      scope: {
        tenant: false,
        schoolIds: [schoolId],
        programIds: [programId],
        studentId: ownStudent.studentId
      }
    }

    for (const requestedStudentId of [
      otherStudent.studentId,
      otherStudent.id
    ]) {
      await expect(
        service.listPlacements(ownActor, {
          page: 1,
          pageSize: 50,
          studentId: requestedStudentId
        })
      ).resolves.toMatchObject({ items: [], meta: { total: 0 } })
    }
    await expect(
      service.listPlacements(ownActor, { page: 1, pageSize: 50 })
    ).resolves.toMatchObject({
      items: [expect.objectContaining({ studentId: ownStudent.id })],
      meta: { total: 1 }
    })
  })

  it('combines Student own scope with Staff scope for student and placement reads', async () => {
    const term = await terms.create({
      code: '1/2568',
      academicYear: 2568,
      semester: '1',
      startsAt: new Date('2025-06-01T00:00:00.000Z'),
      endsAt: new Date('2025-10-31T00:00:00.000Z'),
      status: 'open'
    })
    const ownStudent = await students.create({
      ...input('6631504111', 'multi-own@example.com'),
      schoolId: otherSchoolId,
      programId: otherProgramId,
      courseId: otherCourseId,
      academicTermId: term.id,
      semester: '1',
      academicYear: 2568
    })
    const staffStudent = await students.create({
      ...input('6631504112', 'multi-staff@example.com'),
      courseId,
      academicTermId: term.id,
      semester: '1',
      academicYear: 2568
    })
    const foreignStudent = await students.create({
      ...input('6631504113', 'multi-foreign@example.com'),
      schoolId: otherSchoolId,
      programId: otherProgramId,
      courseId: otherCourseId,
      academicTermId: term.id,
      semester: '1',
      academicYear: 2568
    })
    const placement = {
      organizationId,
      academicTermId: term.code,
      positionTitle: { th: 'นักศึกษาฝึกงาน', en: 'Intern' },
      startsAt: new Date('2025-06-15T00:00:00.000Z'),
      endsAt: new Date('2025-08-15T00:00:00.000Z'),
      status: 'active' as const
    }
    for (const student of [ownStudent, staffStudent, foreignStudent]) {
      await service.createPlacement(admin, {
        ...placement,
        studentId: student.studentId,
        schoolId: student.schoolId,
        programId: student.programId
      })
    }
    const actor: AuthenticatedActor = {
      id: 'student-and-staff',
      email: 'multi-role@example.com',
      displayName: 'Student and Staff',
      roles: ['student', 'internshipStaff'],
      scope: {
        tenant: false,
        schoolIds: [schoolId],
        programIds: [programId],
        studentId: ownStudent.studentId
      },
      roleScopes: [
        {
          role: 'internshipStaff',
          tenant: false,
          schoolIds: [schoolId],
          programIds: [programId]
        }
      ]
    }

    const directory = (await service.listStudents(actor, {
      page: 1,
      pageSize: 50
    })) as { items: readonly { studentId: string }[]; meta: { total: number } }
    expect(directory.items.map((student) => student.studentId).sort()).toEqual(
      [ownStudent.studentId, staffStudent.studentId].sort()
    )
    expect(directory.meta.total).toBe(2)
    await expect(
      service.getStudent(actor, staffStudent.studentId)
    ).resolves.toMatchObject({ studentId: staffStudent.studentId })
    await expect(
      service.getStudent(actor, foreignStudent.studentId)
    ).rejects.toMatchObject({ status: 404 })

    const placementResult = (await service.listPlacements(actor, {
      page: 1,
      pageSize: 50
    })) as {
      items: Array<{ studentId: string }>
      meta: { total: number }
    }
    expect(
      placementResult.items.map(({ studentId }) => studentId).sort()
    ).toEqual([ownStudent.id, staffStudent.id].sort())
    expect(placementResult.meta.total).toBe(2)

    const globalCycle = await cycles.create({
      code: 'multi-role-global-cycle',
      name: { th: 'รอบฝึกงาน', en: 'Internship cycle' },
      competencySetVersionId: new Types.ObjectId().toString(),
      academicTermId: term.id,
      opensAt: new Date('2025-06-01T00:00:00.000Z'),
      closesAt: new Date('2025-10-31T00:00:00.000Z'),
      status: 'active'
    })
    const [ownPlacement, scopedPlacement] = await Promise.all([
      placements.findOne({ studentId: ownStudent.id }).exec(),
      placements.findOne({ studentId: staffStudent.id }).exec()
    ])
    if (!ownPlacement || !scopedPlacement) {
      throw new Error('Expected Student and Staff placements')
    }
    await assignments.create([
      {
        cycleId: globalCycle.id,
        placementId: ownPlacement.id,
        evaluatorId: new Types.ObjectId().toString(),
        studentId: ownStudent.id,
        schoolId: ownStudent.schoolId,
        programId: ownStudent.programId,
        questionSnapshot: [],
        competencySetVersionId: globalCycle.competencySetVersionId,
        deadlineAt: globalCycle.closesAt,
        status: 'pending'
      },
      {
        cycleId: globalCycle.id,
        placementId: scopedPlacement.id,
        evaluatorId: new Types.ObjectId().toString(),
        studentId: staffStudent.id,
        schoolId: staffStudent.schoolId,
        programId: staffStudent.programId,
        questionSnapshot: [],
        competencySetVersionId: globalCycle.competencySetVersionId,
        deadlineAt: globalCycle.closesAt,
        status: 'pending'
      }
    ])
    const cycleDirectory = (await service.listStudents(actor, {
      page: 1,
      pageSize: 50,
      cycleId: globalCycle.id
    })) as { items: readonly { studentId: string }[]; meta: { total: number } }
    expect(
      cycleDirectory.items.map(({ studentId }) => studentId).sort()
    ).toEqual([ownStudent.studentId, staffStudent.studentId].sort())
    expect(cycleDirectory.meta.total).toBe(2)
    const pendingCycleDirectory = (await service.listStudents(actor, {
      page: 1,
      pageSize: 50,
      cycleId: globalCycle.id,
      evaluationStatus: 'awaiting_response'
    })) as { items: readonly { studentId: string }[]; meta: { total: number } }
    expect(
      pendingCycleDirectory.items.map(({ studentId }) => studentId).sort()
    ).toEqual([ownStudent.studentId, staffStudent.studentId].sort())
    expect(pendingCycleDirectory.meta.total).toBe(2)

    const unassignedGlobalCycle = await cycles.create({
      code: 'multi-role-global-cycle-awaiting-evaluator',
      name: { th: 'รอบฝึกงาน', en: 'Internship cycle' },
      competencySetVersionId: globalCycle.competencySetVersionId,
      academicTermId: term.id,
      opensAt: new Date('2025-06-01T00:00:00.000Z'),
      closesAt: new Date('2025-10-31T00:00:00.000Z'),
      status: 'active'
    })
    const awaitingEvaluatorDirectory = (await service.listStudents(actor, {
      page: 1,
      pageSize: 50,
      cycleId: unassignedGlobalCycle.id,
      evaluationStatus: 'awaiting_evaluator'
    })) as { items: readonly { studentId: string }[]; meta: { total: number } }
    expect(
      awaitingEvaluatorDirectory.items.map(({ studentId }) => studentId).sort()
    ).toEqual([ownStudent.studentId, staffStudent.studentId].sort())
    expect(awaitingEvaluatorDirectory.meta.total).toBe(2)

    const staffPlacement = await placements
      .findOne({ studentId: staffStudent.id })
      .exec()
    if (!staffPlacement) throw new Error('Expected scoped Student placement')
    const evaluatorAssignment = await assignments.create({
      cycleId: 'cycle-evaluator-scope',
      placementId: staffPlacement.id,
      evaluatorId: 'evaluator-scope',
      studentId: staffStudent.id,
      schoolId,
      programId,
      questionSnapshot: [],
      competencySetVersionId: 'published-test-version',
      deadlineAt: new Date('2025-08-01T00:00:00.000Z'),
      status: 'pending',
      evaluationVersion: 1
    })
    const evaluator: AuthenticatedActor = {
      id: 'evaluator-scope-user',
      email: 'evaluator-scope@example.com',
      displayName: 'Assigned Evaluator',
      roles: ['evaluator'],
      scope: {
        tenant: false,
        schoolIds: [],
        programIds: [],
        assignmentId: evaluatorAssignment.id
      }
    }
    const evaluatorDirectory = (await service.listStudents(evaluator, {
      page: 1,
      pageSize: 50
    })) as { items: readonly { studentId: string }[]; meta: { total: number } }
    expect(
      evaluatorDirectory.items.map((student) => student.studentId)
    ).toEqual([staffStudent.studentId])
    expect(evaluatorDirectory.meta.total).toBe(1)
    await expect(
      service.getStudent(evaluator, staffStudent.id)
    ).resolves.toMatchObject({ studentId: staffStudent.studentId })
    await expect(
      service.getStudent(evaluator, foreignStudent.id)
    ).rejects.toMatchObject({ status: 404 })
    await expect(
      service.listPlacements(evaluator, { page: 1, pageSize: 50 })
    ).resolves.toMatchObject({
      items: [expect.objectContaining({ id: staffPlacement.id })],
      meta: { total: 1 }
    })
  })

  it('requires an active Organization before creating a normalized Evaluator', async () => {
    const evaluatorInput: EvaluatorRecord = {
      organizationId,
      email: '  Evaluator@Example.com ',
      name: { th: 'ผู้ประเมิน', en: 'Evaluator' },
      position: { th: 'หัวหน้างาน', en: 'Supervisor' },
      status: 'active'
    }

    const created = (await service.createEvaluator(
      admin,
      evaluatorInput
    )) as EvaluatorRecord & { id: string }
    expect(created).toMatchObject({
      organizationId,
      email: 'evaluator@example.com'
    })
    await expect(
      service.createEvaluator(admin, {
        ...evaluatorInput,
        email: 'evaluator@example.com'
      })
    ).rejects.toMatchObject({
      status: 409,
      response: { code: 'EVALUATOR_ALREADY_EXISTS' }
    })
    await organizations.updateOne(
      { _id: organizationId },
      { $set: { status: 'archived' } }
    )
    await expect(
      service.createEvaluator(admin, {
        ...evaluatorInput,
        email: 'archived@example.com'
      })
    ).rejects.toMatchObject({
      status: 422,
      response: {
        code: 'ORGANIZATION_REFERENCE_NOT_FOUND',
        field: 'organizationId'
      }
    })
    await expect(
      service.createEvaluator(admin, {
        ...evaluatorInput,
        organizationId: '64b000000000000000000099'
      })
    ).rejects.toMatchObject({
      status: 422,
      response: {
        code: 'ORGANIZATION_REFERENCE_NOT_FOUND',
        field: 'organizationId'
      }
    })
  })

  it('records Organization, Evaluator, and Placement mutations in verified scopes', async () => {
    const term = await terms.create({
      code: '1/2571',
      academicYear: 2571,
      semester: '1',
      startsAt: new Date('2027-06-01T00:00:00.000Z'),
      endsAt: new Date('2027-10-31T00:00:00.000Z'),
      status: 'open'
    })
    const student = await students.create({
      ...input('6631503125', 'placement-audit@example.com'),
      academicTermId: term.id,
      semester: '1',
      academicYear: 2571
    })
    const scopedStaff: AuthenticatedActor = {
      id: 'staff-placement-mutation',
      email: 'placement-staff@mfu.ac.th',
      displayName: 'Placement Staff',
      roles: ['internshipStaff'],
      scope: { tenant: false, schoolIds: [schoolId], programIds: [programId] }
    }
    const scopedReader: AuthenticatedActor = {
      ...scopedStaff,
      id: 'staff-placement-audit-reader'
    }
    const unrelatedReader: AuthenticatedActor = {
      ...scopedStaff,
      id: 'staff-unrelated-audit-reader',
      scope: {
        tenant: false,
        schoolIds: [otherSchoolId],
        programIds: [otherProgramId]
      }
    }
    const placement = (await service.createPlacement(
      scopedStaff,
      {
        studentId: student.id,
        organizationId,
        academicTermId: term.id,
        schoolId,
        programId,
        positionTitle: { th: 'นักศึกษาฝึกงาน', en: 'Intern' },
        startsAt: new Date('2027-06-15T00:00:00.000Z'),
        endsAt: new Date('2027-08-15T00:00:00.000Z'),
        status: 'active'
      },
      'placement-request'
    )) as { id: string }
    const evaluator = (await service.createEvaluator(
      scopedStaff,
      {
        organizationId,
        email: 'placement-evaluator@example.com',
        name: { th: 'ผู้ประเมิน', en: 'Evaluator' },
        position: { th: 'หัวหน้างาน', en: 'Supervisor' },
        status: 'active'
      },
      'evaluator-request'
    )) as { id: string }

    const scopedAudit = await auditService.list(scopedReader, {
      page: 1,
      pageSize: 25
    })
    expect(scopedAudit.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          action: 'placements.created',
          requestId: 'placement-request',
          resourceScopes: [
            { tenant: false, schoolIds: [schoolId], programIds: [programId] }
          ],
          metadata: { placementRecordId: placement.id }
        }),
        expect.objectContaining({
          action: 'evaluators.created',
          requestId: 'evaluator-request',
          resourceScopes: [
            { tenant: false, schoolIds: [schoolId], programIds: [programId] }
          ],
          metadata: {
            evaluatorRecordId: evaluator.id,
            organizationRecordId: organizationId
          }
        })
      ])
    )
    await expect(
      auditService.list(unrelatedReader, { page: 1, pageSize: 25 })
    ).resolves.toMatchObject({ items: [], total: 0 })

    const organization = (await service.createOrganization(
      admin,
      {
        organizationCode: 'AUDIT-ORG',
        name: { th: 'องค์กรตรวจสอบ', en: 'Audit Organization' },
        status: 'active'
      },
      'organization-request'
    )) as { id: string }
    const tenantReader: AuthenticatedActor = {
      ...scopedReader,
      id: 'tenant-audit-reader',
      scope: { tenant: true, schoolIds: [], programIds: [] }
    }
    const tenantAudit = await auditService.list(tenantReader, {
      page: 1,
      pageSize: 25
    })
    expect(tenantAudit.items).toContainEqual(
      expect.objectContaining({
        action: 'organizations.created',
        requestId: 'organization-request',
        resourceScopes: [{ tenant: true, schoolIds: [], programIds: [] }],
        metadata: { organizationRecordId: organization.id }
      })
    )
  })

  it('rolls back Placement creation when its scoped audit write fails', async () => {
    const term = await terms.create({
      code: '1/2572',
      academicYear: 2572,
      semester: '1',
      startsAt: new Date('2028-06-01T00:00:00.000Z'),
      endsAt: new Date('2028-10-31T00:00:00.000Z'),
      status: 'open'
    })
    const student = await students.create({
      ...input('6631503126', 'placement-audit-failure@example.com'),
      academicTermId: term.id,
      semester: '1',
      academicYear: 2572
    })
    const failingService = new MembersService(
      students,
      organizations,
      evaluators,
      placements,
      terms,
      assignments,
      cycles,
      schools,
      programs,
      courses,
      {
        record: vi.fn().mockRejectedValue(new Error('audit write failed'))
      } as never
    )

    await expect(
      failingService.createPlacement(admin, {
        studentId: student.id,
        organizationId,
        academicTermId: term.id,
        schoolId,
        programId,
        positionTitle: { th: 'นักศึกษาฝึกงาน', en: 'Intern' },
        startsAt: new Date('2028-06-15T00:00:00.000Z'),
        endsAt: new Date('2028-08-15T00:00:00.000Z'),
        status: 'active'
      })
    ).rejects.toThrow('audit write failed')
    await expect(placements.countDocuments({})).resolves.toBe(0)
    await expect(
      auditLogs.countDocuments({ action: 'placements.created' })
    ).resolves.toBe(0)
  })

  it('scopes Organization and Evaluator directories to visible Placements', async () => {
    const secondOrganization = await organizations.create({
      organizationCode: 'MFU-TEST-2',
      name: { th: 'องค์กรที่สอง', en: 'Second Organization' },
      status: 'active'
    })
    const secondOwnOrganization = await organizations.create({
      organizationCode: 'MFU-TEST-3',
      name: { th: 'องค์กรที่สาม', en: 'Third Organization' },
      status: 'active'
    })
    await service.createEvaluator(admin, {
      organizationId,
      email: 'first@company.example',
      name: { th: 'ผู้ประเมินหนึ่ง', en: 'Evaluator One' },
      position: { th: 'หัวหน้างาน', en: 'Supervisor' },
      status: 'active'
    })
    await service.createEvaluator(admin, {
      organizationId,
      email: 'backup@company.example',
      name: { th: 'ผู้ประเมินสำรอง', en: 'Backup Evaluator' },
      position: { th: 'หัวหน้างาน', en: 'Supervisor' },
      status: 'active'
    })
    await service.createEvaluator(admin, {
      organizationId: secondOrganization.id,
      email: 'second@company.example',
      name: { th: 'ผู้ประเมินสอง', en: 'Evaluator Two' },
      position: { th: 'หัวหน้างาน', en: 'Supervisor' },
      status: 'active'
    })
    await service.createEvaluator(admin, {
      organizationId: secondOwnOrganization.id,
      email: 'mismatch@company.example',
      name: { th: 'ผู้ประเมินที่ไม่ตรงบริษัท', en: 'Mismatched Evaluator' },
      position: { th: 'หัวหน้างาน', en: 'Supervisor' },
      status: 'active'
    })
    const term = await terms.create({
      code: '1/2567',
      academicYear: 2567,
      semester: '1',
      startsAt: new Date('2024-06-01T00:00:00.000Z'),
      endsAt: new Date('2024-10-31T00:00:00.000Z'),
      status: 'open'
    })
    const firstStudent = await students.create({
      ...input('6631503001', 'first.student@example.com'),
      academicTermId: term.id,
      semester: '1',
      academicYear: 2567
    })
    const secondStudent = await students.create({
      ...input('6631503002', 'second.student@example.com'),
      schoolId: otherSchoolId,
      programId: otherProgramId,
      academicTermId: term.id,
      semester: '1',
      academicYear: 2567
    })
    const secondTerm = await terms.create({
      code: '1/2566',
      academicYear: 2566,
      semester: '1',
      startsAt: new Date('2023-06-01T00:00:00.000Z'),
      endsAt: new Date('2023-10-31T00:00:00.000Z'),
      status: 'open'
    })
    const placement = (
      studentId: string,
      companyId: string,
      school: string,
      program: string,
      academicTermId: string = term.id
    ): PlacementRecord => ({
      studentId,
      organizationId: companyId,
      academicTermId,
      schoolId: school,
      programId: program,
      positionTitle: { th: 'นักศึกษาฝึกงาน', en: 'Intern' },
      startsAt: new Date('2024-06-15T00:00:00.000Z'),
      endsAt: new Date('2024-08-15T00:00:00.000Z'),
      status: 'completed' as const
    })
    const firstPlacement = (await service.createPlacement(
      admin,
      placement(firstStudent.studentId, organizationId, schoolId, programId)
    )) as { id: string }
    await placements.create(
      placement(
        firstStudent.studentId,
        secondOwnOrganization.id,
        schoolId,
        programId,
        secondTerm.id
      )
    )
    const secondStudentPlacement = (await service.createPlacement(
      admin,
      placement(
        secondStudent.studentId,
        secondOrganization.id,
        otherSchoolId,
        otherProgramId
      )
    )) as { id: string }

    const [assignedEvaluator, backupEvaluator, mismatchedEvaluator] =
      await Promise.all([
        evaluators.findOne({ email: 'first@company.example' }).exec(),
        evaluators.findOne({ email: 'backup@company.example' }).exec(),
        evaluators.findOne({ email: 'mismatch@company.example' }).exec()
      ])
    expect(assignedEvaluator).not.toBeNull()
    expect(backupEvaluator).not.toBeNull()
    expect(mismatchedEvaluator).not.toBeNull()
    const assignment = (
      cycleId: string,
      placementId: string,
      studentId: string,
      evaluatorId: string
    ): EvaluationAssignmentRecord => ({
      cycleId,
      placementId,
      evaluatorId,
      studentId,
      schoolId,
      programId,
      questionSnapshot: [],
      competencySetVersionId: '64b000000000000000000001',
      deadlineAt: new Date('2025-10-31T23:59:59.000Z'),
      evaluationVersion: 1,
      status: 'pending' as const
    })
    await assignments.create([
      assignment(
        'directory-valid-assignment',
        firstPlacement.id,
        firstStudent.studentId,
        assignedEvaluator!.id
      ),
      assignment(
        'directory-wrong-evaluator-organization',
        firstPlacement.id,
        firstStudent.id,
        mismatchedEvaluator!.id
      ),
      assignment(
        'directory-foreign-placement',
        secondStudentPlacement.id,
        firstStudent.id,
        backupEvaluator!.id
      )
    ])

    const scopedStaff: AuthenticatedActor = {
      ...admin,
      roles: ['internshipStaff'],
      scope: { tenant: false, schoolIds: [schoolId], programIds: [programId] }
    }
    const scopedCoordinator: AuthenticatedActor = {
      ...admin,
      roles: ['coordinator'],
      scope: {
        tenant: false,
        schoolIds: [otherSchoolId],
        programIds: [otherProgramId]
      }
    }
    const firstStudentActor: AuthenticatedActor = {
      ...admin,
      roles: ['student'],
      scope: {
        tenant: false,
        schoolIds: [schoolId],
        programIds: [programId],
        studentId: firstStudent.studentId
      }
    }
    const scopedAuditor: AuthenticatedActor = {
      ...admin,
      roles: ['auditor'],
      scope: { tenant: false, schoolIds: [schoolId], programIds: [programId] }
    }
    const evaluatorActor: AuthenticatedActor = {
      ...admin,
      roles: ['evaluator'],
      scope: {
        tenant: false,
        schoolIds: [],
        programIds: [],
        assignmentId: 'assignment-for-first-student'
      }
    }
    const page = {
      page: 1,
      pageSize: 50
    }

    const studentReadMatrix: ReadonlyArray<{
      role: string
      actor: AuthenticatedActor
      requestedStudentId?: string
      expectedIds: readonly string[]
    }> = [
      {
        role: 'systemAdmin',
        actor: admin,
        expectedIds: [firstStudent.id, secondStudent.id]
      },
      {
        role: 'internshipStaff',
        actor: scopedStaff,
        requestedStudentId: secondStudent.studentId,
        expectedIds: [firstStudent.id]
      },
      {
        role: 'coordinator',
        actor: scopedCoordinator,
        requestedStudentId: firstStudent.studentId,
        expectedIds: [secondStudent.id]
      },
      {
        role: 'student',
        actor: firstStudentActor,
        requestedStudentId: secondStudent.studentId,
        expectedIds: [firstStudent.id]
      },
      {
        role: 'evaluator',
        actor: evaluatorActor,
        requestedStudentId: firstStudent.studentId,
        expectedIds: []
      },
      {
        role: 'auditor',
        actor: scopedAuditor,
        requestedStudentId: secondStudent.studentId,
        expectedIds: [firstStudent.id]
      }
    ]

    for (const testCase of studentReadMatrix) {
      const result = (await service.listStudents(testCase.actor, page)) as {
        items: Array<{ id: string }>
      }
      expect(
        result.items.map((student) => student.id).sort(),
        testCase.role
      ).toEqual([...testCase.expectedIds].sort())

      if (testCase.requestedStudentId) {
        const filtered = (await service.listStudents(testCase.actor, {
          ...page,
          studentId: testCase.requestedStudentId
        })) as { items: Array<{ id: string }> }
        expect(
          filtered.items,
          `${testCase.role} cannot query another Student`
        ).toHaveLength(0)
      }
    }

    const directoryStudentPage = (await service.listStudents(admin, page)) as {
      items: Array<{
        id: string
        directoryRelations?: {
          assignments?: Array<{ studentId: string }>
          placements?: Array<{
            studentId: string
            organization?: { id: string; name: { en: string } }
          }>
        }
      }>
    }
    const firstStudentRelations = directoryStudentPage.items.find(
      (student) => student.id === firstStudent.id
    )?.directoryRelations
    expect(
      firstStudentRelations?.placements?.map((item) => item.studentId).sort()
    ).toEqual([firstStudent.id, firstStudent.id].sort())
    expect(
      firstStudentRelations?.placements?.some(
        (placement) =>
          placement.organization?.id === organizationId &&
          placement.organization.name.en === 'Test Organization'
      )
    ).toBe(true)
    expect(
      firstStudentRelations?.placements?.some(
        (placement) =>
          placement.organization?.id === secondOwnOrganization.id &&
          placement.organization.name.en === 'Third Organization'
      )
    ).toBe(true)
    expect(
      directoryStudentPage.items
        .find((student) => student.id === firstStudent.id)
        ?.directoryRelations?.assignments?.map((item) => item.studentId)
        .every((reference) => reference === firstStudent.id)
    ).toBe(true)

    const placementReadMatrix: ReadonlyArray<{
      role: string
      actor: AuthenticatedActor
      requestedStudentId?: string
      expectedStudentIds: readonly string[]
    }> = [
      {
        role: 'systemAdmin',
        actor: admin,
        expectedStudentIds: [firstStudent.id, firstStudent.id, secondStudent.id]
      },
      {
        role: 'internshipStaff',
        actor: scopedStaff,
        requestedStudentId: secondStudent.studentId,
        expectedStudentIds: [firstStudent.id, firstStudent.id]
      },
      {
        role: 'coordinator',
        actor: scopedCoordinator,
        requestedStudentId: firstStudent.studentId,
        expectedStudentIds: [secondStudent.id]
      },
      {
        role: 'student',
        actor: firstStudentActor,
        requestedStudentId: secondStudent.studentId,
        expectedStudentIds: [firstStudent.id, firstStudent.id]
      },
      {
        role: 'evaluator',
        actor: evaluatorActor,
        requestedStudentId: firstStudent.studentId,
        expectedStudentIds: []
      },
      {
        role: 'auditor',
        actor: scopedAuditor,
        requestedStudentId: secondStudent.studentId,
        expectedStudentIds: [firstStudent.id, firstStudent.id]
      }
    ]

    for (const testCase of placementReadMatrix) {
      const result = (await service.listPlacements(testCase.actor, page)) as {
        items: Array<{ studentId: string }>
      }
      expect(
        result.items.map((placement) => placement.studentId).sort(),
        testCase.role
      ).toEqual([...testCase.expectedStudentIds].sort())

      if (testCase.requestedStudentId) {
        const filtered = (await service.listPlacements(testCase.actor, {
          ...page,
          studentId: testCase.requestedStudentId
        })) as { items: Array<{ studentId: string }> }
        expect(
          filtered.items,
          `${testCase.role} cannot query another Student's placement`
        ).toHaveLength(0)
      }
    }

    await expect(
      service.getStudent(admin, firstStudent.id)
    ).resolves.toMatchObject({ id: firstStudent.id })
    await expect(
      service.getStudent(scopedStaff, firstStudent.studentId)
    ).resolves.toMatchObject({ id: firstStudent.id })
    await expect(
      service.getStudent(scopedCoordinator, secondStudent.id)
    ).resolves.toMatchObject({ id: secondStudent.id })
    await expect(
      service.getStudent(firstStudentActor, firstStudent.id)
    ).resolves.toMatchObject({ id: firstStudent.id })
    await expect(
      service.getStudent(scopedAuditor, firstStudent.id)
    ).resolves.toMatchObject({ id: firstStudent.id })

    await expect(
      service.getStudent(scopedStaff, secondStudent.id)
    ).rejects.toMatchObject({ status: 404 })
    await expect(
      service.getStudent(scopedCoordinator, firstStudent.id)
    ).rejects.toMatchObject({ status: 404 })
    await expect(
      service.getStudent(firstStudentActor, secondStudent.studentId)
    ).rejects.toMatchObject({ status: 404 })
    await expect(
      service.getStudent(evaluatorActor, firstStudent.id)
    ).rejects.toMatchObject({ status: 404 })
    await expect(
      service.getStudent(scopedAuditor, secondStudent.id)
    ).rejects.toMatchObject({ status: 404 })

    const [
      adminOrganizations,
      adminEvaluators,
      staffOrganizations,
      staffEvaluators,
      coordinatorOrganizations,
      coordinatorEvaluators,
      auditorOrganizations,
      auditorEvaluators,
      studentOrganizations,
      studentEvaluators
    ] = (await Promise.all([
      service.listOrganizations(admin, page),
      service.listEvaluators(admin, page),
      service.listOrganizations(scopedStaff, page),
      service.listEvaluators(scopedStaff, page),
      service.listOrganizations(scopedCoordinator, page),
      service.listEvaluators(scopedCoordinator, page),
      service.listOrganizations(scopedAuditor, page),
      service.listEvaluators(scopedAuditor, page),
      service.listOrganizations(firstStudentActor, page),
      service.listEvaluators(firstStudentActor, page)
    ])) as [
      { items: Array<{ organizationCode?: string }> },
      { items: Array<{ email?: string }> },
      { items: Array<{ organizationCode?: string; email?: string }> },
      { items: Array<{ organizationCode?: string; email?: string }> },
      { items: Array<{ organizationCode?: string; email?: string }> },
      { items: Array<{ email?: string }> },
      { items: Array<{ organizationCode?: string }> },
      { items: Array<{ email?: string }> },
      { items: Array<{ organizationCode?: string }> },
      { items: Array<{ email?: string }> }
    ]

    expect(
      adminOrganizations.items.map((item) => item.organizationCode).sort()
    ).toEqual(['MFU-TEST', 'MFU-TEST-2', 'MFU-TEST-3'])
    expect(adminEvaluators.items.map((item) => item.email).sort()).toEqual([
      'backup@company.example',
      'first@company.example',
      'mismatch@company.example',
      'second@company.example'
    ])
    expect(
      staffOrganizations.items.map((item) => item.organizationCode)
    ).toEqual(['MFU-TEST', 'MFU-TEST-3'])
    expect(staffEvaluators.items.map((item) => item.email).sort()).toEqual([
      'backup@company.example',
      'first@company.example',
      'mismatch@company.example'
    ])
    expect(
      coordinatorOrganizations.items.map((item) => item.organizationCode)
    ).toEqual(['MFU-TEST-2'])
    expect(coordinatorEvaluators.items.map((item) => item.email)).toEqual([
      'second@company.example'
    ])
    expect(
      auditorOrganizations.items.map((item) => item.organizationCode).sort()
    ).toEqual(['MFU-TEST', 'MFU-TEST-3'])
    expect(auditorEvaluators.items.map((item) => item.email).sort()).toEqual([
      'backup@company.example',
      'first@company.example',
      'mismatch@company.example'
    ])
    expect(
      studentOrganizations.items.map((item) => item.organizationCode).sort()
    ).toEqual(['MFU-TEST', 'MFU-TEST-3'])
    expect(studentEvaluators.items.map((item) => item.email)).toEqual([
      'first@company.example'
    ])

    await expect(
      service.listOrganizations(firstStudentActor, {
        ...page,
        search: 'MFU-TEST-2'
      })
    ).resolves.toMatchObject({ items: [], meta: { total: 0 } })
    await expect(
      service.listEvaluators(firstStudentActor, {
        ...page,
        organizationId: secondOrganization.id
      })
    ).resolves.toMatchObject({ items: [], meta: { total: 0 } })
    await expect(
      service.listEvaluators(firstStudentActor, {
        ...page,
        search: 'backup@company.example'
      })
    ).resolves.toMatchObject({ items: [], meta: { total: 0 } })
    await expect(
      service.listEvaluators(firstStudentActor, {
        ...page,
        search: 'second@company.example'
      })
    ).resolves.toMatchObject({ items: [], meta: { total: 0 } })
    await expect(
      service.listEvaluators(firstStudentActor, {
        ...page,
        search: 'mismatch@company.example'
      })
    ).resolves.toMatchObject({ items: [], meta: { total: 0 } })

    const invalidTenantCoordinator: AuthenticatedActor = {
      ...scopedCoordinator,
      id: 'invalid-tenant-coordinator',
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
    const [invalidTenantOrganizations, invalidTenantEvaluators] =
      (await Promise.all([
        service.listOrganizations(invalidTenantCoordinator, page),
        service.listEvaluators(invalidTenantCoordinator, page)
      ])) as [
        { items: Array<{ organizationCode?: string }> },
        { items: Array<{ email?: string }> }
      ]
    expect(invalidTenantOrganizations.items).toEqual([])
    expect(invalidTenantEvaluators.items).toEqual([])

    const firstDocument = await documents.create({
      studentId: firstStudent.id,
      templateVersionId: '64f000000000000000000001',
      requestedBy: 'former-staff',
      idempotencyKey: 'document-first-current',
      status: 'ready',
      objectKey: 'private/first-current.pdf'
    })
    const firstLegacyDocument = await documents.create({
      studentId: firstStudent.studentId,
      templateVersionId: '64f000000000000000000001',
      requestedBy: 'former-staff',
      idempotencyKey: 'document-first-legacy',
      status: 'ready',
      objectKey: 'private/first-legacy.pdf'
    })
    const secondDocument = await documents.create({
      studentId: secondStudent.id,
      templateVersionId: '64f000000000000000000001',
      requestedBy: 'former-staff',
      idempotencyKey: 'document-second',
      status: 'ready',
      objectKey: 'private/second.pdf'
    })
    const [
      staffDocumentPage,
      studentDocumentPage,
      coordinatorDocumentPage,
      auditorDocumentPage,
      allDocumentPage
    ] = (await Promise.all([
      documentService.listDocuments(scopedStaff, page),
      documentService.listDocuments(firstStudentActor, page),
      documentService.listDocuments(scopedCoordinator, page),
      documentService.listDocuments(scopedAuditor, page),
      documentService.listDocuments(admin, page)
    ])) as [
      { items: Array<{ id: string }> },
      { items: Array<{ id: string }> },
      { items: Array<{ id: string }> },
      { items: Array<{ id: string }> },
      { items: Array<{ id: string }> }
    ]
    const firstDocumentIds = [firstDocument.id, firstLegacyDocument.id].sort()
    expect(staffDocumentPage.items.map((item) => item.id).sort()).toEqual(
      firstDocumentIds
    )
    expect(studentDocumentPage.items.map((item) => item.id).sort()).toEqual(
      firstDocumentIds
    )
    expect(auditorDocumentPage.items.map((item) => item.id).sort()).toEqual(
      firstDocumentIds
    )
    expect(coordinatorDocumentPage.items.map((item) => item.id)).toEqual([
      secondDocument.id
    ])
    expect(allDocumentPage.items).toHaveLength(3)
    await expect(
      documentService.listDocuments(evaluatorActor, page)
    ).rejects.toMatchObject({ status: 403 })
    const [
      staffOwnDocument,
      studentOwnDocument,
      coordinatorScopedDocument,
      auditorScopedDocument,
      adminDocument
    ] = await Promise.all([
      documentService.getDocument(scopedStaff, firstDocument.id),
      documentService.getDocument(firstStudentActor, firstDocument.id),
      documentService.getDocument(scopedCoordinator, secondDocument.id),
      documentService.getDocument(scopedAuditor, firstDocument.id),
      documentService.getDocument(admin, secondDocument.id)
    ])
    expect(staffOwnDocument.toJSON()).toMatchObject({ id: firstDocument.id })
    expect(studentOwnDocument.toJSON()).toMatchObject({ id: firstDocument.id })
    expect(coordinatorScopedDocument.toJSON()).toMatchObject({
      id: secondDocument.id
    })
    expect(auditorScopedDocument.toJSON()).toMatchObject({
      id: firstDocument.id
    })
    expect(adminDocument.toJSON()).toMatchObject({ id: secondDocument.id })

    await expect(
      documentService.getDocument(scopedStaff, secondDocument.id)
    ).rejects.toMatchObject({ status: 404 })
    await expect(
      documentService.getDocument(firstStudentActor, secondDocument.id)
    ).rejects.toMatchObject({ status: 404 })
    await expect(
      documentService.getDocument(scopedCoordinator, firstDocument.id)
    ).rejects.toMatchObject({ status: 404 })
    await expect(
      documentService.getDocument(scopedAuditor, secondDocument.id)
    ).rejects.toMatchObject({ status: 404 })
    await expect(
      documentService.getDocument(evaluatorActor, firstDocument.id)
    ).rejects.toMatchObject({ status: 403 })
    await expect(
      documentService.downloadUrl(evaluatorActor, firstDocument.id)
    ).rejects.toMatchObject({ status: 403 })

    await expect(
      service.createEvaluator(scopedStaff, {
        organizationId: secondOrganization.id,
        email: 'outside@company.example',
        name: { th: 'ผู้ประเมินนอกขอบเขต', en: 'Out-of-scope' },
        position: { th: 'หัวหน้างาน', en: 'Supervisor' },
        status: 'active'
      })
    ).rejects.toMatchObject({ status: 404 })
    await expect(
      service.createOrganization(scopedStaff, {
        organizationCode: 'SCOPE-BYPASS',
        name: { th: 'ไม่ควรสร้าง', en: 'Should not create' },
        status: 'active'
      })
    ).rejects.toMatchObject({ status: 403 })
  })

  it('does not create a placement for a student outside the staff assignment scope', async () => {
    const term = await terms.create({
      code: '1/2567',
      academicYear: 2567,
      semester: '1',
      startsAt: new Date('2024-06-01T00:00:00.000Z'),
      endsAt: new Date('2024-10-31T00:00:00.000Z'),
      status: 'open'
    })
    const student = await students.create({
      ...input('6631503001', 'student@example.com'),
      academicTermId: term.id,
      semester: '1',
      academicYear: 2567
    })
    const scopedStaff: AuthenticatedActor = {
      id: 'staff-scoped',
      email: 'staff@mfu.ac.th',
      displayName: 'Scoped Staff',
      roles: ['internshipStaff'],
      scope: {
        tenant: false,
        schoolIds: [otherSchoolId],
        programIds: [otherProgramId]
      }
    }

    await expect(
      service.createPlacement(scopedStaff, {
        studentId: student.id,
        organizationId,
        academicTermId: term.id,
        schoolId: otherSchoolId,
        programId: otherProgramId,
        positionTitle: { th: 'นักศึกษาฝึกงาน', en: 'Intern' },
        startsAt: new Date('2024-06-15T00:00:00.000Z'),
        endsAt: new Date('2024-08-15T00:00:00.000Z'),
        status: 'active'
      })
    ).rejects.toMatchObject({
      status: 404,
      response: { code: 'RESOURCE_NOT_FOUND' }
    })
    await expect(placements.countDocuments({})).resolves.toBe(0)
  })

  it('keeps academic master lists inside each paired role scope', async () => {
    const outsideScopeSchool = await schools.create({
      schoolCode: 'OUT',
      name: { th: 'สำนักวิชานอกขอบเขต', en: 'Out-of-scope School' },
      status: 'active'
    })
    const unrelatedProgram = await programs.create({
      schoolId,
      programCode: 'UNRELATED',
      name: { th: 'หลักสูตรอื่น', en: 'Unrelated Program' },
      status: 'active'
    })
    await courses.create({
      courseCode: 'UNRELATED-COURSE',
      programIds: [unrelatedProgram.id],
      name: { th: 'รายวิชาอื่น', en: 'Unrelated Course' },
      status: 'active'
    })
    const scopedActor: AuthenticatedActor = {
      ...admin,
      roles: ['internshipStaff', 'coordinator'],
      scope: {
        tenant: false,
        schoolIds: [schoolId, otherSchoolId],
        programIds: [programId, otherProgramId]
      },
      roleScopes: [
        {
          role: 'internshipStaff',
          tenant: false,
          schoolIds: [schoolId],
          programIds: [programId]
        },
        {
          role: 'coordinator',
          tenant: false,
          schoolIds: [otherSchoolId],
          programIds: [otherProgramId]
        }
      ]
    }
    const academic = new AcademicService(
      schools,
      programs,
      courses,
      terms,
      auditService
    )

    const schoolPage = (await academic.listSchools(scopedActor, {
      page: 1,
      pageSize: 50
    })) as { items: Array<{ id: string }> }
    const programPage = (await academic.listPrograms(scopedActor, {
      page: 1,
      pageSize: 50
    })) as { items: Array<{ id: string }> }
    const coursePage = (await academic.listCourses(scopedActor, {
      page: 1,
      pageSize: 50
    })) as { items: Array<{ id: string }> }

    expect(schoolPage.items.map((item) => item.id).sort()).toEqual(
      [schoolId, otherSchoolId].sort()
    )
    const scopedSchoolLookup = (await academic.listSchools(
      scopedActor,
      { page: 1, pageSize: 25 },
      {
        search: 'LAW',
        schoolIds: [schoolId, otherSchoolId],
        archived: false
      }
    )) as { items: Array<{ id: string }> }
    expect(scopedSchoolLookup.items.map((item) => item.id)).toEqual([
      otherSchoolId
    ])
    const attemptedScopeExpansion = (await academic.listSchools(
      scopedActor,
      { page: 1, pageSize: 25 },
      { search: 'OUT', schoolIds: [outsideScopeSchool.id], archived: false }
    )) as { items: Array<{ id: string }> }
    expect(attemptedScopeExpansion.items).toEqual([])
    expect(programPage.items.map((item) => item.id).sort()).toEqual(
      [programId, otherProgramId].sort()
    )
    expect(coursePage.items.map((item) => item.id).sort()).toEqual(
      [courseId, otherCourseId].sort()
    )
    await expect(
      academic.updateProgram(scopedActor, otherProgramId, {
        name: { th: 'แก้ไขข้ามขอบเขต', en: 'Out-of-scope edit' }
      })
    ).rejects.toMatchObject({ status: 404 })
    await expect(
      academic.updateCourse(scopedActor, otherCourseId, {
        name: { th: 'แก้ไขข้ามขอบเขต', en: 'Out-of-scope edit' }
      })
    ).rejects.toMatchObject({ status: 404 })

    await expect(
      academic.createCourse(scopedActor, {
        courseCode: 'SCOPED-COURSE',
        programIds: [programId],
        name: { th: 'รายวิชาในขอบเขต', en: 'Scoped Course' },
        status: 'active'
      })
    ).resolves.toMatchObject({ courseCode: 'SCOPED-COURSE' })
    await expect(
      academic.createCourse(scopedActor, {
        courseCode: 'OUTSIDE-COURSE',
        programIds: [otherProgramId],
        name: { th: 'รายวิชานอกขอบเขต', en: 'Out-of-scope Course' },
        status: 'active'
      })
    ).rejects.toMatchObject({ status: 403 })
    await expect(
      academic.createTerm(scopedActor, {
        code: '2/2567',
        academicYear: 2567,
        semester: '2',
        startsAt: new Date('2024-11-01T00:00:00.000Z'),
        endsAt: new Date('2025-03-31T00:00:00.000Z'),
        status: 'planned'
      } as AcademicTermRecord)
    ).rejects.toMatchObject({ status: 403 })
  })

  it('limits Academic Term reads to linked and authorized scope references', async () => {
    const scopedTerm = await terms.create({
      code: 'SCOPE-TERM-A',
      academicYear: 2582,
      semester: '1',
      startsAt: new Date('2039-06-01T00:00:00.000Z'),
      endsAt: new Date('2039-10-31T00:00:00.000Z'),
      status: 'open'
    })
    const profileTerm = await terms.create({
      code: 'STUDENT-PROFILE-TERM',
      academicYear: 2581,
      semester: '2',
      startsAt: new Date('2038-11-01T00:00:00.000Z'),
      endsAt: new Date('2039-03-31T00:00:00.000Z'),
      status: 'closed'
    })
    const foreignTerm = await terms.create({
      code: 'SCOPE-TERM-B',
      academicYear: 2582,
      semester: '1',
      startsAt: new Date('2039-06-01T00:00:00.000Z'),
      endsAt: new Date('2039-10-31T00:00:00.000Z'),
      status: 'open'
    })
    const archivedTerm = await terms.create({
      code: 'ARCHIVED-TERM',
      academicYear: 2580,
      semester: '2',
      startsAt: new Date('2037-11-01T00:00:00.000Z'),
      endsAt: new Date('2038-03-31T00:00:00.000Z'),
      status: 'archived'
    })
    const scopedStudent = await students.create({
      ...input('TERM-SCOPE-A', 'term-scope-a@example.com'),
      academicTermId: profileTerm.id
    })
    const foreignStudent = await students.create({
      ...input('TERM-SCOPE-B', 'term-scope-b@example.com'),
      schoolId: otherSchoolId,
      programId: otherProgramId,
      academicTermId: foreignTerm.id
    })
    await placements.create({
      studentId: scopedStudent.id,
      organizationId,
      academicTermId: scopedTerm.id,
      schoolId,
      programId,
      positionTitle: { th: 'ฝึกงาน', en: 'Internship' },
      startsAt: scopedTerm.startsAt,
      endsAt: scopedTerm.endsAt,
      status: 'planned'
    })
    const foreignPlacement = await placements.create({
      studentId: foreignStudent.id,
      organizationId,
      academicTermId: foreignTerm.id,
      schoolId: otherSchoolId,
      programId: otherProgramId,
      positionTitle: { th: 'ฝึกงาน', en: 'Internship' },
      startsAt: foreignTerm.startsAt,
      endsAt: foreignTerm.endsAt,
      status: 'planned'
    })
    const scopedActor: AuthenticatedActor = {
      ...admin,
      roles: ['coordinator'],
      scope: { tenant: false, schoolIds: [], programIds: [programId] },
      roleScopes: [
        {
          role: 'coordinator',
          tenant: false,
          schoolIds: [],
          programIds: [programId]
        }
      ]
    }
    const academic = new AcademicService(
      schools,
      programs,
      courses,
      terms,
      auditService,
      cycles,
      placements,
      students,
      assignments
    )
    const controller = new AcademicController(academic)
    const readTerms = async (
      actor: AuthenticatedActor,
      academicYear?: number,
      filters: {
        readonly archived?: boolean
        readonly search?: string
        readonly termIds?: readonly string[]
      } = {}
    ): Promise<{ items: Array<{ id: string }> }> =>
      (await controller.listTerms(
        { actor } as unknown as AuthenticatedRequest,
        {
          page: 1,
          pageSize: 50,
          ...(academicYear !== undefined
            ? { academicYear: String(academicYear) }
            : {}),
          ...(filters.search !== undefined ? { search: filters.search } : {}),
          ...(filters.termIds !== undefined
            ? { termIds: filters.termIds.join(',') }
            : {}),
          ...(filters.archived !== undefined
            ? { archived: String(filters.archived) }
            : {})
        }
      )) as { items: Array<{ id: string }> }

    const response = await readTerms(scopedActor)

    expect(response.items.map((item) => item.id)).toEqual([scopedTerm.id])
    expect(response.items.map((item) => item.id)).not.toContain(foreignTerm.id)
    const requestedForeignTerm = await readTerms(scopedActor, undefined, {
      termIds: [foreignTerm.id],
      archived: true
    })
    expect(requestedForeignTerm.items).toEqual([])
    const searchedScopedTerm = await readTerms(scopedActor, undefined, {
      search: 'SCOPE-TERM-A',
      archived: false
    })
    expect(searchedScopedTerm.items.map((item) => item.id)).toEqual([
      scopedTerm.id
    ])
    const outOfScopeYearTerms = await readTerms(scopedActor, 2581)
    expect(outOfScopeYearTerms.items).toEqual([])

    const studentActor: AuthenticatedActor = {
      ...admin,
      roles: ['student'],
      scope: {
        tenant: false,
        schoolIds: [],
        programIds: [],
        studentId: scopedStudent.studentId
      },
      roleScopes: [
        { role: 'student', tenant: false, schoolIds: [], programIds: [] }
      ]
    }
    const studentTerms = await readTerms(studentActor)
    expect(new Set(studentTerms.items.map((item) => item.id))).toEqual(
      new Set([scopedTerm.id, profileTerm.id])
    )
    const foreignStudentTerms = await readTerms({
      ...studentActor,
      scope: { ...studentActor.scope, studentId: foreignStudent.studentId }
    })
    expect(foreignStudentTerms.items.map((item) => item.id)).toEqual([
      foreignTerm.id
    ])

    const cycle = await cycles.create({
      code: 'EVALUATOR-TERM-SCOPE',
      name: { th: 'รอบทดสอบ', en: 'Test cycle' },
      competencySetVersionId: new Types.ObjectId().toString(),
      academicTermId: foreignTerm.id,
      schoolId: otherSchoolId,
      programId: otherProgramId,
      opensAt: foreignTerm.startsAt,
      closesAt: foreignTerm.endsAt,
      status: 'active'
    })
    const assignment = await assignments.create({
      cycleId: cycle.id,
      placementId: foreignPlacement.id,
      evaluatorId: 'evaluator-term-scope',
      studentId: foreignStudent.id,
      schoolId: otherSchoolId,
      programId: otherProgramId,
      questionSnapshot: [],
      competencySetVersionId: cycle.competencySetVersionId,
      deadlineAt: foreignTerm.endsAt,
      status: 'submitted'
    })
    const evaluatorActor: AuthenticatedActor = {
      ...admin,
      roles: ['evaluator'],
      scope: {
        tenant: false,
        schoolIds: [],
        programIds: [],
        assignmentId: assignment.id
      },
      roleScopes: [
        { role: 'evaluator', tenant: false, schoolIds: [], programIds: [] }
      ]
    }
    const evaluatorTerms = await readTerms(evaluatorActor)
    expect(evaluatorTerms.items.map((item) => item.id)).toEqual([
      foreignTerm.id
    ])

    const auditorActor: AuthenticatedActor = {
      ...scopedActor,
      roles: ['auditor'],
      roleScopes: [
        {
          role: 'auditor',
          tenant: false,
          schoolIds: [],
          programIds: [programId]
        }
      ]
    }
    const auditorTerms = await readTerms(auditorActor)
    expect(auditorTerms.items.map((item) => item.id)).toEqual([scopedTerm.id])

    const staffActor: AuthenticatedActor = {
      ...scopedActor,
      roles: ['internshipStaff'],
      roleScopes: [
        {
          role: 'internshipStaff',
          tenant: false,
          schoolIds: [],
          programIds: [programId]
        }
      ]
    }
    const staffTerms = await readTerms(staffActor)
    expect(staffTerms.items.map((item) => item.id)).toEqual([scopedTerm.id])

    const invalidAssignmentTerms = await readTerms({
      ...evaluatorActor,
      scope: { ...evaluatorActor.scope, assignmentId: 'invalid-assignment' }
    })
    expect(invalidAssignmentTerms.items).toEqual([])

    const adminResponse = await readTerms(admin)
    expect(new Set(adminResponse.items.map((item) => item.id))).toEqual(
      new Set([scopedTerm.id, profileTerm.id, foreignTerm.id, archivedTerm.id])
    )
    const activeAdminTerms = await readTerms(admin, undefined, {
      archived: false
    })
    expect(new Set(activeAdminTerms.items.map((item) => item.id))).toEqual(
      new Set([scopedTerm.id, profileTerm.id, foreignTerm.id])
    )
    const filteredAdminTerms = await readTerms(admin, 2581)
    expect(filteredAdminTerms.items.map((item) => item.id)).toEqual([
      profileTerm.id
    ])
    const tenantStaffResponse = await readTerms({
      ...staffActor,
      roleScopes: [
        {
          role: 'internshipStaff',
          tenant: true,
          schoolIds: [],
          programIds: []
        }
      ],
      scope: { tenant: true, schoolIds: [], programIds: [] }
    })
    expect(new Set(tenantStaffResponse.items.map((item) => item.id))).toEqual(
      new Set([scopedTerm.id, profileTerm.id, foreignTerm.id, archivedTerm.id])
    )
  })

  it('fails closed when a Coordinator carries an invalid tenant scope', async () => {
    const academic = new AcademicService(
      schools,
      programs,
      courses,
      terms,
      auditService
    )
    const tenantCoordinator: AuthenticatedActor = {
      id: 'tenant-coordinator',
      email: 'coordinator@mfu.ac.th',
      displayName: 'Tenant Coordinator',
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

    const schoolsPage = (await academic.listSchools(tenantCoordinator, {
      page: 1,
      pageSize: 50
    })) as { items: readonly unknown[] }
    const programsPage = (await academic.listPrograms(tenantCoordinator, {
      page: 1,
      pageSize: 50
    })) as { items: readonly unknown[] }
    const coursesPage = (await academic.listCourses(tenantCoordinator, {
      page: 1,
      pageSize: 50
    })) as { items: readonly unknown[] }

    expect(schoolsPage.items).toEqual([])
    expect(programsPage.items).toEqual([])
    expect(coursesPage.items).toEqual([])
  })

  it('does not reassign a Program school through generic update or invalidate Student references', async () => {
    const student = await students.create(
      input('6631503099', 'program-reference@example.com')
    )
    const alternateCourse = await courses.create({
      courseCode: 'INT200',
      programIds: [programId],
      name: { th: 'ฝึกงานเพิ่มเติม', en: 'Additional Internship' },
      status: 'active'
    })
    const academic = new AcademicService(
      schools,
      programs,
      courses,
      terms,
      auditService
    )

    await expect(
      academic.updateProgram(admin, programId, { schoolId: otherSchoolId })
    ).rejects.toMatchObject({
      status: 422,
      response: {
        code: 'PROGRAM_SCHOOL_CHANGE_REQUIRES_MIGRATION',
        field: 'schoolId'
      }
    })

    const unchangedProgram = await programs.findById(programId).lean().exec()
    expect(unchangedProgram?.schoolId).toBe(schoolId)
    await expect(
      service.updateStudent(admin, student.id, {
        courseId: alternateCourse.id
      })
    ).resolves.toMatchObject({ courseId: alternateCourse.id })
  })

  it('makes Academic Program create and update audit visible in the verified scope', async () => {
    const schoolScopedStaff: AuthenticatedActor = {
      id: 'staff-academic-school-audit',
      email: 'staff@mfu.ac.th',
      displayName: 'Scoped Staff',
      roles: ['internshipStaff'],
      scope: { tenant: false, schoolIds: [schoolId], programIds: [] }
    }
    const academic = new AcademicService(
      schools,
      programs,
      courses,
      terms,
      auditService
    )
    const created = (await academic.createProgram(
      admin,
      {
        schoolId,
        programCode: 'AUDIT-NEW',
        name: { th: 'หลักสูตรตรวจสอบ', en: 'Audit Program' },
        status: 'active'
      },
      'academic-program-create-request'
    )) as { id: string }
    await academic.updateProgram(
      admin,
      created.id,
      { name: { th: 'หลักสูตรแก้ไข', en: 'Updated Program' } },
      'academic-program-update-request'
    )

    await expect(
      auditLogs.countDocuments({
        action: { $in: ['programs.created', 'programs.updated'] }
      })
    ).resolves.toBe(2)
    const createAudit = await auditService.list(schoolScopedStaff, {
      page: 1,
      pageSize: 25
    })
    expect(createAudit.items).toContainEqual(
      expect.objectContaining({
        action: 'programs.created',
        requestId: 'academic-program-create-request',
        resourceScopes: [
          { tenant: false, schoolIds: [schoolId], programIds: [created.id] }
        ],
        metadata: { programRecordId: created.id }
      })
    )

    const programScopedStaff: AuthenticatedActor = {
      ...schoolScopedStaff,
      id: 'staff-academic-program-audit',
      scope: {
        tenant: false,
        schoolIds: [schoolId],
        programIds: [created.id]
      }
    }
    const updateAudit = await auditService.list(programScopedStaff, {
      page: 1,
      pageSize: 25
    })
    expect(updateAudit.items).toContainEqual(
      expect.objectContaining({
        action: 'programs.updated',
        requestId: 'academic-program-update-request',
        resourceScopes: [
          { tenant: false, schoolIds: [schoolId], programIds: [created.id] }
        ],
        metadata: { programRecordId: created.id }
      })
    )
  })

  it('makes School, Course, and Academic Term mutations visible only in their verified scopes', async () => {
    const schoolScopedStaff: AuthenticatedActor = {
      id: 'staff-school-audit',
      email: 'school-staff@mfu.ac.th',
      displayName: 'School Staff',
      roles: ['internshipStaff'],
      scope: { tenant: false, schoolIds: [schoolId], programIds: [programId] }
    }
    const programScopedStaff: AuthenticatedActor = {
      ...schoolScopedStaff,
      id: 'staff-course-audit'
    }
    const tenantStaff: AuthenticatedActor = {
      ...schoolScopedStaff,
      id: 'staff-tenant-audit',
      scope: { tenant: true, schoolIds: [], programIds: [] }
    }
    const academic = new AcademicService(
      schools,
      programs,
      courses,
      terms,
      auditService
    )

    await academic.createSchool(admin, {
      schoolCode: 'AUDIT-SCHOOL',
      name: { th: 'สำนักวิชาตรวจสอบ', en: 'Audit School' },
      status: 'active'
    })
    await academic.updateSchool(admin, schoolId, {
      name: { th: 'สำนักวิชาแก้ไข', en: 'Updated School' }
    })
    const course = (await academic.createCourse(admin, {
      courseCode: 'AUDIT-COURSE',
      programIds: [programId],
      name: { th: 'รายวิชาตรวจสอบ', en: 'Audit Course' },
      status: 'active'
    })) as { id: string }
    await academic.updateCourse(admin, course.id, {
      name: { th: 'รายวิชาแก้ไข', en: 'Updated Course' }
    })
    const term = (await academic.createTerm(admin, {
      code: '1/2581',
      academicYear: 2581,
      semester: '1',
      startsAt: new Date('2038-06-01T00:00:00.000Z'),
      endsAt: new Date('2038-10-31T00:00:00.000Z'),
      status: 'planned'
    } as AcademicTermRecord)) as { id: string }
    await academic.updateTerm(admin, term.id, { semester: '2' })

    const schoolAudit = await auditService.list(schoolScopedStaff, {
      page: 1,
      pageSize: 50
    })
    const schoolUpdateAudit = schoolAudit.items.find(
      (item) => item.action === 'schools.updated'
    )
    expect(schoolUpdateAudit?.resourceScopes).toContainEqual({
      tenant: false,
      schoolIds: [schoolId],
      programIds: [programId]
    })
    expect(schoolUpdateAudit?.metadata).toEqual({ schoolRecordId: schoolId })

    const courseAudit = await auditService.list(programScopedStaff, {
      page: 1,
      pageSize: 50
    })
    expect(courseAudit.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          action: 'courses.created',
          resourceScopes: [
            { tenant: false, schoolIds: [schoolId], programIds: [programId] }
          ],
          metadata: { courseRecordId: course.id }
        }),
        expect.objectContaining({
          action: 'courses.updated',
          resourceScopes: [
            { tenant: false, schoolIds: [schoolId], programIds: [programId] }
          ],
          metadata: { courseRecordId: course.id }
        })
      ])
    )

    const tenantAudit = await auditService.list(tenantStaff, {
      page: 1,
      pageSize: 50
    })
    expect(tenantAudit.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          action: 'schools.created',
          resourceScopes: [{ tenant: true, schoolIds: [], programIds: [] }]
        }),
        expect.objectContaining({
          action: 'academicTerms.created',
          resourceScopes: [{ tenant: true, schoolIds: [], programIds: [] }],
          metadata: { academicTermRecordId: term.id }
        }),
        expect.objectContaining({
          action: 'academicTerms.updated',
          resourceScopes: [{ tenant: true, schoolIds: [], programIds: [] }],
          metadata: { academicTermRecordId: term.id }
        })
      ])
    )
  })

  it('rolls back Academic master mutations when scoped audit persistence fails', async () => {
    const failingAcademic = new AcademicService(
      schools,
      programs,
      courses,
      terms,
      {
        record: vi.fn().mockRejectedValue(new Error('audit write failed'))
      } as never
    )
    const schoolBefore = await schools.findById(schoolId).lean().exec()
    const programBefore = await programs.findById(programId).lean().exec()
    const courseBefore = await courses.findById(courseId).lean().exec()
    const term = await terms.create({
      code: '1/2573',
      academicYear: 2573,
      semester: '1',
      startsAt: new Date('2029-06-01T00:00:00.000Z'),
      endsAt: new Date('2029-10-31T00:00:00.000Z'),
      status: 'planned'
    })

    await expect(
      failingAcademic.createSchool(admin, {
        schoolCode: 'AUDIT-FAIL-SCHOOL',
        name: { th: 'ไม่ควรสร้าง', en: 'Must roll back' },
        status: 'active'
      })
    ).rejects.toThrow('audit write failed')
    await expect(
      failingAcademic.updateSchool(admin, schoolId, {
        name: { th: 'ไม่ควรแก้', en: 'Must roll back' }
      })
    ).rejects.toThrow('audit write failed')
    await expect(
      failingAcademic.createProgram(admin, {
        schoolId,
        programCode: 'AUDIT-FAIL-PROG',
        name: { th: 'ไม่ควรสร้าง', en: 'Must roll back' },
        status: 'active'
      })
    ).rejects.toThrow('audit write failed')
    await expect(
      failingAcademic.updateProgram(admin, programId, {
        name: { th: 'ไม่ควรแก้', en: 'Must roll back' }
      })
    ).rejects.toThrow('audit write failed')
    await expect(
      failingAcademic.createCourse(admin, {
        courseCode: 'AUDIT-FAIL-COURSE',
        programIds: [programId],
        name: { th: 'ไม่ควรสร้าง', en: 'Must roll back' },
        status: 'active'
      })
    ).rejects.toThrow('audit write failed')
    await expect(
      failingAcademic.updateCourse(admin, courseId, {
        name: { th: 'ไม่ควรแก้', en: 'Must roll back' }
      })
    ).rejects.toThrow('audit write failed')
    await expect(
      failingAcademic.createTerm(admin, {
        code: '2/2573',
        academicYear: 2573,
        semester: '2',
        startsAt: new Date('2029-11-01T00:00:00.000Z'),
        endsAt: new Date('2030-03-31T00:00:00.000Z'),
        status: 'planned'
      } as AcademicTermRecord)
    ).rejects.toThrow('audit write failed')
    await expect(
      failingAcademic.updateTerm(admin, term.id, { semester: '2' })
    ).rejects.toThrow('audit write failed')

    await expect(
      schools.countDocuments({ schoolCode: 'AUDIT-FAIL-SCHOOL' })
    ).resolves.toBe(0)
    await expect(
      programs.countDocuments({ programCode: 'AUDIT-FAIL-PROG' })
    ).resolves.toBe(0)
    await expect(
      courses.countDocuments({ courseCode: 'AUDIT-FAIL-COURSE' })
    ).resolves.toBe(0)
    await expect(terms.countDocuments({ code: '2/2573' })).resolves.toBe(0)
    await expect(
      schools.findById(schoolId).lean().exec()
    ).resolves.toMatchObject({ name: schoolBefore?.name })
    await expect(
      programs.findById(programId).lean().exec()
    ).resolves.toMatchObject({ name: programBefore?.name })
    await expect(
      courses.findById(courseId).lean().exec()
    ).resolves.toMatchObject({ name: courseBefore?.name })
    await expect(terms.findById(term.id).lean().exec()).resolves.toMatchObject({
      semester: '1'
    })
    await expect(auditLogs.countDocuments({})).resolves.toBe(0)
  })

  it.each([
    {
      kind: 'program removal',
      code: 'COURSE_PROGRAM_CHANGE_REQUIRES_MIGRATION'
    },
    {
      kind: 'archival',
      code: 'COURSE_ARCHIVE_REQUIRES_MIGRATION'
    }
  ])(
    'prevents Course $kind through generic update while a Student references it',
    async ({ kind, code }) => {
      const course = await courses.create({
        courseCode: 'REF-COURSE',
        programIds: [programId],
        name: { th: 'รายวิชาอ้างอิง', en: 'Referenced Course' },
        status: 'active'
      })
      const student = await students.create({
        ...input('6631503123', 'course-reference@example.com'),
        courseId: course.id
      })
      const academic = new AcademicService(
        schools,
        programs,
        courses,
        terms,
        auditService
      )
      const update =
        kind === 'program removal'
          ? { programIds: [otherProgramId] }
          : { status: 'archived' as const }

      await expect(
        academic.updateCourse(admin, course.id, update)
      ).rejects.toMatchObject({
        status: 409,
        response: { code }
      })
      await expect(
        courses.findById(course.id).select('programIds status').lean().exec()
      ).resolves.toMatchObject({ programIds: [programId], status: 'active' })
      await expect(
        students.findById(student.id).select('courseId programId').lean().exec()
      ).resolves.toMatchObject({ courseId: course.id, programId })
    }
  )

  it('enforces normalized academic-code uniqueness at the documented scopes', async () => {
    const academic = new AcademicService(
      schools,
      programs,
      courses,
      terms,
      auditService
    )
    const schoolInput = {
      name: { th: 'สำนักวิชาทดสอบ', en: 'Test School' },
      status: 'active' as const
    }
    const programInput = {
      name: { th: 'หลักสูตรทดสอบ', en: 'Test Program' },
      status: 'active' as const
    }

    await academic.createSchool(admin, {
      ...schoolInput,
      schoolCode: ' new-school '
    })
    await expect(
      academic.createSchool(admin, {
        ...schoolInput,
        schoolCode: 'NEW-SCHOOL'
      })
    ).rejects.toMatchObject({ code: 11000 })

    const otherSchool = (await academic.createSchool(admin, {
      ...schoolInput,
      schoolCode: 'OTHER-SCHOOL'
    })) as { id: string }
    await academic.createProgram(admin, {
      ...programInput,
      schoolId,
      programCode: ' new-program '
    })
    await expect(
      academic.createProgram(admin, {
        ...programInput,
        schoolId,
        programCode: 'NEW-PROGRAM'
      })
    ).rejects.toMatchObject({ code: 11000 })
    await expect(
      academic.createProgram(admin, {
        ...programInput,
        schoolId: otherSchool.id,
        programCode: 'NEW-PROGRAM'
      })
    ).resolves.toMatchObject({ programCode: 'NEW-PROGRAM' })

    const courseInput = {
      programIds: [programId],
      name: { th: 'รายวิชาทดสอบ', en: 'Test Course' },
      status: 'active' as const
    }
    await academic.createCourse(admin, {
      ...courseInput,
      courseCode: ' new-course '
    })
    await expect(
      academic.createCourse(admin, {
        ...courseInput,
        courseCode: 'NEW-COURSE'
      })
    ).rejects.toMatchObject({ code: 11000 })

    await expect(auditLogs.countDocuments({})).resolves.toBe(5)
  })

  it('allows additive Course applicability without invalidating current Student references', async () => {
    const course = await courses.create({
      courseCode: 'ADDITIVE-COURSE',
      programIds: [programId],
      name: { th: 'รายวิชาเพิ่มเติม', en: 'Additive Course' },
      status: 'active'
    })
    const student = await students.create({
      ...input('6631503124', 'additive-course@example.com'),
      courseId: course.id
    })
    const academic = new AcademicService(
      schools,
      programs,
      courses,
      terms,
      auditService
    )

    await expect(
      academic.updateCourse(admin, course.id, {
        programIds: [programId, otherProgramId]
      })
    ).resolves.toMatchObject({
      programIds: [programId, otherProgramId]
    })
    await expect(
      students.findById(student.id).select('courseId programId').lean().exec()
    ).resolves.toMatchObject({ courseId: course.id, programId })
  })

  it('derives school and course reads from a program-only assignment', async () => {
    const scopedActor: AuthenticatedActor = {
      ...admin,
      roles: ['coordinator'],
      scope: { tenant: false, schoolIds: [], programIds: [programId] },
      roleScopes: [
        {
          role: 'coordinator',
          tenant: false,
          schoolIds: [],
          programIds: [programId]
        }
      ]
    }
    const academic = new AcademicService(
      schools,
      programs,
      courses,
      terms,
      auditService
    )
    const [schoolPage, programPage, coursePage] = (await Promise.all([
      academic.listSchools(scopedActor, { page: 1, pageSize: 50 }),
      academic.listPrograms(scopedActor, { page: 1, pageSize: 50 }),
      academic.listCourses(scopedActor, { page: 1, pageSize: 50 })
    ])) as [
      { items: Array<{ id: string }> },
      { items: Array<{ id: string }> },
      { items: Array<{ id: string }> }
    ]

    expect(schoolPage.items.map((item) => item.id)).toEqual([schoolId])
    expect(programPage.items.map((item) => item.id)).toEqual([programId])
    expect(coursePage.items.map((item) => item.id)).toEqual([courseId])

    const matchingPrograms = (await academic.listPrograms(
      scopedActor,
      { page: 1, pageSize: 50 },
      undefined,
      [programId, otherProgramId]
    )) as { items: Array<{ id: string }> }
    const outsideOnlyPrograms = (await academic.listPrograms(
      scopedActor,
      { page: 1, pageSize: 50 },
      undefined,
      [otherProgramId]
    )) as { items: Array<{ id: string }> }
    expect(matchingPrograms.items.map((item) => item.id)).toEqual([programId])
    expect(outsideOnlyPrograms.items).toEqual([])
  })

  it('rejects missing or conflicting term references instead of saving guessed values', async () => {
    const term = await terms.create({
      code: '1/2566',
      academicYear: 2566,
      semester: '1',
      startsAt: new Date('2023-06-01T00:00:00.000Z'),
      endsAt: new Date('2023-10-31T00:00:00.000Z'),
      status: 'open'
    })

    await expect(
      service.createStudent(admin, {
        ...input('6631503001', 'student@example.com'),
        semester: 'ภาคการศึกษาต้น',
        academicYear: 2567
      })
    ).rejects.toMatchObject({
      status: 422,
      response: { code: 'ACADEMIC_TERM_NOT_FOUND' }
    })
    await expect(
      service.createStudent(admin, {
        ...input('6631503002', 'other@example.com'),
        academicTermId: term.id,
        semester: 'ภาคการศึกษาปลาย',
        academicYear: 2566
      })
    ).rejects.toMatchObject({
      status: 422,
      response: { code: 'ACADEMIC_TERM_REFERENCE_MISMATCH' }
    })
    await expect(students.countDocuments({})).resolves.toBe(0)
  })

  it('persists term changes on Student PATCH and rejects ambiguous semester/year pairs', async () => {
    const term = await terms.create({
      code: '2/2566',
      academicYear: 2566,
      semester: '2',
      startsAt: new Date('2023-11-01T00:00:00.000Z'),
      endsAt: new Date('2024-03-31T00:00:00.000Z'),
      status: 'open'
    })
    const student = await students.create(
      input('6631503001', 'student@example.com')
    )

    const updated = (await service.updateStudent(admin, student.id, {
      semester: 'second',
      academicYear: 2566
    })) as { academicTermId: string; semester: string; academicYear: number }
    expect(updated).toMatchObject({
      academicTermId: term.id,
      semester: '2',
      academicYear: 2566
    })

    await terms.create({
      code: '2/2566-copy',
      academicYear: 2566,
      semester: '2',
      startsAt: new Date('2023-11-01T00:00:00.000Z'),
      endsAt: new Date('2024-03-31T00:00:00.000Z'),
      status: 'open'
    })
    await expect(
      service.createStudent(admin, {
        ...input('6631503002', 'other@example.com'),
        semester: '2',
        academicYear: 2566
      })
    ).rejects.toMatchObject({
      status: 409,
      response: { code: 'ACADEMIC_TERM_AMBIGUOUS' }
    })
  })

  it('rejects another student email on update and allows retaining own email', async () => {
    const student = await students.create(
      input('6631503001', 'student@example.com')
    )
    await students.create(input('6631503002', 'owner@example.com'))

    await expect(
      service.updateStudent(admin, student.id, { email: 'OWNER@example.com' })
    ).rejects.toMatchObject({
      status: 409,
      response: { code: 'STUDENT_EMAIL_ALREADY_USED' }
    })

    const updated = (await service.updateStudent(admin, student.id, {
      email: '  STUDENT@EXAMPLE.COM '
    })) as { email: string }
    expect(updated.email).toBe('student@example.com')
  })

  it('profiles duplicate and non-canonical legacy emails without modifying records or exposing email values', async () => {
    await students.collection.insertMany([
      {
        studentId: '6631503001',
        email: 'Mixed@Example.com',
        schoolId: 'school-a',
        programId: 'program-a'
      },
      {
        studentId: '6631503002',
        email: ' mixed@example.com ',
        schoolId: 'school-a',
        programId: 'program-a'
      },
      {
        studentId: '6631503003',
        email: 'not-an-email',
        schoolId: 'school-a',
        programId: 'program-a'
      }
    ])

    const report = await profileStudentEmailUniqueness(connection)

    expect(report).toMatchObject({
      scannedRecords: 3,
      nonCanonicalRecords: 2,
      invalidRecords: ['6631503003'],
      normalizedUniqueIndexPresent: false,
      duplicateGroups: [
        {
          studentRecordIds: ['6631503001', '6631503002']
        }
      ]
    })
    expect(JSON.stringify(report)).not.toContain('mixed@example.com')
    const stored = await students
      .find()
      .select('email')
      .sort({ studentId: 1 })
      .lean()
      .exec()
    expect(stored.map((row) => row.email)).toEqual([
      'Mixed@Example.com',
      ' mixed@example.com ',
      'not-an-email'
    ])
  })

  it('refuses index migration until duplicates and legacy values are reconciled', async () => {
    await students.collection.insertMany([
      {
        studentId: '6631503001',
        email: 'duplicate@example.com',
        schoolId: 'school-a',
        programId: 'program-a'
      },
      {
        studentId: '6631503002',
        email: 'duplicate@example.com',
        schoolId: 'school-a',
        programId: 'program-a'
      }
    ])

    await expect(
      migrateStudentEmailUniqueIndex(connection, {
        apply: true,
        confirmedDatabaseName: connection.db!.databaseName,
        writesPaused: true
      })
    ).rejects.toThrow('STUDENT_EMAIL_DATA_REQUIRES_RECONCILIATION')
    await expect(students.collection.indexes()).resolves.not.toContainEqual(
      expect.objectContaining({ name: 'student_email_normalized_unique_v1' })
    )
  })

  it('requires exact database and write-pause confirmations before applying unique index', async () => {
    await students.create(input('6631503001', 'student@example.com'))

    await expect(
      migrateStudentEmailUniqueIndex(connection, {
        apply: true,
        confirmedDatabaseName: 'wrong-database',
        writesPaused: true
      })
    ).rejects.toThrow('STUDENT_EMAIL_MIGRATION_DATABASE_CONFIRMATION_MISMATCH')
    await expect(
      migrateStudentEmailUniqueIndex(connection, {
        apply: true,
        confirmedDatabaseName: connection.db!.databaseName,
        writesPaused: true
      })
    ).resolves.toMatchObject({ normalizedUniqueIndexPresent: true })

    await expect(
      students.collection.insertOne({
        studentId: '6631503002',
        email: 'STUDENT@EXAMPLE.COM',
        schoolId: 'school-a',
        programId: 'program-a'
      })
    ).rejects.toMatchObject({ code: 11000 })
  })
})
