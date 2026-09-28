import type { AuthenticatedActor } from '@internship/shared-types'
import type { ExecutionContext } from '@nestjs/common'
import type { Reflector } from '@nestjs/core'
import { createHash } from 'node:crypto'
import type { Model } from 'mongoose'
import { describe, expect, it, vi } from 'vitest'

import type { EvaluationAssignmentRecord } from '../src/evaluations/evaluation.schema.js'
import type { InvitationRecord } from '../src/correspondence/correspondence.schema.js'
import type { SessionRecord } from '../src/auth/user.schema.js'
import { SessionService } from '../src/auth/session.service.js'
import { AccessGuard } from '../src/auth/access.guard.js'
import {
  ANY_PERMISSION,
  AUTHENTICATED_ROUTE,
  PUBLIC_ROUTE,
  REQUIRED_PERMISSIONS
} from '../src/auth/auth.decorators.js'

const actor: AuthenticatedActor = {
  id: 'evaluator:evaluator-a',
  email: 'evaluator@example.test',
  displayName: 'Evaluator',
  roles: ['evaluator'],
  scope: {
    tenant: false,
    schoolIds: [],
    programIds: [],
    assignmentId: 'assignment-a',
    invitationId: 'invitation-a',
    invitationVersion: 3
  }
}

function createService(
  invitationExists = vi.fn().mockResolvedValue({ _id: 'invitation-a' }),
  assignmentExists = vi.fn().mockResolvedValue({ _id: 'assignment-a' })
): {
  readonly service: SessionService
  readonly invitationExists: ReturnType<typeof vi.fn>
  readonly assignmentExists: ReturnType<typeof vi.fn>
} {
  return {
    service: new SessionService(
      {} as Model<SessionRecord>,
      { exists: invitationExists } as unknown as Model<InvitationRecord>,
      {
        exists: assignmentExists
      } as unknown as Model<EvaluationAssignmentRecord>,
      {} as never,
      {} as never,
      { get: vi.fn().mockReturnValue(undefined) } as never
    ),
    invitationExists,
    assignmentExists
  }
}

