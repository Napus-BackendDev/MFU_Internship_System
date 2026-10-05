import type { AppEnvironment } from '@internship/config'
import type { ConfigService } from '@nestjs/config'
import type { Connection } from 'mongoose'
import { afterEach, describe, expect, it } from 'vitest'

import { HealthService } from '../src/health.service.js'

describe('HealthService readiness', () => {
  let service: HealthService | undefined

  afterEach(() => {
    if (!service) return
    ;(
      service as unknown as { redis: { disconnect: () => void } }
    ).redis.disconnect()
    service = undefined
  })

  it('returns unavailable within its deadline when a dependency probe hangs', async () => {
    const never = new Promise<never>(() => undefined)
    const mongo = {
      db: {
        admin: () => ({ command: () => never, ping: () => never })
      }
    } as unknown as Connection
    const config = {
      get: (key: string) =>
        key === 'NODE_ENV' ? 'production' : 'redis://127.0.0.1:1'
    } as unknown as ConfigService<AppEnvironment, true>
    service = new HealthService(mongo, config)

    const startedAt = Date.now()
    const readiness = await service.getReadiness()
    const elapsedMs = Date.now() - startedAt

    expect(readiness).toMatchObject({
      ready: false,
      dependencies: { mongodb: 'unavailable', redis: 'unavailable' }
    })
    expect(elapsedMs).toBeLessThan(2_600)
  })
})
