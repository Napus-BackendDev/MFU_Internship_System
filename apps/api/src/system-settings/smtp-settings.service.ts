import { encryptSmtpSecret, type AppEnvironment } from '@internship/config'
import type { AuthenticatedActor } from '@internship/shared-types'
import { InjectQueue } from '@nestjs/bullmq'
import {
  ConflictException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException
} from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { InjectModel } from '@nestjs/mongoose'
import type { Queue } from 'bullmq'
import type { HydratedDocument, Model } from 'mongoose'

import {
  SmtpSettingRecord,
  SmtpTestDeliveryRecord
} from './smtp-settings.schema.js'
import type { SmtpSettingsUpdateInput } from './smtp-settings.validation.js'

type SmtpSettingDocument = HydratedDocument<SmtpSettingRecord> & {
  createdAt?: Date
  updatedAt?: Date
}
type SmtpTestDocument = HydratedDocument<SmtpTestDeliveryRecord> & {
  createdAt?: Date
  updatedAt?: Date
}

const LOCAL_SMTP_HOSTS = new Set(['localhost', '127.0.0.1', '::1'])
const SECRET_FIELDS =
  '+passwordCiphertext +passwordIv +passwordAuthTag' as const

@Injectable()
export class SmtpSettingsService {
  public constructor(
    private readonly config: ConfigService<AppEnvironment, true>,
    @InjectQueue('email') private readonly emailQueue: Queue,
    @InjectModel(SmtpSettingRecord.name)
    private readonly settings: Model<SmtpSettingRecord>,
    @InjectModel(SmtpTestDeliveryRecord.name)
    private readonly tests: Model<SmtpTestDeliveryRecord>
  ) {}

  public async get(): Promise<unknown> {
    const setting = await this.readSetting()
    return this.toResponse(setting)
  }

  public async update(
    actor: AuthenticatedActor,
    input: SmtpSettingsUpdateInput
  ): Promise<unknown> {
    this.assertDevelopmentHost(input.host)
    const setting = await this.readSetting()
    const currentVersion = setting?.version ?? 0

    if (input.version !== currentVersion) {
      throw new ConflictException({ code: 'SMTP_SETTINGS_VERSION_CONFLICT' })
    }

    const encrypted = input.password
      ? encryptSmtpSecret(
          input.password,
          this.config.get('SMTP_SETTINGS_ENCRYPTION_KEY', { infer: true })
        )
      : undefined
    const passwordConfigured = Boolean(
      encrypted ||
      (!input.clearPassword && setting && this.hasStoredPassword(setting))
    )

    if (input.enabled && input.username && !passwordConfigured) {
      throw new UnprocessableEntityException({
        code: 'SMTP_PASSWORD_REQUIRED',
        message: 'ต้องระบุรหัสผ่านเมื่อเปิดใช้ SMTP username'
      })
    }

    const nextValues = {
      enabled: input.enabled,
      host: input.host,
      port: input.port,
      secure: input.secure,
      from: input.from,
      updatedBy: actor.id,
      version: currentVersion + 1,
      ...(input.username ? { username: input.username } : {}),
      ...(encrypted
        ? {
            passwordCiphertext: encrypted.ciphertext,
            passwordIv: encrypted.iv,
            passwordAuthTag: encrypted.authTag
          }
        : {})
    }

    if (!setting) {
      const created = (await this.settings.create({
        key: 'smtp',
        ...nextValues
      })) as SmtpSettingDocument
      return this.toResponse(created)
    }

    const unset = {
      ...(!input.username ? { username: 1 } : {}),
      ...(input.clearPassword
        ? {
            passwordCiphertext: 1,
            passwordIv: 1,
            passwordAuthTag: 1
          }
        : {})
    }
    const updated = await this.settings
      .findOneAndUpdate(
        { key: 'smtp', version: currentVersion },
        {
          $set: nextValues,
          ...(Object.keys(unset).length > 0 ? { $unset: unset } : {})
        },
        { new: true }
      )
      .select(SECRET_FIELDS)
      .exec()

    if (!updated) {
      throw new ConflictException({ code: 'SMTP_SETTINGS_VERSION_CONFLICT' })
    }

    return this.toResponse(updated)
  }

