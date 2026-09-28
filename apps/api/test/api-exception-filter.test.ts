import type { ExecutionContext } from '@nestjs/common'
import { describe, expect, it } from 'vitest'

import { ApiExceptionFilter } from '../src/common/api-exception.filter.js'

describe('API exception filter upload errors', () => {
  it('maps Mongo duplicate-key errors to a safe conflict response', () => {
    const response = responseMock()
    const host = hostFor(response)

    new ApiExceptionFilter().catch({ code: 11_000 }, host)

    expect(response.statusCode).toBe(409)
    expect(response.body).toEqual({
      error: {
        code: 'DUPLICATE_RESOURCE',
        message: 'A record with the same unique identity already exists.',
        requestId: 'test-request'
      }
    })
  })

  it('maps oversized multipart file errors to 413', () => {
    const response = responseMock()
    const host = hostFor(response)

    new ApiExceptionFilter().catch({ code: 'LIMIT_FILE_SIZE' }, host)

    expect(response.statusCode).toBe(413)
    expect(response.body).toEqual({
      error: {
        code: 'PAYLOAD_TOO_LARGE',
        message: 'Uploaded file exceeds the allowed size.',
        requestId: 'test-request'
      }
    })
  })

  it('maps other multipart limit violations to 422 instead of 500', () => {
    const response = responseMock()
    const host = hostFor(response)

    new ApiExceptionFilter().catch({ code: 'LIMIT_UNEXPECTED_FILE' }, host)

    expect(response.statusCode).toBe(422)
    expect(response.body).toEqual({
      error: {
        code: 'MULTIPART_INVALID',
        message: 'Multipart upload is malformed or exceeds a request limit.',
        requestId: 'test-request'
      }
    })
  })
})

interface ResponseMock {
  statusCode?: number
  body?: unknown
  status(code: number): ResponseMock
  json(value: unknown): ResponseMock
  setHeader(name: string, value: string): void
}

function responseMock(): ResponseMock {
  const response: ResponseMock = {
    status(code) {
      response.statusCode = code
      return response
    },
    json(value) {
      response.body = value
      return response
    },
    setHeader() {}
  }
  return response
}

function hostFor(response: ResponseMock): ExecutionContext {
  return {
    switchToHttp: () => ({
      getRequest: () => ({ requestId: 'test-request' }),
      getResponse: () => response
    })
  } as unknown as ExecutionContext
}
