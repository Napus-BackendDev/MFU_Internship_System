import { createHash } from 'node:crypto'

import type { Document } from 'mongodb'
import type { Connection } from 'mongoose'

const COLLECTION_NAME = 'users'
const LEGACY_SUBJECT_INDEX_KEY = { oidcSubject: 1 } as const
const IDENTITY_INDEX_NAME = 'uniq_oidc_issuer_subject'
const IDENTITY_INDEX_KEY = { oidcIssuer: 1, oidcSubject: 1 } as const
const DUPLICATE_SAMPLE_LIMIT = 25

interface IndexDescription {
  readonly name?: unknown
  readonly key?: unknown
  readonly unique?: unknown
  readonly sparse?: unknown
  readonly partialFilterExpression?: unknown
  readonly collation?: unknown
}

interface DuplicateIdentityGroup {
  readonly _id: {
    readonly issuer?: unknown
    readonly subject?: unknown
  }
  readonly count: number
}

type IndexStatus = 'present' | 'missing' | 'created' | 'conflict' | 'blocked'
type LegacyIndexStatus = 'present' | 'absent' | 'dropped'

export interface OidcIdentityIndexMigrationOptions {
  readonly apply: boolean
  readonly confirmedDatabaseName?: string
}

export interface OidcIdentityIndexMigrationReport {
  readonly databaseName: string
  readonly collection: typeof COLLECTION_NAME
  readonly dryRun: boolean
  readonly duplicateIdentityGroupCount: number
  readonly duplicateIdentitySample: readonly {
    readonly identityHash: string
    readonly count: number
  }[]
  readonly invalidIdentityCount: number
  readonly identityIndex: {
    readonly name: typeof IDENTITY_INDEX_NAME
    readonly key: typeof IDENTITY_INDEX_KEY
    readonly unique: true
    readonly status: IndexStatus
  }
  readonly legacySubjectIndex: {
    readonly names: readonly string[]
    readonly status: LegacyIndexStatus
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function matchesIndexKey(
  value: unknown,
  expected: Readonly<Record<string, number>>
): boolean {
  if (!isRecord(value)) return false
  const entries = Object.entries(value)
  return (
    entries.length === Object.keys(expected).length &&
    entries.every(([key, direction]) => expected[key] === direction)
  )
}

function isPlainGlobalUniqueIndex(index: IndexDescription): boolean {
  return (
    index.unique === true &&
    index.sparse !== true &&
    index.partialFilterExpression === undefined &&
    index.collation === undefined
  )
}

function hasExactStringCollation(index: IndexDescription): boolean {
  if (index.collation === undefined) return true
  return isRecord(index.collation) && index.collation['locale'] === 'simple'
}

function identityHash(group: DuplicateIdentityGroup): string {
  const issuer = typeof group._id.issuer === 'string' ? group._id.issuer : null
  const subject =
    typeof group._id.subject === 'string' ? group._id.subject : null
  return createHash('sha256')
    .update(JSON.stringify([issuer, subject]))
    .digest('hex')
}

async function countAggregation(
  collection: ReturnType<NonNullable<Connection['db']>['collection']>,
  pipeline: readonly Document[]
): Promise<number> {
  const rows = await collection
    .aggregate([...pipeline, { $count: 'count' }])
    .toArray()
  return Number(isRecord(rows[0]) ? (rows[0]['count'] ?? 0) : 0)
}

export async function migrateOidcIdentityIndex(
  connection: Connection,
  options: OidcIdentityIndexMigrationOptions
): Promise<OidcIdentityIndexMigrationReport> {
  const database = connection.db
  if (!database) throw new Error('OIDC_IDENTITY_INDEX_DATABASE_UNAVAILABLE')
  if (options.apply && options.confirmedDatabaseName !== connection.name) {
    throw new Error('OIDC_IDENTITY_INDEX_DATABASE_CONFIRMATION_REQUIRED')
  }
  if (!options.apply && options.confirmedDatabaseName) {
    throw new Error('OIDC_IDENTITY_INDEX_CONFIRMATION_REQUIRES_APPLY')
  }

  const collectionExists = await database
    .listCollections({ name: COLLECTION_NAME }, { nameOnly: true })
    .hasNext()
  const users = database.collection(COLLECTION_NAME)
  const rawIndexes: unknown = collectionExists
    ? await users.listIndexes().toArray()
    : []
  const indexes: IndexDescription[] = Array.isArray(rawIndexes)
    ? rawIndexes.filter(isRecord)
    : []

  const namedIdentityIndex = indexes.find(
    (index) => index.name === IDENTITY_INDEX_NAME
  )
  const identityIndexes = indexes.filter((index) =>
    matchesIndexKey(index.key, IDENTITY_INDEX_KEY)
  )
  const uniqueIdentityIndex = identityIndexes.find(
    (index) => index.unique === true && hasExactStringCollation(index)
  )
  const identityIndexConflict =
    (namedIdentityIndex !== undefined &&
      (!matchesIndexKey(namedIdentityIndex.key, IDENTITY_INDEX_KEY) ||
        namedIdentityIndex.unique !== true ||
        !hasExactStringCollation(namedIdentityIndex))) ||
    identityIndexes.some(
      (index) => index.unique !== true || !hasExactStringCollation(index)
    )

  const subjectIndexes = indexes.filter((index) =>
    matchesIndexKey(index.key, LEGACY_SUBJECT_INDEX_KEY)
  )
  const uniqueSubjectIndexes = subjectIndexes.filter(
    (index) => index.unique === true
  )
  const legacySubjectIndexConflict = uniqueSubjectIndexes.some(
    (index) => !isPlainGlobalUniqueIndex(index)
  )

  const duplicatePipeline: Document[] = [
    {
      $group: {
        _id: {
          issuer: { $ifNull: ['$oidcIssuer', null] },
          subject: '$oidcSubject'
        },
        count: { $sum: 1 }
      }
    },
    { $match: { count: { $gt: 1 } } }
  ]
  const duplicateIdentityGroupCount = collectionExists
    ? await countAggregation(users, duplicatePipeline)
    : 0
  const duplicateGroups: DuplicateIdentityGroup[] = collectionExists
    ? await users
        .aggregate<DuplicateIdentityGroup>([
          ...duplicatePipeline,
          { $sort: { count: -1 } },
          { $limit: DUPLICATE_SAMPLE_LIMIT }
        ])
        .toArray()
    : []
  const duplicateIdentitySample = duplicateGroups.map((group) => ({
    identityHash: identityHash(group),
    count: group.count
  }))

  const invalidIdentityCount = collectionExists
    ? await countAggregation(users, [
        {
          $match: {
            $expr: {
              $or: [
                { $ne: [{ $type: '$oidcSubject' }, 'string'] },
                { $eq: ['$oidcSubject', ''] },
                { $eq: ['$oidcIssuer', ''] },
                {
                  $not: [
                    {
                      $in: [
                        { $type: '$oidcIssuer' },
                        ['missing', 'null', 'string']
                      ]
                    }
                  ]
                }
              ]
            }
          }
        }
      ])
    : 0

  const identityIndexStatus: IndexStatus = identityIndexConflict
    ? 'conflict'
    : uniqueIdentityIndex
      ? 'present'
      : options.apply &&
          (duplicateIdentityGroupCount > 0 || invalidIdentityCount > 0)
        ? 'blocked'
        : 'missing'
  const initialLegacyStatus: LegacyIndexStatus =
    uniqueSubjectIndexes.length > 0 ? 'present' : 'absent'

  const report = (
    dryRun: boolean,
    nextIdentityIndexStatus: IndexStatus = identityIndexStatus,
    nextLegacyStatus: LegacyIndexStatus = initialLegacyStatus
  ): OidcIdentityIndexMigrationReport => ({
    databaseName: connection.name,
    collection: COLLECTION_NAME,
    dryRun,
    duplicateIdentityGroupCount,
    duplicateIdentitySample,
    invalidIdentityCount,
    identityIndex: {
      name: IDENTITY_INDEX_NAME,
      key: IDENTITY_INDEX_KEY,
      unique: true,
      status: nextIdentityIndexStatus
    },
    legacySubjectIndex: {
      names: uniqueSubjectIndexes.flatMap((index) =>
        typeof index.name === 'string' ? [index.name] : []
      ),
      status: nextLegacyStatus
    }
  })

  if (!options.apply) return report(true)
  if (identityIndexConflict) {
    throw new Error('OIDC_IDENTITY_INDEX_CONFLICT')
  }
  if (legacySubjectIndexConflict) {
    throw new Error('OIDC_LEGACY_SUBJECT_INDEX_CONFLICT')
  }
  if (duplicateIdentityGroupCount > 0 || invalidIdentityCount > 0) {
    return report(false, 'blocked')
  }

  let nextIdentityIndexStatus: IndexStatus = identityIndexStatus
  let nextLegacyStatus: LegacyIndexStatus = initialLegacyStatus
  if (!uniqueIdentityIndex) {
    await users.createIndex(IDENTITY_INDEX_KEY, {
      name: IDENTITY_INDEX_NAME,
      unique: true,
      collation: { locale: 'simple' }
    })
    nextIdentityIndexStatus = 'created'
  }

  for (const index of uniqueSubjectIndexes) {
    if (typeof index.name !== 'string') {
      throw new Error('OIDC_LEGACY_SUBJECT_INDEX_NAME_UNAVAILABLE')
    }
    await users.dropIndex(index.name)
  }
  if (uniqueSubjectIndexes.length > 0) nextLegacyStatus = 'dropped'

  return report(false, nextIdentityIndexStatus, nextLegacyStatus)
}
