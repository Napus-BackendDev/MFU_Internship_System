import {
  Injectable,
  type CallHandler,
  type ExecutionContext,
  type NestInterceptor
} from '@nestjs/common'
import type { Observable } from 'rxjs'
import { tap } from 'rxjs'

import type { AuthenticatedRequest } from '../common/http.js'
import { AuditService } from './audit.service.js'

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
    const base = {
      requestId: request.requestId ?? 'unknown',
      actorId: request.actor?.id ?? 'public',
      actorEmail: request.actor?.email ?? 'public',
      action: `${request.method} ${request.path}`,
      route: request.originalUrl.split('?')[0] ?? request.path,
      method: request.method
    }
    return next.handle().pipe(
      tap({
        next: () => void this.auditService.recordSafely(base),
        error: () =>
          void this.auditService.recordSafely({ ...base, outcome: 'failure' })
      })
    )
  }
}
