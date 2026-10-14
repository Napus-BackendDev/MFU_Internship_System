import * as XLSX from 'xlsx'
import { describe, expect, it } from 'vitest'
import { parseStudentContactsWorkbook } from '../src/members/student-contacts.parser.js'

function workbook(rows: unknown[][]): Buffer {
  const result = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(
    result,
    XLSX.utils.aoa_to_sheet(rows),
    'Checklist'
  )
  return XLSX.write(result, { type: 'buffer', bookType: 'xlsx' }) as Buffer
}

describe('Checklist contact import', () => {
  it('keeps university advisors separate from workplace evaluators and prefers explicit corrections', () => {
    const result = parseStudentContactsWorkbook(
      workbook([
        ['Checklist title'],
        [
          'รหัสประจำตัว\nStudent ID',
          'อาจารย์ผู้ประสานงาน Internship Advisor',
          "อีเมลอาจารย์ Advisor's Email",
          'อาจารย์นิเทศ Site Visit Advisor',
          "อีเมลอาจารย์ Advisor's Email",
          "Evaluator's Email",
          "Comfirm Evaluator's Email",
          "Edit Evaluator's Email"
        ],
        [
          6631503001,
          'Academic adviser',
          ' ADVISOR@example.test ',
          'Site adviser',
          'site@example.test',
          'old@example.test',
          true,
          'corrected@example.test'
        ]
      ])
    )
    expect(result.rows[0]).toMatchObject({
      studentId: '6631503001',
      rowNumber: 3,
      contacts: {
        advisorName: 'Academic adviser',
        advisorEmail: 'advisor@example.test',
        siteVisitAdvisorName: 'Site adviser',
        siteVisitAdvisorEmail: 'site@example.test',
        evaluatorEmail: 'corrected@example.test'
      },
      issues: []
    })
  })

  it('reads evaluator and site-advisor headers from the upper row of the English layout', () => {
    const result = parseStudentContactsWorkbook(
      workbook([
        ['', '', 'อาจารย์นิเทศ Internship Advisor', "Evaluator's Email"],
        ['No.', 'Student ID', '', ''],
        [1, '6631503001', 'Academic adviser', 'mentor@example.test']
      ])
    )
    expect(result.rows[0]!.contacts).toEqual({
      siteVisitAdvisorName: 'Academic adviser',
      evaluatorEmail: 'mentor@example.test'
    })
  })

  it('preserves blanks and rejects malformed corrected email rather than silently falling back', () => {
    const result = parseStudentContactsWorkbook(
      workbook([
        [
          'studentId',
          'advisorEmail',
          "Evaluator's Email",
          "Edit Evaluator's Email"
        ],
        ['6631503001', '', 'valid@example.test', 'not-an-email']
      ])
    )
    expect(result.rows[0]!.contacts).toEqual({ evaluatorEmail: 'not-an-email' })
    expect(result.rows[0]!.issues[0]!.code).toBe('INVALID_CONTACT_EMAIL')
  })

  it('blocks duplicate IDs instead of assigning whichever contact appears last', () => {
    const result = parseStudentContactsWorkbook(
      workbook([
        ['studentId', 'evaluatorEmail'],
        ['6631503001', 'one@example.test'],
        ['6631503001', 'two@example.test']
      ])
    )
    expect(
      result.rows.every((row) =>
        row.issues.some((issue) => issue.code === 'DUPLICATE_SOURCE_ID')
      )
    ).toBe(true)
  })

  it('ignores helper sheets without contact headers', () => {
    expect(() =>
      parseStudentContactsWorkbook(
        workbook([
          ['studentId', 'MIS'],
          ['6631503001', 'Submitted']
        ])
      )
    ).toThrow('WORKBOOK_NO_STUDENT_ROWS')
  })
})
