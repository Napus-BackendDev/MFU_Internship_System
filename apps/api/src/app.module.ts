import { loadEnvironment, type AppEnvironment } from '@internship/config'
import { BullModule } from '@nestjs/bullmq'
import {
  Module,
  type MiddlewareConsumer,
  type NestModule
} from '@nestjs/common'
import { ConfigModule, ConfigService } from '@nestjs/config'
import { APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core'
import { MongooseModule } from '@nestjs/mongoose'
import { LoggerModule } from 'nestjs-pino'

import { AuditInterceptor } from './audit/audit.interceptor.js'
import { AuditModule } from './audit/audit.module.js'
import { AcademicModule } from './academic/academic.module.js'
import { AccessGuard } from './auth/access.guard.js'
import { AuthRateLimitGuard } from './auth/auth-rate-limit.guard.js'
import { AuthModule } from './auth/auth.module.js'
import { redisConnectionOptions } from './common/redis.js'
import { RequestIdMiddleware } from './common/request-id.middleware.js'
import { CorrespondenceModule } from './correspondence/correspondence.module.js'
import { DocumentsModule } from './documents/documents.module.js'
import { HealthController } from './health.controller.js'
import { HealthService } from './health.service.js'
import { EvaluationsModule } from './evaluations/evaluations.module.js'
import { MembersModule } from './members/members.module.js'
import { ReportsModule } from './reports/reports.module.js'
import { GeneralSettingsModule } from './system-settings/general-settings.module.js'
import { SmtpSettingsModule } from './system-settings/smtp-settings.module.js'

@Module({
  imports: [
    ConfigModule.forRoot({
      cache: true,
      envFilePath: [
        `.env.${process.env.NODE_ENV ?? 'development'}`,
        `../../.env.${process.env.NODE_ENV ?? 'development'}`
      ],
      expandVariables: false,
      isGlobal: true,
      validate: (raw: Record<string, unknown>) =>
        loadEnvironment(raw as NodeJS.ProcessEnv)
    }),
    LoggerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService<AppEnvironment, true>) => ({
        pinoHttp: {
          level: config.get('LOG_LEVEL', { infer: true }),
          redact: {
            paths: [
              'req.headers.authorization',
              'req.headers.cookie',
              'res.headers.set-cookie',
              '*.token',
              '*.accessToken',
              '*.password',
              '*.passwordCiphertext',
              '*.passwordIv',
              '*.passwordAuthTag'
            ],
            censor: '[REDACTED]'
          }
        }
      })
    }),
    MongooseModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService<AppEnvironment, true>) => ({
        uri: config.get('MONGODB_URI', { infer: true }),
        autoIndex: config.get('NODE_ENV', { infer: true }) !== 'production',
        maxPoolSize: 20,
        minPoolSize: 2,
        serverSelectionTimeoutMS: 5000
      })
    }),
    BullModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService<AppEnvironment, true>) => ({
        connection: redisConnectionOptions(
          config.get('REDIS_URL', { infer: true })
        ),
        prefix: 'internship-transcript-v2'
      })
    }),
    AuthModule,
    AuditModule,
    AcademicModule,
    MembersModule,
    EvaluationsModule,
    CorrespondenceModule,
    DocumentsModule,
    ReportsModule,
    GeneralSettingsModule,
    SmtpSettingsModule
  ],
  controllers: [HealthController],
  providers: [
    HealthService,
    RequestIdMiddleware,
    { provide: APP_GUARD, useClass: AuthRateLimitGuard },
    { provide: APP_GUARD, useClass: AccessGuard },
    { provide: APP_INTERCEPTOR, useClass: AuditInterceptor }
  ]
})
export class AppModule implements NestModule {
  public configure(consumer: MiddlewareConsumer): void {
    consumer.apply(RequestIdMiddleware).forRoutes('{*path}')
  }
}
