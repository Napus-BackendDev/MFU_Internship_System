import { createHash } from 'node:crypto'
import { basename } from 'node:path'

import type { AuthenticatedActor } from '@internship/shared-types'
import {
  ConflictException,
  Injectable,
  NotFoundException,
  PayloadTooLargeException,
  UnprocessableEntityException
} from '@nestjs/common'
import { InjectConnection, InjectModel } from '@nestjs/mongoose'
import type {
  ClientSession,
  Connection,
  HydratedDocument,
  Model
} from 'mongoose'

import {
  AcademicTermRecord,
  CourseRecord,
  ProgramRecord,
  SchoolRecord
} from '../academic/academic.schema.js'
import { AuditService } from '../audit/audit.service.js'
import { idempotencyScopeKey, requestHash } from '../common/idempotency.js'
import { StudentRecord } from './members.schema.js'
import {
  parseStudentWorkbook,
  type StudentImportIssue,
  type StudentImportSourceRow
} from './student-import.parser.js'
import {
  StudentImportBatchRecord,
  StudentImportCommitRecord,
  StudentImportRowRecord
} from './student-import.schema.js'

const MAX_UPLOAD_BYTES = 5 * 1024 * 1024
const PREVIEW_TTL_MS = 24 * 60 * 60 * 1000
const MAX_COMMIT_DECISIONS = 100

export interface StudentImportDecision {
  readonly rowId: string
  readonly action: 'create' | 'update'
}

interface ImportPayload extends Record<string, unknown> {
  studentId: string
  name: { th: string; en: string }
  email: string
  schoolId: string
  programId: string
}

@Injectable()
export class StudentImportService {
  public constructor(
    @InjectConnection() private readonly connection: Connection,
    @InjectModel(StudentRecord.name)
    private readonly students: Model<StudentRecord>,
    @InjectModel(SchoolRecord.name)
    private readonly schools: Model<SchoolRecord>,
    @InjectModel(ProgramRecord.name)
    private readonly programs: Model<ProgramRecord>,
    @InjectModel(CourseRecord.name)
    private readonly courses: Model<CourseRecord>,
    @InjectModel(AcademicTermRecord.name)
    private readonly terms: Model<AcademicTermRecord>,
    @InjectModel(StudentImportBatchRecord.name)
    private readonly batches: Model<StudentImportBatchRecord>,
    @InjectModel(StudentImportRowRecord.name)
    private readonly rows: Model<StudentImportRowRecord>,
    @InjectModel(StudentImportCommitRecord.name)
    private readonly commits: Model<StudentImportCommitRecord>,
    private readonly auditService: AuditService
  ) {}

  public async preview(
    actor: AuthenticatedActor,
    sourceName: string,
    file: Buffer
  ): Promise<unknown> {
    if (file.length === 0) {
      throw new UnprocessableEntityException({ code: 'WORKBOOK_EMPTY' })
    }
    if (file.length > MAX_UPLOAD_BYTES) {
      throw new PayloadTooLargeException({ code: 'WORKBOOK_TOO_LARGE' })
    }
    assertSupportedWorkbook(sourceName, file)

    let parsed
    try {
      parsed = parseStudentWorkbook(file)
    } catch (error) {
      const code = error instanceof Error ? error.message : 'WORKBOOK_INVALID'
      if (
        code === 'WORKBOOK_ROW_LIMIT_EXCEEDED' ||
        code === 'WORKBOOK_SHEET_LIMIT_EXCEEDED' ||
        code === 'WORKBOOK_COLUMN_LIMIT_EXCEEDED'
      ) {
        throw new PayloadTooLargeException({ code })
      }
      throw new UnprocessableEntityException({
        code: ['WORKBOOK_NO_STUDENT_ROWS', 'WORKBOOK_INVALID'].includes(code)
          ? code
          : 'WORKBOOK_INVALID'
      })
    }

    const [
      schoolDocuments,
      programDocuments,
      courseDocuments,
      termDocuments,
      existingStudents
    ] = await Promise.all([
      this.schools.find({ status: 'active' }).lean().exec(),
      this.programs.find({ status: 'active' }).lean().exec(),
      this.courses.find({ status: 'active' }).lean().exec(),
      this.terms
        .find({ status: { $ne: 'archived' } })
        .lean()
        .exec(),
      this.students
        .find({ studentId: { $in: parsed.rows.map((row) => row.studentId) } })
        .exec()
    ])
    const schools = schoolDocuments as unknown as readonly Record<
      string,
      unknown
    >[]
    const programs = programDocuments as unknown as readonly Record<
      string,
      unknown
    >[]
    const courses = courseDocuments as unknown as readonly Record<
      string,
      unknown
    >[]
    const terms = termDocuments as unknown as readonly Record<string, unknown>[]
    const existingByStudentId = new Map(
      existingStudents.map((student) => [student.studentId, student])
    )
    const expiresAt = new Date(Date.now() + PREVIEW_TTL_MS)
    const checksum = createHash('sha256').update(file).digest('hex')
    const safeName = sanitizeSourceName(sourceName)
    const prepared: Array<Record<string, unknown>> = []

    for (const source of parsed.rows) {
      const result = this.resolveRow(
        actor,
        source,
        schools,
        programs,
        courses,
        terms,
        existingByStudentId,
        expiresAt
      )
      prepared.push(result)
    }

    const batch = await this.connection.transaction(async (session) => {
      const document = await new this.batches({
        actorId: actor.id,
        sourceName: safeName,
        checksum,
        expiresAt,
        sourceRowCount: parsed.rows.length,
        questionFields: [...parsed.questionFields],
        status: 'preview'
      }).save({ session })
      const batchId = document.id
      await this.rows.insertMany(
        prepared.map((row) => ({ ...row, batchId, actorId: actor.id })),
        { ordered: true, session }
      )
      return document
    })

    return this.getBatchResponse(actor, batch.id)
  }

