import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Put,
  Req
} from '@nestjs/common'

import { RequirePermissions } from '../auth/auth.decorators.js'
import type { AuthenticatedRequest } from '../common/http.js'
import { SmtpSettingsService } from './smtp-settings.service.js'
import {
  smtpSettingsUpdateSchema,
  smtpTestInputSchema
} from './smtp-settings.validation.js'

@Controller('system-settings/smtp')
@RequirePermissions('system.config.manage')
export class SmtpSettingsController {
  public constructor(private readonly smtp: SmtpSettingsService) {}

  @Get()
  public get(): Promise<unknown> {
    return this.smtp.get()
  }

  @Put()
  public update(
    @Req() request: AuthenticatedRequest,
    @Body() raw: unknown
  ): Promise<unknown> {
    return this.smtp.update(request.actor!, smtpSettingsUpdateSchema.parse(raw))
  }

  @Post('test')
  @HttpCode(HttpStatus.ACCEPTED)
  public test(
    @Req() request: AuthenticatedRequest,
    @Body() raw: unknown
  ): Promise<unknown> {
    const input = smtpTestInputSchema.parse(raw)
    return this.smtp.enqueueTest(request.actor!, input.recipientEmail)
  }

  @Get('tests/:testId')
  public getTest(@Param('testId') testId: string): Promise<unknown> {
    return this.smtp.getTest(testId)
  }
}
