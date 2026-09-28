export interface StudentPlacementReference {
  readonly id: string
  readonly studentId: string
}

export function resolveUniqueStudentPlacement<
  T extends StudentPlacementReference
>(
  placements: readonly T[],
  studentRecordId: string | undefined,
  studentNumber: string | undefined
): { readonly placement: T | null; readonly ambiguous: boolean } {
  const studentReferences = new Set(
    [studentRecordId, studentNumber].filter((reference): reference is string =>
      Boolean(reference)
    )
  )
  if (studentReferences.size === 0) {
    return { placement: null, ambiguous: false }
  }

  const matchingPlacements = new Map(
    placements
      .filter((placement) => studentReferences.has(placement.studentId))
      .map((placement) => [placement.id, placement])
  )
  const matches = [...matchingPlacements.values()]
  return matches.length === 1
    ? { placement: matches[0] ?? null, ambiguous: false }
    : { placement: null, ambiguous: matches.length > 1 }
}
