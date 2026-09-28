import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: './tests/e2e',
  testMatch: '**/*.spec.ts',
  fullyParallel: true,
  workers: 1,
  forbidOnly: Boolean(process.env.CI),
  retries: 0,
  reporter: 'line',
  outputDir: './test-results/playwright',
  use: {
    baseURL: 'http://127.0.0.1:18080',
    browserName: 'chromium',
    headless: true,
    trace: 'retain-on-failure'
  },
  webServer: [
    {
      command: 'node tests/e2e/mock-api-server.mjs',
      url: 'http://127.0.0.1:18081/healthz',
      reuseExistingServer: !process.env.CI,
      timeout: 30_000
    },
    {
      command:
        'pnpm --filter @internship/web exec nuxt dev --host 127.0.0.1 --port 18080',
      url: 'http://127.0.0.1:18080/evaluate',
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
      env: {
        NODE_ENV: 'development',
        NUXT_PUBLIC_API_BASE_URL: 'http://127.0.0.1:18081/api/v2',
        API_INTERNAL_BASE_URL: 'http://127.0.0.1:18081/api/v2',
        NUXT_IGNORE_LOCK: '1'
      }
    }
  ]
})
