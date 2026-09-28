import { createHash } from 'node:crypto'

import type { AuthenticatedActor } from '@internship/shared-types'
import type { Model } from 'mongoose'
import { describe, expect, it, vi } from 'vitest'

import type { EvaluationAssignmentRecord } from '../src/evaluations/evaluation.schema.js'
import type { InvitationRecord } from '../src/correspondence/correspondence.schema.js'
import type { SessionRecord } from '../src/auth/user.schema.js'
import { SessionService } from '../src/auth/session.service.js'
import type { TokenService } from '../src/auth/token.service.js'

const actor: AuthenticatedActor = {
  id: '65a000000000000000000001',
  email: 'staff@example.test',
  displayName: 'Staff',
  roles: ['internshipStaff'],
  scope: { tenant: true, schoolIds: [], programIds: [] }
}

describe('session-bound access tokens', () => {
  it('persists only a hash of the identity shared with the access token', async () => {
    const refresh = {
      token: 'signed-refresh-token',
      jti: 'random-refresh-session-id',
      expiresAt: new Date('2027-01-01T00:00:00.000Z')
    }
    const create = vi.fn().mockResolvedValue({})
    const issueRefreshToken = vi.fn().mockResolvedValue(refresh)
    const issueAccessToken = vi.fn().mockResolvedValue('signed-access-token')
    const tokenService = {
      issueRefreshToken,
      issueAccessToken
    } as unknown as TokenService
    const service = new SessionService(
      { create } as unknown as Model<SessionRecord>,
      {} as Model<InvitationRecord>,
      {} as Model<EvaluationAssignmentRecord>,
      tokenService,
      {} as never,
      { get: vi.fn().mockReturnValue(undefined) } as never
    )

    await expect(service.issue(actor)).resolves.toEqual({
      accessToken: 'signed-access-token',
      refreshToken: 'signed-refresh-token'
    })

    const expectedHash = createHash('sha256').update(refresh.jti).digest('hex')
    expect(issueAccessToken).toHaveBeenCalledWith(actor, refresh.jti)
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        actorId: actor.id,
        tokenHash: expectedHash,
        expiresAt: refresh.expiresAt
      })
    )
    expect(create.mock.calls[0]?.[0]).not.toHaveProperty('sessionId')
    expect(JSON.stringify(create.mock.calls[0]?.[0])).not.toContain(refresh.jti)
  })
})
