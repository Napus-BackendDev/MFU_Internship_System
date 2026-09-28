import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Put,
  Query,
  Req
} from '@nestjs/common'
import { z } from 'zod'

import { RequirePermissions } from '../auth/auth.decorators.js'
import type { AuthenticatedRequest } from '../common/http.js'
import { EvaluationsService } from './evaluations.service.js'

const nameSchema = z.object({ th: z.string().min(1), en: z.string().min(1) })
const pageSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(500).default(25),
  cycleId: z
    .string()
    .regex(/^[a-fA-F0-9]{24}$/)
    .optional(),
  studentId: z
    .string()
    .regex(/^[a-fA-F0-9]{24}$/)
    .optional(),
  organizationId: z
    .string()
    .regex(/^[a-fA-F0-9]{24}$/)
    .optional()
    .transform((value) => value?.toLowerCase()),
  search: z
    .string()
    .trim()
    .max(100)
    .optional()
    .transform((value) => value || undefined),
  status: z
    .enum([
      'pending',
      'inProgress',
      'submitted',
      'expired',
      'reopened',
      'email_error'
    ])
    .optional()
})
const competencySetListSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(500).default(25),
  search: z
    .string()
    .trim()
    .max(100)
    .optional()
    .transform((value) => value || undefined),
  archived: z
    .enum(['true', 'false'])
    .transform((value) => value === 'true')
    .optional()
})
const cycleListSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(500).default(25),
  search: z
    .string()
    .trim()
    .max(100)
    .optional()
    .transform((value) => value || undefined),
  cycleIds: z
    .string()
    .max(2499)
    .optional()
    .transform((value) => value?.split(','))
    .pipe(
      z
        .array(z.string().regex(/^[a-f\d]{24}$/i))
        .max(100)
        .optional()
    )
    .transform((ids) =>
      ids === undefined
        ? undefined
        : [...new Set(ids.map((id) => id.toLowerCase()))]
    ),
  termId: z
    .string()
    .regex(/^[a-f\d]{24}$/i)
    .optional(),
  status: z.enum(['draft', 'active', 'closed']).optional()
})
const questionSchema = z
  .object({
    id: z.string().min(1),
    label: nameSchema,
    type: z.enum(['rating', 'text', 'boolean']),
    required: z.boolean().default(true),
    weight: z.number().min(0).optional(),
    scaleMin: z.number().optional(),
    scaleMax: z.number().optional()
  })
  .refine(
    (value) =>
      value.type !== 'rating' ||
      (value.scaleMin !== undefined &&
        value.scaleMax !== undefined &&
        value.scaleMax > value.scaleMin),
    { message: 'Rating scale is invalid.' }
  )
const sectionsSchema = z.array(
  z.object({
    id: z.string().min(1),
    title: nameSchema,
    category: z.enum(['general', 'special', 'suggestion']).default('general'),
    schoolId: z.string().optional(),
    programId: z.string().optional(),
    questions: z.array(questionSchema)
  })
)
const competencySetSchema = z.object({
  code: z.string().min(1).max(40),
  name: nameSchema,
  status: z.enum(['active', 'archived']).default('active')
})
const cycleSchema = z
  .object({
    code: z.string().min(1),
    name: nameSchema,
    competencySetVersionId: z.string().min(1),
    academicTermId: z.string().min(1),
    schoolId: z.string().optional(),
    programId: z.string().optional(),
    opensAt: z.coerce.date(),
    closesAt: z.coerce.date(),
    status: z.literal('draft').default('draft')
  })
  .refine((value) => value.closesAt > value.opensAt, {
    message: 'closesAt must be after opensAt',
    path: ['closesAt']
  })
const assignmentSchema = z.object({
  cycleId: z.string().min(1),
  placementId: z.string().min(1),
  evaluatorId: z.string().min(1),
  studentId: z.string().min(1),
  schoolId: z.string().min(1),
  programId: z.string().min(1),
  deadlineAt: z.coerce.date(),
  status: z.literal('pending').default('pending'),
  evaluationVersion: z.literal(1).default(1)
})
const draftSchema = z.object({
  answers: z.record(z.string(), z.unknown()),
  revision: z.number().int().min(0)
})
const submitSchema = z.object({
  answers: z.record(z.string(), z.unknown())
})

@Controller()
export class EvaluationsController {
  public constructor(private readonly service: EvaluationsService) {}

  @RequirePermissions('competencies.read')
  @Get('competency-sets')
  public listCompetencySets(
    @Req() request: AuthenticatedRequest,
    @Query() raw: unknown
  ): Promise<unknown> {
    const query = competencySetListSchema.parse(raw)
    return this.service.listCompetencySets(
      request.actor!,
      { page: query.page, pageSize: query.pageSize },
      { search: query.search, archived: query.archived }
    )
  }

  @RequirePermissions('competencies.manage')
  @Post('competency-sets')
  public createCompetencySet(
    @Req() request: AuthenticatedRequest,
    @Body() raw: unknown
  ): Promise<unknown> {
    return this.service.createCompetencySet(
      request.actor!,
      competencySetSchema.parse(raw)
    )
  }

  @RequirePermissions('competencies.manage')
  @Post('competency-sets/:competencySetId/versions')
  public createCompetencyVersion(
    @Req() request: AuthenticatedRequest,
    @Param('competencySetId') competencySetId: string,
    @Body() raw: unknown
  ): Promise<unknown> {
    const body = z.object({ sections: sectionsSchema.default([]) }).parse(raw)
    return this.service.createCompetencyVersion(
      request.actor!,
      competencySetId,
      body.sections
    )
  }

