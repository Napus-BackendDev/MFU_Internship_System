import type { AppEnvironment } from '@internship/config'
import { ForbiddenException, Injectable } from '@nestjs/common'
import type { CanActivate, ExecutionContext } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'

import type { AuthenticatedRequest } from '../common/http.js'
import { readCookie } from '../common/http.js'
import { allowsCookieMutation } from './csrf.policy.js'

@Injectable()
export class CsrfGuard implements CanActivate {
  public constructor(
    private readonly config: ConfigService<AppEnvironment, true>
  ) {}

  public canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>()
    const requestedWith = request.headers['x-requested-with']
    const origin = request.headers.origin
    const allowed = allowsCookieMutation({
      method: request.method,
      usesCookieAuthentication: Boolean(
        readCookie(request, 'its_access') || readCookie(request, 'its_refresh')
      ),
      requestedWith:
        typeof requestedWith === 'string' ? requestedWith : undefined,
      origin: typeof origin === 'string' ? origin : undefined,
      allowedOrigins: this.config.get('corsOrigins', { infer: true })
    })
    if (!allowed) {
      throw new ForbiddenException({ code: 'CSRF_VALIDATION_FAILED' })
    }
    return true
  }
}
