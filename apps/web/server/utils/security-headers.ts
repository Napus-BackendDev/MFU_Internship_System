export function configuredApiOrigin(
  apiBaseUrl: string | undefined,
  isDevelopment: boolean
): string | null {
  if (!apiBaseUrl) return null

  try {
    const apiUrl = new URL(apiBaseUrl)
    const protocolAllowed =
      apiUrl.protocol === 'https:' ||
      (isDevelopment && apiUrl.protocol === 'http:')

    if (!protocolAllowed || apiUrl.username !== '' || apiUrl.password !== '') {
      return null
    }
    return apiUrl.origin
  } catch {
    return null
  }
}
