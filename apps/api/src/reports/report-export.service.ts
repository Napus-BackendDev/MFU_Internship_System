import type { AppEnvironment } from '@internship/config'
import type {
  AuthenticatedActor,
  ReportExportField,
  ReportExportFormat,
  ReportExportType,
  StudentDirectoryExportLocale,
  StudentDirectoryExportValues
} from '@internship/shared-types'
import {
  DEFAULT_REPORT_EXPORT_FIELDS,
  REPORT_EXPORT_FIELDS
} from '@internship/shared-types'
import { GetObjectCommand, S3Client } from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'
import { InjectQueue } from '@nestjs/bullmq'
import {
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  Optional,
  UnprocessableEntityException
} from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { InjectConnection, InjectModel } from '@nestjs/mongoose'
import type { Queue } from 'bullmq'
import {
  Types,
  type ClientSession,
  type Connection,
  type Model
} from 'mongoose'

import { actorHasPermission } from '../auth/permission-map.js'
import { supportsMongoTransactions } from '../health.mongo-capability.js'
import {
  AuditService,
  resourceScopesFromRoleAssignments
} from '../audit/audit.service.js'
import { idempotencyScopeKey, requestHash } from '../common/idempotency.js'
import { scopeFilter } from '../common/scope.js'
import type { AuditResourceScope } from '../audit/audit.schema.js'
import { EvaluationAssignmentRecord } from '../evaluations/evaluation.schema.js'
import { EvaluationCycleRecord } from '../evaluations/evaluation.schema.js'
import { StudentRecord } from '../members/members.schema.js'
import { MembersService } from '../members/members.service.js'
import {
  ReportExportRecord,
  ReportExportSnapshotRecord
} from './report-export.schema.js'
import { ReportsService, type ReportFilters } from './reports.service.js'
import {
  toStudentDirectoryExportValues,
  type StudentDirectoryExportSource
} from './student-directory-export.js'

const MAX_EXPORT_ROWS = 5000
const EXPORT_TTL_MS = 24 * 60 * 60 * 1000
const SENSITIVE_FIELDS = new Set<ReportExportField>([
  'studentNumber',
  'studentName',
  'studentEmail'
])

interface CreateReportExportInput {
  readonly reportType?: ReportExportType
  readonly filters: ReportFilters & StudentDirectoryReportFilters
  readonly fields?: readonly ReportExportField[]
  readonly locale?: StudentDirectoryExportLocale
  readonly format: ReportExportFormat
  readonly idempotencyKey: string
  readonly requestId: string
}

interface StudentDirectoryReportFilters {
  readonly search?: string
  readonly schoolId?: string
  readonly cycleId?: string
  readonly academicYear?: number
  readonly semester?: string
  readonly evaluationStatus?: string
}

interface StudentDirectoryListResult {
  readonly items: readonly StudentDirectoryExportSource[]
  readonly meta: { readonly total: number }
}

function isStudentDirectoryListResult(
  value: unknown
): value is StudentDirectoryListResult {
  if (typeof value !== 'object' || value === null) return false
  const result = value as { readonly items?: unknown; readonly meta?: unknown }
  if (
    !Array.isArray(result.items) ||
    typeof result.meta !== 'object' ||
    result.meta === null
  ) {
    return false
  }
  return Number.isInteger((result.meta as { readonly total?: unknown }).total)
}

interface AssignmentExportSource {
  readonly _id: Types.ObjectId
  readonly cycleId: string
  readonly studentId: string
  readonly schoolId: string
  readonly programId: string
  readonly status: string
  readonly deadlineAt: Date
}

interface StudentExportSource {
  readonly _id: Types.ObjectId
  readonly studentId: string
  readonly email?: string
  readonly name?: { readonly th?: string; readonly en?: string }
}

@Injectable()
export class ReportExportService {
  private readonly logger = new Logger(ReportExportService.name)
  private readonly s3: S3Client
  private readonly bucket: string

