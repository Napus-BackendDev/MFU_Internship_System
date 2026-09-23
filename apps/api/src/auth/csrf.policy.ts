const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS'])

export function allowsCookieMutation(input: {
  readonly method: string
  readonly usesCookieAuthentication: boolean
  readonly requestedWith?: string
  readonly origin?: string
  readonly allowedOrigins: readonly string[]
}): boolean {
  if (SAFE_METHODS.has(input.method.toUpperCase())) return true
  if (!input.usesCookieAuthentication) return true
  if (input.requestedWith !== 'XMLHttpRequest') return false
  return !input.origin || input.allowedOrigins.includes(input.origin)
}
