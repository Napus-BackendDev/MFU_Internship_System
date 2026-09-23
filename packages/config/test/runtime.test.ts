import { describe, expect, it } from 'vitest'

import { assertSupportedNodeRuntime, loadEnvironment } from '../src/index.js'

const developmentEnvironment = {
  NODE_ENV: 'development',
  PORT: '8081',
  MONGODB_URI: 'mongodb://localhost:27017/internship_transcript_v2_dev',
  REDIS_URL: 'redis://localhost:6379',
  PUBLIC_WEB_URL: 'http://localhost:8080',
  NUXT_PUBLIC_API_BASE_URL: 'http://localhost:8081/api/v2',
  AUTH_MODE: 'development',
  AUTH_JWT_SECRET: 'development-only-secret-at-least-32-characters',
  INVITATION_TOKEN_PEPPER: 'development-only-pepper-at-least-32-characters',
  CORS_ORIGINS: 'http://localhost:8080',
  MAIL_DELIVERY_MODE: 'capture',
  SMTP_HOST: 'localhost',
  SMTP_PORT: '1025',
  SMTP_FROM: 'no-reply@localhost',
  SMTP_SETTINGS_ENCRYPTION_KEY:
    '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
  S3_ENDPOINT: 'http://localhost:9000',
  S3_REGION: 'ap-southeast-1',
  S3_BUCKET: 'internship-transcript-dev',
  S3_ACCESS_KEY_ID: 'minioadmin',
  S3_SECRET_ACCESS_KEY: 'minioadmin'
}

describe('runtime baseline', () => {
  it('rejects a runtime outside Node.js 24', () => {
    expect(() => assertSupportedNodeRuntime('22.0.0')).toThrow(
      'Unsupported Node.js runtime'
    )
  })

  it('accepts a local-only development environment', () => {
    expect(loadEnvironment(developmentEnvironment).corsOrigins).toEqual([
      'http://localhost:8080'
    ])
  })

  it('loads trusted proxy CIDRs only from explicit configuration', () => {
    expect(
      loadEnvironment({
        ...developmentEnvironment,
        TRUSTED_PROXY_CIDRS: '10.0.0.0/8,192.0.2.10/32'
      }).TRUSTED_PROXY_CIDRS
    ).toBe('10.0.0.0/8,192.0.2.10/32')
    expect(loadEnvironment(developmentEnvironment).TRUSTED_PROXY_CIDRS).toBe('')
  })

  it('rejects a remote development MongoDB URI', () => {
    expect(() =>
      loadEnvironment({
        ...developmentEnvironment,
        MONGODB_URI: 'mongodb+srv://example.invalid/project'
      })
    ).toThrow('Development MONGODB_URI must use localhost')
  })

  it('rejects unresolved production secrets', () => {
    expect(() =>
      loadEnvironment({
        ...developmentEnvironment,
        NODE_ENV: 'production',
        AUTH_MODE: 'oidc',
        MONGODB_URI: 'mongodb+srv://<SET_REMOTE_MONGODB>',
        REDIS_URL: 'rediss://cache.example.test',
        PUBLIC_WEB_URL: 'https://app.example.test',
        NUXT_PUBLIC_API_BASE_URL: 'https://api.example.test/api/v2',
        COOKIE_SECURE: 'true',
        MAIL_DELIVERY_MODE: 'smtp',
        OIDC_ISSUER_URL: 'https://identity.example.test',
        OIDC_CLIENT_ID: 'client',
        OIDC_CLIENT_SECRET: '<SET_CLIENT_SECRET>',
        OIDC_REDIRECT_URI: 'https://api.example.test/api/v2/auth/callback'
      })
    ).toThrow()
  })
})
