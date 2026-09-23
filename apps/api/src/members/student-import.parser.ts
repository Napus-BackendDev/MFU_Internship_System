import * as XLSX from 'xlsx'

export const STUDENT_IMPORT_MAX_ROWS = 1000
const STUDENT_IMPORT_MAX_SHEETS = 20
const STUDENT_IMPORT_MAX_COLUMNS = 200

export interface StudentImportSourceRow {
  readonly key: string
  readonly sheet: string
  readonly rowNumber: number
  readonly studentId: string
  readonly nameTh: string
  readonly nameEn: string
  readonly email: string
  readonly personalEmail?: string
  readonly schoolReference: string
  readonly programReference: string
  readonly courseReference?: string
  readonly semester?: string
  readonly academicYear?: number
  readonly admissionYear?: number
  readonly company?: string
  readonly province?: string
  readonly questionFields: readonly string[]
  readonly issues: readonly StudentImportIssue[]
}

export interface StudentImportIssue {
  readonly code: string
  readonly field: string
  readonly message: string
}

export interface ParsedStudentWorkbook {
  readonly rows: readonly StudentImportSourceRow[]
  readonly questionFields: readonly string[]
}

const HEADER_ALIASES = {
  studentId: [
    'studentId',
    'รหัสนักศึกษา',
    'รหัสนักศึกษา (studentId)',
    'Student ID',
    'ID'
  ],
  nameTh: [
    'nameTh',
    'Name-Surname (Thai)',
    'ชื่อ-นามสกุลไทย',
    'ชื่อ-นามสกุลไทย (nameTh)',
    'ชื่อไทย',
    'ชื่อ'
  ],
  nameEn: [
    'nameEn',
    'Name-Surname',
    'ชื่อ-นามสกุลอังกฤษ',
    'ชื่อ-นามสกุลอังกฤษ (nameEn)',
    'ชื่ออังกฤษ',
    'Name EN'
  ],
  email: [
    'email',
    'Email',
    'อีเมล',
    'อีเมล (email)',
    'อีเมลนักศึกษา',
    'อีเมลนักศึกษา (email)'
  ],
  personalEmail: [
    'personalEmail',
    'Personal Email',
    'อีเมลส่วนตัว',
    'อีเมลส่วนตัว (personalEmail)'
  ],
  school: [
    'schoolCode',
    'School',
    'school',
    'รหัสสำนักวิชา',
    'รหัสสำนักวิชา (schoolCode)',
    'สำนักวิชา'
  ],
  program: [
    'programCode',
    'Program',
    'Programe',
    'program',
    'รหัสหลักสูตร',
    'รหัสหลักสูตร (programCode)',
    'หลักสูตร'
  ],
  course: [
    'courseCode',
    'Course',
    'course',
    'รหัสวิชา',
    'รหัสวิชา (courseCode)',
    'วิชา'
  ],
  semester: [
    'semester',
    'Semester',
    'ภาคการศึกษา',
    'ภาคการศึกษา (semester)',
    'เทอม'
  ],
  academicYear: ['academicYear', 'Year', 'ปีฝึกงาน', 'ปีการศึกษาฝึกงาน'],
  admissionYear: [
    'admissionYear',
    'ปีการศึกษา (admissionYear)',
    'ปีที่เข้าศึกษา',
    'ปี'
  ],
  company: [
    'company',
    'Company',
    'Organization name',
    'สถานประกอบการ',
    'สถานประกอบการ (company)',
    'บริษัท'
  ],
  province: ['province', 'Province', 'จังหวัด', 'จังหวัด (province)']
} as const

