import * as XLSX from 'xlsx'
import type {
  StudentDirectoryExportLocale,
  StudentDirectoryExportValues
} from '@internship/shared-types'

export type { StudentDirectoryExportLocale, StudentDirectoryExportValues }

interface ExportColumn {
  readonly header: string
  readonly value: (
    row: StudentDirectoryExportValues,
    index: number
  ) => string | number
}

const THAI_COLUMNS: readonly ExportColumn[] = [
  { header: 'ลำดับ', value: (_row, index) => index + 1 },
  { header: 'รหัสนักศึกษา', value: (row) => row.studentId },
  { header: 'ชื่อ-นามสกุล (ไทย)', value: (row) => row.nameTh },
  { header: 'ชื่อ-นามสกุล (อังกฤษ)', value: (row) => row.nameEn },
  { header: 'อีเมลนักศึกษา', value: (row) => row.email },
  { header: 'สำนักวิชา', value: (row) => row.schoolTh },
  { header: 'สาขาวิชา / หลักสูตร', value: (row) => row.programTh },
  { header: 'รายวิชา (Course)', value: (row) => row.courseDisplay },
  { header: 'ปีการศึกษา', value: (row) => row.academicYear },
  { header: 'ภาคการศึกษา', value: (row) => row.semester },
  { header: 'สถานประกอบการ', value: (row) => row.company },
  { header: 'ที่ตั้งบริษัท', value: (row) => row.companyAddress },
  { header: 'จังหวัด', value: (row) => row.province },
  { header: 'อาจารย์ที่ปรึกษา', value: (row) => row.advisorTh },
  {
    header: 'ผู้ประเมินสถานประกอบการ (คนทำฟอร์ม)',
    value: (row) => row.evaluatorTh
  },
  { header: 'ตำแหน่งผู้ประเมิน', value: (row) => row.evaluatorPositionTh },
  { header: 'อีเมลผู้ประเมิน', value: (row) => row.evaluatorEmail },
  { header: 'สถานะการประเมิน', value: (row) => row.statusTh },
  { header: 'คะแนน Hard Skill (เฉลี่ย)', value: (row) => row.hardSkillScore },
  { header: 'คะแนน Soft Skill (เฉลี่ย)', value: (row) => row.softSkillScore }
]

const ENGLISH_COLUMNS: readonly ExportColumn[] = [
  { header: 'No.', value: (_row, index) => index + 1 },
  { header: 'Student ID', value: (row) => row.studentId },
  { header: 'Full Name (English)', value: (row) => row.nameEn },
  { header: 'Full Name (Thai)', value: (row) => row.nameTh },
  { header: 'Student Email', value: (row) => row.email },
  { header: 'School', value: (row) => row.schoolEn },
  { header: 'Program / Major', value: (row) => row.programEn },
  { header: 'Course', value: (row) => row.courseDisplay },
  { header: 'Academic Year', value: (row) => row.academicYearEn },
  {
    header: 'Semester',
    value: (row) => row.semesterEn
  },
  { header: 'Company / Placement', value: (row) => row.company },
  { header: 'Company Location', value: (row) => row.companyAddress },
  { header: 'Province', value: (row) => row.province },
  { header: 'Academic Advisor', value: (row) => row.advisorEn },
  {
    header: 'Workplace Evaluator (Form Maker)',
    value: (row) => row.evaluatorEn
  },
  { header: 'Evaluator Position', value: (row) => row.evaluatorPositionEn },
  { header: 'Evaluator Email', value: (row) => row.evaluatorEmail },
  { header: 'Evaluation Status', value: (row) => row.statusEn },
  { header: 'Hard Skill Average', value: (row) => row.hardSkillScore },
  { header: 'Soft Skill Average', value: (row) => row.softSkillScore }
]

const SHEET_NAMES: Readonly<Record<StudentDirectoryExportLocale, string>> = {
  th: 'รายงานนักศึกษาฝึกงาน_TH',
  en: 'Internship_Report_EN'
}

const COLUMN_WIDTHS: Readonly<
  Record<StudentDirectoryExportLocale, readonly number[]>
> = {
  th: [
    6, 14, 26, 26, 30, 24, 32, 28, 24, 12, 16, 35, 28, 16, 30, 30, 28, 28, 20,
    24, 24
  ],
  en: [
    6, 14, 28, 26, 30, 24, 34, 30, 24, 14, 16, 35, 28, 16, 30, 30, 28, 28, 20,
    24, 24
  ]
}

export function renderStudentDirectoryExportXlsx(
  locale: StudentDirectoryExportLocale,
  rows: readonly { readonly values: StudentDirectoryExportValues }[]
): Buffer {
  const columns = locale === 'th' ? THAI_COLUMNS : ENGLISH_COLUMNS
  const data: (string | number)[][] = [
    columns.map((column) => column.header),
    ...rows.map(({ values }, index) =>
      columns.map((column) => column.value(values, index))
    )
  ]
  const worksheet = XLSX.utils.aoa_to_sheet(data)
  worksheet['!cols'] = COLUMN_WIDTHS[locale].map((wch) => ({ wch }))
  const workbook = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(workbook, worksheet, SHEET_NAMES[locale])
  return XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' }) as Buffer
}
