import { TextEncoder } from 'node:util'
import { createHmac, randomInt } from 'node:crypto'

import { decryptSmtpSecret, type AppEnvironment } from '@internship/config'
import type { Job } from 'bullmq'
import { SignJWT } from 'jose'
import nodemailer from 'nodemailer'
import type { Logger } from 'pino'

import type { SmtpSetting, WorkerModels } from './models.js'

export interface DeliveryEmailJob {
  readonly deliveryId: string
  readonly invitationId: string
}

export interface SmtpTestJob {
  readonly testId: string
}

export type EmailJob = DeliveryEmailJob | SmtpTestJob

interface ResolvedSmtpConfiguration {
  readonly source: 'database' | 'environment'
  readonly version: number
  readonly host: string
  readonly port: number
  readonly secure: boolean
  readonly username?: string
  readonly password?: string
  readonly from: string
}

const LOCAL_SMTP_HOSTS = new Set(['localhost', '127.0.0.1', '::1'])

export class EmailProcessor {
  private readonly signingKey: Uint8Array

  public constructor(
    private readonly environment: AppEnvironment,
    private readonly models: WorkerModels,
    private readonly logger: Logger
  ) {
    this.assertSafeCaptureHost(environment.SMTP_HOST)
    this.signingKey = new TextEncoder().encode(environment.AUTH_JWT_SECRET)
  }

  public async process(job: Job<EmailJob>): Promise<void> {
    if (job.name === 'test-smtp') {
      await this.processSmtpTest(job.data as SmtpTestJob)
      return
    }

    await this.processDelivery(job.data as DeliveryEmailJob)
  }

  private async processDelivery(job: DeliveryEmailJob): Promise<void> {
    const delivery = await this.models.Delivery.findOneAndUpdate(
      {
        _id: job.deliveryId,
        status: { $in: ['queued', 'failed'] }
      },
      {
        $set: { status: 'sending', processingStartedAt: new Date() },
        $inc: { attempts: 1 }
      },
      { new: true }
    )
    if (!delivery) return
    await this.models.Campaign.updateOne(
      { _id: delivery.campaignId, status: 'queued' },
      { $set: { status: 'processing' } }
    )

    let providerAccepted = false
    try {
      const [invitation, template, assignment, smtp] = await Promise.all([
        this.models.Invitation.findById(job.invitationId),
        this.models.EmailVersion.findById(delivery.templateVersionId),
        this.models.Assignment.findById(delivery.assignmentId),
        this.resolveSmtpConfiguration()
      ])
      if (
        !invitation ||
        invitation.status !== 'active' ||
        invitation.expiresAt <= new Date() ||
        !template ||
        template.status !== 'published' ||
        !assignment
      ) {
        throw new Error('DELIVERY_SOURCE_INVALID')
      }
      const [student, evaluator] = await Promise.all([
        this.models.Student.findOne({
          $or: [
            { _id: assignment.studentId },
            { studentId: assignment.studentId }
          ]
        }),
        this.models.Evaluator.findById(assignment.evaluatorId)
      ])
      if (!student || !evaluator) throw new Error('DELIVERY_RECIPIENT_INVALID')

      const pin = generatePin()
      const accessPinHash = createHmac(
        'sha256',
        this.environment.AUTH_JWT_SECRET
      )
        .update(pin)
        .digest('hex')
      await Promise.all([
        this.models.Invitation.updateOne(
          { _id: invitation.id, status: 'active' },
          { $set: { accessPinHash }, $unset: { accessPin: 1 } }
        ),
        this.models.Assignment.updateOne(
          {
            _id: assignment.id,
            status: { $in: ['pending', 'inProgress', 'reopened'] }
          },
          { $set: { accessPinHash }, $unset: { accessPin: 1 } }
        )
      ])

      const token = await new SignJWT({
        tokenUse: 'invitation',
        invitationId: invitation.id,
        assignmentId: invitation.assignmentId
      })
        .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
        .setIssuer('internship-transcript-v2')
        .setAudience('internship-transcript-api')
        .setIssuedAt()
        .setExpirationTime(Math.floor(invitation.expiresAt.getTime() / 1000))
        .sign(this.signingKey)
      const values = {
        student_name: student.name?.th ?? student.name?.en ?? student.studentId,
        student_id: student.studentId ?? student.id,
        company_name: (student as unknown as { company?: string }).company || 'สถานประกอบการ',
        evaluator_name:
          evaluator.name?.th ?? evaluator.name?.en ?? evaluator.email,
        invitation_url: `${this.environment.PUBLIC_WEB_URL}/evaluate?token=${encodeURIComponent(token)}`,
        deadline: assignment.deadlineAt
          ? new Date(assignment.deadlineAt).toLocaleDateString('th-TH', {
              year: 'numeric',
              month: 'long',
              day: 'numeric'
            })
          : '-',
        pin
      }
      const result: unknown = await this.createTransport(smtp).sendMail({
        from: smtp.from,
        to: delivery.recipientEmail,
        subject: render(template.subject, values),
        html: render(template.html, values),
        text: render(template.text, values)
      })
      providerAccepted = true
      const messageId = readMessageId(result)
      await this.models.Delivery.updateOne(
        { _id: delivery.id },
        {
          $set: { status: 'sent', providerMessageId: messageId },
          $unset: { lastErrorCode: 1, processingStartedAt: 1 }
        }
      )
      this.logger.info(
        { deliveryId: delivery.id, smtpSource: smtp.source },
        'email delivery sent'
      )
    } catch (error: unknown) {
      const code = safeFailureCode(error)
      await this.models.Delivery.updateOne(
        { _id: delivery.id },
        {
          $set: {
            status: providerAccepted ? 'uncertain' : 'failed',
            lastErrorCode: providerAccepted ? 'PROVIDER_STATE_UNCERTAIN' : code
          },
          $unset: { processingStartedAt: 1 }
        }
      )
      throw error
    } finally {
      await this.reconcileCampaign(delivery.campaignId)
    }
  }