  public constructor(
    @InjectQueue('report-exports')
    private readonly exportQueue: Queue<{ readonly exportId: string }>,
    @InjectConnection() private readonly connection: Connection,
    @InjectModel(EvaluationAssignmentRecord.name)
    private readonly assignments: Model<EvaluationAssignmentRecord>,
    @InjectModel(StudentRecord.name)
    private readonly students: Model<StudentRecord>,
    @InjectModel(EvaluationCycleRecord.name)
    private readonly cycles: Model<EvaluationCycleRecord>,
    @InjectModel(ReportExportRecord.name)
    private readonly exports: Model<ReportExportRecord>,
    @InjectModel(ReportExportSnapshotRecord.name)
    private readonly snapshots: Model<ReportExportSnapshotRecord>,
    private readonly reports: ReportsService,
    private readonly auditService: AuditService,
    config: ConfigService<AppEnvironment, true>,
    @Optional() private readonly members?: MembersService
  ) {
    this.bucket = config.get('S3_BUCKET', { infer: true })
    this.s3 = new S3Client({
      endpoint: config.get('S3_ENDPOINT', { infer: true }),
      region: config.get('S3_REGION', { infer: true }),
      forcePathStyle: config.get('S3_FORCE_PATH_STYLE', { infer: true }),
      credentials: {
        accessKeyId: config.get('S3_ACCESS_KEY_ID', { infer: true }),
        secretAccessKey: config.get('S3_SECRET_ACCESS_KEY', { infer: true })
      }
    })
  }

