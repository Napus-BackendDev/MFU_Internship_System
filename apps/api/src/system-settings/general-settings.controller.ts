import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Put,
  Query
} from '@nestjs/common'
import { z } from 'zod'

import { Authenticated, RequireAnyPermission } from '../auth/auth.decorators.js'
import { GeneralSettingsService } from './general-settings.service.js'

const provinceCreateSchema = z.object({
  code: z.string().min(2).max(20),
  nameTh: z.string().min(1).max(100),
  nameEn: z.string().min(1).max(100),
  region: z.string().min(1).max(50),
  status: z.enum(['active', 'inactive']).default('active')
})

const provinceUpdateSchema = z.object({
  code: z.string().min(2).max(20).optional(),
  nameTh: z.string().min(1).max(100).optional(),
  nameEn: z.string().min(1).max(100).optional(),
  region: z.string().min(1).max(50).optional(),
  status: z.enum(['active', 'inactive']).optional()
})

const generalConfigUpdateSchema = z.object({
  institutionNameTh: z.string().optional(),
  institutionNameEn: z.string().optional(),
  departmentName: z.string().optional(),
  defaultInternshipHours: z.number().min(0).optional(),
  currentAcademicYear: z.number().min(2500).optional(),
  currentSemester: z.string().optional(),
  contactEmail: z.string().email().optional(),
  contactPhone: z.string().optional(),
  companyTypes: z.array(z.string()).optional()
})

@Controller('system-settings')
export class GeneralSettingsController {
  public constructor(private readonly service: GeneralSettingsService) {}

  @Get('provinces')
  @Authenticated()
  public listProvinces(
    @Query('search') search?: string,
    @Query('region') region?: string,
    @Query('status') status?: string
  ): Promise<unknown> {
    return this.service.listProvinces({ search, region, status })
  }

  @Post('provinces')
  @RequireAnyPermission('academic.manage', 'system.config.manage')
  public createProvince(@Body() raw: unknown): Promise<unknown> {
    const input = provinceCreateSchema.parse(raw)
    return this.service.createProvince(input)
  }

  @Patch('provinces/:id')
  @RequireAnyPermission('academic.manage', 'system.config.manage')
  public updateProvince(
    @Param('id') id: string,
    @Body() raw: unknown
  ): Promise<unknown> {
    const input = provinceUpdateSchema.parse(raw)
    return this.service.updateProvince(id, input)
  }

  @Delete('provinces/:id')
  @RequireAnyPermission('academic.manage', 'system.config.manage')
  public deleteProvince(@Param('id') id: string): Promise<unknown> {
    return this.service.deleteProvince(id)
  }

  @Post('provinces/reset')
  @RequireAnyPermission('academic.manage', 'system.config.manage')
  @HttpCode(HttpStatus.OK)
  public resetProvinces(): Promise<unknown> {
    return this.service.resetProvinces()
  }

  @Get('general')
  @Authenticated()
  public getGeneralConfig(): Promise<unknown> {
    return this.service.getGeneralConfig()
  }

  @Put('general')
  @RequireAnyPermission('academic.manage', 'system.config.manage')
  public updateGeneralConfig(@Body() raw: unknown): Promise<unknown> {
    const input = generalConfigUpdateSchema.parse(raw)
    return this.service.updateGeneralConfig(input)
  }
}
