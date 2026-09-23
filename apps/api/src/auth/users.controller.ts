import { ROLE_KEYS } from '@internship/shared-types'
import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Query,
  Req
} from '@nestjs/common'
import { z } from 'zod'

import type { AuthenticatedRequest } from '../common/http.js'
import { RequirePermissions } from './auth.decorators.js'
import { UsersService } from './users.service.js'

const listUserSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
  search: z.string().trim().max(100).optional(),
  role: z.enum(ROLE_KEYS).optional(),
  status: z.enum(['active', 'archived', 'suspended']).optional(),
  schoolId: z.string().optional()
})

const createUserSchema = z.object({
  email: z.email(),
  displayName: z.string().min(1).max(200),
  role: z.enum(ROLE_KEYS),
  status: z.enum(['active', 'archived', 'suspended']).default('active'),
  studentId: z.string().trim().max(50).optional(),
  schoolIds: z.array(z.string()).default([]),
  programIds: z.array(z.string()).default([])
})

const updateUserSchema = createUserSchema.partial()

@Controller('users')
export class UsersController {
  public constructor(private readonly service: UsersService) {}

  @RequirePermissions('users.read')
  @Get()
  public listUsers(
    @Req() request: AuthenticatedRequest,
    @Query() raw: unknown
  ): Promise<unknown> {
    const input = listUserSchema.parse(raw)
    return this.service.listUsers(
      request.actor!,
      { page: input.page, pageSize: input.pageSize },
      {
        search: input.search,
        role: input.role,
        status: input.status,
        schoolId: input.schoolId
      }
    )
  }

  @RequirePermissions('users.manage')
  @Get('summary')
  public getSummary(@Req() request: AuthenticatedRequest): Promise<unknown> {
    return this.service.getUserSummary(request.actor!)
  }

  @RequirePermissions('users.manage')
  @Post()
  public createUser(
    @Req() request: AuthenticatedRequest,
    @Body() raw: unknown
  ): Promise<unknown> {
    const input = createUserSchema.parse(raw)
    return this.service.createUser(request.actor!, input)
  }

  @RequirePermissions('users.manage')
  @Patch(':id')
  public updateUser(
    @Req() request: AuthenticatedRequest,
    @Param('id') id: string,
    @Body() raw: unknown
  ): Promise<unknown> {
    const input = updateUserSchema.parse(raw)
    return this.service.updateUser(request.actor!, id, input)
  }

  @RequirePermissions('users.manage')
  @Delete(':id')
  @HttpCode(204)
  public async deleteUser(
    @Req() request: AuthenticatedRequest,
    @Param('id') id: string
  ): Promise<void> {
    await this.service.deleteUser(request.actor!, id)
  }
}
