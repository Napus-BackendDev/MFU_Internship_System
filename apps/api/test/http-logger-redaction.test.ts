import { createServer } from 'node:http'
import { Writable } from 'node:stream'

import { pinoHttp } from 'pino-http'
import { describe, expect, it } from 'vitest'

import { HTTP_LOG_REDACT_PATHS } from '../src/common/http-logger-redaction.js'

describe('HTTP access log redaction', () => {
  it('does not write OIDC callback code or state to access logs', async () => {
    const logLines: string[] = []
    const logStream = new Writable({
      write(chunk: Buffer, _encoding, callback) {
        logLines.push(chunk.toString())
        callback()
      }
    })
    const logMiddleware = pinoHttp(
      {
        redact: {
          paths: [...HTTP_LOG_REDACT_PATHS],
          censor: '[REDACTED]'
        }
      },
      logStream
    )
    const server = createServer((request, response) => {
      const requestWithQuery = Object.assign(request, {
        query: Object.fromEntries(
          new URL(request.url ?? '/', 'http://localhost').searchParams
        )
      })
      logMiddleware(requestWithQuery, response)
      response.end('ok')
    })

    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
    const address = server.address()
    if (!address || typeof address === 'string') {
      throw new Error('HTTP test server did not bind to a TCP port')
    }

    try {
      await fetch(
        `http://127.0.0.1:${address.port}/api/v2/auth/callback?code=oidc-code-secret&state=oidc-state-secret`
      )
    } finally {
      await new Promise<void>((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve()))
      )
    }

    const accessLog = logLines.join('')
    const loggedRequest = JSON.parse(accessLog) as {
      req: { query: unknown; url: string }
    }
    expect(loggedRequest.req.url).toBe('[REDACTED]')
    expect(loggedRequest.req.query).toBe('[REDACTED]')
    expect(accessLog).not.toContain('oidc-code-secret')
    expect(accessLog).not.toContain('oidc-state-secret')
  })
})
