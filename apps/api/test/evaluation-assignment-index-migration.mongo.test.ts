import { MongoMemoryServer } from 'mongodb-memory-server-core'
import { createConnection, Types, type Connection } from 'mongoose'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'

import { migrateEvaluationAssignmentIndex } from '../src/evaluations/assignment-index-migration.js'

function indexNames(indexes: unknown): string[] {
  if (!Array.isArray(indexes)) return []
  return indexes.flatMap((index: unknown) => {
    if (typeof index !== 'object' || index === null || Array.isArray(index)) {
      return []
    }
    const name = (index as Record<string, unknown>)['name']
    return typeof name === 'string' ? [name] : []
  })
}

describe('evaluation assignment unique index migration on isolated MongoDB', () => {
  let mongo: MongoMemoryServer
  let connection: Connection

  beforeAll(async () => {
    mongo = await MongoMemoryServer.create({
      binary: {
        ...(process.env.TEST_MONGODB_SYSTEM_BINARY
          ? { systemBinary: process.env.TEST_MONGODB_SYSTEM_BINARY }
          : {}),
        ...(process.platform === 'win32' && process.arch === 'arm64'
          ? { arch: 'x64' as const }
          : {}),
        version: process.env.TEST_MONGODB_VERSION ?? '8.0.28'
      }
    })
    connection = await createConnection(
      mongo.getUri('assignment-index-test')
    ).asPromise()
  }, 180_000)

  afterAll(async () => {
    await connection?.close()
    await mongo?.stop()
  }, 30_000)

  beforeEach(async () => {
    await connection.dropDatabase()
  })

  it('defaults to a read-only dry-run when the collection is absent', async () => {
    const report = await migrateEvaluationAssignmentIndex(connection, {
      apply: false
    })

    expect(report).toMatchObject({
      databaseName: 'assignment-index-test',
      collection: 'evaluationAssignments',
      dryRun: true,
      duplicateGroupCount: 0,
      duplicateSample: [],
      index: { unique: true, status: 'missing' }
    })
    await expect(
      connection.db
        ?.listCollections({ name: 'evaluationAssignments' }, { nameOnly: true })
        .hasNext()
    ).resolves.toBe(false)
  })

  it('profiles duplicate assignments and refuses to build a unique index', async () => {
    const assignments = connection.db?.collection('evaluationAssignments')
    if (!assignments) throw new Error('Expected MongoDB database')
    await assignments.insertMany([
      { cycleId: 'cycle-a', placementId: 'placement-a' },
      { cycleId: 'cycle-a', placementId: 'placement-a' }
    ])

    const dryRun = await migrateEvaluationAssignmentIndex(connection, {
      apply: false
    })
    expect(dryRun).toMatchObject({
      dryRun: true,
      duplicateGroupCount: 1,
      duplicateSample: [
        { cycleId: 'cycle-a', placementId: 'placement-a', count: 2 }
      ],
      index: { status: 'missing' }
    })

    const apply = await migrateEvaluationAssignmentIndex(connection, {
      apply: true,
      confirmedDatabaseName: 'assignment-index-test'
    })
    expect(apply).toMatchObject({
      dryRun: false,
      duplicateGroupCount: 1,
      index: { status: 'blocked' }
    })
    expect(indexNames(await assignments.listIndexes().toArray())).not.toContain(
      'cycleId_1_placementId_1'
    )
  })

  it('blocks the student-cycle index on duplicate assignments across placements', async () => {
    const assignments = connection.db?.collection('evaluationAssignments')
    const students = connection.db?.collection('students')
    if (!assignments || !students) throw new Error('Expected MongoDB database')
    const studentObjectId = new Types.ObjectId()
    await students.insertOne({
      _id: studentObjectId,
      studentId: 'student-cycle-duplicate'
    })
    await assignments.insertMany([
      {
        cycleId: 'cycle-a',
        placementId: 'placement-a',
        studentId: studentObjectId.toHexString()
      },
      {
        cycleId: 'cycle-a',
        placementId: 'placement-b',
        studentId: studentObjectId.toHexString()
      }
    ])

    const dryRun = await migrateEvaluationAssignmentIndex(connection, {
      apply: false
    })
    expect(dryRun).toMatchObject({
      duplicateGroupCount: 0,
      studentCycleDuplicateGroupCount: 1,
      unresolvedStudentReferenceCount: 0,
      nonCanonicalStudentReferenceCount: 0,
      studentCycleDuplicateSample: [
        {
          cycleId: 'cycle-a',
          studentReference: '[redacted]',
          count: 2
        }
      ],
      studentCycleIndex: { status: 'blocked' }
    })

    const apply = await migrateEvaluationAssignmentIndex(connection, {
      apply: true,
      confirmedDatabaseName: 'assignment-index-test'
    })
    expect(apply.studentCycleIndex.status).toBe('blocked')
    expect(indexNames(await assignments.listIndexes().toArray())).not.toContain(
      'cycleId_1_studentId_1'
    )
  })

  it('blocks aliases of the same student until references are canonical', async () => {
    const assignments = connection.db?.collection('evaluationAssignments')
    const students = connection.db?.collection('students')
    if (!assignments || !students) throw new Error('Expected MongoDB database')
    const studentObjectId = new Types.ObjectId()
    await students.insertOne({
      _id: studentObjectId,
      studentId: 'student-business-code'
    })
    await assignments.insertOne({
      cycleId: 'cycle-a',
      placementId: 'placement-a',
      studentId: 'student-business-code'
    })
    await assignments.insertOne({
      cycleId: 'cycle-a',
      placementId: 'placement-b',
      studentId: studentObjectId.toHexString()
    })

    const report = await migrateEvaluationAssignmentIndex(connection, {
      apply: true,
      confirmedDatabaseName: 'assignment-index-test'
    })

    expect(report.nonCanonicalStudentReferenceCount).toBe(1)
    expect(report.studentCycleDuplicateGroupCount).toBe(0)
    expect(report.studentCycleIndex.status).toBe('blocked')
    expect(indexNames(await assignments.listIndexes().toArray())).not.toContain(
      'cycleId_1_studentId_1'
    )
  })

  it('requires exact database confirmation and applies the unique index idempotently', async () => {
    await expect(
      migrateEvaluationAssignmentIndex(connection, {
        apply: true,
        confirmedDatabaseName: 'other-database'
      })
    ).rejects.toThrow(
      'EVALUATION_ASSIGNMENT_INDEX_DATABASE_CONFIRMATION_REQUIRED'
    )

    const first = await migrateEvaluationAssignmentIndex(connection, {
      apply: true,
      confirmedDatabaseName: 'assignment-index-test'
    })
    const second = await migrateEvaluationAssignmentIndex(connection, {
      apply: true,
      confirmedDatabaseName: 'assignment-index-test'
    })

    expect(first.index.status).toBe('created')
    expect(second.index.status).toBe('present')
    const assignments = connection.db?.collection('evaluationAssignments')
    if (!assignments) throw new Error('Expected MongoDB database')
    expect(indexNames(await assignments.listIndexes().toArray())).toContain(
      'cycleId_1_placementId_1'
    )
    expect(indexNames(await assignments.listIndexes().toArray())).toContain(
      'cycleId_1_studentId_1'
    )
    await assignments.insertOne({
      cycleId: 'cycle-a',
      placementId: 'placement-a',
      studentId: 'student-a'
    })
    await expect(
      assignments.insertOne({
        cycleId: 'cycle-a',
        placementId: 'placement-b',
        studentId: 'student-a'
      })
    ).rejects.toMatchObject({ code: 11000 })
    await expect(
      assignments.insertOne({
        cycleId: 'cycle-b',
        placementId: 'placement-b',
        studentId: 'student-a'
      })
    ).resolves.toMatchObject({ acknowledged: true })
  })

  it('refuses to reuse a conflicting index name without dropping existing indexes', async () => {
    const assignments = connection.db?.collection('evaluationAssignments')
    if (!assignments) throw new Error('Expected MongoDB database')
    await assignments.createIndex(
      { unexpected: 1 },
      {
        name: 'cycleId_1_placementId_1'
      }
    )

    await expect(
      migrateEvaluationAssignmentIndex(connection, {
        apply: true,
        confirmedDatabaseName: 'assignment-index-test'
      })
    ).rejects.toThrow('EVALUATION_ASSIGNMENT_INDEX_CONFLICT')
    expect(indexNames(await assignments.listIndexes().toArray())).toContain(
      'cycleId_1_placementId_1'
    )
  })
})
