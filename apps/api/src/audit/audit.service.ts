import { Injectable } from '@nestjs/common'
import { InjectModel } from '@nestjs/mongoose'
import type { Model, QueryFilter } from 'mongoose'

import { AuditLogRecord } from './audit.schema.js'

export interface AuditInput {
  readonly requestId: string
  readonly actorId: string
  readonly actorEmail: string
  readonly action: string
  readonly route: string
  readonly method: string
  readonly metadata?: Readonly<Record<string, unknown>>
  readonly outcome?: 'success' | 'failure'
}

@Injectable()
export class AuditService {
  public constructor(
    @InjectModel(AuditLogRecord.name)
    private readonly auditLogs: Model<AuditLogRecord>
  ) {}

  public async record(input: AuditInput): Promise<void> {
    await this.auditLogs.create({
      ...input,
      outcome: input.outcome ?? 'success'
    })
  }

  public async recordSafely(input: AuditInput): Promise<void> {
    try {
      await this.record(input)
    } catch {
      // Auditing must never turn a completed business mutation into a 500.
    }
  }

  public async list(input: {
    actorId?: string
    requestId?: string
    page: number
    pageSize: number
  }): Promise<{ items: readonly AuditLogRecord[]; total: number }> {
    const filter: QueryFilter<AuditLogRecord> = {
      ...(input.actorId ? { actorId: input.actorId } : {}),
      ...(input.requestId ? { requestId: input.requestId } : {})
    }
    const [items, total] = await Promise.all([
      this.auditLogs
        .find(filter)
        .sort({ createdAt: -1, _id: -1 })
        .skip((input.page - 1) * input.pageSize)
        .limit(input.pageSize)
        .lean()
        .exec(),
      this.auditLogs.countDocuments(filter).exec()
    ])
    return { items, total }
  }
}
