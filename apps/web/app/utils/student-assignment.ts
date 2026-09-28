export interface StudentAssignmentCandidate {
  readonly studentId: string
  readonly status: string
  readonly createdAt: string
}

export function selectCurrentStudentAssignment<
  T extends StudentAssignmentCandidate
>(
  assignments: readonly T[],
  studentRecordId: string,
  studentNumber: string
): T | null {
  const matchingAssignments = assignments.filter(
    (assignment) =>
      assignment.studentId === studentRecordId ||
      assignment.studentId === studentNumber
  )
  const timestampedAssignments = matchingAssignments
    .map((assignment) => ({
      assignment,
      createdAt: Date.parse(assignment.createdAt)
    }))
    .filter(({ createdAt }) => Number.isFinite(createdAt))

  return (
    timestampedAssignments.reduce<
      (typeof timestampedAssignments)[number] | null
    >(
      (latest, candidate) =>
        latest === null || candidate.createdAt > latest.createdAt
          ? candidate
          : latest,
      null
    )?.assignment ?? null
  )
}
