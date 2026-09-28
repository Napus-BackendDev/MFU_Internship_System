import { describe, expect, it, vi } from 'vitest'

import { isBullMqRedisReady } from '../src/redis-capability.js'

describe('BullMQ Redis readiness', () => {
  it('rejects a reachable Redis 3 broker', async () => {
    await expect(
      isBullMqRedisReady({
        ping: vi.fn().mockResolvedValue('PONG'),
        info: vi.fn().mockResolvedValue('# Server\r\nredis_version:3.0.504\r\n')
      })
    ).resolves.toBe(false)
  })

  it.each(['5.0.0', '6.2.0', '7.2.4'])(
    'accepts Redis %s when it answers PING',
    async (version) => {
      await expect(
        isBullMqRedisReady({
          ping: vi.fn().mockResolvedValue('PONG'),
          info: vi
            .fn()
            .mockResolvedValue(`# Server\r\nredis_version:${version}\r\n`)
        })
      ).resolves.toBe(true)
    }
  )

  it('fails closed when version is missing or a probe fails', async () => {
    await expect(
      isBullMqRedisReady({
        ping: vi.fn().mockResolvedValue('PONG'),
        info: vi.fn().mockResolvedValue('# Server\r\n')
      })
    ).resolves.toBe(false)
    await expect(
      isBullMqRedisReady({
        ping: vi.fn().mockRejectedValue(new Error('offline')),
        info: vi.fn()
      })
    ).resolves.toBe(false)
  })
})
