import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req
} from '@nestjs/common'
import { z } from 'zod'

import { RequirePermissions } from '../auth/auth.decorators.js'
import type { AuthenticatedRequest } from '../common/http.js'
import { AcademicService } from './academic.service.js'

const pageSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(500).default(25)
})
const objectIdCsvSchema = (maximum: number): z.ZodType<string[] | undefined> =>
  z
    .string()
    .max(maximum * 25 - 1)
    .optional()
    .transform((value) => value?.split(','))
    .pipe(
      z
        .array(z.string().regex(/^[a-f\d]{24}$/i))
        .max(maximum)
        .optional()
    )
    .transform((ids) =>
      ids === undefined
        ? undefined
        : [...new Set(ids.map((id) => id.toLowerCase()))]
    )
const optionalSearchSchema = z
  .string()
  .trim()
  .max(100)
  .optional()
  .transform((value) => value || undefined)
const archivedQuerySchema = z
  .enum(['true', 'false'])
  .transform((value) => value === 'true')
  .optional()
const schoolListSchema = pageSchema.extend({
  search: optionalSearchSchema,
  schoolIds: objectIdCsvSchema(100),
  archived: archivedQuerySchema
})
const termListSchema = pageSchema.extend({
  academicYear: z.coerce.number().int().min(2000).optional(),
  search: optionalSearchSchema,
  termIds: objectIdCsvSchema(100),
  archived: archivedQuerySchema
})
const nameSchema = z.object({ th: z.string().min(1), en: z.string().min(1) })
const schoolSchema = z.object({
  schoolCode: z.string().min(1).max(20),
  name: nameSchema,
  status: z.enum(['active', 'archived']).default('active')
})
const programSchema = z.object({
  schoolId: z.string().min(1),
  programCode: z.string().min(1).max(20),
  name: nameSchema,
  status: z.enum(['active', 'archived']).default('active')
})
const programQuerySchema = pageSchema.extend({
  search: optionalSearchSchema,
  schoolId: z.string().optional(),
  archived: archivedQuerySchema,
  programIds: z
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
    )
})
const courseListSchema = pageSchema.extend({
  search: optionalSearchSchema,
  programId: z
    .string()
    .regex(/^[a-f\d]{24}$/i)
    .optional(),
  courseIds: objectIdCsvSchema(100),
  archived: archivedQuerySchema
})
const courseSchema = z.object({
  courseCode: z.string().trim().min(1).max(30),
  programIds: z.array(z.string()).default([]),
  name: nameSchema,
  credits: z.number().min(0).optional(),
  status: z.enum(['active', 'archived']).default('active')
})
const termBaseSchema = z.object({
  code: z.string().min(1),
  academicYear: z.number().int().min(2000),
  semester: z.string().min(1),
  startsAt: z.coerce.date(),
  endsAt: z.coerce.date(),
  timezone: z.literal('Asia/Bangkok').default('Asia/Bangkok'),
  status: z.enum(['planned', 'open', 'closed', 'archived']).default('planned')
})
const termSchema = termBaseSchema.refine(
  (value) => value.endsAt > value.startsAt,
  {
    message: 'endsAt must be after startsAt',
    path: ['endsAt']
  }
)

@Controller('academic')
export class AcademicController {
  public constructor(private readonly service: AcademicService) {}

  @RequirePermissions('academic.read')
  @Get('schools')
  public listSchools(
    @Req() request: AuthenticatedRequest,
    @Query() raw: unknown
  ): Promise<unknown> {
    const query = schoolListSchema.parse(raw)
    return this.service.listSchools(
      request.actor!,
      { page: query.page, pageSize: query.pageSize },
      {
        search: query.search,
        schoolIds: query.schoolIds,
        archived: query.archived
      }
    )
  }

  @RequirePermissions('academic.manage')
  @Post('schools')
  public createSchool(
    @Req() request: AuthenticatedRequest,
    @Body() raw: unknown
  ): Promise<unknown> {
    return this.service.createSchool(
      request.actor!,
      schoolSchema.parse(raw),
      request.requestId ?? 'unknown'
    )
  }

