import type { ReportExportField } from '@internship/shared-types'

const FIELD_LABELS: Readonly<Record<ReportExportField, string>> = {
  studentNumber: 'Student Number',
  studentName: 'Student Name',
  studentEmail: 'Student Email',
  schoolId: 'School ID',
  programId: 'Program ID',
  termId: 'Academic Term ID',
  cycleId: 'Evaluation Cycle ID',
  status: 'Assignment Status',
  deadlineAt: 'Deadline'
}

function escapeCsvCell(value: string): string {
  const safeValue = /^[\s]*[=+\-@\t\r\n]/.test(value) ? `'${value}` : value
  return /[",\r\n]/.test(safeValue)
    ? `"${safeValue.replaceAll('"', '""')}"`
    : safeValue
}

export function renderReportExportCsv(
  fields: readonly ReportExportField[],
  rows: readonly {
    readonly values: Readonly<Record<string, string | number>>
  }[]
): string {
  const lines = [
    fields.map((field) => escapeCsvCell(FIELD_LABELS[field])).join(',')
  ]
  for (const row of rows) {
    lines.push(
      fields
        .map((field) => escapeCsvCell(String(row.values[field] ?? '')))
        .join(',')
    )
  }
  return `\uFEFF${lines.join('\r\n')}\r\n`
}
