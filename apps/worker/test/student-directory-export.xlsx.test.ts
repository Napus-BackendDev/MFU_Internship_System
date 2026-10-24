import * as XLSX from 'xlsx'
import { describe, expect, it } from 'vitest'

import { renderStudentDirectoryExportXlsx } from '../src/runtime/student-directory-export.xlsx.js'

const sampleRow = {
  values: {
    studentId: '6531501001',
    nameTh: 'นาย อนุพันธ์ เอกอาภรณ์ภิรมย์',
    nameEn: 'Mr. Anuphan Ekaphonphirom',
    email: '6531501001@lamduan.mfu.ac.th',
    schoolTh: 'สำนักวิชาเทคโนโลยีสารสนเทศ',
    schoolEn: 'School of Information Technology',
    programTh: 'เทคโนโลยีดิจิทัลเพื่อการพัฒนานวัตกรรมทางธุรกิจ',
    programEn: 'Digital Technology for Business Innovation',
    courseDisplay: 'Cooperative Education',
    academicYear: 2568,
    academicYearEn: 2025,
    semester: 'ภาคการศึกษาต้น',
    semesterEn: 'First',
    company: 'Chiangmaizone Dot Com Limited Partnership',
    companyAddress: 'Chiang Mai',
    province: 'Chiang Mai',
    advisorTh: '-',
    advisorEn: '-',
    evaluatorTh: 'นายสมชาย',
    evaluatorEn: 'Mr. Somchai',
    evaluatorPositionTh: 'Manager',
    evaluatorPositionEn: 'Manager',
    evaluatorEmail: 'somchai@example.test',
    statusTh: 'ส่งผลประเมินแล้ว',
    statusEn: 'Submitted',
    hardSkillScore: '4.6',
    softSkillScore: '4.8',
    hardSkills: [
      { index: 1, titleTh: '1. Digital Marketing', titleEn: '1. Digital Marketing', score: 4 },
      { index: 2, titleTh: '2. Data Analytics', titleEn: '2. Data Analytics', score: 4 },
      { index: 3, titleTh: '3. Content Creation', titleEn: '3. Content Creation', score: 5 },
      { index: 4, titleTh: '4. Innovation', titleEn: '4. Innovation', score: 5 },
      { index: 5, titleTh: '5. Social Media', titleEn: '5. Social Media', score: 5 }
    ],
    softSkills: [
      { index: 1, titleTh: 'SS1', titleEn: 'SS1', score: 5 },
      { index: 2, titleTh: 'SS2', titleEn: 'SS2', score: 4 },
      { index: 3, titleTh: 'SS3', titleEn: 'SS3', score: 5 },
      { index: 4, titleTh: 'SS4', titleEn: 'SS4', score: 5 },
      { index: 5, titleTh: 'SS5', titleEn: 'SS5', score: 5 },
      { index: 6, titleTh: 'SS6', titleEn: 'SS6', score: 5 },
      { index: 7, titleTh: 'SS7', titleEn: 'SS7', score: 5 },
      { index: 8, titleTh: 'SS8', titleEn: 'SS8', score: 5 },
      { index: 9, titleTh: 'SS9', titleEn: 'SS9', score: 5 },
      { index: 10, titleTh: 'SS10', titleEn: 'SS10', score: 5 },
      { index: 11, titleTh: 'SS11', titleEn: 'SS11', score: 5 },
      { index: 12, titleTh: 'SS12', titleEn: 'SS12', score: 4 }
    ],
    hardAverage: 4.6,
    softAverage: 4.83,
    issuedOn: '2025-05-15',
    pdfUrl: 'https://example.test/cert.pdf',
    emailSent: 'EMAIL_SENT'
  }
} as const

describe('Student directory XLSX rendering (Cer PDF + Send Email Format)', () => {
  it('generates program sheet with 62 columns and Send Email sheet', () => {
    const workbook = XLSX.read(renderStudentDirectoryExportXlsx('th', [sampleRow]), {
      type: 'buffer'
    })

    expect(workbook.SheetNames).toContain('Send Email')
    const programSheetName = workbook.SheetNames.find((name) => name !== 'Send Email')!
    expect(programSheetName).toBeDefined()

    const programSheet = workbook.Sheets[programSheetName]!
    const programData = XLSX.utils.sheet_to_json<unknown[]>(programSheet, { header: 1 })

    // Check header row: 62 columns
    expect(programData[0]).toHaveLength(62)
    expect(programData[0]?.[0]).toBe('NO.')
    expect(programData[0]?.[1]).toBe('ID')
    expect(programData[0]?.[13]).toBe('1. Digital Marketing')
    expect(programData[0]?.[19]).toBe('HS1')
    expect(programData[0]?.[25]).toBe('HM1')
    expect(programData[0]?.[31]).toBe('HA')
    expect(programData[0]?.[32]).toBe('HSD')
    expect(programData[0]?.[33]).toBe('SS1')
    expect(programData[0]?.[45]).toBe('SM1')
    expect(programData[0]?.[57]).toBe('SA')
    expect(programData[0]?.[58]).toBe('SSD')
    expect(programData[0]?.[59]).toBe('Issued on')
    expect(programData[0]?.[60]).toBe('PDF URL')
    expect(programData[0]?.[61]).toBe('EMAIL_SENT')

    // Check data row values
    const row1 = programData[1]!
    expect(row1[0]).toBe(1)
    expect(row1[1]).toBe(6531501001)
    expect(row1[2]).toBe('นาย อนุพันธ์ เอกอาภรณ์ภิรมย์')
    expect(row1[19]).toBe(4) // HS1
    expect(row1[31]).toBe(4.6) // HA
    expect(row1[57]).toBe(4.83) // SA
    expect(row1[59]).toBe('2025-05-15')
    expect(row1[60]).toBe('https://example.test/cert.pdf')
    expect(row1[61]).toBe('EMAIL_SENT')

    // Check Send Email sheet
    const sendEmailSheet = workbook.Sheets['Send Email']!
    const sendEmailData = XLSX.utils.sheet_to_json<unknown[]>(sendEmailSheet, { header: 1 })
    expect(sendEmailData[0]).toEqual([
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
    ])
    const emailRow = sendEmailData[1]!
    expect(emailRow[0]).toBe(1)
    expect(emailRow[1]).toBe(6531501001)
    expect(emailRow[2]).toBe('นาย อนุพันธ์ เอกอาภรณ์ภิรมย์')
    expect(emailRow[10]).toBe('https://example.test/cert.pdf')
    expect(emailRow[11]).toBe('EMAIL_SENT')
  })

  it('keeps untrusted cell text safe without formula execution', () => {
    const workbook = XLSX.read(
      renderStudentDirectoryExportXlsx('en', [
        {
          values: {
            ...sampleRow.values,
            nameEn: '=HYPERLINK("https://example.test")'
          }
        }
      ]),
      { type: 'buffer', cellFormula: true }
    )
    const programSheetName = workbook.SheetNames.find((name) => name !== 'Send Email')!
    const sheet = workbook.Sheets[programSheetName]!
    const values = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1 })

    expect(values[1]?.[3]).toBe('=HYPERLINK("https://example.test")')
    expect(XLSX.utils.sheet_to_formulae(sheet)).not.toContain(
      'D2=HYPERLINK("https://example.test")'
    )
  })

  it('produces byte-identical workbooks for the same immutable snapshot', () => {
    expect(renderStudentDirectoryExportXlsx('th', [sampleRow])).toEqual(
      renderStudentDirectoryExportXlsx('th', [sampleRow])
    )
  })
})
