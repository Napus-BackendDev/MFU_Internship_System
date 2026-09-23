import { Types } from 'mongoose'

export function studentReferenceFilter(reference: string): {
  $or: ({ studentId: string } | { _id: Types.ObjectId })[]
} {
  const alternatives: ({ studentId: string } | { _id: Types.ObjectId })[] = [
    { studentId: reference }
  ]
  if (Types.ObjectId.isValid(reference)) {
    alternatives.push({ _id: new Types.ObjectId(reference) })
  }
  return {
    $or: alternatives
  }
}
