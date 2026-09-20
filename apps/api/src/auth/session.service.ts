import { createHash } from 'node:crypto'

import type { AuthenticatedActor } from '@internship/shared-types'
import { Injectable, UnauthorizedException } from '@nestjs/common'
import { InjectModel } from '@nestjs/mongoose'
import type { Model } from 'mongoose'
import { isValidObjectId } from 'mongoose'
import type { AppEnvironment } from '@internship/config'
import { ConfigService } from '@nestjs/config'

import { SessionRecord } from './user.schema.js'
import { TokenService } from './token.service.js'
import { UsersService } from './users.service.js'

export interface SessionTokens {
  readonly accessToken: string
  readonly refreshToken: string
}

@Injectable()
export class SessionService {
  public constructor(
    @InjectModel(SessionRecord.name)
    private readonly sessions: Model<SessionRecord>,
    private readonly tokenService: TokenService,
    private readonly usersService: UsersService,
    private readonly config: ConfigService<AppEnvironment, true>
  ) {}

  public async issue(actor: AuthenticatedActor): Promise<SessionTokens> {
    const [accessToken, refresh] = await Promise.all([
      this.tokenService.issueAccessToken(actor),
      this.tokenService.issueRefreshToken(actor)
    ])
    await this.sessions.create({
      tokenHash: this.hash(refresh.jti),
      actorId: actor.id,
      expiresAt: refresh.expiresAt
    })
    return { accessToken, refreshToken: refresh.token }
  }

  public async refresh(refreshToken: string): Promise<SessionTokens> {
    const verified = await this.tokenService.verifyRefreshToken(refreshToken)
    const session = await this.sessions.findOneAndUpdate(
      {
        tokenHash: this.hash(verified.jti),
        revokedAt: { $exists: false },
        expiresAt: { $gt: new Date() }
      },
      { $set: { revokedAt: new Date() } },
      { new: true }
    )
    if (!session) {
      throw new UnauthorizedException({ code: 'AUTHENTICATION_REQUIRED' })
    }
    let actor = verified.actor
    if (isValidObjectId(verified.actor.id)) {
      actor = await this.usersService.resolveActiveActorById(verified.actor.id)
    } else if (
      verified.actor.id.startsWith('dev:') &&
      (this.config.get('NODE_ENV', { infer: true }) !== 'development' ||
        this.config.get('AUTH_MODE', { infer: true }) !== 'development')
    ) {
      throw new UnauthorizedException({ code: 'AUTHENTICATION_REQUIRED' })
    }
    return this.issue(actor)
  }

  public async revoke(refreshToken: string): Promise<void> {
    try {
      const verified = await this.tokenService.verifyRefreshToken(refreshToken)
      await this.sessions.updateOne(
        { tokenHash: this.hash(verified.jti), revokedAt: { $exists: false } },
        { $set: { revokedAt: new Date() } }
      )
    } catch {
      // Logout remains idempotent and does not reveal token state.
    }
  }

  private hash(value: string): string {
    return createHash('sha256').update(value).digest('hex')
  }
}
