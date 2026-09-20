import type { ExecutionContext } from '@nestjs/common'
import { describe, expect, it } from 'vitest'

import { AuthRateLimitGuard } from '../src/auth/auth-rate-limit.guard.js'
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

  it('returns 429 after the public PIN attempt threshold', () => {
    const guard = new AuthRateLimitGuard()
    const request = {
      body: { pin: '0000000000000000' },
      headers: {},
      method: 'POST',
      path: '/api/v2/public/evaluations/verify-pin',
      socket: { remoteAddress: '127.0.0.1' }
    }
    const context = {
      switchToHttp: () => ({ getRequest: () => request })
    } as unknown as ExecutionContext

    for (let attempt = 0; attempt < 10; attempt += 1) {
      expect(guard.canActivate(context)).toBe(true)
    }
    expect(() => guard.canActivate(context)).toThrowError(
      expect.objectContaining({ status: 429 })
    )
  })

  it('blocks brute-force attack from the same IP when trying different random PINs', () => {
    const guard = new AuthRateLimitGuard()
    const ip = '198.51.100.25'

    // Attacker sends 10 DIFFERENT PINs from the same IP
    for (let i = 0; i < 10; i++) {
      const request = {
        body: { pin: `PIN_${i.toString().padStart(12, '0')}` },
        headers: {},
        method: 'POST',
        path: '/api/v2/public/evaluations/verify-pin',
        socket: { remoteAddress: ip }
      }
      const context = {
        switchToHttp: () => ({ getRequest: () => request })
      } as unknown as ExecutionContext
      expect(guard.canActivate(context)).toBe(true)
    }

    // 11th attempt with yet another new PIN must be blocked by IP rate limit
    const blockedRequest = {
      body: { pin: 'PIN_NEW_ATTEMPT_' },
      headers: {},
      method: 'POST',
      path: '/api/v2/public/evaluations/verify-pin',
      socket: { remoteAddress: ip }
    }
    const blockedContext = {
      switchToHttp: () => ({ getRequest: () => blockedRequest })
    } as unknown as ExecutionContext

    expect(() => guard.canActivate(blockedContext)).toThrowError(
      expect.objectContaining({ status: 429 })
    )
  })

  it('correctly extracts client IP from x-forwarded-for header behind reverse proxy', () => {
    const guard = new AuthRateLimitGuard()
    const proxyIp = '10.0.0.1'
    const clientIp = '203.0.113.88'

    for (let i = 0; i < 10; i++) {
      const request = {
        body: { pin: `PIN_FWD_${i}` },
        headers: { 'x-forwarded-for': `${clientIp}, 10.0.0.2` },
        method: 'POST',
        path: '/api/v2/public/evaluations/verify-pin',
        socket: { remoteAddress: proxyIp }
      }
      const context = {
        switchToHttp: () => ({ getRequest: () => request })
      } as unknown as ExecutionContext
      expect(guard.canActivate(context)).toBe(true)
    }

    // 11th request from same clientIp should be blocked
    const requestBlocked = {
      body: { pin: 'PIN_FWD_BLOCKED' },
      headers: { 'x-forwarded-for': clientIp },
      method: 'POST',
      path: '/api/v2/public/evaluations/verify-pin',
      socket: { remoteAddress: proxyIp }
    }
    const contextBlocked = {
      switchToHttp: () => ({ getRequest: () => requestBlocked })
    } as unknown as ExecutionContext

    expect(() => guard.canActivate(contextBlocked)).toThrowError(
      expect.objectContaining({ status: 429 })
    )

    // A different client IP behind the same proxy is NOT blocked
    const requestOther = {
      body: { pin: 'PIN_OTHER_USER' },
      headers: { 'x-forwarded-for': '203.0.113.99' },
      method: 'POST',
      path: '/api/v2/public/evaluations/verify-pin',
      socket: { remoteAddress: proxyIp }
    }
    const contextOther = {
      switchToHttp: () => ({ getRequest: () => requestOther })
    } as unknown as ExecutionContext
    expect(guard.canActivate(contextOther)).toBe(true)
  })
})
