import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import {
  productionImageSignerIdentity,
  productionImages,
  validateProductionImageReferences
} from '../../infrastructure/validate-production-images.mjs'
import {
  resolveProductionComposeCommand,
  runProductionComposeAction
} from '../../infrastructure/production-compose.mjs'

const developmentCompose = readFileSync(
  new URL('../../infrastructure/compose.development.yaml', import.meta.url),
  'utf8'
)
const productionCompose = readFileSync(
  new URL('../../infrastructure/compose.production.yaml', import.meta.url),
  'utf8'
)
const productionBuildCompose = readFileSync(
  new URL(
    '../../infrastructure/compose.production.build.yaml',
    import.meta.url
  ),
  'utf8'
)
const productionRunbook = readFileSync(
  new URL('../../docs/operations/PRODUCTION_RUNBOOK.md', import.meta.url),
  'utf8'
)
const publishWorkflow = readFileSync(
  new URL('../../.github/workflows/publish-images.yaml', import.meta.url),
  'utf8'
)

function serviceBlockIn(composeText, name) {
  const lines = composeText.split(/\r?\n/u)
  const start = lines.findIndex((line) => line === `  ${name}:`)
  assert.notEqual(start, -1, `${name} service must exist`)
  const nextService = lines.findIndex(
    (line, index) => index > start && /^\x20{2}[\w-]+:\s*$/u.test(line)
  )
  return lines
    .slice(start, nextService === -1 ? undefined : nextService)
    .join('\n')
}

function serviceBlock(name) {
  return serviceBlockIn(developmentCompose, name)
}

test('development Redis port is bound to loopback only', () => {
  const serviceLines = developmentCompose.split(/\r?\n/u)
  const redisStart = serviceLines.findIndex((line) => line === '  redis:')
  assert.notEqual(redisStart, -1, 'Redis service must exist')
  const nextService = serviceLines.findIndex(
    (line, index) => index > redisStart && /^\x20{2}[\w-]+:\s*$/u.test(line)
  )
  assert.notEqual(nextService, -1, 'Redis service must have a boundary')

  const redisService = serviceLines.slice(redisStart, nextService)
  const redisPort = redisService.find((line) => line.includes('6380:6379'))

  assert.equal(redisPort?.trim(), "- '127.0.0.1:6380:6379'")
})

test('full-stack startup waits for service readiness', () => {
  assert.match(
    serviceBlock('mailpit'),
    /test: \['CMD', '\/mailpit', 'readyz'\]/u
  )
  assert.match(serviceBlock('api'), /mailpit:\s+condition: service_healthy/u)
  assert.match(serviceBlock('worker'), /api:\s+condition: service_healthy/u)
  assert.match(serviceBlock('worker'), /\/health\/ready/u)
  assert.match(serviceBlock('web'), /api:\s+condition: service_healthy/u)
  assert.match(serviceBlock('api'), /api\/v2\/health\/ready/u)
  assert.match(serviceBlock('web'), /127\.0\.0\.1:8080/u)
})

test('MinIO bucket initialization has a bounded readiness wait', () => {
  const minioInit = serviceBlock('minio-init')
  assert.match(minioInit, /attempt=\$\$\(\(attempt \+ 1\)\)/u)
  assert.match(minioInit, /\[ "\$\$attempt" -ge 60 \]/u)
  assert.match(minioInit, /exit 1/u)
  assert.match(minioInit, /mc mb --ignore-existing/u)
})

test('production web/API ports default to loopback and worker has no host port', () => {
  assert.match(
    serviceBlockIn(productionCompose, 'api'),
    /- '\$\{API_BIND_ADDRESS:-127\.0\.0\.1\}:\$\{API_PORT:-8081\}:8081'/u
  )
  assert.match(
    serviceBlockIn(productionCompose, 'web'),
    /- '\$\{WEB_BIND_ADDRESS:-127\.0\.0\.1\}:\$\{WEB_PORT:-8080\}:8080'/u
  )
  assert.doesNotMatch(
    serviceBlockIn(productionCompose, 'worker'),
    /^\s{4}ports:/mu
  )
})

test('production runtime consumes digest-pinned images and cannot build', () => {
  for (const [service, variable] of [
    ['api', 'API_IMAGE'],
    ['worker', 'WORKER_IMAGE'],
    ['web', 'WEB_IMAGE']
  ]) {
    const block = serviceBlockIn(productionCompose, service)
    assert.match(
      block,
      new RegExp(`^    image: ['"]?\\$\\{${variable}:\\?`, 'mu')
    )
    assert.doesNotMatch(block, /^\s{4}build:/mu)
  }
})

