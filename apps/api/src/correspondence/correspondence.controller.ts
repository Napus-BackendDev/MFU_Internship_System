import type { AppEnvironment } from '@internship/config'
import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Put,
  Query,
  Req,
  Res
} from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import type { Response } from 'express'
import { z } from 'zod'

import { Public, RequirePermissions } from '../auth/auth.decorators.js'
import type { AuthenticatedRequest } from '../common/http.js'
import { CampaignService } from './campaign.service.js'
import { InvitationService } from './invitation.service.js'
import { TemplateService } from './template.service.js'

const pageSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
  audience: z.enum(['evaluator', 'student', 'staff']).optional(),
  campaignId: z.string().optional(),
  status: z
    .enum(['queued', 'sending', 'sent', 'failed', 'uncertain'])
    .optional()
})
const templateSchema = z.object({
  code: z.string().min(1),
  audience: z.enum(['evaluator', 'student', 'staff']),
  subject: z.string().min(1),
  html: z.string().min(1),
  text: z.string().min(1)
})
const updateSystemTemplateSchema = z.object({
  subject: z.string().min(1),
  html: z.string().min(1),
  text: z.string().min(1)
})
const campaignSchema = z.object({
  type: z.enum(['invitation', 'reminder']),
  templateVersionId: z.string().min(1),
  assignmentIds: z.array(z.string().min(1)).min(1).max(1000)
})

const directInvitationSchema = z.object({
  studentId: z.string().min(1),
  competencySetId: z.string().min(1),
  recipientEmail: z.string().email(),
  evaluatorName: z.string().min(1).optional(),
  deadlineDays: z.coerce.number().int().min(1).max(365).default(30),
  subject: z.string().optional(),
  notes: z.string().optional()
})

const targetedEmailSchema = z.object({
  studentId: z.string().min(1),
  templateCode: z.enum(['evaluation_request', 'evaluation_reminder']),
  recipientEmail: z.string().email().optional(),
  evaluatorName: z.string().min(1).optional(),
  deadlineDays: z.coerce.number().int().min(1).max(365).optional(),
  subject: z.string().optional(),
  notes: z.string().optional()
})

@Controller()
export class CorrespondenceController {
  public constructor(
    private readonly config: ConfigService<AppEnvironment, true>,
    private readonly templates: TemplateService,
    private readonly campaigns: CampaignService,
    private readonly invitations: InvitationService
  ) {}

  @RequirePermissions('emailTemplates.read')
  @Get('email-templates/system')
  public getSystemTemplates(): Promise<unknown> {
    return this.templates.getSystemTemplates()
  }

  @RequirePermissions('emailTemplates.manage')
  @Put('email-templates/system/:code')
  public updateSystemTemplate(
    @Param('code') code: string,
    @Body() raw: unknown
  ): Promise<unknown> {
    return this.templates.updateSystemTemplate(
      code,
      updateSystemTemplateSchema.parse(raw)
    )
  }

  @RequirePermissions('emailTemplates.manage')
  @Post('email-templates/system/:code/reset')
  public resetSystemTemplate(@Param('code') code: string): Promise<unknown> {
    return this.templates.resetSystemTemplate(code)
  }

  @RequirePermissions('campaigns.send')
  @Post('campaigns/send-targeted')
  @HttpCode(HttpStatus.ACCEPTED)
  public async sendTargetedEmail(
    @Req() request: AuthenticatedRequest,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Body() raw: unknown
  ): Promise<unknown> {
    return this.campaigns.sendTargetedEmail(
      request.actor!,
      targetedEmailSchema.parse(raw),
      idempotencyKey
    )
  }

  @RequirePermissions('campaigns.send')
  @Post('campaigns/send-student-invitation')
  @HttpCode(HttpStatus.ACCEPTED)
  public async sendStudentInvitation(
    @Req() request: AuthenticatedRequest,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Body() raw: unknown
  ): Promise<unknown> {
    return this.campaigns.sendStudentInvitation(
      request.actor!,
      directInvitationSchema.parse(raw),
      z.string().min(8).max(128).parse(idempotencyKey)
    )
  }

  @RequirePermissions('emailTemplates.read')
  @Get('email-templates')
  public listTemplates(@Query() raw: unknown): Promise<unknown> {
    return this.templates.list(pageSchema.parse(raw))
  }

