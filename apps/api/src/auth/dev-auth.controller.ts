import type { AppEnvironment } from '@internship/config'
import type { AuthenticatedActor } from '@internship/shared-types'
import { ROLE_KEYS } from '@internship/shared-types'
import { Body, Controller, NotFoundException, Post, Res } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import type { Response } from 'express'
import { z } from 'zod'

import { Public } from './auth.decorators.js'
import { SessionService } from './session.service.js'

const developmentLoginSchema = z.object({
  email: z.email().default('admin@localhost'),
  displayName: z.string().min(1).default('Development Administrator'),
  role: z.enum(ROLE_KEYS).default('systemAdmin'),
  schoolIds: z.array(z.string()).default([]),
  programIds: z.array(z.string()).default([]),
  studentId: z.string().optional(),
  assignmentId: z.string().optional(),
  avatarUrl: z.string().optional()
})

@Controller('auth/dev')
export class DevAuthController {
  public constructor(
    private readonly config: ConfigService<AppEnvironment, true>,
    private readonly sessionService: SessionService
  ) {}

  @Public()
  @Post('login')
  public async login(
    @Body() raw: unknown,
    @Res({ passthrough: true }) response: Response
  ): Promise<{ actor: AuthenticatedActor }> {
    const nodeEnv = this.config.get('NODE_ENV', { infer: true })
    const authMode = this.config.get('AUTH_MODE', { infer: true })
    if (
      (nodeEnv !== 'development' && nodeEnv !== 'test') ||
      authMode !== 'development'
    ) {
      throw new NotFoundException({ code: 'RESOURCE_NOT_FOUND' })
    }

    const input = developmentLoginSchema.parse(raw)
    const actor: AuthenticatedActor = {
      id: `dev:${input.email}`,
      email: input.email,
      displayName: input.displayName,
      roles: [input.role],
      scope: {
        tenant:
          input.role === 'systemAdmin' || input.role === 'internshipStaff',
        schoolIds: input.schoolIds,
        programIds: input.programIds,
        ...(input.studentId ? { studentId: input.studentId } : {}),
        ...(input.assignmentId ? { assignmentId: input.assignmentId } : {})
      },
      roleScopes: [
        {
          role: input.role,
          tenant:
            input.role === 'systemAdmin' || input.role === 'internshipStaff',
          schoolIds: input.schoolIds,
          programIds: input.programIds
        }
      ],
      ...(input.avatarUrl
        ? { avatarUrl: input.avatarUrl, picture: input.avatarUrl }
        : {})
    }
    const tokens = await this.sessionService.issue(actor)
    const secure = this.config.get('COOKIE_SECURE', { infer: true })
    response.cookie('its_access', tokens.accessToken, {
      httpOnly: true,
      maxAge:
        this.config.get('ACCESS_TOKEN_TTL_SECONDS', { infer: true }) * 1000,
      path: '/',
      sameSite: secure ? 'none' : 'lax',
      secure
    })
    response.cookie('its_refresh', tokens.refreshToken, {
      httpOnly: true,
      maxAge:
        this.config.get('REFRESH_TOKEN_TTL_SECONDS', { infer: true }) * 1000,
      path: '/api/v2/auth',
      sameSite: secure ? 'none' : 'lax',
      secure
    })
    return { actor }
  }
}
