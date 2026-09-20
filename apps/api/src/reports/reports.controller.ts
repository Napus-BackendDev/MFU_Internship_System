import { Controller, Get, Req } from '@nestjs/common'

import { RequirePermissions } from '../auth/auth.decorators.js'
import type { AuthenticatedRequest } from '../common/http.js'
import { ReportsService } from './reports.service.js'

@Controller('reports')
export class ReportsController {
  public constructor(private readonly service: ReportsService) {}

  @RequirePermissions('reports.read')
  @Get('overview')
  public overview(@Req() request: AuthenticatedRequest): Promise<unknown> {
    return this.service.overview(request.actor!)
  }

  @RequirePermissions('reports.read')
  @Get('programs')
  public programs(@Req() request: AuthenticatedRequest): Promise<unknown> {
    return this.service.programs(request.actor!)
  }
}
