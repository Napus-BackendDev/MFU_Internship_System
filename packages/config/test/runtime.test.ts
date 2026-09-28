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

const productionEnvironment = {
  ...developmentEnvironment,
  NODE_ENV: 'production',
  MONGODB_URI: 'mongodb+srv://db.example.test/internship',
  REDIS_URL: 'rediss://cache.example.test',
  PUBLIC_WEB_URL: 'https://app.example.test',
  NUXT_PUBLIC_API_BASE_URL: 'https://api.example.test/api/v2',
  AUTH_MODE: 'oidc',
  AUTH_JWT_SECRET: 'production-jwt-secret-value-with-at-least-32-characters',
  INVITATION_TOKEN_PEPPER:
    'production-invitation-pepper-value-with-at-least-32-characters',
  OIDC_ISSUER_URL: 'https://identity.example.test',
  OIDC_CLIENT_ID: 'internship-production',
  OIDC_CLIENT_SECRET: 'production-oidc-secret',
  OIDC_REDIRECT_URI: 'https://api.example.test/api/v2/auth/callback',
  COOKIE_SECURE: 'true',
  CORS_ORIGINS: 'https://app.example.test',
  MAIL_DELIVERY_MODE: 'smtp',
  SMTP_HOST: 'smtp.example.test',
  SMTP_PORT: '465',
  SMTP_SECURE: 'true',
  SMTP_USER: 'internship@example.test',
  SMTP_PASSWORD: 'production-smtp-password',
  SMTP_FROM: 'Internship <no-reply@example.test>',
  S3_ENDPOINT: 'https://storage.example.test',
  S3_REGION: 'ap-southeast-1',
  S3_BUCKET: 'internship-production',
  S3_ACCESS_KEY_ID: 'production-access-key',
  S3_SECRET_ACCESS_KEY: 'production-storage-secret'
}

