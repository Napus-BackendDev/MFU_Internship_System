import 'reflect-metadata'

import type { AuthenticatedActor } from '@internship/shared-types'
import { ZodError } from 'zod'
import { describe, expect, it, vi } from 'vitest'

import type { AuthenticatedRequest } from '../src/common/http.js'
import { UsersController } from '../src/auth/users.controller.js'
import type { OidcService } from '../src/auth/oidc.service.js'
import type { UsersService } from '../src/auth/users.service.js'

const admin = {
  id: 'system-admin-01',
  email: 'admin@example.test',
  displayName: 'System Admin',
  roles: ['systemAdmin'],
  scope: { tenant: true, schoolIds: [], programIds: [] },
  roleScopes: []
} as unknown as AuthenticatedActor

describe('OIDC account-link route contract', () => {
  it('passes the exact subject and idempotency key without accepting client issuer', async () => {
    const users = {} as UsersService
    const linkAccount = vi.fn().mockResolvedValue({
      userId: 'pre-created-user-01',
      issuer: 'https://configured-issuer.example.test',
      status: 'linked'
    })
    const oidc = {
      linkAccount
    } as unknown as OidcService
    const controller = new UsersController(users, oidc)
    const request = {
      actor: admin,
      requestId: 'request-oidc-link'
    } as AuthenticatedRequest
    const body = {
      subject: ' CaseSensitiveSubject-01 ',
      reason: 'Reviewed source identity and approved account owner'
    }

    expect(() =>
      controller.linkOidcAccount(
        request,
        'pre-created-user-01',
        body,
        'oidc-link-request-0001'
      )
    ).toThrow(ZodError)

    const validBody = { ...body, subject: 'CaseSensitiveSubject-01' }
    await expect(
      controller.linkOidcAccount(
        request,
        'pre-created-user-01',
        validBody,
        'oidc-link-request-0001'
      )
    ).resolves.toMatchObject({ status: 'linked' })
    expect(linkAccount.mock.calls).toEqual([
      [
        admin,
        {
          targetUserId: 'pre-created-user-01',
          ...validBody,
          idempotencyKey: 'oidc-link-request-0001',
          requestId: 'request-oidc-link'
        }
      ]
    ])

    expect(() =>
      controller.linkOidcAccount(
        request,
        'pre-created-user-01',
        { ...validBody, issuer: 'https://attacker.example.test' },
        'oidc-link-request-0002'
      )
    ).toThrow(ZodError)
  })

  it('requires a bounded idempotency key before reaching the linking service', () => {
    const linkAccount = vi.fn()
    const oidc = { linkAccount } as unknown as OidcService
    const controller = new UsersController({} as UsersService, oidc)

    expect(() =>
      controller.linkOidcAccount(
        { actor: admin } as AuthenticatedRequest,
        'pre-created-user-01',
        {
          subject: 'CaseSensitiveSubject-01',
          reason: 'Reviewed source identity and approved account owner'
        },
        'short'
      )
    ).toThrow(ZodError)
    expect(linkAccount.mock.calls).toHaveLength(0)
  })
})
