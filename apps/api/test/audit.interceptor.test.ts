import type { AuthenticatedActor } from '@internship/shared-types'
import type { CallHandler, ExecutionContext } from '@nestjs/common'
import { lastValueFrom, of, throwError } from 'rxjs'
import { describe, expect, it, vi } from 'vitest'

import { AuditInterceptor } from '../src/audit/audit.interceptor.js'
import type { AuditInput } from '../src/audit/audit.service.js'

describe('AuditInterceptor resource visibility', () => {
  it('records active role scopes without combining School/Program pairs', async () => {
    const actor: AuthenticatedActor = {
      id: 'staff-1',
      email: 'staff@example.test',
      displayName: 'Staff',
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
        },
        {
          role: 'auditor',
          tenant: false,
          schoolIds: ['inactive-school'],
          programIds: ['inactive-program']
        }
      ]
    }
    const request = {
      method: 'PATCH',
      path: '/api/v2/students/student-1',
      originalUrl: '/api/v2/students/student-1?secret=must-not-be-recorded',
      requestId: 'request-audit-scope',
      actor
    }
    const recorded: AuditInput[] = []
    const interceptor = new AuditInterceptor({
      recordSafely: vi.fn((input: AuditInput) => {
        recorded.push(input)
        return Promise.resolve()
      })
    } as never)
    const context = {
      switchToHttp: () => ({ getRequest: () => request })
    } as unknown as ExecutionContext
    const next: CallHandler = { handle: () => of({ updated: true }) }

    await lastValueFrom(interceptor.intercept(context, next))

    expect(recorded).toHaveLength(1)
    expect(recorded[0]).toMatchObject({
      action: 'PATCH /api/v2/students/student-1',
      route: '/api/v2/students/student-1',
      resourceScopes: [
        {
          tenant: false,
          schoolIds: ['school-a'],
          programIds: ['program-a']
        },
        {
          tenant: false,
          schoolIds: ['school-b'],
          programIds: ['program-b']
        }
      ]
    })
    expect(JSON.stringify(recorded)).not.toContain('inactive-school')
    expect(JSON.stringify(recorded)).not.toContain('must-not-be-recorded')
  })

  it('leaves unauthenticated mutation events unscoped', async () => {
    const recorded: AuditInput[] = []
    const interceptor = new AuditInterceptor({
      recordSafely: vi.fn((input: AuditInput) => {
        recorded.push(input)
        return Promise.resolve()
      })
    } as never)
    const context = {
      switchToHttp: () => ({
        getRequest: () => ({
          method: 'POST',
          path: '/api/v2/public/evaluations/verify-pin',
          originalUrl: '/api/v2/public/evaluations/verify-pin',
          requestId: 'request-public-pin'
        })
      })
    } as unknown as ExecutionContext
    const next: CallHandler = { handle: () => of({ ok: true }) }

    await lastValueFrom(interceptor.intercept(context, next))

    expect(recorded[0]).toMatchObject({ actorId: 'public' })
    expect(recorded[0]).not.toHaveProperty('resourceScopes')
  })

  it('uses verified actor scope when a single-role actor lacks role metadata', async () => {
    const actor: AuthenticatedActor = {
      id: 'staff-legacy',
      email: 'staff@example.test',
      displayName: 'Staff',
      roles: ['internshipStaff'],
      scope: {
        tenant: false,
        schoolIds: ['school-verified'],
        programIds: ['program-verified']
      }
    }
    const recorded: AuditInput[] = []
    const interceptor = new AuditInterceptor({
      recordSafely: vi.fn((input: AuditInput) => {
        recorded.push(input)
        return Promise.resolve()
      })
    } as never)
    const context = {
      switchToHttp: () => ({
        getRequest: () => ({
          method: 'POST',
          path: '/api/v2/placements',
          originalUrl: '/api/v2/placements',
          requestId: 'request-single-role-fallback',
          actor
        })
      })
    } as unknown as ExecutionContext
    const next: CallHandler = { handle: () => of({ created: true }) }

    await lastValueFrom(interceptor.intercept(context, next))

    expect(recorded[0]?.resourceScopes).toEqual([
      {
        tenant: false,
        schoolIds: ['school-verified'],
        programIds: ['program-verified']
      }
    ])
  })

  it('waits for the bounded audit persistence attempt before completing a mutation', async () => {
    let finishAudit!: () => void
    const pendingAudit = new Promise<void>((resolve) => {
      finishAudit = resolve
    })
    const recordSafely = vi.fn(() => pendingAudit)
    const interceptor = new AuditInterceptor({ recordSafely } as never)
    const context = {
      switchToHttp: () => ({
        getRequest: () => ({
          method: 'PATCH',
          path: '/api/v2/users/user-1',
          originalUrl: '/api/v2/users/user-1',
          requestId: 'request-audit-await'
        })
      })
    } as unknown as ExecutionContext
    let completed = false
    const response = lastValueFrom(
      interceptor.intercept(context, {
        handle: () => of({ updated: true })
      })
    ).then((value) => {
      completed = true
      return value
    })

    await Promise.resolve()
    expect(recordSafely).toHaveBeenCalledOnce()
    expect(completed).toBe(false)

    finishAudit()
    await expect(response).resolves.toEqual({ updated: true })
    expect(completed).toBe(true)
  })

  it('waits for failure auditing and preserves the original handler error', async () => {
    let finishAudit!: () => void
    const pendingAudit = new Promise<void>((resolve) => {
      finishAudit = resolve
    })
    const recorded: AuditInput[] = []
    const interceptor = new AuditInterceptor({
      recordSafely: vi.fn((input: AuditInput) => {
        recorded.push(input)
        return pendingAudit
      })
    } as never)
    const context = {
      switchToHttp: () => ({
        getRequest: () => ({
          method: 'POST',
          path: '/api/v2/users',
          originalUrl: '/api/v2/users',
          requestId: 'request-audit-failure'
        })
      })
    } as unknown as ExecutionContext
    const handlerError = new Error('handler failed')
    let settled = false
    const response = lastValueFrom(
      interceptor.intercept(context, {
        handle: () => throwError(() => handlerError)
      })
    ).then(
      (value) => ({ kind: 'success' as const, value }),
      (error: unknown) => {
        settled = true
        return { kind: 'failure' as const, error }
      }
    )

    await Promise.resolve()
    expect(recorded).toHaveLength(1)
    expect(recorded[0]?.outcome).toBe('failure')
    expect(settled).toBe(false)

    finishAudit()
    await expect(response).resolves.toEqual({
      kind: 'failure',
      error: handlerError
    })
    expect(settled).toBe(true)
  })
})
