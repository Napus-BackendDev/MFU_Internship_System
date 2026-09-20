import { describe, expect, it, vi } from 'vitest'

import { createApiClient } from '../src/index.js'

describe('API client', () => {
  it('normalizes the base URL', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(
        JSON.stringify({
          service: 'api',
          status: 'ok',
          timestamp: '2026-08-23T00:00:00.000Z',
          version: '0.1.0'
        }),
        {
          headers: {
            'content-type': 'application/json'
          },
          status: 200
        }
      )
    )
    const client = createApiClient({
      baseUrl: 'http://127.0.0.1:8081/api/v2/',
      fetcher
    })

    await client.health()

    expect(fetcher).toHaveBeenCalledWith(
      'http://127.0.0.1:8081/api/v2/health/live',
      expect.any(Object)
    )
  })

  it('exposes readiness through the canonical OpenAPI path', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(
        JSON.stringify({
          ready: true,
          dependencies: { mongodb: 'ok', redis: 'ok' },
          timestamp: '2026-08-23T00:00:00.000Z'
        }),
        {
          headers: {
            'content-type': 'application/json'
          },
          status: 200
        }
      )
    )
    const client = createApiClient({
      baseUrl: 'http://127.0.0.1:8081/api/v2/',
      fetcher
    })

    await client.readiness()

    expect(fetcher).toHaveBeenCalledWith(
      'http://127.0.0.1:8081/api/v2/health/ready',
      expect.any(Object)
    )
  })
})
