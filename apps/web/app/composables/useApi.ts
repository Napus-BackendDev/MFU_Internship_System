interface ApiRequestOptions {
  readonly method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'
  readonly body?: Readonly<Record<string, unknown>> | FormData
  readonly headers?: Readonly<Record<string, string>>
  readonly query?: Readonly<
    Record<string, string | number | boolean | undefined>
  >
}

let refreshPromise: Promise<void> | null = null

export function useApi() {
  const config = useRuntimeConfig()
  const forwardedHeaders = import.meta.server
    ? useRequestHeaders(['cookie', 'x-request-id'])
    : undefined
  const baseURL = import.meta.server
    ? config.apiInternalBaseUrl || 'http://127.0.0.1:8081/api/v2'
    : config.public.apiBaseUrl

  return async function api<T>(
    path: string,
    options: ApiRequestOptions = {}
  ): Promise<T> {
    const execute = () =>
      $fetch<T>(path, {
        baseURL,
        body: options.body,
        credentials: 'include',
        headers: {
          accept: 'application/json',
          'x-requested-with': 'XMLHttpRequest',
          ...forwardedHeaders,
          ...options.headers
        },
        method: options.method,
        query: options.query
      })

    try {
      return await execute()
    } catch (err: unknown) {
      const fetchError = err as { status?: number; statusCode?: number }
      const is401 = fetchError?.status === 401 || fetchError?.statusCode === 401
      const isAuthEndpoint =
        path.startsWith('/auth/refresh') ||
        path.startsWith('/auth/logout') ||
        path.startsWith('/auth/dev/login') ||
        path.startsWith('/public/')

      if (import.meta.client && is401 && !isAuthEndpoint) {
        if (window.location.pathname.startsWith('/evaluate')) {
          throw err
        }

        if (!refreshPromise) {
          refreshPromise = $fetch('/auth/refresh', {
            baseURL,
            method: 'POST',
            credentials: 'include',
            headers: {
              accept: 'application/json',
              'x-requested-with': 'XMLHttpRequest'
            }
          })
            .then(() => {})
            .catch(() => {
              if (
                window.location.pathname !== '/login' &&
                !window.location.pathname.startsWith('/evaluate')
              ) {
                window.location.href = '/login'
              }
            })
            .finally(() => {
              refreshPromise = null
            })
        }

        try {
          await refreshPromise
          return await execute()
        } catch {
          throw err
        }
      }

      throw err
    }
  }
}
