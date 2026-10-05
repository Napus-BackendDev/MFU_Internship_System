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

function pageOf(
  items: unknown[],
  page = 1,
  pageSize = 100
): {
  items: unknown[]
  meta: { total: number; page: number; pageSize: number; totalPages: number }
} {
  return {
    items,
    meta: {
      total: items.length,
      page,
      pageSize,
      totalPages: Math.ceil(items.length / pageSize)
    }
  }
}

test('student directory never renders or searches legacy invitation credentials', async ({
  page
}) => {
  const aggregateRelationLoads: string[] = []
  const studentDirectoryDataRequests: boolean[] = []
  const studentDirectoryExportRequests: Array<{
    body: Record<string, unknown>
    idempotencyKey: string | undefined
  }> = []
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
    if (request.method() === 'POST' && path === '/reports/exports') {
      studentDirectoryExportRequests.push({
        body: request.postDataJSON() as Record<string, unknown>,
        idempotencyKey: request.headers()['idempotency-key']
      })
      await route.fulfill({
        status: 202,
        json: {
          id: '64f000000000000000000099',
          reportType: 'studentDirectory',
          format: 'xlsx',
          status: 'queued',
          rowCount: 1
        }
      })
      return
    }
    if (
      request.method() === 'GET' &&
      path === '/reports/exports/64f000000000000000000099'
    ) {
      await route.fulfill({
        json: {
          id: '64f000000000000000000099',
          reportType: 'studentDirectory',
          format: 'xlsx',
          status: 'ready',
          rowCount: 1
        }
      })
      return
    }
    if (
      request.method() === 'GET' &&
      path === '/reports/exports/64f000000000000000000099/download-url'
    ) {
      await route.fulfill({
        json: { url: 'http://download.example.test/student-directory.xlsx' }
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
        status: 'active'
      }
      const studentWithDirectoryRelations = {
        ...student,
        directoryRelations: {
          assignments: [
            {
              id: 'assignment-e2e',
              cycleId: 'cycle-e2e',
              placementId: 'placement-e2e',
              studentId: 'student-record-e2e',
              evaluatorId: '64f000000000000000000021',
              deadlineAt: '2026-12-31T23:59:59.000Z',
              status: 'submitted',
              categoryScores: {
                hardSkill: {
                  average: 4.25,
                  answeredCount: 2,
                  scaleMin: 1,
                  scaleMax: 5
                },
                softSkill: {
                  average: 3.5,
                  answeredCount: 1,
                  scaleMin: 1,
                  scaleMax: 5
                },
                scoringPolicyVersion: 'mfu-category-mean-v1'
              },
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
      const includeDirectoryData =
        requestUrl.searchParams.get('includeDirectoryData') === 'true'
      studentDirectoryDataRequests.push(includeDirectoryData)
      const search = requestUrl.searchParams.get('search')?.toLocaleLowerCase()
      const requestedStudent = includeDirectoryData
        ? studentWithDirectoryRelations
        : student
      const items = search
        ? [requestedStudent].filter((item) =>
            [item.studentId, item.email, item.name.th, item.name.en]
              .join(' ')
              .toLocaleLowerCase()
              .includes(search)
          )
        : [requestedStudent]
      const response = pageOf(
        items,
        Number(requestUrl.searchParams.get('page') ?? 1),
        Number(requestUrl.searchParams.get('pageSize') ?? 500)
      )
      if (includeDirectoryData) {
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
  await page.route('http://download.example.test/**', async (route) => {
    await route.fulfill({
      status: 200,
      body: Buffer.from('test-xlsx-content'),
      headers: {
        'content-disposition':
          'attachment; filename="MFU_Internship_Report_TH_20260929.xlsx"',
        'content-type':
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      }
    })
  })

  await page.goto('/app')
  await page.waitForLoadState('networkidle')
  await page.getByRole('button', { name: 'รีเฟรช' }).click()
  const studentRow = page.getByRole('row').filter({ hasText: '6531501001' })
  await expect(studentRow).toBeVisible()
  await page.locator('select').first().selectOption('cycle-e2e')
  await expect(studentRow).toContainText('Hard Skill:')
  await expect(studentRow).toContainText('4.3')
  await expect(studentRow).toContainText('Soft Skill:')
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

  const exportRequestOffset = studentDirectoryDataRequests.length
  const downloadReady = page.waitForEvent('download')
  await page.getByRole('button', { name: 'ส่งออก Excel (ภาษาไทย)' }).click()
  const download = await downloadReady
  expect(download.suggestedFilename()).toMatch(
    /^MFU_Internship_Report_TH_\d{8}\.xlsx$/
  )
  expect(studentDirectoryDataRequests).toHaveLength(exportRequestOffset)
  expect(studentDirectoryExportRequests).toHaveLength(1)
  expect(studentDirectoryExportRequests[0]?.body).toMatchObject({
    reportType: 'studentDirectory',
    filters: { cycleId: 'cycle-e2e' },
    locale: 'th',
    format: 'xlsx'
  })
  expect(studentDirectoryExportRequests[0]?.idempotencyKey).toHaveLength(36)
  expect(JSON.stringify(studentDirectoryExportRequests[0]?.body)).not.toContain(
    '6531501001'
  )

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
