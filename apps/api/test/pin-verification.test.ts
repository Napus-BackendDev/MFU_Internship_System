import type { ExecutionContext } from '@nestjs/common'
import { describe, expect, it } from 'vitest'

import { AuthRateLimitGuard } from '../src/auth/auth-rate-limit.guard.js'
import type { RateLimitStore } from '../src/auth/auth-rate-limit.store.js'
import {
  generatePin,
  hashPin,
  normalizePin
} from '../src/correspondence/pin.js'

describe('secure PIN contract', () => {
  it('normalizes formatted PINs without deriving them from student data', () => {
    expect(normalizePin(' 91a2-BC34-5678-90xy ')).toBe('91A2BC34567890XY')
  })

  it('generates random 16-digit PINs', () => {
    const pins = new Set(Array.from({ length: 50 }, () => generatePin()))
    expect(pins.size).toBe(50)
    for (const pin of pins) expect(pin).toMatch(/^\d{16}$/u)
  })

  it('stores only a keyed hash and rejects a different PIN hash', () => {
    const secret = 'test-secret-that-is-not-used-outside-this-test'
    const pin = generatePin()
    const digest = hashPin(pin, secret)
    expect(digest).toMatch(/^[a-f0-9]{64}$/u)
    expect(digest).not.toContain(pin)
    expect(hashPin(pin, secret)).toBe(digest)
    expect(hashPin(generatePin(), secret)).not.toBe(digest)
  })

  it('shares attempt buckets across guard instances and blocks the 11th PIN attempt', async () => {
    const store = new MemoryRateLimitStore()
    const guards = [
      new AuthRateLimitGuard(store),
      new AuthRateLimitGuard(store)
    ]

    for (let attempt = 0; attempt < 10; attempt += 1) {
      const context = contextFor({
        body: { pin: `PIN_${attempt}` },
        headers: {},
        method: 'POST',
        path: '/api/v2/public/evaluations/verify-pin',
        socket: { remoteAddress: '198.51.100.25' }
      })
      await expect(guards[attempt % 2]!.canActivate(context)).resolves.toBe(
        true
      )
    }

    const blocked = contextFor({
      body: { pin: 'PIN_11' },
      headers: {},
      method: 'POST',
      path: '/api/v2/public/evaluations/verify-pin',
      socket: { remoteAddress: '198.51.100.25' }
    })
    await expect(guards[0]!.canActivate(blocked)).rejects.toMatchObject({
      status: 429
    })
  })

  it('does not trust spoofed forwarded headers for client identity', async () => {
    const guard = new AuthRateLimitGuard(new MemoryRateLimitStore())
    for (let attempt = 0; attempt < 10; attempt += 1) {
      const context = contextFor({
        body: { pin: `PIN_${attempt}` },
        headers: { 'x-forwarded-for': `203.0.113.${attempt + 1}` },
        method: 'POST',
        path: '/api/v2/public/evaluations/verify-pin',
        socket: { remoteAddress: '10.0.0.1' }
      })
      await expect(guard.canActivate(context)).resolves.toBe(true)
    }
    const blocked = contextFor({
      body: { pin: 'PIN_LAST' },
      headers: { 'x-forwarded-for': '203.0.113.200' },
      method: 'POST',
      path: '/api/v2/public/evaluations/verify-pin',
      socket: { remoteAddress: '10.0.0.1' }
    })
    await expect(guard.canActivate(blocked)).rejects.toMatchObject({
      status: 429
    })
  })

  it('uses Express-resolved client IP when trusted proxy CIDRs are configured', async () => {
    const guard = new AuthRateLimitGuard(new MemoryRateLimitStore())
    for (let attempt = 0; attempt < 10; attempt += 1) {
      await expect(
        guard.canActivate(
          contextFor({
            body: { pin: `PIN_${attempt}` },
            headers: { 'x-forwarded-for': `198.51.100.${attempt + 1}` },
            ip: '203.0.113.88',
            method: 'POST',
            path: '/api/v2/public/evaluations/verify-pin',
            socket: { remoteAddress: '10.0.0.1' }
          })
        )
      ).resolves.toBe(true)
    }

    const blocked = contextFor({
      body: { pin: 'PIN_BLOCKED' },
      headers: { 'x-forwarded-for': '198.51.100.200' },
      ip: '203.0.113.88',
      method: 'POST',
      path: '/api/v2/public/evaluations/verify-pin',
      socket: { remoteAddress: '10.0.0.1' }
    })
    await expect(guard.canActivate(blocked)).rejects.toMatchObject({
      status: 429
    })

    const otherClient = contextFor({
      body: { pin: 'PIN_OTHER_CLIENT' },
      headers: { 'x-forwarded-for': '198.51.100.200' },
      ip: '203.0.113.99',
      method: 'POST',
      path: '/api/v2/public/evaluations/verify-pin',
      socket: { remoteAddress: '10.0.0.1' }
    })
    await expect(guard.canActivate(otherClient)).resolves.toBe(true)
  })

  it('fails closed when the shared limiter is unavailable', async () => {
    const store: RateLimitStore = {
      consume: () => Promise.reject(new Error('redis unavailable'))
    }
    const guard = new AuthRateLimitGuard(store)
    const context = contextFor({
      body: { pin: 'PIN_1' },
      headers: {},
      method: 'POST',
      path: '/api/v2/public/evaluations/verify-pin',
      socket: { remoteAddress: '198.51.100.25' }
    })

    await expect(guard.canActivate(context)).rejects.toMatchObject({
      status: 503
    })
  })

  it('limits workbook previews and normalizes commit paths across batch IDs', async () => {
    const guard = new AuthRateLimitGuard(new MemoryRateLimitStore())
    for (let attempt = 0; attempt < 10; attempt += 1) {
      await expect(
        guard.canActivate(
          contextFor({
            headers: {},
            method: 'POST',
            path: '/api/v2/students/import-preview',
            socket: { remoteAddress: '198.51.100.25' }
          })
        )
      ).resolves.toBe(true)
    }
    await expect(
      guard.canActivate(
        contextFor({
          headers: {},
          method: 'POST',
          path: '/api/v2/students/import-preview',
          socket: { remoteAddress: '198.51.100.25' }
        })
      )
    ).rejects.toMatchObject({ status: 429 })

    const commitGuard = new AuthRateLimitGuard(new MemoryRateLimitStore())
    for (let attempt = 0; attempt < 60; attempt += 1) {
      await expect(
        commitGuard.canActivate(
          contextFor({
            headers: {},
            method: 'POST',
            path: `/api/v2/students/imports/batch-${attempt}/commit`,
            socket: { remoteAddress: '198.51.100.26' }
          })
        )
      ).resolves.toBe(true)
    }
    await expect(
      commitGuard.canActivate(
        contextFor({
          headers: {},
          method: 'POST',
          path: '/api/v2/students/imports/another-batch/commit',
          socket: { remoteAddress: '198.51.100.26' }
        })
      )
    ).rejects.toMatchObject({ status: 429 })
  })
})

function contextFor(request: object): ExecutionContext {
  return {
    switchToHttp: () => ({
      getRequest: () => request,
      getResponse: () => ({ setHeader: () => undefined })
    })
  } as unknown as ExecutionContext
}

class MemoryRateLimitStore {
  private readonly buckets = new Map<
    string,
    { count: number; resetAt: number }
  >()
  private readonly now = 1000

  public consume(
    keys: readonly string[],
    limit: number,
    windowMs: number
  ): Promise<{ limited: boolean; retryAfterSeconds: number }> {
    let limited = false
    for (const key of keys) {
      const current = this.buckets.get(key)
      const bucket =
        !current || current.resetAt <= this.now
          ? { count: 0, resetAt: this.now + windowMs }
          : current
      bucket.count += 1
      this.buckets.set(key, bucket)
      if (bucket.count > limit) limited = true
    }
    return Promise.resolve({ limited, retryAfterSeconds: 60 })
  }
}
