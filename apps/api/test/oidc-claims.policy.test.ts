import { describe, expect, it } from 'vitest'

import { hasVerifiedEmailClaim } from '../src/auth/oidc-claims.policy.js'

describe('OIDC email claim policy', () => {
  it('accepts only an explicit verified=true claim', () => {
    expect(hasVerifiedEmailClaim(true)).toBe(true)
    expect(hasVerifiedEmailClaim(false)).toBe(false)
    expect(hasVerifiedEmailClaim(undefined)).toBe(false)
    expect(hasVerifiedEmailClaim('true')).toBe(false)
  })
})
