export interface StudentDirectoryExportSource {
  readonly studentId: string
  readonly nameTh: string
  readonly nameEn: string
  readonly email: string
  readonly personalEmail: string
  readonly schoolTh: string
  readonly schoolEn: string
  readonly programTh: string
  readonly programEn: string
  readonly courseDisplay: string
  readonly academicYear: number | string
  readonly academicYearEn: number | string
  readonly semester: string
  readonly company: string
  readonly companyAddress: string
  readonly province: string
  readonly advisorTh: string
  readonly advisorEn: string
  readonly evaluatorTh: string
  readonly evaluatorEn: string
  readonly evaluatorPositionTh: string
  readonly evaluatorPositionEn: string
  readonly evaluatorEmail: string
  readonly statusTh: string
  readonly statusEn: string
  readonly scoreDisplay: string
  readonly gradeDisplay: string
  readonly gradeDisplayEn: string
}

export type StudentDirectoryExportLocale = 'th' | 'en'
export type StudentDirectoryExportRow = Readonly<
  Record<string, string | number>
>

export function buildStudentDirectoryExportRows(
  rows: readonly StudentDirectoryExportSource[],
  locale: StudentDirectoryExportLocale
): StudentDirectoryExportRow[] {
  if (locale === 'th') {
    return rows.map((row, index) => ({
      ลำดับ: index + 1,
      รหัสนักศึกษา: row.studentId,
      'ชื่อ-นามสกุล (ไทย)': row.nameTh,
      'ชื่อ-นามสกุล (อังกฤษ)': row.nameEn,
      อีเมลนักศึกษา: row.email,
      'อีเมลส่วนตัว (Personal Email)': row.personalEmail,
      สำนักวิชา: row.schoolTh,
      'สาขาวิชา / หลักสูตร': row.programTh,
      'รายวิชา (Course)': row.courseDisplay,
      ปีการศึกษา: row.academicYear,
      ภาคการศึกษา: `ภาคการศึกษาที่ ${row.semester}`,
      สถานประกอบการ: row.company,
      ที่ตั้งบริษัท: row.companyAddress,
      จังหวัด: row.province,
      อาจารย์ที่ปรึกษา: row.advisorTh,
      'ผู้ประเมินสถานประกอบการ (คนทำฟอร์ม)': row.evaluatorTh,
      ตำแหน่งผู้ประเมิน: row.evaluatorPositionTh,
      อีเมลผู้ประเมิน: row.evaluatorEmail,
      สถานะการประเมิน: row.statusTh,
      'คะแนนเฉลี่ย (เต็ม 5.0)': row.scoreDisplay,
      ผลการประเมิน: row.gradeDisplay
    }))
  }

  return rows.map((row, index) => ({
    'No.': index + 1,
    'Student ID': row.studentId,
    'Full Name (English)': row.nameEn,
    'Full Name (Thai)': row.nameTh,
    'Student Email': row.email,
    'Personal Email': row.personalEmail,
    School: row.schoolEn,
    'Program / Major': row.programEn,
    Course: row.courseDisplay,
    'Academic Year': row.academicYearEn,
    Semester:
      row.semester === '3' ? 'Summer Session' : `Semester ${row.semester}`,
    'Company / Placement': row.company,
    'Company Location': row.companyAddress,
    Province: row.province,
    'Academic Advisor': row.advisorEn,
    'Workplace Evaluator (Form Maker)': row.evaluatorEn,
    'Evaluator Position': row.evaluatorPositionEn,
    'Evaluator Email': row.evaluatorEmail,
    'Evaluation Status': row.statusEn,
    'Average Score (out of 5.0)': row.scoreDisplay,
    'Grade / Evaluation Result': row.gradeDisplayEn
  }))
}
