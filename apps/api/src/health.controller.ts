import type { HealthStatus } from '@internship/shared-types'
import { Controller, Get, HttpStatus, Res } from '@nestjs/common'
import type { Response } from 'express'

import { Public } from './auth/auth.decorators.js'
import { HealthService } from './health.service.js'

@Controller('health')
export class HealthController {
  public constructor(private readonly healthService: HealthService) {}

  @Public()
  @Get()
  public getHealth(): HealthStatus {
    return this.healthService.getHealth()
  }

  @Public()
  @Get('live')
  public getLiveness(): HealthStatus {
    return this.healthService.getHealth()
  }

  @Public()
  @Get('ready')
  public async getReadiness(
    @Res({ passthrough: true }) response: Response
  ): Promise<unknown> {
    const readiness = await this.healthService.getReadiness()
    if (!readiness.ready) response.status(HttpStatus.SERVICE_UNAVAILABLE)
    return readiness
  }
}