  private async reconcileCampaign(campaignId: string): Promise<void> {
    const deliveries = await this.models.Delivery.find({ campaignId })
      .select('status')
      .lean()
    const pending = deliveries.some((item) =>
      ['queued', 'sending'].includes(item.status)
    )
    const failed = deliveries.some((item) =>
      ['failed', 'uncertain'].includes(item.status)
    )
    const status = pending
      ? deliveries.some((item) => item.status === 'sending')
        ? 'processing'
        : 'queued'
      : failed
        ? 'partial'
        : 'completed'
    await this.models.Campaign.updateOne(
      { _id: campaignId },
      { $set: { status } }
    )
  }

  private async processSmtpTest(job: SmtpTestJob): Promise<void> {
    const test = await this.models.SmtpTestDelivery.findOneAndUpdate(
      {
        _id: job.testId,
        status: { $in: ['queued', 'failed', 'sending'] }
      },
      {
        $set: { status: 'sending' },
        $unset: { failureCode: 1, completedAt: 1 }
      },
      { new: true }
    )
    if (!test || test.status === 'sent') return

    try {
      const smtp = await this.resolveSmtpConfiguration()
      if (
        smtp.source !== test.configurationSource ||
        smtp.version !== test.configurationVersion
      ) {
        throw new Error('SMTP_CONFIGURATION_CHANGED')
      }

      const result: unknown = await this.createTransport(smtp).sendMail({
        from: smtp.from,
        to: test.recipientEmail,
        subject: 'ทดสอบระบบอีเมล Internship Transcript',
        text: [
          'ระบบเชื่อมต่อ SMTP และส่งอีเมลทดสอบสำเร็จ',
          `เวลา: ${new Date().toISOString()}`,
          `แหล่งการตั้งค่า: ${smtp.source}`
        ].join('\n')
      })
      await this.models.SmtpTestDelivery.updateOne(
        { _id: test.id },
        {
          $set: {
            status: 'sent',
            providerMessageId: readMessageId(result),
            completedAt: new Date()
          },
          $unset: { failureCode: 1 }
        }
      )
      this.logger.info(
        { smtpTestId: test.id, smtpSource: smtp.source },
        'SMTP test sent'
      )
    } catch (error: unknown) {
      await this.models.SmtpTestDelivery.updateOne(
        { _id: test.id },
        {
          $set: {
            status: 'failed',
            failureCode: safeFailureCode(error),
            completedAt: new Date()
          }
        }
      )
      throw error
    }
  }

