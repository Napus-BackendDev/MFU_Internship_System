import { describe, expect, it } from 'vitest'

import { getWorkerHealth } from '../src/health.js'

describe('worker foundation', () => {
  it('reports ready health', () => {
    expect(getWorkerHealth()).toMatchObject({
      service: 'worker',
      status: 'ok',
      version: '0.1.0'
    })
  })
})
