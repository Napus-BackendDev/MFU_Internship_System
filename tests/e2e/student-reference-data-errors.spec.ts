import { expect, test } from '@playwright/test'

test('shows and recovers from a failed Student reference-data lookup', async ({
  page
}) => {
  await page.goto('/app/students')
  await page.waitForLoadState('networkidle')
  let failLookup = true
  let lookupRequests = 0
  await page.route('**/api/v2/academic/schools**', async (route) => {
    lookupRequests += 1
    if (failLookup) {
      await route.fulfill({
        status: 503,
        contentType: 'application/json',
        body: JSON.stringify({ error: { code: 'TEST_UPSTREAM_FAILURE' } })
      })
      return
    }
    await route.continue()
  })
  await page.getByRole('searchbox', { name: 'สำนักวิชา ค้นหา' }).fill('SCI')

  const lookupError = page.getByRole('alert').filter({
    hasText: 'โหลดรายการไม่สำเร็จ'
  })
  await expect(lookupError).toBeVisible()
  expect(lookupRequests).toBeGreaterThan(0)

  failLookup = false
  const retryButton = lookupError.getByRole('button', { name: 'ลองอีกครั้ง' })
  await expect(retryButton).toBeVisible()
  await retryButton.click()
  await expect.poll(() => lookupRequests).toBeGreaterThan(1)

  await expect(lookupError).toHaveCount(0)
  await expect(
    page.getByRole('table').getByText('สำนักวิชาวิทยาศาสตร์')
  ).toBeVisible()
})
