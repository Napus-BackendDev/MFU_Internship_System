import type { AuthenticatedActor } from '@internship/shared-types'
import { Injectable, UnauthorizedException } from '@nestjs/common'
import type { AppEnvironment } from '@internship/config'
import { ConfigService } from '@nestjs/config'
import { InjectModel } from '@nestjs/mongoose'
import type { Model } from 'mongoose'

import { EvaluationAssignmentRecord } from '../evaluations/evaluation.schema.js'
import { EvaluatorRecord } from '../members/members.schema.js'
import { SessionService } from '../auth/session.service.js'
import { TokenService } from '../auth/token.service.js'
import { InvitationRecord } from './correspondence.schema.js'
import { invitationVersionFilter } from './invitation-version.policy.js'
import { hashInvitationPin, hashPin, normalizePin } from './pin.js'

@Injectable()
export class InvitationService {
  public constructor(
    @InjectModel(InvitationRecord.name)
    private readonly invitations: Model<InvitationRecord>,
    @InjectModel(EvaluationAssignmentRecord.name)
    private readonly assignments: Model<EvaluationAssignmentRecord>,
    @InjectModel(EvaluatorRecord.name)
    private readonly evaluators: Model<EvaluatorRecord>,
    private readonly config: ConfigService<AppEnvironment, true>,
    private readonly tokenService: TokenService,
    private readonly sessionService: SessionService
  ) {}

  public async exchange(token: string): Promise<{
    actor: AuthenticatedActor
    accessToken: string
    refreshToken: string
  }> {
    const payload = await this.tokenService.verifyTransientToken(
      token,
      'invitation'
    )
    const invitationId = payload.invitationId
    const assignmentId = payload.assignmentId
    const invitationVersion = payload.invitationVersion ?? 1
    if (typeof invitationId !== 'string' || typeof assignmentId !== 'string') {
      throw new UnauthorizedException({ code: 'INVITATION_INVALID' })
    }
    if (
      typeof invitationVersion !== 'number' ||
      !Number.isInteger(invitationVersion)
    ) {
      throw new UnauthorizedException({ code: 'INVITATION_INVALID' })
    }
    const invitation = await this.invitations.findOneAndUpdate(
      {
        _id: invitationId,
        assignmentId,
        ...invitationVersionFilter(invitationVersion),
        status: 'active',
        expiresAt: { $gt: new Date() }
      },
      { $set: { lastExchangedAt: new Date() } },
      { returnDocument: 'after' }
    )
    if (!invitation) {
      throw new UnauthorizedException({ code: 'INVITATION_INVALID' })
    }
    const assignment = await this.assignments.exists({
      _id: assignmentId,
      evaluatorId: invitation.evaluatorId,
      deadlineAt: { $gt: new Date() },
      status: { $in: ['pending', 'inProgress'] }
    })
    const evaluator = await this.evaluators.exists({
      _id: invitation.evaluatorId,
      status: 'active'
    })
    if (!assignment || !evaluator) {
      throw new UnauthorizedException({ code: 'INVITATION_INVALID' })
    }
    const actor: AuthenticatedActor = {
      id: `evaluator:${invitation.evaluatorId}`,
      email: invitation.email,
      displayName: invitation.email,
      roles: ['evaluator'],
      scope: {
        tenant: false,
        schoolIds: [],
        programIds: [],
        assignmentId,
        invitationId: invitation.id,
        invitationVersion: invitation.version
      }
    }
    return { actor, ...(await this.sessionService.issue(actor)) }
  }

  public async verifyPin(rawPin: string): Promise<{
    actor: AuthenticatedActor
    accessToken: string
    refreshToken: string
    assignmentId: string
  }> {
    const cleanPin = normalizePin(rawPin)
    if (cleanPin.length !== 16) {
      throw new UnauthorizedException({
        code: 'PIN_REQUIRED',
        message: 'กรุณากรอกรหัส PIN'
      })
    }

    const pinHashes = [
      hashInvitationPin(
        cleanPin,
        this.config.get('INVITATION_TOKEN_PEPPER', { infer: true })
      ),
      hashPin(cleanPin, this.config.get('AUTH_JWT_SECRET', { infer: true }))
    ]
    const invitation = await this.invitations
      .findOne({
        accessPinHash: { $in: pinHashes },
        status: 'active',
        expiresAt: { $gt: new Date() }
      })
      .select('+accessPinHash')
      .exec()
    if (!invitation?.accessPinHash) {
      throw this.invalidPinException()
    }

    const assignment = await this.assignments
      .findOne({
        _id: invitation.assignmentId,
        evaluatorId: invitation.evaluatorId,
        accessPinHash: invitation.accessPinHash,
        deadlineAt: { $gt: new Date() },
        status: { $in: ['pending', 'inProgress'] }
      })
      .exec()
    if (!assignment) {
      throw this.invalidPinException()
    }

    const evaluator = await this.evaluators
      .findOne({ _id: assignment.evaluatorId, status: 'active' })
      .exec()
    if (!evaluator) {
      throw this.invalidPinException()
    }
    const assignmentIdStr = assignment._id.toString()
    const actor: AuthenticatedActor = {
      id: `evaluator:${assignment.evaluatorId}`,
      email: evaluator?.email ?? 'evaluator@mfu.ac.th',
      displayName:
        evaluator?.name?.th ?? evaluator?.name?.en ?? 'ผู้ประเมินสถานประกอบการ',
      roles: ['evaluator'],
      scope: {
        tenant: false,
        schoolIds: [],
        programIds: [],
        assignmentId: assignmentIdStr,
        invitationId: invitation.id,
        invitationVersion: invitation.version
      }
    }

    const tokens = await this.sessionService.issue(actor)
    return {
      actor,
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      assignmentId: assignmentIdStr
    }
  }

  private invalidPinException(): UnauthorizedException {
    return new UnauthorizedException({
      code: 'PIN_INVALID',
      message: 'รหัส PIN 16 หลักไม่ถูกต้อง หรือไม่พบแบบฟอร์มที่แอดมินมอบหมาย'
    })
  }
}
