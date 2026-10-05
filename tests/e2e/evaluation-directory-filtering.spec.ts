import { expect, test } from '@playwright/test'

interface RecordedQuery {
  readonly path: string
  readonly query: Record<string, string>
}

test('Evaluation directory filters server-side and loads relations only for visible assignments', async ({
  request,
  page
}) => {
  const reset = await request.post(
    'http://127.0.0.1:18081/__test/reset-evaluation-directory-queries'
  )
  expect(reset.status()).toBe(204)

  await page.goto('/app/evaluations')
  await page.waitForLoadState('networkidle')
  await expect(page.getByText('Example Student')).toBeVisible()
  const studentRow = page
    .getByRole('row')
    .filter({ hasText: 'Example Student' })
  await expect(studentRow.getByText('บริษัททดสอบ')).toBeVisible()

  const initialResponse = await request.get(
    'http://127.0.0.1:18081/__test/evaluation-directory-queries'
  )
  const initialQueries = (await initialResponse.json()) as RecordedQuery[]
  const studentLookup = initialQueries.find(
    (item) => item.path === '/students' && item.query.studentIds
  )
  const evaluatorLookup = initialQueries.find(
    (item) => item.path === '/evaluators' && item.query.evaluatorIds
  )
  const organizationLookup = initialQueries.find(
    (item) => item.path === '/organizations' && item.query.organizationIds
  )
  expect(studentLookup?.query.studentIds).toBe('student-record-e2e')
  expect(Number(studentLookup?.query.pageSize)).toBe(1)
  expect(evaluatorLookup?.query.evaluatorIds).toBe('64f000000000000000000021')
  expect(Number(evaluatorLookup?.query.pageSize)).toBe(1)
  expect(organizationLookup?.query.organizationIds).toBe(
    '64f000000000000000000020'
  )
  expect(Number(organizationLookup?.query.pageSize)).toBe(1)
  expect(
    initialQueries
      .filter((item) => item.path === '/evaluation-assignments')
      .every((item) => Number(item.query.pageSize) <= 20)
  ).toBe(true)

  const search = page.getByPlaceholder(
    'รหัสนักศึกษา, ชื่อ, ผู้ประเมิน, บริษัท...'
  )
  await search.fill('not-a-match')
  await expect(page.getByText('พบ 0 รายการตามตัวกรอง')).toBeVisible()
  await expect(page.getByText('Example Student')).toHaveCount(0)

  const noMatchResponse = await request.get(
    'http://127.0.0.1:18081/__test/evaluation-directory-queries'
  )
  const noMatchQueries = (await noMatchResponse.json()) as RecordedQuery[]
  expect(
    noMatchQueries.some(
      (item) =>
        item.path === '/evaluation-assignments' &&
        item.query.search === 'not-a-match'
    )
  ).toBe(true)

  await search.fill('Example Student')
  await expect(page.getByText('Example Student')).toBeVisible()
  await page
    .getByRole('combobox', { name: 'สถานประกอบการ' })
    .selectOption('64f000000000000000000020')
  await expect(page.getByText('Example Student')).toBeVisible()

  const filteredResponse = await request.get(
    'http://127.0.0.1:18081/__test/evaluation-directory-queries'
  )
  const filteredQueries = (await filteredResponse.json()) as RecordedQuery[]
  expect(
    filteredQueries.some(
      (item) =>
        item.path === '/evaluation-assignments' &&
        item.query.search === 'Example Student' &&
        item.query.organizationId === '64f000000000000000000020'
    )
  ).toBe(true)
})