  public async getPreview(
    actor: AuthenticatedActor,
    batchId: string
  ): Promise<unknown> {
    return this.getBatchResponse(actor, batchId)
  }

  public async commit(
    actor: AuthenticatedActor,
    batchId: string,
    idempotencyKey: string,
    decisions: readonly StudentImportDecision[],
    requestId: string
  ): Promise<unknown> {
    if (decisions.length === 0 || decisions.length > MAX_COMMIT_DECISIONS) {
      throw new UnprocessableEntityException({
        code: 'IMPORT_DECISION_COUNT_INVALID',
        details: { maximum: MAX_COMMIT_DECISIONS }
      })
    }
    const uniqueRowIds = new Set(decisions.map((decision) => decision.rowId))
    if (uniqueRowIds.size !== decisions.length) {
      throw new UnprocessableEntityException({ code: 'IMPORT_ROW_DUPLICATED' })
    }

    const batch = await this.findActiveBatch(actor.id, batchId)
    if (!batch) throw new NotFoundException({ code: 'RESOURCE_NOT_FOUND' })

    const normalizedDecisions = [...decisions].sort((left, right) =>
      left.rowId.localeCompare(right.rowId)
    )
    const scopedKey = idempotencyScopeKey(
      actor.id,
      `student-import:${batchId}`,
      idempotencyKey
    )
    const payloadHash = requestHash(normalizedDecisions)
    let command = await this.commits
      .findOne({ idempotencyScopeKey: scopedKey, actorId: actor.id })
      .exec()
    if (command) {
      if (command.requestHash !== payloadHash || command.batchId !== batchId) {
        throw new ConflictException({ code: 'IDEMPOTENCY_KEY_REUSED' })
      }
    } else {
      try {
        const [createdCommand] = await this.commits.create([
          {
            batchId,
            actorId: actor.id,
            idempotencyScopeKey: scopedKey,
            requestHash: payloadHash,
            decisions: normalizedDecisions,
            status: 'processing'
          }
        ])
        command = createdCommand ?? null
      } catch (error) {
        if (!isDuplicateKeyError(error)) throw error
        command = await this.commits
          .findOne({ idempotencyScopeKey: scopedKey, actorId: actor.id })
          .exec()
        if (!command || command.requestHash !== payloadHash) {
          throw new ConflictException({ code: 'IDEMPOTENCY_KEY_REUSED' })
        }
      }
    }
    if (!command) throw new ConflictException({ code: 'IMPORT_COMMIT_RETRY' })

    const results: Array<{
      rowId: string
      action: StudentImportDecision['action']
      outcome: 'created' | 'updated' | 'unchanged'
    }> = []
    for (const decision of normalizedDecisions) {
      const outcome = await this.commitRow(
        actor,
        batchId,
        command.id,
        decision,
        requestId
      )
      results.push({ ...decision, outcome })
    }

    await this.commits.updateOne(
      { _id: command.id, actorId: actor.id, requestHash: payloadHash },
      { $set: { status: 'completed' } }
    )
    await this.markBatchCompleted(batchId, actor.id)
    return { batchId, commitId: command.id, status: 'completed', results }
  }

