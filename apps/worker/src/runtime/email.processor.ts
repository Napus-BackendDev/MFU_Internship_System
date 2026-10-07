import { TextEncoder } from 'node:util'
import { createHmac, randomInt, randomUUID } from 'node:crypto'

import { decryptSmtpSecret, type AppEnvironment } from '@internship/config'
import { campaignStatusFromDeliveryCounts } from '@internship/shared-types'
import type { Job, Queue } from 'bullmq'
import { SignJWT } from 'jose'
import type { Types } from 'mongoose'
import nodemailer, { type Transporter } from 'nodemailer'
import type { Logger } from 'pino'

import { renderSafeEmailHtml } from './email-template.js'
import { studentReferenceFilter } from './student-reference.js'
import type { SmtpSetting, WorkerModels } from './models.js'

export interface DeliveryEmailJob {
  readonly deliveryId: string
  readonly invitationId: string
}

export interface SmtpTestJob {
  readonly testId: string
}

export type EmailJob = DeliveryEmailJob | SmtpTestJob

const DELIVERY_LEASE_MS = 2 * 60 * 1000
const DELIVERY_LEASE_HEARTBEAT_MS = 30 * 1000
const DELIVERY_RECOVERY_BATCH_SIZE = 100
const CAMPAIGN_RECONCILIATION_MAX_ATTEMPTS = 5
const INTERRUPTED_BEFORE_SEND = 'WORKER_INTERRUPTED_BEFORE_SEND'

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
    private readonly logger: Logger,
    private readonly emailQueue?: Queue<EmailJob>
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

  public async recoverExpiredDeliveries(now = new Date()): Promise<void> {
    const legacyCutoff = new Date(now.getTime() - DELIVERY_LEASE_MS)
    const expired = await this.models.Delivery.find({
      status: 'sending',
      $or: [
        { processingLeaseUntil: { $lte: now } },
        {
          processingLeaseUntil: { $exists: false },
          processingStartedAt: { $lte: legacyCutoff }
        }
      ]
    })
      .select(
        '_id campaignId assignmentId attempts processingLeaseUntil processingToken providerAttemptStartedAt'
      )
      .sort({ processingLeaseUntil: 1 })
      .limit(DELIVERY_RECOVERY_BATCH_SIZE)
      .lean()
      .exec()

    for (const delivery of expired) {
      const isLegacyLease = !delivery.processingLeaseUntil
      const providerMayHaveAccepted =
        isLegacyLease || Boolean(delivery.providerAttemptStartedAt)
      const claimFilter: Record<string, unknown> = {
        _id: delivery._id,
        status: 'sending',
        ...(delivery.processingToken
          ? { processingToken: delivery.processingToken }
          : {}),
        ...(isLegacyLease
          ? {
              processingLeaseUntil: { $exists: false },
              processingStartedAt: { $lte: legacyCutoff }
            }
          : { processingLeaseUntil: { $lte: now } }),
        ...(!providerMayHaveAccepted
          ? { providerAttemptStartedAt: { $exists: false } }
          : {})
      }
      const recoveryUpdate = providerMayHaveAccepted
        ? {
            $set: {
              status: 'uncertain',
              lastErrorCode: 'PROVIDER_STATE_UNCERTAIN'
            },
            $unset: { processingLeaseUntil: 1, processingStartedAt: 1 }
          }
        : {
            $set: {
              status: 'failed',
              lastErrorCode: INTERRUPTED_BEFORE_SEND
            },
            $unset: {
              processingLeaseUntil: 1,
              processingStartedAt: 1,
              processingToken: 1
            }
          }
      const recovered = await this.models.Delivery.updateOne(
        claimFilter,
        recoveryUpdate
      )
      if (recovered.matchedCount !== 1) continue

      if (providerMayHaveAccepted) {
        this.logger.warn(
          { deliveryId: delivery._id.toString() },
          'stale email delivery marked uncertain; automatic resend suppressed'
        )
      }
      await this.reconcileCampaign(delivery.campaignId)
    }

    await this.enqueuePendingDeliveries()
  }

  private async enqueuePendingDeliveries(): Promise<void> {
    if (!this.emailQueue) return
    let afterId: Types.ObjectId | undefined
    while (true) {
      const pending = await this.models.Delivery.find({
        $or: [
          { status: 'queued' },
          {
            status: 'failed',
            lastErrorCode: {
              $in: [INTERRUPTED_BEFORE_SEND, 'QUEUE_ENQUEUE_FAILED']
            }
          }
        ],
        ...(afterId ? { _id: { $gt: afterId } } : {})
      })
        .select('_id assignmentId attempts status lastErrorCode')
        .sort({ _id: 1 })
        .limit(DELIVERY_RECOVERY_BATCH_SIZE)
        .lean()
        .exec()
      if (pending.length === 0) break

      for (const delivery of pending) {
        afterId = delivery._id
        const invitation = await this.models.Invitation.findOne({
          assignmentId: delivery.assignmentId
        })
          .select('_id')
          .lean()
        if (!invitation) {
          await this.models.Delivery.updateOne(
            {
              _id: delivery._id,
              status: delivery.status,
              ...(delivery.status === 'failed'
                ? { lastErrorCode: delivery.lastErrorCode }
                : {})
            },
            {
              $set: {
                status: 'failed',
                lastErrorCode: 'INVITATION_NOT_FOUND'
              }
            }
          )
          continue
        }

        try {
          const jobId =
            delivery.attempts === 0
              ? `delivery-${delivery._id.toString()}`
              : `delivery-${delivery._id.toString()}-retry-${delivery.attempts + 1}`
          const existingJob = await this.emailQueue.getJob(jobId)
          if (existingJob) {
            const state = await existingJob.getState()
            if (
              [
                'active',
                'waiting',
                'delayed',
                'waiting-children',
                'paused'
              ].includes(state)
            ) {
              continue
            }
            await existingJob.remove()
          }
          await this.emailQueue.add(
            'send-delivery',
            {
              deliveryId: delivery._id.toString(),
              invitationId: invitation._id.toString()
            },
            {
              attempts: 5,
              backoff: { type: 'exponential', delay: 5000 },
              jobId,
              removeOnComplete: 500,
              removeOnFail: 1000
            }
          )
        } catch (error: unknown) {
          this.logger.error(
            {
              deliveryId: delivery._id.toString(),
              error: safeFailureCode(error)
            },
            'could not re-enqueue pending email delivery'
          )
        }
      }
    }
  }

  private async processDelivery(job: DeliveryEmailJob): Promise<void> {
    const startedAt = new Date()
    const processingToken = randomUUID()
    const delivery = await this.models.Delivery.findOneAndUpdate(
      {
        _id: job.deliveryId,
        status: { $in: ['queued', 'failed'] }
      },
      {
        $set: {
          status: 'sending',
          processingStartedAt: startedAt,
          processingLeaseUntil: new Date(
            startedAt.getTime() + DELIVERY_LEASE_MS
          ),
          processingToken
        },
        $unset: { providerAttemptStartedAt: 1 },
        $inc: { attempts: 1 }
      },
      { returnDocument: 'after' }
    )
    if (!delivery) {
      const existingDelivery = await this.models.Delivery.findById(
        job.deliveryId
      )
        .select('campaignId')
        .lean()
      if (existingDelivery) {
        await this.reconcileCampaign(existingDelivery.campaignId)
      }
      return
    }
    const leaseHeartbeat = setInterval(() => {
      void this.extendDeliveryLease(delivery.id, processingToken)
    }, DELIVERY_LEASE_HEARTBEAT_MS)
    leaseHeartbeat.unref?.()

    let providerAccepted = false
    let mailAttempted = false
    try {
      await this.reconcileCampaign(delivery.campaignId)
      const [invitation, template, assignment, smtp] = await Promise.all([
        this.models.Invitation.findById(job.invitationId),
        this.models.EmailVersion.findById(delivery.templateVersionId),
        this.models.Assignment.findById(delivery.assignmentId),
        this.resolveSmtpConfiguration()
      ])
      const campaign = await this.models.Campaign.findById(delivery.campaignId)
      const now = new Date()
      if (
        !invitation ||
        !template ||
        !assignment ||
        !campaign ||
        !deliverySourcesAreCurrent(
          {
            invitationStatus: invitation.status,
            invitationAssignmentId: invitation.assignmentId,
            invitationVersion: invitation.version ?? 1,
            invitationExpiresAt: invitation.expiresAt,
            campaignType: campaign.type,
            ...(typeof campaign.invitationVersion === 'number'
              ? { campaignInvitationVersion: campaign.invitationVersion }
              : {}),
            templatePublished: template.status === 'published',
            assignmentStatus: assignment.status,
            assignmentDeadlineAt: assignment.deadlineAt
          },
          delivery.assignmentId,
          now
        )
      ) {
        throw new Error('DELIVERY_SOURCE_INVALID')
      }
      const [student, evaluator] = await Promise.all([
        this.models.Student.findOne(
          studentReferenceFilter(assignment.studentId)
        ),
        this.models.Evaluator.findById(assignment.evaluatorId)
      ])
      if (!student || !evaluator) throw new Error('DELIVERY_RECIPIENT_INVALID')

      let pin = ''
      if (shouldRotateInvitationPin(campaign.type)) {
        const invitationVersion = invitation.version ?? 1
        if ((campaign.invitationVersion ?? 1) !== invitationVersion) {
          throw new Error('INVITATION_VERSION_STALE')
        }
        pin = generatePin()
        const accessPinHash = `v2:${createHmac(
          'sha256',
          this.environment.INVITATION_TOKEN_PEPPER
        )
          .update(`internship-evaluation-pin:v2\0${pin}`)
          .digest('hex')}`
        const session = await this.models.Invitation.db.startSession()
        try {
          await session.withTransaction(async () => {
            const invitationVersionFilter =
              invitationVersion === 1
                ? {
                    $or: [{ version: 1 }, { version: { $exists: false } }]
                  }
                : { version: invitationVersion }
            const invitationWrite = await this.models.Invitation.updateOne(
              {
                _id: invitation.id,
                assignmentId: assignment.id,
                status: 'active',
                ...invitationVersionFilter
              },
              { $set: { accessPinHash }, $unset: { accessPin: 1 } },
              { session }
            )
            const assignmentWrite = await this.models.Assignment.updateOne(
              {
                _id: assignment.id,
                status: { $in: ['pending', 'inProgress'] }
              },
              { $set: { accessPinHash }, $unset: { accessPin: 1 } },
              { session }
            )
            if (
              invitationWrite.matchedCount !== 1 ||
              assignmentWrite.matchedCount !== 1
            ) {
              throw new Error('INVITATION_REVOKED')
            }
          })
        } finally {
          await session.endSession()
        }
      }

      const token = await new SignJWT({
        tokenUse: 'invitation',
        invitationId: invitation.id,
        assignmentId: invitation.assignmentId,
        invitationVersion: invitation.version ?? 1
      })
        .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
        .setIssuer('internship-transcript-v2')
        .setAudience('internship-transcript-api')
        .setExpirationTime(Math.floor(invitation.expiresAt.getTime() / 1000))
        .sign(this.signingKey)
      const invitationParameters = new URLSearchParams({ token })
      const values = {
        student_name:
          typeof student.name === 'string'
            ? student.name
            : (student.name?.th ?? student.name?.en ?? student.studentId),
        student_id: student.studentId ?? student.id,
        company_name:
          (student as unknown as { company?: string }).company ||
          'สถานประกอบการ',
        evaluator_name:
          evaluator.name?.th ?? evaluator.name?.en ?? evaluator.email,
        invitation_url: `${this.environment.PUBLIC_WEB_URL}/evaluate#${invitationParameters.toString()}`,
        deadline: assignment.deadlineAt
          ? new Date(assignment.deadlineAt).toLocaleDateString('th-TH', {
              year: 'numeric',
              month: 'long',
              day: 'numeric'
            })
          : '-',
        pin
      }
      const attemptStarted = await this.models.Delivery.updateOne(
        { _id: delivery.id, status: 'sending', processingToken },
        {
          $set: {
            providerAttemptStartedAt: new Date(),
            processingLeaseUntil: new Date(Date.now() + DELIVERY_LEASE_MS)
          }
        }
      )
      if (attemptStarted.matchedCount !== 1) {
        throw new Error('DELIVERY_LEASE_LOST')
      }
      mailAttempted = true
      const result: unknown = await this.createTransport(smtp).sendMail({
        from: smtp.from,
        to: delivery.recipientEmail,
        subject: render(template.subject, values),
        html: renderSafeEmailHtml(template.html, values),
        text: render(template.text, values)
      })
      providerAccepted = true
      const messageId = readMessageId(result)
      await this.models.Delivery.updateOne(
        {
          _id: delivery.id,
          processingToken,
          status: { $in: ['sending', 'uncertain'] }
        },
        {
          $set: { status: 'sent', providerMessageId: messageId },
          $unset: {
            lastErrorCode: 1,
            processingStartedAt: 1,
            processingLeaseUntil: 1,
            processingToken: 1,
            providerAttemptStartedAt: 1
          }
        }
      )
      this.logger.info(
        { deliveryId: delivery.id, smtpSource: smtp.source },
        'email delivery sent'
      )
    } catch (error: unknown) {
      const code = safeFailureCode(error)
      const deliveryStatus = deliveryFailureStatus(
        error,
        mailAttempted,
        providerAccepted
      )
      await this.models.Delivery.updateOne(
        {
          _id: delivery.id,
          processingToken,
          status: { $in: ['sending', 'uncertain'] }
        },
        {
          $set: {
            status: deliveryStatus,
            lastErrorCode:
              deliveryStatus === 'uncertain' ? 'PROVIDER_STATE_UNCERTAIN' : code
          },
          $unset: {
            processingStartedAt: 1,
            processingLeaseUntil: 1,
            processingToken: 1,
            providerAttemptStartedAt: 1
          }
        }
      )
      throw error
    } finally {
      clearInterval(leaseHeartbeat)
      await this.reconcileCampaign(delivery.campaignId)
    }
  }

  private async extendDeliveryLease(
    deliveryId: string,
    processingToken: string
  ): Promise<void> {
    try {
      const result = await this.models.Delivery.updateOne(
        { _id: deliveryId, status: 'sending', processingToken },
        {
          $set: {
            processingLeaseUntil: new Date(Date.now() + DELIVERY_LEASE_MS)
          }
        }
      )
      if (result.matchedCount !== 1) {
        this.logger.warn(
          { deliveryId },
          'email delivery lease is no longer owned'
        )
      }
    } catch {
      this.logger.error({ deliveryId }, 'email delivery lease heartbeat failed')
    }
  }

  private async reconcileCampaign(campaignId: string): Promise<void> {
    for (
      let attempt = 0;
      attempt < CAMPAIGN_RECONCILIATION_MAX_ATTEMPTS;
      attempt += 1
    ) {
      const campaign = await this.models.Campaign.findOneAndUpdate(
        { _id: campaignId },
        { $inc: { __v: 1 } },
        { returnDocument: 'after' }
      )
        .select('total __v')
        .lean()
      if (!campaign) throw new Error('CAMPAIGN_NOT_FOUND')

      const summary = await this.models.Delivery.aggregate<{
        _id: string
        count: number
      }>([
        { $match: { campaignId } },
        { $group: { _id: '$status', count: { $sum: 1 } } }
      ])
      const counts: Record<string, number> = {}
      for (const item of summary) counts[item._id] = item.count
      const observedCount = Object.values(counts).reduce(
        (total, count) => total + count,
        0
      )
      if (campaign.total > 0 && observedCount !== campaign.total) {
        this.logger.error(
          {
            campaignId,
            expectedDeliveries: campaign.total,
            observedDeliveries: observedCount
          },
          'campaign delivery records do not match expected total'
        )
      }

      const status = campaignStatusFromDeliveryCounts(campaign.total, counts)
      const result = await this.models.Campaign.updateOne(
        { _id: campaignId, __v: campaign.__v },
        { $set: { status }, $inc: { __v: 1 } }
      )
      if (result.matchedCount === 1) return
    }

    throw new Error('CAMPAIGN_RECONCILIATION_CONFLICT')
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
      { returnDocument: 'after' }
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

  private createTransport(smtp: ResolvedSmtpConfiguration): Transporter {
    return nodemailer.createTransport({
      host: smtp.host,
      port: smtp.port,
      secure: smtp.secure,
      ...(this.environment.NODE_ENV === 'production' && !smtp.secure
        ? { requireTLS: true }
        : {}),
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

export function deliveryFailureStatus(
  error: unknown,
  mailAttempted: boolean,
  providerAccepted: boolean
): 'failed' | 'uncertain' {
  if (providerAccepted) return 'uncertain'
  if (!mailAttempted) return 'failed'
  if (
    typeof error === 'object' &&
    error !== null &&
    'responseCode' in error &&
    typeof error.responseCode === 'number' &&
    error.responseCode >= 400 &&
    error.responseCode <= 599
  ) {
    return 'failed'
  }
  return 'uncertain'
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

export function shouldRotateInvitationPin(
  campaignType: 'invitation' | 'reminder'
): boolean {
  return campaignType === 'invitation'
}

export function deliverySourcesAreCurrent(
  sources: {
    invitationStatus: string
    invitationAssignmentId: string
    invitationVersion: number
    invitationExpiresAt: Date
    campaignType: 'invitation' | 'reminder'
    campaignInvitationVersion?: number
    templatePublished: boolean
    assignmentStatus: string
    assignmentDeadlineAt: Date
  },
  deliveryAssignmentId: string,
  now: Date
): boolean {
  return (
    sources.invitationStatus === 'active' &&
    sources.invitationExpiresAt > now &&
    sources.invitationAssignmentId === deliveryAssignmentId &&
    (sources.campaignType !== 'invitation' ||
      (sources.campaignInvitationVersion ?? 1) === sources.invitationVersion) &&
    sources.templatePublished &&
    ['pending', 'inProgress'].includes(sources.assignmentStatus) &&
    sources.assignmentDeadlineAt > now
  )
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
