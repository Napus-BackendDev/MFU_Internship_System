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
})
