import type { HealthStatus } from '@internship/shared-types'
import { isBullMqRedisReady, type AppEnvironment } from '@internship/config'
import { Injectable, type OnModuleDestroy } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { InjectConnection } from '@nestjs/mongoose'
import { Redis } from 'ioredis'
import type { Connection } from 'mongoose'

import { supportsMongoTransactions } from './health.mongo-capability.js'

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
    const mongodb = await this.checkMongo()
    const redis = await this.checkRedis()
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
      if (!this.mongo.db) return 'unavailable'
      const admin = this.mongo.db.admin()
      if (!this.requireMongoTransactions) {
        await admin.ping()
        return 'ok'
      }

      const hello = await admin.command({ hello: 1 })
      if (!supportsMongoTransactions(hello)) return 'unavailable'
      return 'ok'
    } catch {
      return 'unavailable'
    }
  }

  private async checkRedis(): Promise<'ok' | 'unavailable'> {
    try {
      if (['wait', 'close', 'end'].includes(this.redis.status)) {
        await this.redis.connect()
      }
      return (await isBullMqRedisReady(this.redis)) ? 'ok' : 'unavailable'
    } catch {
      return 'unavailable'
    }
  }
}
