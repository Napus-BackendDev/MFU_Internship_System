import { expect, test } from '@playwright/test'

test('changing school clears the program value even when its label is hidden', async ({
  page
}) => {
  await page.route('**/api/v2/**', async (route) => {
    const path = new URL(route.request().url()).pathname.replace('/api/v2', '')
    if (path === '/auth/me') {
      await route.fulfill({
        json: {
          actor: {
            id: 'qa-admin',
            displayName: 'QA Admin',
            email: 'qa@example.test',
            roles: ['systemAdmin'],
            scope: { tenant: true, schoolIds: [], programIds: [] }
          }
        }
      })
      return
    }
    const items =
      path === '/academic/schools'
        ? [
            {
              id: 'school-a',
              schoolCode: 'A',
              name: { th: 'สำนัก A', en: 'School A' }
            },
            {
              id: 'school-b',
              schoolCode: 'B',
              name: { th: 'สำนัก B', en: 'School B' }
            }
          ]
        : path === '/academic/programs'
          ? [
              {
                id: 'program-a',
                schoolId: 'school-a',
                programCode: 'PA',
                name: { th: 'หลักสูตร A', en: 'Program A' }
              }
            ]
          : []
    if (
      path === '/academic/schools' ||
      path === '/academic/programs' ||
      path === '/users'
    ) {
      await route.fulfill({
        json: {
          items,
          meta: { total: items.length, page: 1, pageSize: 100, totalPages: 1 }
        }
      })
      return
    }
    await route.continue()
  })
  await page.goto('/app/users')
  await page.waitForLoadState('networkidle')
  await page
    .getByRole('button', { name: 'เพิ่มผู้ใช้งานใหม่', exact: true })
    .first()
    .click()
  const dialog = page.getByRole('dialog')
  await dialog
    .getByRole('button', { name: 'สำนักวิชาที่สังกัดผู้ใช้งาน', exact: true })
    .click()
  await dialog.getByRole('button', { name: 'สำนัก A (A)', exact: true }).click()
  await dialog
    .getByRole('button', { name: 'หลักสูตรที่สังกัดผู้ใช้งาน', exact: true })
    .click()
  await dialog
    .getByRole('button', { name: 'หลักสูตร A (PA)', exact: true })
    .click()
  await expect(dialog.locator('input[value="program-a"]')).toHaveCount(1)
  await dialog
    .getByRole('button', { name: 'สำนักวิชาที่สังกัดผู้ใช้งาน', exact: true })
    .click()
  await dialog.getByRole('button', { name: 'สำนัก B (B)', exact: true }).click()
  await expect(dialog.locator('input[value="program-a"]')).toHaveCount(0)
  await expect(
    dialog.getByRole('button', {
      name: 'หลักสูตรที่สังกัดผู้ใช้งาน',
      exact: true
    })
  ).toContainText('-- ทุกสาขาวิชาในสำนัก --')
})

test('account status confirmation cancels safely and confirms one request', async ({
  page
}) => {
  let status = 'active'
  let patches = 0
  await page.route('**/api/v2/**', async (route) => {
    const path = new URL(route.request().url()).pathname.replace('/api/v2', '')
    if (path === '/auth/me')
      return route.fulfill({
        json: {
          actor: {
            id: 'qa-admin',
            displayName: 'QA Admin',
            email: 'qa@example.test',
            roles: ['systemAdmin'],
            scope: { tenant: true, schoolIds: [], programIds: [] }
          }
        }
      })
    if (path === '/users/qa-user' && route.request().method() === 'PATCH') {
      patches++
      expect(route.request().postDataJSON()).toEqual({ status: 'suspended' })
      status = 'suspended'
      return route.fulfill({ json: { id: 'qa-user', status } })
    }
    if (path === '/users/summary')
      return route.fulfill({
        json: {
          total: 1,
          systemAdmin: 0,
          internshipStaff: 0,
          coordinator: 1,
          student: 0
        }
      })
    const items =
      path === '/users'
        ? [
            {
              id: 'qa-user',
              displayName: 'QA Advisor',
              email: 'advisor@example.test',
              status,
              roleAssignments: [
                {
                  role: 'coordinator',
                  active: true,
                  schoolIds: [],
                  programIds: []
                }
              ]
            }
          ]
        : []
    return route.fulfill({
      json: {
        items,
        meta: {
          page: 1,
          pageSize: 100,
          total: items.length,
          totalPages: items.length ? 1 : 0
        }
      }
    })
  })
  await page.goto('/app/users')
  await page.waitForLoadState('networkidle')
  await expect(
    page.getByText('advisor@example.test', { exact: true })
  ).toBeVisible()
  await page
    .getByRole('button', { name: 'การจัดการผู้ใช้งาน', exact: true })
    .click()
  await page
    .getByRole('menuitem', { name: 'ระงับการใช้งานบัญชี', exact: true })
    .click()
  await expect(page.getByRole('dialog')).toContainText(
    'ยืนยันเปลี่ยนสถานะบัญชี'
  )
  await page
    .getByRole('dialog')
    .getByRole('button', { name: 'ยกเลิก', exact: true })
    .click()
  expect(patches).toBe(0)
  await page
    .getByRole('button', { name: 'การจัดการผู้ใช้งาน', exact: true })
    .click()
  await page
    .getByRole('menuitem', { name: 'ระงับการใช้งานบัญชี', exact: true })
    .click()
  await page
    .getByRole('dialog')
    .getByRole('button', { name: 'ยืนยัน', exact: true })
    .click()
  await expect(
    page.getByRole('row').filter({ hasText: 'advisor@example.test' })
  ).toContainText('ระงับการใช้งาน')
  expect(patches).toBe(1)
})
