import { describe, expect, it } from 'vitest'

import { toSafeInvitationPath } from '../app/utils/safe-invitation-path'

describe('toSafeInvitationPath', () => {
  it('keeps a valid invitation and strips an external origin', () => {
    expect(
      toSafeInvitationPath(
        'https://portal.example.test/evaluate?token=header.payload.sig&assignment=65aabbccddeeff0011223344'
      )
    ).toBe(
      '/evaluate#token=header.payload.sig&assignment=65aabbccddeeff0011223344'
    )
  })

  it('accepts a relative invitation route and encodes its query values', () => {
    expect(
      toSafeInvitationPath(
        '/evaluate?token=token_value&assignment=assignment-1'
      )
    ).toBe('/evaluate#token=token_value&assignment=assignment-1')
  })

  it('keeps a fragment invitation without exposing credentials in the query', () => {
    expect(
      toSafeInvitationPath(
        'https://portal.example.test/evaluate#token=token_value&assignment=assignment-1'
      )
    ).toBe('/evaluate#token=token_value&assignment=assignment-1')
  })

  it.each([
    'javascript:alert(1)',
    '//attacker.example/evaluate?token=x&assignment=y',
    'https://attacker.example/redirect?url=https://attacker.example',
    'https://user:pass@portal.example.test/evaluate?token=x&assignment=y',
    'https://portal.example.test/evaluate?token=x&token=y&assignment=z',
    'https://portal.example.test/evaluate?token=x&assignment=y&next=https://attacker.example',
    '/evaluate?token=x',
    '/evaluate?token=x&assignment=y#fragment',
    '/evaluate?token=query&assignment=y#token=fragment&assignment=y'
  ])('rejects unsafe or malformed URL %s', (value) => {
    expect(toSafeInvitationPath(value)).toBeNull()
  })
})
