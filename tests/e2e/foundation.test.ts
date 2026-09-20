import { describe, expect, it } from 'vitest'

describe('workspace foundation', () => {
  it('uses the production runtime baseline', () => {
    expect(Number(process.versions.node.split('.')[0])).toBeGreaterThanOrEqual(
      24
    )
  })
})