  public async create(
    actor: AuthenticatedActor,
    input: CreateReportExportInput
  ): Promise<unknown> {
    if (!actorHasPermission(actor.roles, 'exports.create')) {
      throw new ForbiddenException({ code: 'PERMISSION_DENIED' })
    }
    const reportType = input.reportType ?? 'assignments'
    const fields =
      reportType === 'studentDirectory'
        ? []
        : input.fields?.length
          ? [...input.fields]
          : [...DEFAULT_REPORT_EXPORT_FIELDS]
    if (
      reportType === 'studentDirectory' &&
      (input.format !== 'xlsx' || !input.locale)
    ) {
      throw new UnprocessableEntityException({
        code: 'INVALID_STUDENT_DIRECTORY_EXPORT_FORMAT'
      })
    }
    if (reportType === 'assignments' && input.format !== 'csv') {
      throw new UnprocessableEntityException({
        code: 'INVALID_ASSIGNMENT_EXPORT_FORMAT'
      })
    }
    if (
      fields.some((field) => !REPORT_EXPORT_FIELDS.includes(field)) ||
      new Set(fields).size !== fields.length
    ) {
      throw new UnprocessableEntityException({ code: 'INVALID_EXPORT_FIELDS' })
    }
    if (
      fields.some((field) => SENSITIVE_FIELDS.has(field)) &&
      !actorHasPermission(actor.roles, 'students.read')
    ) {
      throw new ForbiddenException({
        code: 'SENSITIVE_EXPORT_PERMISSION_REQUIRED'
      })
    }
    if (
      reportType === 'studentDirectory' &&
      !actorHasPermission(actor.roles, 'students.read')
    ) {
      throw new ForbiddenException({
        code: 'SENSITIVE_EXPORT_PERMISSION_REQUIRED'
      })
    }

    const requestHashValue = requestHash({
      type: reportType,
      filters: input.filters,
      fields,
      format: input.format,
      locale: input.locale ?? null
    })
    const scopedKey = idempotencyScopeKey(
      actor.id,
      'report-export',
      input.idempotencyKey
    )
    const exportId = new Types.ObjectId(scopedKey.slice(0, 24)).toString()
    const existingExport = await this.exports.findById(exportId).exec()
    if (existingExport) {
      return this.returnExisting(actor, existingExport, requestHashValue)
    }

    const persistedFilters = Object.fromEntries(
      Object.entries(input.filters).map(([key, value]) => [key, String(value)])
    )

    let racedIdempotentRequest = false
    const executeExportCreation = async (
      session?: ClientSession
    ): Promise<void> => {
      const raced = await (session
        ? this.exports.findById(exportId).session(session).exec()
        : this.exports.findById(exportId).exec())
      if (raced) {
        racedIdempotentRequest = true
        return
      }

      const snapshotAt = new Date()
      const expiresAt = new Date(snapshotAt.getTime() + EXPORT_TTL_MS)
      let rows: Array<{
        readonly exportId: string
        readonly schoolId: string
        readonly programId: string
        readonly values: Readonly<Record<string, string | number>>
        readonly expiresAt: Date
      }>
      if (reportType === 'studentDirectory') {
        const directorySnapshotRows = await this.studentDirectorySnapshot(
          actor,
          input.filters,
          input.locale!,
          session
        )
        rows = directorySnapshotRows.map((row) => ({
          exportId,
          schoolId: row.schoolId,
          programId: row.programId,
          values: { ...row.values },
          expiresAt
        }))
      } else {
        const assignmentFilter = await this.reports.assignmentFilter(
          actor,
          input.filters,
          session
        )
        const assignments = await this.assignmentSnapshot(
          assignmentFilter,
          session
        )
        if (assignments.length > MAX_EXPORT_ROWS) {
          throw new UnprocessableEntityException({
            code: 'EXPORT_ROW_LIMIT_EXCEEDED',
            details: { maxRows: MAX_EXPORT_ROWS }
          })
        }
        const studentByReference = await this.studentSnapshot(
          assignments,
          fields,
          session
        )
        const cycleTerms = await this.cycleTermSnapshot(
          assignments,
          fields,
          session
        )
        rows = assignments.map((assignment) => ({
          exportId,
          schoolId: assignment.schoolId,
          programId: assignment.programId,
          values: this.valuesFor(
            assignment,
            fields,
            studentByReference,
            cycleTerms
          ),
          expiresAt
        }))
      }
      if (rows.length > 0) {
        if (session) {
          await this.snapshots.insertMany(rows, { session })
        } else {
          await this.snapshots.insertMany(rows)
        }
      }

      const resourceScopes = this.exportResourceScopes(actor)
      const created = new this.exports({
        _id: new Types.ObjectId(exportId),
        requestedBy: actor.id,
        requestId: input.requestId,
        requestHash: requestHashValue,
        reportType,
        ...(input.locale ? { locale: input.locale } : {}),
        filters: persistedFilters,
        fields,
        format: input.format,
        status: 'queued',
        rowCount: rows.length,
        snapshotAt,
        expiresAt,
        resourceScopes
      })
      if (session) {
        await created.save({ session })
      } else {
        await created.save()
      }
      await this.auditService.record(
        {
          requestId: input.requestId,
          actorId: actor.id,
          actorEmail: actor.email,
          action: 'reports.export_requested',
          route: 'POST /api/v2/reports/exports',
          method: 'POST',
          resourceScopes,
          metadata: {
            exportId,
            reportType,
            locale: input.locale,
            fields,
            format: input.format,
            filters: input.filters,
            rowCount: rows.length,
            snapshotAt: snapshotAt.toISOString()
          }
        },
        session
      )
    }

    let hasTransactionSupport = false
    try {
      if (this.connection.db) {
        const hello = await this.connection.db.admin().command({ hello: 1 })
        hasTransactionSupport = supportsMongoTransactions(hello)
      }
    } catch {
      hasTransactionSupport = false
    }

    if (hasTransactionSupport) {
      const session = await this.connection.startSession()
      try {
        await session.withTransaction(
          () => executeExportCreation(session),
          {
            readConcern: { level: 'snapshot' },
            readPreference: 'primary',
            writeConcern: { w: 'majority' }
          }
        )
      } catch (error: unknown) {
        if (this.isDuplicateKey(error)) {
          const racedExport = await this.exports.findById(exportId).exec()
          if (racedExport) {
            return this.returnExisting(actor, racedExport, requestHashValue)
          }
        }
        throw error
      } finally {
        await session.endSession()
      }
    } else {
      try {
        await executeExportCreation()
      } catch (error: unknown) {
        if (this.isDuplicateKey(error)) {
          const racedExport = await this.exports.findById(exportId).exec()
          if (racedExport) {
            return this.returnExisting(actor, racedExport, requestHashValue)
          }
        }
        throw error
      }
    }

    const reportExport = await this.exports.findById(exportId).exec()
    if (!reportExport) throw new Error('Report export transaction was empty')
    if (racedIdempotentRequest) {
      return this.returnExisting(actor, reportExport, requestHashValue)
    }
    if (reportExport.status === 'queued') {
      try {
        await this.exportQueue.add(
          'generate-report',
          { exportId },
          {
            attempts: 3,
            backoff: { type: 'exponential', delay: 5000 },
            jobId: `report-export-${exportId}`,
            removeOnComplete: 500,
            removeOnFail: 1000
          }
        )
      } catch {
        this.logger.warn(
          JSON.stringify({ event: 'REPORT_EXPORT_ENQUEUE_DEFERRED', exportId })
        )
      }
    }
    return this.toView(reportExport)
  }

