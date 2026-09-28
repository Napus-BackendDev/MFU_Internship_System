import { describe, expect, it } from 'vitest'

import { createDevelopmentPinCredential } from '../src/scripts/development-pin.js'

describe('development PIN seed credentials', () => {
  it('persists only a random PIN hash and preserves an existing hash on rerun', () => {
    const secret = 'development-test-secret-that-is-at-least-32-characters'
    const created = createDevelopmentPinCredential(secret)

    expect(Object.keys(created)).toEqual(['accessPinHash'])
    expect(created.accessPinHash).toMatch(/^v2:[a-f0-9]{64}$/u)
    expect(
      createDevelopmentPinCredential(secret, created.accessPinHash)
    ).toEqual(created)
    const legacyHash = 'a'.repeat(64)
    expect(
      createDevelopmentPinCredential(secret, legacyHash).accessPinHash
    ).toBe(legacyHash)
  })
})
