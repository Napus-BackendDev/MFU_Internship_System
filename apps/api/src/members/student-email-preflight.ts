import { createHash } from 'node:crypto'
import type { Connection } from 'mongoose'
import { z } from 'zod'

interface StudentEmailRow {
  readonly _id: unknown
  readonly studentId?: unknown
  readonly email?: unknown
}

export interface StudentEmailDuplicateGroup {
  readonly emailFingerprint: string
  readonly studentRecordIds: readonly string[]
}

export interface StudentEmailPreflightReport {
  readonly scannedRecords: number
  readonly nonCanonicalRecords: number
  readonly invalidRecords: readonly string[]
  readonly duplicateGroups: readonly StudentEmailDuplicateGroup[]
  readonly normalizedUniqueIndexPresent: boolean
}

export interface StudentEmailIndexMigrationOptions {
  readonly apply: boolean
  readonly confirmedDatabaseName?: string
  readonly writesPaused?: boolean
}

function normalizedEmail(value: string): string {
  return value.trim().toLowerCase()
}

function recordId(row: StudentEmailRow): string {
  return typeof row.studentId === 'string' ? row.studentId : String(row._id)
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export async function profileStudentEmailUniqueness(
  connection: Connection
): Promise<StudentEmailPreflightReport> {
  const database = connection.db
  if (!database) throw new Error('MONGODB_CONNECTION_NOT_READY')

  const collection = database.collection<StudentEmailRow>('students')
  const cursor = collection
    .find({}, { projection: { studentId: 1, email: 1 } })
    .batchSize(500)
  const groups = new Map<string, string[]>()
  const invalidRecords: string[] = []
  let scannedRecords = 0
  let nonCanonicalRecords = 0

  for await (const row of cursor) {
    scannedRecords += 1
    const id = recordId(row)
    if (typeof row.email !== 'string') {
      invalidRecords.push(id)
      continue
    }

    const normalized = normalizedEmail(row.email)
    if (row.email !== normalized) nonCanonicalRecords += 1
    if (!z.email().safeParse(normalized).success) invalidRecords.push(id)
    if (normalized) {
      const ids = groups.get(normalized) ?? []
      ids.push(id)
      groups.set(normalized, ids)
    }
  }

  const duplicateGroups = [...groups.entries()]
    .filter(([, ids]) => ids.length > 1)
    .map(([email, ids]) => ({
      emailFingerprint: createHash('sha256')
        .update(email)
        .digest('hex')
        .slice(0, 16),
      studentRecordIds: ids.sort()
    }))
    .sort((a, b) => a.emailFingerprint.localeCompare(b.emailFingerprint))

  const rawIndexes: unknown = await collection.listIndexes().toArray()
  const normalizedUniqueIndexPresent =
    Array.isArray(rawIndexes) &&
    rawIndexes.some((candidate: unknown) => {
      if (!isRecord(candidate) || !isRecord(candidate.key)) return false
      return (
        candidate.name === 'student_email_normalized_unique_v1' &&
        candidate.unique === true &&
        candidate.key.email === 1 &&
        isRecord(candidate.collation) &&
        candidate.collation.locale === 'en' &&
        candidate.collation.strength === 2
      )
    })

  return {
    scannedRecords,
    nonCanonicalRecords,
    invalidRecords: invalidRecords.sort(),
    duplicateGroups,
    normalizedUniqueIndexPresent
  }
}

export async function migrateStudentEmailUniqueIndex(
  connection: Connection,
  options: StudentEmailIndexMigrationOptions
): Promise<StudentEmailPreflightReport> {
  const report = await profileStudentEmailUniqueness(connection)
  if (!options.apply || report.normalizedUniqueIndexPresent) return report

  const database = connection.db
  if (!database) throw new Error('MONGODB_CONNECTION_NOT_READY')
  if (options.confirmedDatabaseName !== database.databaseName) {
    throw new Error('STUDENT_EMAIL_MIGRATION_DATABASE_CONFIRMATION_MISMATCH')
  }
  if (options.writesPaused !== true) {
    throw new Error('STUDENT_EMAIL_MIGRATION_REQUIRES_WRITE_PAUSE')
  }
  if (
    report.invalidRecords.length > 0 ||
    report.nonCanonicalRecords > 0 ||
    report.duplicateGroups.length > 0
  ) {
    throw new Error('STUDENT_EMAIL_DATA_REQUIRES_RECONCILIATION')
  }

  await database.collection('students').createIndex(
    { email: 1 },
    {
      name: 'student_email_normalized_unique_v1',
      unique: true,
      collation: { locale: 'en', strength: 2 }
    }
  )
  return profileStudentEmailUniqueness(connection)
}
