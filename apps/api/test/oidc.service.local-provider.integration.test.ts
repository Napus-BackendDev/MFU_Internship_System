import { createHash } from 'node:crypto'

import type { AppEnvironment } from '@internship/config'
import type { AuthenticatedActor } from '@internship/shared-types'
import type { ConfigService } from '@nestjs/config'
import { exportJWK, generateKeyPair, SignJWT, type CryptoKey } from 'jose'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'

import type { TokenService } from '../src/auth/token.service.js'
import { OidcService } from '../src/auth/oidc.service.js'
import type { UsersService } from '../src/auth/users.service.js'

const issuer = 'https://oidc-mock.example.test'
const clientId = 'internship-local-integration-test'
const clientSecret = 'isolated-test-client-secret'
const redirectUri = 'https://api.example.test/api/v2/auth/callback'
const keyId = 'oidc-mock-signing-key'

let privateKey: CryptoKey
let publicJwk: Awaited<ReturnType<typeof exportJWK>>

const actor = {
  id: 'student-local-oidc',
  email: 'student@lamduan.mfu.ac.th',
  displayName: 'OIDC Mock Student',
  roles: ['student'],
  scope: {
    tenant: false,
    schoolIds: [],
    programIds: [],
    studentId: 'student-local-oidc'
  },
  roleScopes: [{ role: 'student', studentId: 'student-local-oidc' }]
} as unknown as AuthenticatedActor

interface MockProviderState {
  authorizationNonce?: string
  authorizationChallenge?: string
  readonly tokenRequests: URLSearchParams[]
}

function jsonResponse(value: unknown, status = 200): Response {
  return new Response(JSON.stringify(value), {
    status,
    headers: { 'content-type': 'application/json' }
  })
}

async function requestBody(init: RequestInit | undefined): Promise<string> {
  const body = init?.body
  if (body === undefined || body === null) return ''
  if (typeof body === 'string') return body
  return new Response(body).text()
}

function createLocalOidcService(options?: {
  readonly mismatchNonce?: boolean
  readonly mismatchAudience?: boolean
  readonly mismatchIssuer?: boolean
}): {
  readonly service: OidcService
  readonly usersService: {
    readonly resolveOidcActor: ReturnType<typeof vi.fn>
    readonly linkOidcAccount: ReturnType<typeof vi.fn>
  }
  readonly provider: MockProviderState
} {
  const provider: MockProviderState = { tokenRequests: [] }
  let issuedTransientPayload: Readonly<Record<string, unknown>> | undefined
  const fetchMock: typeof fetch = async (input, init) => {
    const url = new URL(
      input instanceof Request
        ? input.url
        : input instanceof URL
          ? input.toString()
          : input
    )
    if (url.origin !== issuer)
      throw new Error('Unexpected mock provider origin')

    if (url.pathname === '/.well-known/openid-configuration') {
      return jsonResponse({
        issuer: options?.mismatchIssuer ? `${issuer}/unexpected` : issuer,
        authorization_endpoint: `${issuer}/authorize`,
        token_endpoint: `${issuer}/token`,
        jwks_uri: `${issuer}/jwks`,
        response_types_supported: ['code'],
        response_modes_supported: ['query'],
        subject_types_supported: ['public'],
        id_token_signing_alg_values_supported: ['RS256'],
        grant_types_supported: ['authorization_code'],
        token_endpoint_auth_methods_supported: ['client_secret_post'],
        code_challenge_methods_supported: ['S256']
      })
    }

    if (url.pathname === '/jwks') {
      return jsonResponse({ keys: [{ ...publicJwk, kid: keyId, use: 'sig' }] })
    }

    if (url.pathname === '/token' && init?.method === 'POST') {
      const form = new URLSearchParams(await requestBody(init))
      provider.tokenRequests.push(form)
      const verifier = form.get('code_verifier')
      const computedChallenge = verifier
        ? createHash('sha256').update(verifier).digest('base64url')
        : undefined

      if (
        form.get('code') !== 'mock-authorization-code' ||
        computedChallenge !== provider.authorizationChallenge
      ) {
        return jsonResponse({ error: 'invalid_grant' }, 400)
      }

      const idToken = await new SignJWT({
        email: 'student@lamduan.mfu.ac.th',
        email_verified: true,
        name: 'OIDC Mock Student',
        nonce: options?.mismatchNonce
          ? 'different-nonce'
          : provider.authorizationNonce
      })
        .setProtectedHeader({ alg: 'RS256', kid: keyId })
        .setIssuer(issuer)
        .setAudience(options?.mismatchAudience ? 'unexpected-client' : clientId)
        .setSubject('mock-mfu-subject')
        .setIssuedAt()
        .setExpirationTime('5m')
        .sign(privateKey)

      return jsonResponse({
        access_token: 'mock-access-token',
        token_type: 'Bearer',
        expires_in: 300,
        id_token: idToken
      })
    }

    return jsonResponse({ error: 'not_found' }, 404)
  }

  vi.stubGlobal('fetch', fetchMock)
  const config = {
    AUTH_MODE: 'oidc',
    OIDC_ISSUER_URL: issuer,
    OIDC_CLIENT_ID: clientId,
    OIDC_CLIENT_SECRET: clientSecret,
    OIDC_REDIRECT_URI: redirectUri
  }
  const tokenService = {
    issueTransientToken: vi.fn(
      (_purpose: string, payload: Readonly<Record<string, unknown>>) => {
        issuedTransientPayload = payload
        provider.authorizationNonce =
          typeof payload.nonce === 'string' ? payload.nonce : undefined
        return Promise.resolve('isolated-transient-token')
      }
    ),
    verifyTransientToken: vi.fn(() =>
      issuedTransientPayload
        ? Promise.resolve(issuedTransientPayload)
        : Promise.reject(new Error('Transient token missing'))
    )
  }
  const usersService = {
    resolveOidcActor: vi.fn().mockResolvedValue(actor),
    linkOidcAccount: vi.fn().mockResolvedValue({
      userId: 'pre-created-user-01',
      issuer,
      status: 'linked'
    })
  }
  const service = new OidcService(
    {
      get: (key: string) => config[key as keyof typeof config]
    } as unknown as ConfigService<AppEnvironment, true>,
    tokenService as unknown as TokenService,
    usersService as unknown as UsersService
  )

  return { service, usersService, provider }
}

