import { expect, test } from '@playwright/test'
import type { Page, Request } from '@playwright/test'

const user = {
  id: 'precreated-user-e2e',
  email: 'student@example.test',
  displayName: 'Pre-created Student',
  status: 'active',
  studentId: '6531501001',
  roleAssignments: [
    {
      role: 'student',
      tenant: false,
      schoolIds: ['school-e2e'],
      programIds: ['program-e2e'],
      active: true
    }
  ]
}

const admin = {
  id: 'system-admin-e2e',
  email: 'admin@example.test',
  displayName: 'System Admin',
  roles: ['systemAdmin'],
  scope: { tenant: true, schoolIds: [], programIds: [] }
}

const staff = {
  id: 'internship-staff-e2e',
  email: 'staff@example.test',
  displayName: 'Internship Staff',
  roles: ['internshipStaff'],
  scope: { tenant: true, schoolIds: [], programIds: [] }
}

function pageOf(items: readonly unknown[]): {
  readonly items: readonly unknown[]
  readonly meta: {
    readonly total: number
    readonly page: number
    readonly pageSize: number
    readonly totalPages: number
  }
} {
  return {
    items,
    meta: {
      total: items.length,
      page: 1,
      pageSize: 25,
      totalPages: items.length > 0 ? 1 : 0
    }
  }
}

async function mockUsersApi(
  page: Page,
  actor: typeof admin | typeof staff,
  capture: (request: Request) => void
): Promise<{
  readonly getUsersCount: () => number
}> {
  let linked = false
  let getUsersCount = 0
  await page.route('**/api/v2/**', async (route) => {
    const request = route.request()
    const path = new URL(request.url()).pathname.replace('/api/v2', '')
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
    if (method === 'GET' && path === '/users/summary') {
      await route.fulfill({
        json: {
          total: 1,
          systemAdmin: 0,
          internshipStaff: 0,
          coordinator: 0,
          student: 1
        }
      })
      return
    }
    if (method === 'GET' && path === '/users') {
      getUsersCount += 1
      await route.fulfill({
        json: pageOf([{ ...user, oidcLinked: linked }])
      })
      return
    }
    if (method === 'GET' && path === '/academic/schools') {
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
    if (method === 'GET' && path === '/academic/programs') {
      await route.fulfill({ json: pageOf([]) })
      return
    }
    if (method === 'POST' && path === `/users/${user.id}/oidc-link`) {
      capture(request)
      linked = true
      await route.fulfill({
        status: 200,
        json: {
          userId: user.id,
          issuer: 'https://sso.example.test',
          status: 'linked'
        }
      })
      return
    }

    await route.fulfill({ status: 404, json: { error: { code: 'NOT_FOUND' } } })
  })
  return { getUsersCount: () => getUsersCount }
}

async function openUserMenu(
  page: Page,
  getUsersCount: () => number
): Promise<void> {
  await page.goto('/app/users')
  await expect.poll(getUsersCount, { timeout: 10_000 }).toBeGreaterThan(0)
  const userRow = page
    .getByRole('row')
    .filter({ hasText: 'Pre-created Student' })
  await expect(userRow).toBeVisible()
  await userRow.getByRole('button', { name: 'การจัดการผู้ใช้งาน' }).click()
}

test('System Admin can link exact subject with reason and idempotency key', async ({
  page
}) => {
  let linkRequest: { readonly body: unknown; readonly key?: string } | undefined
  const mock = await mockUsersApi(page, admin, (apiRequest) => {
    linkRequest = {
      body: apiRequest.postDataJSON(),
      key: apiRequest.headers()['idempotency-key']
    }
  })

  await openUserMenu(page, mock.getUsersCount)
  await page.getByText('เชื่อมบัญชี MFU SSO (OIDC)', { exact: true }).click()
  await page
    .getByPlaceholder('ค่า sub จาก MFU Identity Provider')
    .fill('Exact-CaseSensitive-Subject')
  await page
    .getByPlaceholder('บันทึกเหตุผลที่ตรวจยืนยันตัวตนและผู้อนุมัติ')
    .fill('Verified identity through approved MFU account records')
  await page.getByRole('button', { name: 'ยืนยันการเชื่อมบัญชี' }).click()

  await expect(page.getByText('เชื่อม SSO แล้ว', { exact: true })).toBeVisible()
  expect(linkRequest?.body).toEqual({
    subject: 'Exact-CaseSensitive-Subject',
    reason: 'Verified identity through approved MFU account records'
  })
  expect(linkRequest?.key).toMatch(/^[\x21-\x7e]{16,200}$/u)
})

test('Internship Staff does not see the OIDC account-link action', async ({
  page
}) => {
  await page.context().addCookies([
    {
      name: 'e2e-actor',
      value: 'staff',
      url: 'http://127.0.0.1:18080'
    }
  ])
  const mock = await mockUsersApi(page, staff, () => {})
  await openUserMenu(page, mock.getUsersCount)
  await expect(
    page.getByText('Internship Staff', { exact: true })
  ).toBeVisible()
  await expect(
    page.getByText('เชื่อมบัญชี MFU SSO (OIDC)', { exact: true })
  ).toHaveCount(0)
})
