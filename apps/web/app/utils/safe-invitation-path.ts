const invitationPath = '/evaluate'
const allowedInvitationKeys = new Set(['token', 'assignment'])

/** Returns a same-origin evaluator path only for a well-formed invitation URL. */
export function toSafeInvitationPath(value: unknown): string | null {
  if (
    typeof value !== 'string' ||
    value.length === 0 ||
    value.length > 8192 ||
    value.startsWith('//') ||
    value.includes('\\')
  ) {
    return null
  }

  let parsed: URL
  try {
    parsed = new URL(value, 'https://invitation.invalid')
  } catch {
    return null
  }

  if (
    !['http:', 'https:'].includes(parsed.protocol) ||
    parsed.username.length > 0 ||
    parsed.password.length > 0 ||
    parsed.pathname !== invitationPath
  ) {
    return null
  }

  const fragmentParams = new URLSearchParams(parsed.hash.replace(/^#/u, ''))
  const entries = [
    ...parsed.searchParams.entries(),
    ...fragmentParams.entries()
  ]
  const keys = entries.map(([key]) => key)
  if (
    keys.some((key) => !allowedInvitationKeys.has(key)) ||
    keys.length !== allowedInvitationKeys.size ||
    keys.filter((key) => key === 'token').length !== 1 ||
    keys.filter((key) => key === 'assignment').length !== 1
  ) {
    return null
  }

  const token = parsed.searchParams.get('token') ?? fragmentParams.get('token')
  const assignment =
    parsed.searchParams.get('assignment') ?? fragmentParams.get('assignment')
  if (
    !token ||
    token.length > 4096 ||
    !/^[A-Za-z0-9._~-]+$/.test(token) ||
    !assignment ||
    !/^[A-Za-z0-9_-]{1,128}$/.test(assignment)
  ) {
    return null
  }

  const fragment = new URLSearchParams({ token, assignment })
  return `${invitationPath}#${fragment.toString()}`
}
