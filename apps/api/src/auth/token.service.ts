import { randomUUID } from 'node:crypto'
import { TextEncoder } from 'node:util'

import type { AppEnvironment } from '@internship/config'
import type { AuthenticatedActor } from '@internship/shared-types'
import { Injectable, UnauthorizedException } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { SignJWT, jwtVerify, type JWTPayload } from 'jose'

@Injectable()
export class TokenService {
  private readonly key: Uint8Array
  private readonly ttlSeconds: number
  private readonly refreshTtlSeconds: number

  public constructor(config: ConfigService<AppEnvironment, true>) {
    this.key = new TextEncoder().encode(
      config.get('AUTH_JWT_SECRET', { infer: true })
    )
    this.ttlSeconds = config.get('ACCESS_TOKEN_TTL_SECONDS', { infer: true })
    this.refreshTtlSeconds = config.get('REFRESH_TOKEN_TTL_SECONDS', {
      infer: true
    })
  }

  public async issueRefreshToken(actor: AuthenticatedActor): Promise<{
    token: string
    jti: string
    expiresAt: Date
  }> {
    const jti = randomUUID()
    const expiresAt = new Date(Date.now() + this.refreshTtlSeconds * 1000)
    const token = await new SignJWT({ actor, tokenUse: 'refresh' })
      .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
      .setIssuer('internship-transcript-v2')
      .setAudience('internship-transcript-api')
      .setSubject(actor.id)
      .setJti(jti)
      .setIssuedAt()
      .setExpirationTime(Math.floor(expiresAt.getTime() / 1000))
      .sign(this.key)
    return { token, jti, expiresAt }
  }

  public async verifyRefreshToken(token: string): Promise<{
    actor: AuthenticatedActor
    jti: string
  }> {
    const { payload } = await this.verify(token)
    if (
      payload.tokenUse !== 'refresh' ||
      typeof payload.actor !== 'object' ||
      typeof payload.jti !== 'string'
    ) {
      throw new UnauthorizedException({ code: 'AUTHENTICATION_REQUIRED' })
    }
    return {
      actor: payload.actor as unknown as AuthenticatedActor,
      jti: payload.jti
    }
  }

  public async issueAccessToken(actor: AuthenticatedActor): Promise<string> {
    return new SignJWT({ actor, tokenUse: 'access' })
      .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
      .setIssuer('internship-transcript-v2')
      .setAudience('internship-transcript-api')
      .setSubject(actor.id)
      .setIssuedAt()
      .setExpirationTime(`${this.ttlSeconds}s`)
      .sign(this.key)
  }

  public async issueTransientToken(
    purpose: string,
    payload: Readonly<Record<string, unknown>>,
    ttl = '10m'
  ): Promise<string> {
    return new SignJWT({ ...payload, tokenUse: purpose })
      .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
      .setIssuer('internship-transcript-v2')
      .setAudience('internship-transcript-api')
      .setIssuedAt()
      .setExpirationTime(ttl)
      .sign(this.key)
  }

  public async verifyAccessToken(token: string): Promise<AuthenticatedActor> {
    const { payload } = await this.verify(token)
    if (payload.tokenUse !== 'access' || typeof payload.actor !== 'object') {
      throw new UnauthorizedException({ code: 'AUTHENTICATION_REQUIRED' })
    }
    return payload.actor as unknown as AuthenticatedActor
  }

  public async verifyTransientToken(
    token: string,
    purpose: string
  ): Promise<Readonly<Record<string, unknown>>> {
    const { payload } = await this.verify(token)
    if (payload.tokenUse !== purpose) {
      throw new UnauthorizedException({ code: 'AUTHENTICATION_REQUIRED' })
    }
    return payload
  }

  private async verify(token: string): Promise<{ payload: JWTPayload }> {
    try {
      return await jwtVerify(token, this.key, {
        issuer: 'internship-transcript-v2',
        audience: 'internship-transcript-api',
        algorithms: ['HS256']
      })
    } catch {
      throw new UnauthorizedException({ code: 'AUTHENTICATION_REQUIRED' })
    }
  }
}