describe('runtime baseline', () => {
  it('rejects a runtime outside Node.js 24', () => {
    expect(() => assertSupportedNodeRuntime('22.0.0')).toThrow(
      'Unsupported Node.js runtime'
    )
  })

  it('accepts a local-only development environment', () => {
    const environment = loadEnvironment(developmentEnvironment)
    expect(environment.corsOrigins).toEqual(['http://localhost:8080'])
    expect(environment.WORKER_HEALTH_PORT).toBe(8082)
  })

  it.each([
    ['MONGODB_URI', 'https://localhost:27017/internship'],
    ['REDIS_URL', 'https://localhost:6379']
  ])('rejects a non-service URL scheme for %s', (key, value) => {
    expect(() =>
      loadEnvironment({ ...developmentEnvironment, [key]: value })
    ).toThrow(`${key} must use a supported service URL scheme.`)
  })

  it('requires JWT signing and invitation PIN secrets to be independent', () => {
    expect(() =>
      loadEnvironment({
        ...developmentEnvironment,
        INVITATION_TOKEN_PEPPER: developmentEnvironment.AUTH_JWT_SECRET
      })
    ).toThrow('AUTH_JWT_SECRET and INVITATION_TOKEN_PEPPER must be different.')
  })

  it('validates the worker health port', () => {
    expect(
      loadEnvironment({
        ...developmentEnvironment,
        WORKER_HEALTH_PORT: '8182'
      }).WORKER_HEALTH_PORT
    ).toBe(8182)
    expect(() =>
      loadEnvironment({
        ...developmentEnvironment,
        WORKER_HEALTH_PORT: '70000'
      })
    ).toThrow()
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

  it('rejects a development MongoDB seed list containing any remote host', () => {
    expect(() =>
      loadEnvironment({
        ...developmentEnvironment,
        MONGODB_URI:
          'mongodb://localhost:27017,db.example.invalid:27017/internship'
      })
    ).toThrow('Development MONGODB_URI must use localhost')
  })

  it('rejects malformed MongoDB URIs without echoing credentials', () => {
    const secret = 'synthetic-only-password'
    let caught: unknown

    try {
      loadEnvironment({
        ...developmentEnvironment,
        MONGODB_URI: `mongodb://${secret}@/internship`
      })
    } catch (error) {
      caught = error
    }

    expect(caught).toBeInstanceOf(Error)
    expect(String(caught)).toContain('MONGODB_URI must be a valid MongoDB')
    expect(String(caught)).not.toContain(secret)
  })

  it('accepts a loopback IPv6 MongoDB endpoint for Development', () => {
    expect(
      loadEnvironment({
        ...developmentEnvironment,
        MONGODB_URI: 'mongodb://[::1]:27017/internship_transcript_v2_dev'
      }).MONGODB_URI
    ).toBe('mongodb://[::1]:27017/internship_transcript_v2_dev')
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

  it('accepts a complete production configuration with an email display name', () => {
    expect(loadEnvironment(productionEnvironment).SMTP_FROM).toBe(
      'Internship <no-reply@example.test>'
    )
  })

  it('accepts a valid TLS-enabled Production MongoDB seed list', () => {
    const mongoUri =
      'mongodb://user:encoded%40password@db1.example.test:27017,db2.example.test:27018/internship?replicaSet=rs0&tls=true'

    expect(
      loadEnvironment({
        ...productionEnvironment,
        MONGODB_URI: mongoUri
      }).MONGODB_URI
    ).toBe(mongoUri)
  })

  it('rejects a Production MongoDB seed list containing any loopback host', () => {
    expect(() =>
      loadEnvironment({
        ...productionEnvironment,
        MONGODB_URI:
          'mongodb://db.example.test:27017,127.0.0.1:27018/internship?tls=true'
      })
    ).toThrow('Production data services must not use localhost')
  })

  it('requires TLS for standard Production MongoDB connection strings', () => {
    expect(() =>
      loadEnvironment({
        ...productionEnvironment,
        MONGODB_URI: 'mongodb://db.example.test/internship'
      })
    ).toThrow(
      'Production MongoDB connection must use TLS with certificate validation.'
    )

    expect(
      loadEnvironment({
        ...productionEnvironment,
        MONGODB_URI: 'mongodb://db.example.test/internship?tls=true'
      }).MONGODB_URI
    ).toBe('mongodb://db.example.test/internship?tls=true')

    expect(
      loadEnvironment({
        ...productionEnvironment,
        MONGODB_URI: 'mongodb://db.example.test/internship?ssl=true'
      }).MONGODB_URI
    ).toBe('mongodb://db.example.test/internship?ssl=true')
  })

  it.each(['tls=false', 'ssl=false'])(
    'rejects an SRV Production MongoDB URI that explicitly disables TLS with %s',
    (option) => {
      expect(() =>
        loadEnvironment({
          ...productionEnvironment,
          MONGODB_URI: `mongodb+srv://db.example.test/internship?${option}`
        })
      ).toThrow(
        'Production MongoDB connection must use TLS with certificate validation.'
      )
    }
  )

  it.each([
    'tlsInsecure=true',
    'tlsAllowInvalidCertificates=true',
    'TLSALLOWINVALIDHOSTNAMES=TRUE'
  ])('rejects Production MongoDB TLS validation bypass %s', (option) => {
    expect(() =>
      loadEnvironment({
        ...productionEnvironment,
        MONGODB_URI: `mongodb+srv://db.example.test/internship?${option}`
      })
    ).toThrow(
      'Production MongoDB connection must use TLS with certificate validation.'
    )
  })

  it('requires TLS for Production Redis and HTTPS for Production S3', () => {
    expect(() =>
      loadEnvironment({
        ...productionEnvironment,
        REDIS_URL: 'redis://cache.example.test'
      })
    ).toThrow('Production Redis connection must use TLS.')

    expect(() =>
      loadEnvironment({
        ...productionEnvironment,
        S3_ENDPOINT: 'http://storage.example.test'
      })
    ).toThrow('Production S3 endpoint must use HTTPS.')
  })

  it.each([
    ['PUBLIC_WEB_URL', 'https://localhost:8080'],
    ['NUXT_PUBLIC_API_BASE_URL', 'https://127.0.0.1/api/v2'],
    ['OIDC_ISSUER_URL', 'https://[::1]'],
    ['OIDC_REDIRECT_URI', 'https://localhost/api/v2/auth/callback'],
    ['S3_ENDPOINT', 'https://localhost:9000']
  ])('rejects a Production %s that points to loopback', (key, value) => {
    expect(() =>
      loadEnvironment({
        ...productionEnvironment,
        [key]: value
      })
    ).toThrow('Production endpoints must not use localhost.')
  })

  it.each([
    [
      'http://app.example.test',
      'Production CORS_ORIGINS must contain exact HTTPS origins without localhost.'
    ],
    [
      'https://localhost:8080',
      'Production CORS_ORIGINS must contain exact HTTPS origins without localhost.'
    ],
    [
      'https://app.example.test/portal',
      'Production CORS_ORIGINS must contain exact HTTPS origins without localhost.'
    ],
    [
      '*',
      'Production CORS_ORIGINS must contain exact HTTPS origins without localhost.'
    ]
  ])(
    'rejects insecure or non-origin Production CORS value %s',
    (value, message) => {
      expect(() =>
        loadEnvironment({
          ...productionEnvironment,
          CORS_ORIGINS: value
        })
      ).toThrow(message)
    }
  )

  it.each([
    ['OIDC_ISSUER_URL', 'http://identity.example.test'],
    ['OIDC_REDIRECT_URI', 'http://api.example.test/api/v2/auth/callback']
  ])('rejects a non-HTTPS production %s', (key, value) => {
    expect(() =>
      loadEnvironment({
        ...productionEnvironment,
        [key]: value
      })
    ).toThrow('Production OIDC URLs must use HTTPS.')
  })

  it.each([
    ['OIDC_CLIENT_SECRET', '<SET_OIDC_CLIENT_SECRET>'],
    ['SMTP_PASSWORD', 'CHANGE_ME'],
    ['S3_BUCKET', 'CHANGE_ME_BUCKET']
  ])('rejects unresolved production placeholder in %s', (key, value) => {
    expect(() =>
      loadEnvironment({
        ...productionEnvironment,
        [key]: value
      })
    ).toThrow('Production configuration contains an unresolved placeholder.')
  })
})
