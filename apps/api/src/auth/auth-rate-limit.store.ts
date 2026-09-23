import { createHmac } from 'node:crypto'

import { Injectable, type OnApplicationShutdown } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import type { AppEnvironment } from '@internship/config'
import { Redis } from 'ioredis'

const FIXED_WINDOW_SCRIPT = `
local limit = tonumber(ARGV[1])
local windowMs = tonumber(ARGV[2])
local limited = 0
local retryAfterMs = 0

for _, key in ipairs(KEYS) do
  local count = redis.call('INCR', key)
  if count == 1 then
    redis.call('PEXPIRE', key, windowMs)
  end
  if count > limit then
    limited = 1
    local ttl = redis.call('PTTL', key)
    if ttl > retryAfterMs then
      retryAfterMs = ttl
    end
  end
end

return { limited, retryAfterMs }
`

export interface RateLimitResult {
  readonly limited: boolean
  readonly retryAfterSeconds: number
}

export interface RateLimitStore {
  consume(
    logicalKeys: readonly string[],
    limit: number,
    windowMs: number
  ): Promise<RateLimitResult>
}

@Injectable()
export class AuthRateLimitStore
  implements OnApplicationShutdown, RateLimitStore
{
  private readonly client: Redis
  private readonly namespace: string
  private readonly fingerprintSecret: string

  public constructor(config: ConfigService<AppEnvironment, true>) {
    this.client = new Redis(config.get('REDIS_URL', { infer: true }), {
      connectTimeout: 1000,
      enableOfflineQueue: false,
      maxRetriesPerRequest: 1,
      retryStrategy: (attempt: number) => Math.min(attempt * 100, 1000)
    })
    this.namespace = `internship-transcript-v2:${config.get('NODE_ENV', { infer: true })}:auth-rate-limit:v1`
    this.fingerprintSecret = config.get('AUTH_JWT_SECRET', { infer: true })
  }

  public async consume(
    logicalKeys: readonly string[],
    limit: number,
    windowMs: number
  ): Promise<RateLimitResult> {
    const keys = logicalKeys.map((key) => this.redisKey(key))
    const result: unknown = await this.client.eval(
      FIXED_WINDOW_SCRIPT,
      keys.length,
      ...keys,
      limit,
      windowMs
    )
    if (!Array.isArray(result) || result.length !== 2) {
      throw new Error('Invalid Redis rate limit response.')
    }

    const limited = Number(result[0]) === 1
    const ttlMs = Number(result[1])
    return {
      limited,
      retryAfterSeconds: Math.max(1, Math.ceil(ttlMs / 1000))
    }
  }

  public onApplicationShutdown(): void {
    this.client.disconnect()
  }

  private redisKey(logicalKey: string): string {
    const fingerprint = createHmac('sha256', this.fingerprintSecret)
      .update(logicalKey)
      .digest('hex')
    return `${this.namespace}:${fingerprint}`
  }
}
