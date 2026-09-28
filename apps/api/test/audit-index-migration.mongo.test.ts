import { MongoMemoryServer } from 'mongodb-memory-server-core'
import { createConnection, type Connection } from 'mongoose'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'

import {
  AUDIT_SCOPE_INDEXES,
  migrateAuditScopeIndexes
} from '../src/audit/audit-index-migration.js'

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

describe('audit scope index migration on isolated MongoDB', () => {
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
      mongo.getUri('audit-index-test')
    ).asPromise()
  }, 180_000)

  afterAll(async () => {
    await connection?.close()
    await mongo?.stop()
  }, 30_000)

  beforeEach(async () => {
    await connection.dropDatabase()
  })

  it('defaults to dry-run and creates no collection or index', async () => {
    const report = await migrateAuditScopeIndexes(connection, { apply: false })

    expect(report).toMatchObject({
      databaseName: 'audit-index-test',
      collection: 'auditLogs',
      dryRun: true,
      indexes: AUDIT_SCOPE_INDEXES.map((index) => ({
        name: index.name,
        status: 'missing'
      }))
    })
    await expect(
      connection.db
        ?.listCollections({ name: 'auditLogs' }, { nameOnly: true })
        .hasNext()
    ).resolves.toBe(false)
  })

  it('requires exact database confirmation and applies indexes idempotently', async () => {
    await expect(
      migrateAuditScopeIndexes(connection, {
        apply: true,
        confirmedDatabaseName: 'different-database'
      })
    ).rejects.toThrow('AUDIT_SCOPE_INDEX_DATABASE_CONFIRMATION_REQUIRED')

    const first = await migrateAuditScopeIndexes(connection, {
      apply: true,
      confirmedDatabaseName: 'audit-index-test'
    })
    const second = await migrateAuditScopeIndexes(connection, {
      apply: true,
      confirmedDatabaseName: 'audit-index-test'
    })

    expect(first.indexes.map((index) => index.status)).toEqual([
      'created',
      'created'
    ])
    expect(second.indexes.map((index) => index.status)).toEqual([
      'present',
      'present'
    ])
    const actualIndexes = await connection.db
      ?.collection('auditLogs')
      .listIndexes()
      .toArray()
    expect(indexNames(actualIndexes)).toEqual(
      expect.arrayContaining(AUDIT_SCOPE_INDEXES.map((index) => index.name))
    )
  })

  it('rejects conflicting index names before creating any missing index', async () => {
    const conflictingIndex = AUDIT_SCOPE_INDEXES[0]
    if (!conflictingIndex) throw new Error('Expected configured audit index')
    await connection.db?.createCollection('auditLogs')
    await connection.db
      ?.collection('auditLogs')
      .createIndex({ wrongField: 1 }, { name: conflictingIndex.name })

    await expect(
      migrateAuditScopeIndexes(connection, {
        apply: true,
        confirmedDatabaseName: 'audit-index-test'
      })
    ).rejects.toThrow('AUDIT_SCOPE_INDEX_NAME_CONFLICT')

    const actualIndexes = await connection.db
      ?.collection('auditLogs')
      .listIndexes()
      .toArray()
    const actualIndexNames = indexNames(actualIndexes)
    expect(actualIndexNames).toContain('_id_')
    expect(actualIndexNames).toContain(conflictingIndex.name)
    expect(actualIndexNames).not.toContain(AUDIT_SCOPE_INDEXES[1]?.name)
  })
})
