import { describe, expect, it } from 'vitest'

import { configuredApiOrigin } from '../server/utils/security-headers'

describe('configuredApiOrigin', () => {
  it('does not add an origin for same-origin relative API paths', () => {
    expect(configuredApiOrigin('/api/v2', false)).toBeNull()
  })

  it('allows the exact HTTPS API origin in Production', () => {
    expect(configuredApiOrigin('https://api.example.test/api/v2', false)).toBe(
      'https://api.example.test'
    )
  })

  it('rejects HTTP API origins outside Development', () => {
    expect(
      configuredApiOrigin('http://api.example.test/api/v2', false)
    ).toBeNull()
  })

  it('allows HTTP API origins in Development only', () => {
    expect(configuredApiOrigin('http://127.0.0.1:8081/api/v2', true)).toBe(
      'http://127.0.0.1:8081'
    )
  })

  it('rejects credentials and non-HTTP protocols', () => {
    expect(
      configuredApiOrigin('https://user:secret@api.example.test/api/v2', false)
    ).toBeNull()
    expect(configuredApiOrigin('javascript:alert(1)', true)).toBeNull()
  })
})
