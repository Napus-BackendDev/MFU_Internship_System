export interface CycleAssignmentReference {
  readonly cycleId?: string
}

export interface CycleAssignmentResolution<T extends CycleAssignmentReference> {
  readonly assignment?: T
  readonly requiresCycleSelection: boolean
  readonly ambiguous: boolean
  readonly unavailable: boolean
}

export function resolveAssignmentForCycle<T extends CycleAssignmentReference>(
  assignments: readonly T[],
  selectedCycleId: string,
  assignmentDataUnavailable = false
): CycleAssignmentResolution<T> {
  if (selectedCycleId === 'all') {
    return {
      requiresCycleSelection: true,
      ambiguous: false,
      unavailable: false
    }
  }
  if (assignmentDataUnavailable) {
    return {
      requiresCycleSelection: false,
      ambiguous: false,
      unavailable: true
    }
  }

  const matches = assignments.filter(
    (assignment) => assignment.cycleId === selectedCycleId
  )
  if (matches.length > 1) {
    return {
      requiresCycleSelection: false,
      ambiguous: true,
      unavailable: false
    }
  }
  return {
    ...(matches[0] ? { assignment: matches[0] } : {}),
    requiresCycleSelection: false,
    ambiguous: false,
    unavailable: false
  }
}
