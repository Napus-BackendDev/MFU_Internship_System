import type { AuthenticatedActor } from '@internship/shared-types'
import { describe, expect, it, vi } from 'vitest'

import { TokenService } from '../src/auth/token.service.js'

const actor: AuthenticatedActor = {
  id: '65a000000000000000000001',
  email: 'staff@example.test',
  displayName: 'Staff',
  roles: ['internshipStaff'],
  scope: { tenant: true, schoolIds: [], programIds: [] }
}

describe('access token session binding', () => {
  it('returns the session identity and rejects legacy unbound access tokens', async () => {
    const values = {
      ACCESS_TOKEN_TTL_SECONDS: 900,
      AUTH_JWT_SECRET: 'unit-test-secret-with-at-least-32-bytes',
      REFRESH_TOKEN_TTL_SECONDS: 604800
    }
    const config = {
      get: vi.fn((key: keyof typeof values) => values[key])
    } as never
    const service = new TokenService(config)
    const token = await service.issueAccessToken(actor, 'session-jti-test')

    await expect(service.verifyAccessToken(token)).resolves.toEqual({
      actor,
      sessionId: 'session-jti-test'
    })

    const legacyToken = await service.issueTransientToken('access', { actor })
    await expect(service.verifyAccessToken(legacyToken)).rejects.toMatchObject({
      status: 401
    })
  })
})
