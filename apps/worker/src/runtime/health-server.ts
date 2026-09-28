import { createServer } from 'node:http'
import type { Server, ServerResponse } from 'node:http'

export interface WorkerHealthProbe {
  isLive(): boolean
  isReady(): Promise<boolean>
}

export function createWorkerHealthServer(probe: WorkerHealthProbe): Server {
  return createServer((request, response) => {
    const path = (request.url ?? '').split('?', 1)[0] ?? ''
    if (
      request.method !== 'GET' ||
      !['/health/live', '/health/ready'].includes(path)
    ) {
      response.statusCode = 404
      response.end()
      return
    }

    if (path === '/health/live') {
      sendHealth(response, probe.isLive())
      return
    }

    void probe
      .isReady()
      .then((ready) => sendHealth(response, ready))
      .catch(() => sendHealth(response, false))
  })
}

function sendHealth(response: ServerResponse, healthy: boolean): void {
  response.statusCode = healthy ? 200 : 503
  response.setHeader('Cache-Control', 'no-store')
  response.setHeader('Content-Type', 'application/json; charset=utf-8')
  response.end(
    JSON.stringify({
      service: 'worker',
      status: healthy ? 'ok' : 'unavailable'
    })
  )
}