test('production image validator rejects missing and mutable references without echoing values', () => {
  const digest = 'a'.repeat(64)
  const validReferences = Object.fromEntries(
    Object.entries(productionImages).map(([variable, repository]) => [
      variable,
      `${repository}@sha256:${digest}`
    ])
  )

  assert.deepEqual(validateProductionImageReferences(validReferences), [])

  const rejectedReferences = {
    ...validReferences,
    API_IMAGE: 'ghcr.io/untrusted/api@sha256:' + digest,
    WORKER_IMAGE: '',
    WEB_IMAGE: undefined
  }
  const errors = validateProductionImageReferences(rejectedReferences)

  assert.deepEqual(
    errors.map((error) => error.split(' ')[0]),
    ['API_IMAGE', 'WORKER_IMAGE', 'WEB_IMAGE']
  )
  assert.doesNotMatch(errors.join('\n'), /untrusted/u)
})

test('production runtime wrapper validates refs and fixes safe Compose actions', () => {
  const digest = 'd'.repeat(64)
  const environment = Object.fromEntries(
    Object.entries(productionImages).map(([variable, repository]) => [
      variable,
      `${repository}@sha256:${digest}`
    ])
  )
  const composePrefix = [
    'compose',
    '--env-file',
    '.env.production',
    '-f',
    'infrastructure/compose.production.yaml'
  ]

  assert.deepEqual(
    resolveProductionComposeCommand('config', environment).args,
    [...composePrefix, 'config', '--quiet']
  )
  assert.deepEqual(resolveProductionComposeCommand('pull', environment).args, [
    ...composePrefix,
    'pull'
  ])
  assert.deepEqual(resolveProductionComposeCommand('up', environment).args, [
    ...composePrefix,
    'up',
    '-d',
    '--no-build'
  ])

  const invalidCommand = resolveProductionComposeCommand('up', {
    ...environment,
    API_IMAGE: 'ghcr.io/untrusted/api:release'
  })
  assert.equal(invalidCommand.args, undefined)
  assert.match(invalidCommand.error, /API_IMAGE/u)
  assert.doesNotMatch(invalidCommand.error, /untrusted|release/u)
  assert.equal(
    resolveProductionComposeCommand('build', environment).args,
    undefined
  )
  assert.equal(
    resolveProductionComposeCommand('constructor', environment).args,
    undefined
  )
})

test('Production pull and up verify all trusted image signatures before Compose', () => {
  const digest = 'e'.repeat(64)
  const environment = Object.fromEntries(
    Object.entries(productionImages).map(([variable, repository]) => [
      variable,
      `${repository}@sha256:${digest}`
    ])
  )
  const calls = []
  const result = runProductionComposeAction(
    'pull',
    environment,
    (file, args, options) => {
      calls.push({ file, args, options })
      return { status: 0 }
    }
  )

  assert.deepEqual(result, {
    status: 0
  })
  assert.equal(calls.length, 4)
  for (const [index, [variable, image]] of Object.entries(
    environment
  ).entries()) {
    assert.equal(calls[index].file, 'cosign')
    assert.deepEqual(calls[index].args, [
      'verify',
      '--certificate-identity',
      productionImageSignerIdentity,
      '--certificate-oidc-issuer',
      'https://token.actions.githubusercontent.com',
      image
    ])
    assert.equal(calls[index].options.stdio, 'ignore')
    assert.equal(calls[index].args.at(-1), environment[variable])
  }
  assert.equal(calls.at(-1).file, 'docker')
  assert.deepEqual(calls.at(-1).args, [
    'compose',
    '--env-file',
    '.env.production',
    '-f',
    'infrastructure/compose.production.yaml',
    'pull'
  ])
})

test('Production release refuses Compose if any signature is untrusted', () => {
  const digest = 'f'.repeat(64)
  const environment = Object.fromEntries(
    Object.entries(productionImages).map(([variable, repository]) => [
      variable,
      `${repository}@sha256:${digest}`
    ])
  )
  const calls = []
  const result = runProductionComposeAction('up', environment, (file, args) => {
    calls.push({ file, args })
    return {
      status: file === 'cosign' && args.at(-1) === environment.WEB_IMAGE ? 1 : 0
    }
  })

  assert.match(result.error, /WEB_IMAGE/u)
  assert.equal(calls.length, 3)
  assert.equal(
    calls.some((call) => call.file === 'docker'),
    false
  )
})

