import { describe, expect, it } from 'vitest'

import { idempotencyScopeKey, requestHash } from '../src/common/idempotency.js'
import { boundedSearch } from '../src/common/search.js'

describe('security helpers', () => {
  it('escapes regex metacharacters and bounds search input', () => {
    expect(boundedSearch('[')).toBe('\\[')
    expect(boundedSearch('.*')).toBe('\\.\\*')
    expect(() => new RegExp(boundedSearch('[nested]+'), 'iu')).not.toThrow()
    expect(boundedSearch('a'.repeat(200))).toHaveLength(100)
  })

  it('canonicalizes payloads before hashing', () => {
    expect(requestHash({ a: 1, b: { c: 2 } })).toBe(
      requestHash({ b: { c: 2 }, a: 1 })
    )
    expect(requestHash({ a: 1 })).not.toBe(requestHash({ a: 2 }))
  })

  it('binds idempotency keys to actor and operation', () => {
    const key = 'client-key-123'
    expect(idempotencyScopeKey('actor-a', 'document', key)).not.toBe(
      idempotencyScopeKey('actor-b', 'document', key)
    )
    expect(idempotencyScopeKey('actor-a', 'document', key)).not.toBe(
      idempotencyScopeKey('actor-a', 'campaign', key)
    )
  })
})
