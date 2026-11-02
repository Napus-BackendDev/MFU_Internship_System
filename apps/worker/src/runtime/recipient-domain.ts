import { promises as dns } from 'node:dns'

const MISSING_DOMAIN_CODES = new Set(['ENOTFOUND', 'ENODATA'])

function isMissingDomain(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    typeof error.code === 'string' &&
    MISSING_DOMAIN_CODES.has(error.code)
  )
}

// SMTP servers usually accept any address and bounce later, so a domain that
// cannot receive mail is the one bad recipient we can detect before sending.
// DNS outages fail open: a resolver problem must not block real invitations.
export async function recipientDomainCanReceiveMail(
  email: string,
  resolver: Pick<typeof dns, 'resolveMx' | 'resolve4' | 'resolve6'> = dns
): Promise<boolean> {
  const domain = email.slice(email.lastIndexOf('@') + 1).trim()
  if (!domain) return false
  try {
    const records = await resolver.resolveMx(domain)
    // RFC 7505 null MX explicitly declares that the domain accepts no mail.
    return !records.every((record) => record.exchange === '')
  } catch (error: unknown) {
    if (!isMissingDomain(error)) return true
  }
  // RFC 5321 falls back to the address records when no MX exists.
  for (const lookup of [
    () => resolver.resolve4(domain),
    () => resolver.resolve6(domain)
  ]) {
    try {
      if ((await lookup()).length > 0) return true
    } catch (error: unknown) {
      if (!isMissingDomain(error)) return true
    }
  }
  return false
}
