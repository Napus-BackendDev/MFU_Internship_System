import { expect, test } from '@playwright/test'

const actor = {
  id: 'cycle-manager-e2e',
  email: 'staff@example.test',
  displayName: 'Cycle manager',
  roles: ['systemAdmin'],
  scope: { tenant: true, schoolIds: [], programIds: [] }
}

test('staff creates, previews, activates, and closes an evaluation cycle', async ({
  page
}) => {
  const cycles: Array<Record<string, unknown>> = []
  let createPayload: Record<string, unknown> | undefined
  const observedVersionRequests: string[] = []
  const programListQueries: Array<{
    readonly schoolId: string | null
    readonly programIds: string | null
  }> = []
  const referenceListQueries: Record<
    'terms' | 'schools' | 'competencySets',
    Array<{
      readonly page: string | null
      readonly pageSize: string | null
      readonly search: string | null
      readonly archived: string | null
      readonly excludeArchived: string | null
    }>
  > = { terms: [], schools: [], competencySets: [] }

  function pickerPage(
    url: URL,
    item: Record<string, unknown>,
    idFilter?: string
  ): {
    items: Array<Record<string, unknown>>
    meta: { total: number; page: number; pageSize: number; totalPages: number }
  } {
    const requestedPage = Number(url.searchParams.get('page') ?? 1)
    const requestedPageSize = Number(url.searchParams.get('pageSize') ?? 25)
    const isLabelLookup = Boolean(idFilter && url.searchParams.has(idFilter))
    const items = isLabelLookup
      ? [item]
      : requestedPage === 1
        ? [
            {
              ...item,
              id: `${String(item.id)}-first`,
              code: `FIRST-${String(item.code)}`
            }
          ]
        : [item]
    const total = isLabelLookup ? 1 : 26
    return {
      items,
      meta: {
        total,
        page: requestedPage,
        pageSize: requestedPageSize,
        totalPages: Math.ceil(total / requestedPageSize)
      }
    }
  }

  await page.setViewportSize({ width: 1280, height: 900 })
  await page.request.post(
    'http://127.0.0.1:18081/__test/reset-cycle-reference-queries'
  )
  page.on('request', (request) => {
    if (request.url().includes('/competency-sets/')) {
      observedVersionRequests.push(request.url())
    }
  })
  page.on('dialog', (dialog) => dialog.accept())
  await page.route('**/api/v2/**', async (route) => {
    const request = route.request()
    const url = new URL(request.url())
    const path = url.pathname.replace('/api/v2', '')
    const method = request.method()

    if (method === 'GET' && path === '/auth/me') {
      await route.fulfill({ json: { actor } })
      return
    }
    if (method === 'POST' && path === '/auth/refresh') {
      await route.fulfill({
        status: 401,
        json: { error: { code: 'NO_SESSION' } }
      })
      return
    }
    if (method === 'POST' && path === '/auth/dev/login') {
      await route.fulfill({ json: { actor } })
      return
    }
    if (method === 'GET' && path === '/evaluation-cycles') {
      await route.fulfill({
        json: {
          items: cycles,
          meta: { total: cycles.length, page: 1, pageSize: 25, totalPages: 1 }
        }
      })
      return
    }
    if (method === 'GET' && path === '/academic/terms') {
      referenceListQueries.terms.push({
        page: url.searchParams.get('page'),
        pageSize: url.searchParams.get('pageSize'),
        search: url.searchParams.get('search'),
        archived: url.searchParams.get('archived'),
        excludeArchived: url.searchParams.get('excludeArchived')
      })
      await route.fulfill({
        json: pickerPage(
          url,
          {
            id: 'term-e2e',
            code: '2026/1',
            academicYear: 2026,
            semester: '1',
            status: 'open'
          },
          'termIds'
        )
      })
      return
    }
    if (method === 'GET' && path === '/academic/schools') {
      referenceListQueries.schools.push({
        page: url.searchParams.get('page'),
        pageSize: url.searchParams.get('pageSize'),
        search: url.searchParams.get('search'),
        archived: url.searchParams.get('archived'),
        excludeArchived: url.searchParams.get('excludeArchived')
      })
      await route.fulfill({
        json: pickerPage(
          url,
          {
            id: 'school-e2e',
            schoolCode: 'SCI',
            name: { th: 'สำนักวิชาวิทยาศาสตร์', en: 'Science' }
          },
          'schoolIds'
        )
      })
      return
    }
    if (method === 'GET' && path === '/academic/programs') {
      programListQueries.push({
        schoolId: url.searchParams.get('schoolId'),
        programIds: url.searchParams.get('programIds')
      })
      await route.fulfill({
        json: {
          items: [
            {
              id: 'program-e2e',
              schoolId: 'school-e2e',
              programCode: 'SE',
              name: { th: 'วิศวกรรมซอฟต์แวร์', en: 'Software Engineering' }
            }
          ],
          meta: { total: 1, page: 1, pageSize: 500, totalPages: 1 }
        }
      })
      return
    }
    if (method === 'GET' && path === '/competency-sets') {
      referenceListQueries.competencySets.push({
        page: url.searchParams.get('page'),
        pageSize: url.searchParams.get('pageSize'),
        search: url.searchParams.get('search'),
        archived: url.searchParams.get('archived'),
        excludeArchived: url.searchParams.get('excludeArchived')
      })
      await route.fulfill({
        json: pickerPage(url, {
          id: 'competency-set-e2e',
          code: 'MFU-INTERNSHIP',
          name: { th: 'แบบประเมินฝึกงาน', en: 'Internship evaluation' }
        })
      })
      return
    }
    if (
      method === 'GET' &&
      path === '/competency-sets/competency-set-e2e/versions'
    ) {
      await route.fulfill({
        json: [
          {
            id: 'competency-version-e2e',
            versionNumber: 2,
            status: 'published'
          }
        ]
      })
      return
    }
    if (method === 'POST' && path === '/evaluation-cycles') {
      createPayload = request.postDataJSON() as Record<string, unknown>
      const cycle = {
        id: 'cycle-e2e',
        ...createPayload,
        status: 'draft'
      }
      cycles.push(cycle)
      await route.fulfill({ json: cycle })
      return
    }
    if (method === 'GET' && path === '/evaluation-cycles/cycle-e2e/preview') {
      await route.fulfill({
        json: {
          cycleId: 'cycle-e2e',
          valid: true,
          issues: [],
          readiness: {
            candidateStudentCount: 0,
            eligibleStudentCount: 0,
            missingStudentDataCount: 0,
            missingPlacementCount: 0,
            missingEvaluatorCount: 0
          }
        }
      })
      return
    }
    if (method === 'POST' && path === '/evaluation-cycles/cycle-e2e/activate') {
      const cycle = cycles[0]
      if (cycle) cycle.status = 'active'
      await route.fulfill({ json: { ...cycle, status: 'active' } })
      return
    }
    if (method === 'POST' && path === '/evaluation-cycles/cycle-e2e/close') {
      const cycle = cycles[0]
      if (cycle) cycle.status = 'closed'
      await route.fulfill({ json: { ...cycle, status: 'closed' } })
      return
    }

    await route.fulfill({ status: 404 })
  })

  await page.goto('/app/evaluations/cycles')
  await page.waitForLoadState('networkidle')
  await expect(
    page.getByRole('heading', { name: 'รอบประเมิน', exact: true })
  ).toBeVisible()
  const queryResponse = await page.request.get(
    'http://127.0.0.1:18081/__test/cycle-reference-queries'
  )
  const initialReferenceQueries = (await queryResponse.json()) as Array<{
    path: string
    query: Record<string, string>
  }>
  expect(initialReferenceQueries).toHaveLength(3)
  for (const path of [
    '/academic/terms',
    '/academic/schools',
    '/competency-sets'
  ]) {
    const matching = initialReferenceQueries.filter(
      (entry) => entry.path === path
    )
    expect(matching, path).toHaveLength(1)
    expect(matching[0]?.query).toMatchObject({
      page: '1',
      pageSize: '25',
      archived: 'false'
    })
  }
  expect(programListQueries).toEqual([])

  await page.getByRole('searchbox', { name: 'ค้นหารหัสภาคเรียน' }).fill('2026')
  await expect.poll(() => referenceListQueries.terms.length).toBe(1)
  expect(referenceListQueries.terms[0]).toMatchObject({
    page: '1',
    pageSize: '25',
    search: '2026',
    archived: 'false'
  })
  const nextTermPage = page.getByRole('button', {
    name: 'หน้าถัดไปของภาคเรียน'
  })
  await expect(nextTermPage).toBeEnabled()
  await nextTermPage.click()
  await expect.poll(() => referenceListQueries.terms.length).toBe(2)
  expect(referenceListQueries.terms[1]).toMatchObject({
    page: '2',
    pageSize: '25',
    search: '2026'
  })
  await page.getByLabel('ภาคเรียน', { exact: true }).selectOption('term-e2e')

  await page.getByRole('searchbox', { name: 'ค้นหารหัสสำนักวิชา' }).fill('SCI')
  await expect.poll(() => referenceListQueries.schools.length).toBe(1)
  const nextSchoolPage = page.getByRole('button', {
    name: 'หน้าถัดไปของสำนักวิชา'
  })
  await expect(nextSchoolPage).toBeEnabled()
  await nextSchoolPage.click()
  await expect.poll(() => referenceListQueries.schools.length).toBe(2)
  await page.getByLabel('สำนักวิชา (ไม่บังคับ)').selectOption('school-e2e')
  await expect(page.getByLabel('หลักสูตร (ไม่บังคับ)')).toBeVisible()
  await expect.poll(() => programListQueries.length).toBe(1)
  expect(programListQueries[0]).toEqual({
    schoolId: 'school-e2e',
    programIds: null
  })
  await page.getByLabel('หลักสูตร (ไม่บังคับ)').selectOption('program-e2e')
  await page.waitForLoadState('networkidle')

  await page
    .getByRole('searchbox', { name: 'ค้นหารหัสชุดแบบประเมิน' })
    .fill('MFU')
  await expect.poll(() => referenceListQueries.competencySets.length).toBe(1)
  const nextCompetencyPage = page.getByRole('button', {
    name: 'หน้าถัดไปของชุดแบบประเมิน'
  })
  await expect(nextCompetencyPage).toBeEnabled()
  await nextCompetencyPage.click()
  await expect.poll(() => referenceListQueries.competencySets.length).toBe(2)

  await page.getByLabel('รหัสรอบ').fill('2026-TEST-CYCLE')
  await page.getByLabel('ชื่อภาษาไทย').fill('รอบทดสอบ 2569')
  await page.getByLabel('ชื่อภาษาอังกฤษ').fill('Test cycle 2026')
  await page
    .getByLabel('ชุดแบบประเมิน', { exact: true })
    .selectOption('competency-set-e2e')
  await expect
    .poll(() => observedVersionRequests.length, { timeout: 5_000 })
    .toBeGreaterThan(0)
  const competencyVersionSelect = page.getByLabel('ฉบับที่เผยแพร่แล้ว')
  await expect(competencyVersionSelect).toBeEnabled()
  await competencyVersionSelect.selectOption('competency-version-e2e')
  await page
    .getByLabel('เปิดรับผล (เวลาไทย)', { exact: true })
    .fill('2026-10-01T09:00')
  await page
    .getByLabel('ปิดรับผล (เวลาไทย)', { exact: true })
    .fill('2026-12-31T17:00')
  await page.getByRole('button', { name: 'บันทึกรอบฉบับร่าง' }).click()

  await expect(page.getByText('2026-TEST-CYCLE')).toBeVisible()
  await expect.poll(() => programListQueries.length).toBe(2)
  expect(programListQueries[1]).toEqual({
    schoolId: null,
    programIds: 'program-e2e'
  })
  await expect(
    page.getByText('สำนักวิชาวิทยาศาสตร์ · วิศวกรรมซอฟต์แวร์')
  ).toBeVisible()
  expect(createPayload).toMatchObject({
    academicTermId: 'term-e2e',
    programId: 'program-e2e',
    competencySetVersionId: 'competency-version-e2e',
    opensAt: '2026-10-01T02:00:00.000Z',
    closesAt: '2026-12-31T10:00:00.000Z',
    status: 'draft'
  })

  const activateButton = page.getByRole('button', { name: 'เปิดรอบ' })
  await expect(activateButton).toBeDisabled()
  await page.getByRole('button', { name: 'ตรวจความพร้อม' }).click()
  await expect(page.getByText('รอบพร้อมเปิดใช้งาน')).toBeVisible()
  await expect(
    page.getByText(/ผู้เรียน 0 · พร้อม 0 · ขาด placement 0/)
  ).toBeVisible()
  await expect(activateButton).toBeEnabled()
  await activateButton.click()
  await expect(page.getByText('เปิดรับผล', { exact: true })).toBeVisible()

  await page.getByRole('button', { name: 'ปิดรอบ' }).click()
  await expect(page.getByText('ปิดแล้ว', { exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: 'ปิดรอบ' })).toHaveCount(0)
})
