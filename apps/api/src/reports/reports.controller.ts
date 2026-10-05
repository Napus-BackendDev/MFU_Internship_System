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
const assignmentExportRequestSchema = z
  .object({
    reportType: z.literal('assignments').optional(),
    filters: overviewFilterSchema.default({}),
    fields: z
      .array(z.enum(REPORT_EXPORT_FIELDS))
      .min(1)
      .max(REPORT_EXPORT_FIELDS.length)
      .refine((fields) => new Set(fields).size === fields.length, {
        message: 'Export fields must be unique.'
      })
      .optional(),
    format: z.literal('csv').default('csv')
  })
  .strict()
  .transform((input) => ({ ...input, reportType: 'assignments' as const }))
const studentDirectoryExportRequestSchema = z
  .object({
    reportType: z.literal('studentDirectory'),
    filters: z
      .object({
        search: z.string().trim().max(100).optional(),
        schoolId: objectIdSchema.optional(),
        cycleId: objectIdSchema.optional(),
        academicYear: z.number().int().min(2000).max(3000).optional(),
        semester: z.string().trim().min(1).max(40).optional(),
        evaluationStatus: z
          .enum([
            'awaiting_evaluator',
            'awaiting_response',
            'submitted',
            'email_error',
            'pending',
            'inProgress',
            'expired',
            'assignment_ambiguous'
          ])
          .optional()
      })
      .strict()
      .default({}),
    locale: z.enum(['th', 'en']),
    format: z.literal('xlsx')
  })
  .strict()
const exportRequestSchema = z.union([
  studentDirectoryExportRequestSchema,
  assignmentExportRequestSchema
])
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
      reportType: input.reportType,
      filters: input.filters,
      ...(input.reportType === 'assignments'
        ? { fields: input.fields ?? [...DEFAULT_REPORT_EXPORT_FIELDS] }
        : { locale: input.locale }),
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
