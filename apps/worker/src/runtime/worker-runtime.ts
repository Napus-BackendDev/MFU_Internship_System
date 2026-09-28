import {
  isBullMqRedisReady,
  supportsMongoTransactions,
  type AppEnvironment
} from '@internship/config'
import { Queue, Worker } from 'bullmq'
import { Redis } from 'ioredis'
import type { Connection } from 'mongoose'
import { createConnection } from 'mongoose'
import { STATES } from 'mongoose'
import type { Logger } from 'pino'

import { DocumentProcessor, type DocumentJob } from './document.processor.js'
import { EmailProcessor, type EmailJob } from './email.processor.js'
import { createWorkerHealthServer } from './health-server.js'
import { createModels } from './models.js'
import {
  ReportExportProcessor,
  type ReportExportJob
} from './report-export.processor.js'

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
  private documentQueue?: Queue<DocumentJob>
  private reportExportQueue?: Queue<ReportExportJob>
  private healthRedis?: Redis
  private healthServer?: ReturnType<typeof createWorkerHealthServer>
  private recoveryTimer?: NodeJS.Timeout
  private readonly requireMongoTransactions: boolean
  private ready = false
  private closing = false

  public constructor(
    private readonly environment: AppEnvironment,
    private readonly logger: Logger
  ) {
    this.requireMongoTransactions = environment.NODE_ENV === 'production'
  }

  public async start(): Promise<void> {
    this.healthServer = createWorkerHealthServer({
      isLive: () => !this.closing,
      isReady: () => this.isReady()
    })
    await new Promise<void>((resolve, reject) => {
      const server = this.healthServer!
      server.once('error', reject)
      server.listen(this.environment.WORKER_HEALTH_PORT, '127.0.0.1', () => {
        server.off('error', reject)
        resolve()
      })
    })

    this.healthRedis = new Redis(this.environment.REDIS_URL, {
      commandTimeout: 2000,
      connectTimeout: 1000,
      enableOfflineQueue: false,
      lazyConnect: true,
      maxRetriesPerRequest: 1,
      retryStrategy: (attempt: number) => Math.min(attempt * 100, 1000)
    })
    this.connection = createConnection(this.environment.MONGODB_URI, {
      autoIndex: this.environment.NODE_ENV !== 'production',
      maxPoolSize: 10,
      minPoolSize: 1,
      serverSelectionTimeoutMS: 5000
    })
    await this.connection.asPromise()
    if (!(await this.supportsRequiredMongoTransactions())) {
      throw new Error(
        'Worker requires a transaction-capable MongoDB in production.'
      )
    }
    const models = createModels(this.connection)
    const connection = redisOptions(this.environment.REDIS_URL)
    this.emailQueue = new Queue<EmailJob>('email', {
      connection,
      prefix: 'internship-transcript-v2'
    })
    this.documentQueue = new Queue<DocumentJob>('documents', {
      connection,
      prefix: 'internship-transcript-v2'
    })
    this.reportExportQueue = new Queue<ReportExportJob>('report-exports', {
      connection,
      prefix: 'internship-transcript-v2'
    })
    await Promise.all([
      this.emailQueue.waitUntilReady(),
      this.documentQueue.waitUntilReady(),
      this.reportExportQueue.waitUntilReady()
    ])
    const documents = new DocumentProcessor(
      this.environment,
      models,
      this.logger,
      this.documentQueue
    )
    const email = new EmailProcessor(
      this.environment,
      models,
      this.logger,
      this.emailQueue
    )
    const reportExports = new ReportExportProcessor(
      this.environment,
      models,
      this.logger,
      this.reportExportQueue
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
      ),
      new Worker<ReportExportJob, void>(
        'report-exports',
        (job) => reportExports.process(job),
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
    await this.healthRedis.connect()
    if (!(await isBullMqRedisReady(this.healthRedis))) {
      throw new Error('Worker readiness Redis probe failed.')
    }
    await Promise.all([
      email.recoverExpiredDeliveries(),
      documents.recoverStuckDocuments(),
      reportExports.recoverQueuedExports(),
      reportExports.expireExports()
    ])
    this.ready = true
    this.recoveryTimer = setInterval(() => {
      void Promise.all([
        email.recoverExpiredDeliveries(),
        documents.recoverStuckDocuments(),
        reportExports.recoverQueuedExports(),
        reportExports.expireExports()
      ]).catch((error: unknown) => {
        this.logger.error(
          { error: error instanceof Error ? error.message : 'RECOVERY_FAILED' },
          'background job recovery pass failed'
        )
      })
    }, 60_000)
    this.recoveryTimer.unref?.()
  }

  public async close(): Promise<void> {
    if (this.closing) return
    this.closing = true
    this.ready = false
    if (this.recoveryTimer) clearInterval(this.recoveryTimer)
    if (this.healthServer?.listening) {
      await new Promise<void>((resolve, reject) => {
        this.healthServer!.close((error) => (error ? reject(error) : resolve()))
      })
    }
    if (this.healthRedis && this.healthRedis.status !== 'end') {
      await this.healthRedis.quit()
    }
    await Promise.all(this.workers.map((worker) => worker.close()))
    await this.emailQueue?.close()
    await this.documentQueue?.close()
    await this.reportExportQueue?.close()
    if (this.connection) await this.connection.close()
    this.logger.info('worker shutdown complete')
  }

  private async isReady(): Promise<boolean> {
    if (
      !this.ready ||
      this.closing ||
      this.connection?.readyState !== STATES.connected ||
      this.workers.length !== 3 ||
      !this.workers.every((worker) => worker.isRunning()) ||
      !this.healthRedis
    ) {
      return false
    }

    try {
      if (!(await this.supportsRequiredMongoTransactions())) return false
      return await isBullMqRedisReady(this.healthRedis)
    } catch {
      return false
    }
  }

  private async supportsRequiredMongoTransactions(): Promise<boolean> {
    if (!this.requireMongoTransactions) return true
    const database = this.connection?.db
    if (!database) return false

    try {
      const hello = await database.admin().command({ hello: 1 })
      return supportsMongoTransactions(hello)
    } catch {
      return false
    }
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
