import { describe, expect, it } from 'vitest'

import {
  decryptSmtpSecret,
  encryptSmtpSecret,
  parseSmtpSettingsEncryptionKey
} from '../src/index.js'

const key = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef'

describe('SMTP secret encryption', () => {
  it('round-trips a password without storing plaintext', () => {
    const encrypted = encryptSmtpSecret('mail-password', key)

    expect(encrypted.ciphertext).not.toContain('mail-password')
    expect(decryptSmtpSecret(encrypted, key)).toBe('mail-password')
  })

  it('rejects a malformed encryption key', () => {
    expect(() => parseSmtpSettingsEncryptionKey('too-short')).toThrow(
      '64 hexadecimal characters'
    )
  })

  it('rejects tampered ciphertext', () => {
    const encrypted = encryptSmtpSecret('mail-password', key)

    expect(() =>
      decryptSmtpSecret({ ...encrypted, ciphertext: 'AAAA' }, key)
    ).toThrow()
  })
})