test('production release workflow is manually gated and signs only scanned main-branch images', () => {
  assert.match(publishWorkflow, /^on:\n\x20{2}workflow_dispatch:/mu)
  assert.match(publishWorkflow, /^permissions: \{\}$/mu)
  assert.match(publishWorkflow, /confirm_publish:[\s\S]*default: false/u)
  assert.match(publishWorkflow, /needs: \[quality, security\]/u)
  assert.match(publishWorkflow, /gitleaks\/gitleaks-action@[a-f0-9]{40}/u)
  assert.match(publishWorkflow, /github\/codeql-action\/analyze@[a-f0-9]{40}/u)
  assert.match(
    publishWorkflow,
    /if: github\.ref == 'refs\/heads\/main' && inputs\.confirm_publish/u
  )
  assert.match(publishWorkflow, /environment:\n\s+name: production-images/u)
  assert.match(
    publishWorkflow,
    /permissions:\n\s+contents: read\n\s+packages: write\n\s+id-token: write/u
  )
  assert.match(publishWorkflow, /provenance: mode=max/u)
  assert.match(publishWorkflow, /sbom: true/u)
  assert.match(publishWorkflow, /severity: HIGH,CRITICAL[\s\S]*exit-code: '1'/u)
  assert.ok(
    publishWorkflow.indexOf('name: Scan exact candidate digest') <
      publishWorkflow.indexOf('name: Sign and verify the scanned digest')
  )
  assert.match(
    publishWorkflow,
    /SIGNER_IDENTITY: https:\/\/github\.com\/Napus-BackendDev\/MFU_Internship_System\/\.github\/workflows\/publish-images\.yaml@refs\/heads\/main/u
  )
  assert.doesNotMatch(publishWorkflow, /^\s{2}(?:push|pull_request):/mu)
  for (const action of publishWorkflow.matchAll(/^\s+uses: ([^\s]+)$/gmu)) {
    assert.match(action[1], /@[a-f0-9]{40}(?:\s|$)/u)
  }
})

test('optional production build manifest is separate and never defines runtime secrets', () => {
  for (const [service, dockerfile] of [
    ['api', 'Dockerfile.api'],
    ['worker', 'Dockerfile.worker'],
    ['web', 'Dockerfile.web']
  ]) {
    const block = serviceBlockIn(productionBuildCompose, service)
    assert.match(block, /image: \$\{IMAGE_PREFIX:\?/u)
    assert.match(
      block,
      new RegExp(`dockerfile: infrastructure/docker/${dockerfile}`, 'u')
    )
    assert.match(block, /^\x20{4}build:/mu)
  }

  assert.doesNotMatch(
    productionBuildCompose,
    /^\s{4}(?:MONGODB_URI|AUTH_JWT_SECRET|SMTP_PASSWORD|S3_SECRET_ACCESS_KEY):/mu
  )
})

test('production Compose requires identity, mail, database, and storage secrets', () => {
  for (const variable of [
    'MONGODB_URI',
    'OIDC_ISSUER_URL',
    'OIDC_CLIENT_SECRET',
    'SMTP_PASSWORD',
    'S3_SECRET_ACCESS_KEY'
  ]) {
    assert.match(
      productionCompose,
      new RegExp(`^\\s{2}${variable}: \\$\\{${variable}:\\?`, 'mu'),
      `${variable} must be required, not silently defaulted`
    )
  }

  assert.match(productionCompose, /^\s{2}AUTH_MODE: oidc$/mu)
  assert.match(productionCompose, /^\s{2}COOKIE_SECURE: 'true'$/mu)
  assert.match(productionCompose, /^\s{2}MAIL_DELIVERY_MODE: smtp$/mu)
})

test('production runbook validates Compose without printing resolved secrets', () => {
  assert.match(
    productionRunbook,
    /production-compose\.mjs config[\s\S]*production-compose\.mjs pull[\s\S]*production-compose\.mjs up[\s\S]*production-compose\.mjs ps/u
  )
  assert.match(
    readFileSync(
      new URL('../../infrastructure/production-compose.mjs', import.meta.url),
      'utf8'
    ),
    /config: \['config', '--quiet'\][\s\S]*up: \['up', '-d', '--no-build'\]/u
  )
  assert.doesNotMatch(productionRunbook, /^docker compose .*\bconfig\b/mu)
  assert.match(
    productionRunbook,
    /Never run plain `docker compose \.\.\. config` with Production environment values/u
  )
  assert.match(
    productionRunbook,
    /publish-images\.yaml[\s\S]*BuildKit max-level provenance and SBOM/u
  )
  assert.match(
    productionRunbook,
    /Before `pull` or `up`, it verifies each image signature against the pinned `publish-images\.yaml` workflow identity/u
  )
})

test('production smoke runbook gates CSP and HSTS on edge and staging review', () => {
  assert.match(
    productionRunbook,
    /verify browser security headers at the public TLS origin[\s\S]*Content Security Policy[\s\S]*Nuxt SSR hydration[\s\S]*Report-Only first/u
  )
  assert.match(
    productionRunbook,
    /Do not add `unsafe-inline` or `unsafe-eval`/u
  )
  assert.match(
    productionRunbook,
    /HSTS and any subdomain\/preload policy require an explicit TLS-topology review and rollback approval/u
  )
})
