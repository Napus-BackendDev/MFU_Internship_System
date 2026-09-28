import { ForbiddenException, type ExecutionContext } from '@nestjs/common'
import { describe, expect, it, vi } from 'vitest'

import { CsrfGuard } from '../src/auth/csrf.guard.js'

const allowedOrigins = ['https://internship.example.ac.th']

function createGuard(): CsrfGuard {
  return new CsrfGuard({
    get: vi.fn().mockReturnValue(allowedOrigins)
  } as never)
}

function createContext(
  method: string,
  options: {
    readonly cookie?: string
    readonly origin?: string
    readonly requestedWith?: string
    readonly authorization?: string
  } = {}
): ExecutionContext {
  const headers: Record<string, string> = {}
  if (options.cookie) headers.cookie = options.cookie
  if (options.origin) headers.origin = options.origin
  if (options.requestedWith) headers['x-requested-with'] = options.requestedWith
  if (options.authorization) headers.authorization = options.authorization

  return {
    switchToHttp: () => ({
      getRequest: () => ({ method, headers })
    })
  } as unknown as ExecutionContext
}

describe('global cookie-auth CSRF guard', () => {
  it.each(['POST', 'PUT', 'PATCH', 'DELETE'])(
    'allows %s with cookie auth only from trusted XHR',
    (method) => {
      expect(
        createGuard().canActivate(
          createContext(method, {
            cookie: 'its_access=opaque',
            origin: allowedOrigins[0],
            requestedWith: 'XMLHttpRequest'
          })
        )
      ).toBe(true)
    }
  )

  it.each(['POST', 'PUT', 'PATCH', 'DELETE'])(
    'rejects %s cookie auth without the custom header or with a foreign Origin',
    (method) => {
      const guard = createGuard()
      const cookie = 'its_access=opaque'

      expect(() =>
        guard.canActivate(createContext(method, { cookie }))
      ).toThrowError(ForbiddenException)
      expect(() =>
        guard.canActivate(
          createContext(method, {
            cookie,
            origin: 'https://attacker.invalid',
            requestedWith: 'XMLHttpRequest'
          })
        )
      ).toThrowError(ForbiddenException)
    }
  )

  it('allows safe methods and bearer-only mutations without cookie CSRF markers', () => {
    const guard = createGuard()
    expect(
      guard.canActivate(createContext('GET', { cookie: 'its_access=opaque' }))
    ).toBe(true)
    expect(
      guard.canActivate(
        createContext('PUT', { authorization: 'Bearer opaque' })
      )
    ).toBe(true)
  })
})