  private async resolveSmtpConfiguration(): Promise<ResolvedSmtpConfiguration> {
    const setting = await this.models.SmtpSetting.findOne({
      key: 'smtp',
      enabled: true
    }).lean()

    if (!setting) {
      this.assertSafeCaptureHost(this.environment.SMTP_HOST)
      return {
        source: 'environment',
        version: 0,
        host: this.environment.SMTP_HOST,
        port: this.environment.SMTP_PORT,
        secure: this.environment.SMTP_SECURE,
        ...(this.environment.SMTP_USER
          ? { username: this.environment.SMTP_USER }
          : {}),
        ...(this.environment.SMTP_PASSWORD
          ? { password: this.environment.SMTP_PASSWORD }
          : {}),
        from: this.environment.SMTP_FROM
      }
    }

    this.assertSafeCaptureHost(setting.host)
    return {
      source: 'database',
      version: setting.version,
      host: setting.host,
      port: setting.port,
      secure: setting.secure,
      ...(setting.username ? { username: setting.username } : {}),
      ...withOptionalPassword(this.decryptPassword(setting)),
      from: setting.from
    }
  }

  private decryptPassword(setting: SmtpSetting): string | undefined {
    if (
      !setting.passwordCiphertext ||
      !setting.passwordIv ||
      !setting.passwordAuthTag
    ) {
      if (setting.username) throw new Error('SMTP_PASSWORD_REQUIRED')
      return undefined
    }

    return decryptSmtpSecret(
      {
        ciphertext: setting.passwordCiphertext,
        iv: setting.passwordIv,
        authTag: setting.passwordAuthTag
      },
      this.environment.SMTP_SETTINGS_ENCRYPTION_KEY
    )
  }

  private createTransport(
    smtp: ResolvedSmtpConfiguration
  ): nodemailer.Transporter {
    return nodemailer.createTransport({
      host: smtp.host,
      port: smtp.port,
      secure: smtp.secure,
      ...(smtp.username && smtp.password
        ? { auth: { user: smtp.username, pass: smtp.password } }
        : {})
    })
  }

  private assertSafeCaptureHost(host: string): void {
    if (this.environment.MAIL_DELIVERY_MODE !== 'capture') return

    const normalized = host.toLowerCase()
    if (
      !LOCAL_SMTP_HOSTS.has(normalized) &&
      !(this.environment.CONTAINERIZED && normalized === 'mailpit')
    ) {
      throw new Error('Capture mail mode requires a local SMTP host.')
    }
  }
}

function readMessageId(result: unknown): string {
  return typeof result === 'object' &&
    result !== null &&
    'messageId' in result &&
    typeof result.messageId === 'string'
    ? result.messageId
    : 'provider-message-id-unavailable'
}

function safeFailureCode(error: unknown): string {
  if (!(error instanceof Error)) return 'SEND_FAILED'
  if (/^[A-Z0-9_]{3,100}$/.test(error.message)) return error.message
  return 'SMTP_SEND_FAILED'
}

function withOptionalPassword(password: string | undefined): {
  readonly password?: string
} {
  return password ? { password } : {}
}

function generatePin(): string {
  let pin = ''
  for (let index = 0; index < 16; index += 1) {
    pin += String(randomInt(0, 10))
  }
  return pin
}

function render(
  template: string,
  values: Readonly<Record<string, string>>
): string {
  return template.replace(/{{\s*([a-z_]+)\s*}}/g, (_match, key: string) => {
    const value = values[key]
    if (value === undefined) throw new Error('UNKNOWN_TEMPLATE_PLACEHOLDER')
    return value
  })
}
