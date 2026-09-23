import { describe, expect, it } from 'vitest'

import { resolvePublicAppEnvironment } from '../app/utils/app-environment'

describe('resolvePublicAppEnvironment', () => {
  it('defaults to production unless the runtime is explicitly development', () => {
    expect(resolvePublicAppEnvironment(undefined, 'production')).toBe(
      'production'
    )
    expect(resolvePublicAppEnvironment(undefined, 'test')).toBe('production')
    expect(resolvePublicAppEnvironment(undefined, 'development')).toBe(
      'development'
    )
  })

  it('fails closed for unknown configured values', () => {
    expect(resolvePublicAppEnvironment('staging', 'production')).toBe(
      'production'
    )
  })

  it('honors an explicit supported environment', () => {
    expect(resolvePublicAppEnvironment('development', 'production')).toBe(
      'development'
    )
    expect(resolvePublicAppEnvironment('production', 'development')).toBe(
      'production'
    )
  })
})