  public async get(
    actor: AuthenticatedActor,
    exportId: string
  ): Promise<unknown> {
    if (!actorHasPermission(actor.roles, 'exports.download')) {
      throw new ForbiddenException({ code: 'PERMISSION_DENIED' })
    }
    const reportExport = await this.exports
      .findOne({ _id: exportId, requestedBy: actor.id })
      .select('+failureCode')
      .exec()
    if (!reportExport)
      throw new NotFoundException({ code: 'RESOURCE_NOT_FOUND' })
    if (reportExport.expiresAt <= new Date()) {
      return this.toView(reportExport, 'expired')
    }
    await this.assertCurrentScope(actor, reportExport)
    return this.toView(reportExport)
  }

  public async downloadUrl(
    actor: AuthenticatedActor,
    exportId: string,
    requestId: string
  ): Promise<unknown> {
    if (!actorHasPermission(actor.roles, 'exports.download')) {
      throw new ForbiddenException({ code: 'PERMISSION_DENIED' })
    }
    const reportExport = await this.exports
      .findOne({ _id: exportId, requestedBy: actor.id })
      .select('+objectKey +sha256 +resourceScopes')
      .exec()
    if (!reportExport)
      throw new NotFoundException({ code: 'RESOURCE_NOT_FOUND' })
    await this.assertCurrentScope(actor, reportExport)
    const now = Date.now()
    const expiresIn = Math.min(
      300,
      Math.floor((reportExport.expiresAt.getTime() - now) / 1000)
    )
    if (
      reportExport.status !== 'ready' ||
      !reportExport.objectKey ||
      expiresIn <= 0
    ) {
      throw new ConflictException({
        code:
          expiresIn <= 0 || reportExport.status === 'expired'
            ? 'REPORT_EXPORT_EXPIRED'
            : 'REPORT_EXPORT_NOT_READY'
      })
    }
    const url = await getSignedUrl(
      this.s3,
      new GetObjectCommand({
        Bucket: this.bucket,
        Key: reportExport.objectKey
      }),
      { expiresIn }
    )
    await this.auditService.record({
      requestId,
      actorId: actor.id,
      actorEmail: actor.email,
      action: 'reports.export_downloaded',
      route: 'GET /api/v2/reports/exports/:exportId/download-url',
      method: 'GET',
      resourceScopes: reportExport.resourceScopes.map(
        (scope) => scope as unknown as AuditResourceScope
      ),
      metadata: {
        exportId,
        format: reportExport.format,
        rowCount: reportExport.rowCount,
        expiresIn
      }
    })
    return { url, expiresIn }
  }

  private async returnExisting(
    actor: AuthenticatedActor,
    reportExport: ReportExportRecord & { readonly id: string },
    expectedHash: string
  ): Promise<unknown> {
    if (reportExport.requestHash !== expectedHash) {
      throw new ConflictException({ code: 'IDEMPOTENCY_KEY_REUSED' })
    }
    if (reportExport.requestedBy !== actor.id) {
      throw new NotFoundException({ code: 'RESOURCE_NOT_FOUND' })
    }
    if (reportExport.expiresAt <= new Date()) {
      return this.toView(reportExport, 'expired')
    }
    await this.assertCurrentScope(actor, reportExport)
    if (reportExport.status === 'queued') {
      try {
        await this.exportQueue.add(
          'generate-report',
          { exportId: reportExport.id },
          {
            attempts: 3,
            backoff: { type: 'exponential', delay: 5000 },
            jobId: `report-export-${reportExport.id}`,
            removeOnComplete: 500,
            removeOnFail: 1000
          }
        )
      } catch {
        this.logger.warn(
          JSON.stringify({
            event: 'REPORT_EXPORT_ENQUEUE_DEFERRED',
            exportId: reportExport.id
          })
        )
      }
    }
    return this.toView(reportExport)
  }

