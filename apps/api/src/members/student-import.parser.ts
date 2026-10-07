import * as XLSX from 'xlsx'

export const STUDENT_IMPORT_MAX_ROWS = 1000
const STUDENT_IMPORT_MAX_SHEETS = 20
const STUDENT_IMPORT_MAX_COLUMNS = 200

export interface StudentImportSourceRow {
  readonly key: string
  readonly sheet: string
  readonly rowNumber: number
  readonly studentId: string
  readonly name: string
  readonly nameTh: string
  readonly nameEn: string
  readonly email: string
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
    'ID',
    'รหัส',
    'student_id'
  ],
  name: [
    'name',
    'ชื่อ-นามสกุล',
    'ชื่อ-นามสกุล (name)',
    'ชื่อ-นามสกุล (Name)',
    'Student Name',
    'Full Name',
    'FullName',
    'ชื่อนักศึกษา',
    'Name'
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
    'Name EN',
    'Name-Surname (Eng)',
    'Name-Surname (English)'
  ],
  email: [
    'email',
    'Email',
    'อีเมล',
    'อีเมล (email)',
    'อีเมลนักศึกษา',
    'อีเมลนักศึกษา (email)'
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
    'Programme',
    'program',
    'รหัสหลักสูตร',
    'รหัสหลักสูตร (programCode)',
    'หลักสูตร',
    'Major'
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
    'Semmester',
    'ภาคการศึกษา',
    'ภาคการศึกษา (semester)',
    'เทอม'
  ],
  academicYear: [
    'academicYear',
    'Year',
    'ปีฝึกงาน',
    'ปีการศึกษาฝึกงาน',
    'ปีการศึกษา',
    'Academic Year',
    'AcademicYear'
  ],
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
    'Organization Name',
    'Organization',
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

    const isTrackingSheet =
      /^(send\s*email|email\s*sent|mail\s*merge|email\s*logs?|delivery\s*logs?)$/i.test(
        sheetName.trim()
      ) ||
      (records.length > 0 &&
        Object.keys(records[0] ?? {}).some((k) => /email\s*sent/i.test(k)) &&
        Object.keys(records[0] ?? {}).some((k) => /pdf\s*url/i.test(k)))

    for (const [index, record] of records.entries()) {
      const studentIdCell = pick(record, HEADER_ALIASES.studentId)
      if (toText(studentIdCell) === '') continue
      const studentId = normalizeStudentId(studentIdCell)
      if (/^(studentid|รหัสนักศึกษา|id)$/i.test(studentId.trim())) continue

      // If workbook has multiple sheets and this is a tracking/mail-merge sheet,
      // skip students that were already parsed from primary sheets to avoid duplicate key conflicts.
      if (
        isTrackingSheet &&
        workbook.SheetNames.length > 1 &&
        rows.some((r) => r.studentId === studentId)
      ) {
        continue
      }

      const rawEmailCell = toText(pick(record, HEADER_ALIASES.email))
      let email = rawEmailCell.toLowerCase()
      const schoolReference = toText(pick(record, HEADER_ALIASES.school))
      let programReference = toText(pick(record, HEADER_ALIASES.program))
      const courseReference = toText(pick(record, HEADER_ALIASES.course))
      let semester = toText(pick(record, HEADER_ALIASES.semester))
      let academicYear = parseYear(pick(record, HEADER_ALIASES.academicYear))
      const admissionYear = parseYear(
        pick(record, HEADER_ALIASES.admissionYear)
      )
      const explicitName = toText(pick(record, HEADER_ALIASES.name))
      let rawNameTh = toText(pick(record, HEADER_ALIASES.nameTh))
      let rawNameEn = toText(pick(record, HEADER_ALIASES.nameEn))
      let company = toText(pick(record, HEADER_ALIASES.company))
      const province = toText(pick(record, HEADER_ALIASES.province))

      // Check for shifted columns (e.g. Email column has English name, Programe column has email address)
      if (
        !/^\S+@\S+\.\S+$/.test(email) &&
        /^\S+@\S+\.\S+$/.test(programReference)
      ) {
        rawNameTh = rawNameTh || rawNameEn || explicitName
        rawNameEn = rawEmailCell
        email = programReference.toLowerCase()
        programReference = schoolReference
        if (semester && !company) {
          company = semester
        }
        const rawYearVal = toText(pick(record, HEADER_ALIASES.academicYear))
        if (rawYearVal && !parseYear(rawYearVal)) {
          semester = rawYearVal
          academicYear = null
        } else {
          semester = ''
        }
      } else if (!/^\S+@\S+\.\S+$/.test(email)) {
        for (const val of Object.values(record)) {
          const str = toText(val)
          if (/^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/.test(str)) {
            email = str.toLowerCase()
            break
          }
        }
      }

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
      const resolvedName = explicitName || rawNameTh || rawNameEn

      if (!resolvedName) {
        issues.push({
          code: 'NAME_REQUIRED',
          field: 'name',
          message: 'Student name is required.'
        })
      }
      if (!/^\S+@\S+\.\S+$/.test(email)) {
        issues.push({
          code: 'INVALID_EMAIL',
          field: 'email',
          message: 'A valid student email is required.'
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
      const rawYearCandidate = toText(pick(record, HEADER_ALIASES.academicYear))
      const isShiftedSemesterInYear =
        /^(first|second|third|summer|ต้น|ปลาย|ฤดูร้อน)/i.test(rawYearCandidate)
      if (
        academicYear === null &&
        hasValue(record, HEADER_ALIASES.academicYear) &&
        !isShiftedSemesterInYear
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
        name: resolvedName,
        nameTh: rawNameTh || resolvedName,
        nameEn: rawNameEn || resolvedName,
        email,
        schoolReference,
        programReference,
        ...(courseReference ? { courseReference } : {}),
        ...(semester ? { semester } : {}),
        ...(academicYear !== null ? { academicYear } : {}),
        ...(admissionYear !== null ? { admissionYear } : {}),
        ...(company ? { company } : {}),
        ...(province ? { province } : {}),
        questionFields: rowQuestionFields,
        issues
      })
    }
  }

  if (rows.length === 0) throw new Error('WORKBOOK_NO_STUDENT_ROWS')
  const counts = new Map<string, number>()
  const emailCounts = new Map<string, number>()
  for (const row of rows) {
    if (/^\d{7,20}$/.test(row.studentId)) {
      counts.set(row.studentId, (counts.get(row.studentId) ?? 0) + 1)
    }
    if (row.email) {
      emailCounts.set(row.email, (emailCounts.get(row.email) ?? 0) + 1)
    }
  }
  const rowsWithDuplicates = rows.map((row) => {
    const issues = [...row.issues]
    if ((counts.get(row.studentId) ?? 0) > 1) {
      issues.push({
        code: 'DUPLICATE_SOURCE_ID',
        field: 'studentId',
        message: 'This student ID occurs more than once in the workbook.'
      })
    }
    if ((emailCounts.get(row.email) ?? 0) > 1) {
      issues.push({
        code: 'DUPLICATE_SOURCE_EMAIL',
        field: 'email',
        message: 'This student email occurs more than once in the workbook.'
      })
    }
    if (issues.length === row.issues.length) return row
    return {
      ...row,
      issues
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
