import type { AppEnvironment } from '@internship/config'
import { Queue, Worker } from 'bullmq'
import type { Connection } from 'mongoose'
import { createConnection } from 'mongoose'
import type { Logger } from 'pino'

import { DocumentProcessor, type DocumentJob } from './document.processor.js'
import { EmailProcessor, type EmailJob } from './email.processor.js'
import { createModels } from './models.js'

interface RedisOptions {
  readonly host: string
  readonly port: number
  readonly username?: string
  readonly password?: string
  readonly tls?: Record<string, never>
  readonly maxRetriesPerRequest: null
}

export class WorkerRuntime {
  private connection?: Connection
  private workers: Worker[] = []
  private emailQueue?: Queue<EmailJob>
  private recoveryTimer?: NodeJS.Timeout
  private closing = false

  public constructor(
    private readonly environment: AppEnvironment,
    private readonly logger: Logger
  ) {}

  public async start(): Promise<void> {
    this.connection = createConnection(this.environment.MONGODB_URI, {
      autoIndex: this.environment.NODE_ENV !== 'production',
      maxPoolSize: 10,
      minPoolSize: 1,
      serverSelectionTimeoutMS: 5000
    })
    await this.connection.asPromise()
    const models = createModels(this.connection)
    const documents = new DocumentProcessor(
      this.environment,
      models,
      this.logger
    )
    const connection = redisOptions(this.environment.REDIS_URL)
    this.emailQueue = new Queue<EmailJob>('email', {
      connection,
      prefix: 'internship-transcript-v2'
    })
    await this.emailQueue.waitUntilReady()
    const email = new EmailProcessor(
      this.environment,
      models,
      this.logger,
      this.emailQueue
    )

    this.workers = [
      new Worker<EmailJob, void>('email', (job) => email.process(job), {
        connection,
        concurrency: 5,
        prefix: 'internship-transcript-v2'
      }),
      new Worker<DocumentJob, void>(
        'documents',
        (job) => documents.process(job),
        {
          connection,
          concurrency: 2,
          prefix: 'internship-transcript-v2'
        }
      )
    ]

    for (const worker of this.workers) {
      worker.on('failed', (job, error) => {
        this.logger.error(
          { jobId: job?.id, queue: worker.name, error: error.message },
          'background job failed'
        )
      })
      worker.on('error', (error) => {
        this.logger.error(
          { queue: worker.name, error: error.message },
          'queue worker error'
        )
      })
    }

    await Promise.all(this.workers.map((worker) => worker.waitUntilReady()))
    await email.recoverExpiredDeliveries()
    this.recoveryTimer = setInterval(() => {
      void email.recoverExpiredDeliveries().catch((error: unknown) => {
        this.logger.error(
          { error: error instanceof Error ? error.message : 'RECOVERY_FAILED' },
          'email delivery recovery pass failed'
        )
      })
    }, 60_000)
    this.recoveryTimer.unref?.()
  }

  public async close(): Promise<void> {
    if (this.closing) return
    this.closing = true
    if (this.recoveryTimer) clearInterval(this.recoveryTimer)
    await Promise.all(this.workers.map((worker) => worker.close()))
    await this.emailQueue?.close()
    if (this.connection) await this.connection.close()
    this.logger.info('worker shutdown complete')
  }
}

function redisOptions(redisUrl: string): RedisOptions {
  const url = new URL(redisUrl)
  return {
    host: url.hostname,
    port: Number(url.port || 6379),
    ...(url.username ? { username: decodeURIComponent(url.username) } : {}),
    ...(url.password ? { password: decodeURIComponent(url.password) } : {}),
    ...(url.protocol === 'rediss:' ? { tls: {} } : {}),
    maxRetriesPerRequest: null
  }
}
