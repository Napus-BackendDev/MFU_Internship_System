import {
  HttpException,
  Inject,
  Injectable,
  ServiceUnavailableException,
  UnauthorizedException,
  type CanActivate,
  type ExecutionContext
} from '@nestjs/common'
import type { Response } from 'express'

import {
  AuthRateLimitStore,
  type RateLimitStore
} from '../auth/auth-rate-limit.store.js'
import type { AuthenticatedRequest } from '../common/http.js'

const WINDOW_MS = 60 * 1000
const ACTOR_LIMIT = 10
const IP_LIMIT = 60

@Injectable()
export class DocumentGenerationRateLimitGuard implements CanActivate {
  public constructor(
    @Inject(AuthRateLimitStore) private readonly store: RateLimitStore
  ) {}

  public async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>()
    const actorId = request.actor?.id
    if (!actorId) {
      throw new UnauthorizedException({ code: 'AUTHENTICATION_REQUIRED' })
    }

    const clientIp = request.ip || request.socket?.remoteAddress || 'unknown'
    type Result = Awaited<ReturnType<RateLimitStore['consume']>>
    let results: [Result, Result]
    try {
      // Idempotency keys must not bypass quotas for this resource-intensive side effect.
      results = await Promise.all([
        this.store.consume(
          [`document-generation:actor:${actorId}`],
          ACTOR_LIMIT,
          WINDOW_MS
        ),
        this.store.consume(
          [`document-generation:ip:${clientIp}`],
          IP_LIMIT,
          WINDOW_MS
        )
      ])
    } catch {
      throw new ServiceUnavailableException({
        code: 'RATE_LIMITER_UNAVAILABLE'
      })
    }

    const [actorResult, ipResult] = results
    const retryAfterSeconds = Math.max(
      actorResult.limited ? actorResult.retryAfterSeconds : 0,
      ipResult.limited ? ipResult.retryAfterSeconds : 0
    )
    if (retryAfterSeconds > 0) {
      context
        .switchToHttp()
        .getResponse<Response>()
        .setHeader('Retry-After', String(retryAfterSeconds))
      throw new HttpException(
        {
          code: 'RATE_LIMITED',
          message: 'สร้างเอกสารเกินจำนวนที่กำหนด กรุณารอสักครู่ก่อนลองใหม่',
          retryAfter: retryAfterSeconds
        },
        429
      )
    }
    return true
  }
}
