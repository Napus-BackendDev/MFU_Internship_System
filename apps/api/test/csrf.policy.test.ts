import { describe, expect, it } from 'vitest'

import { allowsCookieMutation } from '../src/auth/csrf.policy.js'

const allowedOrigins = ['https://internship.example.ac.th']

describe('cookie mutation CSRF policy', () => {
  it('does not require a CSRF marker for safe methods or bearer-only requests', () => {
    expect(
      allowsCookieMutation({
        method: 'GET',
        usesCookieAuthentication: true,
        allowedOrigins
      })
    ).toBe(true)
    expect(
      allowsCookieMutation({
        method: 'POST',
        usesCookieAuthentication: false,
        allowedOrigins
      })
    ).toBe(true)
  })

  it('requires the custom header and an allowed Origin for cookie mutations', () => {
    const request = {
      method: 'PUT',
      usesCookieAuthentication: true,
      requestedWith: 'XMLHttpRequest',
      origin: allowedOrigins[0],
      allowedOrigins
    }
    expect(allowsCookieMutation(request)).toBe(true)
    expect(allowsCookieMutation({ ...request, requestedWith: undefined })).toBe(
      false
    )
    expect(
      allowsCookieMutation({ ...request, origin: 'https://attacker.invalid' })
    ).toBe(false)
  })
})
