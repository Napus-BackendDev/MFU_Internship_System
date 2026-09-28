import { describe, expect, it } from 'vitest'

import { resolveUniqueStudentPlacement } from '../app/utils/document-preview.js'

describe('document preview placement selection', () => {
  const placements = [
    { id: 'term-a', studentId: 'student-record-1', termId: 'term-a' },
    { id: 'term-b', studentId: 'student-number-1', termId: 'term-b' },
    { id: 'other-student', studentId: 'student-number-2', termId: 'term-a' }
  ]

  it('does not choose a placement when the student has multiple terms', () => {
    expect(
      resolveUniqueStudentPlacement(
        placements,
        'student-record-1',
        'student-number-1'
      )
    ).toEqual({ placement: null, ambiguous: true })
  })

  it('resolves a single placement using either canonical or business ID', () => {
    expect(
      resolveUniqueStudentPlacement(
        [placements[0]!],
        'student-record-1',
        'student-number-1'
      )
    ).toEqual({ placement: placements[0], ambiguous: false })
    expect(
      resolveUniqueStudentPlacement(
        [placements[1]!],
        'student-record-1',
        'student-number-1'
      )
    ).toEqual({ placement: placements[1], ambiguous: false })
  })

  it('does not resolve a missing or unselected student', () => {
    expect(
      resolveUniqueStudentPlacement(placements, undefined, undefined)
    ).toEqual({
      placement: null,
      ambiguous: false
    })
    expect(
      resolveUniqueStudentPlacement(
        placements,
        'missing-record',
        'missing-number'
      )
    ).toEqual({ placement: null, ambiguous: false })
  })
})
