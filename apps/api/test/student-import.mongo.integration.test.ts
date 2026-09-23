import * as XLSX from 'xlsx'
import { MongoMemoryReplSet } from 'mongodb-memory-server-core'
import { createConnection, type Connection, type Model } from 'mongoose'
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
import { StudentRecord, StudentSchema } from '../src/members/members.schema.js'
import {
  StudentImportBatchRecord,
  StudentImportBatchSchema,
  StudentImportCommitRecord,
  StudentImportCommitSchema,
  StudentImportRowRecord,
  StudentImportRowSchema
} from '../src/members/student-import.schema.js'
import { StudentImportService } from '../src/members/student-import.service.js'

interface PreviewResponse {
  batchId: string
  questionFieldsDetected: string[]
  items: Array<{
    id: string
    action: 'create' | 'update' | 'unchanged' | 'invalid'
    status: string
    student?: { studentId: string; name: { th: string; en: string } }
    issues: Array<{ code: string }>
    changes: Array<{ field: string; before: unknown; after: unknown }>
  }>
}

describe('student import on an isolated MongoDB replica set', () => {
  let replicaSet: MongoMemoryReplSet
  let connection: Connection
  let service: StudentImportService
  let students: Model<StudentRecord>
  let schools: Model<SchoolRecord>
  let programs: Model<ProgramRecord>
  let courses: Model<CourseRecord>
  let terms: Model<AcademicTermRecord>
  let batches: Model<StudentImportBatchRecord>
  let rows: Model<StudentImportRowRecord>
  let commits: Model<StudentImportCommitRecord>
  let auditLogs: Model<AuditLogRecord>
  let auditService: AuditService
  let schoolId: string
  let programId: string
  const actor: AuthenticatedActor = {
    id: 'staff-1',
    email: 'staff@mfu.ac.th',
    displayName: 'Import Staff',
    roles: ['systemAdmin'],
    scope: { tenant: true, schoolIds: [], programIds: [] }
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
    schools = connection.model(SchoolRecord.name, SchoolSchema)
    programs = connection.model(ProgramRecord.name, ProgramSchema)
    courses = connection.model(CourseRecord.name, CourseSchema)
    terms = connection.model(AcademicTermRecord.name, AcademicTermSchema)
    batches = connection.model(
      StudentImportBatchRecord.name,
      StudentImportBatchSchema
    )
    rows = connection.model(StudentImportRowRecord.name, StudentImportRowSchema)
    commits = connection.model(
      StudentImportCommitRecord.name,
      StudentImportCommitSchema
    )
    auditLogs = connection.model(AuditLogRecord.name, AuditLogSchema)
    auditService = new AuditService(auditLogs)
    service = new StudentImportService(
      connection,
      students,
      schools,
      programs,
      courses,
      terms,
      batches,
      rows,
      commits,
      auditService
    )
    await Promise.all([
      students.init(),
      schools.init(),
      programs.init(),
      courses.init(),
      terms.init(),
      batches.init(),
      rows.init(),
      commits.init(),
      auditLogs.init()
    ])
  }, 180_000)

  afterAll(async () => {
    await connection?.close()
    await replicaSet?.stop()
  }, 30_000)

  beforeEach(async () => {
    await Promise.all([
      students.deleteMany({}),
      schools.deleteMany({}),
      programs.deleteMany({}),
      courses.deleteMany({}),
      terms.deleteMany({}),
      batches.deleteMany({}),
      rows.deleteMany({}),
      commits.deleteMany({}),
      auditLogs.deleteMany({})
    ])
    const school = await schools.create({
      schoolCode: 'ADT',
      name: {
        th: 'สำนักวิชาเทคโนโลยีดิจิทัล',
        en: 'School of Digital Technology'
      },
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
    await courses.create({
      courseCode: 'SWE491',
      programIds: [programId],
      name: { th: 'สหกิจศึกษา', en: 'Cooperative Education' },
      status: 'active'
    })
    await terms.create({
      code: '1/2566',
      academicYear: 2566,
      semester: '1',
      startsAt: new Date('2023-06-01T00:00:00.000Z'),
      endsAt: new Date('2023-10-31T00:00:00.000Z'),
      status: 'closed'
    })
  })

  function workbookBuffer(records: readonly Record<string, unknown>[]): Buffer {
    const workbook = XLSX.utils.book_new()
    const sheet = XLSX.utils.json_to_sheet([...records])
    XLSX.utils.book_append_sheet(workbook, sheet, 'Students')
    return XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' }) as Buffer
  }

  function sourceRow(
    studentId = '6631503001',
    overrides: Record<string, unknown> = {}
  ): Record<string, unknown> {
    return {
      'รหัสนักศึกษา (studentId)': studentId,
      'ชื่อ-นามสกุลไทย (nameTh)': 'นางสาวตัวอย่าง ระบบ',
      'ชื่อ-นามสกุลอังกฤษ (nameEn)': 'Example Student',
      'อีเมลนักศึกษา (email)': 'example.student@lamduan.mfu.ac.th',
      'รหัสสำนักวิชา (schoolCode)': 'ADT',
      'รหัสหลักสูตร (programCode)': 'SE',
      'รหัสวิชา (courseCode)': 'SWE491',
      'ภาคการศึกษา (semester)': '1/2566',
      'ปีการศึกษา (admissionYear)': 2566,
      'Hard Skill 1': 5,
      ...overrides
    }
  }

  async function preview(
    records: readonly Record<string, unknown>[]
  ): Promise<PreviewResponse> {
    return (await service.preview(
      actor,
      'students.xlsx',
      workbookBuffer(records)
    )) as PreviewResponse
  }

  it('previews resolved rows without writing students and records detected question columns', async () => {
    const batch = await preview([sourceRow()])

    expect(batch.items[0]).toMatchObject({
      action: 'create',
      status: 'pending',
      student: { studentId: '6631503001' },
      issues: []
    })
    expect(batch.questionFieldsDetected).toEqual(['Hard Skill 1'])
    await expect(students.countDocuments({})).resolves.toBe(0)
  })

  it('flags unresolved course and duplicate source IDs instead of guessing', async () => {
    const batch = await preview([
      sourceRow('6631503001', { 'รหัสวิชา (courseCode)': 'UNKNOWN' }),
      sourceRow('6631503001')
    ])

    expect(batch.items.map((item) => item.action)).toEqual([
      'invalid',
      'invalid'
    ])
    expect(batch.items[0]?.issues.map((item) => item.code)).toContain(
      'COURSE_NOT_FOUND'
    )
    expect(batch.items[0]?.issues.map((item) => item.code)).toContain(
      'DUPLICATE_SOURCE_ID'
    )
    await expect(students.countDocuments({})).resolves.toBe(0)
  })

  it('requires explicit update confirmation, checks stale versions, and commits one row with its audit event atomically', async () => {
    const existing = await students.create({
      studentId: '6631503001',
      name: { th: 'ชื่อเดิม', en: 'Old Name' },
      email: 'old@lamduan.mfu.ac.th',
      schoolId,
      programId,
      status: 'active'
    })
    const batch = await preview([sourceRow()])
    const rowId = batch.items[0]!.id
    expect(batch.items[0]?.action).toBe('update')
    expect(batch.items[0]?.changes.map((change) => change.field)).toContain(
      'email'
    )

    await expect(
      service.commit(
        actor,
        batch.batchId,
        'update-confirmation-1',
        [{ rowId, action: 'create' }],
        'import-request-1'
      )
    ).rejects.toMatchObject({ status: 409 })
    expect((await students.findById(existing.id).exec())?.email).toBe(
      'old@lamduan.mfu.ac.th'
    )

    await students.updateOne(
      { _id: existing.id },
      { $set: { province: 'ค่าที่แก้ระหว่าง preview' } }
    )
    await expect(
      service.commit(
        actor,
        batch.batchId,
        'update-confirmation-2',
        [{ rowId, action: 'update' }],
        'import-request-2'
      )
    ).rejects.toMatchObject({ status: 409 })
    const unchangedByImport = await students.findById(existing.id).exec()
    expect(unchangedByImport?.email).toBe('old@lamduan.mfu.ac.th')
    expect(unchangedByImport?.province).toBe('ค่าที่แก้ระหว่าง preview')
    await expect(auditLogs.countDocuments({})).resolves.toBe(0)
  })

  it('commits new rows idempotently and persists the row audit in the same transaction', async () => {
    const batch = await preview([sourceRow()])
    const rowId = batch.items[0]!.id
    const decision = [{ rowId, action: 'create' as const }]
    const first = await service.commit(
      actor,
      batch.batchId,
      'import-create-idempotent',
      decision,
      'import-request-create'
    )
    const replay = await service.commit(
      actor,
      batch.batchId,
      'import-create-idempotent',
      decision,
      'import-request-replay'
    )

    expect(replay).toMatchObject({
      commitId: (first as { commitId: string }).commitId
    })
    await expect(
      students.countDocuments({ studentId: '6631503001' })
    ).resolves.toBe(1)
    await expect(
      auditLogs.countDocuments({ action: 'students.import.created' })
    ).resolves.toBe(1)
    const refreshed = (await service.getPreview(
      actor,
      batch.batchId
    )) as PreviewResponse
    expect(refreshed.items[0]).toMatchObject({
      action: 'create',
      status: 'committed'
    })
  })

  it('updates only confirmed student fields without rewriting workflow state', async () => {
    const existing = await students.create({
      studentId: '6631503001',
      name: { th: 'ชื่อเดิม', en: 'Old Name' },
      email: 'old@lamduan.mfu.ac.th',
      schoolId,
      programId,
      evaluationStatus: 'submitted',
      status: 'active'
    })
    const batch = await preview([sourceRow()])
    expect(batch.items[0]?.action).toBe('update')

    const result = (await service.commit(
      actor,
      batch.batchId,
      'confirmed-update-once',
      [{ rowId: batch.items[0]!.id, action: 'update' }],
      'import-request-update'
    )) as { results: Array<{ outcome: string }> }
    const updated = await students.findById(existing.id).exec()

    expect(result.results[0]?.outcome).toBe('updated')
    expect(updated?.email).toBe('example.student@lamduan.mfu.ac.th')
    expect(updated?.evaluationStatus).toBe('submitted')
    await expect(
      auditLogs.countDocuments({ action: 'students.import.updated' })
    ).resolves.toBe(1)
  })

  it('rolls back the student write when its transactional audit write fails', async () => {
    const batch = await preview([sourceRow()])
    const auditWrite = vi
      .spyOn(auditService, 'record')
      .mockRejectedValueOnce(new Error('injected audit persistence failure'))

    await expect(
      service.commit(
        actor,
        batch.batchId,
        'import-audit-rollback',
        [{ rowId: batch.items[0]!.id, action: 'create' }],
        'import-request-rollback'
      )
    ).rejects.toThrow('injected audit persistence failure')
    auditWrite.mockRestore()

    await expect(students.countDocuments({})).resolves.toBe(0)
    await expect(
      rows.findById(batch.items[0]!.id).select('status').lean()
    ).resolves.toMatchObject({
      status: 'pending'
    })
    await expect(auditLogs.countDocuments({})).resolves.toBe(0)
  })

  it('does not expose or allow a staff member to import a student outside its assignment scope', async () => {
    const scopedActor: AuthenticatedActor = {
      ...actor,
      roles: ['internshipStaff'],
      scope: { tenant: false, schoolIds: [], programIds: [] },
      roleScopes: [
        {
          role: 'internshipStaff',
          tenant: false,
          schoolIds: ['another-school'],
          programIds: ['another-program']
        }
      ]
    }
    const batch = (await service.preview(
      scopedActor,
      'students.xlsx',
      workbookBuffer([sourceRow()])
    )) as PreviewResponse

    expect(batch.items[0]).toMatchObject({
      action: 'invalid',
      issues: [{ code: 'ROW_OUT_OF_SCOPE' }]
    })
    expect(batch.items[0]?.student?.studentId).toBe('6631503001')
    await expect(students.countDocuments({})).resolves.toBe(0)
  })

  it('rejects another actor reading the preview batch', async () => {
    const batch = await preview([sourceRow()])
    await expect(
      service.getPreview({ ...actor, id: 'other-staff' }, batch.batchId)
    ).rejects.toMatchObject({ status: 404 })
  })
})
