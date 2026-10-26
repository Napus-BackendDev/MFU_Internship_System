// Validates a Production env file with the same rules the API and worker enforce at startup,
// so the owner can catch placeholders / localhost / non-TLS values before deploying.
// Usage: node scripts/check-production-env.mjs <path-to-env-file>
// Secret values are never printed.
import { readFileSync } from 'node:fs'
import { parseEnv } from 'node:util'

const file = process.argv[2]
if (!file) {
  console.error('Usage: node scripts/check-production-env.mjs <env-file>')
  process.exit(2)
}

const { loadEnvironment } = await import('../packages/config/dist/index.js')
const values = parseEnv(readFileSync(file, 'utf8'))
const source = { ...values, NODE_ENV: 'production' }

try {
  loadEnvironment(source)
  console.log(`OK: ${file} satisfies the Production configuration rules.`)
} catch (error) {
  const issues =
    error && typeof error === 'object' && 'issues' in error
      ? error.issues.map(
          (issue) => `${issue.path.join('.') || '(root)'}: ${issue.message}`
        )
      : [error instanceof Error ? error.message : String(error)]
  console.error(`FAIL: ${file} is not production-ready:`)
  for (const issue of issues) console.error(` - ${issue}`)
  process.exit(1)
}
