interface ApiRequestOptions {
  readonly method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'
  readonly body?: Readonly<Record<string, unknown>> | FormData
  readonly headers?: Readonly<Record<string, string>>
  readonly query?: Readonly<
    Record<string, string | number | boolean | undefined>
  >
}

let refreshPromise: Promise<boolean> | null = null

export async function retryAfterSessionRefresh<T>(
  originalError: unknown,
  refresh: () => Promise<boolean>,
  retryRequest: () => Promise<T>
): Promise<T> {
  if (!(await refresh())) throw originalError
  return retryRequest()
}

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
    const execute = (): Promise<T> =>
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
        path === '/auth/me' ||
        path.startsWith('/auth/refresh') ||
        path.startsWith('/auth/logout') ||
        path.startsWith('/auth/dev/login') ||
        path.startsWith('/public/')

      if (import.meta.client && is401 && !isAuthEndpoint) {
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
            .then(() => true)
            .catch(() => {
              if (
                window.location.pathname !== '/login' &&
                !window.location.pathname.startsWith('/evaluate')
              ) {
                window.location.href = '/login'
              }
              return false
            })
            .finally(() => {
              refreshPromise = null
            })
        }

        return retryAfterSessionRefresh(
          err,
          () => refreshPromise ?? Promise.resolve(false),
          execute
        )
      }

      throw err
    }
  }
}
