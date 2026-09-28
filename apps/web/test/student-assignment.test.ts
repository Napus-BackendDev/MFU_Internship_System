import { describe, expect, it } from 'vitest'

import { selectCurrentStudentAssignment } from '../app/utils/student-assignment'

describe('student current assignment selection', () => {
  it('does not show an older submitted result over a newer pending cycle', () => {
    const previousSubmitted = {
      id: 'previous-submitted',
      studentId: 'student-record-1',
      status: 'submitted',
      createdAt: '2026-01-01T00:00:00.000Z'
    }
    const currentPending = {
      id: 'current-pending',
      studentId: 'STU-001',
      status: 'pending',
      createdAt: '2026-08-01T00:00:00.000Z'
    }
    const newerForeignAssignment = {
      id: 'foreign-submitted',
      studentId: 'STU-002',
      status: 'submitted',
      createdAt: '2026-09-01T00:00:00.000Z'
    }

    expect(
      selectCurrentStudentAssignment(
        [previousSubmitted, currentPending, newerForeignAssignment],
        'student-record-1',
        'STU-001'
      )
    ).toEqual(currentPending)
  })

  it('does not pick a foreign or undated assignment when own timestamps are invalid', () => {
    expect(
      selectCurrentStudentAssignment(
        [
          {
            id: 'own-undated',
            studentId: 'student-record-1',
            status: 'submitted',
            createdAt: 'not-a-date'
          },
          {
            id: 'foreign-current',
            studentId: 'STU-002',
            status: 'pending',
            createdAt: '2026-09-01T00:00:00.000Z'
          }
        ],
        'student-record-1',
        'STU-001'
      )
    ).toBeNull()
  })
})
