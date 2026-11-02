import { Body, Controller, Get, Param, Post, Put, Req } from '@nestjs/common'
import { z } from 'zod'

import { RequirePermissions } from '../auth/auth.decorators.js'
import type { AuthenticatedRequest } from '../common/http.js'
import {
  AiSettingsService,
  aiSettingsUpdateSchema
} from './ai-settings.service.js'
import { FeedbackSummaryService } from './feedback-summary.service.js'

const objectIdSchema = z.string().regex(/^[a-f\d]{24}$/i)

@Controller()
export class AiSettingsController {
  public constructor(
    private readonly ai: AiSettingsService,
    private readonly feedback: FeedbackSummaryService
  ) {}

  @RequirePermissions('system.config.manage')
  @Get('system-settings/ai')
  public get(): Promise<unknown> {
    return this.ai.get()
  }

  @RequirePermissions('system.config.manage')
  @Put('system-settings/ai')
  public update(
    @Req() request: AuthenticatedRequest,
    @Body() raw: unknown
  ): Promise<unknown> {
    return this.ai.update(request.actor!, aiSettingsUpdateSchema.parse(raw))
  }

  @RequirePermissions('system.config.manage')
  @Post('system-settings/ai/test')
  public test(): Promise<unknown> {
    return this.ai.test()
  }

  @RequirePermissions('cycles.manage')
  @Get('evaluation-assignments/:assignmentId/feedback-summary')
  public getSummary(
    @Req() request: AuthenticatedRequest,
    @Param('assignmentId') assignmentId: string
  ): Promise<unknown> {
    return this.feedback.get(request.actor!, objectIdSchema.parse(assignmentId))
  }

  @RequirePermissions('cycles.manage')
  @Post('evaluation-assignments/:assignmentId/feedback-summary')
  public generateSummary(
    @Req() request: AuthenticatedRequest,
    @Param('assignmentId') assignmentId: string
  ): Promise<unknown> {
    return this.feedback.generate(
      request.actor!,
      objectIdSchema.parse(assignmentId),
      request.requestId ?? 'unknown'
    )
  }
}