  private resolveRow(
    actor: AuthenticatedActor,
    source: StudentImportSourceRow,
    schools: readonly Record<string, unknown>[],
    programs: readonly Record<string, unknown>[],
    courses: readonly Record<string, unknown>[],
    terms: readonly Record<string, unknown>[],
    existingByStudentId: ReadonlyMap<string, HydratedDocument<StudentRecord>>,
    expiresAt: Date
  ): Record<string, unknown> {
    const issues: StudentImportIssue[] = [...source.issues]
    const warnings: StudentImportIssue[] = []
    const sourcePreview = publicSourcePreview(source)
    const sourceRowHash = requestHash(source)
    const school = findMaster(schools, source.schoolReference, [
      'schoolCode',
      'name'
    ])
    if (!school) {
      issues.push(
        issue('SCHOOL_NOT_FOUND', 'school', 'School is not in master data.')
      )
    }
    const schoolId = school ? String(school._id) : undefined
    const schoolPrograms = schoolId
      ? programs.filter((program) => String(program.schoolId) === schoolId)
      : []
    const program = findMaster(schoolPrograms, source.programReference, [
      'programCode',
      'name'
    ])
    if (school && !program) {
      issues.push(
        issue(
          'PROGRAM_NOT_FOUND',
          'program',
          'Program was not found under the selected school.'
        )
      )
    }
    const programId = program ? String(program._id) : undefined

    if (
      !schoolId ||
      !programId ||
      !actorCanManageStudentScope(actor, schoolId, programId)
    ) {
      return {
        rowKey: source.key,
        sheet: source.sheet,
        rowNumber: source.rowNumber,
        sourceRowHash,
        sourcePreview,
        action: 'invalid',
        status: 'pending',
        issues: [
          ...issues,
          ...(!schoolId || !programId
            ? []
            : [
                issue(
                  'ROW_OUT_OF_SCOPE',
                  'scope',
                  'Row is outside your import scope.'
                )
              ])
        ],
        warnings,
        changes: [],
        expiresAt
      }
    }

    const course = source.courseReference
      ? findMaster(courses, source.courseReference, ['courseCode', 'name'])
      : undefined
    if (source.courseReference && !course) {
      issues.push(
        issue(
          'COURSE_NOT_FOUND',
          'course',
          'Course was not found; no course ID will be guessed.'
        )
      )
    } else if (
      course &&
      (!Array.isArray(course.programIds) ||
        !course.programIds.map(String).includes(programId))
    ) {
      issues.push(
        issue(
          'COURSE_PROGRAM_MISMATCH',
          'course',
          'Course is not explicitly linked to the selected program.'
        )
      )
    }

    const termInput = parseSemesterYear(source.semester, source.academicYear)
    if (termInput.conflict) {
      issues.push(
        issue(
          'ACADEMIC_TERM_YEAR_CONFLICT',
          'academicYear',
          'Semester year conflicts with academic year.'
        )
      )
    }
    const termMatches =
      termInput.semester && termInput.academicYear !== undefined
        ? terms.filter(
            (candidate) =>
              Number(candidate.academicYear) === termInput.academicYear &&
              normalizeSemester(candidate.semester) === termInput.semester
          )
        : []
    const term = termMatches.length === 1 ? termMatches[0] : undefined
    if ((source.semester || source.academicYear) && !term) {
      issues.push(
        issue(
          termMatches.length > 1
            ? 'ACADEMIC_TERM_AMBIGUOUS'
            : 'ACADEMIC_TERM_NOT_FOUND',
          'academicTermId',
          termMatches.length > 1
            ? 'Multiple academic terms match this semester and year.'
            : 'Matching academic term was not found; no term ID will be guessed.'
        )
      )
    }
    if (source.semester && termInput.academicYear === undefined) {
      issues.push(
        issue(
          'ACADEMIC_TERM_YEAR_REQUIRED',
          'academicYear',
          'Academic year is required to resolve the selected semester.'
        )
      )
    }

    const payload: ImportPayload = {
      studentId: source.studentId,
      name: { th: source.nameTh, en: source.nameEn },
      email: source.email,
      schoolId,
      programId,
      ...(source.personalEmail ? { personalEmail: source.personalEmail } : {}),
      ...(source.courseReference ? { course: source.courseReference } : {}),
      ...(course ? { courseId: String(course._id) } : {}),
      ...(source.semester
        ? { semester: storedSemester(termInput.semester, source.semester) }
        : {}),
      ...(termInput.academicYear !== undefined
        ? { academicYear: termInput.academicYear }
        : {}),
      ...(term ? { academicTermId: String(term._id) } : {}),
      ...(source.admissionYear !== undefined
        ? { admissionYear: source.admissionYear }
        : {}),
      ...(source.company ? { company: source.company } : {}),
      ...(source.province ? { province: source.province } : {})
    }

    const existing = existingByStudentId.get(source.studentId)
    if (
      existing &&
      !actorCanManageStudentScope(actor, existing.schoolId, existing.programId)
    ) {
      return {
        rowKey: source.key,
        sheet: source.sheet,
        rowNumber: source.rowNumber,
        sourceRowHash,
        sourcePreview,
        action: 'invalid',
        status: 'pending',
        issues: [
          issue(
            'ROW_OUT_OF_SCOPE',
            'scope',
            'Row is outside your import scope.'
          )
        ],
        warnings,
        changes: [],
        expiresAt
      }
    }
    if (existing?.status === 'archived') {
      issues.push(
        issue(
          'STUDENT_ARCHIVED',
          'studentId',
          'Archived student records cannot be reactivated by import.'
        )
      )
    }

    const changes = existing ? diffPayload(existing, payload) : []
    const action =
      issues.length > 0
        ? 'invalid'
        : !existing
          ? 'create'
          : changes.length === 0
            ? 'unchanged'
            : 'update'
    if (issues.length > 0) {
      return {
        rowKey: source.key,
        sheet: source.sheet,
        rowNumber: source.rowNumber,
        sourceRowHash,
        sourcePreview,
        action,
        status: 'pending',
        payload,
        issues,
        warnings,
        changes,
        ...(existing
          ? {
              expectedStudentId: existing.id,
              expectedUpdatedAt: existing.updatedAt,
              expectedPayloadHash: studentPayloadHash(existing)
            }
          : {}),
        expiresAt
      }
    }
    return {
      rowKey: source.key,
      sheet: source.sheet,
      rowNumber: source.rowNumber,
      sourceRowHash,
      sourcePreview,
      action,
      status: 'pending',
      ...(action === 'create' || action === 'update' ? { payload } : {}),
      issues,
      warnings,
      changes,
      ...(existing
        ? {
            expectedStudentId: existing.id,
            expectedUpdatedAt: existing.updatedAt,
            expectedPayloadHash: studentPayloadHash(existing)
          }
        : {}),
      expiresAt
    }
  }

