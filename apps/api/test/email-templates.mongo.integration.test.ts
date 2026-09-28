import { MongoMemoryReplSet } from 'mongodb-memory-server-core'
import { createConnection, type Connection, type Model } from 'mongoose'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'

import { ConflictException } from '@nestjs/common'

import { CorrespondenceController } from '../src/correspondence/correspondence.controller.js'
import {
  EmailTemplateRecord,
  EmailTemplateSchema,
  EmailTemplateVersionRecord,
  EmailTemplateVersionSchema
} from '../src/correspondence/correspondence.schema.js'
import {
  DEFAULT_SYSTEM_TEMPLATES,
  TemplateService
} from '../src/correspondence/template.service.js'

describe('email template API workflow on an isolated MongoDB replica set', () => {
  let replicaSet: MongoMemoryReplSet
  let connection: Connection
  let templates: Model<EmailTemplateRecord>
  let versions: Model<EmailTemplateVersionRecord>
  let controller: CorrespondenceController
  let service: TemplateService
  let failVersionSave = false

  beforeAll(async () => {
    replicaSet = await MongoMemoryReplSet.create({
      binary: {
        ...(process.env.TEST_MONGODB_SYSTEM_BINARY
          ? { systemBinary: process.env.TEST_MONGODB_SYSTEM_BINARY }
          : {}),
        ...(process.platform === 'win32' && process.arch === 'arm64'
          ? { arch: 'x64' as const }
          : {}),
        version: process.env.TEST_MONGODB_VERSION ?? '8.0.28'
      },
      replSet: { count: 1, storageEngine: 'wiredTiger' }
    })
    connection = await createConnection(replicaSet.getUri()).asPromise()

    const faultableVersionSchema = EmailTemplateVersionSchema.clone()
    faultableVersionSchema.pre('save', function () {
      if (failVersionSave) throw new Error('injected template version failure')
    })
    templates = connection.model(EmailTemplateRecord.name, EmailTemplateSchema)
    versions = connection.model(
      EmailTemplateVersionRecord.name,
      faultableVersionSchema
    )
    service = new TemplateService(templates, versions)
    controller = new CorrespondenceController(
      undefined as never,
      service,
      undefined as never,
      undefined as never
    )
    await Promise.all([templates.init(), versions.init()])
  }, 180_000)

  afterAll(async () => {
    await connection?.close()
    await replicaSet?.stop()
  }, 30_000)

  beforeEach(async () => {
    failVersionSave = false
    await Promise.all([templates.deleteMany({}), versions.deleteMany({})])
  })

  it('returns system defaults without creating database records during a read', async () => {
    const result = (await controller.getSystemTemplates()) as Array<{
      code: keyof typeof DEFAULT_SYSTEM_TEMPLATES
      subject: string
      html: string
      text: string
    }>

    expect(result).toHaveLength(2)
    for (const code of Object.keys(DEFAULT_SYSTEM_TEMPLATES) as Array<
      keyof typeof DEFAULT_SYSTEM_TEMPLATES
    >) {
      const item = result.find((template) => template.code === code)
      expect(item).toMatchObject({
        code,
        subject: DEFAULT_SYSTEM_TEMPLATES[code].subject,
        text: DEFAULT_SYSTEM_TEMPLATES[code].text
      })
    }
    await expect(templates.countDocuments({})).resolves.toBe(0)
    await expect(versions.countDocuments({})).resolves.toBe(0)
  })

  it('persists one default version on demand and is safe under concurrent calls', async () => {
    const versionIds = await Promise.all([
      service.ensureSystemTemplateVersion('evaluation_request'),
      service.ensureSystemTemplateVersion('evaluation_request')
    ])

    expect(versionIds[0]).toBe(versionIds[1])
    await expect(
      templates.countDocuments({ code: 'evaluation_request' })
    ).resolves.toBe(1)
    const template = await templates.findOne({ code: 'evaluation_request' })
    if (!template) throw new Error('Expected persisted system template')
    await expect(
      versions.countDocuments({ templateId: template.id })
    ).resolves.toBe(1)

    const firstRead = await controller.getSystemTemplates()
    const secondRead = await controller.getSystemTemplates()
    expect(firstRead).toEqual(secondRead)
    expect(firstRead).toContainEqual(
      expect.objectContaining({
        code: 'evaluation_request',
        versionId: versionIds[0]
      })
    )
    await expect(versions.countDocuments({})).resolves.toBe(1)
  })

  it('rolls back a new system template when its published version fails', async () => {
    failVersionSave = true

    await expect(
      controller.updateSystemTemplate('evaluation_request', {
        subject: 'Subject',
        html: '<p>Body</p>',
        text: 'Body'
      })
    ).rejects.toThrow('injected template version failure')

    await expect(
      templates.countDocuments({ code: 'evaluation_request' })
    ).resolves.toBe(0)
    await expect(versions.countDocuments({})).resolves.toBe(0)
  })

  it('creates a draft through the API, publishes it, and rejects republishing', async () => {
    const created = (await controller.createTemplate({
      code: 'TEST-EVALUATOR',
      audience: 'evaluator',
      subject: 'Evaluation for {{student_name}}',
      html: '<p>{{student_name}}</p><script>alert(1)</script>',
      text: 'Evaluation for {{student_name}}'
    })) as { versions: Array<{ id: string; html: string; status: string }> }
    const draft = created.versions[0]
    if (!draft) throw new Error('Template creation did not return its draft')

    expect(draft).toMatchObject({ status: 'draft' })
    expect(draft.html).not.toContain('<script>')

    const published = await controller.publishTemplate(draft.id)
    expect(published).toMatchObject({ status: 'published' })
    await expect(controller.publishTemplate(draft.id)).rejects.toBeInstanceOf(
      ConflictException
    )
    await expect(
      versions.countDocuments({ status: 'published' })
    ).resolves.toBe(1)
  })

  it('rolls back the template when creating its first version fails', async () => {
    failVersionSave = true

    await expect(
      controller.createTemplate({
        code: 'TEST-ROLLBACK',
        audience: 'evaluator',
        subject: 'Evaluation',
        html: '<p>Evaluation</p>',
        text: 'Evaluation'
      })
    ).rejects.toThrow('injected template version failure')

    await expect(templates.countDocuments({})).resolves.toBe(0)
    await expect(versions.countDocuments({})).resolves.toBe(0)
  })

  it('rejects publishing placeholders outside the allowlist', async () => {
    const created = (await controller.createTemplate({
      code: 'TEST-PLACEHOLDER',
      audience: 'evaluator',
      subject: 'Hello {{unexpected_value}}',
      html: '<p>Hello</p>',
      text: 'Hello'
    })) as { versions: Array<{ id: string }> }

    await expect(
      controller.publishTemplate(created.versions[0]!.id)
    ).rejects.toMatchObject({
      response: { code: 'UNKNOWN_TEMPLATE_PLACEHOLDER' }
    })
    await expect(versions.countDocuments({ status: 'draft' })).resolves.toBe(1)
  })

  it('returns a conflict for duplicate template codes without adding a version', async () => {
    const input = {
      code: 'TEST-DUPLICATE',
      audience: 'evaluator',
      subject: 'Evaluation',
      html: '<p>Evaluation</p>',
      text: 'Evaluation'
    }
    await controller.createTemplate(input)

    await expect(controller.createTemplate(input)).rejects.toMatchObject({
      response: { code: 'TEMPLATE_CODE_ALREADY_EXISTS' }
    })
    await expect(templates.countDocuments({ code: input.code })).resolves.toBe(
      1
    )
    await expect(
      versions.countDocuments({ templateId: { $exists: true } })
    ).resolves.toBe(1)
  })
})
