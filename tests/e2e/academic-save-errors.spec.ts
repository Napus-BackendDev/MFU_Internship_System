import { expect, test } from '@playwright/test'

test('school duplicate error stays in the form and a corrected retry succeeds', async ({
  page
}) => {
  let fail = true
  await page.route('**/api/v2/**', async (route) => {
    const path = new URL(route.request().url()).pathname.replace('/api/v2', '')
    if (path === '/auth/me')
      return route.fulfill({
        json: {
          actor: {
            id: 'qa-admin',
            email: 'admin@mfu.ac.th',
            displayName: 'QA Admin',
            roles: ['systemAdmin'],
            scope: { tenant: true, schoolIds: [], programIds: [] }
          }
        }
      })
    if (path === '/academic/schools' && route.request().method() === 'POST') {
      if (fail)
        return route.fulfill({
          status: 409,
          json: { error: { code: 'DUPLICATE_RESOURCE' } }
        })
      return route.fulfill({ status: 201, json: { id: 'qa-school' } })
    }
    return route.fulfill({
      json: {
        items: [],
        meta: { page: 1, pageSize: 100, total: 0, totalPages: 0 }
      }
    })
  })
  await page.goto('/app/settings/academic')
  await page.waitForLoadState('networkidle')
  await page
    .getByRole('button', { name: 'เพิ่มสำนักวิชา', exact: true })
    .click()
  const form = page.getByRole('dialog')
  await form.getByRole('textbox').nth(0).fill('QA-DUP')
  await form.getByRole('textbox').nth(1).fill('สำนักวิชา QA')
  await form.getByRole('textbox').nth(2).fill('QA School')
  await form
    .getByRole('button', { name: 'สร้างสำนักวิชา', exact: true })
    .click()
  await expect(form.getByRole('alert')).toContainText(
    'รหัสนี้มีอยู่แล้ว กรุณาใช้รหัสอื่น'
  )
  await expect(form.getByRole('textbox').nth(1)).toHaveValue('สำนักวิชา QA')
  fail = false
  await form.getByRole('textbox').nth(0).fill('QA-NEW')
  await form
    .getByRole('button', { name: 'สร้างสำนักวิชา', exact: true })
    .click()
  await expect(form).toBeHidden()
})

test('program school filter does not change course reference names or counts', async ({
  page
}) => {
  const schools = [
    {
      id: 'school-a',
      schoolCode: 'A',
      name: { th: 'School A', en: 'School A' },
      status: 'active'
    },
    {
      id: 'school-b',
      schoolCode: 'B',
      name: { th: 'School B', en: 'School B' },
      status: 'active'
    }
  ]
  const programs = [
    {
      id: 'program-a',
      schoolId: 'school-a',
      programCode: 'PA',
      name: { th: 'Program A', en: 'Program A' },
      status: 'active'
    },
    {
      id: 'program-b',
      schoolId: 'school-b',
      programCode: 'PB',
      name: { th: 'Program B', en: 'Program B' },
      status: 'active'
    }
  ]
  await page.route('**/api/v2/**', async (route) => {
    const url = new URL(route.request().url())
    if (url.pathname.endsWith('/auth/me'))
      return route.fulfill({
        json: {
          actor: {
            id: 'admin',
            email: 'admin@mfu.ac.th',
            roles: ['systemAdmin'],
            scope: { tenant: true, schoolIds: [], programIds: [] }
          }
        }
      })
    const items = url.pathname.endsWith('/schools')
      ? schools
      : url.pathname.endsWith('/programs')
        ? programs.filter(
            (p) =>
              !url.searchParams.get('schoolId') ||
              p.schoolId === url.searchParams.get('schoolId')
          )
        : url.pathname.endsWith('/courses')
          ? [
              {
                id: 'course-a',
                courseCode: 'CA',
                name: { th: 'Course A', en: 'Course A' },
                programIds: ['program-a'],
                status: 'active'
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
  await page.goto('/app/settings/academic')
  await page.waitForLoadState('networkidle')
  await page.getByRole('button', { name: 'รีเฟรช', exact: true }).click()
  await expect(
    page.getByRole('button', { name: 'สำนักวิชา (Schools) 2', exact: true })
  ).toBeVisible()
  await page
    .getByRole('button', { name: /สาขาวิชา \/ หลักสูตร \(Programs\)/ })
    .click()
  await page.getByLabel('สำนักวิชา:', { exact: true }).selectOption('school-b')
  await expect(page.getByRole('table')).toContainText('Program B')
  await page.getByRole('button', { name: /รายวิชา \(Courses\)/ }).click()
  await expect(
    page.getByRole('row').filter({ hasText: 'Course A' })
  ).toContainText('Program A')
  await expect(
    page.getByRole('row').filter({ hasText: 'Course A' })
  ).not.toContainText('ทุกหลักสูตร')
})
