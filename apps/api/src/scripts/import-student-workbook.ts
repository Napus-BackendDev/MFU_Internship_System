import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { basename, resolve } from 'node:path'

import { loadEnvironment } from '@internship/config'
import { MongoClient, ObjectId, type Db } from 'mongodb'

import {
  parseStudentWorkbook,
  type StudentImportSourceRow
} from '../members/student-import.parser.js'

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
const parsed = parseStudentWorkbook(sourceBuffer)

const client = new MongoClient(environment.MONGODB_URI)
await client.connect()

try {
  const database = client.db()
  const resolution = await resolveRows(database, parsed.rows)
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

interface ImportIssue {
  readonly sheet: string
  readonly rowNumber: number
  readonly code: string
  readonly field: string
  readonly message: string
}

interface ResolvedRow {
  readonly source: StudentImportSourceRow
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

async function resolveRows(
  database: Db,
  sourceRows: readonly StudentImportSourceRow[]
): Promise<{
  rows: ResolvedRow[]
  issues: ImportIssue[]
  warnings: ImportIssue[]
}> {
  const issues: ImportIssue[] = sourceRows.flatMap((row) =>
    row.issues.map((issue) => ({
      sheet: row.sheet,
      rowNumber: row.rowNumber,
      code: issue.code,
      field: issue.field,
      message: issue.message
    }))
  )
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

    let school: Record<string, unknown> | undefined
    let program: Record<string, unknown> | undefined

    if (source.schoolReference) {
      school = findMaster(schools, source.schoolReference, [
        'schoolCode',
        'name'
      ])
    }

    if (school) {
      const currentSchool = school
      if (source.programReference) {
        program = programs.find(
          (candidate) =>
            String(candidate.schoolId) === String(currentSchool._id) &&
            matchesMaster(candidate, source.programReference, [
              'programCode',
              'name'
            ])
        )
      }
    } else if (source.programReference) {
      const programMatches = programs.filter((candidate) =>
        matchesMaster(candidate, source.programReference, [
          'programCode',
          'name'
        ])
      )
      if (programMatches.length === 1 && programMatches[0]) {
        const matchedProgram = programMatches[0]
        program = matchedProgram
        school = schools.find(
          (candidate) => String(candidate._id) === String(matchedProgram.schoolId)
        )
      }
    }

    if (!school) {
      issues.push(
        masterIssue(
          source,
          'SCHOOL_NOT_FOUND',
          'School',
          source.schoolReference || source.programReference
        )
      )
      continue
    }

    if (!program) {
      issues.push(
        masterIssue(
          source,
          'PROGRAM_NOT_FOUND',
          'Programe',
          source.programReference
        )
      )
      continue
    }

    const name =
      source.nameTh && source.nameEn
        ? { th: source.nameTh, en: source.nameEn }
        : source.name || source.nameTh || source.nameEn

    const document: Record<string, unknown> = {
      studentId: source.studentId,
      name,
      email: source.email,
      schoolId: String(school._id),
      programId: String(program._id),
      semester: formatStoredSemester(source.semester),
      company: source.company,
      course: source.courseReference
    }

    const course = source.courseReference
      ? findMaster(courses, source.courseReference, ['courseCode', 'name'])
      : undefined
    if (course) {
      document.courseId = String(course._id)
    } else if (source.courseReference) {
      warnings.push(
        masterIssue(
          source,
          'COURSE_NOT_FOUND',
          'Course',
          source.courseReference
        )
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
    } else if (source.academicYear || source.semester) {
      warnings.push(
        masterIssue(
          source,
          'TERM_NOT_FOUND',
          'Academic term',
          `${source.academicYear ?? '-'}/${source.semester ?? '-'}`
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
  value: string,
  fields: readonly string[] = [
    'schoolCode',
    'programCode',
    'courseCode',
    'code',
    'name'
  ]
): Record<string, unknown> | undefined {
  return records.find((record) => matchesMaster(record, value, fields))
}

function matchesMaster(
  record: Record<string, unknown>,
  value: string,
  fields: readonly string[] = [
    'schoolCode',
    'programCode',
    'courseCode',
    'code',
    'name'
  ]
): boolean {
  const needle = normalizeLabel(value)
  const candidates = fields.flatMap((field) => {
    const candidate = record[field]
    if (candidate && typeof candidate === 'object') {
      return Object.values(candidate as Record<string, unknown>)
    }
    return [candidate]
  })
  return candidates
    .filter((candidate) => candidate !== undefined && candidate !== null)
    .some((candidate) => normalizeLabel(toText(candidate)) === needle)
}

function normalizeLabel(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/^school of\s+/i, '')
    .replace(/^สำนักวิชา\s*/, '')
    .replace(/^หลักสูตร\s*/, '')
    .replace(/^สาขาวิชา\s*/, '')
    .replace(/^สาขา\s*/, '')
    .replace(/&/g, 'and')
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

function formatStoredSemester(value: unknown): string {
  const norm = normalizeSemester(value)
  if (norm === '1') return 'ภาคการศึกษาต้น'
  if (norm === '2') return 'ภาคการศึกษาปลาย'
  if (norm === '3') return 'ภาคการศึกษาฤดูร้อน'
  return toText(value) || 'ภาคการศึกษาต้น'
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

function masterIssue(
  row: StudentImportSourceRow,
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
    rows: readonly StudentImportSourceRow[]
    questionFields: readonly string[]
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
          status: 'active'
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
