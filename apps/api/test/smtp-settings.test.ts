import { describe, expect, it } from 'vitest'

import {
  smtpSettingsUpdateSchema,
  smtpTestInputSchema
} from '../src/system-settings/smtp-settings.validation.js'

const validSettings = {
  enabled: true,
  host: 'smtp.example.test',
  port: 587,
  secure: false,
  username: 'mailer@example.test',
  password: 'secret-value',
  clearPassword: false,
  from: 'Internship <no-reply@example.test>',
  version: 0
}

describe('SMTP settings contract', () => {
  it('accepts a complete SMTP update', () => {
    expect(smtpSettingsUpdateSchema.parse(validSettings)).toMatchObject({
      host: 'smtp.example.test',
      port: 587
    })
  })

  it('accepts the Development localhost sender', () => {
    expect(() =>
      smtpSettingsUpdateSchema.parse({
        ...validSettings,
        from: 'Internship Dev <no-reply@localhost>'
      })
    ).not.toThrow()
  })

  it('rejects a URL where a hostname is required', () => {
    expect(() =>
      smtpSettingsUpdateSchema.parse({
        ...validSettings,
        host: 'https://smtp.example.test'
      })
    ).toThrow()
  })

  it('cannot replace and clear the password in one request', () => {
    expect(() =>
      smtpSettingsUpdateSchema.parse({
        ...validSettings,
        clearPassword: true
      })
    ).toThrow()
  })

  it('validates the test recipient', () => {
    expect(() =>
      smtpTestInputSchema.parse({ recipientEmail: 'not-an-email' })
    ).toThrow()
  })
})
