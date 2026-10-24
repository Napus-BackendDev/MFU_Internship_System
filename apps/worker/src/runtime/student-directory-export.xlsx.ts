import * as XLSX from 'xlsx'
import type {
  ExportSkillItem,
  StudentDirectoryExportLocale,
  StudentDirectoryExportValues
} from '@internship/shared-types'

export type {
  ExportSkillItem,
  StudentDirectoryExportLocale,
  StudentDirectoryExportValues
}

// 62-column headers matching "สร้างไฟล์ Cer PDF + ส่งเมล. .xlsx"
const BASE_DATA_HEADERS = [
  'NO.',
  'ID',
  'Name-Surname (Thai)',
  'Name-Surname',
  'Email',
  'Programe',
  'School',
  'Course',
  'Organization name',
  'Semester',
  'Year',
  'ภาคการศึกษา',
  'ปี'
] as const

const HARD_HEADERS = ['Hard1', 'Hard2', 'Hard3', 'Hard4', 'Hard5', 'Hard6'] as const
const HS_HEADERS = ['HS1', 'HS2', 'HS3', 'HS4', 'HS5', 'HS6'] as const
const HM_HEADERS = ['HM1', 'HM2', 'HM3', 'HM4', 'HM5', 'HM6'] as const

const SOFT_HEADERS = [
  'SS1', 'SS2', 'SS3', 'SS4', 'SS5', 'SS6',
  'SS7', 'SS8', 'SS9', 'SS10', 'SS11', 'SS12'
] as const

const SM_HEADERS = [
  'SM1', 'SM2', 'SM3', 'SM4', 'SM5', 'SM6',
  'SM7', 'SM8', 'SM9', 'SM10', 'SM11', 'SM12'
] as const

const SEND_EMAIL_HEADERS = [
  'NO.',
  'ID',
  'Name-Surname',
  'Email',
  'Programe',
  'School',
  'Semmester',
  'Year',
  'ภาคการศึกษา',
  'ปีการศึกษา',
  'PDF URL',
  'Email Sent'
] as const

function round2(num: number): number {
  return Math.round((num + Number.EPSILON) * 100) / 100
}

function calculateMean(scores: number[]): number | null {
  if (scores.length === 0) return null
  const sum = scores.reduce((acc, curr) => acc + curr, 0)
  return round2(sum / scores.length)
}

function calculateSampleStdev(scores: number[]): number | null {
  if (scores.length < 2) return null
  const mean = scores.reduce((acc, curr) => acc + curr, 0) / scores.length
  const variance =
    scores.reduce((acc, curr) => acc + Math.pow(curr - mean, 2), 0) /
    (scores.length - 1)
  return round2(Math.sqrt(variance))
}

function sanitizeSheetName(name: string, fallback: string): string {
  const sanitized = name.replace(/[\\/?*[\]:]/g, '_').trim()
  if (!sanitized) return fallback
  return sanitized.slice(0, 31)
}

interface ProgramSheetGroup {
  readonly sheetName: string
  readonly rows: readonly { readonly values: StudentDirectoryExportValues }[]
}

