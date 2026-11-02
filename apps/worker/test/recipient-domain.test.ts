import { describe, expect, it, vi } from 'vitest'

import { recipientDomainCanReceiveMail } from '../src/runtime/recipient-domain.js'

function dnsError(code: string): Error {
  return Object.assign(new Error(code), { code })
}

function resolver(overrides: {
  mx?: () => Promise<{ exchange: string; priority: number }[]>
  a?: () => Promise<string[]>
  aaaa?: () => Promise<string[]>
}): never {
  const missing = (): Promise<never> => Promise.reject(dnsError('ENOTFOUND'))
  return {
    resolveMx: vi.fn(overrides.mx ?? missing),
    resolve4: vi.fn(overrides.a ?? missing),
    resolve6: vi.fn(overrides.aaaa ?? missing)
  } as never
}

describe('recipientDomainCanReceiveMail', () => {
  it('accepts a domain with mail servers', async () => {
    await expect(
      recipientDomainCanReceiveMail(
        'a@example.com',
        resolver({
          mx: () =>
            Promise.resolve([{ exchange: 'mail.example.com', priority: 1 }])
        })
      )
    ).resolves.toBe(true)
  })

  it('rejects a domain that does not exist', async () => {
    await expect(
      recipientDomainCanReceiveMail('a@no-such-domain.invalid', resolver({}))
    ).resolves.toBe(false)
  })

  it('rejects a null MX domain', async () => {
    await expect(
      recipientDomainCanReceiveMail(
        'a@example.com',
        resolver({ mx: () => Promise.resolve([{ exchange: '', priority: 0 }]) })
      )
    ).resolves.toBe(false)
  })

  it('falls back to address records when no MX exists', async () => {
    await expect(
      recipientDomainCanReceiveMail(
        'a@example.com',
        resolver({
          mx: () => Promise.reject(dnsError('ENODATA')),
          a: () => Promise.resolve(['192.0.2.1'])
        })
      )
    ).resolves.toBe(true)
  })

  it('does not block mail when DNS itself is failing', async () => {
    await expect(
      recipientDomainCanReceiveMail(
        'a@example.com',
        resolver({ mx: () => Promise.reject(dnsError('ETIMEOUT')) })
      )
    ).resolves.toBe(true)
  })
})
