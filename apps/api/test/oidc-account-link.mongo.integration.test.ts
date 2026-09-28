import 'reflect-metadata'

import type { AuthenticatedActor } from '@internship/shared-types'
import { MongoMemoryReplSet } from 'mongodb-memory-server-core'
import { createConnection, type Connection, type Model } from 'mongoose'
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi
} from 'vitest'

import { AuditLogRecord, AuditLogSchema } from '../src/audit/audit.schema.js'
import { AuditService } from '../src/audit/audit.service.js'
import { UserRecord, UserSchema } from '../src/auth/user.schema.js'
import { UsersService } from '../src/auth/users.service.js'
import { StudentRecord, StudentSchema } from '../src/members/members.schema.js'

const issuer = 'https://sso.example.test'
const subject = 'exact-provider-subject-01'

const systemAdmin: AuthenticatedActor = {
  id: 'system-admin-01',
  email: 'admin@example.test',
  displayName: 'System Admin',
  roles: ['systemAdmin'],
  scope: { tenant: true, schoolIds: [], programIds: [] },
  roleScopes: [
    {
      role: 'systemAdmin',
      tenant: true,
      schoolIds: [],
      programIds: []
    }
  ]
}

const staff: AuthenticatedActor = {
  id: 'internship-staff-01',
  email: 'staff@example.test',
  displayName: 'Internship Staff',
  roles: ['internshipStaff'],
  scope: { tenant: true, schoolIds: [], programIds: [] },
  roleScopes: [
    {
      role: 'internshipStaff',
      tenant: true,
      schoolIds: [],
      programIds: []
    }
  ]
}