  private async assignmentSnapshot(
    assignmentFilter: Record<string, unknown>,
    session?: ClientSession
  ): Promise<AssignmentExportSource[]> {
    const query = this.assignments
      .find(assignmentFilter)
      .select('_id cycleId studentId schoolId programId status deadlineAt')
      .sort({ _id: 1 })
      .limit(MAX_EXPORT_ROWS + 1)
    if (session) query.session(session)
    return query.lean<AssignmentExportSource[]>().exec()
  }

  private async studentSnapshot(
    assignments: readonly AssignmentExportSource[],
    fields: readonly ReportExportField[],
    session?: ClientSession
  ): Promise<ReadonlyMap<string, StudentExportSource>> {
    if (!fields.some((field) => SENSITIVE_FIELDS.has(field))) return new Map()
    const references = [...new Set(assignments.map((item) => item.studentId))]
    const objectIds = references
      .filter((reference) => Types.ObjectId.isValid(reference))
      .map((reference) => new Types.ObjectId(reference))
    const query = this.students
      .find({
        $or: [{ studentId: { $in: references } }, { _id: { $in: objectIds } }]
      })
      .select('_id studentId name email')
    if (session) query.session(session)
    const students = await query.lean<StudentExportSource[]>().exec()
    const byReference = new Map<string, StudentExportSource>()
    for (const student of students) {
      byReference.set(student.studentId, student)
      byReference.set(student._id.toString(), student)
    }
    for (const reference of references) {
      if (!byReference.has(reference)) {
        throw new UnprocessableEntityException({
          code: 'EXPORT_STUDENT_REFERENCE_UNRESOLVED'
        })
      }
    }
    return byReference
  }

  private async cycleTermSnapshot(
    assignments: readonly AssignmentExportSource[],
    fields: readonly ReportExportField[],
    session?: ClientSession
  ): Promise<ReadonlyMap<string, string>> {
    if (!fields.includes('termId')) return new Map()
    const query = this.cycles
      .find({
        _id: { $in: [...new Set(assignments.map((item) => item.cycleId))] }
      })
      .select('_id academicTermId')
    if (session) query.session(session)
    const cycles = await query.lean<
      Array<{ readonly _id: Types.ObjectId; readonly academicTermId: string }>
    >().exec()
    return new Map(
      cycles.map((cycle) => [cycle._id.toString(), cycle.academicTermId])
    )
  }

  private async studentDirectorySnapshot(
    actor: AuthenticatedActor,
    filters: StudentDirectoryReportFilters,
    locale: StudentDirectoryExportLocale,
    session?: ClientSession
  ): Promise<
    Array<{
      readonly schoolId: string
      readonly programId: string
      readonly values: StudentDirectoryExportValues
    }>
  > {
    if (!this.members) {
      throw new UnprocessableEntityException({
        code: 'STUDENT_DIRECTORY_EXPORT_UNAVAILABLE'
      })
    }
    const rawResult = await this.members.listStudents(
      actor,
      {
        page: 1,
        pageSize: MAX_EXPORT_ROWS + 1,
        includeDirectoryData: false,
        ...(filters.search ? { search: filters.search } : {}),
        ...(filters.schoolId ? { schoolId: filters.schoolId } : {}),
        ...(filters.cycleId ? { cycleId: filters.cycleId } : {}),
        ...(filters.academicYear ? { academicYear: filters.academicYear } : {}),
        ...(filters.semester ? { semester: filters.semester } : {}),
        ...(filters.evaluationStatus
          ? { evaluationStatus: filters.evaluationStatus }
          : {})
      },
      session
    )
    if (!isStudentDirectoryListResult(rawResult)) {
      throw new UnprocessableEntityException({
        code: 'STUDENT_DIRECTORY_EXPORT_SNAPSHOT_INCOMPLETE'
      })
    }
    const result = rawResult
    if (result.meta.total > MAX_EXPORT_ROWS) {
      throw new UnprocessableEntityException({
        code: 'EXPORT_ROW_LIMIT_EXCEEDED',
        details: { maxRows: MAX_EXPORT_ROWS }
      })
    }
    if (result.meta.total !== result.items.length) {
      throw new UnprocessableEntityException({
        code: 'STUDENT_DIRECTORY_EXPORT_SNAPSHOT_INCOMPLETE'
      })
    }
    return result.items.map((student) => {
      if (!student.schoolId || !student.programId) {
        throw new UnprocessableEntityException({
          code: 'EXPORT_SCOPE_REFERENCE_MISSING'
        })
      }
      return {
        schoolId: student.schoolId,
        programId: student.programId,
        values: toStudentDirectoryExportValues(student, filters.cycleId, locale)
      }
    })
  }

