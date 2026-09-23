import { fileURLToPath } from 'node:url'

import { defineConfig } from 'vitest/config'

export default defineConfig({
  resolve: {
    alias: {
      '@internship/config': fileURLToPath(
        new URL('../../packages/config/src/index.ts', import.meta.url)
      ),
      '@internship/shared-types': fileURLToPath(
        new URL('../../packages/shared-types/src/index.ts', import.meta.url)
      )
    }
  },
  test: {
    environment: 'node',
    include: ['test/**/*.test.ts']
  }
})
