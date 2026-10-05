import { MongoMemoryReplSet } from 'mongodb-memory-server-core'
import type { Queue } from 'bullmq'
import {
  createConnection,
  type ClientSession,
  type Connection,
  type Model
} from 'mongoose'
import type { AuthenticatedActor } from '@internship/shared-types'
import type { ExecutionContext } from '@nestjs/common'
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi
} from 'vitest'

import { AuditService } from '../src/audit/audit.service.js'
import { AuditLogRecord, AuditLogSchema } from '../src/audit/audit.schema.js'
import {
  ANY_PERMISSION,
  AUTHENTICATED_ROUTE,
  PUBLIC_ROUTE,
  REQUIRED_PERMISSIONS
} from '../src/auth/auth.decorators.js'
import { AccessGuard } from '../src/auth/access.guard.js'
import {
  DeliveryRecord,
  DeliverySchema
} from '../src/correspondence/correspondence.schema.js'
import {
  GeneratedDocumentRecord,
  GeneratedDocumentSchema
} from '../src/documents/document.schema.js'
import {
  EvaluationAssignmentRecord,
  EvaluationAssignmentSchema,
  EvaluationCycleRecord,
  EvaluationCycleSchema
} from '../src/evaluations/evaluation.schema.js'
import { StudentRecord, StudentSchema } from '../src/members/members.schema.js'
import type { MembersService } from '../src/members/members.service.js'
import {
  ReportExportRecord,
  ReportExportSchema,
  ReportExportSnapshotRecord,
  ReportExportSnapshotSchema
} from '../src/reports/report-export.schema.js'
import { ReportExportService } from '../src/reports/report-export.service.js'
import { migrateReportExportIndexes } from '../src/reports/report-export-index-migration.js'
import { ReportsService } from '../src/reports/reports.service.js'

const schoolA = '64b000000000000000000001'
const schoolB = '64b000000000000000000002'
const programA = '64b000000000000000000011'
const programB = '64b000000000000000000012'

const scopedStaff: AuthenticatedActor = {
  id: 'staff-1',
  email: 'staff@mfu.ac.th',
  displayName: 'Scoped Staff',
  roles: ['internshipStaff', 'coordinator'],
  scope: {
    tenant: false,
    schoolIds: [schoolA, schoolB],
    programIds: [programA, programB]
  },
  roleScopes: [
    {
      role: 'internshipStaff',
      tenant: false,
      schoolIds: [schoolA],
      programIds: [programA]
    },
    {
      role: 'coordinator',
      tenant: false,
      schoolIds: [schoolB],
      programIds: [programB]
    }
  ]
}

