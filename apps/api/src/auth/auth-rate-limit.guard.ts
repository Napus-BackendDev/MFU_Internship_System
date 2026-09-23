import {
  HttpException,
  Inject,
  Injectable,
  ServiceUnavailableException,
  type CanActivate,
  type ExecutionContext
} from '@nestjs/common'
import type { Request, Response } from 'express'

import {
  AuthRateLimitStore,
  type RateLimitStore
} from './auth-rate-limit.store.js'

interface RatePolicy {
  limit: number
  windowMs: number
}

function getClientIp(request: Request): string {
  return request.ip || request.socket?.remoteAddress || 'unknown'
}

@Injectable()
export class AuthRateLimitGuard implements CanActivate {
  public constructor(
    @Inject(AuthRateLimitStore) private readonly store: RateLimitStore
  ) {}

  public async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>()
    const policy = this.policyFor(request)
    if (!policy) return true

    let result: Awaited<ReturnType<RateLimitStore['consume']>>
    try {
      result = await this.store.consume(
        this.keysFor(request),
        policy.limit,
        policy.windowMs
      )
    } catch {
      throw new ServiceUnavailableException({
        code: 'RATE_LIMITER_UNAVAILABLE'
      })
    }

    if (!result.limited) return true

    const response = context.switchToHttp().getResponse<Response>()
    response.setHeader('Retry-After', String(result.retryAfterSeconds))
    const minutes = Math.max(1, Math.ceil(result.retryAfterSeconds / 60))
    throw new HttpException(
      {
        code: 'RATE_LIMITED',
        message: `คุณกรอกรหัส PIN หรือข้อมูลยืนยันตัวตนเกินจำนวนครั้งที่กำหนด กรุณารออีก ${minutes} นาที แล้วลองใหม่อีกครั้ง`,
        retryAfter: result.retryAfterSeconds
      },
      429,
      { cause: 'Authentication rate limit exceeded' }
    )
  }

  private policyFor(request: Request): RatePolicy | undefined {
    if (!['GET', 'POST'].includes(request.method)) return undefined
    const path = (request.path ?? '').replace(/\/+$/u, '')
    if (
      path.endsWith('/public/evaluations/verify-pin') ||
      path.endsWith('/public/invitations/exchange') ||
      path.endsWith('/auth/login') ||
      path.endsWith('/auth/callback') ||
      path.endsWith('/auth/refresh')
    ) {
      return { limit: 10, windowMs: 15 * 60 * 1000 }
    }
    if (path.endsWith('/auth/dev/login')) {
      return { limit: 30, windowMs: 15 * 60 * 1000 }
    }
    if (path.endsWith('/students/import-preview')) {
      return { limit: 10, windowMs: 60 * 60 * 1000 }
    }
    if (/\/students\/imports\/[^/]+\/commit$/u.test(path)) {
      return { limit: 60, windowMs: 15 * 60 * 1000 }
    }
    return undefined
  }

  private keysFor(request: Request): string[] {
    const rawPath = (request.path ?? '').replace(/\/+$/u, '')
    const path = rawPath.replace(
      /\/students\/imports\/[^/]+\/commit$/u,
      '/students/imports/:batchId/commit'
    )
    const baseKey = `${request.method}:${path}`
    const keys = [`${baseKey}:ip:${getClientIp(request)}`]
    const body = request.body as Record<string, unknown> | undefined
    const credential =
      typeof body?.pin === 'string'
        ? body.pin
        : typeof body?.token === 'string'
          ? body.token
          : typeof body?.email === 'string'
            ? body.email
            : ''

    if (credential.trim().length > 0) {
      keys.push(`${baseKey}:credential:${credential.trim().toLowerCase()}`)
    }
    return keys
  }
}
