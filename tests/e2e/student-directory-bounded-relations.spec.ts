import { expect, test } from '@playwright/test'

test('Student directory renders page-bound Placement relations without downloading relation catalogs', async ({
  page,
  request
}) => {
  const getRequestCount = async (path: string): Promise<number> => {
    const response = await request.get(
      `http://127.0.0.1:18081/__test/failure-count?path=${encodeURIComponent(path)}`
    )
    expect(response.ok()).toBe(true)
    const result = (await response.json()) as { requests: number }
    return result.requests
  }

  const placementsBefore = await getRequestCount('/api/v2/placements')
  const organizationsBefore = await getRequestCount('/api/v2/organizations')

  await page.goto('/app/students')
  await expect(page.getByRole('table').getByText('บริษัททดสอบ')).toBeVisible()

  expect((await getRequestCount('/api/v2/placements')) - placementsBefore).toBe(
    0
  )
  expect(
    (await getRequestCount('/api/v2/organizations')) - organizationsBefore
  ).toBe(0)
})