async function beginAuthorization(
  service: OidcService,
  provider: MockProviderState
): Promise<{
  readonly start: Awaited<ReturnType<OidcService['start']>>
  readonly callbackUrl: URL
  readonly state: string
}> {
  const start = await service.start()
  const state = start.url.searchParams.get('state') ?? ''
  provider.authorizationNonce = start.url.searchParams.get('nonce') ?? ''
  provider.authorizationChallenge =
    start.url.searchParams.get('code_challenge') ?? ''

  return {
    callbackUrl: new URL(
      `${redirectUri}?code=mock-authorization-code&state=${encodeURIComponent(state)}`
    ),
    start,
    state
  }
}

describe('OIDC service against a local protocol mock', () => {
  beforeAll(async () => {
    const keys = await generateKeyPair('RS256', { modulusLength: 2048 })
    privateKey = keys.privateKey
    publicJwk = await exportJWK(keys.publicKey)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('discovers issuer and validates code exchange, S256 PKCE, and signed ID token', async () => {
    const { service, usersService, provider } = createLocalOidcService()
    const { start, callbackUrl } = await beginAuthorization(service, provider)
    const challenge = start.url.searchParams.get('code_challenge') ?? ''

    expect(start.url.searchParams.get('code_challenge_method')).toBe('S256')
    expect(challenge).toMatch(/^[A-Za-z0-9_-]+$/u)
    await expect(
      service.finish(callbackUrl, start.transientToken)
    ).resolves.toBe(actor)

    expect(provider.tokenRequests).toHaveLength(1)
    expect(
      createHash('sha256')
        .update(provider.tokenRequests[0]?.get('code_verifier') ?? '')
        .digest('base64url')
    ).toBe(challenge)
    expect(provider.tokenRequests[0]?.get('client_id')).toBe(clientId)
    expect(provider.tokenRequests[0]?.get('client_secret')).toBe(clientSecret)
    expect(usersService.resolveOidcActor).toHaveBeenCalledWith({
      issuer,
      subject: 'mock-mfu-subject',
      email: 'student@lamduan.mfu.ac.th',
      displayName: 'OIDC Mock Student',
      avatarUrl: undefined
    })
    expect(start.url.searchParams.get('nonce')).toBeTruthy()
  })

  it('uses the discovered configured issuer for administrator account linking', async () => {
    const { service, usersService } = createLocalOidcService()
    const admin = {
      ...actor,
      id: 'system-admin-01',
      roles: ['systemAdmin']
    } as AuthenticatedActor
    const input = {
      targetUserId: 'pre-created-user-01',
      subject: 'exact-provider-subject',
      reason: 'Verified identity using the approved staff process',
      idempotencyKey: 'oidc-link-request-0001',
      requestId: 'request-local-link'
    }

    await expect(service.linkAccount(admin, input)).resolves.toEqual({
      userId: 'pre-created-user-01',
      issuer,
      status: 'linked'
    })
    expect(usersService.linkOidcAccount).toHaveBeenCalledWith(admin, {
      ...input,
      issuer
    })
  })

  it('rejects callback state mismatch before exchanging a code', async () => {
    const { service, usersService, provider } = createLocalOidcService()
    const { start, state } = await beginAuthorization(service, provider)

    await expect(
      service.finish(
        new URL(
          `${redirectUri}?code=mock-authorization-code&state=tampered-${encodeURIComponent(state)}`
        ),
        start.transientToken
      )
    ).rejects.toThrow()
    expect(provider.tokenRequests).toHaveLength(0)
    expect(usersService.resolveOidcActor).not.toHaveBeenCalled()
  })

  it('rejects discovery metadata for an unexpected issuer', async () => {
    const { service } = createLocalOidcService({ mismatchIssuer: true })

    await expect(service.start()).rejects.toThrow()
  })

  it('rejects a validly signed ID token for a different audience', async () => {
    const { service, usersService, provider } = createLocalOidcService({
      mismatchAudience: true
    })
    const { start, callbackUrl } = await beginAuthorization(service, provider)

    await expect(
      service.finish(callbackUrl, start.transientToken)
    ).rejects.toThrow()
    expect(usersService.resolveOidcActor).not.toHaveBeenCalled()
  })

  it('rejects signed ID token with the wrong nonce before account mapping', async () => {
    const { service, usersService, provider } = createLocalOidcService({
      mismatchNonce: true
    })
    const { start, callbackUrl } = await beginAuthorization(service, provider)

    await expect(
      service.finish(callbackUrl, start.transientToken)
    ).rejects.toThrow()
    expect(usersService.resolveOidcActor).not.toHaveBeenCalled()
  })
})
