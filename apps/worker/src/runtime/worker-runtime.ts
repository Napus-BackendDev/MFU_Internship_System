import type { AppEnvironment } from '@internship/config'
import { Worker } from 'bullmq'
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
    const email = new EmailProcessor(this.environment, models, this.logger)
    const documents = new DocumentProcessor(
      this.environment,
      models,
      this.logger
    )
    const connection = redisOptions(this.environment.REDIS_URL)

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
  }

  public async close(): Promise<void> {
    if (this.closing) return
    this.closing = true
    await Promise.all(this.workers.map((worker) => worker.close()))
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
