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
  schoolId: z.string().optional()
})
const courseSchema = z.object({
  courseCode: z
    .string()
    .min(1)
    .max(30)
    .optional()
    .transform((val) => val || `CRS-${Date.now().toString(36).toUpperCase()}`),
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
    return this.service.listSchools(request.actor!, pageSchema.parse(raw))
  }

  @RequirePermissions('academic.manage')
  @Post('schools')
  public createSchool(@Body() raw: unknown): Promise<unknown> {
    return this.service.createSchool(schoolSchema.parse(raw))
  }

  @RequirePermissions('academic.manage')
  @Patch('schools/:schoolId')
  public updateSchool(
    @Param('schoolId') id: string,
    @Body() raw: unknown
  ): Promise<unknown> {
    return this.service.updateSchool(id, schoolSchema.partial().parse(raw))
  }

  @RequirePermissions('academic.read')
  @Get('programs')
  public listPrograms(
    @Req() request: AuthenticatedRequest,
    @Query() raw: unknown
  ): Promise<unknown> {
    const query = programQuerySchema.parse(raw)
    return this.service.listPrograms(request.actor!, query, query.schoolId)
  }

  @RequirePermissions('academic.manage')
  @Post('programs')
  public createProgram(@Body() raw: unknown): Promise<unknown> {
    return this.service.createProgram(programSchema.parse(raw))
  }

  @RequirePermissions('academic.manage')
  @Patch('programs/:programId')
  public updateProgram(
    @Param('programId') id: string,
    @Body() raw: unknown
  ): Promise<unknown> {
    return this.service.updateProgram(id, programSchema.partial().parse(raw))
  }

  @RequirePermissions('academic.read')
  @Get('courses')
  public listCourses(@Query() raw: unknown): Promise<unknown> {
    return this.service.listCourses(pageSchema.parse(raw))
  }

  @RequirePermissions('academic.manage')
  @Post('courses')
  public createCourse(@Body() raw: unknown): Promise<unknown> {
    return this.service.createCourse(courseSchema.parse(raw))
  }

  @RequirePermissions('academic.manage')
  @Patch('courses/:courseId')
  public updateCourse(
    @Param('courseId') id: string,
    @Body() raw: unknown
  ): Promise<unknown> {
    return this.service.updateCourse(id, courseSchema.partial().parse(raw))
  }

  @RequirePermissions('academic.read')
  @Get('terms')
  public listTerms(@Query() raw: unknown): Promise<unknown> {
    return this.service.listTerms(pageSchema.parse(raw))
  }

  @RequirePermissions('academic.manage')
  @Post('terms')
  public createTerm(@Body() raw: unknown): Promise<unknown> {
    return this.service.createTerm(termSchema.parse(raw))
  }

  @RequirePermissions('academic.manage')
  @Patch('terms/:termId')
  public updateTerm(
    @Param('termId') id: string,
    @Body() raw: unknown
  ): Promise<unknown> {
    return this.service.updateTerm(id, termBaseSchema.partial().parse(raw))
  }
}
