import 'reflect-metadata'

import {
  MongoMemoryReplSet,
  MongoMemoryServer
} from 'mongodb-memory-server-core'
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

import type { AuthenticatedActor } from '@internship/shared-types'
import { AuditLogRecord, AuditLogSchema } from '../src/audit/audit.schema.js'
import { AuditService } from '../src/audit/audit.service.js'
import { UserRecord, UserSchema } from '../src/auth/user.schema.js'
import { UsersService } from '../src/auth/users.service.js'
import { StudentRecord, StudentSchema } from '../src/members/members.schema.js'

const scopedStaff: AuthenticatedActor = {
  id: 'scoped-staff',
  email: 'staff@example.test',
  displayName: 'Scoped staff',
  roles: ['internshipStaff'],
  scope: {
    tenant: false,
    schoolIds: ['school-a'],
    programIds: ['program-a']
  },
  roleScopes: [
    {
      role: 'internshipStaff',
      tenant: false,
      schoolIds: ['school-a'],
      programIds: ['program-a']
    }
  ]
}

describe('user directory filters preserve assignment scope', () => {
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
    await Promise.all([
      users.deleteMany({}),
      auditLogs.deleteMany({}),
      connection.collection('systemInvariants').deleteMany({})
    ])
  })

  afterEach(() => vi.restoreAllMocks())

  it('limits Student user-directory reads to the authenticated account despite filters', async () => {
    const ownUser = await users.create({
      oidcSubject: 'local:student@example.test',
      email: 'student@example.test',
      displayName: 'Student account',
      status: 'active',
      studentId: '6531501001',
      roleAssignments: [
        {
          role: 'student',
          tenant: false,
          schoolIds: ['school-a'],
          programIds: ['program-a'],
          active: true
        }
      ]
    })
    await users.create({
      oidcSubject: 'admin-subject@example.test',
      email: 'admin@example.test',
      displayName: 'System Administrator',
      status: 'active',
      roleAssignments: [
        {
          role: 'systemAdmin',
          tenant: true,
          schoolIds: [],
          programIds: [],
          active: true
        }
      ]
    })
    const student: AuthenticatedActor = {
      id: ownUser.id,
      email: ownUser.email,
      displayName: ownUser.displayName,
      roles: ['student'],
      scope: {
        tenant: false,
        schoolIds: ['school-a'],
        programIds: ['program-a'],
        studentId: ownUser.studentId
      },
      roleScopes: [
        {
          role: 'student',
          tenant: false,
          schoolIds: ['school-a'],
          programIds: ['program-a']
        }
      ]
    }

    const ownDirectory = (await service.listUsers(student, {
      page: 1,
      pageSize: 25
    })) as {
      items: readonly Record<string, unknown>[]
      meta: { total: number }
    }
    expect(ownDirectory.meta.total).toBe(1)
    expect(ownDirectory.items).toHaveLength(1)
    expect(ownDirectory.items[0]).toMatchObject({
      id: ownUser.id,
      email: ownUser.email
    })
    expect(ownDirectory.items[0]).not.toHaveProperty('oidcSubject')
    expect(ownDirectory.items[0]).not.toHaveProperty('oidcIssuer')

    const filteredDirectory = (await service.listUsers(
      student,
      { page: 1, pageSize: 25 },
      { role: 'systemAdmin', search: 'admin@example.test' }
    )) as { items: readonly unknown[]; meta: { total: number } }
    expect(filteredDirectory).toMatchObject({ items: [], meta: { total: 0 } })
  })

  it('does not satisfy role or school filters from a different out-of-scope assignment', async () => {
    await users.create({
      oidcSubject: 'mfu-subject-multi-role',
      email: 'multi-role@example.test',
      displayName: 'Multi-role user',
      status: 'active',
      roleAssignments: [
        {
          role: 'coordinator',
          tenant: false,
          schoolIds: ['school-a'],
          programIds: ['program-a'],
          active: true
        },
        {
          role: 'student',
          tenant: false,
          schoolIds: ['school-b'],
          programIds: ['program-b'],
          active: true
        }
      ]
    })

    const byHiddenRole = (await service.listUsers(
      scopedStaff,
      { page: 1, pageSize: 25 },
      { role: 'student' }
    )) as { items: readonly unknown[]; meta: { total: number } }
    const byHiddenSchool = (await service.listUsers(
      scopedStaff,
      { page: 1, pageSize: 25 },
      { schoolId: 'school-b' }
    )) as { items: readonly unknown[]; meta: { total: number } }
    const withinScope = (await service.listUsers(
      scopedStaff,
      { page: 1, pageSize: 25 },
      { role: 'coordinator', schoolId: 'school-a' }
    )) as { items: readonly Record<string, unknown>[]; meta: { total: number } }
    const summary = await service.getUserSummary(scopedStaff)

    expect(byHiddenRole).toMatchObject({ items: [], meta: { total: 0 } })
    expect(byHiddenSchool).toMatchObject({ items: [], meta: { total: 0 } })
    expect(withinScope.meta.total).toBe(1)
    expect(summary).toMatchObject({ coordinator: 1, student: 0 })
    expect(withinScope.items[0]).toMatchObject({
      email: 'multi-role@example.test',
      roleAssignments: [{ role: 'coordinator', schoolIds: ['school-a'] }]
    })
  })

  it('records role mutations atomically and aborts the mutation if audit persistence fails', async () => {
    const created = (await service.createUser(
      scopedStaff,
      {
        email: 'coordinator@example.test',
        displayName: 'Coordinator',
        role: 'coordinator',
        schoolIds: ['school-a'],
        programIds: ['program-a']
      },
      'request-create-user'
    )) as { id: string }

    const creationAudit = await auditLogs.findOne({
      requestId: 'request-create-user'
    })
    expect(creationAudit).toMatchObject({
      action: 'users.created',
      actorId: scopedStaff.id,
      outcome: 'success',
      resourceScopes: [{ schoolIds: ['school-a'], programIds: ['program-a'] }]
    })

    vi.spyOn(auditService, 'record').mockRejectedValueOnce(
      new Error('test audit storage failure')
    )

    await expect(
      service.updateUser(
        scopedStaff,
        created.id,
        { role: 'internshipStaff' },
        'request-change-role'
      )
    ).rejects.toThrow('test audit storage failure')

    const unchanged = await users.findById(created.id).lean().exec()
    expect(unchanged?.roleAssignments[0]?.role).toBe('coordinator')
    expect(
      await auditLogs.countDocuments({ requestId: 'request-change-role' })
    ).toBe(0)

    await service.deleteUser(scopedStaff, created.id, 'request-archive-user')
    expect(await users.findById(created.id).lean().exec()).toMatchObject({
      status: 'archived'
    })
    expect(
      await auditLogs.findOne({ requestId: 'request-archive-user' }).lean()
    ).toMatchObject({
      action: 'users.archived',
      outcome: 'success',
      resourceScopes: [{ schoolIds: ['school-a'], programIds: ['program-a'] }]
    })
  })

  it('does not create the user when the transactional audit write fails', async () => {
    vi.spyOn(auditService, 'record').mockRejectedValueOnce(
      new Error('test audit storage failure')
    )

    await expect(
      service.createUser(
        scopedStaff,
        {
          email: 'no-audit@example.test',
          displayName: 'No audit',
          role: 'coordinator',
          schoolIds: ['school-a'],
          programIds: ['program-a']
        },
        'request-failed-create'
      )
    ).rejects.toThrow('test audit storage failure')

    expect(await users.countDocuments({ email: 'no-audit@example.test' })).toBe(
      0
    )
    expect(
      await auditLogs.countDocuments({ requestId: 'request-failed-create' })
    ).toBe(0)
  })

  it('allows removing an administrator only while another active administrator remains', async () => {
    const first = await users.create({
      oidcSubject: 'admin-subject-first',
      email: 'admin-first@example.test',
      displayName: 'Admin First',
      status: 'active',
      roleAssignments: [
        {
          role: 'systemAdmin',
          tenant: true,
          schoolIds: [],
          programIds: [],
          active: true
        }
      ]
    })
    const second = await users.create({
      oidcSubject: 'admin-subject-second',
      email: 'admin-second@example.test',
      displayName: 'Admin Second',
      status: 'active',
      roleAssignments: [
        {
          role: 'systemAdmin',
          tenant: true,
          schoolIds: [],
          programIds: [],
          active: true
        }
      ]
    })
    const adminActor = (id: string, email: string): AuthenticatedActor => ({
      id,
      email,
      displayName: email,
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
    })

    await service.updateUser(
      adminActor(first.id, first.email),
      first.id,
      { role: 'coordinator' },
      'request-demote-nonlast-admin'
    )
    expect(await users.findById(first.id).lean().exec()).toMatchObject({
      roleAssignments: [{ role: 'coordinator', active: true }]
    })

    await expect(
      service.updateUser(
        adminActor(second.id, second.email),
        second.id,
        { status: 'suspended' },
        'request-suspend-last-admin'
      )
    ).rejects.toMatchObject({
      status: 409,
      response: { code: 'SYSTEM_ADMIN_TRANSFER_REQUIRED' }
    })
    expect(await users.findById(second.id).lean().exec()).toMatchObject({
      status: 'active',
      roleAssignments: [{ role: 'systemAdmin', active: true }]
    })
  })

  it('serializes concurrent administrator removals so one active administrator survives', async () => {
    const first = await users.create({
      oidcSubject: 'admin-race-first',
      email: 'admin-race-first@example.test',
      displayName: 'Admin Race First',
      status: 'active',
      roleAssignments: [
        {
          role: 'systemAdmin',
          tenant: true,
          schoolIds: [],
          programIds: [],
          active: true
        }
      ]
    })
    const second = await users.create({
      oidcSubject: 'admin-race-second',
      email: 'admin-race-second@example.test',
      displayName: 'Admin Race Second',
      status: 'active',
      roleAssignments: [
        {
          role: 'systemAdmin',
          tenant: true,
          schoolIds: [],
          programIds: [],
          active: true
        }
      ]
    })
    const adminActor = (id: string, email: string): AuthenticatedActor => ({
      id,
      email,
      displayName: email,
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
    })

    const results = await Promise.allSettled([
      service.deleteUser(
        adminActor(first.id, first.email),
        first.id,
        'request-admin-race-first'
      ),
      service.deleteUser(
        adminActor(second.id, second.email),
        second.id,
        'request-admin-race-second'
      )
    ])
    const fulfilled = results.filter((result) => result.status === 'fulfilled')
    const rejected = results.filter(
      (result): result is PromiseRejectedResult => result.status === 'rejected'
    )

    expect(fulfilled).toHaveLength(1)
    expect(rejected).toHaveLength(1)
    expect(rejected[0]?.reason).toMatchObject({
      status: 409,
      response: { code: 'SYSTEM_ADMIN_TRANSFER_REQUIRED' }
    })
    expect(
      await users.countDocuments({
        status: 'active',
        roleAssignments: {
          $elemMatch: { role: 'systemAdmin', active: true }
        }
      })
    ).toBe(1)
  })

  it('keeps development user writes compatible with a standalone local MongoDB', async () => {
    const previousNodeEnv = process.env.NODE_ENV
    const standalone = await MongoMemoryServer.create({
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
    let standaloneConnection: Connection | undefined

    try {
      standaloneConnection = await createConnection(
        standalone.getUri()
      ).asPromise()
      process.env.NODE_ENV = 'development'
      const standaloneUsers = standaloneConnection.model(
        UserRecord.name,
        UserSchema
      )
      const standaloneAuditLogs = standaloneConnection.model(
        AuditLogRecord.name,
        AuditLogSchema
      )
      const standaloneStudents = standaloneConnection.model(
        StudentRecord.name,
        StudentSchema
      )
      const standaloneAuditService = new AuditService(standaloneAuditLogs)
      const standaloneService = new UsersService(
        standaloneConnection,
        standaloneUsers,
        standaloneStudents,
        standaloneAuditService
      )
      await Promise.all([
        standaloneUsers.init(),
        standaloneAuditLogs.init(),
        standaloneStudents.init()
      ])

      await standaloneService.createUser(
        scopedStaff,
        {
          email: 'standalone@example.test',
          displayName: 'Standalone user',
          role: 'coordinator',
          schoolIds: ['school-a'],
          programIds: ['program-a']
        },
        'request-standalone-create'
      )

      expect(
        await standaloneAuditLogs.countDocuments({
          requestId: 'request-standalone-create'
        })
      ).toBe(1)

      const standaloneAdminOne = await standaloneUsers.create({
        oidcSubject: 'standalone-admin-one',
        email: 'standalone-admin-one@example.test',
        displayName: 'Standalone Admin One',
        status: 'active',
        roleAssignments: [
          {
            role: 'systemAdmin',
            tenant: true,
            schoolIds: [],
            programIds: [],
            active: true
          }
        ]
      })
      const standaloneAdminTwo = await standaloneUsers.create({
        oidcSubject: 'standalone-admin-two',
        email: 'standalone-admin-two@example.test',
        displayName: 'Standalone Admin Two',
        status: 'active',
        roleAssignments: [
          {
            role: 'systemAdmin',
            tenant: true,
            schoolIds: [],
            programIds: [],
            active: true
          }
        ]
      })
      const standaloneAdminActor = (
        id: string,
        email: string
      ): AuthenticatedActor => ({
        id,
        email,
        displayName: email,
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
      })
      await standaloneService.deleteUser(
        standaloneAdminActor(standaloneAdminOne.id, standaloneAdminOne.email),
        standaloneAdminOne.id,
        'request-standalone-admin-one'
      )
      await expect(
        standaloneService.deleteUser(
          standaloneAdminActor(standaloneAdminTwo.id, standaloneAdminTwo.email),
          standaloneAdminTwo.id,
          'request-standalone-admin-two'
        )
      ).rejects.toMatchObject({
        status: 409,
        response: { code: 'SYSTEM_ADMIN_TRANSFER_REQUIRED' }
      })
    } finally {
      if (previousNodeEnv === undefined) delete process.env.NODE_ENV
      else process.env.NODE_ENV = previousNodeEnv
      await standaloneConnection?.close()
      await standalone.stop()
    }
  }, 180_000)
})
