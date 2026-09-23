import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
  Req
} from '@nestjs/common'
import { FileInterceptor } from '@nestjs/platform-express'
import { z } from 'zod'
import { UseInterceptors, UploadedFile } from '@nestjs/common'

import { RequirePermissions } from '../auth/auth.decorators.js'
import type { AuthenticatedRequest } from '../common/http.js'
import { MembersService } from './members.service.js'
import { StudentImportService } from './student-import.service.js'

const nameSchema = z.object({ th: z.string().min(1), en: z.string().min(1) })
const listSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(500).default(25),
  search: z.string().trim().max(100).optional(),
  schoolId: z.string().optional(),
  programId: z.string().optional(),
  organizationId: z.string().optional(),
  studentId: z.string().optional(),
  academicTermId: z.string().optional(),
  status: z.enum(['planned', 'active', 'completed', 'cancelled']).optional(),
  evaluationStatus: z
    .enum([
      'awaiting_evaluator',
      'awaiting_response',
      'submitted',
      'email_error'
    ])
    .optional()
})
const studentSchema = z.object({
  studentId: z.string().min(3).max(30),
  name: nameSchema,
  email: z.email(),
  personalEmail: z.preprocess(
    (v) => (typeof v === 'string' && v.trim() === '' ? undefined : v),
    z.email().optional()
  ),
  schoolId: z.string().min(1),
  programId: z.string().min(1),
  courseId: z.string().optional(),
  academicTermId: z.string().optional(),
  semester: z
    .string()
    .transform((val) => {
      const trimmed = val.trim()
      const lower = trimmed.toLowerCase()
      if (lower === 'first' || lower === '1' || trimmed === 'ภาคการศึกษาต้น')
        return 'ภาคการศึกษาต้น'
      if (lower === 'second' || lower === '2' || trimmed === 'ภาคการศึกษาปลาย')
        return 'ภาคการศึกษาปลาย'
      if (
        lower === 'third' ||
        lower === 'summer' ||
        trimmed.includes('ฤดูร้อน') ||
        lower === '3'
      )
        return 'ภาคการศึกษาฤดูร้อน'
      return trimmed
    })
    .optional(),
  company: z.string().trim().optional(),
  companyAddress: z.string().trim().optional(),
  province: z.string().trim().optional(),
  evaluatorName: z.string().trim().optional(),
  evaluatorEmail: z.string().trim().optional(),
  admissionYear: z.number().int().min(2000).optional(),
  academicYear: z.number().int().min(2000).optional(),
  status: z.enum(['active', 'archived']).default('active')
})
const organizationSchema = z.object({
  organizationCode: z.string().min(1).max(40),
  name: nameSchema,
  address: z.record(z.string(), z.string()).optional(),
  contactEmail: z.email().optional(),
  status: z.enum(['active', 'archived']).default('active')
})
const evaluatorSchema = z.object({
  organizationId: z.string().min(1),
  email: z.email(),
  name: nameSchema,
  position: nameSchema,
  phone: z.string().max(40).optional(),
  status: z.enum(['active', 'archived']).default('active')
})
const placementSchema = z
  .object({
    studentId: z.string().min(1),
    organizationId: z.string().min(1),
    academicTermId: z.string().min(1),
    schoolId: z.string().min(1),
    programId: z.string().min(1),
    positionTitle: nameSchema,
    startsAt: z.coerce.date(),
    endsAt: z.coerce.date(),
    status: z
      .enum(['planned', 'active', 'completed', 'cancelled'])
      .default('planned')
  })
  .refine((value) => value.endsAt > value.startsAt, {
    message: 'endsAt must be after startsAt',
    path: ['endsAt']
  })

const importCommitSchema = z
  .object({
    decisions: z
      .array(
        z.object({
          rowId: z.string().regex(/^[a-f0-9]{24}$/i),
          action: z.enum(['create', 'update'])
        })
      )
      .min(1)
      .max(100)
  })
  .strict()
const idempotencyKeySchema = z
  .string()
  .min(8)
  .max(128)
  .regex(/^[\w.:-]+$/)

interface UploadedWorkbook {
  readonly originalname: string
  readonly buffer: Buffer
}

@Controller()
export class MembersController {
  public constructor(
    private readonly service: MembersService,
    private readonly importService: StudentImportService
  ) {}

