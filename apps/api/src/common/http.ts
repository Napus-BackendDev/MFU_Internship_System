import type { AuthenticatedActor } from '@internship/shared-types'
import type { Request } from 'express'

export interface AuthenticatedRequest extends Request {
  actor?: AuthenticatedActor
  requestId?: string
}

export function readCookie(request: Request, name: string): string | undefined {
  const header = request.headers.cookie
  if (!header) return undefined

  for (const item of header.split(';')) {
    const separator = item.indexOf('=')
    if (separator < 0) continue
    const key = item.slice(0, separator).trim()
    if (key === name)
      return decodeURIComponent(item.slice(separator + 1).trim())
  }

  return undefined
}
