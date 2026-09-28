import 'reflect-metadata'

import type { AuthenticatedActor } from '@internship/shared-types'
import type { ExecutionContext } from '@nestjs/common'
import { describe, expect, it, vi } from 'vitest'

import {
  ANY_PERMISSION,
  AUTHENTICATED_ROUTE,
  PUBLIC_ROUTE,
  REQUIRED_PERMISSIONS
} from '../src/auth/auth.decorators.js'
import { AccessGuard } from '../src/auth/access.guard.js'
import { scopeFilter } from '../src/common/scope.js'

const staffScope = {
  role: 'internshipStaff' as const,
  tenant: false,
  schoolIds: ['school-staff'],
  programIds: ['program-staff']
}
const coordinatorScope = {
  role: 'coordinator' as const,
  tenant: false,
  schoolIds: ['school-coordinator'],
  programIds: ['program-coordinator']
}

function guardHarness(
  actor: AuthenticatedActor,
  permissions: readonly string[],
  anyPermissions: readonly string[] = []
): {
  context: ExecutionContext
  guard: AccessGuard
  request: {
    headers: { authorization: string }
    actor?: AuthenticatedActor
  }
} {
  const metadata = new Map<symbol, unknown>([
    [PUBLIC_ROUTE, false],
    [AUTHENTICATED_ROUTE, false],
    [REQUIRED_PERMISSIONS, permissions],
    [ANY_PERMISSION, anyPermissions]
  ])
  const reflector = {
    getAllAndOverride: vi.fn((key: symbol) => metadata.get(key))
  }
  const request: {
    headers: { authorization: string }
    actor?: AuthenticatedActor
  } = {
    headers: { authorization: 'Bearer access-token' }
  }
  const guard = new AccessGuard(
    reflector as never,
    {
      verifyAccessToken: vi.fn().mockResolvedValue({ sessionId: 'session-1' })
    } as never,
    {
      assertAccessTokenCurrent: vi.fn().mockResolvedValue(actor)
    } as never
  )
  const context = {
    getHandler: vi.fn(),
    getClass: vi.fn(),
    switchToHttp: () => ({ getRequest: () => request })
  } as unknown as ExecutionContext

  return { context, guard, request }
}

