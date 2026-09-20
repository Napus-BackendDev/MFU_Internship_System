import { describe, expect, it } from 'vitest'

import { roleKeySchema } from '../src/index.js'

describe('shared validation', () => {
  it('rejects unknown roles', () => {
    expect(roleKeySchema.safeParse('owner').success).toBe(false)
  })
})
