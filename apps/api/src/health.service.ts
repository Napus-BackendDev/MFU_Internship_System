import type { HealthStatus } from '@internship/shared-types'
import type { AppEnvironment } from '@internship/config'
import { Injectable, type OnModuleDestroy } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { InjectConnection } from '@nestjs/mongoose'
import { Redis } from 'ioredis'
import type { Connection } from 'mongoose'

@Injectable()
export class HealthService implements OnModuleDestroy {
  private readonly redis: Redis

  public constructor(
    @InjectConnection() private readonly mongo: Connection,
    config: ConfigService<AppEnvironment, true>
  ) {
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
      await this.mongo.db.admin().ping()
      return 'ok'
    } catch {
      return 'unavailable'
    }
  }

  private async checkRedis(): Promise<'ok' | 'unavailable'> {
    try {
      if (this.redis.status === 'wait') await this.redis.connect()
      if ((await this.redis.ping()) !== 'PONG') return 'unavailable'
      const info = await this.redis.info('server')
      const match = /^redis_version:(\d+)\./mu.exec(info)
      const major = match?.[1] ? Number.parseInt(match[1], 10) : 0
      return major >= 5 ? 'ok' : 'unavailable'
    } catch {
      return 'unavailable'
    }
  }
}