export function parseStudentWorkbook(buffer: Buffer): ParsedStudentWorkbook {
  let workbook: XLSX.WorkBook
  try {
    workbook = XLSX.read(buffer, {
      type: 'buffer',
      cellDates: true,
      raw: true,
      sheetRows: STUDENT_IMPORT_MAX_ROWS + 2
    })
  } catch {
    throw new Error('WORKBOOK_INVALID')
  }
  if (workbook.SheetNames.length > STUDENT_IMPORT_MAX_SHEETS) {
    throw new Error('WORKBOOK_SHEET_LIMIT_EXCEEDED')
  }

  const questionFields = new Set<string>()
  const rows: StudentImportSourceRow[] = []
  for (const sheetName of workbook.SheetNames) {
    const sheet = workbook.Sheets[sheetName]
    if (!sheet) continue
    if (sheet['!ref']) {
      const range = XLSX.utils.decode_range(sheet['!ref'])
      if (range.e.c + 1 > STUDENT_IMPORT_MAX_COLUMNS) {
        throw new Error('WORKBOOK_COLUMN_LIMIT_EXCEEDED')
      }
    }
    const records = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, {
      defval: null,
      raw: true,
      blankrows: true
    })

    for (const [index, record] of records.entries()) {
      const studentIdCell = pick(record, HEADER_ALIASES.studentId)
      if (toText(studentIdCell) === '') continue
      const studentId = normalizeStudentId(studentIdCell)
      const email = toText(pick(record, HEADER_ALIASES.email)).toLowerCase()
      const schoolReference = toText(pick(record, HEADER_ALIASES.school))
      const programReference = toText(pick(record, HEADER_ALIASES.program))
      const courseReference = toText(pick(record, HEADER_ALIASES.course))
      const semester = toText(pick(record, HEADER_ALIASES.semester))
      const academicYear = parseYear(pick(record, HEADER_ALIASES.academicYear))
      const admissionYear = parseYear(
        pick(record, HEADER_ALIASES.admissionYear)
      )
      const rowQuestionFields = Object.keys(record).filter((header) =>
        /^(Hard|HS|HM|HA|HSD|SS|SM|SA|SSD)/i.test(header.trim())
      )
      rowQuestionFields.forEach((header) => questionFields.add(header))

      const rowNumber = index + 2
      const issues: StudentImportIssue[] = []
      if (!/^\d{7,20}$/.test(studentId)) {
        issues.push({
          code: 'INVALID_STUDENT_ID',
          field: 'studentId',
          message: 'Student ID must contain 7–20 digits and preserve its value.'
        })
      }
      if (!toText(pick(record, HEADER_ALIASES.nameTh))) {
        issues.push({
          code: 'NAME_THAI_REQUIRED',
          field: 'nameTh',
          message: 'Thai name is required.'
        })
      }
      if (!toText(pick(record, HEADER_ALIASES.nameEn))) {
        issues.push({
          code: 'NAME_ENGLISH_REQUIRED',
          field: 'nameEn',
          message: 'English name is required.'
        })
      }
      if (!/^\S+@\S+\.\S+$/.test(email)) {
        issues.push({
          code: 'INVALID_EMAIL',
          field: 'email',
          message: 'A valid student email is required.'
        })
      }
      const personalEmail = toText(pick(record, HEADER_ALIASES.personalEmail))
      if (personalEmail && !/^\S+@\S+\.\S+$/.test(personalEmail)) {
        issues.push({
          code: 'INVALID_PERSONAL_EMAIL',
          field: 'personalEmail',
          message: 'Personal email format is invalid.'
        })
      }
      if (!schoolReference) {
        issues.push({
          code: 'SCHOOL_REQUIRED',
          field: 'school',
          message: 'School code or name is required; no default is applied.'
        })
      }
      if (!programReference) {
        issues.push({
          code: 'PROGRAM_REQUIRED',
          field: 'program',
          message: 'Program code or name is required; no default is applied.'
        })
      }
      if (
        academicYear === null &&
        hasValue(record, HEADER_ALIASES.academicYear)
      ) {
        issues.push({
          code: 'INVALID_ACADEMIC_YEAR',
          field: 'academicYear',
          message: 'Academic year must be a whole number.'
        })
      }
      if (
        admissionYear === null &&
        hasValue(record, HEADER_ALIASES.admissionYear)
      ) {
        issues.push({
          code: 'INVALID_ADMISSION_YEAR',
          field: 'admissionYear',
          message: 'Admission year must be a whole number.'
        })
      }
      if (rows.length >= STUDENT_IMPORT_MAX_ROWS) {
        throw new Error('WORKBOOK_ROW_LIMIT_EXCEEDED')
      }

      rows.push({
        key: `${sheetName}:${rowNumber}`,
        sheet: sheetName.slice(0, 80),
        rowNumber,
        studentId,
        nameTh: toText(pick(record, HEADER_ALIASES.nameTh)),
        nameEn: toText(pick(record, HEADER_ALIASES.nameEn)),
        email,
        ...(personalEmail
          ? { personalEmail: personalEmail.toLowerCase() }
          : {}),
        schoolReference,
        programReference,
        ...(courseReference ? { courseReference } : {}),
        ...(semester ? { semester } : {}),
        ...(academicYear !== null ? { academicYear } : {}),
        ...(admissionYear !== null ? { admissionYear } : {}),
        ...optionalCell(record, HEADER_ALIASES.company, 'company'),
        ...optionalCell(record, HEADER_ALIASES.province, 'province'),
        questionFields: rowQuestionFields,
        issues
      })
    }
  }

  if (rows.length === 0) throw new Error('WORKBOOK_NO_STUDENT_ROWS')
  const counts = new Map<string, number>()
  for (const row of rows) {
    if (/^\d{7,20}$/.test(row.studentId)) {
      counts.set(row.studentId, (counts.get(row.studentId) ?? 0) + 1)
    }
  }
  const rowsWithDuplicates = rows.map((row) => {
    if ((counts.get(row.studentId) ?? 0) < 2) return row
    return {
      ...row,
      issues: [
        ...row.issues,
        {
          code: 'DUPLICATE_SOURCE_ID',
          field: 'studentId',
          message: 'This student ID occurs more than once in the workbook.'
        }
      ]
    }
  })

  return {
    rows: rowsWithDuplicates,
    questionFields: [...questionFields].sort()
  }
}

