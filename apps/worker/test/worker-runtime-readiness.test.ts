import type { AppEnvironment } from '@internship/config'
import type { Logger } from 'pino'
import { STATES } from 'mongoose'
import { describe, expect, it, vi } from 'vitest'

import { WorkerRuntime } from '../src/runtime/worker-runtime.js'

describe('WorkerRuntime production readiness', () => {
  function createRuntime(
    hello: Record<string, unknown>,
    nodeEnv = 'production'
  ): { runtime: WorkerRuntime; command: ReturnType<typeof vi.fn> } {
    const command = vi.fn().mockResolvedValue(hello)
    const runtime = new WorkerRuntime(
      { NODE_ENV: nodeEnv } as AppEnvironment,
      {} as Logger
    )
    Object.assign(runtime, {
      ready: true,
      closing: false,
      connection: {
        readyState: STATES.connected,
        db: { admin: () => ({ command }) }
      },
      workers: Array.from({ length: 3 }, () => ({ isRunning: () => true })),
      healthRedis: {
        ping: vi.fn().mockResolvedValue('PONG'),
        info: vi.fn().mockResolvedValue('# Server\r\nredis_version:7.2.4\r\n')
      }
    })
    return { runtime, command }
  }

  function checkReadiness(runtime: WorkerRuntime): Promise<boolean> {
    return (runtime as unknown as { isReady(): Promise<boolean> }).isReady()
  }

  it('rejects a connected standalone MongoDB without transaction support', async () => {
    const { runtime, command } = createRuntime({
      logicalSessionTimeoutMinutes: 30,
      maxWireVersion: 17
    })

    await expect(checkReadiness(runtime)).resolves.toBe(false)
    expect(command).toHaveBeenCalledWith({ hello: 1 })
  })

  it('accepts a replica set with transaction support', async () => {
    const { runtime, command } = createRuntime({
      setName: 'rs0',
      logicalSessionTimeoutMinutes: 30,
      maxWireVersion: 17
    })

    await expect(checkReadiness(runtime)).resolves.toBe(true)
    expect(command).toHaveBeenCalledWith({ hello: 1 })
  })

  it('keeps non-production topology requirements unchanged', async () => {
    const { runtime, command } = createRuntime(
      { maxWireVersion: 17 },
      'development'
    )

    await expect(checkReadiness(runtime)).resolves.toBe(true)
    expect(command).not.toHaveBeenCalled()
  })
})
