import { describe, expect, it } from 'vitest'

import { supportsMongoTransactions } from '../src/health.mongo-capability.js'

describe('MongoDB transaction readiness', () => {
  it('accepts a replica set with sessions and transaction-capable wire version', () => {
    expect(
      supportsMongoTransactions({
        setName: 'rs0',
        logicalSessionTimeoutMinutes: 30,
        maxWireVersion: 17
      })
    ).toBe(true)
  })

  it('accepts a sharded cluster with transaction-capable wire version', () => {
    expect(
      supportsMongoTransactions({
        msg: 'isdbgrid',
        logicalSessionTimeoutMinutes: 30,
        maxWireVersion: 8
      })
    ).toBe(true)
  })

  it.each([
    [
      'standalone server',
      { logicalSessionTimeoutMinutes: 30, maxWireVersion: 17 }
    ],
    ['sessions disabled', { setName: 'rs0', maxWireVersion: 17 }],
    [
      'replica set too old for transactions',
      { setName: 'rs0', logicalSessionTimeoutMinutes: 30, maxWireVersion: 6 }
    ],
    [
      'sharded cluster too old for transactions',
      { msg: 'isdbgrid', logicalSessionTimeoutMinutes: 30, maxWireVersion: 7 }
    ]
  ])('rejects %s', (_description, hello) => {
    expect(supportsMongoTransactions(hello)).toBe(false)
  })
})
