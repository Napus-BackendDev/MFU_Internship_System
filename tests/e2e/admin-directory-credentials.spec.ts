import { expect, test } from '@playwright/test'

const actor = {
  id: 'directory-security-e2e',
  email: 'staff@example.test',
  displayName: 'Directory staff',
  roles: ['systemAdmin'],
  scope: { tenant: true, schoolIds: [], programIds: [] }
}

const leakedPin = 'LEGACY-PIN-MUST-NOT-LEAK'
const leakedToken = 'INVITATION-TOKEN-MUST-NOT-LEAK'

function pageOf(items: unknown[]): {
  items: unknown[]
  meta: { total: number; page: number; pageSize: number; totalPages: number }
} {
  return {
    items,
    meta: {
      total: items.length,
      page: 1,
      pageSize: 500,
      totalPages: items.length > 0 ? 1 : 0
    }
  }
}

test('student directory never renders or searches legacy invitation credentials', async ({
  page
}) => {
  const aggregateRelationLoads: string[] = []
  const masterReferenceLoads: Array<{
    path: string
    query: Record<string, string>
  }> = []
  await page.route('**/api/v2/**', async (route) => {
    const request = route.request()
    const path = new URL(request.url()).pathname.replace('/api/v2', '')
    if (
      request.method() === 'GET' &&
      [
        '/academic/schools',
        '/academic/programs',
        '/academic/courses',
        '/academic/terms'
      ].includes(path)
    ) {
      masterReferenceLoads.push({
        path,
        query: Object.fromEntries(new URL(request.url()).searchParams.entries())
      })
    }
    if (
      request.method() === 'GET' &&
      [
        '/organizations',
        '/placements',
        '/evaluators',
        '/evaluation-assignments'
      ].includes(path)
    ) {
      aggregateRelationLoads.push(path)
    }

    if (request.method() === 'GET' && path === '/auth/me') {
      await route.fulfill({ json: { actor } })
      return
    }
    if (request.method() === 'POST' && path === '/auth/refresh') {
      await route.fulfill({
        status: 401,
        json: { error: { code: 'NO_SESSION' } }
      })
      return
    }
    if (request.method() === 'GET' && path === '/reports/overview') {
      await route.fulfill({
        json: {
          students: 1,
          assignments: {},
          failedDeliveries: 0,
          readyDocuments: 0,
          generatedAt: '2026-09-27T00:00:00.000Z'
        }
      })
      return
    }
    if (request.method() === 'GET' && path === '/students') {
      const student = {
        id: 'student-record-e2e',
        studentId: '6531501001',
        name: { th: 'นักศึกษาทดสอบ', en: 'Test Student' },
        email: 'student@example.test',
        schoolId: 'school-e2e',
        programId: 'program-e2e',
        academicTermId: 'term-e2e',
        academicYear: 2026,
        semester: '1',
        status: 'active',
        directoryRelations: {
          assignments: [
            {
              id: 'assignment-e2e',
              cycleId: 'cycle-e2e',
              placementId: 'placement-e2e',
              studentId: 'student-record-e2e',
              evaluatorId: '64f000000000000000000021',
              deadlineAt: '2026-12-31T23:59:59.000Z',
              status: 'pending',
              accessPin: leakedPin,
              accessPinHash: 'LEGACY-HASH-MUST-NOT-LEAK',
              invitationToken: leakedToken,
              evaluator: {
                id: '64f000000000000000000021',
                organizationId: '64f000000000000000000020',
                email: 'evaluator@example.test',
                name: { th: 'ผู้ประเมินทดสอบ', en: 'Test Evaluator' },
                position: { th: 'หัวหน้างาน', en: 'Supervisor' },
                phone: 'private-phone'
              }
            }
          ],
          placements: [
            {
              id: 'placement-e2e',
              studentId: 'student-record-e2e',
              organizationId: '64f000000000000000000020',
              academicTermId: 'term-e2e',
              positionTitle: { th: 'นักศึกษาฝึกงาน', en: 'Intern' },
              status: 'active',
              organization: {
                id: '64f000000000000000000020',
                organizationCode: 'TEST',
                name: { th: 'บริษัททดสอบ', en: 'Test Company' },
                address: { province: 'Chiang Rai' }
              }
            }
          ]
        }
      }
      const requestUrl = new URL(request.url())
      const search = requestUrl.searchParams.get('search')?.toLocaleLowerCase()
      const items = search
        ? [student].filter((item) =>
            [item.studentId, item.email, item.name.th, item.name.en]
              .join(' ')
              .toLocaleLowerCase()
              .includes(search)
          )
        : [student]
      const response = pageOf(items)
      if (requestUrl.searchParams.get('includeDirectoryData') === 'true') {
        Object.assign(response, {
          directory: {
            summary: {
              all: items.length,
              submitted: 0,
              inProgress: 0,
              emailError: 0,
              pending: items.length,
              expired: 0,
              assignmentAmbiguous: 0
            },
            facets: {
              academicYears: [2026],
              semesters: ['1'],
              schoolIds: ['school-e2e'],
              schools: [
                {
                  id: 'school-e2e',
                  schoolCode: 'SCI',
                  name: { th: 'สำนักวิชาวิทยาศาสตร์', en: 'Science' }
                }
              ],
              statuses: ['pending']
            }
          }
        })
      }
      await route.fulfill({
        json: response
      })
      return
    }
    if (request.method() === 'GET' && path === '/academic/schools') {
      await route.fulfill({
        json: pageOf([
          {
            id: 'school-e2e',
            schoolCode: 'SCI',
            name: { th: 'สำนักวิชาวิทยาศาสตร์', en: 'Science' }
          }
        ])
      })
      return
    }
    if (request.method() === 'GET' && path === '/academic/programs') {
      await route.fulfill({
        json: pageOf([
          {
            id: 'program-e2e',
            schoolId: 'school-e2e',
            programCode: 'SCI01',
            name: { th: 'วิทยาศาสตร์', en: 'Science' }
          }
        ])
      })
      return
    }
    if (request.method() === 'GET' && path === '/academic/courses') {
      await route.fulfill({ json: pageOf([]) })
      return
    }
    if (request.method() === 'GET' && path === '/organizations') {
      await route.fulfill({ json: pageOf([]) })
      return
    }
    if (request.method() === 'GET' && path === '/placements') {
      await route.fulfill({ json: pageOf([]) })
      return
    }
    if (request.method() === 'GET' && path === '/evaluators') {
      await route.fulfill({ json: pageOf([]) })
      return
    }
    if (request.method() === 'GET' && path === '/academic/terms') {
      await route.fulfill({
        json: pageOf([
          { id: 'term-e2e', code: '2026/1', academicYear: 2026, semester: '1' }
        ])
      })
      return
    }
    if (request.method() === 'GET' && path === '/evaluation-cycles') {
      await route.fulfill({
        json: pageOf([
          {
            id: 'cycle-e2e',
            code: '2026-E2E',
            name: { th: 'รอบทดสอบ', en: 'Test cycle' },
            academicTermId: 'term-e2e',
            status: 'active'
          }
        ])
      })
      return
    }
    if (request.method() === 'GET' && path === '/evaluation-assignments') {
      await route.fulfill({
        json: pageOf([
          {
            id: 'assignment-e2e',
            studentId: 'student-record-e2e',
            cycleId: 'cycle-e2e',
            evaluatorId: '64f000000000000000000021',
            deadlineAt: '2026-12-31T23:59:59.000Z',
            status: 'pending',
            accessPin: leakedPin,
            accessPinHash: 'LEGACY-HASH-MUST-NOT-LEAK',
            invitationToken: leakedToken
          }
        ])
      })
      return
    }

    await route.fulfill({ status: 404, json: { error: { code: 'NOT_FOUND' } } })
  })

  await page.goto('/app')
  await page.waitForLoadState('networkidle')
  await page.getByRole('button', { name: 'รีเฟรช' }).click()
  const studentRow = page.getByRole('row').filter({ hasText: '6531501001' })
  await expect(studentRow).toBeVisible()
  expect(aggregateRelationLoads).toEqual([])
  expect(masterReferenceLoads).toEqual([])

  await page
    .getByPlaceholder('รหัสนักศึกษา, ชื่อ, สถานประกอบการ...')
    .fill(leakedPin)
  await expect(studentRow).toHaveCount(0)
  await page.getByPlaceholder('รหัสนักศึกษา, ชื่อ, สถานประกอบการ...').clear()
  await expect(studentRow).toBeVisible()

  await studentRow
    .getByRole('button', { name: 'การจัดการข้อมูลนักศึกษา' })
    .click()
  await page.getByRole('menuitem', { name: 'แก้ไขข้อมูล' }).click()
  await expect
    .poll(() =>
      [...new Set(masterReferenceLoads.map(({ path }) => path))].sort()
    )
    .toEqual(['/academic/courses', '/academic/programs', '/academic/schools'])
  for (const { path, query } of masterReferenceLoads) {
    const pageSize = Number(query.pageSize)
    expect(
      Number.isInteger(pageSize) && pageSize > 0 && pageSize <= 25,
      `${path}: ${JSON.stringify(query)}`
    ).toBe(true)
  }
  await expect(
    page.getByRole('heading', { name: /แก้ไขข้อมูลนักศึกษา/ })
  ).toBeVisible()
  await page.getByRole('button', { name: 'ยกเลิก' }).click()

  await studentRow
    .getByRole('button', { name: 'การจัดการข้อมูลนักศึกษา' })
    .click()
  await page.getByRole('menuitem', { name: 'ดูสรุปผลและสมรรถนะ' }).click()
  await expect(
    page.getByText('ระบบส่งข้อมูลเข้าประเมินผ่านคำเชิญทางอีเมล')
  ).toBeVisible()
  const renderedText = await page.locator('body').innerText()
  expect(renderedText).not.toContain(leakedPin)
  expect(renderedText).not.toContain(leakedToken)
  expect(renderedText).not.toContain('LEGACY-HASH-MUST-NOT-LEAK')
})
