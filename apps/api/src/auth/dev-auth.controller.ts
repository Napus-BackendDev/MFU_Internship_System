import type { AppEnvironment } from '@internship/config'
import type { AuthenticatedActor } from '@internship/shared-types'
import { ROLE_KEYS } from '@internship/shared-types'
import {
  Body,
  Controller,
  Get,
  NotFoundException,
  Post,
  Query,
  Res
} from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { InjectModel } from '@nestjs/mongoose'
import type { Response } from 'express'
import type { Model } from 'mongoose'
import { z } from 'zod'

import { boundedSearch } from '../common/search.js'
import { StudentRecord } from '../members/members.schema.js'
import { studentReferenceFilter } from '../members/student-reference.js'
import { Public } from './auth.decorators.js'
import { SessionService } from './session.service.js'

function studentDisplayName(name: unknown, fallback: string): string {
  if (typeof name === 'string' && name.trim()) return name.trim()
  if (typeof name === 'object' && name !== null) {
    const localized = name as { th?: unknown; en?: unknown }
    for (const value of [localized.th, localized.en]) {
      if (typeof value === 'string' && value.trim()) return value.trim()
    }
  }
  return fallback
}

const developmentLoginSchema = z.object({
  email: z.email().default('admin@localhost'),
  displayName: z.string().min(1).default('Development Administrator'),
  role: z.enum(ROLE_KEYS).default('systemAdmin'),
  schoolIds: z.array(z.string()).default([]),
  programIds: z.array(z.string()).default([]),
  studentId: z.string().optional(),
  assignmentId: z.string().optional(),
  avatarUrl: z.string().optional()
})

@Controller('auth/dev')
export class DevAuthController {
  public constructor(
    private readonly config: ConfigService<AppEnvironment, true>,
    private readonly sessionService: SessionService,
    @InjectModel(StudentRecord.name)
    private readonly students: Model<StudentRecord>
  ) {}

  private assertEnabled(): void {
    const nodeEnv = this.config.get('NODE_ENV', { infer: true })
    const authMode = this.config.get('AUTH_MODE', { infer: true })
    if (
      (nodeEnv !== 'development' && nodeEnv !== 'test') ||
      authMode !== 'development'
    ) {
      throw new NotFoundException({ code: 'RESOURCE_NOT_FOUND' })
    }
  }

  // Test logins choose a real Student, so the Student pages show that record.
  @Public()
  @Get('students')
  public async listStudents(@Query('search') raw: unknown): Promise<{
    items: { studentId: string; name: string; email: string }[]
  }> {
    this.assertEnabled()
    const search = z.string().trim().max(100).optional().parse(raw)
    const pattern = search ? boundedSearch(search) : undefined
    const students = await this.students
      .find({
        status: 'active',
        ...(pattern
          ? {
              $or: [
                { studentId: { $regex: pattern, $options: 'i' } },
                { email: { $regex: pattern, $options: 'i' } },
                { name: { $regex: pattern, $options: 'i' } },
                { 'name.th': { $regex: pattern, $options: 'i' } },
                { 'name.en': { $regex: pattern, $options: 'i' } }
              ]
            }
          : {})
      })
      .select('studentId name email')
      .sort({ studentId: -1, _id: -1 })
      .limit(20)
      .lean()
      .exec()
    return {
      items: students.map((student) => ({
        studentId: student.studentId,
        name: studentDisplayName(student.name, student.studentId),
        email: student.email
      }))
    }
  }

  @Public()
  @Post('login')
  public async login(
    @Body() raw: unknown,
    @Res({ passthrough: true }) response: Response
  ): Promise<{ actor: AuthenticatedActor }> {
    this.assertEnabled()
    const input = developmentLoginSchema.parse(raw)
    if (input.role === 'student') {
      // A Student session without a matching record shows only empty pages.
      const student = input.studentId
        ? await this.students
            .findOne({
              ...studentReferenceFilter(input.studentId),
              status: 'active'
            })
            .select('studentId name email')
            .lean()
            .exec()
        : null
      if (!student) {
        throw new NotFoundException({
          code: 'DEV_STUDENT_NOT_FOUND',
          message: 'ไม่พบนักศึกษาคนนี้ในระบบ กรุณาเลือกนักศึกษาจากรายชื่อ'
        })
      }
      input.studentId = student.studentId
      input.email = student.email
      input.displayName = studentDisplayName(student.name, student.studentId)
    }
    const actor: AuthenticatedActor = {
      id: `dev:${input.email}`,
      email: input.email,
      displayName: input.displayName,
      roles: [input.role],
      scope: {
        tenant:
          input.role === 'systemAdmin' || input.role === 'internshipStaff',
        schoolIds: input.schoolIds,
        programIds: input.programIds,
        ...(input.studentId ? { studentId: input.studentId } : {}),
        ...(input.assignmentId ? { assignmentId: input.assignmentId } : {})
      },
      roleScopes: [
        {
          role: input.role,
          tenant:
            input.role === 'systemAdmin' || input.role === 'internshipStaff',
          schoolIds: input.schoolIds,
          programIds: input.programIds
        }
      ],
      ...(input.avatarUrl
        ? { avatarUrl: input.avatarUrl, picture: input.avatarUrl }
        : {})
    }
    const tokens = await this.sessionService.issue(actor)
    const secure = this.config.get('COOKIE_SECURE', { infer: true })
    response.cookie('its_access', tokens.accessToken, {
      httpOnly: true,
      maxAge:
        this.config.get('ACCESS_TOKEN_TTL_SECONDS', { infer: true }) * 1000,
      path: '/',
      sameSite: secure ? 'none' : 'lax',
      secure
    })
    response.cookie('its_refresh', tokens.refreshToken, {
      httpOnly: true,
      maxAge:
        this.config.get('REFRESH_TOKEN_TTL_SECONDS', { infer: true }) * 1000,
      path: '/api/v2/auth',
      sameSite: secure ? 'none' : 'lax',
      secure
    })
    return { actor }
  }
}
