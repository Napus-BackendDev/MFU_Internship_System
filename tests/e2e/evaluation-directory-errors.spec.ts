import { expect, test } from '@playwright/test'

test('shows and recovers from a failed Student lookup on Evaluations', async ({
  request,
  page
}) => {
  const failureSetup = await request.post(
    'http://127.0.0.1:18081/__test/fail-next?path=%2Fapi%2Fv2%2Fstudents&times=2'
  )
  expect(failureSetup.status()).toBe(204)

  await page.goto('/app/evaluations')
  const failureState = await request.get(
    'http://127.0.0.1:18081/__test/failure-count?path=%2Fapi%2Fv2%2Fstudents'
  )
  const initialFailureState = (await failureState.json()) as {
    count: number
    requests: number
  }
  expect(initialFailureState.count).toBe(2)

  await expect(page.getByText('โหลดข้อมูลประกอบไม่ครบ')).toBeVisible()
  await expect(
    page.getByRole('button', { name: 'ลองโหลดข้อมูลประกอบใหม่' })
  ).toBeVisible()
  await expect(page.getByText('นักศึกษาทดสอบ')).toHaveCount(0)
  await page.waitForLoadState('networkidle')

  await page.getByRole('button', { name: 'ลองโหลดข้อมูลประกอบใหม่' }).click()
  const retryStateResponse = await request.get(
    'http://127.0.0.1:18081/__test/failure-count?path=%2Fapi%2Fv2%2Fstudents'
  )
  const retryState = (await retryStateResponse.json()) as {
    count: number
    requests: number
  }
  expect(retryState.requests).toBeGreaterThan(initialFailureState.requests)

  await expect(page.getByText('โหลดข้อมูลประกอบไม่ครบ')).toHaveCount(0)
  await expect(page.getByText('นักศึกษาทดสอบ')).toBeVisible()
})
