import * as XLSX from 'xlsx'
import { describe, expect, it } from 'vitest'

import { parseStudentWorkbook } from '../src/members/student-import.parser.js'

function workbookBuffer(
  sheets: ReadonlyArray<{ name: string; rows: readonly unknown[][] }>
): Buffer {
  const workbook = XLSX.utils.book_new()
  for (const sheet of sheets) {
    XLSX.utils.book_append_sheet(
      workbook,
      XLSX.utils.aoa_to_sheet(sheet.rows.map((row) => [...row])),
      sheet.name
    )
  }
  return XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' }) as Buffer
}

describe('student import workbook parser', () => {
  it('parses CSV and reports question columns without mapping scores to evaluations', () => {
    const csv = [
      'studentId,nameTh,nameEn,email,schoolCode,programCode,courseCode,semester,academicYear,Hard Skill 1',
      '1234567,Example Thai,Example,student@example.test,ADT,SE,SWE491,1/2026,2026,5'
    ].join('\n')

    const parsed = parseStudentWorkbook(Buffer.from(csv, 'utf8'))

    expect(parsed.rows).toMatchObject([
      {
        studentId: '1234567',
        email: 'student@example.test',
        questionFields: ['Hard Skill 1']
      }
    ])
    expect(parsed.questionFields).toEqual(['Hard Skill 1'])
  })

  it('rejects workbooks with more than 20 sheets', () => {
    const workbook = workbookBuffer(
      Array.from({ length: 21 }, (_, index) => ({
        name: `Sheet${index + 1}`,
        rows: [['studentId']]
      }))
    )

    expect(() => parseStudentWorkbook(workbook)).toThrow(
      'WORKBOOK_SHEET_LIMIT_EXCEEDED'
    )
  })

  it('rejects sheets with more than 200 columns', () => {
    const workbook = workbookBuffer([
      {
        name: 'Students',
        rows: [Array.from({ length: 201 }, (_, index) => `Column${index + 1}`)]
      }
    ])

    expect(() => parseStudentWorkbook(workbook)).toThrow(
      'WORKBOOK_COLUMN_LIMIT_EXCEEDED'
    )
  })

  it('rejects more than 1,000 student rows', () => {
    const workbook = workbookBuffer([
      {
        name: 'Students',
        rows: [
          [
            'studentId',
            'nameTh',
            'nameEn',
            'email',
            'schoolCode',
            'programCode'
          ],
          ...Array.from({ length: 1_001 }, (_, index) => [
            String(1_000_000 + index),
            'ชื่อนักศึกษา',
            'Example Student',
            `student${index}@example.test`,
            'ADT',
            'SE'
          ])
        ]
      }
    ])

    expect(() => parseStudentWorkbook(workbook)).toThrow(
      'WORKBOOK_ROW_LIMIT_EXCEEDED'
    )
  })

  it('correctly handles shifted column headers where English name is in Email and email in Program', () => {
    const csv = [
      'NO.,ID,Name-Surname,Email,Programe,School,Semmester,Year,ภาคการศึกษา,ปีการศึกษา,PDF URL,PDF URL,Email Sent',
      '79,6431205183,MISS NAN SHAN HOM,Miss Nan Shan Hom,pannipa.man@mfu.ac.th,Tourism Business and Events,JW Marriott Phuket Resort & Spa,First, ,15,5,,EMAIL_SENT'
    ].join('\n')

    const parsed = parseStudentWorkbook(Buffer.from(csv, 'utf8'))
    expect(parsed.rows).toHaveLength(1)
    const row = parsed.rows[0]!
    expect(row.studentId).toBe('6431205183')
    expect(row.name).toBe('MISS NAN SHAN HOM')
    expect(row.nameEn).toBe('Miss Nan Shan Hom')
    expect(row.email).toBe('pannipa.man@mfu.ac.th')
    expect(row.programReference).toBe('Tourism Business and Events')
    expect(row.company).toBe('JW Marriott Phuket Resort & Spa')
    expect(row.semester).toBe('First')
    expect(row.issues.filter((i) => i.code === 'INVALID_EMAIL')).toHaveLength(0)
    expect(
      row.issues.filter((i) => i.code === 'INVALID_ACADEMIC_YEAR')
    ).toHaveLength(0)
  })

  it('parses real university workbook without parser issues or duplicate conflicts', async () => {
    const fs = await import('node:fs')
    const filePath =
      'C:/Users/asus/.gemini/antigravity/brain/d4a93c97-1826-483a-bc2b-956815ecf340/.user_uploaded/media_1791100403482.xlsx'
    if (!fs.existsSync(filePath)) return
    const buffer = fs.readFileSync(filePath)
    const parsed = parseStudentWorkbook(buffer)
    expect(parsed.rows.length).toBe(96)
    const issues = parsed.rows.flatMap((r) => r.issues)
    expect(issues).toHaveLength(0)
  })
})
