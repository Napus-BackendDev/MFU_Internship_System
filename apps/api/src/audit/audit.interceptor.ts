import {
  Injectable,
  type CallHandler,
  type ExecutionContext,
  type NestInterceptor
} from '@nestjs/common'
import type { Observable } from 'rxjs'
import { catchError, concatMap, map, of } from 'rxjs'

import type { AuthenticatedRequest } from '../common/http.js'
import {
  AuditService,
  resourceScopesFromRoleAssignments
} from './audit.service.js'

@Injectable()
export class AuditInterceptor implements NestInterceptor {
  public constructor(private readonly auditService: AuditService) {}

  public intercept(
    context: ExecutionContext,
    next: CallHandler
  ): Observable<unknown> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>()
    if (['GET', 'HEAD', 'OPTIONS'].includes(request.method)) {
      return next.handle()
    }
    const actor = request.actor
    const activeRoleScopes = actor?.roleScopes?.filter((assignment) =>
      actor.roles.includes(assignment.role)
    )
    const auditRoleScopes = activeRoleScopes?.length
      ? activeRoleScopes
      : actor?.roles.length === 1 && actor.roles[0]
        ? [
            {
              role: actor.roles[0],
              tenant: actor.scope.tenant,
              schoolIds: actor.scope.schoolIds,
              programIds: actor.scope.programIds
            }
          ]
        : []
    const resourceScopes = actor
      ? resourceScopesFromRoleAssignments(auditRoleScopes)
      : []
    const base = {
      requestId: request.requestId ?? 'unknown',
      actorId: actor?.id ?? 'public',
      actorEmail: actor?.email ?? 'public',
      action: `${request.method} ${request.path}`,
      route: request.originalUrl.split('?')[0] ?? request.path,
      method: request.method,
      ...(resourceScopes.length > 0 ? { resourceScopes } : {})
    }
    const response = next.handle() as Observable<unknown>
    return response.pipe(
      map((value) => ({ kind: 'success' as const, value })),
      catchError((error: unknown) => of({ kind: 'failure' as const, error })),
      concatMap(async (outcome) => {
        if (outcome.kind === 'failure') {
          await this.auditService.recordSafely({ ...base, outcome: 'failure' })
          throw outcome.error
        }

        await this.auditService.recordSafely(base)
        return outcome.value
      })
    )
  }
}
