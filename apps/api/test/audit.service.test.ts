import { Logger } from '@nestjs/common'
import type { Model } from 'mongoose'
import { afterEach, describe, expect, it, vi } from 'vitest'

import type { AuditLogRecord } from '../src/audit/audit.schema.js'
import {
  AuditService,
  resourceScopesFromRoleAssignments,
  type AuditInput
} from '../src/audit/audit.service.js'

const auditInput: AuditInput = {
  requestId: 'request-audit-retry',
  actorId: 'actor-123',
  actorEmail: 'private@example.test',
  action: 'PATCH /users/target-456',
  route: '/users/target-456',
  method: 'PATCH'
}

describe('AuditService safe persistence', () => {
  afterEach(() => vi.restoreAllMocks())

  it('does not serialize invalid tenant scope for non-staff roles', () => {
    expect(
      resourceScopesFromRoleAssignments([
        {
          role: 'coordinator',
          tenant: true,
          schoolIds: [],
          programIds: []
        }
      ])
    ).toEqual([])
  })

  it('retries a transient audit failure and returns after persistence succeeds', async () => {
    const create = vi
      .fn()
      .mockRejectedValueOnce(new Error('temporary database error'))
      .mockResolvedValueOnce([])
    const service = new AuditService({
      create
    } as unknown as Model<AuditLogRecord>)
    const loggerError = vi.spyOn(Logger.prototype, 'error')

    await service.recordSafely(auditInput)

    expect(create).toHaveBeenCalledTimes(2)
    expect(loggerError).not.toHaveBeenCalled()
  })

  it('logs a sanitized alert after bounded retries are exhausted', async () => {
    const create = vi
      .fn()
      .mockRejectedValue(new Error('private database detail'))
    const service = new AuditService({
      create
    } as unknown as Model<AuditLogRecord>)
    const loggerError = vi.spyOn(Logger.prototype, 'error')

    await service.recordSafely(auditInput)

    expect(create).toHaveBeenCalledTimes(3)
    expect(loggerError).toHaveBeenCalledOnce()
    const alert = String(loggerError.mock.calls[0]?.[0])
    expect(alert).toContain('AUDIT_PERSISTENCE_FAILED')
    expect(alert).toContain(auditInput.requestId)
    expect(alert).not.toContain(auditInput.actorEmail)
    expect(alert).not.toContain('private database detail')
  })
})