  @RequirePermissions('academic.manage')
  @Patch('schools/:schoolId')
  public updateSchool(
    @Req() request: AuthenticatedRequest,
    @Param('schoolId') id: string,
    @Body() raw: unknown
  ): Promise<unknown> {
    return this.service.updateSchool(
      request.actor!,
      id,
      schoolSchema.partial().parse(raw),
      request.requestId ?? 'unknown'
    )
  }

  @RequirePermissions('academic.read')
  @Get('programs')
  public listPrograms(
    @Req() request: AuthenticatedRequest,
    @Query() raw: unknown
  ): Promise<unknown> {
    const query = programQuerySchema.parse(raw)
    return this.service.listPrograms(
      request.actor!,
      query,
      query.schoolId,
      query.programIds,
      { search: query.search, archived: query.archived }
    )
  }

  @RequirePermissions('academic.manage')
  @Post('programs')
  public createProgram(
    @Req() request: AuthenticatedRequest,
    @Body() raw: unknown
  ): Promise<unknown> {
    return this.service.createProgram(
      request.actor!,
      programSchema.parse(raw),
      request.requestId ?? 'unknown'
    )
  }

  @RequirePermissions('academic.manage')
  @Patch('programs/:programId')
  public updateProgram(
    @Req() request: AuthenticatedRequest,
    @Param('programId') id: string,
    @Body() raw: unknown
  ): Promise<unknown> {
    return this.service.updateProgram(
      request.actor!,
      id,
      programSchema.partial().parse(raw),
      request.requestId ?? 'unknown'
    )
  }

  @RequirePermissions('academic.read')
  @Get('courses')
  public listCourses(
    @Req() request: AuthenticatedRequest,
    @Query() raw: unknown
  ): Promise<unknown> {
    const query = courseListSchema.parse(raw)
    return this.service.listCourses(request.actor!, query, {
      search: query.search,
      programId: query.programId,
      courseIds: query.courseIds,
      archived: query.archived
    })
  }

  @RequirePermissions('academic.manage')
  @Post('courses')
  public createCourse(
    @Req() request: AuthenticatedRequest,
    @Body() raw: unknown
  ): Promise<unknown> {
    return this.service.createCourse(
      request.actor!,
      courseSchema.parse(raw),
      request.requestId ?? 'unknown'
    )
  }

  @RequirePermissions('academic.manage')
  @Patch('courses/:courseId')
  public updateCourse(
    @Req() request: AuthenticatedRequest,
    @Param('courseId') id: string,
    @Body() raw: unknown
  ): Promise<unknown> {
    return this.service.updateCourse(
      request.actor!,
      id,
      courseSchema.partial().parse(raw),
      request.requestId ?? 'unknown'
    )
  }

  @RequirePermissions('academic.read')
  @Get('terms')
  public listTerms(
    @Req() request: AuthenticatedRequest,
    @Query() raw: unknown
  ): Promise<unknown> {
    const query = termListSchema.parse(raw)
    return this.service.listTerms(
      request.actor!,
      { page: query.page, pageSize: query.pageSize },
      query.academicYear,
      {
        search: query.search,
        termIds: query.termIds,
        archived: query.archived
      }
    )
  }

  @RequirePermissions('academic.manage')
  @Post('terms')
  public createTerm(
    @Req() request: AuthenticatedRequest,
    @Body() raw: unknown
  ): Promise<unknown> {
    return this.service.createTerm(
      request.actor!,
      termSchema.parse(raw),
      request.requestId ?? 'unknown'
    )
  }

  @RequirePermissions('academic.manage')
  @Patch('terms/:termId')
  public updateTerm(
    @Req() request: AuthenticatedRequest,
    @Param('termId') id: string,
    @Body() raw: unknown
  ): Promise<unknown> {
    return this.service.updateTerm(
      request.actor!,
      id,
      termBaseSchema.partial().parse(raw),
      request.requestId ?? 'unknown'
    )
  }
}
