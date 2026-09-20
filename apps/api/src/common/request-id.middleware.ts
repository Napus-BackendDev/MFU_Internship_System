import { randomUUID } from 'node:crypto'

import { Injectable, type NestMiddleware } from '@nestjs/common'
import type { NextFunction, Response } from 'express'

import type { AuthenticatedRequest } from './http.js'

@Injectable()
export class RequestIdMiddleware implements NestMiddleware {
  public use(
    request: AuthenticatedRequest,
    response: Response,
    next: NextFunction
  ): void {
    const supplied = request.headers['x-request-id']
    const requestId =
      typeof supplied === 'string' && /^[\w.-]{8,128}$/.test(supplied)
        ? supplied
        : randomUUID()

    request.requestId = requestId
    response.setHeader('x-request-id', requestId)
    next()
  }
}
