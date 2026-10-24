import { expect, test } from '@playwright/test'

for (const deliveryMode of ['capture', 'smtp'] as const) {
  test(`SMTP shows effective Environment settings and explicit ${deliveryMode} mode`, async ({
    page
  }) => {
    await page.route('**/api/v2/**', async (route) => {
      const path = new URL(route.request().url()).pathname.replace(
        '/api/v2',
        ''
      )
      if (path === '/auth/me')
        return route.fulfill({
          json: {
            actor: {
              id: 'qa-admin',
              displayName: 'QA',
              email: 'qa@example.test',
              roles: ['systemAdmin'],
              scope: { tenant: true, schoolIds: [], programIds: [] }
            }
          }
        })
      if (path === '/system-settings/smtp')
        return route.fulfill({
          json: {
            enabled: false,
            source: 'environment',
            host: 'old.example.test',
            port: 11026,
            secure: true,
            username: '',
            from: 'old@example.test',
            passwordConfigured: false,
            effectivePasswordConfigured: false,
            deliveryMode,
            effectiveConnection: {
              host: '127.0.0.1',
              port: 11025,
              secure: false,
              from: 'qa@example.test',
              usernameConfigured: false,
              version: 0
            },
            version: 2,
            updatedAt: null,
            updatedBy: null
          }
        })
      return route.fulfill({
        json: {
          items: [],
          meta: { page: 1, pageSize: 100, total: 0, totalPages: 0 }
        }
      })
    })
    await page.goto('/app/support')
    await page.waitForLoadState('networkidle')
    await page.getByRole('link', { name: 'ตั้งค่า SMTP', exact: true }).click()
    await expect(page.locator('input[name="port"]')).toHaveValue('11026')
    await expect(page.locator('header')).toContainText('127.0.0.1:11025')
    await expect(page.locator('header')).not.toContainText('11026')
    await expect(
      page.getByText('qa@example.test', { exact: true })
    ).toBeVisible()
    if (deliveryMode === 'capture')
      await expect(
        page.getByText('โหมดรับอีเมลทดสอบ (Capture)', { exact: true })
      ).toBeVisible()
    else
      await expect(
        page.getByText('ระบบส่งอีเมล SMTP (ส่งออกจริง)', { exact: true })
      ).toBeVisible()
  })
}
