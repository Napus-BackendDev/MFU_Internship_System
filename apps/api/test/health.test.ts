import type { INestApplication } from '@nestjs/common'
import { Test } from '@nestjs/testing'
import request from 'supertest'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { HealthController } from '../src/health.controller.js'
import { HealthService } from '../src/health.service.js'

interface LivenessResponse {
  readonly service: 'api'
  readonly status: 'ok'
  readonly timestamp: string
  readonly version: string
}

interface ReadinessResponse {
  readonly ready: boolean
  readonly dependencies: Readonly<{
    mongodb: 'ok' | 'unavailable'
    redis: 'ok' | 'unavailable'
  }>
  readonly timestamp: string
}

describe('health endpoint', () => {
  let app: INestApplication

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [HealthController],
      providers: [
        {
          provide: HealthService,
          useValue: {
            getHealth: () => ({
              service: 'api',
              status: 'ok',
              timestamp: new Date().toISOString(),
              version: '0.1.0'
            }),
            getReadiness: () =>
              Promise.resolve({
                ready: true,
                dependencies: { mongodb: 'ok', redis: 'ok' },
                timestamp: new Date().toISOString()
              })
          }
        }
      ]
    }).compile()

    app = moduleRef.createNestApplication()
    app.setGlobalPrefix('api/v2')
    await app.init()
  })

  afterAll(async () => {
    await app.close()
  })

  it('returns the API health contract', async () => {
    const server = app.getHttpServer() as Parameters<typeof request>[0]
    const response = await request(server).get('/api/v2/health').expect(200)
    const body = response.body as {
      service: string
      status: string
      timestamp: string
      version: string
    }

    expect(body).toMatchObject({
      service: 'api',
      status: 'ok',
      version: '0.1.0'
    })
    expect(body.timestamp).toEqual(expect.any(String))
  })

  it('returns the OpenAPI liveness contract', async () => {
    const server = app.getHttpServer() as Parameters<typeof request>[0]
    const response = await request(server)
      .get('/api/v2/health/live')
      .expect(200)
    const body = response.body as LivenessResponse

    expect(body).toMatchObject({
      service: 'api',
      status: 'ok',
      version: '0.1.0'
    })
    expect(body.timestamp).toEqual(expect.any(String))
  })

  it('returns the OpenAPI readiness contract', async () => {
    const server = app.getHttpServer() as Parameters<typeof request>[0]
    const response = await request(server)
      .get('/api/v2/health/ready')
      .expect(200)
    const body = response.body as ReadinessResponse

    expect(body).toMatchObject({
      ready: true,
      dependencies: { mongodb: 'ok', redis: 'ok' }
    })
    expect(body.timestamp).toEqual(expect.any(String))
  })
})