describe('Reports on an isolated MongoDB replica set', () => {
  let replicaSet: MongoMemoryReplSet
  let connection: Connection
  let assignments: Model<EvaluationAssignmentRecord>
  let cycles: Model<EvaluationCycleRecord>
  let students: Model<StudentRecord>
  let deliveries: Model<DeliveryRecord>
  let documents: Model<GeneratedDocumentRecord>
  let reportExports: Model<ReportExportRecord>
  let exportSnapshots: Model<ReportExportSnapshotRecord>
  let auditLogs: Model<AuditLogRecord>
  let service: ReportsService
  let exportService: ReportExportService
  let auditService: AuditService
  const exportQueue = { add: vi.fn().mockResolvedValue({ id: 'queued-job' }) }
  const directoryMembers = { listStudents: vi.fn() }

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
    assignments = connection.model(
      EvaluationAssignmentRecord.name,
      EvaluationAssignmentSchema
    )
    cycles = connection.model(EvaluationCycleRecord.name, EvaluationCycleSchema)
    students = connection.model(StudentRecord.name, StudentSchema)
    deliveries = connection.model(DeliveryRecord.name, DeliverySchema)
    documents = connection.model(
      GeneratedDocumentRecord.name,
      GeneratedDocumentSchema
    )
    reportExports = connection.model(
      ReportExportRecord.name,
      ReportExportSchema
    )
    exportSnapshots = connection.model(
      ReportExportSnapshotRecord.name,
      ReportExportSnapshotSchema
    )
    auditLogs = connection.model(AuditLogRecord.name, AuditLogSchema)
    service = new ReportsService(
      assignments,
      students,
      deliveries,
      documents,
      cycles
    )
    auditService = new AuditService(auditLogs)
    exportService = new ReportExportService(
      exportQueue as unknown as Queue<{ readonly exportId: string }>,
      connection,
      assignments,
      students,
      cycles,
      reportExports,
      exportSnapshots,
      service,
      auditService,
      {
        get: (key: string) =>
          ({
            S3_BUCKET: 'test-private-bucket',
            S3_ENDPOINT: 'http://127.0.0.1:9000',
            S3_REGION: 'us-east-1',
            S3_FORCE_PATH_STYLE: true,
            S3_ACCESS_KEY_ID: 'test-access-key',
            S3_SECRET_ACCESS_KEY: 'test-secret-key'
          })[key]
      } as never,
      directoryMembers as unknown as MembersService
    )
    await Promise.all([
      assignments.init(),
      cycles.init(),
      students.init(),
      deliveries.init(),
      documents.init(),
      reportExports.init(),
      exportSnapshots.init(),
      auditLogs.init()
    ])
  }, 180_000)

  afterAll(async () => {
    await connection?.close()
    await replicaSet?.stop()
  }, 30_000)

  beforeEach(async () => {
    vi.restoreAllMocks()
    directoryMembers.listStudents.mockReset()
    exportQueue.add.mockClear().mockResolvedValue({ id: 'queued-job' })
    await Promise.all([
      assignments.deleteMany({}),
      cycles.deleteMany({}),
      students.deleteMany({}),
      deliveries.deleteMany({}),
      documents.deleteMany({}),
      reportExports.deleteMany({}),
      exportSnapshots.deleteMany({}),
      auditLogs.deleteMany({})
    ])
  })

  async function createCycle(
    academicTermId: string,
    code: string
  ): Promise<{ readonly id: string }> {
    return cycles.create({
      code,
      name: { th: 'รอบฝึกงาน', en: 'Internship cycle' },
      competencySetVersionId: `version-${code}`,
      academicTermId,
      opensAt: new Date('2026-01-01T00:00:00.000Z'),
      closesAt: new Date('2026-12-31T23:59:59.000Z'),
      status: 'active'
    })
  }

  async function createStudent(
    studentId: string,
    schoolId: string,
    programId: string
  ): Promise<{ readonly id: string; readonly studentId: string }> {
    return students.create({
      studentId,
      name: { th: 'นักศึกษาทดสอบ', en: 'Test Student' },
      email: `${studentId}@student.example`,
      schoolId,
      programId,
      status: 'active'
    })
  }

  async function createAssignment(input: {
    cycleId: string
    placementId: string
    studentId: string
    schoolId: string
    programId: string
    status: EvaluationAssignmentRecord['status']
  }): Promise<{ readonly id: string }> {
    return assignments.create({
      ...input,
      evaluatorId: 'evaluator-1',
      questionSnapshot: [],
      competencySetVersionId: 'competency-v1',
      deadlineAt: new Date('2026-12-01T00:00:00.000Z')
    })
  }

  it('applies term and requested filters together with assigned scope for all metrics', async () => {
    const termA = '64b0000000000000000000a1'
    const termB = '64b0000000000000000000a2'
    const cycleA = await createCycle(termA, 'TERM-A')
    const cycleB = await createCycle(termB, 'TERM-B')
    const studentA = await createStudent('6631503001', schoolA, programA)
    const studentB = await createStudent('6631503002', schoolB, programB)
    const mismatchedStudent = await createStudent(
      '6631503003',
      schoolA,
      programB
    )
    const assignmentA = await createAssignment({
      cycleId: cycleA.id,
      placementId: 'placement-a',
      studentId: studentA.studentId,
      schoolId: schoolA,
      programId: programA,
      status: 'submitted'
    })
    await createAssignment({
      cycleId: cycleB.id,
      placementId: 'placement-b',
      studentId: studentB.id,
      schoolId: schoolB,
      programId: programB,
      status: 'pending'
    })
    await createAssignment({
      cycleId: cycleB.id,
      placementId: 'placement-a-next-term',
      studentId: studentA.id,
      schoolId: schoolA,
      programId: programA,
      status: 'pending'
    })
    await createAssignment({
      cycleId: cycleA.id,
      placementId: 'placement-mismatch',
      studentId: mismatchedStudent.id,
      schoolId: schoolA,
      programId: programB,
      status: 'pending'
    })
    await createAssignment({
      cycleId: cycleA.id,
      placementId: 'placement-a-out-of-scope-program',
      studentId: studentA.id,
      schoolId: schoolA,
      programId: programB,
      status: 'pending'
    })
    await deliveries.create({
      campaignId: 'campaign-a',
      assignmentId: assignmentA.id,
      recipientEmail: 'evaluator@example.test',
      templateVersionId: 'mail-v1',
      status: 'failed'
    })
    await documents.create({
      studentId: studentA.id,
      templateVersionId: 'document-v1',
      requestedBy: 'former-staff',
      idempotencyKey: 'document-a',
      status: 'ready',
      sourceSnapshot: {
        placement: {
          id: 'placement-a',
          academicTermId: termA,
          schoolId: schoolA,
          programId: programA
        }
      } as never
    })
    await documents.create({
      studentId: studentA.id,
      templateVersionId: 'document-v1',
      requestedBy: 'former-staff',
      idempotencyKey: 'document-a-prior-term',
      status: 'ready',
      sourceSnapshot: {
        placement: {
          id: 'placement-a-next-term',
          academicTermId: termB,
          schoolId: schoolA,
          programId: programA
        }
      } as never
    })
    await documents.create({
      studentId: studentB.studentId,
      templateVersionId: 'document-v1',
      requestedBy: 'former-staff',
      idempotencyKey: 'document-b',
      status: 'ready'
    })
    await documents.create({
      studentId: studentA.id,
      templateVersionId: 'document-v1',
      requestedBy: 'former-staff',
      idempotencyKey: 'document-a-out-of-scope-program',
      status: 'ready',
      sourceSnapshot: {
        placement: {
          id: 'placement-a-out-of-scope-program',
          academicTermId: termA,
          schoolId: schoolA,
          programId: programB
        }
      } as never
    })

    await expect(
      service.overview(scopedStaff, {
        termId: termA,
        schoolId: schoolA,
        programId: programA
      })
    ).resolves.toMatchObject({
      students: 1,
      assignments: { submitted: 1 },
      failedDeliveries: 1,
      readyDocuments: 1
    })
    await expect(
      service.overview(scopedStaff, {
        termId: termA,
        schoolId: schoolA,
        programId: programB
      })
    ).resolves.toMatchObject({
      students: 0,
      assignments: {},
      failedDeliveries: 0,
      readyDocuments: 0
    })
    await expect(service.overview(scopedStaff)).resolves.toMatchObject({
      students: 2,
      assignments: { submitted: 1, pending: 2 },
      failedDeliveries: 1,
      readyDocuments: 2
    })
    const systemAdmin: AuthenticatedActor = {
      id: 'report-system-admin',
      email: 'admin@mfu.ac.th',
      displayName: 'System Admin',
      roles: ['systemAdmin'],
      scope: { tenant: true, schoolIds: [], programIds: [] },
      roleScopes: []
    }
    await expect(service.overview(systemAdmin)).resolves.toMatchObject({
      students: 3,
      readyDocuments: 4
    })
    await expect(
      service.programs(scopedStaff, { termId: termA, schoolId: schoolA })
    ).resolves.toEqual([
      { _id: { programId: programA, status: 'submitted' }, count: 1 }
    ])
  })

  it('limits a Student report to their own assignment reference and rejects unrelated filters by returning no data', async () => {
    const termId = '64b0000000000000000000b1'
    const cycle = await createCycle(termId, 'STUDENT-TERM')
    const ownStudent = await createStudent('6631504001', schoolA, programA)
    const otherStudent = await createStudent('6631504002', schoolA, programA)
    await createAssignment({
      cycleId: cycle.id,
      placementId: 'student-placement-own',
      studentId: ownStudent.id,
      schoolId: schoolA,
      programId: programA,
      status: 'submitted'
    })
    await createAssignment({
      cycleId: cycle.id,
      placementId: 'student-placement-other',
      studentId: otherStudent.studentId,
      schoolId: schoolA,
      programId: programA,
      status: 'pending'
    })
    const studentActor: AuthenticatedActor = {
      id: 'student-user',
      email: 'student@example.test',
      displayName: 'Student',
      roles: ['student'],
      scope: {
        tenant: false,
        schoolIds: [],
        programIds: [],
        studentId: ownStudent.studentId
      }
    }

    await expect(
      service.overview(studentActor, { termId })
    ).resolves.toMatchObject({
      students: 1,
      assignments: { submitted: 1 }
    })
    await expect(
      service.overview(studentActor, { termId, programId: programB })
    ).resolves.toMatchObject({
      students: 0,
      assignments: {}
    })
  })

  it('combines a Student own-scope with another role scope authorized for reports', async () => {
    const ownStudent = await createStudent('6631504101', schoolB, programB)
    const staffStudent = await createStudent('6631504102', schoolA, programA)
    const foreignStudent = await createStudent('6631504103', schoolB, programB)
    await createAssignment({
      cycleId: 'cycle-multi-role',
      placementId: 'multi-role-own',
      studentId: ownStudent.studentId,
      schoolId: schoolB,
      programId: programB,
      status: 'submitted'
    })
    await createAssignment({
      cycleId: 'cycle-multi-role',
      placementId: 'multi-role-staff',
      studentId: staffStudent.id,
      schoolId: schoolA,
      programId: programA,
      status: 'pending'
    })
    await createAssignment({
      cycleId: 'cycle-multi-role',
      placementId: 'multi-role-foreign',
      studentId: foreignStudent.id,
      schoolId: schoolB,
      programId: programB,
      status: 'expired'
    })

    const actor: AuthenticatedActor = {
      id: 'student-and-staff',
      email: 'multi-role@example.test',
      displayName: 'Student and Staff',
      roles: ['student', 'internshipStaff'],
      scope: {
        tenant: false,
        schoolIds: [schoolA],
        programIds: [programA],
        studentId: ownStudent.studentId
      },
      roleScopes: [
        {
          role: 'internshipStaff',
          tenant: false,
          schoolIds: [schoolA],
          programIds: [programA]
        }
      ]
    }

    await expect(service.programs(actor)).resolves.toEqual([
      { _id: { programId: programA, status: 'pending' }, count: 1 },
      { _id: { programId: programB, status: 'submitted' }, count: 1 }
    ])
  })

  it('creates an immutable, scoped export snapshot and replays only the same idempotent request', async () => {
    const termId = '64b0000000000000000000c1'
    const cycle = await createCycle(termId, 'EXPORT-TERM')
    const student = await createStudent('6631505001', schoolA, programA)
    await createAssignment({
      cycleId: cycle.id,
      placementId: 'export-placement',
      studentId: student.id,
      schoolId: schoolA,
      programId: programA,
      status: 'submitted'
    })

    const created = (await exportService.create(scopedStaff, {
      filters: { termId, schoolId: schoolA, programId: programA },
      fields: ['studentNumber', 'studentName', 'studentEmail', 'status'],
      format: 'csv',
      idempotencyKey: 'report-export-key-01',
      requestId: 'request-export-1'
    })) as { id: string; status: string; rowCount: number }

    expect(created).toMatchObject({ status: 'queued', rowCount: 1 })
    expect(exportQueue.add).toHaveBeenCalledWith(
      'generate-report',
      { exportId: created.id },
      expect.objectContaining({ jobId: `report-export-${created.id}` })
    )
    const snapshot = await exportSnapshots
      .findOne({ exportId: created.id })
      .select('+values')
      .lean()
    expect(snapshot?.values).toEqual({
      studentNumber: student.studentId,
      studentName: 'นักศึกษาทดสอบ',
      studentEmail: `${student.studentId}@student.example`,
      status: 'submitted'
    })

    await students.updateOne(
      { _id: student.id },
      { $set: { name: { th: 'เปลี่ยนชื่อภายหลัง', en: 'Changed later' } } }
    )
    const stableSnapshot = await exportSnapshots
      .findOne({ exportId: created.id })
      .select('+values')
      .lean()
    expect(stableSnapshot?.values).toMatchObject({
      studentName: 'นักศึกษาทดสอบ'
    })
    await expect(
      exportService.create(scopedStaff, {
        filters: { termId, schoolId: schoolA, programId: programA },
        fields: ['studentNumber', 'studentName', 'studentEmail', 'status'],
        format: 'csv',
        idempotencyKey: 'report-export-key-01',
        requestId: 'request-export-replay'
      })
    ).resolves.toMatchObject({ id: created.id })
    await expect(
      exportService.create(scopedStaff, {
        filters: { termId, schoolId: schoolA, programId: programA },
        fields: ['status'],
        format: 'csv',
        idempotencyKey: 'report-export-key-01',
        requestId: 'request-export-conflict'
      })
    ).rejects.toMatchObject({ response: { code: 'IDEMPOTENCY_KEY_REUSED' } })
    const safeDefault = (await exportService.create(scopedStaff, {
      filters: { termId, schoolId: schoolA, programId: programA },
      format: 'csv',
      idempotencyKey: 'report-export-key-01-safe',
      requestId: 'request-export-safe-default'
    })) as { id: string; fields: readonly string[] }
    expect(safeDefault.fields).not.toContain('studentNumber')
    expect(safeDefault.fields).not.toContain('studentName')
    expect(safeDefault.fields).not.toContain('studentEmail')
    const safeSnapshot = await exportSnapshots
      .findOne({ exportId: safeDefault.id })
      .select('+values')
      .lean()
    expect(Object.keys(safeSnapshot?.values ?? {}).sort()).toEqual(
      ['deadlineAt', 'programId', 'schoolId', 'status', 'termId'].sort()
    )
    await expect(
      auditLogs.countDocuments({ action: 'reports.export_requested' })
    ).resolves.toBe(2)
  })

  it('snapshots actor-scoped student directory values for an async XLSX export', async () => {
    const cycleId = '64b0000000000000000000d1'
    directoryMembers.listStudents.mockImplementationOnce(
      (_actor, _input, session) => {
        expect((session as ClientSession | undefined)?.inTransaction()).toBe(
          true
        )
        return Promise.resolve({
          items: [
            {
              schoolId: schoolA,
              programId: programA,
              studentId: '6631505101',
              name: { th: 'นักศึกษาทดสอบ', en: 'Test Student' },
              email: 'student@example.test',
              directoryRelations: {
                assignments: [
                  {
                    cycleId,
                    placementId: 'placement-snapshot',
                    status: 'submitted',
                    categoryScores: {
                      hardSkill: {
                        average: 4.25,
                        answeredCount: 2,
                        scaleMin: 1,
                        scaleMax: 5
                      },
                      softSkill: {
                        average: 3.5,
                        answeredCount: 1,
                        scaleMin: 1,
                        scaleMax: 5
                      }
                    },
                    evaluator: {
                      name: { th: 'ผู้ประเมิน', en: 'Evaluator' },
                      email: 'evaluator@example.test',
                      position: { th: 'หัวหน้างาน', en: 'Supervisor' }
                    }
                  }
                ],
                placements: [
                  {
                    id: 'placement-snapshot',
                    academicTermId: '64b0000000000000000000d2',
                    academicTerm: {
                      id: '64b0000000000000000000d2',
                      academicYear: 2026,
                      semester: '1'
                    },
                    organization: {
                      name: { th: 'บริษัททดสอบ', en: 'Test Company' },
                      address: { province: 'Chiang Rai' }
                    }
                  }
                ]
              }
            }
          ],
          meta: { total: 1 }
        })
      }
    )

    const created = (await exportService.create(scopedStaff, {
      reportType: 'studentDirectory',
      filters: { cycleId, schoolId: schoolA, search: '6631505101' },
      locale: 'th',
      format: 'xlsx',
      idempotencyKey: 'student-directory-export-01',
      requestId: 'request-directory-export'
    })) as { id: string; status: string; reportType: string; format: string }

    expect(created).toMatchObject({
      status: 'queued',
      reportType: 'studentDirectory',
      format: 'xlsx'
    })
    const directoryCall = directoryMembers.listStudents.mock
      .calls[0] as unknown as [
      AuthenticatedActor,
      Record<string, unknown>,
      ClientSession
    ]
    expect(directoryCall[0]).toEqual(scopedStaff)
    expect(directoryCall[1]).toEqual(
      expect.objectContaining({
        page: 1,
        pageSize: 5001,
        includeDirectoryData: false,
        cycleId,
        schoolId: schoolA
      })
    )
    const snapshot = await exportSnapshots
      .findOne({ exportId: created.id })
      .select('+values')
      .lean()
    expect(snapshot).toMatchObject({ schoolId: schoolA, programId: programA })
    expect(snapshot?.values).toMatchObject({
      studentId: '6631505101',
      company: 'บริษัททดสอบ',
      hardSkillScore: '4.3 / 1–5 (2 ข้อ)',
      softSkillScore: '3.5 / 1–5 (1 ข้อ)'
    })
    expect(exportQueue.add).toHaveBeenCalledWith(
      'generate-report',
      { exportId: created.id },
      expect.objectContaining({ jobId: `report-export-${created.id}` })
    )
    await expect(
      exportService.create(scopedStaff, {
        reportType: 'studentDirectory',
        filters: { cycleId, schoolId: schoolA, search: '6631505101' },
        locale: 'th',
        format: 'xlsx',
        idempotencyKey: 'student-directory-export-01',
        requestId: 'request-directory-export-retry'
      })
    ).resolves.toMatchObject({ id: created.id })
    expect(directoryMembers.listStudents).toHaveBeenCalledTimes(1)
  })

  it('rejects student-directory exports above the server-side row limit', async () => {
    directoryMembers.listStudents.mockResolvedValueOnce({
      items: Array.from({ length: 5001 }, (_, index) => ({
        schoolId: schoolA,
        programId: programA,
        studentId: `663150${String(index).padStart(4, '0')}`
      })),
      meta: { total: 5001 }
    })

    await expect(
      exportService.create(scopedStaff, {
        reportType: 'studentDirectory',
        filters: {},
        locale: 'en',
        format: 'xlsx',
        idempotencyKey: 'student-directory-export-over-limit',
        requestId: 'request-directory-export-over-limit'
      })
    ).rejects.toMatchObject({
      response: {
        code: 'EXPORT_ROW_LIMIT_EXCEEDED',
        details: { maxRows: 5000 }
      }
    })
    await expect(reportExports.countDocuments({})).resolves.toBe(0)
    await expect(exportSnapshots.countDocuments({})).resolves.toBe(0)
  })

  it('does not add a Student-only assignment to a Coordinator export', async () => {
    const termId = '64b0000000000000000000c9'
    const cycle = await createCycle(termId, 'EXPORT-ROLE-SCOPE')
    const student = await createStudent('6631505099', schoolB, programB)
    await createAssignment({
      cycleId: cycle.id,
      placementId: 'export-role-scope-placement',
      studentId: student.studentId,
      schoolId: schoolB,
      programId: programB,
      status: 'submitted'
    })
    const studentScope = {
      role: 'student' as const,
      tenant: false,
      schoolIds: [],
      programIds: []
    }
    const coordinatorScope = {
      role: 'coordinator' as const,
      tenant: false,
      schoolIds: [schoolA],
      programIds: [programA]
    }
    const originalActor: AuthenticatedActor = {
      id: 'coordinator-student-exporter',
      email: 'coordinator-student@example.test',
      displayName: 'Coordinator and Student',
      roles: ['coordinator', 'student'],
      scope: {
        tenant: false,
        schoolIds: [schoolA, schoolB],
        programIds: [programA, programB],
        studentId: student.studentId
      },
      roleScopes: [coordinatorScope, studentScope]
    }
    const metadata = new Map<symbol, unknown>([
      [PUBLIC_ROUTE, false],
      [AUTHENTICATED_ROUTE, false],
      [REQUIRED_PERMISSIONS, ['exports.create']],
      [ANY_PERMISSION, []]
    ])
    const request: {
      headers: { authorization: string }
      actor?: AuthenticatedActor
    } = { headers: { authorization: 'Bearer test-token' } }
    const guard = new AccessGuard(
      { getAllAndOverride: (key: symbol) => metadata.get(key) } as never,
      {
        verifyAccessToken: vi.fn().mockResolvedValue({ sessionId: 'session' })
      } as never,
      {
        assertAccessTokenCurrent: vi.fn().mockResolvedValue(originalActor)
      } as never
    )
    const context = {
      getHandler: vi.fn(),
      getClass: vi.fn(),
      switchToHttp: () => ({ getRequest: () => request })
    } as unknown as ExecutionContext

    await expect(guard.canActivate(context)).resolves.toBe(true)
    expect(request.actor?.roles).toEqual(['coordinator'])

    const created = (await exportService.create(request.actor!, {
      filters: {},
      format: 'csv',
      idempotencyKey: 'coordinator-export-role-scope',
      requestId: 'request-coordinator-export-role-scope'
    })) as { id: string; rowCount: number }

    expect(created.rowCount).toBe(0)
    await expect(
      exportSnapshots.countDocuments({ exportId: created.id })
    ).resolves.toBe(0)
  })

  it('denies export reads after the requester loses access to any snapshotted school/program pair', async () => {
    const cycle = await createCycle('64b0000000000000000000c2', 'EXPORT-SCOPE')
    const student = await createStudent('6631505002', schoolA, programA)
    await createAssignment({
      cycleId: cycle.id,
      placementId: 'export-scope-placement',
      studentId: student.id,
      schoolId: schoolA,
      programId: programA,
      status: 'pending'
    })
    const created = (await exportService.create(scopedStaff, {
      filters: { schoolId: schoolA, programId: programA },
      format: 'csv',
      idempotencyKey: 'report-export-key-02',
      requestId: 'request-export-scope'
    })) as { id: string }
    const narrowedActor: AuthenticatedActor = {
      ...scopedStaff,
      scope: {
        tenant: false,
        schoolIds: [schoolB],
        programIds: [programB]
      },
      roleScopes: [
        {
          role: 'coordinator',
          tenant: false,
          schoolIds: [schoolB],
          programIds: [programB]
        }
      ]
    }
    await expect(
      exportService.get(narrowedActor, created.id)
    ).rejects.toMatchObject({
      response: { code: 'RESOURCE_NOT_FOUND' }
    })
    await expect(
      exportService.get({ ...scopedStaff, id: 'another-staff' }, created.id)
    ).rejects.toMatchObject({ response: { code: 'RESOURCE_NOT_FOUND' } })
  })

  it('does not persist aggregate legacy scope for multi-role export requests', async () => {
    const legacyMultiRoleActor: AuthenticatedActor = {
      ...scopedStaff,
      roles: ['internshipStaff', 'coordinator'],
      scope: { tenant: true, schoolIds: [], programIds: [] },
      roleScopes: undefined
    }

    const created = (await exportService.create(legacyMultiRoleActor, {
      filters: {},
      format: 'csv',
      idempotencyKey: 'report-export-legacy-multi-role',
      requestId: 'request-export-legacy-multi-role'
    })) as { id: string }
    const saved = await reportExports
      .findById(created.id)
      .select('resourceScopes rowCount')
      .lean()

    expect(saved).toMatchObject({ resourceScopes: [], rowCount: 0 })
    expect(
      await auditLogs.countDocuments({
        action: 'reports.export_requested',
        'resourceScopes.tenant': true
      })
    ).toBe(0)
  })

  it('writes the download audit before returning a private short-lived URL', async () => {
    const cycle = await createCycle(
      '64b0000000000000000000c3',
      'EXPORT-DOWNLOAD'
    )
    const student = await createStudent('6631505003', schoolA, programA)
    await createAssignment({
      cycleId: cycle.id,
      placementId: 'export-download-placement',
      studentId: student.id,
      schoolId: schoolA,
      programId: programA,
      status: 'submitted'
    })
    const created = (await exportService.create(scopedStaff, {
      filters: { schoolId: schoolA, programId: programA },
      format: 'csv',
      idempotencyKey: 'report-export-key-03',
      requestId: 'request-export-download'
    })) as { id: string }
    await reportExports.updateOne(
      { _id: created.id },
      {
        $set: {
          status: 'ready',
          objectKey: `report-exports/${created.id}/file.csv`
        }
      }
    )

    const signed = (await exportService.downloadUrl(
      scopedStaff,
      created.id,
      'request-export-download-url'
    )) as { url: string; expiresIn: number }
    expect(signed.url).toContain('X-Amz-Expires=300')
    expect(signed.expiresIn).toBe(300)
    await expect(
      auditLogs.countDocuments({ action: 'reports.export_downloaded' })
    ).resolves.toBe(1)
  })

  it('rolls back export metadata and snapshot rows if the request audit fails', async () => {
    const cycle = await createCycle(
      '64b0000000000000000000c4',
      'EXPORT-ROLLBACK'
    )
    const student = await createStudent('6631505004', schoolA, programA)
    await createAssignment({
      cycleId: cycle.id,
      placementId: 'export-rollback-placement',
      studentId: student.id,
      schoolId: schoolA,
      programId: programA,
      status: 'pending'
    })
    vi.spyOn(auditService, 'record').mockRejectedValueOnce(
      new Error('test audit failure')
    )

    await expect(
      exportService.create(scopedStaff, {
        filters: { schoolId: schoolA, programId: programA },
        format: 'csv',
        idempotencyKey: 'report-export-key-04',
        requestId: 'request-export-rollback'
      })
    ).rejects.toThrow('test audit failure')
    await expect(reportExports.countDocuments({})).resolves.toBe(0)
    await expect(exportSnapshots.countDocuments({})).resolves.toBe(0)
  })

  it('keeps the report-export index migration idempotent and verifiable', async () => {
    const result = await migrateReportExportIndexes(connection, true)
    expect(result).toHaveLength(4)
    expect(result.every((item) => item.action === 'already-present')).toBe(true)
    expect(
      await exportSnapshots.collection
        .indexes()
        .then(
          (indexes) =>
            indexes.find(
              (index) => index.name === 'report_export_snapshot_expiry'
            )?.expireAfterSeconds
        )
    ).toBe(0)
  })
})
