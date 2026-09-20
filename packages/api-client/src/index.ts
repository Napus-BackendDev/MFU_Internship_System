export type { components, operations, paths } from './generated/openapi.js'

import type { components } from './generated/openapi.js'

type HealthStatus = components['schemas']['HealthStatus']
type ReadinessStatus = components['schemas']['ReadinessStatus']

export interface ApiClientOptions {
  readonly baseUrl: string
  readonly fetcher?: typeof fetch
}

export interface ApiClient {
  readonly health: () => Promise<HealthStatus>
  readonly readiness: () => Promise<ReadinessStatus>
}

function normalizeBaseUrl(baseUrl: string): string {
  return baseUrl.replace(/\/+$/, '')
}

export function createApiClient(options: ApiClientOptions): ApiClient {
  const fetcher = options.fetcher ?? fetch
  const baseUrl = normalizeBaseUrl(options.baseUrl)

  async function getJson<T>(path: string): Promise<T> {
    const response = await fetcher(`${baseUrl}${path}`, {
      headers: {
        accept: 'application/json'
      }
    })

    if (!response.ok) {
      throw new Error(
        `API request failed for ${path} with HTTP ${response.status}.`
      )
    }

    return (await response.json()) as T
  }

  return {
    health: () => getJson<HealthStatus>('/health/live'),
    readiness: () => getJson<ReadinessStatus>('/health/ready')
  }
}
