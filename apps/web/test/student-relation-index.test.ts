import { describe, expect, it } from 'vitest'

import {
  getStudentRelations,
  indexStudentRelations
} from '../app/utils/student-relation-index.js'

describe('student relation index', () => {
  it('resolves canonical and business student references in source order', () => {
    const index = indexStudentRelations([
      { id: 'placement-2', studentId: '6531501002', value: 2 },
      { id: 'placement-1', studentId: 'student-record-1', value: 1 },
      { id: 'placement-3', studentId: 'student-record-1', value: 3 }
    ])

    expect(
      getStudentRelations(index, ['student-record-1', '6531501002'])
    ).toEqual([
      { id: 'placement-2', studentId: '6531501002', value: 2 },
      { id: 'placement-1', studentId: 'student-record-1', value: 1 },
      { id: 'placement-3', studentId: 'student-record-1', value: 3 }
    ])
  })

  it('deduplicates repeated references and excludes unrelated records', () => {
    const index = indexStudentRelations([
      { id: 'assignment-1', studentId: 'student-1' },
      { id: 'assignment-2', studentId: 'student-2' }
    ])

    expect(
      getStudentRelations(index, ['student-1', 'student-1', 'unknown'])
    ).toEqual([{ id: 'assignment-1', studentId: 'student-1' }])
  })
})
