import { Types, type Connection } from 'mongoose'
import type { Collection, Document } from 'mongodb'

const COLLECTION_NAME = 'evaluationAssignments'
const PLACEMENT_INDEX_NAME = 'cycleId_1_placementId_1'
const PLACEMENT_INDEX_KEY = { cycleId: 1, placementId: 1 } as const
const STUDENT_INDEX_NAME = 'cycleId_1_studentId_1'
const STUDENT_INDEX_KEY = { cycleId: 1, studentId: 1 } as const
const DUPLICATE_SAMPLE_LIMIT = 100

interface DuplicateAssignmentGroup {
  readonly _id: {
    readonly cycleId?: unknown
    readonly placementId?: unknown
    readonly studentId?: unknown
  }
  readonly count: number
}

interface MongoIndexDescription {
  readonly name?: unknown
  readonly key?: unknown
  readonly unique?: unknown
}

type IndexStatus = 'present' | 'missing' | 'created' | 'conflict' | 'blocked'

export interface EvaluationAssignmentIndexMigrationOptions {
  readonly apply: boolean
  readonly confirmedDatabaseName?: string
}

export interface EvaluationAssignmentIndexMigrationReport {
  readonly databaseName: string
  readonly collection: typeof COLLECTION_NAME
  readonly dryRun: boolean
  readonly duplicateGroupCount: number
  readonly duplicateSample: readonly {
    readonly cycleId: string
    readonly placementId: string
    readonly count: number
  }[]
  readonly index: {
    readonly name: typeof PLACEMENT_INDEX_NAME
    readonly key: typeof PLACEMENT_INDEX_KEY
    readonly unique: true
    readonly status: IndexStatus
  }
  readonly studentCycleDuplicateGroupCount: number
  readonly studentCycleDuplicateSample: readonly {
    readonly cycleId: string
    readonly studentReference: '[redacted]'
    readonly count: number
  }[]
  readonly unresolvedStudentReferenceCount: number
  readonly nonCanonicalStudentReferenceCount: number
  readonly studentCycleIndex: {
    readonly name: typeof STUDENT_INDEX_NAME
    readonly key: typeof STUDENT_INDEX_KEY
    readonly unique: true
    readonly status: IndexStatus
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function referenceString(value: unknown): string {
  if (typeof value === 'string') return value
  if (value instanceof Types.ObjectId) return value.toHexString()
  return ''
}

function matchesIndexKey(
  value: unknown,
  expected: Record<string, number>
): boolean {
  if (!isRecord(value)) return false
  const entries = Object.entries(value)
  return (
    entries.length === Object.keys(expected).length &&
    entries.every(([key, direction]) => expected[key] === direction)
  )
}

function referenceResolutionPipeline(): Document[] {
  return [
    {
      $lookup: {
        from: 'students',
        let: { reference: { $toString: '$studentId' } },
        pipeline: [
          {
            $match: {
              $expr: {
                $or: [
                  { $eq: [{ $toString: '$_id' }, '$$reference'] },
                  { $eq: ['$studentId', '$$reference'] }
                ]
              }
            }
          },
          { $project: { _id: 1 } }
        ],
        as: 'resolvedStudents'
      }
    }
  ]
}

async function countAggregation(
  collection: Collection,
  pipeline: readonly Document[]
): Promise<number> {
  const rows = await collection
    .aggregate([...pipeline, { $count: 'count' }])
    .toArray()
  return Number(isRecord(rows[0]) ? (rows[0]['count'] ?? 0) : 0)
}

export async function migrateEvaluationAssignmentIndex(
  connection: Connection,
  options: EvaluationAssignmentIndexMigrationOptions
): Promise<EvaluationAssignmentIndexMigrationReport> {
  const database = connection.db
  if (!database) {
    throw new Error('EVALUATION_ASSIGNMENT_INDEX_DATABASE_UNAVAILABLE')
  }
  if (options.apply && options.confirmedDatabaseName !== connection.name) {
    throw new Error(
      'EVALUATION_ASSIGNMENT_INDEX_DATABASE_CONFIRMATION_REQUIRED'
    )
  }
  if (!options.apply && options.confirmedDatabaseName) {
    throw new Error('EVALUATION_ASSIGNMENT_INDEX_CONFIRMATION_REQUIRES_APPLY')
  }

  const collectionExists = await database
    .listCollections({ name: COLLECTION_NAME }, { nameOnly: true })
    .hasNext()
  const collection = database.collection(COLLECTION_NAME)
  const rawIndexes: unknown = collectionExists
    ? await collection.listIndexes().toArray()
    : []
  const indexes: MongoIndexDescription[] = Array.isArray(rawIndexes)
    ? rawIndexes.filter(isRecord)
    : []

  const placementNamedIndex = indexes.find(
    (index) => index.name === PLACEMENT_INDEX_NAME
  )
  const placementIndexes = indexes.filter((index) =>
    matchesIndexKey(index.key, PLACEMENT_INDEX_KEY)
  )
  const placementUniqueIndex = placementIndexes.find(
    (index) => index.unique === true
  )
  const placementConflict =
    (placementNamedIndex !== undefined &&
      !matchesIndexKey(placementNamedIndex.key, PLACEMENT_INDEX_KEY)) ||
    (placementIndexes.length > 0 && !placementUniqueIndex)

  const studentNamedIndex = indexes.find(
    (index) => index.name === STUDENT_INDEX_NAME
  )
  const studentIndexes = indexes.filter((index) =>
    matchesIndexKey(index.key, STUDENT_INDEX_KEY)
  )
  const studentUniqueIndex = studentIndexes.find(
    (index) => index.unique === true
  )
  const studentConflict =
    (studentNamedIndex !== undefined &&
      !matchesIndexKey(studentNamedIndex.key, STUDENT_INDEX_KEY)) ||
    (studentIndexes.length > 0 && !studentUniqueIndex)

  const duplicateCountResult = collectionExists
    ? await collection
        .aggregate([
          {
            $group: {
              _id: { cycleId: '$cycleId', placementId: '$placementId' },
              count: { $sum: 1 }
            }
          },
          { $match: { count: { $gt: 1 } } },
          { $count: 'count' }
        ])
        .toArray()
    : []
  const duplicateGroupCount = Number(
    isRecord(duplicateCountResult[0])
      ? (duplicateCountResult[0]['count'] ?? 0)
      : 0
  )
  const duplicateGroups: DuplicateAssignmentGroup[] = collectionExists
    ? await collection
        .aggregate<DuplicateAssignmentGroup>([
          {
            $group: {
              _id: { cycleId: '$cycleId', placementId: '$placementId' },
              count: { $sum: 1 }
            }
          },
          { $match: { count: { $gt: 1 } } },
          { $sort: { count: -1 } },
          { $limit: DUPLICATE_SAMPLE_LIMIT }
        ])
        .toArray()
    : []
  const duplicateSample = duplicateGroups.map((group) => ({
    cycleId: referenceString(group._id.cycleId),
    placementId: referenceString(group._id.placementId),
    count: group.count
  }))

  const studentCyclePipeline = [
    {
      $match: {
        cycleId: { $type: 'string', $ne: '' },
        studentId: { $type: 'string', $ne: '' }
      }
    },
    {
      $group: {
        _id: { cycleId: '$cycleId', studentId: '$studentId' },
        count: { $sum: 1 }
      }
    },
    { $match: { count: { $gt: 1 } } }
  ]
  const studentCycleDuplicateGroups: DuplicateAssignmentGroup[] =
    collectionExists
      ? await collection
          .aggregate<DuplicateAssignmentGroup>([
            ...studentCyclePipeline,
            { $sort: { count: -1 } },
            { $limit: DUPLICATE_SAMPLE_LIMIT }
          ])
          .toArray()
      : []
  const studentCycleDuplicateGroupCount = collectionExists
    ? await countAggregation(collection, studentCyclePipeline)
    : 0
  const studentCycleDuplicateSample = studentCycleDuplicateGroups.map(
    (group) => ({
      cycleId: referenceString(group._id.cycleId),
      studentReference: '[redacted]' as const,
      count: group.count
    })
  )

  const resolutionPipeline = referenceResolutionPipeline()
  const unresolvedStudentReferenceCount = collectionExists
    ? await countAggregation(collection, [
        ...resolutionPipeline,
        { $match: { $expr: { $ne: [{ $size: '$resolvedStudents' }, 1] } } }
      ])
    : 0
  const nonCanonicalStudentReferenceCount = collectionExists
    ? await countAggregation(collection, [
        ...resolutionPipeline,
        { $match: { $expr: { $eq: [{ $size: '$resolvedStudents' }, 1] } } },
        {
          $set: {
            canonicalStudentId: {
              $toString: { $arrayElemAt: ['$resolvedStudents._id', 0] }
            }
          }
        },
        { $match: { $expr: { $ne: ['$studentId', '$canonicalStudentId'] } } }
      ])
    : 0

  const placementStatus: IndexStatus = placementConflict
    ? 'conflict'
    : placementUniqueIndex
      ? 'present'
      : options.apply && duplicateGroupCount > 0
        ? 'blocked'
        : 'missing'
  const hasStudentCycleDataConflicts =
    studentCycleDuplicateGroupCount > 0 ||
    unresolvedStudentReferenceCount > 0 ||
    nonCanonicalStudentReferenceCount > 0
  const studentCycleStatus: IndexStatus = studentConflict
    ? 'conflict'
    : hasStudentCycleDataConflicts
      ? 'blocked'
      : studentUniqueIndex
        ? 'present'
        : 'missing'

  const report = (
    dryRun: boolean,
    nextPlacementStatus: IndexStatus = placementStatus,
    nextStudentCycleStatus: IndexStatus = studentCycleStatus
  ): EvaluationAssignmentIndexMigrationReport => ({
    databaseName: connection.name,
    collection: COLLECTION_NAME,
    dryRun,
    duplicateGroupCount,
    duplicateSample,
    index: {
      name: PLACEMENT_INDEX_NAME,
      key: PLACEMENT_INDEX_KEY,
      unique: true,
      status: nextPlacementStatus
    },
    studentCycleDuplicateGroupCount,
    studentCycleDuplicateSample,
    unresolvedStudentReferenceCount,
    nonCanonicalStudentReferenceCount,
    studentCycleIndex: {
      name: STUDENT_INDEX_NAME,
      key: STUDENT_INDEX_KEY,
      unique: true,
      status: nextStudentCycleStatus
    }
  })

  if (!options.apply) return report(true)
  if (placementConflict) {
    throw new Error('EVALUATION_ASSIGNMENT_INDEX_CONFLICT')
  }
  if (studentConflict) {
    throw new Error('EVALUATION_ASSIGNMENT_STUDENT_CYCLE_INDEX_CONFLICT')
  }

  let nextPlacementStatus: IndexStatus = placementStatus
  let nextStudentCycleStatus: IndexStatus = studentCycleStatus
  if (!placementUniqueIndex && duplicateGroupCount === 0) {
    await collection.createIndex(PLACEMENT_INDEX_KEY, {
      name: PLACEMENT_INDEX_NAME,
      unique: true
    })
    nextPlacementStatus = 'created'
  }
  if (!studentUniqueIndex && !hasStudentCycleDataConflicts) {
    await collection.createIndex(STUDENT_INDEX_KEY, {
      name: STUDENT_INDEX_NAME,
      unique: true
    })
    nextStudentCycleStatus = 'created'
  }
  return report(false, nextPlacementStatus, nextStudentCycleStatus)
}