describe('AccessGuard role-specific resource scopes', () => {
  it('limits service actor roles and scopes to roles that grant the route permission', async () => {
    const actor: AuthenticatedActor = {
      id: 'multi-role-user',
      email: 'staff@example.test',
      displayName: 'Multi-role user',
      roles: ['internshipStaff', 'coordinator'],
      scope: {
        tenant: false,
        schoolIds: ['school-staff', 'school-coordinator'],
        programIds: ['program-staff', 'program-coordinator']
      },
      roleScopes: [staffScope, coordinatorScope]
    }
    const { context, guard, request } = guardHarness(actor, ['cycles.manage'])

    await expect(guard.canActivate(context)).resolves.toBe(true)

    expect(request).toHaveProperty('actor.roles', ['internshipStaff'])
    expect(request).toHaveProperty('actor.roleScopes', [staffScope])
    const guardedActor = (request as unknown as { actor: AuthenticatedActor })
      .actor
    expect(scopeFilter(guardedActor)).toEqual({
      $or: [
        {
          $and: [
            { schoolId: { $in: ['school-staff'] } },
            { programId: { $in: ['program-staff'] } }
          ]
        }
      ]
    })
  })

  it('denies shared document-template management to scoped Staff but allows tenant Staff', async () => {
    const scopedStaff: AuthenticatedActor = {
      id: 'scoped-document-staff',
      email: 'scoped-staff@example.test',
      displayName: 'Scoped Staff',
      roles: ['internshipStaff'],
      scope: {
        tenant: false,
        schoolIds: ['school-staff'],
        programIds: ['program-staff']
      },
      roleScopes: [staffScope]
    }
    const scopedHarness = guardHarness(scopedStaff, [
      'documentTemplates.manage'
    ])
    await expect(
      scopedHarness.guard.canActivate(scopedHarness.context)
    ).rejects.toMatchObject({
      status: 403
    })

    const tenantScope = {
      role: 'internshipStaff' as const,
      tenant: true,
      schoolIds: [],
      programIds: []
    }
    const tenantStaff: AuthenticatedActor = {
      ...scopedStaff,
      id: 'tenant-document-staff',
      scope: { tenant: true, schoolIds: [], programIds: [] },
      roleScopes: [tenantScope]
    }
    const tenantHarness = guardHarness(tenantStaff, [
      'documentTemplates.publish'
    ])
    await expect(
      tenantHarness.guard.canActivate(tenantHarness.context)
    ).resolves.toBe(true)
    expect(tenantHarness.request).toHaveProperty('actor.roles', [
      'internshipStaff'
    ])
  })

  it('passes only export-authorized roles to the report export service', async () => {
    const studentScope = {
      role: 'student' as const,
      tenant: false,
      schoolIds: [],
      programIds: []
    }
    const coordinatorScope = {
      role: 'coordinator' as const,
      tenant: false,
      schoolIds: ['school-coordinator'],
      programIds: ['program-coordinator']
    }
    const actor: AuthenticatedActor = {
      id: 'coordinator-student-user',
      email: 'coordinator-student@example.test',
      displayName: 'Coordinator student',
      roles: ['coordinator', 'student'],
      scope: {
        tenant: false,
        schoolIds: ['school-coordinator'],
        programIds: ['program-coordinator'],
        studentId: 'student-123'
      },
      roleScopes: [coordinatorScope, studentScope]
    }
    const { context, guard, request } = guardHarness(actor, ['exports.create'])

    await expect(guard.canActivate(context)).resolves.toBe(true)

    const guardedActor = (request as unknown as { actor: AuthenticatedActor })
      .actor
    expect(guardedActor.roles).toEqual(['coordinator'])
    expect(guardedActor.roleScopes).toEqual([coordinatorScope])
    expect(scopeFilter(guardedActor)).toEqual({
      $or: [
        {
          $and: [
            { schoolId: { $in: ['school-coordinator'] } },
            { programId: { $in: ['program-coordinator'] } }
          ]
        }
      ]
    })
  })

  it('does not combine required permissions from different roles', async () => {
    const studentScope = {
      role: 'student' as const,
      tenant: false,
      schoolIds: ['school-student'],
      programIds: ['program-student']
    }
    const actor: AuthenticatedActor = {
      id: 'split-permission-user',
      email: 'student@example.test',
      displayName: 'Split permission user',
      roles: ['internshipStaff', 'student'],
      scope: {
        tenant: false,
        schoolIds: ['school-staff', 'school-student'],
        programIds: ['program-staff', 'program-student']
      },
      roleScopes: [staffScope, studentScope]
    }
    const { context, guard, request } = guardHarness(actor, [
      'users.manage',
      'documents.readOwn'
    ])

    await expect(guard.canActivate(context)).rejects.toMatchObject({
      status: 403
    })
    expect(request.actor).toBeUndefined()
  })

  it('denies Evaluators directory and generated-document permissions', async () => {
    const evaluatorActor: AuthenticatedActor = {
      id: 'evaluator-user',
      email: 'evaluator@example.test',
      displayName: 'Evaluator',
      roles: ['evaluator'],
      scope: {
        tenant: false,
        schoolIds: [],
        programIds: [],
        assignmentId: 'assigned-assessment'
      }
    }
    for (const permission of [
      'organizations.read',
      'documents.readOwn',
      'documents.readScoped'
    ]) {
      const { context, guard, request } = guardHarness(evaluatorActor, [
        permission
      ])

      await expect(
        guard.canActivate(context),
        permission
      ).rejects.toMatchObject({ status: 403 })
      expect(request.actor, permission).toBeUndefined()
    }
  })
})
