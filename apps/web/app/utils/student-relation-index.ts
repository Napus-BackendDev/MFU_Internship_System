export interface StudentReferencedRecord {
  readonly id: string
  readonly studentId: string
}

export interface StudentRelationIndex<T extends StudentReferencedRecord> {
  readonly recordsByStudentReference: ReadonlyMap<string, readonly T[]>
  readonly orderByRecordId: ReadonlyMap<string, number>
}

export function indexStudentRelations<T extends StudentReferencedRecord>(
  records: readonly T[]
): StudentRelationIndex<T> {
  const recordsByStudentReference = new Map<string, T[]>()
  const orderByRecordId = new Map<string, number>()

  records.forEach((record, index) => {
    if (!orderByRecordId.has(record.id)) {
      orderByRecordId.set(record.id, index)
    }
    if (!record.studentId) return

    const matches = recordsByStudentReference.get(record.studentId) ?? []
    matches.push(record)
    recordsByStudentReference.set(record.studentId, matches)
  })

  return { recordsByStudentReference, orderByRecordId }
}

export function getStudentRelations<T extends StudentReferencedRecord>(
  index: StudentRelationIndex<T>,
  references: readonly string[]
): T[] {
  const matchesById = new Map<string, T>()
  for (const reference of references) {
    if (!reference) continue
    for (const record of index.recordsByStudentReference.get(reference) ?? []) {
      if (!matchesById.has(record.id)) matchesById.set(record.id, record)
    }
  }

  return [...matchesById.values()].sort(
    (first, second) =>
      (index.orderByRecordId.get(first.id) ?? 0) -
      (index.orderByRecordId.get(second.id) ?? 0)
  )
}
