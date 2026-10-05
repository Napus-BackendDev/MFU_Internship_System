import type { Express } from 'express'

export function disableExpressFingerprinting(app: Express): void {
  app.disable('x-powered-by')
}
