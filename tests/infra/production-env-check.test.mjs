import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'

const validProduction = {
  PORT: '8081',
  MONGODB_URI: 'mongodb+srv://app:secret-value@cluster.example.com/internship',
  REDIS_URL: 'rediss://:secret-value@redis.example.com:6380',
  PUBLIC_WEB_URL: 'https://internship.example.com',
  NUXT_PUBLIC_API_BASE_URL: 'https://internship.example.com/api/v2',
  API_INTERNAL_BASE_URL: 'http://api:8081/api/v2',
  CORS_ORIGINS: 'https://internship.example.com',
  AUTH_MODE: 'oidc',
  AUTH_JWT_SECRET: 'a'.repeat(48),
  INVITATION_TOKEN_PEPPER: 'b'.repeat(48),
  ACCESS_TOKEN_TTL_SECONDS: '900',
  REFRESH_TOKEN_TTL_SECONDS: '86400',
  COOKIE_SECURE: 'true',
  OIDC_ISSUER_URL: 'https://sso.example.com',
  OIDC_CLIENT_ID: 'internship-client',
  OIDC_CLIENT_SECRET: 'client-secret-value',
  OIDC_REDIRECT_URI: 'https://internship.example.com/api/v2/auth/callback',
  MAIL_DELIVERY_MODE: 'smtp',
  SMTP_HOST: 'smtp.example.com',
  SMTP_PORT: '587',
  SMTP_SECURE: 'false',
  SMTP_USER: 'mailer',
  SMTP_PASSWORD: 'smtp-secret-value',
  SMTP_FROM: 'Internship <no-reply@example.com>',
  SMTP_SETTINGS_ENCRYPTION_KEY: 'c'.repeat(64),
  S3_ENDPOINT: 'https://s3.example.com',
  S3_REGION: 'ap-southeast-1',
  S3_BUCKET: 'internship-prod',
  S3_ACCESS_KEY_ID: 'access-key-value',
  S3_SECRET_ACCESS_KEY: 'secret-key-value',
  S3_FORCE_PATH_STYLE: 'false'
}

function check(overrides) {
  const dir = mkdtempSync(join(tmpdir(), 'prod-env-'))
  try {
    const file = join(dir, '.env.production.test')
    const body = Object.entries({ ...validProduction, ...overrides })
      .map(([key, value]) => `${key}=${value}`)
      .join('\n')
    writeFileSync(file, body)
    return spawnSync(
      process.execPath,
      ['scripts/check-production-env.mjs', file],
      { encoding: 'utf8' }
    )
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}

test('accepts a complete HTTPS/TLS/OIDC production configuration', () => {
  const result = check({})
  assert.equal(result.status, 0, result.stderr)
  assert.match(result.stdout, /^OK:/u)
})

test('rejects localhost services, plaintext transport and capture mail', () => {
  for (const [name, overrides] of [
    [
      'localhost mongo',
      { MONGODB_URI: 'mongodb://localhost:27017/x?tls=true' }
    ],
    ['plaintext redis', { REDIS_URL: 'redis://redis.example.com:6379' }],
    ['http s3', { S3_ENDPOINT: 'http://s3.example.com' }],
    ['capture mail', { MAIL_DELIVERY_MODE: 'capture' }],
    ['dev auth', { AUTH_MODE: 'development' }],
    ['insecure cookie', { COOKIE_SECURE: 'false' }]
  ]) {
    const result = check(overrides)
    assert.notEqual(result.status, 0, `${name} must fail`)
  }
})

test('never prints secret values in its output', () => {
  const result = check({
    REDIS_URL: 'redis://:super-secret-redis@redis.example.com:6379'
  })
  assert.notEqual(result.status, 0)
  assert.doesNotMatch(result.stdout + result.stderr, /super-secret-redis/u)
})
