import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto'

const ALGORITHM = 'aes-256-gcm'
const IV_BYTES = 12

export interface EncryptedSmtpSecret {
  readonly ciphertext: string
  readonly iv: string
  readonly authTag: string
}

export function parseSmtpSettingsEncryptionKey(value: string): Buffer {
  if (!/^[a-fA-F0-9]{64}$/.test(value)) {
    throw new Error(
      'SMTP settings encryption key must be 64 hexadecimal characters.'
    )
  }

  return Buffer.from(value, 'hex')
}

export function encryptSmtpSecret(
  plaintext: string,
  encryptionKey: string
): EncryptedSmtpSecret {
  const iv = randomBytes(IV_BYTES)
  const cipher = createCipheriv(
    ALGORITHM,
    parseSmtpSettingsEncryptionKey(encryptionKey),
    iv
  )
  const ciphertext = Buffer.concat([
    cipher.update(plaintext, 'utf8'),
    cipher.final()
  ])

  return {
    ciphertext: ciphertext.toString('base64'),
    iv: iv.toString('base64'),
    authTag: cipher.getAuthTag().toString('base64')
  }
}

export function decryptSmtpSecret(
  encrypted: EncryptedSmtpSecret,
  encryptionKey: string
): string {
  const decipher = createDecipheriv(
    ALGORITHM,
    parseSmtpSettingsEncryptionKey(encryptionKey),
    Buffer.from(encrypted.iv, 'base64')
  )
  decipher.setAuthTag(Buffer.from(encrypted.authTag, 'base64'))

  return Buffer.concat([
    decipher.update(Buffer.from(encrypted.ciphertext, 'base64')),
    decipher.final()
  ]).toString('utf8')
}
