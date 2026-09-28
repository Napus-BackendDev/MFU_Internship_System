import { MongoMemoryServer } from 'mongodb-memory-server-core'
import { createConnection, type Connection } from 'mongoose'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'

import { migrateEmailTemplateIndexes } from '../src/correspondence/email-template-index-migration.js'

describe('email-template index migration on isolated MongoDB', () => {
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
      mongo.getUri('email-template-index-test'),
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

  it('is read-only by default and rerunnable after applying unique indexes', async () => {
    const dryRun = await migrateEmailTemplateIndexes(connection, {
      apply: false
    })
    expect(dryRun).toMatchObject({
      databaseName: 'email-template-index-test',
      dryRun: true,
      indexes: [
        { collection: 'emailTemplates', action: 'would-create' },
        { collection: 'emailTemplateVersions', action: 'would-create' }
      ]
    })
    await expect(
      connection.db
        ?.listCollections({ name: 'emailTemplates' }, { nameOnly: true })
        .hasNext()
    ).resolves.toBe(false)

    const applied = await migrateEmailTemplateIndexes(connection, {
      apply: true,
      confirmedDatabaseName: 'email-template-index-test'
    })
    expect(applied.indexes.map((index) => index.action)).toEqual([
      'created',
      'created'
    ])
    const rerun = await migrateEmailTemplateIndexes(connection, {
      apply: true,
      confirmedDatabaseName: 'email-template-index-test'
    })
    expect(rerun.indexes.map((index) => index.action)).toEqual([
      'already-present',
      'already-present'
    ])

    const templates = connection.db?.collection('emailTemplates')
    const versions = connection.db?.collection('emailTemplateVersions')
    if (!templates || !versions)
      throw new Error('MongoDB collections unavailable')
    await templates.insertOne({ code: 'evaluation_request' })
    await expect(
      templates.insertOne({ code: 'evaluation_request' })
    ).rejects.toMatchObject({ code: 11000 })
    await versions.insertOne({ templateId: 'template-1', versionNumber: 1 })
    await expect(
      versions.insertOne({ templateId: 'template-1', versionNumber: 1 })
    ).rejects.toMatchObject({ code: 11000 })
  })

  it('blocks duplicate or malformed legacy rows before creating either index', async () => {
    const templates = connection.db?.collection('emailTemplates')
    const versions = connection.db?.collection('emailTemplateVersions')
    if (!templates || !versions)
      throw new Error('MongoDB collections unavailable')
    await templates.insertMany([
      { code: 'duplicate-code' },
      { code: 'duplicate-code' },
      { code: '' },
      { code: ['array-code'] }
    ])
    await versions.insertMany([
      { templateId: 'template-1', versionNumber: 1 },
      { templateId: 'template-1', versionNumber: 1 },
      { templateId: 'template-2', versionNumber: 0 },
      { templateId: 'template-3', versionNumber: 1.5 },
      { templateId: ['array-template'], versionNumber: [1] }
    ])

    const report = await migrateEmailTemplateIndexes(connection, {
      apply: true,
      confirmedDatabaseName: 'email-template-index-test'
    })
    expect(report.indexes).toMatchObject([
      {
        action: 'blocked',
        duplicateGroupCount: 1,
        invalidDocumentCount: 2
      },
      {
        action: 'blocked',
        duplicateGroupCount: 1,
        invalidDocumentCount: 3
      }
    ])
    await expect(templates.indexes()).resolves.toHaveLength(1)
    await expect(versions.indexes()).resolves.toHaveLength(1)
  })

  it('rejects an index that has the expected key but is not unique', async () => {
    const templates = connection.db?.collection('emailTemplates')
    if (!templates) throw new Error('MongoDB collection unavailable')
    await templates.createIndex(
      { code: 1 },
      { name: 'legacy_email_template_code' }
    )

    const report = await migrateEmailTemplateIndexes(connection, {
      apply: true,
      confirmedDatabaseName: 'email-template-index-test'
    })
    expect(report.indexes[0]).toMatchObject({
      action: 'conflict',
      collection: 'emailTemplates'
    })
    await expect(templates.indexes()).resolves.toHaveLength(2)
  })
})
