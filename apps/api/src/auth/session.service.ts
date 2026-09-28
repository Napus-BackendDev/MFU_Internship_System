import { createHash } from 'node:crypto'

import type { AuthenticatedActor } from '@internship/shared-types'
import { Injectable, UnauthorizedException } from '@nestjs/common'
import { InjectModel } from '@nestjs/mongoose'
import type { Model } from 'mongoose'
import { isValidObjectId } from 'mongoose'
import type { AppEnvironment } from '@internship/config'
import { ConfigService } from '@nestjs/config'

import { EvaluationAssignmentRecord } from '../evaluations/evaluation.schema.js'
import { InvitationRecord } from '../correspondence/correspondence.schema.js'
import { invitationVersionFilter } from '../correspondence/invitation-version.policy.js'
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
    @InjectModel(InvitationRecord.name)
    private readonly invitations: Model<InvitationRecord>,
    @InjectModel(EvaluationAssignmentRecord.name)
    private readonly assignments: Model<EvaluationAssignmentRecord>,
    private readonly tokenService: TokenService,
    private readonly usersService: UsersService,
    private readonly config: ConfigService<AppEnvironment, true>
  ) {}

  public async issue(actor: AuthenticatedActor): Promise<SessionTokens> {
    const refresh = await this.tokenService.issueRefreshToken(actor)
    const accessToken = await this.tokenService.issueAccessToken(
      actor,
      refresh.jti
    )
    await this.sessions.create({
      tokenHash: this.hash(refresh.jti),
      actorId: actor.id,
      ...(actor.roles.includes('evaluator')
        ? {
            ...(actor.scope.assignmentId
              ? { assignmentId: actor.scope.assignmentId }
              : {}),
            ...(actor.scope.invitationId
              ? { invitationId: actor.scope.invitationId }
              : {})
          }
        : {}),
      expiresAt: refresh.expiresAt
    })
    return { accessToken, refreshToken: refresh.token }
  }

  public async assertAccessTokenCurrent(
    sessionId: string,
    tokenActor: AuthenticatedActor
  ): Promise<AuthenticatedActor> {
    const activeSession = await this.sessions.exists({
      tokenHash: this.hash(sessionId),
      actorId: tokenActor.id,
      revokedAt: { $exists: false },
      expiresAt: { $gt: new Date() }
    })
    if (!activeSession) {
      throw new UnauthorizedException({ code: 'AUTHENTICATION_REQUIRED' })
    }

    let actor: AuthenticatedActor
    if (isValidObjectId(tokenActor.id)) {
      actor = await this.usersService.resolveActiveActorById(tokenActor.id)
    } else if (
      tokenActor.id.startsWith('dev:') &&
      this.config.get('NODE_ENV', { infer: true }) === 'development' &&
      this.config.get('AUTH_MODE', { infer: true }) === 'development'
    ) {
      actor = tokenActor
    } else if (tokenActor.id.startsWith('evaluator:')) {
      actor = tokenActor
    } else {
      throw new UnauthorizedException({ code: 'AUTHENTICATION_REQUIRED' })
    }

    if (actor.roles.includes('evaluator')) {
      await this.assertEvaluatorActorCurrent(actor)
    }
    return actor
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
      { returnDocument: 'after' }
    )
    if (!session) {
      throw new UnauthorizedException({ code: 'AUTHENTICATION_REQUIRED' })
    }
    let actor = verified.actor
    if (actor.roles.includes('evaluator')) {
      await this.assertEvaluatorActorCurrent(actor)
    }
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

  public async assertEvaluatorActorCurrent(
    actor: AuthenticatedActor
  ): Promise<void> {
    if (
      actor.id.startsWith('dev:') &&
      this.config.get('NODE_ENV', { infer: true }) === 'development' &&
      this.config.get('AUTH_MODE', { infer: true }) === 'development'
    ) {
      return
    }
    const { assignmentId, invitationId, invitationVersion } = actor.scope
    const evaluatorId = actor.id.startsWith('evaluator:')
      ? actor.id.slice('evaluator:'.length)
      : ''
    if (
      !assignmentId ||
      !invitationId ||
      typeof invitationVersion !== 'number' ||
      !Number.isInteger(invitationVersion) ||
      !evaluatorId
    ) {
      throw new UnauthorizedException({ code: 'AUTHENTICATION_REQUIRED' })
    }
    const now = new Date()
    const [invitation, assignment] = await Promise.all([
      this.invitations.exists({
        _id: invitationId,
        assignmentId,
        evaluatorId,
        ...invitationVersionFilter(invitationVersion),
        status: 'active',
        expiresAt: { $gt: now }
      }),
      this.assignments.exists({
        _id: assignmentId,
        evaluatorId,
        deadlineAt: { $gt: now },
        status: { $in: ['pending', 'inProgress'] }
      })
    ])
    if (!invitation || !assignment) {
      throw new UnauthorizedException({ code: 'AUTHENTICATION_REQUIRED' })
    }
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
