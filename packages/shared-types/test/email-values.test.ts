import { describe, expect, it } from 'vitest'

import { formatAcademicTerm, formatInternshipPeriod } from '../src/index.js'

describe('email placeholder values', () => {
  it('names the term and prints the Buddhist-era year', () => {
    expect(formatAcademicTerm('1', 2026)).toBe('ภาคการศึกษาต้น ปีการศึกษา 2569')
    expect(formatAcademicTerm('summer', 2569)).toBe(
      'ภาคการศึกษาฤดูร้อน ปีการศึกษา 2569'
    )
    expect(formatAcademicTerm(undefined, undefined)).toBe('-')
  })

  it('prints the internship period as a Thai date range', () => {
    expect(
      formatInternshipPeriod('2025-08-04T00:00:00Z', '2025-11-21T00:00:00Z')
    ).toBe('4 ส.ค. 2568 – 21 พ.ย. 2568')
    expect(formatInternshipPeriod(undefined, undefined)).toBe('-')
  })
})
