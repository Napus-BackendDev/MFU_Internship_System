import { expect, test } from '@playwright/test'

test('Web SSR serves a restrictive CSP without blocking evaluator page', async ({
  page,
  request
}) => {
  const violations: string[] = []
  page.on('console', (message) => {
    if (
      message.type() === 'error' &&
      /content security policy|violates the following/i.test(message.text())
    ) {
      violations.push(message.text())
    }
  })

  const response = await page.goto('/evaluate')
  expect(response?.status()).toBe(200)
  const headers = response?.headers() ?? {}
  const policy = headers['content-security-policy'] ?? ''
  const cacheControl = headers['cache-control'] ?? ''
  const nonce = policy.match(/script-src[^;]*'nonce-([^']+)'/)?.[1]
  const connectSource = policy.match(/(?:^|;\s*)connect-src\s+([^;]+)/)?.[1]

  expect(policy).toContain("default-src 'self'")
  expect(nonce).toBeTruthy()
  expect(policy).toContain("object-src 'none'")
  expect(policy).toContain("frame-ancestors 'none'")
  expect(policy).not.toMatch(/script-src[^;]*'unsafe-(?:inline|eval)'/)
  expect(connectSource).toBeTruthy()
  expect(connectSource).not.toMatch(/(?:^|\s)https:(?:\s|$)/)
  expect(cacheControl).toContain('private')
  expect(cacheControl).toContain('no-store')
  const inlineScriptNonces = await page
    .locator('script:not([src])')
    .evaluateAll((scripts) =>
      scripts.map((script) => ({
        type: script.getAttribute('type'),
        nonce: (script as HTMLScriptElement).nonce,
        id: script.id,
        codeLength: script.textContent?.trim().length ?? 0
      }))
    )
  const missingNonceScripts = inlineScriptNonces.filter(
    ({ type, nonce: scriptNonce, codeLength }) =>
      codeLength > 0 && type !== 'application/json' && scriptNonce !== nonce
  )
  expect(missingNonceScripts).toEqual([])
  await expect(page.locator('body')).not.toBeEmpty()
  expect(violations).toEqual([])

  const secondResponse = await request.get('/evaluate')
  const secondPolicy = secondResponse.headers()['content-security-policy'] ?? ''
  const secondNonce = secondPolicy.match(/script-src[^;]*'nonce-([^']+)'/)?.[1]
  expect(secondNonce).toBeTruthy()
  expect(secondNonce).not.toBe(nonce)
})
