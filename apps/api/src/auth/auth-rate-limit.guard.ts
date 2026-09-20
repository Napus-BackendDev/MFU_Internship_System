import { createHash } from 'node:crypto'

import {
  HttpException,
  Injectable,
  type CanActivate,
  type ExecutionContext
} from '@nestjs/common'
import type { Request } from 'express'

interface RateBucket {
  count: number
  resetAt: number
}

interface RatePolicy {
  limit: number
  windowMs: number
}

function getClientIp(request: Request): string {
  const forwarded = request.headers?.['x-forwarded-for']
  if (typeof forwarded === 'string' && forwarded.length > 0) {
    const first = forwarded.split(',')[0]?.trim()
    if (first) return first
  }
  const realIp = request.headers?.['x-real-ip']
  if (typeof realIp === 'string' && realIp.length > 0) {
    return realIp.trim()
  }
  const cfIp = request.headers?.['cf-connecting-ip']
  if (typeof cfIp === 'string' && cfIp.length > 0) {
    return cfIp.trim()
  }
  return request.socket?.remoteAddress ?? 'unknown'
}

@Injectable()
export class AuthRateLimitGuard implements CanActivate {
  private readonly buckets = new Map<string, RateBucket>()

  public canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>()
    const policy = this.policyFor(request)
    if (!policy) return true

    const now = Date.now()
    const keys = this.keysFor(request)

    let maxRetryAfter = 0
    let isLimited = false

    for (const key of keys) {
      const current = this.buckets.get(key)
      const bucket =
        !current || current.resetAt <= now
          ? { count: 0, resetAt: now + policy.windowMs }
          : current

      bucket.count += 1
      this.buckets.set(key, bucket)

      if (bucket.count > policy.limit) {
        isLimited = true
        const retry = Math.max(1, Math.ceil((bucket.resetAt - now) / 1000))
        if (retry > maxRetryAfter) maxRetryAfter = retry
      }
    }

    this.removeExpiredBuckets(now)

    if (isLimited) {
      const retryAfter = maxRetryAfter || Math.ceil(policy.windowMs / 1000)
      const minutes = Math.max(1, Math.ceil(retryAfter / 60))
      throw new HttpException(
        {
          code: 'RATE_LIMITED',
          message: `คุณกรอกรหัส PIN หรือข้อมูลยืนยันตัวตนเกินจำนวนครั้งที่กำหนด กรุณารออีก ${minutes} นาที แล้วลองใหม่อีกครั้ง`,
          retryAfter
        },
        429,
        {
          cause: 'Authentication rate limit exceeded'
        }
      )
    }

    return true
  }

  private policyFor(request: Request): RatePolicy | undefined {
    if (!['GET', 'POST'].includes(request.method)) return undefined
    const path = (request.path ?? '').replace(/\/+$/, '')
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
    return undefined
  }

  private keysFor(request: Request): string[] {
    const address = getClientIp(request)
    const normPath = (request.path ?? '').replace(/\/+$/, '')
    const baseKey = `${request.method}:${normPath}`
    const keys = [`${baseKey}:ip:${address}`]

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
      const fingerprint = createHash('sha256')
        .update(credential.trim().toLowerCase())
        .digest('hex')
        .slice(0, 16)
      keys.push(`${baseKey}:cred:${fingerprint}`)
    }

    return keys
  }

  private removeExpiredBuckets(now: number): void {
    if (this.buckets.size < 1000) return
    for (const [key, bucket] of this.buckets) {
      if (bucket.resetAt <= now) this.buckets.delete(key)
    }
  }
}
