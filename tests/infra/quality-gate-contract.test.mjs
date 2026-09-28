import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { ESLint } from 'eslint'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'
import { resolve } from 'node:path'

const workspaceRoot = fileURLToPath(new URL('../../', import.meta.url))
const ciWorkflow = readFileSync(
  resolve(workspaceRoot, '.github/workflows/ci.yaml'),
  'utf8'
)

function runNodeScript(relativePath, args) {
  const result = spawnSync(
    process.execPath,
    [resolve(workspaceRoot, relativePath), ...args],
    {
      cwd: workspaceRoot,
      encoding: 'utf8',
      timeout: 30_000
    }
  )

  assert.equal(result.error, undefined, result.error?.message)
  return result
}

test('Nuxt Web ESLint preserves shared typed-safety rules', async () => {
  const webRoot = resolve(workspaceRoot, 'apps/web')
  const sourceFile = resolve(webRoot, 'app/utils/cycle-assignment.ts')
  const sharedEslint = new ESLint({
    cwd: workspaceRoot,
    overrideConfigFile: resolve(workspaceRoot, 'eslint.config.mjs')
  })
  const webEslint = new ESLint({
    cwd: webRoot,
    overrideConfigFile: resolve(webRoot, 'eslint.config.mjs')
  })
  const [sharedConfig, webConfig, vueConfig] = await Promise.all([
    sharedEslint.calculateConfigForFile(sourceFile),
    webEslint.calculateConfigForFile(sourceFile),
    webEslint.calculateConfigForFile(resolve(webRoot, 'app/layouts/public.vue'))
  ])

  assert.ok(sharedConfig)
  assert.ok(webConfig)
  for (const rule of [
    '@typescript-eslint/explicit-function-return-type',
    '@typescript-eslint/no-explicit-any',
    '@typescript-eslint/no-floating-promises',
    '@typescript-eslint/no-misused-promises'
  ]) {
    assert.deepEqual(webConfig.rules[rule], sharedConfig.rules[rule], rule)
  }

  assert.ok(vueConfig)
  for (const rule of [
    '@typescript-eslint/no-explicit-any',
    '@typescript-eslint/no-floating-promises',
    '@typescript-eslint/no-misused-promises'
  ]) {
    assert.deepEqual(vueConfig.rules[rule], sharedConfig.rules[rule], rule)
  }
  assert.equal(vueConfig.languageOptions.parserOptions.projectService, true)
  assert.ok(
    vueConfig.languageOptions.parserOptions.extraFileExtensions.includes('.vue')
  )
})

test('configured ESLint rejects an intentional lint violation', () => {
  const result = runNodeScript('node_modules/eslint/bin/eslint.js', [
    '--no-ignore',
    '--config',
    'eslint.config.mjs',
    'apps/api/test/fixtures/quality-gates/lint-failure.ts'
  ])
  const output = `${result.stdout}\n${result.stderr}`

  assert.equal(result.status, 1, output)
  assert.match(output, /(?:@typescript-eslint\/)?no-unused-vars/u)
})

test('TypeScript rejects an intentional type error', () => {
  const result = runNodeScript('node_modules/typescript/bin/tsc', [
    '--noEmit',
    '--strict',
    '--skipLibCheck',
    'tests/fixtures/quality-gates/typecheck-failure.ts'
  ])
  const output = `${result.stdout}\n${result.stderr}`

  assert.equal(result.status, 2, output)
  assert.match(output, /TS2322/u)
})

test('CI supplies supported Redis to BullMQ recovery integration tests', () => {
  assert.match(ciWorkflow, /image:\s*redis:8\.0\.5-alpine/u)
  assert.match(ciWorkflow, /TEST_REDIS_URL:\s*redis:\/\/127\.0\.0\.1:6379/u)
  assert.match(ciWorkflow, /run:\s*pnpm verify/u)

  for (const testPath of [
    'apps/api/test/auth-rate-limit.redis.integration.test.ts',
    'apps/worker/test/bullmq-redis.integration.test.ts',
    'apps/api/test/worker-recovery.mongo-redis.integration.test.ts',
    'apps/api/test/report-export-recovery.mongo-redis.integration.test.ts'
  ]) {
    const source = readFileSync(resolve(workspaceRoot, testPath), 'utf8')
    assert.match(source, /process\.env\.CI === 'true' && !testRedisUrl/u)
    assert.match(source, /describe\.skipIf\(!testRedisUrl\)/u)
  }
})
