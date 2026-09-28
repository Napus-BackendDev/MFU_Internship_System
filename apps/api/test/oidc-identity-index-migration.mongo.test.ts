import { MongoMemoryServer } from 'mongodb-memory-server-core'
import { createConnection, type Connection } from 'mongoose'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'

import { migrateOidcIdentityIndex } from '../src/auth/oidc-identity-index-migration.js'

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

describe('OIDC issuer-subject index migration on isolated MongoDB', () => {
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
      mongo.getUri('oidc-identity-index-test'),
      { autoIndex: false }
    ).asPromise()
  }, 180_000)

  afterAll(async () => {
    await connection?.close()
    await mongo?.stop()
  }, 30_000)

  beforeEach(async () => {
    await connection.dropDatabase()
  })

  it('defaults to read-only and does not create a missing users collection', async () => {
    const report = await migrateOidcIdentityIndex(connection, { apply: false })

    expect(report).toMatchObject({
      databaseName: 'oidc-identity-index-test',
      collection: 'users',
      dryRun: true,
      duplicateIdentityGroupCount: 0,
      duplicateIdentitySample: [],
      invalidIdentityCount: 0,
      identityIndex: { unique: true, status: 'missing' },
      legacySubjectIndex: { names: [], status: 'absent' }
    })
    await expect(
      connection.db
        ?.listCollections({ name: 'users' }, { nameOnly: true })
        .hasNext()
    ).resolves.toBe(false)
  })

  it('creates the tuple index before dropping the legacy index and is rerunnable', async () => {
    const users = connection.db?.collection('users')
    if (!users) throw new Error('Expected MongoDB database')
    await users.createIndex({ oidcSubject: 1 }, { unique: true })
    await users.insertMany([
      {
        oidcIssuer: 'https://issuer-a.example.test',
        oidcSubject: 'shared-subject'
      },
      {
        oidcIssuer: 'https://issuer-a.example.test',
        oidcSubject: 'another-subject'
      },
      { oidcSubject: 'local:student@example.test' }
    ])

    const dryRun = await migrateOidcIdentityIndex(connection, { apply: false })
    expect(dryRun).toMatchObject({
      dryRun: true,
      identityIndex: { status: 'missing' },
      legacySubjectIndex: {
        names: ['oidcSubject_1'],
        status: 'present'
      }
    })
    expect(indexNames(await users.listIndexes().toArray())).toContain(
      'oidcSubject_1'
    )

    const applied = await migrateOidcIdentityIndex(connection, {
      apply: true,
      confirmedDatabaseName: 'oidc-identity-index-test'
    })
    expect(applied).toMatchObject({
      dryRun: false,
      identityIndex: { status: 'created' },
      legacySubjectIndex: {
        names: ['oidcSubject_1'],
        status: 'dropped'
      }
    })
    const currentIndexes = await users.listIndexes().toArray()
    expect(indexNames(currentIndexes)).toContain('uniq_oidc_issuer_subject')
    expect(indexNames(currentIndexes)).not.toContain('oidcSubject_1')

    await expect(
      users.insertOne({
        oidcIssuer: 'https://issuer-b.example.test',
        oidcSubject: 'shared-subject'
      })
    ).resolves.toMatchObject({ acknowledged: true })
    await expect(
      users.insertOne({
        oidcIssuer: 'https://issuer-a.example.test',
        oidcSubject: 'Shared-Subject'
      })
    ).resolves.toMatchObject({ acknowledged: true })
    await expect(
      users.insertOne({
        oidcIssuer: 'https://issuer-a.example.test',
        oidcSubject: 'shared-subject'
      })
    ).rejects.toMatchObject({ code: 11000 })
    await expect(
      users.insertOne({ oidcSubject: 'local:student@example.test' })
    ).rejects.toMatchObject({ code: 11000 })

    const rerun = await migrateOidcIdentityIndex(connection, {
      apply: true,
      confirmedDatabaseName: 'oidc-identity-index-test'
    })
    expect(rerun).toMatchObject({
      identityIndex: { status: 'present' },
      legacySubjectIndex: { names: [], status: 'absent' }
    })
  })

  it('blocks duplicate issuer-subject pairs without changing indexes', async () => {
    const users = connection.db?.collection('users')
    if (!users) throw new Error('Expected MongoDB database')
    await users.insertMany([
      {
        oidcIssuer: 'https://issuer.example.test',
        oidcSubject: 'duplicate-subject'
      },
      {
        oidcIssuer: 'https://issuer.example.test',
        oidcSubject: 'duplicate-subject'
      }
    ])

    const report = await migrateOidcIdentityIndex(connection, {
      apply: true,
      confirmedDatabaseName: 'oidc-identity-index-test'
    })
    expect(report).toMatchObject({
      duplicateIdentityGroupCount: 1,
      duplicateIdentitySample: [{ count: 2 }],
      identityIndex: { status: 'blocked' }
    })
    expect(report.duplicateIdentitySample[0]?.identityHash).toMatch(
      /^[a-f\d]{64}$/iu
    )
    expect(report.duplicateIdentitySample[0]?.identityHash).not.toContain(
      'duplicate-subject'
    )
    expect(indexNames(await users.listIndexes().toArray())).not.toContain(
      'uniq_oidc_issuer_subject'
    )
  })

  it('blocks malformed identities and refuses an unconfirmed database name', async () => {
    const users = connection.db?.collection('users')
    if (!users) throw new Error('Expected MongoDB database')
    await users.insertOne({ oidcSubject: '' })

    const report = await migrateOidcIdentityIndex(connection, {
      apply: true,
      confirmedDatabaseName: 'oidc-identity-index-test'
    })
    expect(report.invalidIdentityCount).toBe(1)
    expect(report.identityIndex.status).toBe('blocked')
    expect(indexNames(await users.listIndexes().toArray())).not.toContain(
      'uniq_oidc_issuer_subject'
    )

    await expect(
      migrateOidcIdentityIndex(connection, {
        apply: true,
        confirmedDatabaseName: 'a-different-database'
      })
    ).rejects.toThrow('OIDC_IDENTITY_INDEX_DATABASE_CONFIRMATION_REQUIRED')
  })
})
