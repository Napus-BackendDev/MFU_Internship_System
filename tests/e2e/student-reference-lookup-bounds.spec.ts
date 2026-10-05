import { expect, test } from '@playwright/test'

interface ReferenceQuery {
  readonly path: string
  readonly query: Readonly<Record<string, string>>
}

test('Student reference lookups stay page-bounded across filters and manual entry', async ({
  page,
  request
}) => {
  const reset = await request.post(
    'http://127.0.0.1:18081/__test/reset-student-reference-queries'
  )
  expect(reset.status()).toBe(204)

  await page.goto('/app/students')
  await page.waitForLoadState('networkidle')
  await expect(page.getByRole('table').getByText('บริษัททดสอบ')).toBeVisible()
  await page.getByRole('button', { name: 'เพิ่มข้อมูลด้วยตัวเอง' }).click()
  await expect(
    page.getByRole('heading', { name: 'เพิ่มข้อมูลนักศึกษาด้วยตัวเอง' })
  ).toBeVisible()
  await expect(
    page.getByRole('combobox', { name: 'รายวิชาที่ฝึกงาน' })
  ).toBeVisible()
  await expect(
    page.getByRole('combobox', { name: 'รอบ/ภาคการศึกษาฝึกงาน' })
  ).toBeVisible()

  const expectedPaths = [
    '/academic/schools',
    '/academic/programs',
    '/academic/courses',
    '/academic/terms',
    '/evaluation-cycles',
    '/competency-sets'
  ]
  await expect
    .poll(async () => {
      const response = await request.get(
        'http://127.0.0.1:18081/__test/student-reference-queries'
      )
      const queries = (await response.json()) as ReferenceQuery[]
      return expectedPaths.every((path) =>
        queries.some((entry) => entry.path === path)
      )
    })
    .toBe(true)

  const response = await request.get(
    'http://127.0.0.1:18081/__test/student-reference-queries'
  )
  const queries = (await response.json()) as ReferenceQuery[]
  for (const path of expectedPaths) {
    expect(
      queries.some((entry) => entry.path === path),
      path
    ).toBe(true)
  }
  for (const { path, query } of queries) {
    const pageSize = Number(query.pageSize)
    expect(
      Number.isInteger(pageSize) && pageSize > 0 && pageSize <= 25,
      `${path}: ${JSON.stringify(query)}`
    ).toBe(true)
  }
})
