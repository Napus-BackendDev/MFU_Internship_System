import type { Connection } from 'mongoose'

interface AuditScopeIndexDefinition {
  readonly name: string
  readonly key: Readonly<Record<string, 1 | -1>>
}

export const AUDIT_SCOPE_INDEXES: readonly AuditScopeIndexDefinition[] = [
  {
    name: 'audit_resource_scopes_school_created_at',
    key: { 'resourceScopes.schoolIds': 1, createdAt: -1 }
  },
  {
    name: 'audit_resource_scopes_program_created_at',
    key: { 'resourceScopes.programIds': 1, createdAt: -1 }
  }
]

export interface AuditScopeIndexMigrationOptions {
  readonly apply: boolean
  readonly confirmedDatabaseName?: string
}

export interface AuditScopeIndexMigrationReport {
  readonly databaseName: string
  readonly collection: 'auditLogs'
  readonly dryRun: boolean
  readonly indexes: readonly {
    readonly name: string
    readonly key: Readonly<Record<string, 1 | -1>>
    readonly status: 'present' | 'missing' | 'created' | 'conflict'
  }[]
}

function sameIndexKey(
  actual: unknown,
  expected: Readonly<Record<string, 1 | -1>>
): boolean {
  if (typeof actual !== 'object' || actual === null || Array.isArray(actual)) {
    return false
  }
  return (
    JSON.stringify(Object.entries(actual)) ===
    JSON.stringify(Object.entries(expected))
  )
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export async function migrateAuditScopeIndexes(
  connection: Connection,
  options: AuditScopeIndexMigrationOptions
): Promise<AuditScopeIndexMigrationReport> {
  const database = connection.db
  if (!database) throw new Error('AUDIT_SCOPE_INDEX_DATABASE_UNAVAILABLE')
  if (options.apply && options.confirmedDatabaseName !== connection.name) {
    throw new Error('AUDIT_SCOPE_INDEX_DATABASE_CONFIRMATION_REQUIRED')
  }
  if (!options.apply && options.confirmedDatabaseName) {
    throw new Error('AUDIT_SCOPE_INDEX_CONFIRMATION_REQUIRES_APPLY')
  }

  const collectionExists = await database
    .listCollections({ name: 'auditLogs' }, { nameOnly: true })
    .hasNext()
  const collection = database.collection('auditLogs')
  const rawIndexes: unknown = collectionExists
    ? await collection.listIndexes().toArray()
    : []
  const existingIndexes = Array.isArray(rawIndexes)
    ? rawIndexes.filter(isRecord)
    : []
  const plannedIndexes = AUDIT_SCOPE_INDEXES.map((definition) => {
    const namedIndex = existingIndexes.find(
      (index) => index.name === definition.name
    )
    if (namedIndex && !sameIndexKey(namedIndex['key'], definition.key)) {
      return { ...definition, status: 'conflict' as const }
    }
    const matchingIndex = existingIndexes.some((index) =>
      sameIndexKey(index['key'], definition.key)
    )
    return {
      ...definition,
      status: matchingIndex ? ('present' as const) : ('missing' as const)
    }
  })

  if (!options.apply) {
    return {
      databaseName: connection.name,
      collection: 'auditLogs',
      dryRun: true,
      indexes: plannedIndexes
    }
  }
  if (plannedIndexes.some((index) => index.status === 'conflict')) {
    throw new Error('AUDIT_SCOPE_INDEX_NAME_CONFLICT')
  }

  if (!collectionExists) {
    try {
      await database.createCollection('auditLogs')
    } catch (error) {
      if (
        typeof error !== 'object' ||
        error === null ||
        !('code' in error) ||
        error.code !== 48
      ) {
        throw error
      }
    }
  }
  const appliedIndexes: AuditScopeIndexMigrationReport['indexes'][number][] = []
  for (const index of plannedIndexes) {
    if (index.status === 'present') {
      appliedIndexes.push(index)
      continue
    }
    await collection.createIndex(index.key, { name: index.name })
    appliedIndexes.push({ ...index, status: 'created' as const })
  }
  return {
    databaseName: connection.name,
    collection: 'auditLogs',
    dryRun: false,
    indexes: appliedIndexes
  }
}
