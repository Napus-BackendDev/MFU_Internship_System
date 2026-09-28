export interface StudentRowPersistenceResult<Row> {
  readonly saved: readonly Row[]
  readonly failed: readonly Row[]
}

export async function persistStudentRows<Row>(
  rows: readonly Row[],
  persist: (row: Row) => Promise<unknown>
): Promise<StudentRowPersistenceResult<Row>> {
  const saved: Row[] = []
  const failed: Row[] = []

  for (const row of rows) {
    try {
      await persist(row)
      saved.push(row)
    } catch {
      failed.push(row)
    }
  }

  return { saved, failed }
}
