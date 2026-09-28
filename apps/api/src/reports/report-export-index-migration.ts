import type { Connection } from 'mongoose'
import type { CreateIndexesOptions } from 'mongodb'
interface ReportExportIndexDefinition {
  readonly collection: 'reportExports' | 'reportExportSnapshots'
  readonly key: Readonly<Record<string, 1 | -1>>
  readonly options: Readonly<CreateIndexesOptions> & { readonly name: string }
}

export const REPORT_EXPORT_INDEXES: readonly ReportExportIndexDefinition[] = [
  {
    collection: 'reportExports',
    key: { status: 1, processingLeaseUntil: 1, expiresAt: 1 },
    options: { name: 'report_export_recovery' }
  },
  {
    collection: 'reportExports',
    key: { expiresAt: 1 },
    options: { name: 'report_export_expiry' }
  },
  {
    collection: 'reportExportSnapshots',
    key: { expiresAt: 1 },
    options: {
      name: 'report_export_snapshot_expiry',
      expireAfterSeconds: 0
    }
  },
  {
    collection: 'reportExportSnapshots',
    key: { exportId: 1, schoolId: 1, programId: 1 },
    options: { name: 'report_export_scope' }
  }
]

export interface ReportExportIndexMigrationResult {
  readonly collection: string
  readonly name: string
  readonly action: 'already-present' | 'would-create' | 'created'
}

export async function migrateReportExportIndexes(
  connection: Connection,
  apply: boolean
): Promise<ReportExportIndexMigrationResult[]> {
  if (!connection.db) throw new Error('MONGODB_NOT_CONNECTED')
  const results: ReportExportIndexMigrationResult[] = []

  for (const definition of REPORT_EXPORT_INDEXES) {
    const collection = connection.db.collection(definition.collection)
    const collectionExists = await connection.db
      .listCollections({ name: definition.collection }, { nameOnly: true })
      .hasNext()
    const indexes = collectionExists ? await collection.indexes() : []
    const namedIndex = indexes.find(
      (index) => index.name === definition.options.name
    )
    if (namedIndex) {
      const actualKey = JSON.stringify(Object.entries(namedIndex.key))
      const expectedKey = JSON.stringify(Object.entries(definition.key))
      const actualTtl = namedIndex.expireAfterSeconds
      const expectedTtl = definition.options.expireAfterSeconds
      if (actualKey !== expectedKey || actualTtl !== expectedTtl) {
        throw new Error(
          `REPORT_EXPORT_INDEX_CONFLICT:${definition.options.name}`
        )
      }
      results.push({
        collection: definition.collection,
        name: definition.options.name,
        action: 'already-present'
      })
      continue
    }

    if (!apply) {
      results.push({
        collection: definition.collection,
        name: definition.options.name,
        action: 'would-create'
      })
      continue
    }

    await collection.createIndex(definition.key, definition.options)
    results.push({
      collection: definition.collection,
      name: definition.options.name,
      action: 'created'
    })
  }
  return results
}