  @RequirePermissions('competencies.read')
  @Get('competency-sets/:competencySetId/versions')
  public listCompetencyVersions(
    @Req() request: AuthenticatedRequest,
    @Param('competencySetId') competencySetId: string
  ): Promise<unknown> {
    return this.service.listCompetencyVersions(request.actor!, competencySetId)
  }

  @RequirePermissions('competencies.read')
  @Get('competency-set-versions/:versionId')
  public getCompetencyVersion(
    @Req() request: AuthenticatedRequest,
    @Param('versionId') id: string
  ): Promise<unknown> {
    return this.service.getCompetencyVersion(request.actor!, id)
  }

  @RequirePermissions('competencies.manage')
  @Patch('competency-set-versions/:versionId')
  public updateCompetencyVersion(
    @Req() request: AuthenticatedRequest,
    @Param('versionId') id: string,
    @Body() raw: unknown
  ): Promise<unknown> {
    const body = z.object({ sections: sectionsSchema }).parse(raw)
    return this.service.updateCompetencyVersion(
      request.actor!,
      id,
      body.sections
    )
  }

  @RequirePermissions('competencies.publish')
  @Post('competency-set-versions/:versionId/publish')
  public publishCompetencyVersion(
    @Req() request: AuthenticatedRequest,
    @Param('versionId') id: string
  ): Promise<unknown> {
    return this.service.publishCompetencyVersion(id, request.actor!)
  }

  @RequirePermissions('cycles.read')
  @Get('evaluation-cycles')
  public listCycles(
    @Req() request: AuthenticatedRequest,
    @Query() raw: unknown
  ): Promise<unknown> {
    const query = cycleListSchema.parse(raw)
    return this.service.listCycles(request.actor!, query, {
      search: query.search,
      cycleIds: query.cycleIds,
      termId: query.termId,
      status: query.status
    })
  }

  @RequirePermissions('cycles.manage')
  @Post('evaluation-cycles')
  public createCycle(
    @Req() request: AuthenticatedRequest,
    @Body() raw: unknown
  ): Promise<unknown> {
    return this.service.createCycle(
      request.actor!,
      cycleSchema.parse(raw),
      request.requestId ?? 'unknown'
    )
  }

  @RequirePermissions('cycles.manage')
  @Get('evaluation-cycles/:cycleId/preview')
  public previewCycle(
    @Req() request: AuthenticatedRequest,
    @Param('cycleId') id: string
  ): Promise<unknown> {
    return this.service.previewCycle(request.actor!, id)
  }

  @RequirePermissions('cycles.manage')
  @Post('evaluation-cycles/:cycleId/activate')
  public activateCycle(
    @Req() request: AuthenticatedRequest,
    @Param('cycleId') id: string
  ): Promise<unknown> {
    return this.service.activateCycle(
      request.actor!,
      id,
      request.requestId ?? 'unknown'
    )
  }

  @RequirePermissions('cycles.manage')
  @Post('evaluation-cycles/:cycleId/close')
  @HttpCode(HttpStatus.OK)
  public closeCycle(
    @Req() request: AuthenticatedRequest,
    @Param('cycleId') id: string
  ): Promise<unknown> {
    return this.service.closeCycle(
      request.actor!,
      id,
      request.requestId ?? 'unknown'
    )
  }

  @RequirePermissions('evaluations.read')
  @Get('evaluation-assignments')
  public listAssignments(
    @Req() request: AuthenticatedRequest,
    @Query() raw: unknown
  ): Promise<unknown> {
    return this.service.listAssignments(request.actor!, pageSchema.parse(raw))
  }

  @RequirePermissions('cycles.manage')
  @Post('evaluation-assignments')
  public createAssignment(
    @Req() request: AuthenticatedRequest,
    @Body() raw: unknown
  ): Promise<unknown> {
    return this.service.createAssignment(
      request.actor!,
      assignmentSchema.parse(raw),
      request.requestId ?? 'unknown'
    )
  }

  @RequirePermissions('evaluations.read')
  @Get('evaluations/:evaluationId')
  public getEvaluation(
    @Req() request: AuthenticatedRequest,
    @Param('evaluationId') id: string
  ): Promise<unknown> {
    return this.service.getEvaluation(request.actor!, id)
  }

  @RequirePermissions('evaluations.draft')
  @Put('evaluations/:evaluationId/draft')
  public saveDraft(
    @Req() request: AuthenticatedRequest,
    @Param('evaluationId') id: string,
    @Body() raw: unknown
  ): Promise<unknown> {
    return this.service.saveDraft(request.actor!, id, draftSchema.parse(raw))
  }

  @RequirePermissions('evaluations.submit')
  @Post('evaluations/:evaluationId/submit')
  public submit(
    @Req() request: AuthenticatedRequest,
    @Param('evaluationId') id: string,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Body() raw: unknown
  ): Promise<unknown> {
    const key = z.string().min(8).max(128).parse(idempotencyKey)
    return this.service.submit(
      request.actor!,
      id,
      {
        ...submitSchema.parse(raw),
        idempotencyKey: key
      },
      request.requestId ?? 'unknown'
    )
  }

  @RequirePermissions('evaluations.reopen')
  @Post('evaluations/:evaluationId/reopen')
  public reopen(): never {
    return this.service.reopen()
  }
}