  @RequirePermissions('students.import')
  @Post('students/import-preview')
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fields: 0, files: 1, fileSize: 5 * 1024 * 1024 }
    })
  )
  public previewStudentImport(
    @Req() request: AuthenticatedRequest,
    @UploadedFile() file: UploadedWorkbook | undefined
  ): Promise<unknown> {
    if (!file) {
      throw new z.ZodError([
        {
          code: 'custom',
          path: ['file'],
          message: 'A workbook file is required.'
        }
      ])
    }
    return this.importService.preview(
      request.actor!,
      file.originalname,
      file.buffer
    )
  }

  @RequirePermissions('students.import')
  @Get('students/imports/:batchId')
  public getStudentImportPreview(
    @Req() request: AuthenticatedRequest,
    @Param('batchId') batchId: string
  ): Promise<unknown> {
    return this.importService.getPreview(request.actor!, batchId)
  }

  @RequirePermissions('students.import')
  @Post('students/imports/:batchId/commit')
  @HttpCode(HttpStatus.OK)
  public commitStudentImport(
    @Req() request: AuthenticatedRequest,
    @Param('batchId') batchId: string,
    @Headers('idempotency-key') rawIdempotencyKey: string | undefined,
    @Body() raw: unknown
  ): Promise<unknown> {
    const idempotencyKey = idempotencyKeySchema.parse(rawIdempotencyKey)
    const body = importCommitSchema.parse(raw)
    return this.importService.commit(
      request.actor!,
      batchId,
      idempotencyKey,
      body.decisions,
      request.requestId ?? 'unknown'
    )
  }

  @RequirePermissions('students.read')
  @Get('students')
  public listStudents(
    @Req() request: AuthenticatedRequest,
    @Query() raw: unknown
  ): Promise<unknown> {
    return this.service.listStudents(request.actor!, listSchema.parse(raw))
  }

  @RequirePermissions('students.read')
  @Get('students/:studentId')
  public getStudent(
    @Req() request: AuthenticatedRequest,
    @Param('studentId') id: string
  ): Promise<unknown> {
    return this.service.getStudent(request.actor!, id)
  }

  @RequirePermissions('students.manage')
  @Post('students')
  public createStudent(
    @Req() request: AuthenticatedRequest,
    @Body() raw: unknown
  ): Promise<unknown> {
    return this.service.createStudent(request.actor!, studentSchema.parse(raw))
  }

  @RequirePermissions('students.manage')
  @Patch('students/:studentId')
  public updateStudent(
    @Req() request: AuthenticatedRequest,
    @Param('studentId') id: string,
    @Body() raw: unknown
  ): Promise<unknown> {
    const updateSchema = studentSchema.partial()
    return this.service.updateStudent(
      request.actor!,
      id,
      updateSchema.parse(raw)
    )
  }

  @RequirePermissions('students.manage')
  @Delete('students/:studentId')
  @HttpCode(204)
  public archiveStudent(
    @Req() request: AuthenticatedRequest,
    @Param('studentId') id: string
  ): Promise<void> {
    return this.service.archiveStudent(request.actor!, id)
  }

  @RequirePermissions('organizations.read')
  @Get('organizations')
  public listOrganizations(@Query() raw: unknown): Promise<unknown> {
    return this.service.listOrganizations(listSchema.parse(raw))
  }

  @RequirePermissions('organizations.manage')
  @Post('organizations')
  public createOrganization(@Body() raw: unknown): Promise<unknown> {
    return this.service.createOrganization(organizationSchema.parse(raw))
  }

  @RequirePermissions('organizations.read')
  @Get('evaluators')
  public listEvaluators(@Query() raw: unknown): Promise<unknown> {
    return this.service.listEvaluators(listSchema.parse(raw))
  }

  @RequirePermissions('organizations.manage')
  @Post('evaluators')
  public createEvaluator(@Body() raw: unknown): Promise<unknown> {
    return this.service.createEvaluator(evaluatorSchema.parse(raw))
  }

  @RequirePermissions('placements.read')
  @Get('placements')
  public listPlacements(
    @Req() request: AuthenticatedRequest,
    @Query() raw: unknown
  ): Promise<unknown> {
    return this.service.listPlacements(request.actor!, listSchema.parse(raw))
  }

  @RequirePermissions('placements.manage')
  @Post('placements')
  public createPlacement(
    @Req() request: AuthenticatedRequest,
    @Body() raw: unknown
  ): Promise<unknown> {
    return this.service.createPlacement(
      request.actor!,
      placementSchema.parse(raw)
    )
  }
}
