import type { QueryFilter } from 'mongoose'

import type { EvaluationAssignmentRecord } from './evaluation.schema.js'

export function assignmentIdWithinScope(
  assignmentId: string,
  authorizedScope: QueryFilter<EvaluationAssignmentRecord>
): QueryFilter<EvaluationAssignmentRecord> {
  return { $and: [{ _id: assignmentId }, authorizedScope] }
}
