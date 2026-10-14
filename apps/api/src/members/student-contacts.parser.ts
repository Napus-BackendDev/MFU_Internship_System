import * as XLSX from 'xlsx'

import type { ParsedStudentWorkbook } from './student-import.parser.js'

export const STUDENT_CONTACT_FIELDS = [
  'advisorName',
  'advisorEmail',
  'siteVisitAdvisorName',
  'siteVisitAdvisorEmail',
  'evaluatorName',
  'evaluatorEmail',
  'company',
  'companyAddress',
  'province'
] as const
export type StudentContactField = (typeof STUDENT_CONTACT_FIELDS)[number]
export type StudentContacts = Partial<Record<StudentContactField, string>>

// Checklist tabs have different column positions and one or two header rows.
export function parseStudentContactsWorkbook(
  buffer: Buffer
): ParsedStudentWorkbook {
  const workbook = XLSX.read(buffer, { type: 'buffer', sheetRows: 1012 })
  if (workbook.SheetNames.length > 20)
    throw new Error('WORKBOOK_SHEET_LIMIT_EXCEEDED')
  const rows: ParsedStudentWorkbook['rows'][number][] = []
  for (const sheetName of workbook.SheetNames) {
    const sheet = workbook.Sheets[sheetName]
    if (!sheet) continue
    if (sheet['!ref'] && XLSX.utils.decode_range(sheet['!ref']).e.c >= 200) {
      throw new Error('WORKBOOK_COLUMN_LIMIT_EXCEEDED')
    }
    const grid = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
      header: 1,
      defval: '',
      blankrows: true,
      raw: true
    })
    const headerIndex = grid
      .slice(0, 10)
      .findIndex((row) =>
        row.some((value) =>
          /student\s*id|รหัสนักศึกษา|รหัสประจำตัว/i.test(text(value))
        )
      )
    if (headerIndex < 0) continue
    const header = grid[headerIndex]!
    const idColumn = header.findIndex((value) =>
      /student\s*id|รหัสนักศึกษา|รหัสประจำตัว/i.test(text(value))
    )
    const columns = new Map<StudentContactField | 'editedEmail', number>()
    let advisor: 'advisor' | 'siteVisitAdvisor' = 'advisor'
    for (let column = 0; column < header.length; column++) {
      const current = text(header[column])
      const upper = headerIndex > 0 ? text(grid[headerIndex - 1]?.[column]) : ''
      const label = /advisor|อาจารย์|evaluat|ผู้ประเมิน/i.test(current)
        ? current
        : upper
      if (
        label === 'advisorName' ||
        label === 'siteVisitAdvisorName' ||
        label === 'evaluatorName'
      ) {
        columns.set(label, column)
      } else if (
        label === 'advisorEmail' ||
        label === 'siteVisitAdvisorEmail' ||
        label === 'evaluatorEmail'
      ) {
        columns.set(label, column)
      } else if (/แก้ไข.*อีเมลผู้ประเมิน|edit.*evaluator.*email/i.test(label)) {
        columns.set('editedEmail', column)
      } else if (/ยืนยัน|comfirm|confirm/i.test(label)) {
        continue
      } else if (/evaluator.?s?\s*email|อีเมลผู้ประเมิน/i.test(label)) {
        columns.set('evaluatorEmail', column)
      } else if (/evaluator.?s?\s*name|ชื่อผู้ประเมิน/i.test(label)) {
        columns.set('evaluatorName', column)
      } else if (/site\s*visit\s*advisor|อาจารย์นิเทศ/i.test(label)) {
        advisor = 'siteVisitAdvisor'
        columns.set('siteVisitAdvisorName', column)
      } else if (/internship\s*advisor|อาจารย์ผู้ประสานงาน/i.test(label)) {
        advisor = 'advisor'
        columns.set('advisorName', column)
      } else if (/advisor.?s?\s*email|อีเมลอาจารย์/i.test(label)) {
        columns.set(`${advisor}Email`, column)
      } else if (
        /ที่อยู่สถานประกอบการ|ที่อยู่|ที่ตั้ง|organisation.?s?\s*add?ress|organization.?s?\s*add?ress|company\s*address/i.test(
          current
        ) ||
        /ที่อยู่สถานประกอบการ|ที่อยู่|ที่ตั้ง|organisation.?s?\s*add?ress|organization.?s?\s*add?ress|company\s*address/i.test(
          upper
        )
      ) {
        columns.set('companyAddress', column)
      } else if (
        /ชื่อสถานประกอบการ|สถานประกอบการ|organisation.?s?\s*name|organization.?s?\s*name|company\s*name/i.test(
          current
        ) ||
        /ชื่อสถานประกอบการ|สถานประกอบการ|organisation.?s?\s*name|organization.?s?\s*name|company\s*name/i.test(
          upper
        )
      ) {
        columns.set('company', column)
      } else if (
        /จังหวัด|province/i.test(current) ||
        /จังหวัด|province/i.test(upper)
      ) {
        columns.set('province', column)
      }
    }
    if (columns.size === 0) continue
    for (let index = headerIndex + 1; index < grid.length; index++) {
      const record = grid[index]!
      const studentId = text(record[idColumn]).replace(/\.0$/, '')
      if (!/^\d{7,20}$/.test(studentId)) continue
      if (rows.length >= 1000) throw new Error('WORKBOOK_ROW_LIMIT_EXCEEDED')
      const contacts: StudentContacts = {}
      for (const field of STUDENT_CONTACT_FIELDS) {
        const column = columns.get(field)
        const value = column === undefined ? '' : text(record[column])
        if (value && !['-', '—', 'n/a'].includes(value.toLowerCase())) {
          contacts[field] = field.endsWith('Email')
            ? value.toLowerCase()
            : value
        }
      }
      const editedColumn = columns.get('editedEmail')
      const editedEmail =
        editedColumn === undefined ? '' : text(record[editedColumn])
      if (editedEmail && !['-', '—'].includes(editedEmail))
        contacts.evaluatorEmail = editedEmail.toLowerCase()
      const issues = Object.entries(contacts).flatMap(([field, value]) =>
        field.endsWith('Email') && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)
          ? [
              {
                code: 'INVALID_CONTACT_EMAIL',
                field,
                message: `Invalid contact email: ${field}`
              }
            ]
          : value.length > 1000
            ? [
                {
                  code: 'CONTACT_VALUE_TOO_LONG',
                  field,
                  message: `Contact value is too long: ${field}`
                }
              ]
            : []
      )
      rows.push({
        key: `${sheetName}:${index + 1}`,
        sheet: sheetName,
        rowNumber: index + 1,
        studentId,
        name: '',
        nameTh: '',
        nameEn: '',
        email: '',
        schoolReference: '',
        programReference: '',
        questionFields: [],
        contacts,
        issues
      })
    }
  }
  if (rows.length === 0) throw new Error('WORKBOOK_NO_STUDENT_ROWS')
  const counts = new Map<string, number>()
  for (const row of rows)
    counts.set(row.studentId, (counts.get(row.studentId) ?? 0) + 1)
  return {
    questionFields: [],
    rows: rows.map((row) =>
      (counts.get(row.studentId) ?? 0) > 1
        ? {
            ...row,
            issues: [
              ...row.issues,
              {
                code: 'DUPLICATE_SOURCE_ID',
                field: 'studentId',
                message:
                  'Student ID occurs in multiple contact rows; select the correct term/sheet in a separate file.'
              }
            ]
          }
        : row
    )
  }
}

function text(value: unknown): string {
  return typeof value === 'string'
    ? value.trim().replace(/\s+/g, ' ')
    : typeof value === 'number' && Number.isFinite(value)
      ? String(value)
      : ''
}
