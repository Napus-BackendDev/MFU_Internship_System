import * as XLSX from 'xlsx'
import { describe, expect, it } from 'vitest'

import { renderStudentDirectoryExportXlsx } from '../src/runtime/student-directory-export.xlsx.js'

const row = {
  values: {
    studentId: '6531501001',
    nameTh: 'นักศึกษา',
    nameEn: 'Student',
    email: 'student@example.test',
    schoolTh: 'สำนักวิชา',
    schoolEn: 'School',
    programTh: 'หลักสูตร',
    programEn: 'Program',
    courseDisplay: 'Internship',
    academicYear: 2569,
    academicYearEn: 2026,
    semester: 'ภาคการศึกษาต้น',
    semesterEn: 'Semester 1',
    company: 'MFU',
    companyAddress: '-',
    province: '-',
    advisorTh: '-',
    advisorEn: '-',
    evaluatorTh: '-',
    evaluatorEn: '-',
    evaluatorPositionTh: '-',
    evaluatorPositionEn: '-',
    evaluatorEmail: '-',
    statusTh: 'ส่งผลประเมินแล้ว',
    statusEn: 'Submitted',
    hardSkillScore: '4.3 / 5 (3 items)',
    softSkillScore: '3.5 / 5 (2 items)'
  }
} as const

describe('Student directory XLSX rendering', () => {
  it('keeps the approved 20-column Thai workbook and typed academic year', () => {
    const workbook = XLSX.read(renderStudentDirectoryExportXlsx('th', [row]), {
      type: 'buffer'
    })
    const sheet = workbook.Sheets['รายงานนักศึกษาฝึกงาน_TH']!
    const values = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1 })

    expect(values[0]).toHaveLength(20)
    expect(values[0]?.[0]).toBe('ลำดับ')
    expect(values[0]?.[19]).toBe('คะแนน Soft Skill (เฉลี่ย)')
    expect(values[1]?.[8]).toBe(2569)
    expect(values[1]?.[9]).toBe('ภาคการศึกษาต้น')
    expect(values[1]?.[18]).toBe('4.3 / 5 (3 items)')
    expect(values[1]?.[19]).toBe('3.5 / 5 (2 items)')
  })

  it('keeps untrusted cell text as strings instead of formulas', () => {
    const workbook = XLSX.read(
      renderStudentDirectoryExportXlsx('en', [
        {
          values: {
            ...row.values,
            nameEn: '=HYPERLINK("https://example.test")'
          }
        }
      ]),
      { type: 'buffer', cellFormula: true }
    )
    const sheet = workbook.Sheets.Internship_Report_EN!
    const values = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1 })

    expect(values[1]?.[2]).toBe('=HYPERLINK("https://example.test")')
    expect(XLSX.utils.sheet_to_formulae(sheet)).not.toContain(
      'C2=HYPERLINK("https://example.test")'
    )
    expect(sheet['!ref']).toBe('A1:T2')
  })

  it('produces byte-identical workbooks for the same immutable snapshot', () => {
    expect(renderStudentDirectoryExportXlsx('th', [row])).toEqual(
      renderStudentDirectoryExportXlsx('th', [row])
    )
  })
})
