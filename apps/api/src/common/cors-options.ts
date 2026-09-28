export const API_CORS_METHODS = [
  'GET',
  'POST',
  'PUT',
  'PATCH',
  'DELETE',
  'OPTIONS'
] as const

export interface ApiCorsOptions {
  readonly credentials: boolean
  readonly methods: string[]
  readonly origin: string[]
}

export function createApiCorsOptions(
  origins: readonly string[]
): ApiCorsOptions {
  return {
    credentials: true,
    methods: [...API_CORS_METHODS],
    origin: [...origins]
  }
}
