export function resolveSafeDownloadUrl(
  value: string,
  pageProtocol: string
): string | null {
  if (
    value.length === 0 ||
    value.trim() !== value ||
    (pageProtocol !== 'http:' && pageProtocol !== 'https:')
  ) {
    return null
  }

  let url: URL
  try {
    url = new URL(
      value,
      typeof window !== 'undefined' && window?.location?.origin
        ? window.location.origin
        : 'http://localhost:8080'
    )
  } catch {
    return null
  }

  if (
    (url.protocol !== 'https:' && url.protocol !== 'http:') ||
    (pageProtocol === 'https:' && url.protocol !== 'https:') ||
    url.username.length > 0 ||
    url.password.length > 0
  ) {
    return null
  }

  // Return original string for absolute presigned URLs to avoid signature changes; otherwise full resolved URL.
  return value.startsWith('http') ? value : url.href
}
