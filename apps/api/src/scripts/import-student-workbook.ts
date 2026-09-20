import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { basename, resolve } from 'node:path'

import { loadEnvironment } from '@internship/config'
import { MongoClient, ObjectId, type Db } from 'mongodb'
import * as XLSX from 'xlsx'

if (!process.env.NODE_ENV) process.env.NODE_ENV = 'development'
try {
  process.loadEnvFile('../../.env.development')
} catch {
  // Explicit environment variables remain authoritative.
}

const environment = loadEnvironment(process.env)
if (environment.NODE_ENV !== 'development') {
  throw new Error(
    'Student workbook import is disabled outside NODE_ENV=development.'
  )
}

const sourceSheets = ['Data2', 'Eng', 'BA'] as const
const requestedFile = argumentValue('--file')
if (!requestedFile) {
  throw new Error(
    'Usage: pnpm import:students -- --file <workbook.xlsx> [--commit] [--allow-partial]'
  )
}

const filePath = resolve(requestedFile)
const shouldCommit = hasFlag('--commit')
const allowPartial = hasFlag('--allow-partial')
const sourceBuffer = readFileSync(filePath)
const checksum = createHash('sha256').update(sourceBuffer).digest('hex')
const workbook = XLSX.read(sourceBuffer, { cellDates: true })
const parsed = parseWorkbook(workbook)

const client = new MongoClient(environment.MONGODB_URI)
await client.connect()