  private async commitRow(
    actor: AuthenticatedActor,
    batchId: string,
    commitId: string,
    decision: StudentImportDecision,
    requestId: string
  ): Promise<'created' | 'updated' | 'unchanged'> {
    try {
      return await this.connection.transaction(async (session) => {
        const now = new Date()
        const batch = await this.batches
          .findOne({
            _id: batchId,
            actorId: actor.id,
            expiresAt: { $gt: now }
          })
          .session(session)
          .exec()
        if (!batch) throw new NotFoundException({ code: 'RESOURCE_NOT_FOUND' })
        const row = await this.rows
          .findOne({ _id: decision.rowId, batchId, actorId: actor.id })
          .session(session)
          .exec()
        if (!row) throw new NotFoundException({ code: 'RESOURCE_NOT_FOUND' })
        if (row.status === 'committed') {
          if (
            row.confirmedAction !== decision.action ||
            (row.outcome !== 'created' && row.outcome !== 'updated')
          ) {
            throw new ConflictException({
              code: 'IMPORT_ROW_ALREADY_COMMITTED'
            })
          }
          await this.setCommitDecisionOutcome(
            commitId,
            decision.rowId,
            row.outcome,
            session
          )
          return row.outcome
        }
        if (
          row.status !== 'pending' ||
          row.action !== decision.action ||
          (row.action !== 'create' && row.action !== 'update') ||
          row.issues.length > 0 ||
          !row.payload
        ) {
          throw new ConflictException({ code: 'IMPORT_ROW_NOT_COMMITTABLE' })
        }

        const payload = row.payload as ImportPayload
        if (
          !actorCanManageStudentScope(
            actor,
            payload.schoolId,
            payload.programId
          )
        ) {
          throw new NotFoundException({ code: 'RESOURCE_NOT_FOUND' })
        }
        let outcome: 'created' | 'updated'
        if (decision.action === 'create') {
          const exists = await this.students
            .findOne({ studentId: payload.studentId })
            .session(session)
            .exec()
          if (exists) {
            throw new ConflictException({ code: 'IMPORT_ROW_CHANGED' })
          }
          await new this.students({
            ...payload,
            status: 'active',
            evaluationStatus: 'awaiting_evaluator'
          }).save({ session })
          outcome = 'created'
        } else {
          const existing = await this.students
            .findOne({
              _id: row.expectedStudentId,
              studentId: payload.studentId,
              updatedAt: row.expectedUpdatedAt
            })
            .session(session)
            .exec()
          if (
            !existing ||
            existing.status !== 'active' ||
            studentPayloadHash(existing) !== row.expectedPayloadHash ||
            !actorCanManageStudentScope(
              actor,
              existing.schoolId,
              existing.programId
            )
          ) {
            throw new ConflictException({ code: 'IMPORT_ROW_CHANGED' })
          }
          const update = toStudentUpdate(payload)
          const result = await this.students.updateOne(
            { _id: existing.id, updatedAt: row.expectedUpdatedAt },
            { $set: update },
            { runValidators: true, session }
          )
          if (result.matchedCount !== 1) {
            throw new ConflictException({ code: 'IMPORT_ROW_CHANGED' })
          }
          outcome = 'updated'
        }

        const rowUpdate = await this.rows.updateOne(
          { _id: row.id, batchId, actorId: actor.id, status: 'pending' },
          {
            $set: {
              status: 'committed',
              confirmedAction: decision.action,
              outcome
            },
            $unset: {
              payload: '',
              changes: '',
              expectedStudentId: '',
              expectedUpdatedAt: '',
              expectedPayloadHash: ''
            }
          },
          { session }
        )
        if (rowUpdate.matchedCount !== 1) {
          throw new ConflictException({ code: 'IMPORT_ROW_CHANGED' })
        }
        await this.setCommitDecisionOutcome(
          commitId,
          decision.rowId,
          outcome,
          session
        )
        await this.auditService.record(
          {
            requestId,
            actorId: actor.id,
            actorEmail: actor.email,
            action: `students.import.${outcome}`,
            route: 'POST /api/v2/students/imports/:batchId/commit',
            method: 'POST',
            metadata: { batchId, rowId: row.id, commitId, outcome }
          },
          session
        )
        return outcome
      })
    } catch (error) {
      if (isDuplicateKeyError(error)) {
        throw new ConflictException({ code: 'IMPORT_ROW_CHANGED' })
      }
      throw error
    }
  }