  @RequirePermissions('emailTemplates.manage')
  @Post('email-templates')
  public createTemplate(@Body() raw: unknown): Promise<unknown> {
    return this.templates.create(templateSchema.parse(raw))
  }

  @RequirePermissions('emailTemplates.publish')
  @Post('email-template-versions/:versionId/publish')
  public publishTemplate(@Param('versionId') id: string): Promise<unknown> {
    return this.templates.publish(id)
  }

  @RequirePermissions('campaigns.send')
  @Post('campaigns/preview')
  public previewCampaign(
    @Req() request: AuthenticatedRequest,
    @Body() raw: unknown
  ): Promise<unknown> {
    return this.campaigns.preview(request.actor!, campaignSchema.parse(raw))
  }

  @RequirePermissions('campaigns.send')
  @Post('campaigns')
  @HttpCode(HttpStatus.ACCEPTED)
  public createCampaign(
    @Req() request: AuthenticatedRequest,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Body() raw: unknown
  ): Promise<unknown> {
    return this.campaigns.create(
      request.actor!,
      campaignSchema.parse(raw),
      z.string().min(8).max(128).parse(idempotencyKey)
    )
  }

  @RequirePermissions('campaigns.read')
  @Get('campaigns/:campaignId')
  public getCampaign(
    @Req() request: AuthenticatedRequest,
    @Param('campaignId') id: string
  ): Promise<unknown> {
    return this.campaigns.get(request.actor!, id)
  }

  @RequirePermissions('campaigns.read')
  @Get('deliveries')
  public listDeliveries(
    @Req() request: AuthenticatedRequest,
    @Query() raw: unknown
  ): Promise<unknown> {
    return this.campaigns.listDeliveries(request.actor!, pageSchema.parse(raw))
  }

  @RequirePermissions('deliveries.retry')
  @Post('deliveries/:deliveryId/retry')
  @HttpCode(HttpStatus.ACCEPTED)
  public retryDelivery(
    @Req() request: AuthenticatedRequest,
    @Param('deliveryId') id: string
  ): Promise<unknown> {
    return this.campaigns.retry(request.actor!, id)
  }

  @Public()
  @Post('public/invitations/exchange')
  @HttpCode(HttpStatus.OK)
  public async exchangeInvitation(
    @Body() raw: unknown,
    @Res({ passthrough: true }) response: Response
  ): Promise<unknown> {
    const { token } = z.object({ token: z.string().min(20) }).parse(raw)
    const result = await this.invitations.exchange(token)
    response.cookie('its_access', result.accessToken, {
      httpOnly: true,
      maxAge: 15 * 60 * 1000,
      path: '/',
      sameSite: 'lax',
      secure: this.config.get('COOKIE_SECURE', { infer: true })
    })
    response.cookie('its_refresh', result.refreshToken, {
      httpOnly: true,
      maxAge:
        this.config.get('REFRESH_TOKEN_TTL_SECONDS', { infer: true }) * 1000,
      path: '/api/v2/auth',
      sameSite: 'lax',
      secure: this.config.get('COOKIE_SECURE', { infer: true })
    })
    return { actor: result.actor }
  }

  @Public()
  @Post('public/evaluations/verify-pin')
  @HttpCode(HttpStatus.OK)
  public async verifyPin(
    @Body() raw: unknown,
    @Res({ passthrough: true }) response: Response
  ): Promise<unknown> {
    const { pin } = z.object({ pin: z.string().min(1) }).parse(raw)
    const result = await this.invitations.verifyPin(pin)
    response.cookie('its_access', result.accessToken, {
      httpOnly: true,
      maxAge: 15 * 60 * 1000,
      path: '/',
      sameSite: 'lax',
      secure: this.config.get('COOKIE_SECURE', { infer: true })
    })
    response.cookie('its_refresh', result.refreshToken, {
      httpOnly: true,
      maxAge:
        this.config.get('REFRESH_TOKEN_TTL_SECONDS', { infer: true }) * 1000,
      path: '/api/v2/auth',
      sameSite: 'lax',
      secure: this.config.get('COOKIE_SECURE', { infer: true })
    })
    return { actor: result.actor, assignmentId: result.assignmentId }
  }
}
