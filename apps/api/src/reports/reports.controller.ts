import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
  Req
} from '@nestjs/common'
import { z } from 'zod'

import { RequirePermissions } from '../auth/auth.decorators.js'
import type { AuthenticatedRequest } from '../common/http.js'
import { ReportExportService } from './report-export.service.js'
import { ReportsService } from './reports.service.js'
import {
  DEFAULT_REPORT_EXPORT_FIELDS,
  REPORT_EXPORT_FORMATS,
  REPORT_EXPORT_FIELDS
} from '@internship/shared-types'

const objectIdSchema = z.string().regex(/^[a-f\d]{24}$/i)
const overviewFilterSchema = z
  .object({
    termId: objectIdSchema.optional(),
    schoolId: objectIdSchema.optional(),
    programId: objectIdSchema.optional()
  })
  .strict()
const programFilterSchema = z
  .object({
    termId: objectIdSchema.optional(),
    schoolId: objectIdSchema.optional()
  })
  .strict()
const exportRequestSchema = z
  .object({
    filters: overviewFilterSchema.default({}),
    fields: z
      .array(z.enum(REPORT_EXPORT_FIELDS))
      .min(1)
      .max(REPORT_EXPORT_FIELDS.length)
      .refine((fields) => new Set(fields).size === fields.length, {
        message: 'Export fields must be unique.'
      })
      .optional(),
    format: z.enum(REPORT_EXPORT_FORMATS).default('csv')
  })
  .strict()
const idempotencyKeySchema = z.string().trim().min(8).max(128)
const exportIdSchema = objectIdSchema

@Controller('reports')
export class ReportsController {
  public constructor(
    private readonly service: ReportsService,
    private readonly exportService: ReportExportService
  ) {}

  @RequirePermissions('reports.read')
  @Get('overview')
  public overview(
    @Req() request: AuthenticatedRequest,
    @Query() raw: unknown
  ): Promise<unknown> {
    return this.service.overview(
      request.actor!,
      overviewFilterSchema.parse(raw)
    )
  }

  @RequirePermissions('reports.read')
  @Get('programs')
  public programs(
    @Req() request: AuthenticatedRequest,
    @Query() raw: unknown
  ): Promise<unknown> {
    return this.service.programs(request.actor!, programFilterSchema.parse(raw))
  }

  @RequirePermissions('exports.create')
  @Post('exports')
  @HttpCode(HttpStatus.ACCEPTED)
  public createExport(
    @Req() request: AuthenticatedRequest,
    @Headers('idempotency-key') rawIdempotencyKey: unknown,
    @Body() raw: unknown
  ): Promise<unknown> {
    const idempotencyKey = idempotencyKeySchema.parse(rawIdempotencyKey)
    const input = exportRequestSchema.parse(raw)
    return this.exportService.create(request.actor!, {
      filters: input.filters,
      fields: input.fields ?? [...DEFAULT_REPORT_EXPORT_FIELDS],
      format: input.format,
      idempotencyKey,
      requestId: request.requestId ?? 'unknown'
    })
  }

  @RequirePermissions('exports.download')
  @Get('exports/:exportId')
  public getExport(
    @Req() request: AuthenticatedRequest,
    @Param('exportId') id: string
  ): Promise<unknown> {
    return this.exportService.get(request.actor!, exportIdSchema.parse(id))
  }

  @RequirePermissions('exports.download')
  @Get('exports/:exportId/download-url')
  public downloadExport(
    @Req() request: AuthenticatedRequest,
    @Param('exportId') id: string
  ): Promise<unknown> {
    return this.exportService.downloadUrl(
      request.actor!,
      exportIdSchema.parse(id),
      request.requestId ?? 'unknown'
    )
  }
}
