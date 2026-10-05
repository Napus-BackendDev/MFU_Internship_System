import type { HealthStatus } from '@internship/shared-types'
import { isBullMqRedisReady, type AppEnvironment } from '@internship/config'
import { Injectable, type OnModuleDestroy } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { InjectConnection } from '@nestjs/mongoose'
import { Redis } from 'ioredis'
import type { Connection } from 'mongoose'

import { supportsMongoTransactions } from './health.mongo-capability.js'

const DEPENDENCY_CHECK_TIMEOUT_MS = 2_000

function withTimeout<T>(
  operation: () => Promise<T>,
  timeoutMs: number
): Promise<T> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(
      () => reject(new Error('Dependency readiness check timed out.')),
      timeoutMs
    )

    void Promise.resolve()
      .then(operation)
      .then(
        (result) => {
          clearTimeout(timeout)
          resolve(result)
        },
        (error: unknown) => {
          clearTimeout(timeout)
          reject(
            error instanceof Error
              ? error
              : new Error('Dependency readiness check failed.')
          )
        }
      )
  })
}

@Injectable()
export class HealthService implements OnModuleDestroy {
  private readonly redis: Redis
  private readonly requireMongoTransactions: boolean

  public constructor(
    @InjectConnection() private readonly mongo: Connection,
    config: ConfigService<AppEnvironment, true>
  ) {
    this.requireMongoTransactions =
      config.get('NODE_ENV', { infer: true }) === 'production'
    this.redis = new Redis(config.get('REDIS_URL', { infer: true }), {
      enableReadyCheck: true,
      lazyConnect: true,
      maxRetriesPerRequest: 1
    })
    this.redis.on('error', () => undefined)
  }

  public getHealth(): HealthStatus {
    return {
      service: 'api',
      status: 'ok',
      timestamp: new Date().toISOString(),
      version: '0.1.0'
    }
  }

  public async getReadiness(): Promise<{
    ready: boolean
    dependencies: Readonly<Record<'mongodb' | 'redis', 'ok' | 'unavailable'>>
    timestamp: string
  }> {
    const [mongodb, redis] = await Promise.all([
      this.checkMongo(),
      this.checkRedis()
    ])
    return {
      ready: mongodb === 'ok' && redis === 'ok',
      dependencies: { mongodb, redis },
      timestamp: new Date().toISOString()
    }
  }

  public async onModuleDestroy(): Promise<void> {
    if (this.redis.status !== 'end') await this.redis.quit()
  }

  private async checkMongo(): Promise<'ok' | 'unavailable'> {
    try {
      const ready = await withTimeout(async () => {
        if (!this.mongo.db) return false
        const admin = this.mongo.db.admin()
        if (!this.requireMongoTransactions) {
          await admin.ping()
          return true
        }

        const hello = await admin.command({ hello: 1 })
        return supportsMongoTransactions(hello)
      }, DEPENDENCY_CHECK_TIMEOUT_MS)
      return ready ? 'ok' : 'unavailable'
    } catch {
      return 'unavailable'
    }
  }

  private async checkRedis(): Promise<'ok' | 'unavailable'> {
    try {
      const ready = await withTimeout(async () => {
        if (['wait', 'close', 'end'].includes(this.redis.status)) {
          await this.redis.connect()
        }
        return isBullMqRedisReady(this.redis)
      }, DEPENDENCY_CHECK_TIMEOUT_MS)
      return ready ? 'ok' : 'unavailable'
    } catch {
      return 'unavailable'
    }
  }
}
