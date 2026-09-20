import { describe, expect, it } from 'vitest'

import { ROLE_KEYS } from '../src/index.js'

describe('role keys', () => {
  it('matches the canonical permission roles', () => {
    expect(ROLE_KEYS).toEqual([
      'systemAdmin',
      'internshipStaff',
      'coordinator',
      'student',
      'evaluator',
      'auditor'
    ])
  })
})
