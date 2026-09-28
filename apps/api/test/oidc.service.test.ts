import type { AppEnvironment } from '@internship/config'
import type { AuthenticatedActor } from '@internship/shared-types'
import { UnauthorizedException } from '@nestjs/common'
import type { ConfigService } from '@nestjs/config'
import {
  authorizationCodeGrant,
  buildAuthorizationUrl,
  calculatePKCECodeChallenge,
  discovery,
  randomNonce,
  randomPKCECodeVerifier,
  randomState,
  type Configuration
} from 'openid-client'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { OidcService } from '../src/auth/oidc.service.js'
import type { TokenService } from '../src/auth/token.service.js'
import type { UsersService } from '../src/auth/users.service.js'

vi.mock('openid-client', () => ({
  authorizationCodeGrant: vi.fn(),
  buildAuthorizationUrl: vi.fn(),
  calculatePKCECodeChallenge: vi.fn(),
  discovery: vi.fn(),
  randomNonce: vi.fn(),
  randomPKCECodeVerifier: vi.fn(),
  randomState: vi.fn()
}))

const issuer = 'https://identity.example.test'
const configuration = {
  serverMetadata: () => ({ issuer })
} as unknown as Configuration
const transientPayload = {
  codeVerifier: 'one-time-code-verifier',
  state: 'one-time-state',
  nonce: 'one-time-nonce'
}
const claims = {
  sub: 'mfu-subject-123',
  email: 'student@lamduan.mfu.ac.th',
  email_verified: true,
  name: 'MFU Student',
  picture: 'https://identity.example.test/student.png'
}
const actor = {
  id: 'student-123',
  email: claims.email,
  displayName: claims.name,
  roles: ['student'],
  scope: {
    tenant: false,
    schoolIds: [],
    programIds: [],
    studentId: 'student-123'
  },
  roleScopes: [{ role: 'student', studentId: 'student-123' }]
} as unknown as AuthenticatedActor

function createOidcService(): {
  readonly service: OidcService
  readonly tokenService: {
    readonly issueTransientToken: ReturnType<typeof vi.fn>
    readonly verifyTransientToken: ReturnType<typeof vi.fn>
  }
  readonly usersService: {
    readonly resolveOidcActor: ReturnType<typeof vi.fn>
  }
} {
  const values: Record<string, string> = {
    AUTH_MODE: 'oidc',
    OIDC_ISSUER_URL: 'https://identity.example.test',
    OIDC_CLIENT_ID: 'internship-v2',
    OIDC_CLIENT_SECRET: 'secret-from-test-fixture',
    OIDC_REDIRECT_URI: 'https://api.example.test/api/v2/auth/callback'
  }
  const tokenService = {
    issueTransientToken: vi.fn().mockResolvedValue('signed-transient-token'),
    verifyTransientToken: vi.fn().mockResolvedValue(transientPayload)
  }
  const usersService = {
    resolveOidcActor: vi.fn().mockResolvedValue(actor)
  }
  const service = new OidcService(
    { get: (key: string) => values[key] } as unknown as ConfigService<
      AppEnvironment,
      true
    >,
    tokenService as unknown as TokenService,
    usersService as unknown as UsersService
  )

  return { service, tokenService, usersService }
}

describe('OIDC authorization-code flow contract', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(discovery).mockResolvedValue(configuration)
    vi.mocked(randomPKCECodeVerifier).mockReturnValue(
      transientPayload.codeVerifier
    )
    vi.mocked(calculatePKCECodeChallenge).mockResolvedValue('s256-challenge')
    vi.mocked(randomState).mockReturnValue(transientPayload.state)
    vi.mocked(randomNonce).mockReturnValue(transientPayload.nonce)
    vi.mocked(buildAuthorizationUrl).mockReturnValue(
      new URL('https://identity.example.test/authorize')
    )
  })

  it('creates an S256 PKCE request and stores matching state, nonce, verifier', async () => {
    const { service, tokenService } = createOidcService()

    const result = await service.start()

    expect(discovery).toHaveBeenCalledWith(
      new URL('https://identity.example.test'),
      'internship-v2',
      'secret-from-test-fixture'
    )
    expect(buildAuthorizationUrl).toHaveBeenCalledWith(
      configuration,
      expect.objectContaining({
        redirect_uri: 'https://api.example.test/api/v2/auth/callback',
        response_type: 'code',
        code_challenge: 's256-challenge',
        code_challenge_method: 'S256',
        state: transientPayload.state,
        nonce: transientPayload.nonce
      })
    )
    expect(tokenService.issueTransientToken).toHaveBeenCalledWith(
      'oidc',
      transientPayload
    )
    expect(result).toEqual({
      transientToken: 'signed-transient-token',
      url: new URL('https://identity.example.test/authorize')
    })
  })

  it('passes stored PKCE verifier, state, and nonce to code exchange', async () => {
    const callbackUrl = new URL(
      'https://api.example.test/api/v2/auth/callback?code=one-time-code&state=one-time-state'
    )
    vi.mocked(authorizationCodeGrant).mockResolvedValue({
      claims: () => claims
    } as never)
    const { service, usersService } = createOidcService()

    await expect(
      service.finish(callbackUrl, 'signed-transient-token')
    ).resolves.toBe(actor)

    expect(authorizationCodeGrant).toHaveBeenCalledWith(
      configuration,
      callbackUrl,
      {
        pkceCodeVerifier: transientPayload.codeVerifier,
        expectedState: transientPayload.state,
        expectedNonce: transientPayload.nonce
      }
    )
    expect(usersService.resolveOidcActor).toHaveBeenCalledWith({
      issuer,
      subject: claims.sub,
      email: claims.email,
      displayName: claims.name,
      avatarUrl: claims.picture
    })
  })

  it('does not map an account when code exchange rejects state or nonce', async () => {
    vi.mocked(authorizationCodeGrant).mockRejectedValue(
      new Error('state or nonce validation failed')
    )
    const { service, usersService } = createOidcService()

    await expect(
      service.finish(
        new URL('https://api.example.test/api/v2/auth/callback?code=bad'),
        'signed-transient-token'
      )
    ).rejects.toThrow('state or nonce validation failed')
    expect(usersService.resolveOidcActor).not.toHaveBeenCalled()
  })

  it('rejects an unverified email claim before account mapping', async () => {
    vi.mocked(authorizationCodeGrant).mockResolvedValue({
      claims: () => ({ ...claims, email_verified: false })
    } as never)
    const { service, usersService } = createOidcService()

    await expect(
      service.finish(
        new URL('https://api.example.test/api/v2/auth/callback?code=valid'),
        'signed-transient-token'
      )
    ).rejects.toBeInstanceOf(UnauthorizedException)
    expect(usersService.resolveOidcActor).not.toHaveBeenCalled()
  })
})