  public async enqueueTest(
    actor: AuthenticatedActor,
    recipientEmail: string
  ): Promise<unknown> {
    const setting = await this.readSetting()
    const source = setting?.enabled ? 'database' : 'environment'
    const version = setting?.enabled ? setting.version : 0

    if (setting?.enabled) {
      this.assertDevelopmentHost(setting.host)
      if (setting.username && !this.hasStoredPassword(setting)) {
        throw new UnprocessableEntityException({
          code: 'SMTP_PASSWORD_REQUIRED'
        })
      }
    }

    const test = (await this.tests.create({
      recipientEmail,
      status: 'queued',
      configurationSource: source,
      configurationVersion: version,
      createdBy: actor.id
    })) as SmtpTestDocument

    await this.emailQueue.add(
      'test-smtp',
      { testId: test.id },
      {
        attempts: 3,
        backoff: { type: 'exponential', delay: 3000 },
        jobId: `smtp-test-${test.id}`,
        removeOnComplete: 100,
        removeOnFail: 200
      }
    )

    return this.toTestResponse(test)
  }

  public async getTest(testId: string): Promise<unknown> {
    const test = await this.tests.findById(testId).exec()
    if (!test) throw new NotFoundException({ code: 'RESOURCE_NOT_FOUND' })
    return this.toTestResponse(test)
  }

  private readSetting(): Promise<SmtpSettingDocument | null> {
    return this.settings.findOne({ key: 'smtp' }).select(SECRET_FIELDS).exec()
  }

  private hasStoredPassword(setting: SmtpSettingDocument): boolean {
    return Boolean(
      setting.passwordCiphertext &&
      setting.passwordIv &&
      setting.passwordAuthTag
    )
  }

  private toResponse(setting: SmtpSettingDocument | null): unknown {
    const source = setting?.enabled ? 'database' : 'environment'
    const passwordConfigured = setting ? this.hasStoredPassword(setting) : false

    return {
      enabled: setting?.enabled ?? false,
      source,
      host: setting?.host ?? this.config.get('SMTP_HOST', { infer: true }),
      port: setting?.port ?? this.config.get('SMTP_PORT', { infer: true }),
      secure:
        setting?.secure ?? this.config.get('SMTP_SECURE', { infer: true }),
      username:
        setting?.username ??
        this.config.get('SMTP_USER', { infer: true }) ??
        '',
      from: setting?.from ?? this.config.get('SMTP_FROM', { infer: true }),
      passwordConfigured,
      effectivePasswordConfigured:
        source === 'database'
          ? passwordConfigured
          : Boolean(this.config.get('SMTP_PASSWORD', { infer: true })),
      version: setting?.version ?? 0,
      updatedAt: setting?.updatedAt?.toISOString() ?? null,
      updatedBy: setting?.updatedBy ?? null
    }
  }

  private toTestResponse(test: SmtpTestDocument): unknown {
    return {
      id: test.id,
      status: test.status,
      configurationSource: test.configurationSource,
      configurationVersion: test.configurationVersion,
      failureCode: test.failureCode ?? null,
      createdAt: test.createdAt?.toISOString() ?? null,
      completedAt: test.completedAt?.toISOString() ?? null
    }
  }

  private assertDevelopmentHost(host: string): void {
    if (this.config.get('NODE_ENV', { infer: true }) !== 'development') return

    const normalized = host.toLowerCase()
    if (
      !LOCAL_SMTP_HOSTS.has(normalized) &&
      !(
        this.config.get('CONTAINERIZED', { infer: true }) &&
        normalized === 'mailpit'
      )
    ) {
      throw new UnprocessableEntityException({
        code: 'DEVELOPMENT_SMTP_MUST_BE_LOCAL',
        message: 'Development ใช้ SMTP บน localhost หรือ Mailpit เท่านั้น'
      })
    }
  }
}
