import { describe, expect, it, vi } from 'vitest'

import type { AuthenticatedActor } from '@internship/shared-types'
import { UnauthorizedException } from '@nestjs/common'

import { AuditController } from '../src/audit/audit.controller.js'
import type { AuditService } from '../src/audit/audit.service.js'
import type { AuthenticatedRequest } from '../src/common/http.js'

const actor = (
  id: string,
  roles: AuthenticatedActor['roles']
): AuthenticatedActor => ({
  id,
  email: `${id}@example.test`,
  displayName: id,
  roles,
  scope: { tenant: false, schoolIds: [], programIds: [] }
})

describe('AuditController access scope', () => {
  it('passes authenticated actor to the scope-enforcing service', async () => {
    const list = vi.fn().mockResolvedValue({ items: [], total: 0 })
    const controller = new AuditController({ list } as unknown as AuditService)
    const staff = actor('staff-user', ['internshipStaff'])

    await controller.list({ actorId: 'victim-user', page: 1, pageSize: 25 }, {
      actor: staff
    } as AuthenticatedRequest)

    expect(list.mock.calls[0]?.[0]).toBe(staff)
    expect(list.mock.calls[0]?.[1]).toEqual({
      actorId: 'victim-user',
      page: 1,
      pageSize: 25
    })
  })

  it('allows System Administrators to query authorized audit actors', async () => {
    const list = vi.fn().mockResolvedValue({ items: [], total: 0 })
    const controller = new AuditController({ list } as unknown as AuditService)

    await controller.list({ actorId: 'staff-user', page: 2, pageSize: 10 }, {
      actor: actor('admin-user', ['systemAdmin'])
    } as AuthenticatedRequest)

    expect(list).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'admin-user' }),
      {
        actorId: 'staff-user',
        page: 2,
        pageSize: 10
      }
    )
  })

  it('fails closed when the authenticated actor is missing', async () => {
    const list = vi.fn()
    const controller = new AuditController({ list } as unknown as AuditService)

    await expect(
      controller.list({ page: 1, pageSize: 25 }, {} as AuthenticatedRequest)
    ).rejects.toBeInstanceOf(UnauthorizedException)
    expect(list).not.toHaveBeenCalled()
  })
})
