import { expect, test } from '@playwright/test'

test('audit action filter queries all pages and displays filtered total', async ({
  page
}) => {
  const requests: URL[] = []
  await page.route('**/api/v2/audit-logs**', async (route) => {
    const url = new URL(route.request().url())
    requests.push(url)
    const filtered = url.searchParams.get('actionCategory') === 'delete'
    await route.fulfill({
      json: {
        items: [
          {
            id: 'audit-item',
            occurredAt: '2026-10-21T00:00:00Z',
            actorId: 'qa-actor',
            action: filtered
              ? 'DELETE /api/v2/organizations/qa'
              : 'POST /api/v2/students',
            requestId: 'qa-request'
          }
        ],
        meta: { total: filtered ? 1 : 26, page: 1, pageSize: 5 }
      }
    })
  })
  await page.goto('/app/audit')
  await page.waitForLoadState('networkidle')
  await page.getByRole('button', { name: 'หมวด Action', exact: true }).click()
  await page.getByRole('button', { name: 'คำขอ DELETE', exact: true }).click()
  await expect(
    page.getByText('DELETE /api/v2/organizations/qa', { exact: true })
  ).toBeVisible()
  expect(
    requests.some(
      (url) =>
        url.searchParams.get('actionCategory') === 'delete' &&
        url.searchParams.get('page') === '1'
    )
  ).toBe(true)
  await expect(
    page.getByText('POST /api/v2/students', { exact: true })
  ).toHaveCount(0)
  await expect(page.getByText('ผลการตรวจสอบ:').locator('..')).toContainText('1')
})
