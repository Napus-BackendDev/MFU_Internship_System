import type { HealthStatus } from '@internship/shared-types'

export function getWorkerHealth(): HealthStatus {
  return {
    service: 'worker',
    status: 'ok',
    timestamp: new Date().toISOString(),
    version: '0.1.0'
  }
}
