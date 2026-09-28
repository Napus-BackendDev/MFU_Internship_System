import { randomUUID } from 'node:crypto'
import { once } from 'node:events'

import type { ConfigService } from '@nestjs/config'
import type { AppEnvironment } from '@internship/config'
import type { Redis } from 'ioredis'
import { afterEach, describe, expect, it } from 'vitest'

import { AuthRateLimitStore } from '../src/auth/auth-rate-limit.store.js'

const testRedisUrl = process.env.TEST_REDIS_URL

if (process.env.CI === 'true' && !testRedisUrl) {
  throw new Error(
    'CI must configure TEST_REDIS_URL for shared authentication rate-limit tests.'
  )
}

describe.skipIf(!testRedisUrl)('authentication rate limits with Redis', () => {
  const stores: AuthRateLimitStore[] = []

  afterEach(() => {
    for (const store of stores.splice(0)) store.onApplicationShutdown()
  })

  it('shares one fixed-window bucket across independent API store instances', async () => {
    const config = {
      get: (key: string) => {
        if (key === 'REDIS_URL') return testRedisUrl!
        if (key === 'NODE_ENV') return 'test'
        if (key === 'AUTH_JWT_SECRET') {
          return 'isolated-rate-limit-fingerprint-secret-2026'
        }
        return undefined
      }
    } as unknown as ConfigService<AppEnvironment, true>
    const firstApiStore = new AuthRateLimitStore(config)
    const secondApiStore = new AuthRateLimitStore(config)
    stores.push(firstApiStore, secondApiStore)

    const clients = [firstApiStore, secondApiStore].map(
      (store) => (store as unknown as { client: Redis }).client
    )
    await Promise.all(
      clients.map((client) =>
        client.status === 'ready' ? Promise.resolve() : once(client, 'ready')
      )
    )

    const logicalKey = `verify-pin:integration:${randomUUID()}`
    const limit = 2
    const windowMs = 60_000

    await expect(
      firstApiStore.consume([logicalKey], limit, windowMs)
    ).resolves.toMatchObject({ limited: false })
    await expect(
      secondApiStore.consume([logicalKey], limit, windowMs)
    ).resolves.toMatchObject({ limited: false })
    const blocked = await firstApiStore.consume([logicalKey], limit, windowMs)
    expect(blocked.limited).toBe(true)
    expect(blocked.retryAfterSeconds).toBeGreaterThan(0)
    expect(blocked.retryAfterSeconds).toBeLessThanOrEqual(windowMs / 1000)
  }, 15_000)
})
