import { z } from 'zod'

export {
  decryptSmtpSecret,
  encryptSmtpSecret,
  parseSmtpSettingsEncryptionKey,
  type EncryptedSmtpSecret
} from './smtp-secret.js'

export const RUNTIME_BASELINE = Object.freeze({
  nodeMajor: 24,
  timezone: 'Asia/Bangkok'
})

export function assertSupportedNodeRuntime(version: string): void {
  const major = Number(version.split('.')[0])

  if (major !== RUNTIME_BASELINE.nodeMajor) {
    throw new Error(
      `Unsupported Node.js runtime. Expected ${RUNTIME_BASELINE.nodeMajor}.x, received ${version}.`
    )
  }
}

const booleanString = z
  .enum(['true', 'false'])
  .transform((value) => value === 'true')

const environmentSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']),
  CONTAINERIZED: booleanString.default(false),
  PORT: z.coerce.number().int().min(1).max(65_535).default(8081),
  MONGODB_URI: z.url(),
  REDIS_URL: z.url(),
  PUBLIC_WEB_URL: z.url(),
  NUXT_PUBLIC_API_BASE_URL: z.url(),
  AUTH_MODE: z.enum(['development', 'oidc']),
  AUTH_JWT_SECRET: z.string().min(32),
  INVITATION_TOKEN_PEPPER: z.string().min(32),
  ACCESS_TOKEN_TTL_SECONDS: z.coerce
    .number()
    .int()
    .min(300)
    .max(3600)
    .default(900),
  REFRESH_TOKEN_TTL_SECONDS: z.coerce
    .number()
    .int()
    .min(3600)
    .max(604_800)
    .default(28_800),
  OIDC_ISSUER_URL: z.url().optional(),
  OIDC_CLIENT_ID: z.string().min(1).optional(),
  OIDC_CLIENT_SECRET: z.string().min(1).optional(),
  OIDC_REDIRECT_URI: z.url().optional(),
  COOKIE_SECURE: booleanString.default(false),
  CORS_ORIGINS: z.string().min(1),
  MAIL_DELIVERY_MODE: z.enum(['capture', 'smtp']),
  SMTP_HOST: z.string().min(1),
  SMTP_PORT: z.coerce.number().int().min(1).max(65_535),
  SMTP_SECURE: booleanString.default(false),
  SMTP_USER: z.string().optional(),
  SMTP_PASSWORD: z.string().optional(),
  SMTP_FROM: z.string().min(3),
  SMTP_SETTINGS_ENCRYPTION_KEY: z.string().regex(/^[a-fA-F0-9]{64}$/),
  S3_ENDPOINT: z.url(),
  S3_REGION: z.string().min(1),
  S3_BUCKET: z.string().min(3),
  S3_ACCESS_KEY_ID: z.string().min(1),
  S3_SECRET_ACCESS_KEY: z.string().min(8),
  S3_FORCE_PATH_STYLE: booleanString.default(true),
  LOG_LEVEL: z
    .enum(['trace', 'debug', 'info', 'warn', 'error', 'fatal'])
    .default('info')
})

export type AppEnvironment = z.infer<typeof environmentSchema> & {
  corsOrigins: readonly string[]
}

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '::1'])

function hostname(value: string): string {
  return new URL(value).hostname
}

function containsPlaceholder(value: string): boolean {
  return (
    value.includes('<') || value.includes('SET_') || value.includes('CHANGE_ME')
  )
}

function assertEnvironmentIsolation(
  environment: z.infer<typeof environmentSchema>
): void {
  if (environment.NODE_ENV === 'development') {
    if (
      !LOCAL_HOSTS.has(hostname(environment.MONGODB_URI)) &&
      !(
        environment.CONTAINERIZED &&
        hostname(environment.MONGODB_URI) === 'mongodb'
      )
    ) {
      throw new Error('Development MONGODB_URI must use localhost.')
    }

    if (environment.AUTH_MODE !== 'development') {
      throw new Error('Development AUTH_MODE must be development.')
    }

    return
  }

  if (environment.NODE_ENV !== 'production') return

  const protectedValues = [
    environment.MONGODB_URI,
    environment.REDIS_URL,
    environment.AUTH_JWT_SECRET,
    environment.INVITATION_TOKEN_PEPPER,
    environment.SMTP_SETTINGS_ENCRYPTION_KEY,
    environment.S3_ACCESS_KEY_ID,
    environment.S3_SECRET_ACCESS_KEY
  ]

  if (protectedValues.some(containsPlaceholder)) {
    throw new Error(
      'Production configuration contains an unresolved placeholder.'
    )
  }

  if (
    LOCAL_HOSTS.has(hostname(environment.MONGODB_URI)) ||
    LOCAL_HOSTS.has(hostname(environment.REDIS_URL))
  ) {
    throw new Error('Production data services must not use localhost.')
  }

  if (
    new URL(environment.PUBLIC_WEB_URL).protocol !== 'https:' ||
    new URL(environment.NUXT_PUBLIC_API_BASE_URL).protocol !== 'https:'
  ) {
    throw new Error('Production public URLs must use HTTPS.')
  }

  if (
    environment.AUTH_MODE !== 'oidc' ||
    !environment.OIDC_ISSUER_URL ||
    !environment.OIDC_CLIENT_ID ||
    !environment.OIDC_CLIENT_SECRET ||
    !environment.OIDC_REDIRECT_URI
  ) {
    throw new Error('Production requires complete OIDC configuration.')
  }

  if (!environment.COOKIE_SECURE) {
    throw new Error('Production cookies must be secure.')
  }

  if (environment.MAIL_DELIVERY_MODE !== 'smtp') {
    throw new Error('Production mail delivery mode must be smtp.')
  }
}

export function loadEnvironment(source: NodeJS.ProcessEnv): AppEnvironment {
  const environment = environmentSchema.parse(source)
  assertEnvironmentIsolation(environment)

  const corsOrigins = environment.CORS_ORIGINS.split(',')
    .map((origin) => origin.trim())
    .filter(Boolean)

  if (corsOrigins.length === 0) {
    throw new Error('At least one CORS origin is required.')
  }

  return Object.freeze({ ...environment, corsOrigins })
}
