import { Types, type QueryFilter } from 'mongoose'

import type { StudentRecord } from './members.schema.js'

export function studentReferenceFilter(
  reference: string
): QueryFilter<StudentRecord> {
  return {
    $or: [
      { studentId: reference },
      ...(Types.ObjectId.isValid(reference)
        ? [{ _id: new Types.ObjectId(reference) }]
        : [])
    ]
  }
}