export function renderStudentDirectoryExportXlsx(
  locale: StudentDirectoryExportLocale,
  rows: readonly { readonly values: StudentDirectoryExportValues }[]
): Buffer {
  const workbook = XLSX.utils.book_new()

  // 1. Group rows by Program
  const groupsByProgram = new Map<string, { readonly values: StudentDirectoryExportValues }[]>()
  for (const row of rows) {
    const progKey =
      (locale === 'th' ? row.values.programTh : row.values.programEn) ||
      row.values.programTh ||
      row.values.programEn ||
      'Students'
    const list = groupsByProgram.get(progKey) ?? []
    list.push(row)
    groupsByProgram.set(progKey, list)
  }

  const sheetGroups: ProgramSheetGroup[] = []
  if (groupsByProgram.size === 0) {
    sheetGroups.push({
      sheetName: locale === 'th' ? 'ข้อมูลนักศึกษา' : 'Students',
      rows: []
    })
  } else {
    const usedNames = new Set<string>()
    for (const [progName, groupRows] of groupsByProgram) {
      let sheetName = sanitizeSheetName(progName, 'Data')
      if (usedNames.has(sheetName)) {
        let suffix = 2
        while (usedNames.has(`${sheetName.slice(0, 28)}_${suffix}`)) {
          suffix++
        }
        sheetName = `${sheetName.slice(0, 28)}_${suffix}`
      }
      usedNames.add(sheetName)
      sheetGroups.push({ sheetName, rows: groupRows })
    }
  }

  // 2. Build each Program Data sheet
  for (const group of sheetGroups) {
    // Detect question titles for Hard skills from evaluated students in this group
    const hardQuestionTitles: string[] = []
    for (const r of group.rows) {
      if (r.values.hardSkills && r.values.hardSkills.length > 0) {
        for (let i = 0; i < Math.min(r.values.hardSkills.length, 6); i++) {
          const item = r.values.hardSkills[i]
          if (item) {
            hardQuestionTitles[i] =
              locale === 'th' ? item.titleTh : item.titleEn
          }
        }
        if (hardQuestionTitles.length > 0) break
      }
    }
    const hardQuestionCount = Math.max(hardQuestionTitles.length, 0)

    // Calculate group stats (HM1..HM6, HSD, SM1..SM12, SSD)
    const hardScoresByCol: number[][] = Array.from({ length: 6 }, () => [])
    const softScoresByCol: number[][] = Array.from({ length: 12 }, () => [])
    const allHardScores: number[] = []
    const allSoftScores: number[] = []

    for (const r of group.rows) {
      if (r.values.hardSkills) {
        for (let i = 0; i < 6; i++) {
          const s = r.values.hardSkills[i]?.score
          if (typeof s === 'number' && Number.isFinite(s)) {
            hardScoresByCol[i]!.push(s)
            allHardScores.push(s)
          }
        }
      }
      if (r.values.softSkills) {
        for (let j = 0; j < 12; j++) {
          const s = r.values.softSkills[j]?.score
          if (typeof s === 'number' && Number.isFinite(s)) {
            softScoresByCol[j]!.push(s)
            allSoftScores.push(s)
          }
        }
      }
    }

    const groupHM: (number | null)[] = hardScoresByCol.map(calculateMean)
    const groupHSD = calculateSampleStdev(allHardScores)
    const groupSM: (number | null)[] = softScoresByCol.map(calculateMean)
    const groupSSD = calculateSampleStdev(allSoftScores)

    // Build Header row (62 columns)
    const headerRow: (string | null)[] = [
      ...BASE_DATA_HEADERS,
      // Hard question titles: 6 slots (null for empty slots if fewer questions)
      ...Array.from({ length: 6 }, (_, i) => {
        if (i < hardQuestionCount && hardQuestionTitles[i]) {
          return hardQuestionTitles[i]
        }
        return HARD_HEADERS[i]!
      }),
      // HS headers
      ...HS_HEADERS,
      // HM headers
      ...HM_HEADERS,
      'HA',
      'HSD',
      // SS headers
      ...SOFT_HEADERS,
      // SM headers
      ...SM_HEADERS,
      'SA',
      'SSD',
      'Issued on',
      'PDF URL',
      'EMAIL_SENT'
    ]

    // Build data rows
    const dataRows: (string | number | null)[][] = []
    group.rows.forEach((r, idx) => {
      const v = r.values

      // Student hard scores
      const hsVals: (number | null)[] = Array.from({ length: 6 }, (_, i) => {
        const s = v.hardSkills?.[i]?.score
        return typeof s === 'number' && Number.isFinite(s) ? s : null
      })

      // Student soft scores
      const ssVals: (number | null)[] = Array.from({ length: 12 }, (_, j) => {
        const s = v.softSkills?.[j]?.score
        return typeof s === 'number' && Number.isFinite(s) ? s : null
      })

      // HA & SA calculation
      const validHS = hsVals.filter((s): s is number => s !== null)
      const ha =
        typeof v.hardAverage === 'number' && Number.isFinite(v.hardAverage)
          ? round2(v.hardAverage)
          : calculateMean(validHS)

      const validSS = ssVals.filter((s): s is number => s !== null)
      const sa =
        typeof v.softAverage === 'number' && Number.isFinite(v.softAverage)
          ? round2(v.softAverage)
          : calculateMean(validSS)

      // Demographic values (first 13 cols)
      const studentIdNum = Number(v.studentId)
      const parsedStudentId = !Number.isNaN(studentIdNum) && String(studentIdNum) === v.studentId ? studentIdNum : v.studentId

      const academicYearNum = Number(v.academicYear)
      const parsedYear = !Number.isNaN(academicYearNum) ? academicYearNum : v.academicYear

      const academicYearEnNum = Number(v.academicYearEn)
      const parsedYearEn = !Number.isNaN(academicYearEnNum) ? academicYearEnNum : v.academicYearEn

      const rowValues: (string | number | null)[] = [
        idx + 1, // NO.
        parsedStudentId, // ID
        v.nameTh, // Name-Surname (Thai)
        v.nameEn, // Name-Surname
        v.email, // Email
        v.programTh || v.programEn, // Programe
        v.schoolTh || v.schoolEn, // School
        v.courseDisplay, // Course
        v.company, // Organization name
        v.semesterEn, // Semester
        parsedYearEn, // Year
        v.semester, // ภาคการศึกษา
        parsedYear, // ปี
        // Hard question titles repeated / slot titles
        ...Array.from({ length: 6 }, (_, i) => hardQuestionTitles[i] || null),
        // HS1..HS6
        ...hsVals,
        // HM1..HM6
        ...Array.from({ length: 6 }, (_, i) => (i < hardQuestionCount ? groupHM[i] ?? null : null)),
        // HA, HSD
        ha,
        groupHSD,
        // SS1..SS12
        ...ssVals,
        // SM1..SM12
        ...groupSM,
        // SA, SSD
        sa,
        groupSSD,
        v.issuedOn || '-',
        v.pdfUrl || '',
        v.emailSent || ''
      ]

      dataRows.push(rowValues)
    })

    const worksheet = XLSX.utils.aoa_to_sheet([headerRow, ...dataRows])

    // Set column widths
    worksheet['!cols'] = [
      { wch: 6 },  // NO.
      { wch: 14 }, // ID
      { wch: 26 }, // Name-Surname (Thai)
      { wch: 26 }, // Name-Surname
      { wch: 28 }, // Email
      { wch: 32 }, // Programe
      { wch: 26 }, // School
      { wch: 22 }, // Course
      { wch: 32 }, // Organization name
      { wch: 12 }, // Semester
      { wch: 8 },  // Year
      { wch: 16 }, // ภาคการศึกษา
      { wch: 8 },  // ปี
      // Hard1..Hard6
      { wch: 30 }, { wch: 30 }, { wch: 30 }, { wch: 30 }, { wch: 30 }, { wch: 30 },
      // HS1..HS6
      { wch: 6 }, { wch: 6 }, { wch: 6 }, { wch: 6 }, { wch: 6 }, { wch: 6 },
      // HM1..HM6
      { wch: 8 }, { wch: 8 }, { wch: 8 }, { wch: 8 }, { wch: 8 }, { wch: 8 },
      { wch: 8 }, // HA
      { wch: 8 }, // HSD
      // SS1..SS12
      { wch: 6 }, { wch: 6 }, { wch: 6 }, { wch: 6 }, { wch: 6 }, { wch: 6 },
      { wch: 6 }, { wch: 6 }, { wch: 6 }, { wch: 6 }, { wch: 6 }, { wch: 6 },
      // SM1..SM12
      { wch: 8 }, { wch: 8 }, { wch: 8 }, { wch: 8 }, { wch: 8 }, { wch: 8 },
      { wch: 8 }, { wch: 8 }, { wch: 8 }, { wch: 8 }, { wch: 8 }, { wch: 8 },
      { wch: 8 }, // SA
      { wch: 8 }, // SSD
      { wch: 14 }, // Issued on
      { wch: 35 }, // PDF URL
      { wch: 14 }  // EMAIL_SENT
    ]

    XLSX.utils.book_append_sheet(workbook, worksheet, group.sheetName)
  }

  // 3. Build "Send Email" summary sheet
  const sendEmailData: (string | number | null)[][] = [
    [...SEND_EMAIL_HEADERS],
    ...rows.map((r, idx) => {
      const v = r.values
      const studentIdNum = Number(v.studentId)
      const parsedStudentId = !Number.isNaN(studentIdNum) && String(studentIdNum) === v.studentId ? studentIdNum : v.studentId

      const academicYearNum = Number(v.academicYear)
      const parsedYear = !Number.isNaN(academicYearNum) ? academicYearNum : v.academicYear

      const academicYearEnNum = Number(v.academicYearEn)
      const parsedYearEn = !Number.isNaN(academicYearEnNum) ? academicYearEnNum : v.academicYearEn

      return [
        idx + 1, // NO.
        parsedStudentId, // ID
        locale === 'th' ? v.nameTh : v.nameEn, // Name-Surname
        v.email, // Email
        v.programTh || v.programEn, // Programe
        v.schoolTh || v.schoolEn, // School
        v.semesterEn, // Semmester
        parsedYearEn, // Year
        v.semester, // ภาคการศึกษา
        parsedYear, // ปีการศึกษา
        v.pdfUrl || '', // PDF URL
        v.emailSent || '' // Email Sent
      ]
    })
  ]

  const sendEmailWorksheet = XLSX.utils.aoa_to_sheet(sendEmailData)
  sendEmailWorksheet['!cols'] = [
    { wch: 6 },  // NO.
    { wch: 14 }, // ID
    { wch: 28 }, // Name-Surname
    { wch: 28 }, // Email
    { wch: 32 }, // Programe
    { wch: 26 }, // School
    { wch: 12 }, // Semmester
    { wch: 8 },  // Year
    { wch: 16 }, // ภาคการศึกษา
    { wch: 12 }, // ปีการศึกษา
    { wch: 35 }, // PDF URL
    { wch: 14 }  // Email Sent
  ]

  XLSX.utils.book_append_sheet(workbook, sendEmailWorksheet, 'Send Email')

  return XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' }) as Buffer
}
