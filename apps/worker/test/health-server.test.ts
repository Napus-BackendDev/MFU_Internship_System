import type { AddressInfo } from 'node:net'

import { describe, expect, it, vi } from 'vitest'

import { createWorkerHealthServer } from '../src/runtime/health-server.js'

describe('worker health endpoint', () => {
  it('reports liveness and readiness without exposing dependency details', async () => {
    let ready = true
    const server = createWorkerHealthServer({
      isLive: () => true,
      isReady: () => Promise.resolve(ready)
    })
    const baseUrl = await listen(server)

    try {
      const live = await fetch(`${baseUrl}/health/live`)
      expect(live.status).toBe(200)
      expect(await live.json()).toEqual({ service: 'worker', status: 'ok' })

      const readiness = await fetch(`${baseUrl}/health/ready`)
      expect(readiness.status).toBe(200)
      expect(readiness.headers.get('cache-control')).toBe('no-store')
      expect(await readiness.json()).toEqual({
        service: 'worker',
        status: 'ok'
      })

      ready = false
      const unavailable = await fetch(`${baseUrl}/health/ready`)
      expect(unavailable.status).toBe(503)
      expect(await unavailable.json()).toEqual({
        service: 'worker',
        status: 'unavailable'
      })
    } finally {
      await close(server)
    }
  })

  it('fails closed for probe errors and rejects other routes or methods', async () => {
    const isReady = vi.fn(() => Promise.reject(new Error('private detail')))
    const server = createWorkerHealthServer({
      isLive: () => false,
      isReady
    })
    const baseUrl = await listen(server)

    try {
      const live = await fetch(`${baseUrl}/health/live`)
      expect(live.status).toBe(503)

      const readiness = await fetch(`${baseUrl}/health/ready`)
      expect(readiness.status).toBe(503)
      expect(await readiness.text()).not.toContain('private detail')

      const unknown = await fetch(`${baseUrl}/metrics`)
      expect(unknown.status).toBe(404)
      const wrongMethod = await fetch(`${baseUrl}/health/ready`, {
        method: 'POST'
      })
      expect(wrongMethod.status).toBe(404)
      expect(isReady).toHaveBeenCalledTimes(1)
    } finally {
      await close(server)
    }
  })
})

async function listen(
  server: ReturnType<typeof createWorkerHealthServer>
): Promise<string> {
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', () => {
      server.off('error', reject)
      resolve()
    })
  })

  const address = server.address() as AddressInfo
  return `http://127.0.0.1:${address.port}`
}

async function close(
  server: ReturnType<typeof createWorkerHealthServer>
): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()))
  })
}
