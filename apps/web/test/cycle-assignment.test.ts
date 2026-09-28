import { describe, expect, it } from 'vitest'

import { resolveAssignmentForCycle } from '../app/utils/cycle-assignment.js'

describe('student directory assignment cycle selection', () => {
  const assignments = [
    { id: 'old-cycle', cycleId: 'cycle-old', status: 'submitted' },
    { id: 'current-cycle', cycleId: 'cycle-current', status: 'pending' }
  ]

  it('does not pick a cross-cycle assignment until a cycle is selected', () => {
    expect(resolveAssignmentForCycle(assignments, 'all')).toEqual({
      requiresCycleSelection: true,
      ambiguous: false,
      unavailable: false
    })
  })

  it('returns only the assignment belonging to the selected cycle', () => {
    expect(resolveAssignmentForCycle(assignments, 'cycle-current')).toEqual({
      assignment: assignments[1],
      requiresCycleSelection: false,
      ambiguous: false,
      unavailable: false
    })
  })

  it('surfaces duplicate records instead of choosing one arbitrarily', () => {
    expect(
      resolveAssignmentForCycle(
        [...assignments, { id: 'duplicate', cycleId: 'cycle-current' }],
        'cycle-current'
      )
    ).toEqual({
      requiresCycleSelection: false,
      ambiguous: true,
      unavailable: false
    })
  })

  it('treats a missing assignment in the selected cycle as awaiting assignment', () => {
    expect(resolveAssignmentForCycle(assignments, 'cycle-new')).toEqual({
      requiresCycleSelection: false,
      ambiguous: false,
      unavailable: false
    })
  })

  it('does not present an assignment-list outage as an unassigned student', () => {
    expect(resolveAssignmentForCycle([], 'cycle-current', true)).toEqual({
      requiresCycleSelection: false,
      ambiguous: false,
      unavailable: true
    })
  })
})