describe('evaluator invitation-bound access', () => {
  it('enforces explicit permissions on authenticated-only routes', async () => {
    const metadata = new Map<unknown, unknown>([
      [PUBLIC_ROUTE, false],
      [AUTHENTICATED_ROUTE, true],
      [REQUIRED_PERMISSIONS, ['system.config.manage']],
      [ANY_PERMISSION, []]
    ])
    const guard = new AccessGuard(
      {
        getAllAndOverride: (key: unknown) => metadata.get(key)
      } as unknown as Reflector,
      {
        verifyAccessToken: vi
          .fn()
          .mockResolvedValue({ actor, sessionId: 'session-id' })
      } as never,
      {
        assertAccessTokenCurrent: vi.fn().mockResolvedValue(actor)
      } as never
    )
    const handler = (): undefined => undefined
    const context = {
      getHandler: () => handler,
      getClass: () => class TestController {},
      switchToHttp: () => ({
        getRequest: () => ({
          headers: { authorization: 'Bearer access-token' }
        })
      })
    } as unknown as ExecutionContext

    await expect(guard.canActivate(context)).rejects.toMatchObject({
      status: 403,
      response: { code: 'PERMISSION_DENIED' }
    })

    metadata.set(REQUIRED_PERMISSIONS, ['evaluations.read'])
    await expect(guard.canActivate(context)).resolves.toBe(true)
  })

  it('accepts only the active invitation version and its open assignment', async () => {
    const { service, invitationExists, assignmentExists } = createService()

    await expect(
      service.assertEvaluatorActorCurrent(actor)
    ).resolves.toBeUndefined()
    expect(invitationExists).toHaveBeenCalledWith(
      expect.objectContaining({
        _id: 'invitation-a',
        assignmentId: 'assignment-a',
        evaluatorId: 'evaluator-a',
        status: 'active',
        version: 3
      })
    )
    expect(assignmentExists).toHaveBeenCalledWith(
      expect.objectContaining({
        _id: 'assignment-a',
        evaluatorId: 'evaluator-a',
        status: { $in: ['pending', 'inProgress'] }
      })
    )
  })

  it('rejects revoked/reissued invitations and assignments outside deadline', async () => {
    const { service } = createService(
      vi.fn().mockResolvedValue(null),
      vi.fn().mockResolvedValue(null)
    )

    await expect(
      service.assertEvaluatorActorCurrent(actor)
    ).rejects.toMatchObject({ status: 401 })
  })

  it('rejects legacy evaluator tokens without invitation binding', async () => {
    const { service, invitationExists, assignmentExists } = createService()
    const unboundActor: AuthenticatedActor = {
      ...actor,
      scope: {
        ...actor.scope,
        invitationId: undefined,
        invitationVersion: undefined
      }
    }

    await expect(
      service.assertEvaluatorActorCurrent(unboundActor)
    ).rejects.toMatchObject({ status: 401 })
    expect(invitationExists).not.toHaveBeenCalled()
    expect(assignmentExists).not.toHaveBeenCalled()
  })

  it('treats pre-version invitations as version one during migration', async () => {
    const { service, invitationExists } = createService()

    await service.assertEvaluatorActorCurrent({
      ...actor,
      scope: { ...actor.scope, invitationVersion: 1 }
    })

    expect(invitationExists).toHaveBeenCalledWith(
      expect.objectContaining({
        $or: [{ version: 1 }, { version: { $exists: false } }]
      })
    )
  })

  it('runs the invitation validity check for evaluator access tokens', async () => {
    const assertAccessTokenCurrent = vi
      .fn()
      .mockRejectedValue(new Error('revoked invitation'))
    const guardSessionService = {
      assertAccessTokenCurrent
    }
    const metadata = new Map<unknown, unknown>([
      [PUBLIC_ROUTE, false],
      [AUTHENTICATED_ROUTE, true],
      [REQUIRED_PERMISSIONS, []],
      [ANY_PERMISSION, []]
    ])
    const guard = new AccessGuard(
      {
        getAllAndOverride: (key: unknown) => metadata.get(key)
      } as unknown as Reflector,
      {
        verifyAccessToken: vi
          .fn()
          .mockResolvedValue({ actor, sessionId: 'session-id' })
      } as never,
      guardSessionService as never
    )
    const handler = (): undefined => undefined
    const context = {
      getHandler: () => handler,
      getClass: () => class TestController {},
      switchToHttp: () => ({
        getRequest: () => ({
          headers: { authorization: 'Bearer access-token' }
        })
      })
    } as unknown as ExecutionContext

    await expect(guard.canActivate(context)).rejects.toThrow(
      'revoked invitation'
    )
    expect(assertAccessTokenCurrent).toHaveBeenCalledWith('session-id', actor)
  })
})

describe('persisted access-session validation', () => {
  const staffActor: AuthenticatedActor = {
    ...actor,
    id: '65a000000000000000000001',
    roles: ['internshipStaff'],
    scope: { tenant: true, schoolIds: [], programIds: [] }
  }

  function createAccessService(options?: {
    readonly sessionExists?: ReturnType<typeof vi.fn>
    readonly currentActor?: AuthenticatedActor
  }): {
    readonly service: SessionService
    readonly sessionExists: ReturnType<typeof vi.fn>
    readonly resolveActiveActorById: ReturnType<typeof vi.fn>
  } {
    const sessionExists =
      options?.sessionExists ?? vi.fn().mockResolvedValue({ _id: 'session' })
    const currentActor = options?.currentActor ?? staffActor
    const resolveActiveActorById = vi.fn().mockResolvedValue(currentActor)
    const service = new SessionService(
      { exists: sessionExists } as unknown as Model<SessionRecord>,
      { exists: vi.fn().mockResolvedValue({ _id: 'invitation-a' }) } as never,
      { exists: vi.fn().mockResolvedValue({ _id: 'assignment-a' }) } as never,
      {} as never,
      { resolveActiveActorById } as never,
      { get: vi.fn().mockReturnValue(undefined) } as never
    )
    return { service, sessionExists, resolveActiveActorById }
  }

  it('rejects revoked or expired sessions before resolving the user', async () => {
    const { service, resolveActiveActorById } = createAccessService({
      sessionExists: vi.fn().mockResolvedValue(null)
    })

    await expect(
      service.assertAccessTokenCurrent('revoked-session-id', staffActor)
    ).rejects.toMatchObject({ status: 401 })
    expect(resolveActiveActorById).not.toHaveBeenCalled()
  })

  it('resolves the current active role assignments for every request', async () => {
    const currentActor: AuthenticatedActor = {
      ...staffActor,
      roles: ['student'],
      scope: { tenant: false, schoolIds: [], programIds: [], studentId: 's-1' }
    }
    const { service, sessionExists, resolveActiveActorById } =
      createAccessService({ currentActor })

    await expect(
      service.assertAccessTokenCurrent('active-session-id', staffActor)
    ).resolves.toEqual(currentActor)
    const sessionQuery = sessionExists.mock.calls[0]?.[0] as unknown as Record<
      string,
      unknown
    >
    expect(sessionQuery).toMatchObject({
      actorId: staffActor.id,
      revokedAt: { $exists: false },
      tokenHash: createHash('sha256').update('active-session-id').digest('hex')
    })
    expect(
      (sessionQuery.expiresAt as { readonly $gt?: unknown }).$gt
    ).toBeInstanceOf(Date)
    expect(resolveActiveActorById).toHaveBeenCalledWith(staffActor.id)
  })
})

