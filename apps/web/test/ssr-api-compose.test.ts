import { readFileSync } from 'node:fs'

import { describe, expect, it } from 'vitest'

const composeFiles = [
  ['Production', '../../../infrastructure/compose.production.yaml'],
  ['Development full-stack', '../../../infrastructure/compose.development.yaml']
] as const

function serviceBlock(source: string, serviceName: string): string {
  const lines = source.split(/\r?\n/u)
  const start = lines.findIndex((line) => line === `  ${serviceName}:`)
  if (start < 0) return ''

  const end = lines.findIndex(
    (line, index) =>
      index > start &&
      line.length - line.trimStart().length === 2 &&
      /^[\w-]+:\s*$/u.test(line.trim())
  )
  return lines.slice(start, end < 0 ? undefined : end).join('\n')
}

describe('SSR internal API deployment wiring', () => {
  it.each(composeFiles)(
    '%s routes Nuxt server requests to the API service',
    (_environment, composePath) => {
      const compose = readFileSync(
        new URL(composePath, import.meta.url),
        'utf8'
      )

      expect(serviceBlock(compose, 'web')).toContain(
        '      NUXT_API_INTERNAL_BASE_URL: http://api:8081/api/v2'
      )
    }
  )
})
