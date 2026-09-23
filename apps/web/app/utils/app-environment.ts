export type PublicAppEnvironment = 'development' | 'production'

/** Resolve the public UI mode without allowing an unset or unknown value to expose dev login. */
export function resolvePublicAppEnvironment(
  configured: string | undefined,
  nodeEnvironment: string | undefined
): PublicAppEnvironment {
  if (configured === 'development' || configured === 'production') {
    return configured
  }

  return nodeEnvironment === 'development' ? 'development' : 'production'
}