  private async setCommitDecisionOutcome(
    commitId: string,
    rowId: string,
    outcome: 'created' | 'updated' | 'unchanged',
    session: ClientSession
  ): Promise<void> {
    const result = await this.commits.updateOne(
      { _id: commitId, 'decisions.rowId': rowId },
      { $set: { 'decisions.$.outcome': outcome } },
      { session }
    )
    if (result.matchedCount !== 1) {
      throw new ConflictException({ code: 'IMPORT_COMMIT_RETRY' })
    }
  }

  private async markBatchCompleted(
    batchId: string,
    actorId: string
  ): Promise<void> {
    const pendingRows = await this.rows.countDocuments({
      batchId,
      actorId,
      action: { $in: ['create', 'update'] },
      status: 'pending'
    })
    if (pendingRows === 0) {
      await this.batches.updateOne(
        { _id: batchId, actorId },
        { $set: { status: 'committed' } }
      )
    }
  }

  private async getBatchResponse(
    actor: AuthenticatedActor,
    batchId: string
  ): Promise<unknown> {
    const batch = await this.findActiveBatch(actor.id, batchId)
    if (!batch) throw new NotFoundException({ code: 'RESOURCE_NOT_FOUND' })
    const rows = await this.rows
      .find({ batchId, actorId: actor.id })
      .sort({ rowNumber: 1, _id: 1 })
      .exec()
    const summary = {
      total: rows.length,
      creates: rows.filter((row) => row.action === 'create').length,
      updates: rows.filter((row) => row.action === 'update').length,
      unchanged: rows.filter((row) => row.action === 'unchanged').length,
      invalid: rows.filter((row) => row.action === 'invalid').length,
      warnings: rows.filter((row) => row.warnings.length > 0).length,
      committed: rows.filter((row) => row.status === 'committed').length
    }
    return {
      batchId: batch.id,
      sourceName: batch.sourceName,
      checksum: batch.checksum,
      expiresAt: batch.expiresAt.toISOString(),
      status: batch.status,
      questionFieldsDetected: batch.questionFields,
      summary,
      items: rows.map((row) => ({
        id: row.id,
        sheet: row.sheet,
        rowNumber: row.rowNumber,
        student: {
          ...(row.sourcePreview ?? {}),
          ...(row.payload ? publicStudentPayload(row.payload) : {})
        },
        action: row.action,
        status: row.status,
        outcome: row.outcome,
        issues: row.issues,
        warnings: row.warnings,
        changes: row.changes
      }))
    }
  }