try {
  const database = client.db()
  const resolution = await resolveRows(database, parsed.rows, parsed.issues)
  const summary = createSummary(filePath, checksum, parsed, resolution)

  process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`)

  if (!shouldCommit) {
    process.stdout.write('Dry-run only. No student data changed.\n')
  } else if (
    resolution.rows.length === 0 ||
    (summary.invalid > 0 && !allowPartial)
  ) {
    throw new Error(
      summary.invalid > 0
        ? 'Commit stopped: unresolved rows remain. Re-run with --allow-partial only after reviewing the dry-run.'
        : 'Commit stopped: no valid rows found.'
    )
  } else {
    const result = await commitRows(
      database,
      resolution.rows,
      checksum,
      summary
    )
    process.stdout.write(`${JSON.stringify({ committed: result }, null, 2)}\n`)
  }
} finally {
  await client.close()
}

interface SourceRow {
  readonly sheet: string
  readonly rowNumber: number
  readonly studentId: string
  readonly nameTh: string
  readonly nameEn: string
  readonly email: string
  readonly programName: string
  readonly schoolName: string
  readonly courseName: string
  readonly company: string
  readonly semester: string
  readonly academicYear: number
  readonly questionFields: readonly string[]
}

interface ImportIssue {
  readonly sheet: string
  readonly rowNumber: number
  readonly code: string
  readonly field: string
  readonly message: string
}

interface ResolvedRow {
  readonly source: SourceRow
  readonly document: Record<string, unknown>
  readonly action: 'create' | 'update'
  readonly warnings: readonly string[]
}

interface ImportSummary {
  readonly sourceFile: string
  readonly sha256: string
  readonly sourceRows: number
  readonly valid: number
  readonly invalid: number
  readonly creates: number
  readonly updates: number
  readonly warnings: number
  readonly questionFieldsDetected: readonly string[]
  readonly situationFieldsDetected: readonly string[]
  readonly issues: readonly ImportIssue[]
  readonly warningDetails: readonly ImportIssue[]
}

function argumentValue(name: string): string | undefined {
  const index = process.argv.indexOf(name)
  const value = index >= 0 ? process.argv[index + 1] : undefined
  return value && !value.startsWith('--') ? value : undefined
}

function hasFlag(name: string): boolean {
  return process.argv.includes(name)
}

function parseWorkbook(workbook: XLSX.WorkBook): {
  rows: SourceRow[]
  issues: ImportIssue[]
  questionFields: string[]
} {
  const rows: SourceRow[] = []
  const issues: ImportIssue[] = []
  const questionFields = new Set<string>()

  for (const sheet of sourceSheets) {
    const worksheet = workbook.Sheets[sheet]
    if (!worksheet) {
      issues.push({
        sheet,
        rowNumber: 1,
        code: 'SHEET_MISSING',
        field: 'sheet',
        message: `Required sheet ${sheet} was not found.`
      })
      continue
    }

    const records = XLSX.utils.sheet_to_json<Record<string, unknown>>(
      worksheet,
      {
        defval: null,
        raw: true
      }
    )

    records.forEach((record, index) => {
      const rowNumber = index + 2
      if (toText(record.ID) === '') return

      const source = {
        sheet,
        rowNumber,
        studentId: normalizeStudentId(record.ID),
        nameTh: toText(record['Name-Surname (Thai)']),
        nameEn: toText(record['Name-Surname']),
        email: toText(record.Email).toLowerCase(),
        programName: toText(record.Programe),
        schoolName: toText(record.School),
        courseName: toText(record.Course),
        company: toText(record['Organization name']),
        semester: toText(record.Semester),
        academicYear: toNumber(record.Year),
        questionFields: Object.keys(record).filter((key) =>
          /^(Hard|HS|HM|HA|HSD|SS|SM|SA|SSD)/i.test(key)
        )
      } satisfies SourceRow

      source.questionFields.forEach((field) => questionFields.add(field))
      validateSourceRow(source, issues)
      rows.push(source)
    })
  }

  const seen = new Map<string, SourceRow>()
  for (const row of rows) {
    const previous = seen.get(row.studentId)
    if (previous) {
      issues.push({
        sheet: row.sheet,
        rowNumber: row.rowNumber,
        code: 'DUPLICATE_SOURCE_ID',
        field: 'ID',
        message: `Student ID duplicates ${previous.sheet}:${previous.rowNumber}.`
      })
    } else {
      seen.set(row.studentId, row)
    }
  }

  return { rows, issues, questionFields: [...questionFields].sort() }
}

function validateSourceRow(row: SourceRow, issues: ImportIssue[]): void {
  const required: readonly [keyof SourceRow, string][] = [
    ['studentId', 'ID'],
    ['nameTh', 'Name-Surname (Thai)'],
    ['nameEn', 'Name-Surname'],
    ['email', 'Email'],
    ['programName', 'Programe'],
    ['schoolName', 'School'],
    ['company', 'Organization name'],
    ['semester', 'Semester']
  ]

  for (const [key, field] of required) {
    if (row[key] === '') {
      issues.push({
        sheet: row.sheet,
        rowNumber: row.rowNumber,
        code: 'REQUIRED_VALUE_MISSING',
        field,
        message: `${field} is required.`
      })
    }
  }

  if (!/^\d{7,20}$/.test(row.studentId)) {
    issues.push({
      sheet: row.sheet,
      rowNumber: row.rowNumber,
      code: 'INVALID_STUDENT_ID',
      field: 'ID',
      message: 'Student ID must contain only 7-20 digits.'
    })
  }

  if (!/^\S+@\S+\.\S+$/.test(row.email)) {
    issues.push({
      sheet: row.sheet,
      rowNumber: row.rowNumber,
      code: 'INVALID_EMAIL',
      field: 'Email',
      message: 'Email format is invalid.'
    })
  }
}

async function resolveRows(
  database: Db,
  sourceRows: readonly SourceRow[],
  sourceIssues: readonly ImportIssue[]
): Promise<{
  rows: ResolvedRow[]
  issues: ImportIssue[]
  warnings: ImportIssue[]
}> {
  const issues = [...sourceIssues]
  const warnings: ImportIssue[] = []
  const [schools, programs, courses, terms, existingStudents] =
    await Promise.all([
      database.collection('schools').find({}).toArray(),
      database.collection('programs').find({}).toArray(),
      database.collection('courses').find({}).toArray(),
      database.collection('academicTerms').find({}).toArray(),
      database
        .collection('students')
        .find({ studentId: { $in: sourceRows.map((row) => row.studentId) } })
        .project({ studentId: 1 })
        .toArray()
    ])

  const existingIds = new Set(
    existingStudents.map((student) => String(student.studentId))
  )
  const resolved: ResolvedRow[] = []
  const invalidRowKeys = new Set(
    issues.map((issue) => `${issue.sheet}:${issue.rowNumber}`)
  )

  for (const source of sourceRows) {
    const rowKey = `${source.sheet}:${source.rowNumber}`
    if (invalidRowKeys.has(rowKey)) continue

    const school = findMaster(schools, source.schoolName)
    if (!school) {
      issues.push(
        masterIssue(source, 'SCHOOL_NOT_FOUND', 'School', source.schoolName)
      )
      continue
    }

    const program = programs.find(
      (candidate) =>
        String(candidate.schoolId) === String(school._id) &&
        matchesMaster(candidate, source.programName)
    )
    if (!program) {
      issues.push(
        masterIssue(source, 'PROGRAM_NOT_FOUND', 'Programe', source.programName)
      )
      continue
    }

    const document: Record<string, unknown> = {
      studentId: source.studentId,
      name: { th: source.nameTh, en: source.nameEn },
      email: source.email,
      schoolId: String(school._id),
      programId: String(program._id),
      semester: formatStoredSemester(source.semester),
      company: source.company,
      course: source.courseName
    }

    const course = findMaster(courses, source.courseName)
    if (course) {
      document.courseId = String(course._id)
    } else {
      warnings.push(
        masterIssue(source, 'COURSE_NOT_FOUND', 'Course', source.courseName)
      )
    }

    const term = terms.find(
      (candidate) =>
        Number(candidate.academicYear) === source.academicYear &&
        normalizeSemester(candidate.semester) ===
          normalizeSemester(source.semester)
    )
    if (term) {
      document.academicTermId = String(term._id)
    } else {
      warnings.push(
        masterIssue(
          source,
          'TERM_NOT_FOUND',
          'Academic term',
          `${source.academicYear}/${source.semester}`
        )
      )
    }

    resolved.push({
      source,
      document,
      action: existingIds.has(source.studentId) ? 'update' : 'create',
      warnings: warnings
        .filter(
          (warning) =>
            warning.sheet === source.sheet &&
            warning.rowNumber === source.rowNumber
        )
        .map((warning) => warning.code)
    })
  }

  return { rows: resolved, issues, warnings }
}

function findMaster(
  records: readonly Record<string, unknown>[],
  value: string
): Record<string, unknown> | undefined {
  return records.find((record) => matchesMaster(record, value))
}

function matchesMaster(
  record: Record<string, unknown>,
  value: string
): boolean {
  const name = record.name
  const names =
    name && typeof name === 'object'
      ? Object.values(name as Record<string, unknown>)
      : []
  return [
    record.schoolCode,
    record.programCode,
    record.courseCode,
    record.code,
    ...names
  ]
    .filter((candidate) => candidate !== undefined && candidate !== null)
    .some(
      (candidate) => normalizeLabel(toText(candidate)) === normalizeLabel(value)
    )
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
  if (
    normalized === 'first' ||
    normalized === 'ภาคการศึกษาต้น' ||
    normalized === '1'
  )
    return '1'
  if (
    normalized === 'second' ||
    normalized === 'ภาคการศึกษาปลาย' ||
    normalized === '2'
  )
    return '2'
  return normalized
}

function formatStoredSemester(value: unknown): string {
  const norm = normalizeSemester(value)
  if (norm === '1') return 'ภาคการศึกษาต้น'
  if (norm === '2') return 'ภาคการศึกษาปลาย'
  if (norm === '3') return 'ภาคการศึกษาฤดูร้อน'
  return toText(value) || 'ภาคการศึกษาต้น'
}

function normalizeStudentId(value: unknown): string {
  return toText(value).replace(/\.0$/, '')
}

function toText(value: unknown): string {
  if (value === null || value === undefined) return ''
  if (value instanceof Date) return value.toISOString()
  if (
    typeof value === 'string' ||
    typeof value === 'number' ||
    typeof value === 'boolean'
  ) {
    return String(value).trim()
  }
  return ''
}

function toNumber(value: unknown): number {
  const number = Number(value)
  return Number.isFinite(number) ? number : 0
}

function masterIssue(
  row: SourceRow,
  code: string,
  field: string,
  value: string
): ImportIssue {
  return {
    sheet: row.sheet,
    rowNumber: row.rowNumber,
    code,
    field,
    message: `${field} ${value} was not found in existing master data.`
  }
}

function createSummary(
  filePath: string,
  checksum: string,
  parsed: {
    rows: SourceRow[]
    issues: ImportIssue[]
    questionFields: string[]
  },
  resolution: {
    rows: ResolvedRow[]
    issues: ImportIssue[]
    warnings: ImportIssue[]
  }
): ImportSummary {
  const allIssues = [...resolution.issues]
  const sourceRowKeys = new Set(
    parsed.rows.map((row) => `${row.sheet}:${row.rowNumber}`)
  )
  const invalidRowKeys = new Set(
    allIssues.map((issue) => `${issue.sheet}:${issue.rowNumber}`)
  )

  return {
    sourceFile: basename(filePath),
    sha256: checksum,
    sourceRows: parsed.rows.length,
    valid: resolution.rows.length,
    invalid: [...invalidRowKeys].filter((key) => sourceRowKeys.has(key)).length,
    creates: resolution.rows.filter((row) => row.action === 'create').length,
    updates: resolution.rows.filter((row) => row.action === 'update').length,
    warnings: resolution.warnings.length,
    questionFieldsDetected: parsed.questionFields,
    situationFieldsDetected: parsed.questionFields.filter((field) =>
      /situation|scenario/i.test(field)
    ),
    issues: allIssues,
    warningDetails: resolution.warnings
  }
}

async function commitRows(
  database: Db,
  rows: readonly ResolvedRow[],
  checksum: string,
  summary: ImportSummary
): Promise<Record<string, unknown>> {
  const now = new Date()
  const operations = rows.map((row) => ({
    updateOne: {
      filter: { studentId: row.source.studentId },
      update: {
        $set: { ...row.document, updatedAt: now },
        $setOnInsert: {
          _id: new ObjectId(),
          createdAt: now,
          status: 'active',
          evaluationStatus: 'awaiting_evaluator'
        }
      },
      upsert: true
    }
  }))

  const result = await database.collection('students').bulkWrite(operations, {
    ordered: false
  })
  await database.collection('auditLogs').updateOne(
    { requestId: `student-import:${checksum}` },
    {
      $set: {
        requestId: `student-import:${checksum}`,
        actorId: 'script:student-workbook-import',
        actorEmail: 'script@localhost',
        action: 'IMPORT_STUDENTS',
        route: 'script://student-workbook-import',
        method: 'BULK',
        outcome: 'success',
        metadata: {
          sourceFile: summary.sourceFile,
          checksum,
          imported: rows.length,
          invalid: summary.invalid,
          warnings: summary.warnings
        },
        createdAt: now
      },
      $setOnInsert: { _id: new ObjectId() }
    },
    { upsert: true }
  )

  return {
    matched: result.matchedCount,
    modified: result.modifiedCount,
    upserted: result.upsertedCount,
    audited: true
  }
}
