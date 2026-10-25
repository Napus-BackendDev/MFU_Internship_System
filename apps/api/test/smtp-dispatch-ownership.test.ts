import 'reflect-metadata'
import { afterEach, describe, expect, it, vi } from 'vitest'
import nodemailer from 'nodemailer'
import { SmtpSettingsService } from '../src/system-settings/smtp-settings.service.js'

describe('SMTP test dispatch ownership', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllEnvs()
  })

  function fixture(queueFailure = false): {
    service: SmtpSettingsService
    add: ReturnType<typeof vi.fn>
    updateOne: ReturnType<typeof vi.fn>
    sendMail: ReturnType<typeof vi.fn>
  } {
    vi.stubEnv('NODE_ENV', 'development')
    const test = {
      id: 'smtp-test-id',
      recipientEmail: 'qa@example.test',
      status: 'queued',
      configurationSource: 'environment',
      configurationVersion: 0
    }
    const add = queueFailure
      ? vi.fn().mockRejectedValue(new Error('Redis unavailable'))
      : vi.fn().mockResolvedValue({ id: 'job' })
    const updateOne = vi.fn().mockResolvedValue({ modifiedCount: 1 })
    const config = {
      get: (key: string) =>
        (
          ({
            NODE_ENV: 'development',
            SMTP_HOST: '127.0.0.1',
            SMTP_PORT: 11025,
            SMTP_SECURE: false,
            SMTP_FROM: 'qa@example.test'
          }) as Record<string, unknown>
        )[key]
    }
    const settings = {
      findOne: () => ({ select: () => ({ exec: () => Promise.resolve(null) }) })
    }
    const tests = {
      create: () => Promise.resolve(test),
      findById: () => ({ exec: () => Promise.resolve(test) }),
      findOneAndUpdate: () => Promise.resolve(test),
      updateOne
    }
    type Args = ConstructorParameters<typeof SmtpSettingsService>
    const service = new SmtpSettingsService(
      config as unknown as Args[0],
      { add } as unknown as Args[1],
      settings as unknown as Args[2],
      tests as unknown as Args[3]
    )
    const sendMail = vi.fn().mockResolvedValue({ messageId: 'api-sent' })
    vi.spyOn(nodemailer, 'createTransport').mockReturnValue({
      sendMail
    } as unknown as ReturnType<typeof nodemailer.createTransport>)
    return { service, add, updateOne, sendMail }
  }

  const actor = {
    id: 'qa-admin',
    email: 'qa@example.test',
    displayName: 'QA',
    roles: ['systemAdmin'] as const,
    scope: { tenant: true, schoolIds: [], programIds: [] }
  }

  it('queues once without sending a competing API email in Development', async () => {
    const { service, add, sendMail } = fixture()
    await expect(
      service.enqueueTest(actor, 'qa@example.test')
    ).resolves.toMatchObject({ status: 'queued' })
    expect(add).toHaveBeenCalledTimes(1)
    expect(sendMail).not.toHaveBeenCalled()
  })

  it('reports queue failure without bypassing the Worker', async () => {
    const { service, updateOne, sendMail } = fixture(true)
    await expect(
      service.enqueueTest(actor, 'qa@example.test')
    ).rejects.toMatchObject({ status: 503 })
    expect(updateOne).toHaveBeenCalledWith(
      { _id: 'smtp-test-id' },
      expect.objectContaining({
        $set: expect.objectContaining({
          status: 'failed',
          failureCode: 'SMTP_TEST_QUEUE_UNAVAILABLE'
        }) as unknown
      })
    )
    expect(sendMail).not.toHaveBeenCalled()
  })

  it('distinguishes stored disabled settings from the effective Environment connection', async () => {
    const stored = {
      enabled: false,
      host: 'old.example.test',
      port: 2525,
      secure: true,
      username: 'old-user',
      from: 'old@example.test',
      version: 2
    }
    const config = {
      get: (key: string) =>
        (
          ({
            SMTP_HOST: '127.0.0.1',
            SMTP_PORT: 11025,
            SMTP_SECURE: false,
            SMTP_FROM: 'qa@example.test',
            SMTP_USER: '',
            MAIL_DELIVERY_MODE: 'capture'
          }) as Record<string, unknown>
        )[key]
    }
    type Args = ConstructorParameters<typeof SmtpSettingsService>
    const settings = {
      findOne: () => ({
        select: () => ({ exec: () => Promise.resolve(stored) })
      })
    }
    const service = new SmtpSettingsService(
      config as unknown as Args[0],
      {} as Args[1],
      settings as unknown as Args[2],
      {} as Args[3]
    )
    await expect(service.get()).resolves.toMatchObject({
      source: 'environment',
      host: 'old.example.test',
      port: 2525,
      deliveryMode: 'capture',
      effectiveConnection: {
        host: '127.0.0.1',
        port: 11025,
        secure: false,
        from: 'qa@example.test',
        usernameConfigured: false,
        version: 0
      }
    })
  })
})