function pick(
  record: Readonly<Record<string, unknown>>,
  aliases: readonly string[]
): unknown {
  const values = new Map(
    Object.entries(record).map(([key, value]) => [
      key.trim().toLowerCase(),
      value
    ])
  )
  for (const alias of aliases) {
    const value = values.get(alias.trim().toLowerCase())
    if (value !== undefined && value !== null && value !== '') return value
  }
  return undefined
}

function hasValue(
  record: Readonly<Record<string, unknown>>,
  aliases: readonly string[]
): boolean {
  return aliases.some((alias) => {
    const value = pick(record, [alias])
    return value !== undefined && value !== null && value !== ''
  })
}

function normalizeStudentId(value: unknown): string {
  if (typeof value === 'number') {
    if (!Number.isSafeInteger(value)) return String(value)
    return String(value)
  }
  return toText(value).replace(/\.0$/, '')
}

function parseYear(value: unknown): number | null {
  if (value === undefined || value === null || value === '') return null
  const parsed = typeof value === 'number' ? value : Number(toText(value))
  return Number.isSafeInteger(parsed) && parsed >= 2000 && parsed <= 3000
    ? parsed
    : null
}

function toText(value: unknown): string {
  if (typeof value === 'string') return value.trim()
  if (typeof value === 'number' && Number.isFinite(value)) return String(value)
  if (value instanceof Date) return value.toISOString()
  return ''
}

function optionalCell(
  record: Readonly<Record<string, unknown>>,
  aliases: readonly string[],
  field: 'company' | 'province'
): Partial<Record<'company' | 'province', string>> {
  const value = toText(pick(record, aliases))
  return value ? { [field]: value } : {}
}
