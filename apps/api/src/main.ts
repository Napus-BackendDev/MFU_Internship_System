import 'reflect-metadata'

import {
  assertSupportedNodeRuntime,
  type AppEnvironment
} from '@internship/config'
import { ConfigService } from '@nestjs/config'
import { NestFactory } from '@nestjs/core'
import helmet from 'helmet'
import { Logger } from 'nestjs-pino'

import { AppModule } from './app.module.js'
import { ApiExceptionFilter } from './common/api-exception.filter.js'
import { HealthService } from './health.service.js'

async function bootstrap(): Promise<void> {
  assertSupportedNodeRuntime(process.versions.node)

  const app = await NestFactory.create(AppModule, {
    abortOnError: true,
    bufferLogs: true
  })
  const config = app.get(ConfigService<AppEnvironment, true>)
  app.useLogger(app.get(Logger))

  app.enableShutdownHooks()
  app.setGlobalPrefix('api/v2')
  app.useGlobalFilters(new ApiExceptionFilter())
  app.enableCors({
    credentials: true,
    methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
    origin: config.get('corsOrigins', { infer: true })
  })
  app.use(
    helmet({
      contentSecurityPolicy: false
    })
  )

  if (config.get('NODE_ENV', { infer: true }) === 'production') {
    const readiness = await app.get(HealthService).getReadiness()
    if (!readiness.ready) {
      throw new Error('Mandatory API dependencies are not ready.')
    }
  }

  const port = config.get('PORT', { infer: true })
  await app.listen(port, '0.0.0.0')
}

bootstrap().catch((error: unknown) => {
  const message =
    error instanceof Error ? error.message : 'Unknown startup error'
  process.stderr.write(`API startup failed: ${message}\n`)
  process.exitCode = 1
})