  private findActiveBatch(
    actorId: string,
    batchId: string
  ): Promise<HydratedDocument<StudentImportBatchRecord> | null> {
    return this.batches
      .findOne({ _id: batchId, actorId, expiresAt: { $gt: new Date() } })
      .exec()
  }
}

function assertSupportedWorkbook(sourceName: string, buffer: Buffer): void {
  const extension = basename(sourceName.replaceAll('\\', '/'))
    .toLowerCase()
    .split('.')
    .pop()
  const zipSignature =
    buffer.length >= 4 &&
    buffer[0] === 0x50 &&
    buffer[1] === 0x4b &&
    [0x03, 0x05, 0x07].includes(buffer[2] ?? -1) &&
    [0x04, 0x06, 0x08].includes(buffer[3] ?? -1)
  if (extension === 'xlsx' && zipSignature) return
  if (extension === 'csv' && !buffer.includes(0) && isUtf8(buffer)) {
    return
  }
  throw new UnprocessableEntityException({ code: 'WORKBOOK_TYPE_INVALID' })
}

function isUtf8(buffer: Buffer): boolean {
  try {
    new TextDecoder('utf-8', { fatal: true }).decode(buffer)
    return true
  } catch {
    return false
  }
}

function sanitizeSourceName(value: string): string {
  return basename(value.replaceAll('\\', '/'))
    .split('')
    .filter((character) => {
      const code = character.charCodeAt(0)
      return code > 31 && code !== 127
    })
    .join('')
    .slice(0, 120)
}

function findMaster(
  records: readonly Record<string, unknown>[],
  value: string,
  fields: readonly string[]
): Record<string, unknown> | undefined {
  const needle = normalizeLabel(value)
  const matches = records.filter((record) => {
    const candidates = fields.flatMap((field) => {
      const candidate = record[field]
      if (candidate && typeof candidate === 'object') {
        return Object.values(candidate as Record<string, unknown>)
      }
      return [candidate]
    })
    return candidates.some((candidate) => normalizeLabel(toText(candidate)) === needle)
  })
  return matches.length === 1 ? matches[0] : undefined
}

function normalizeLabel(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/^school of\s+/, '')
    .replace(/\s+/g, ' ')
}

function normalizeSemester(value: unknown): string {
  const normalized = normalizeLabel(toText(value))
  if (['1', 'first', 'ต้น', 'ภาคการศึกษาต้น'].includes(normalized)) return '1'
  if (['2', 'second', 'ปลาย', 'ภาคการศึกษาปลาย'].includes(normalized))
    return '2'
  if (
    ['3', 'third', 'summer', 'ภาคการศึกษาฤดูร้อน'].includes(normalized) ||
    normalized.includes('ฤดูร้อน')
  ) {
    return '3'
  }
  return normalized
}

function parseSemesterYear(
  sourceSemester: string | undefined,
  sourceYear: number | undefined
): { semester?: string; academicYear?: number; conflict: boolean } {
  if (!sourceSemester) {
    return {
      ...(sourceYear !== undefined ? { academicYear: sourceYear } : {}),
      conflict: false
    }
  }
  const match = sourceSemester.match(
    /^\s*([123]|first|second|third|summer)\s*[-/]\s*(\d{4})\s*$/i
  )
  if (!match) {
    return {
      semester: normalizeSemester(sourceSemester),
      ...(sourceYear !== undefined ? { academicYear: sourceYear } : {}),
      conflict: false
    }
  }
  const semester = normalizeSemester(match[1])
  const year = Number(match[2])
  return {
    semester,
    academicYear: sourceYear ?? year,
    conflict: sourceYear !== undefined && sourceYear !== year
  }
}

