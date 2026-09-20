import { assertSupportedNodeRuntime, loadEnvironment } from '@internship/config'
import { fileURLToPath } from 'node:url'

import { createLogger } from './runtime/logger.js'

assertSupportedNodeRuntime(process.versions.node)
if (!process.env.NODE_ENV) process.env.NODE_ENV = 'development'

try {
  process.loadEnvFile(
    fileURLToPath(
      new URL(`../../../.env.${process.env.NODE_ENV}`, import.meta.url)
    )
  )
} catch {
  // Environment injection is authoritative in containers and CI.
}

const environment = loadEnvironment(process.env)
const logger = createLogger(environment.LOG_LEVEL)
const { WorkerRuntime } = await import('./runtime/worker-runtime.js')
const runtime = new WorkerRuntime(environment, logger)

const shutdown = async (signal: string): Promise<void> => {
  logger.info({ signal }, 'worker shutdown requested')
  await runtime.close()
}

process.once('SIGINT', () => void shutdown('SIGINT'))
process.once('SIGTERM', () => void shutdown('SIGTERM'))
await runtime.start()
logger.info({ service: 'worker', version: '0.1.0' }, 'worker ready')