  private valuesFor(
    assignment: AssignmentExportSource,
    fields: readonly ReportExportField[],
    students: ReadonlyMap<string, StudentExportSource>,
    cycleTerms: ReadonlyMap<string, string>
  ): Readonly<Record<string, string>> {
    const student = students.get(assignment.studentId)
    const values: Partial<Record<ReportExportField, string>> = {
      studentNumber: student?.studentId ?? '',
      studentName: student?.name?.th || student?.name?.en || '',
      studentEmail: student?.email ?? '',
      schoolId: assignment.schoolId,
      programId: assignment.programId,
      termId: cycleTerms.get(assignment.cycleId) ?? '',
      cycleId: assignment.cycleId,
      status: assignment.status,
      deadlineAt: assignment.deadlineAt.toISOString()
    }
    return Object.fromEntries(
      fields.map((field) => [field, values[field] ?? ''])
    )
  }

  private async assertCurrentScope(
    actor: AuthenticatedActor,
    reportExport: ReportExportRecord & { readonly id: string }
  ): Promise<void> {
    if (actor.roles.includes('systemAdmin') || reportExport.rowCount === 0)
      return
    const currentScope = scopeFilter<ReportExportSnapshotRecord>(actor)
    const accessibleRows = await this.snapshots
      .countDocuments({ exportId: reportExport.id, ...currentScope })
      .exec()
    if (accessibleRows !== reportExport.rowCount) {
      throw new NotFoundException({ code: 'RESOURCE_NOT_FOUND' })
    }
  }

  private exportResourceScopes(
    actor: AuthenticatedActor
  ): AuditResourceScope[] {
    if (actor.roles.includes('systemAdmin')) return []
    if (actor.roleScopes) {
      return resourceScopesFromRoleAssignments(
        actor.roleScopes.filter(
          (scope) =>
            actor.roles.includes(scope.role) &&
            actorHasPermission([scope.role], 'exports.create')
        )
      )
    }
    if (
      actor.roles.length !== 1 ||
      !actorHasPermission(actor.roles, 'exports.create')
    ) {
      return []
    }
    return resourceScopesFromRoleAssignments([
      {
        role: actor.roles[0]!,
        tenant: actor.scope.tenant,
        schoolIds: [...actor.scope.schoolIds],
        programIds: [...actor.scope.programIds]
      }
    ])
  }

  private toView(
    reportExport: ReportExportRecord & { readonly id: string },
    status = reportExport.status
  ): unknown {
    return {
      id: reportExport.id,
      reportType: reportExport.reportType ?? 'assignments',
      ...(reportExport.locale ? { locale: reportExport.locale } : {}),
      filters: reportExport.filters,
      fields: reportExport.fields,
      format: reportExport.format,
      status,
      rowCount: reportExport.rowCount,
      snapshotAt: reportExport.snapshotAt.toISOString(),
      expiresAt: reportExport.expiresAt.toISOString(),
      ...(reportExport.completedAt
        ? { completedAt: reportExport.completedAt.toISOString() }
        : {}),
      ...(status === 'failed'
        ? { failureCode: 'EXPORT_GENERATION_FAILED' }
        : {})
    }
  }

  private isDuplicateKey(error: unknown): boolean {
    return (
      typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      error.code === 11000
    )
  }
}
