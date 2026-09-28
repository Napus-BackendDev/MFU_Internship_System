import 'reflect-metadata'

import { MongoMemoryServer } from 'mongodb-memory-server-core'
import { createConnection, type Connection, type Model } from 'mongoose'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'

import type { AuthenticatedActor } from '@internship/shared-types'
import { AuditLogRecord, AuditLogSchema } from '../src/audit/audit.schema.js'
import { AuditService } from '../src/audit/audit.service.js'

const scopeLog = (
  action: string,
  actorId: string,
  resourceScopes?: AuditLogRecord['resourceScopes']
): Omit<AuditLogRecord, 'createdAt'> => ({
  requestId: `request-${action}`,
  actorId,
  actorEmail: `${actorId}@example.test`,
  action,
  route: `/test/${action}`,
  method: 'POST',
  outcome: 'success' as const,
  ...(resourceScopes ? { resourceScopes } : {})
})

const scopedActor: AuthenticatedActor = {
  id: 'staff-auditor',
  email: 'staff@example.test',
  displayName: 'Scoped staff',
  roles: ['internshipStaff', 'coordinator'],
  scope: {
    tenant: false,
    schoolIds: ['school-a', 'school-b'],
    programIds: ['program-a', 'program-b']
  },
  roleScopes: [
    {
      role: 'internshipStaff',
      tenant: false,
      schoolIds: ['school-a'],
      programIds: ['program-a']
    },
    {
      role: 'coordinator',
      tenant: false,
      schoolIds: ['school-b'],
      programIds: ['program-b']
    }
  ]
}

describe('audit resource scopes', () => {
  let mongo: MongoMemoryServer
  let connection: Connection
  let auditLogs: Model<AuditLogRecord>
  let service: AuditService

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
    connection = await createConnection(mongo.getUri()).asPromise()
    auditLogs = connection.model(AuditLogRecord.name, AuditLogSchema)
    service = new AuditService(auditLogs)
    await auditLogs.init()
  }, 180_000)

  afterAll(async () => {
    await connection?.close()
    await mongo?.stop()
  }, 30_000)

  beforeEach(async () => {
    await auditLogs.deleteMany({})
  })

  it('filters by each audit-enabled role scope without cross-pair expansion', async () => {
    await auditLogs.create([
      scopeLog('own-unscoped', 'staff-auditor'),
      scopeLog('matching-school-program', 'other-user', [
        { schoolIds: ['school-a'], programIds: ['program-a'] }
      ]),
      scopeLog('coordinator-only-scope', 'other-user', [
        { schoolIds: ['school-b'], programIds: ['program-b'] }
      ]),
      scopeLog('cross-paired-scope', 'other-user', [
        { schoolIds: ['school-a'], programIds: ['program-b'] }
      ]),
      scopeLog('empty-scope-tag', 'other-user', [{}]),
      scopeLog('unscoped-other-user', 'other-user')
    ])

    const result = await service.list(scopedActor, {
      actorId: 'other-user',
      page: 1,
      pageSize: 100
    })

    expect(new Set(result.items.map((item) => item.action))).toEqual(
      new Set(['own-unscoped', 'matching-school-program'])
    )
    expect(result.total).toBe(2)
    expect(result.items[0]).toHaveProperty('id')
    expect(result.items[0]).toHaveProperty('occurredAt')
    expect(result.items[0]).not.toHaveProperty('actorEmail')
  })

  it('allows tenant audit readers to view tagged events, not unscoped system logs', async () => {
    await auditLogs.create([
      scopeLog('tenant-own-unscoped', 'tenant-staff'),
      scopeLog('tenant-visible-resource', 'other-user', [
        { schoolIds: ['school-x'], programIds: ['program-x'] }
      ]),
      scopeLog('empty-tenant-scope-tag', 'other-user', [{}]),
      scopeLog('global-unscoped-system', 'system-user')
    ])
    const tenantActor: AuthenticatedActor = {
      ...scopedActor,
      id: 'tenant-staff',
      roles: ['internshipStaff'],
      roleScopes: [
        {
          role: 'internshipStaff',
          tenant: true,
          schoolIds: [],
          programIds: []
        }
      ]
    }

    const result = await service.list(tenantActor, {
      page: 1,
      pageSize: 100
    })

    expect(new Set(result.items.map((item) => item.action))).toEqual(
      new Set(['tenant-own-unscoped', 'tenant-visible-resource'])
    )
  })

  it('does not treat an Auditor tenant flag as tenant-wide audit access', async () => {
    await auditLogs.create([
      scopeLog('auditor-own', 'invalid-tenant-auditor'),
      scopeLog('other-school-event', 'other-user', [
        { schoolIds: ['school-x'], programIds: ['program-x'] }
      ])
    ])
    const invalidTenantAuditor: AuthenticatedActor = {
      ...scopedActor,
      id: 'invalid-tenant-auditor',
      roles: ['auditor'],
      scope: { tenant: true, schoolIds: [], programIds: [] },
      roleScopes: [
        {
          role: 'auditor',
          tenant: true,
          schoolIds: [],
          programIds: []
        }
      ]
    }

    const result = await service.list(invalidTenantAuditor, {
      page: 1,
      pageSize: 100
    })

    expect(result.items.map((item) => item.action)).toEqual(['auditor-own'])
  })

  it('keeps cross-actor filtering exclusive to System Administrators', async () => {
    await auditLogs.create([
      scopeLog('admin-event', 'admin-user'),
      scopeLog('target-event', 'target-user')
    ])
    const systemAdmin: AuthenticatedActor = {
      id: 'admin-user',
      email: 'admin@example.test',
      displayName: 'System administrator',
      roles: ['systemAdmin'],
      scope: { tenant: true, schoolIds: [], programIds: [] }
    }

    const result = await service.list(systemAdmin, {
      actorId: 'target-user',
      page: 1,
      pageSize: 100
    })

    expect(result.items.map((item) => item.action)).toEqual(['target-event'])
  })
})
