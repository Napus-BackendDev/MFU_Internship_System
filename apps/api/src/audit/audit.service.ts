import type { AuthenticatedActor, RoleKey } from '@internship/shared-types'
import { ForbiddenException, Injectable, Logger } from '@nestjs/common'
import { InjectModel } from '@nestjs/mongoose'
import type { ClientSession, Model, QueryFilter } from 'mongoose'

import { actorHasPermission } from '../auth/permission-map.js'
import { AuditLogRecord, type AuditResourceScope } from './audit.schema.js'

interface AuditRoleAssignmentScope extends AuditResourceScope {
  readonly role: RoleKey
}

export function resourceScopesFromRoleAssignments(
  assignments: readonly AuditRoleAssignmentScope[]
): AuditResourceScope[] {
  return assignments.flatMap((assignment) => {
    if (assignment.role === 'systemAdmin') return []
    const scope: AuditResourceScope = {
      tenant: assignment.role === 'internshipStaff' && assignment.tenant,
      schoolIds: [...(assignment.schoolIds ?? [])],
      programIds: [...(assignment.programIds ?? [])]
    }
    if (scope.tenant || scope.schoolIds?.length || scope.programIds?.length) {
      return [scope]
    }
    return []
  })
}

export interface AuditInput {
  readonly requestId: string
  readonly actorId: string
  readonly actorEmail: string
  readonly action: string
  readonly route: string
  readonly method: string
  readonly resourceScopes?: readonly AuditResourceScope[]
  readonly metadata?: Readonly<Record<string, unknown>>
  readonly outcome?: 'success' | 'failure'
}

export interface AuditLogView {
  readonly id: string
  readonly occurredAt: Date
  readonly actorId: string
  readonly action: string
  readonly route: string
  readonly method: string
  readonly outcome: 'success' | 'failure'
  readonly requestId: string
  readonly resourceScopes?: readonly AuditResourceScope[]
  readonly metadata?: Readonly<Record<string, unknown>>
}

@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name)

  public constructor(
    @InjectModel(AuditLogRecord.name)
    private readonly auditLogs: Model<AuditLogRecord>
  ) {}

  public async record(
    input: AuditInput,
    session?: ClientSession
  ): Promise<void> {
    const { resourceScopes, ...auditFields } = input
    const entry = {
      ...auditFields,
      ...(resourceScopes
        ? {
            resourceScopes: resourceScopes.map(
              ({ tenant, schoolIds, programIds }) => ({
                ...(tenant !== undefined ? { tenant } : {}),
                ...(schoolIds ? { schoolIds: [...schoolIds] } : {}),
                ...(programIds ? { programIds: [...programIds] } : {})
              })
            )
          }
        : {}),
      outcome: input.outcome ?? 'success'
    }
    if (session) {
      await this.auditLogs.create([entry], { session })
      return
    }
    await this.auditLogs.create(entry)
  }

  public async recordSafely(input: AuditInput): Promise<void> {
    for (let attempt = 1; attempt <= 3; attempt += 1) {
      try {
        await this.record(input)
        return
      } catch {
        if (attempt === 3) {
          this.logger.error(
            JSON.stringify({
              event: 'AUDIT_PERSISTENCE_FAILED',
              requestId: input.requestId,
              attempts: attempt
            })
          )
          return
        }
        await new Promise((resolve) => setTimeout(resolve, 50 * attempt))
      }
    }
  }

  public async list(
    actor: AuthenticatedActor,
    input: {
      actorId?: string
      requestId?: string
      page: number
      pageSize: number
    }
  ): Promise<{ items: readonly AuditLogView[]; total: number }> {
    if (!actorHasPermission(actor.roles, 'audit.read')) {
      throw new ForbiddenException({ code: 'PERMISSION_DENIED' })
    }

    const baseFilter: QueryFilter<AuditLogRecord> = {
      ...(input.requestId ? { requestId: input.requestId } : {}),
      ...(actor.roles.includes('systemAdmin') && input.actorId
        ? { actorId: input.actorId }
        : {})
    }
    const filter = actor.roles.includes('systemAdmin')
      ? baseFilter
      : {
          $and: [baseFilter, { $or: this.visibleAuditScopes(actor) }]
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
    return {
      items: items.map((entry) => {
        const record = entry as AuditLogRecord & {
          readonly _id: { toString(): string }
        }
        return {
          id: record._id.toString(),
          occurredAt: record.createdAt,
          actorId: record.actorId,
          action: record.action,
          route: record.route,
          method: record.method,
          outcome: record.outcome,
          requestId: record.requestId,
          ...(record.resourceScopes
            ? { resourceScopes: record.resourceScopes }
            : {}),
          ...(record.metadata ? { metadata: record.metadata } : {})
        }
      }),
      total
    }
  }

  private visibleAuditScopes(
    actor: AuthenticatedActor
  ): QueryFilter<AuditLogRecord>[] {
    const filters: QueryFilter<AuditLogRecord>[] = [{ actorId: actor.id }]
    const roleScopes = actor.roleScopes?.filter(
      (scope) =>
        actor.roles.includes(scope.role) &&
        actorHasPermission([scope.role], 'audit.read') &&
        (!scope.tenant || scope.role === 'internshipStaff')
    )
    const authorizedScopes: readonly AuditResourceScope[] =
      roleScopes ??
      (actor.roles.length === 1 && actorHasPermission(actor.roles, 'audit.read')
        ? [
            {
              ...actor.scope,
              tenant: actor.roles[0] === 'internshipStaff' && actor.scope.tenant
            }
          ]
        : [])

    for (const scope of authorizedScopes) {
      if (scope.tenant) {
        filters.push({
          $or: [
            { 'resourceScopes.tenant': true },
            { 'resourceScopes.schoolIds.0': { $exists: true } },
            { 'resourceScopes.programIds.0': { $exists: true } }
          ]
        })
        continue
      }
      const assignmentScope: Record<string, unknown> = {}
      if (scope.schoolIds?.length) {
        assignmentScope.schoolIds = { $in: [...scope.schoolIds] }
      }
      if (scope.programIds?.length) {
        assignmentScope.programIds = { $in: [...scope.programIds] }
      }
      if (Object.keys(assignmentScope).length > 0) {
        filters.push({
          resourceScopes: { $elemMatch: assignmentScope }
        })
      }
    }
    return filters
  }
}
