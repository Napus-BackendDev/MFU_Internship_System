import { expect, test } from '@playwright/test'

test('shows and recovers from a failed Student reference-data lookup', async ({
  request,
  page
}) => {
  const failureSetup = await request.post(
    'http://127.0.0.1:18081/__test/fail-next?path=%2Fapi%2Fv2%2Facademic%2Fschools&times=2'
  )
  expect(failureSetup.status()).toBe(204)

  await page.goto('/app/students')
  const failureState = await request.get(
    'http://127.0.0.1:18081/__test/failure-count?path=%2Fapi%2Fv2%2Facademic%2Fschools'
  )
  const initialFailureState = (await failureState.json()) as {
    count: number
    requests: number
  }
  expect(initialFailureState.count).toBe(2)

  await expect(page.getByText('โหลดข้อมูลอ้างอิงไม่ครบ')).toBeVisible()
  const retryButton = page.getByRole('button', {
    name: 'ลองโหลดข้อมูลอ้างอิงใหม่'
  })
  await expect(retryButton).toBeVisible()
  await page.waitForLoadState('networkidle')
  await retryButton.click()
  await expect
    .poll(async () => {
      const retryStateResponse = await request.get(
        'http://127.0.0.1:18081/__test/failure-count?path=%2Fapi%2Fv2%2Facademic%2Fschools'
      )
      const retryState = (await retryStateResponse.json()) as {
        count: number
        requests: number
      }
      return retryState.requests
    })
    .toBeGreaterThan(initialFailureState.requests)

  await expect(page.getByText('โหลดข้อมูลอ้างอิงไม่ครบ')).toHaveCount(0)
  await expect(
    page.getByRole('table').getByText('สำนักวิชาวิทยาศาสตร์')
  ).toBeVisible()
})
