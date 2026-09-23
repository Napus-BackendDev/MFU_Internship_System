import type { AppEnvironment } from '@internship/config'
import type { AuthenticatedActor } from '@internship/shared-types'
import {
  Injectable,
  ServiceUnavailableException,
  UnauthorizedException
} from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
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

import { TokenService } from './token.service.js'
import { hasVerifiedEmailClaim } from './oidc-claims.policy.js'
import { UsersService } from './users.service.js'

interface AuthorizationStart {
  readonly transientToken: string
  readonly url: URL
}

@Injectable()
export class OidcService {
  private configuration?: Promise<Configuration>

  public constructor(
    private readonly config: ConfigService<AppEnvironment, true>,
    private readonly tokenService: TokenService,
    private readonly usersService: UsersService
  ) {}

  public async start(): Promise<AuthorizationStart> {
    this.assertOidcMode()
    const configuration = await this.getConfiguration()
    const codeVerifier = randomPKCECodeVerifier()
    const codeChallenge = await calculatePKCECodeChallenge(codeVerifier)
    const state = randomState()
    const nonce = randomNonce()
    const redirectUri = this.config.get('OIDC_REDIRECT_URI', { infer: true })

    if (!redirectUri)
      throw new ServiceUnavailableException('OIDC redirect is not configured.')

    const url = buildAuthorizationUrl(configuration, {
      redirect_uri: redirectUri,
      response_type: 'code',
      scope: 'openid email profile',
      code_challenge: codeChallenge,
      code_challenge_method: 'S256',
      state,
      nonce
    })

    const transientToken = await this.tokenService.issueTransientToken('oidc', {
      codeVerifier,
      state,
      nonce
    })

    return { transientToken, url }
  }

  public async finish(
    callbackUrl: URL,
    transientToken: string
  ): Promise<AuthenticatedActor> {
    this.assertOidcMode()
    const transient = await this.tokenService.verifyTransientToken(
      transientToken,
      'oidc'
    )
    const codeVerifier = transient.codeVerifier
    const state = transient.state
    const nonce = transient.nonce

    if (
      typeof codeVerifier !== 'string' ||
      typeof state !== 'string' ||
      typeof nonce !== 'string'
    ) {
      throw new UnauthorizedException({ code: 'OIDC_CALLBACK_INVALID' })
    }

    const tokens = await authorizationCodeGrant(
      await this.getConfiguration(),
      callbackUrl,
      {
        pkceCodeVerifier: codeVerifier,
        expectedState: state,
        expectedNonce: nonce
      }
    )
    const claims = tokens.claims()

    if (
      !claims ||
      typeof claims.sub !== 'string' ||
      typeof claims.email !== 'string' ||
      !hasVerifiedEmailClaim(claims.email_verified)
    ) {
      throw new UnauthorizedException({ code: 'OIDC_CLAIMS_INVALID' })
    }

    return this.usersService.resolveOidcActor({
      subject: claims.sub,
      email: claims.email,
      displayName: typeof claims.name === 'string' ? claims.name : claims.email,
      avatarUrl: typeof claims.picture === 'string' ? claims.picture : undefined
    })
  }

  private assertOidcMode(): void {
    if (this.config.get('AUTH_MODE', { infer: true }) !== 'oidc') {
      throw new ServiceUnavailableException({ code: 'OIDC_NOT_CONFIGURED' })
    }
  }

  private getConfiguration(): Promise<Configuration> {
    if (this.configuration) return this.configuration

    const issuer = this.config.get('OIDC_ISSUER_URL', { infer: true })
    const clientId = this.config.get('OIDC_CLIENT_ID', { infer: true })
    const clientSecret = this.config.get('OIDC_CLIENT_SECRET', { infer: true })

    if (!issuer || !clientId || !clientSecret) {
      throw new ServiceUnavailableException({ code: 'OIDC_NOT_CONFIGURED' })
    }

    this.configuration = discovery(new URL(issuer), clientId, clientSecret)
    return this.configuration
  }
}
