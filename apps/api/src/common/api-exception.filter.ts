import type { ApiErrorBody } from '@internship/shared-types'
import {
  Catch,
  HttpException,
  HttpStatus,
  type ArgumentsHost,
  type ExceptionFilter
} from '@nestjs/common'
import type { Response } from 'express'
import { ZodError } from 'zod'

import type { AuthenticatedRequest } from './http.js'

interface SafeExceptionBody {
  code?: string
  message?: string | readonly string[]
}

function isDuplicateKeyError(exception: unknown): boolean {
  return (
    typeof exception === 'object' &&
    exception !== null &&
    'code' in exception &&
    exception.code === 11_000
  )
}

@Catch()
export class ApiExceptionFilter implements ExceptionFilter {
  public catch(exception: unknown, host: ArgumentsHost): void {
    const context = host.switchToHttp()
    const request = context.getRequest<AuthenticatedRequest>()
    const response = context.getResponse<Response>()
    const requestId = request.requestId ?? 'unknown'

    let status = HttpStatus.INTERNAL_SERVER_ERROR
    let code = 'INTERNAL_ERROR'
    let message = 'The request could not be completed.'
    let details: Readonly<Record<string, unknown>> | undefined

    if (exception instanceof HttpException) {
      status = exception.getStatus()
      const body = exception.getResponse()
      const safeBody =
        typeof body === 'object' ? (body as SafeExceptionBody) : {}
      code = safeBody.code ?? this.codeForStatus(status)
      if (typeof safeBody.message === 'string') {
        message = safeBody.message
      } else if (Array.isArray(safeBody.message)) {
        message = safeBody.message.join('; ')
      } else {
        message = exception.message
      }
      if (
        status === HttpStatus.TOO_MANY_REQUESTS &&
        'retryAfter' in safeBody &&
        typeof (safeBody as { retryAfter?: number }).retryAfter === 'number'
      ) {
        const retryAfter = (safeBody as { retryAfter: number }).retryAfter
        response.setHeader('Retry-After', String(retryAfter))
        details = { retryAfter }
      }
    } else if (exception instanceof ZodError) {
      status = HttpStatus.UNPROCESSABLE_ENTITY
      code = 'VALIDATION_ERROR'
      message = 'Request validation failed.'
      details = {
        fields: exception.issues.map((issue) => ({
          path: issue.path.join('.'),
          message: issue.message
        }))
      }
    } else if (isDuplicateKeyError(exception)) {
      status = HttpStatus.CONFLICT
      code = 'DUPLICATE_RESOURCE'
      message = 'A record with the same unique identity already exists.'
    }

    const body: ApiErrorBody = {
      error: {
        code,
        message,
        requestId,
        ...(details ? { details } : {})
      }
    }

    response.status(status).json(body)
  }

  private codeForStatus(status: number): string {
    const known: Readonly<Record<number, string>> = {
      400: 'BAD_REQUEST',
      401: 'AUTHENTICATION_REQUIRED',
      403: 'PERMISSION_DENIED',
      404: 'RESOURCE_NOT_FOUND',
      409: 'INVALID_STATE_TRANSITION',
      422: 'VALIDATION_ERROR',
      429: 'RATE_LIMITED'
    }
    return known[status] ?? 'HTTP_ERROR'
  }
}
