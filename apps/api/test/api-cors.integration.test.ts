import type { INestApplication } from '@nestjs/common'
import { Controller, Put } from '@nestjs/common'
import { Test } from '@nestjs/testing'
import request from 'supertest'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

import { CsrfGuard } from '../src/auth/csrf.guard.js'
import { createApiCorsOptions } from '../src/common/cors-options.js'

const allowedOrigin = 'https://internship.example.ac.th'

@Controller()
class CorsTestController {
  @Put('csrf-resource')
  public update(): { readonly updated: true } {
    return { updated: true }
  }
}

describe('API CORS and cookie CSRF integration', () => {
  let app: INestApplication

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [CorsTestController]
    }).compile()
    app = moduleRef.createNestApplication()
    app.enableCors(createApiCorsOptions([allowedOrigin]))
    app.useGlobalGuards(
      new CsrfGuard({
        get: vi.fn().mockReturnValue([allowedOrigin])
      } as never)
    )
    await app.init()
  })

  afterAll(async () => {
    await app.close()
  })

  it('allows credentialed PUT preflight only from configured origin', async () => {
    const server = app.getHttpServer() as Parameters<typeof request>[0]
    const response = await request(server)
      .options('/csrf-resource')
      .set('Origin', allowedOrigin)
      .set('Access-Control-Request-Method', 'PUT')
      .set('Access-Control-Request-Headers', 'x-requested-with')
      .expect(204)

    expect(response.headers['access-control-allow-origin']).toBe(allowedOrigin)
    expect(response.headers['access-control-allow-credentials']).toBe('true')
    expect(response.headers['access-control-allow-methods']).toContain('PUT')
    expect(response.headers['access-control-allow-headers']).toContain(
      'x-requested-with'
    )
  })

  it('accepts trusted cookie-authenticated PUT with the custom request header', async () => {
    const server = app.getHttpServer() as Parameters<typeof request>[0]
    await request(server)
      .put('/csrf-resource')
      .set('Origin', allowedOrigin)
      .set('X-Requested-With', 'XMLHttpRequest')
      .set('Cookie', 'its_access=opaque')
      .expect(200, { updated: true })
  })

  it('rejects cookie-authenticated PUT from an untrusted origin', async () => {
    const server = app.getHttpServer() as Parameters<typeof request>[0]
    const response = await request(server)
      .put('/csrf-resource')
      .set('Origin', 'https://attacker.invalid')
      .set('X-Requested-With', 'XMLHttpRequest')
      .set('Cookie', 'its_access=opaque')
      .expect(403)

    expect(response.body).toMatchObject({ code: 'CSRF_VALIDATION_FAILED' })
    expect(response.headers['access-control-allow-origin']).toBeUndefined()
  })
})