describe('controlled OIDC account linking', () => {
  let replicaSet: MongoMemoryReplSet
  let connection: Connection
  let users: Model<UserRecord>
  let auditLogs: Model<AuditLogRecord>
  let auditService: AuditService
  let service: UsersService

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
    users = connection.model(UserRecord.name, UserSchema)
    auditLogs = connection.model(AuditLogRecord.name, AuditLogSchema)
    const students = connection.model(StudentRecord.name, StudentSchema)
    auditService = new AuditService(auditLogs)
    service = new UsersService(connection, users, students, auditService)
    await Promise.all([users.init(), auditLogs.init(), students.init()])
  }, 180_000)

  afterAll(async () => {
    await connection?.close()
    await replicaSet?.stop()
  }, 30_000)

  beforeEach(async () => {
    await Promise.all([users.deleteMany({}), auditLogs.deleteMany({})])
    await users.create({
      oidcSubject: 'local:student@example.test',
      email: 'student@example.test',
      displayName: 'Pre-created Student',
      status: 'active',
      studentId: '6531501001',
      roleAssignments: [
        {
          role: 'student',
          tenant: false,
          schoolIds: ['school-01'],
          programIds: ['program-01'],
          active: true
        }
      ]
    })
  })

  afterEach(() => vi.restoreAllMocks())

  async function link(
    actor: AuthenticatedActor = systemAdmin,
    overrides: Partial<{
      readonly subject: string
      readonly reason: string
      readonly idempotencyKey: string
      readonly targetUserId: string
      readonly issuer: string
    }> = {}
  ): Promise<Awaited<ReturnType<UsersService['linkOidcAccount']>>> {
    const target = await users.findOne({ email: 'student@example.test' }).exec()
    if (!target) throw new Error('Expected the pre-created account fixture')
    return service.linkOidcAccount(actor, {
      targetUserId: target.id,
      issuer,
      subject,
      reason: 'Verified the account owner through the approved process',
      idempotencyKey: 'oidc-link-request-0001',
      requestId: 'request-oidc-link-01',
      ...overrides
    })
  }

  it('links the exact issuer and subject, audits the reason, and replays idempotently', async () => {
    const first = await link()
    const replay = await link()

    expect(first.userId).toMatch(/^[a-f\d]{24}$/iu)
    expect(first).toMatchObject({ issuer, status: 'linked' })
    expect(replay).toEqual(first)
    expect(
      await users.countDocuments({ oidcIssuer: issuer, oidcSubject: subject })
    ).toBe(1)
    expect(
      await auditLogs.countDocuments({ action: 'users.oidc_identity.linked' })
    ).toBe(1)

    const directory = (await service.listUsers(systemAdmin, {
      page: 1,
      pageSize: 25
    })) as { readonly items: readonly Record<string, unknown>[] }
    const safeUser = directory.items.find((item) => item.id === first.userId)
    expect(safeUser?.oidcLinked).toBe(true)
    for (const field of [
      'oidcSubject',
      'oidcIssuer',
      'oidcLinkIdempotencyScopeKey',
      'oidcLinkRequestHash'
    ]) {
      expect(safeUser).not.toHaveProperty(field)
    }

    const persistedUser = await users.findById(first.userId).exec()
    const safeJson = persistedUser?.toJSON() as
      Record<string, unknown> | undefined
    expect(safeJson?.oidcLinked).toBe(true)
    expect(safeJson).not.toHaveProperty('oidcSubject')
    expect(safeJson).not.toHaveProperty('oidcIssuer')

    const audit = await auditLogs
      .findOne({ action: 'users.oidc_identity.linked' })
      .lean()
    expect(audit?.metadata).toMatchObject({
      targetUserId: first.userId,
      issuer,
      reason: 'Verified the account owner through the approved process'
    })
    expect(audit?.metadata?.subjectHash).toMatch(/^[a-f\d]{64}$/iu)
    expect(audit?.metadata?.subjectHash).not.toBe(subject)

    await expect(
      service.resolveOidcActor({
        issuer: 'https://other-issuer.example.test',
        subject,
        email: 'student@example.test',
        displayName: 'Provider Student'
      })
    ).rejects.toMatchObject({ response: { code: 'ACCOUNT_LINK_REQUIRED' } })
    await expect(
      service.resolveOidcActor({
        issuer,
        subject: 'subject-not-linked',
        email: 'student@example.test',
        displayName: 'Provider Student'
      })
    ).rejects.toMatchObject({ response: { code: 'ACCOUNT_LINK_REQUIRED' } })
    await expect(
      service.resolveOidcActor({
        issuer,
        subject,
        email: 'student@example.test',
        displayName: 'Provider Student'
      })
    ).resolves.toMatchObject({ id: first.userId, roles: ['student'] })
  })

  it('rejects staff and leaves the account unchanged', async () => {
    await expect(link(staff)).rejects.toMatchObject({
      response: { code: 'SYSTEM_ADMIN_REQUIRED' }
    })
    expect(await users.countDocuments({ oidcIssuer: issuer })).toBe(0)
    expect(
      await auditLogs.countDocuments({ action: 'users.oidc_identity.linked' })
    ).toBe(0)
  })

  it('rejects a reused key with a different request and does not rebind', async () => {
    const first = await link()
    await expect(
      link(systemAdmin, {
        subject: 'different-subject',
        idempotencyKey: 'oidc-link-request-0001'
      })
    ).rejects.toMatchObject({ response: { code: 'IDEMPOTENCY_KEY_REUSED' } })
    await expect(
      link(systemAdmin, { idempotencyKey: 'oidc-link-request-0002' })
    ).rejects.toMatchObject({ response: { code: 'USER_NOT_LINKABLE' } })
    expect(
      await users.countDocuments({ oidcIssuer: issuer, oidcSubject: subject })
    ).toBe(1)
    expect(
      await auditLogs.countDocuments({ action: 'users.oidc_identity.linked' })
    ).toBe(1)
    expect(first.status).toBe('linked')
  })

  it('does not link one provider subject to two accounts', async () => {
    await link()
    const second = await users.create({
      oidcSubject: 'local:other@example.test',
      email: 'other@example.test',
      displayName: 'Another Student',
      status: 'active',
      roleAssignments: [
        {
          role: 'student',
          tenant: false,
          schoolIds: ['school-01'],
          programIds: ['program-01'],
          active: true
        }
      ]
    })

    await expect(
      link(systemAdmin, {
        targetUserId: second.id,
        idempotencyKey: 'oidc-link-request-0002'
      })
    ).rejects.toMatchObject({
      response: { code: 'OIDC_IDENTITY_ALREADY_LINKED' }
    })
    expect(
      await users.countDocuments({ oidcIssuer: issuer, oidcSubject: subject })
    ).toBe(1)
    expect(
      await auditLogs.countDocuments({ action: 'users.oidc_identity.linked' })
    ).toBe(1)
  })

  it('allows only one account to win concurrent claims for the same OIDC identity', async () => {
    const first = await users.findOne({ email: 'student@example.test' }).exec()
    if (!first) throw new Error('Expected the first pre-created account')
    const second = await users.create({
      oidcSubject: 'local:other@example.test',
      email: 'other@example.test',
      displayName: 'Another Student',
      status: 'active',
      roleAssignments: [
        {
          role: 'student',
          tenant: false,
          schoolIds: ['school-01'],
          programIds: ['program-01'],
          active: true
        }
      ]
    })

    const outcomes = await Promise.allSettled([
      link(systemAdmin, {
        targetUserId: first.id,
        idempotencyKey: 'oidc-link-race-first-0001'
      }),
      link(systemAdmin, {
        targetUserId: second.id,
        idempotencyKey: 'oidc-link-race-second-0001'
      })
    ])
    const fulfilled = outcomes.filter(
      (outcome) => outcome.status === 'fulfilled'
    )
    const rejected = outcomes.filter(
      (outcome): outcome is PromiseRejectedResult =>
        outcome.status === 'rejected'
    )

    expect(fulfilled).toHaveLength(1)
    expect(rejected).toHaveLength(1)
    expect(rejected[0]?.reason).toMatchObject({
      response: { code: 'OIDC_IDENTITY_ALREADY_LINKED' }
    })
    expect(
      await users.countDocuments({ oidcIssuer: issuer, oidcSubject: subject })
    ).toBe(1)
    expect(
      await auditLogs.countDocuments({ action: 'users.oidc_identity.linked' })
    ).toBe(1)
  })

  it('returns one result and writes one audit for concurrent idempotent retries', async () => {
    const requests = await Promise.all([
      link(systemAdmin, { idempotencyKey: 'oidc-link-same-key-0001' }),
      link(systemAdmin, { idempotencyKey: 'oidc-link-same-key-0001' })
    ])

    expect(requests[0]).toEqual(requests[1])
    expect(
      await users.countDocuments({ oidcIssuer: issuer, oidcSubject: subject })
    ).toBe(1)
    expect(
      await auditLogs.countDocuments({ action: 'users.oidc_identity.linked' })
    ).toBe(1)
  })

  it('uses the issuer and subject together as the OIDC identity key', async () => {
    await link()
    const second = await users.create({
      oidcSubject: 'local:second@example.test',
      email: 'second@example.test',
      displayName: 'Second Pre-created Student',
      status: 'active',
      roleAssignments: [
        {
          role: 'student',
          tenant: false,
          schoolIds: ['school-01'],
          programIds: ['program-01'],
          active: true
        }
      ]
    })

    await expect(
      link(systemAdmin, {
        targetUserId: second.id,
        issuer: 'https://other-issuer.example.test',
        idempotencyKey: 'oidc-link-request-0002'
      })
    ).resolves.toMatchObject({
      userId: second.id,
      issuer: 'https://other-issuer.example.test',
      status: 'linked'
    })

    expect(
      await users.countDocuments({
        oidcIssuer: { $in: [issuer, 'https://other-issuer.example.test'] },
        oidcSubject: subject
      })
    ).toBe(2)
  })

  it('rolls back the identity link when its transactional audit write fails', async () => {
    vi.spyOn(auditService, 'record').mockRejectedValue(
      new Error('simulated audit persistence failure')
    )

    await expect(link()).rejects.toThrow('simulated audit persistence failure')
    expect(await users.countDocuments({ oidcIssuer: issuer })).toBe(0)
    expect(
      await auditLogs.countDocuments({ action: 'users.oidc_identity.linked' })
    ).toBe(0)
  })
})
