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
    url = new URL(value)
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

  // Return the original string: normalizing a presigned URL can invalidate its signature.
  return value
}
