import type { Connection } from 'mongoose'

const INDEX_DEFINITIONS = [
  {
    collection: 'emailTemplates',
    key: { code: 1 },
    name: 'uniq_email_template_code',
    unique: true
  },
  {
    collection: 'emailTemplateVersions',
    key: { templateId: 1, versionNumber: 1 },
    name: 'uniq_email_template_version',
    unique: true
  }
] as const

type IndexDefinition = (typeof INDEX_DEFINITIONS)[number]
type IndexAction =
  'already-present' | 'would-create' | 'created' | 'blocked' | 'conflict'

export interface EmailTemplateIndexMigrationOptions {
  readonly apply: boolean
  readonly confirmedDatabaseName?: string
}

export interface EmailTemplateIndexMigrationItem {
  readonly collection: IndexDefinition['collection']
  readonly name: IndexDefinition['name']
  readonly action: IndexAction
  readonly duplicateGroupCount: number
  readonly invalidDocumentCount: number
}

function exactKey(
  actual: unknown,
  expected: Readonly<Record<string, number>>
): boolean {
  if (typeof actual !== 'object' || actual === null || Array.isArray(actual)) {
    return false
  }
  const entries = Object.entries(actual)
  return (
    entries.length === Object.keys(expected).length &&
    entries.every(([field, direction]) => expected[field] === direction)
  )
}

function property(value: unknown, key: string): unknown {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return undefined
  }
  return (value as Record<string, unknown>)[key]
}

function hasSimpleEffectiveCollation(
  indexCollation: unknown,
  collectionCollation: unknown
): boolean {
  const collation = indexCollation ?? collectionCollation
  return (
    typeof collation !== 'object' ||
    collation === null ||
    (!Array.isArray(collation) &&
      'locale' in collation &&
      (collation as { locale?: unknown }).locale === 'simple')
  )
}

async function collectionExists(
  connection: Connection,
  name: IndexDefinition['collection']
): Promise<boolean> {
  if (!connection.db) throw new Error('MONGODB_NOT_CONNECTED')
  return connection.db.listCollections({ name }, { nameOnly: true }).hasNext()
}

async function duplicateGroupCount(
  connection: Connection,
  definition: IndexDefinition
): Promise<number> {
  if (!connection.db) throw new Error('MONGODB_NOT_CONNECTED')
  if (!(await collectionExists(connection, definition.collection))) return 0
  const groupFields = Object.keys(definition.key)
  const groupId = Object.fromEntries(
    groupFields.map((field) => [field, `$${field}`])
  )
  const rows = await connection.db
    .collection(definition.collection)
    .aggregate([
      { $group: { _id: groupId, count: { $sum: 1 } } },
      { $match: { count: { $gt: 1 } } },
      { $count: 'count' }
    ])
    .toArray()
  return Number(rows[0]?.['count'] ?? 0)
}

async function invalidDocumentCount(
  connection: Connection,
  definition: IndexDefinition
): Promise<number> {
  if (!connection.db) throw new Error('MONGODB_NOT_CONNECTED')
  if (!(await collectionExists(connection, definition.collection))) return 0
  const invalidFilter =
    definition.collection === 'emailTemplates'
      ? {
          $expr: {
            $or: [
              { $ne: [{ $type: '$code' }, 'string'] },
              { $eq: ['$code', ''] }
            ]
          }
        }
      : {
          $expr: {
            $or: [
              { $ne: [{ $type: '$templateId' }, 'string'] },
              { $eq: ['$templateId', ''] },
              {
                $cond: [
                  { $isNumber: '$versionNumber' },
                  {
                    $or: [
                      { $lt: ['$versionNumber', 1] },
                      { $ne: [{ $mod: ['$versionNumber', 1] }, 0] }
                    ]
                  },
                  true
                ]
              }
            ]
          }
        }
  return connection.db
    .collection(definition.collection)
    .countDocuments(invalidFilter)
}

export async function migrateEmailTemplateIndexes(
  connection: Connection,
  options: EmailTemplateIndexMigrationOptions
): Promise<{
  readonly databaseName: string
  readonly dryRun: boolean
  readonly indexes: readonly EmailTemplateIndexMigrationItem[]
}> {
  const database = connection.db
  if (!database) throw new Error('MONGODB_NOT_CONNECTED')
  if (options.apply && options.confirmedDatabaseName !== connection.name) {
    throw new Error('EMAIL_TEMPLATE_INDEX_DATABASE_CONFIRMATION_REQUIRED')
  }
  if (!options.apply && options.confirmedDatabaseName) {
    throw new Error('EMAIL_TEMPLATE_INDEX_CONFIRMATION_REQUIRES_APPLY')
  }

  const inspected = await Promise.all(
    INDEX_DEFINITIONS.map(async (definition) => {
      const exists = await collectionExists(connection, definition.collection)
      const collection = database.collection(definition.collection)
      const indexes = exists ? await collection.indexes() : []
      const collectionInfo = exists
        ? await database
            .listCollections(
              { name: definition.collection },
              { nameOnly: false }
            )
            .next()
        : null
      const defaultCollation = property(
        property(collectionInfo, 'options'),
        'collation'
      )
      const duplicates = await duplicateGroupCount(connection, definition)
      const invalidCount = await invalidDocumentCount(connection, definition)
      const exactIndexes = indexes.filter((index) =>
        exactKey(index.key, definition.key)
      )
      const matchingIndex = exactIndexes.find(
        (index) =>
          index.unique === definition.unique &&
          hasSimpleEffectiveCollation(index.collation, defaultCollation)
      )
      const conflictingIndex = exactIndexes.some(
        (index) =>
          index.unique !== definition.unique ||
          !hasSimpleEffectiveCollation(index.collation, defaultCollation)
      )
      const namedIndex = indexes.find((index) => index.name === definition.name)
      const nameConflict =
        namedIndex !== undefined && !exactKey(namedIndex.key, definition.key)
      const action: IndexAction =
        duplicates > 0 || invalidCount > 0
          ? 'blocked'
          : nameConflict || conflictingIndex
            ? 'conflict'
            : matchingIndex
              ? 'already-present'
              : 'would-create'
      return {
        definition,
        action,
        duplicateGroupCount: duplicates,
        invalidDocumentCount: invalidCount
      }
    })
  )

  const blocked = inspected.some(
    (item) => item.action === 'blocked' || item.action === 'conflict'
  )
  const indexes: EmailTemplateIndexMigrationItem[] = []
  for (const item of inspected) {
    let action: IndexAction = item.action
    if (options.apply && !blocked && action === 'would-create') {
      await database
        .collection(item.definition.collection)
        .createIndex(item.definition.key, {
          name: item.definition.name,
          unique: item.definition.unique,
          collation: { locale: 'simple' }
        })
      action = 'created'
    }
    indexes.push({
      collection: item.definition.collection,
      name: item.definition.name,
      action,
      duplicateGroupCount: item.duplicateGroupCount,
      invalidDocumentCount: item.invalidDocumentCount
    })
  }

  return {
    databaseName: connection.name,
    dryRun: !options.apply,
    indexes
  }
}
