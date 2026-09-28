import { describe, expect, it } from 'vitest'

import { renderReportExportCsv } from '../src/runtime/report-export.csv.js'

describe('report export CSV rendering', () => {
  it('uses only the requested column order and neutralizes spreadsheet formulas', () => {
    const csv = renderReportExportCsv(
      ['studentName', 'status'],
      [
        {
          values: {
            studentName: '=HYPERLINK("https://example.test","open")',
            status: 'submitted',
            studentEmail: 'must-not-be-exported@example.test'
          }
        }
      ]
    )

    expect(csv).toBe(
      '\uFEFFStudent Name,Assignment Status\r\n"\'=HYPERLINK(""https://example.test"",""open"")",submitted\r\n'
    )
    expect(csv).not.toContain('must-not-be-exported')
  })

  it('quotes commas, quotes, and line breaks using RFC 4180 records', () => {
    const csv = renderReportExportCsv(
      ['studentName'],
      [{ values: { studentName: 'Doe, "Jane"\nIntern' } }]
    )

    expect(csv).toBe('\uFEFFStudent Name\r\n"Doe, ""Jane""\nIntern"\r\n')
  })
})
