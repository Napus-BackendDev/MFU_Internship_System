import { Controller, Get, Query } from '@nestjs/common'
import { z } from 'zod'

import { RequirePermissions } from '../auth/auth.decorators.js'
import { AuditService } from './audit.service.js'

const auditQuerySchema = z.object({
  actorId: z.string().optional(),
  requestId: z.string().optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25)
})

@Controller('audit-logs')
export class AuditController {
  public constructor(private readonly auditService: AuditService) {}

  @RequirePermissions('audit.read')
  @Get()
  public async list(@Query() raw: unknown): Promise<unknown> {
    const query = auditQuerySchema.parse(raw)
    const result = await this.auditService.list(query)
    return {
      items: result.items,
      meta: {
        page: query.page,
        pageSize: query.pageSize,
        total: result.total,
        totalPages: Math.ceil(result.total / query.pageSize)
      }
    }
  }
}