describe('access token session revocation', () => {
  it('checks the persisted session for non-evaluator access tokens', async () => {
    const staffActor: AuthenticatedActor = {
      ...actor,
      id: '65a000000000000000000001',
      roles: ['internshipStaff'],
      scope: { tenant: true, schoolIds: [], programIds: [] }
    }
    const assertAccessTokenCurrent = vi.fn().mockResolvedValue(staffActor)
    const metadata = new Map<unknown, unknown>([
      [PUBLIC_ROUTE, false],
      [AUTHENTICATED_ROUTE, true],
      [REQUIRED_PERMISSIONS, []],
      [ANY_PERMISSION, []]
    ])
    const guard = new AccessGuard(
      {
        getAllAndOverride: (key: unknown) => metadata.get(key)
      } as unknown as Reflector,
      {
        verifyAccessToken: vi
          .fn()
          .mockResolvedValue({ actor: staffActor, sessionId: 'session-id' })
      } as never,
      { assertAccessTokenCurrent } as never
    )
    const handler = (): undefined => undefined
    const context = {
      getHandler: () => handler,
      getClass: () => class TestController {},
      switchToHttp: () => ({
        getRequest: () => ({
          headers: { authorization: 'Bearer access-token' }
        })
      })
    } as unknown as ExecutionContext

    await expect(guard.canActivate(context)).resolves.toBe(true)
    expect(assertAccessTokenCurrent).toHaveBeenCalledWith(
      'session-id',
      staffActor
    )
  })

  it('uses current roles, not stale JWT roles, for permission checks', async () => {
    const tokenActor: AuthenticatedActor = {
      ...actor,
      id: '65a000000000000000000001',
      roles: ['systemAdmin'],
      scope: { tenant: true, schoolIds: [], programIds: [] }
    }
    const currentActor: AuthenticatedActor = {
      ...tokenActor,
      roles: ['student'],
      scope: { tenant: false, schoolIds: [], programIds: [], studentId: 's-1' }
    }
    const assertAccessTokenCurrent = vi.fn().mockResolvedValue(currentActor)
    const metadata = new Map<unknown, unknown>([
      [PUBLIC_ROUTE, false],
      [AUTHENTICATED_ROUTE, false],
      [REQUIRED_PERMISSIONS, ['users.manage']],
      [ANY_PERMISSION, []]
    ])
    const guard = new AccessGuard(
      {
        getAllAndOverride: (key: unknown) => metadata.get(key)
      } as unknown as Reflector,
      {
        verifyAccessToken: vi
          .fn()
          .mockResolvedValue({ actor: tokenActor, sessionId: 'session-id' })
      } as never,
      { assertAccessTokenCurrent } as never
    )
    const handler = (): undefined => undefined
    const context = {
      getHandler: () => handler,
      getClass: () => class TestController {},
      switchToHttp: () => ({
        getRequest: () => ({
          headers: { authorization: 'Bearer access-token' }
        })
      })
    } as unknown as ExecutionContext

    await expect(guard.canActivate(context)).rejects.toMatchObject({
      status: 403
    })
    expect(assertAccessTokenCurrent).toHaveBeenCalledWith(
      'session-id',
      tokenActor
    )
  })
})