function storedSemester(semester: string | undefined, raw: string): string {
  if (semester === '1') return 'ภาคการศึกษาต้น'
  if (semester === '2') return 'ภาคการศึกษาปลาย'
  if (semester === '3') return 'ภาคการศึกษาฤดูร้อน'
  return raw
}

function issue(
  code: string,
  field: string,
  message: string
): StudentImportIssue {
  return { code, field, message }
}

function actorCanManageStudentScope(
  actor: AuthenticatedActor,
  schoolId: string,
  programId: string
): boolean {
  if (actor.roles.includes('systemAdmin')) return true
  const scopes = actor.roleScopes
    ? actor.roleScopes.filter((scope) => scope.role === 'internshipStaff')
    : actor.roles.includes('internshipStaff')
      ? [
          {
            tenant: actor.scope.tenant,
            schoolIds: actor.scope.schoolIds,
            programIds: actor.scope.programIds
          }
        ]
      : []
  return scopes.some((scope) => {
    if (scope.tenant) return true
    const hasSchool = scope.schoolIds.length > 0
    const hasProgram = scope.programIds.length > 0
    return (
      (hasSchool || hasProgram) &&
      (!hasSchool || scope.schoolIds.includes(schoolId)) &&
      (!hasProgram || scope.programIds.includes(programId))
    )
  })
}

function diffPayload(
  existing: HydratedDocument<StudentRecord>,
  payload: ImportPayload
): Record<string, unknown>[] {
  const current = existing.toObject() as unknown as Record<string, unknown>
  const fields = Object.keys(payload)
  return fields.flatMap((field) => {
    const before = current[field]
    const after = payload[field]
    if (stableValue(before) === stableValue(after)) return []
    return [
      { field, before: safeDiffValue(before), after: safeDiffValue(after) }
    ]
  })
}

function studentPayloadHash(student: HydratedDocument<StudentRecord>): string {
  const value = student.toObject() as unknown as Record<string, unknown>
  return requestHash({
    studentId: value.studentId,
    name: value.name,
    email: value.email,
    personalEmail: value.personalEmail,
    schoolId: value.schoolId,
    programId: value.programId,
    courseId: value.courseId,
    course: value.course,
    academicTermId: value.academicTermId,
    semester: value.semester,
    academicYear: value.academicYear,
    admissionYear: value.admissionYear,
    company: value.company,
    province: value.province
  })
}

function toStudentUpdate(payload: ImportPayload): Record<string, unknown> {
  return { ...payload }
}

function publicStudentPayload(
  payload: Record<string, unknown>
): Record<string, unknown> {
  return {
    studentId: payload.studentId,
    name: payload.name,
    email: payload.email,
    ...(payload.personalEmail ? { personalEmail: payload.personalEmail } : {}),
    schoolId: payload.schoolId,
    programId: payload.programId,
    ...(payload.course ? { course: payload.course } : {}),
    ...(payload.semester ? { semester: payload.semester } : {}),
    ...(payload.academicYear ? { academicYear: payload.academicYear } : {}),
    ...(payload.company ? { company: payload.company } : {}),
    ...(payload.province ? { province: payload.province } : {})
  }
}

function publicSourcePreview(
  source: StudentImportSourceRow
): Record<string, unknown> {
  return {
    studentId: source.studentId,
    name: { th: source.nameTh, en: source.nameEn },
    email: source.email,
    schoolReference: source.schoolReference,
    programReference: source.programReference,
    ...(source.courseReference ? { course: source.courseReference } : {}),
    ...(source.semester ? { semester: source.semester } : {}),
    ...(source.company ? { company: source.company } : {}),
    ...(source.province ? { province: source.province } : {}),
    ...(source.admissionYear !== undefined
      ? { admissionYear: source.admissionYear }
      : {})
  }
}

function safeDiffValue(value: unknown): unknown {
  if (value instanceof Date) return value.toISOString()
  if (value && typeof value === 'object' && '_id' in value) {
    return String(value._id)
  }
  return value
}

function stableValue(value: unknown): string {
  return JSON.stringify(value, (_key, item: unknown) =>
    item instanceof Date ? item.toISOString() : item
  )
}

function isDuplicateKeyError(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    error.code === 11000
  )
}
