import { expect, test } from '@playwright/test'

test('existing competency form keeps its code and saves both localized names', async ({
  page
}) => {
  let name = { th: 'ชื่อเดิม', en: 'Original name' }
  let nameWrites = 0
  const master = (): {
    id: string
    code: string
    name: { th: string; en: string }
    status: string
  } => ({
    id: 'metadata-form',
    code: 'FIXED-CODE',
    name,
    status: 'active'
  })
  const version = {
    id: 'metadata-draft',
    competencySetId: 'metadata-form',
    versionNumber: 1,
    status: 'draft',
    sections: [
      {
        id: 'general',
        title: { th: 'ทั่วไป', en: 'General' },
        category: 'general',
        questions: [
          {
            id: 'q1',
            label: { th: 'ทดสอบ', en: 'Test' },
            type: 'rating',
            required: true,
            scaleMin: 1,
            scaleMax: 5
          }
        ]
      }
    ]
  }
  await page.route('**/api/v2/**', async (route) => {
    const path = new URL(route.request().url()).pathname.replace('/api/v2', '')
    if (path === '/auth/me')
      return route.fulfill({
        json: {
          actor: {
            id: 'qa-admin',
            displayName: 'QA',
            email: 'qa@example.test',
            roles: ['systemAdmin'],
            scope: { tenant: true, schoolIds: [], programIds: [] }
          }
        }
      })
    if (path === '/competency-sets')
      return route.fulfill({
        json: { items: [master()], meta: { page: 1, pageSize: 50, total: 1 } }
      })
    if (path === '/competency-sets/metadata-form/versions')
      return route.fulfill({ json: [version] })
    if (path === '/competency-sets/metadata-form') {
      if (route.request().method() === 'GET') {
        return route.fulfill({ json: master() })
      }
      expect(route.request().method()).toBe('PATCH')
      const body = route.request().postDataJSON() as { name: typeof name }
      expect(Object.keys(body)).toEqual(['name'])
      name = body.name
      nameWrites += 1
      return route.fulfill({ json: master() })
    }
    if (path === '/competency-set-versions/metadata-draft')
      return route.fulfill({ json: version })
    return route.fulfill({
      json: { items: [], meta: { total: 0, page: 1, pageSize: 100 } }
    })
  })
  await page.goto('/app/support')
  await page.waitForLoadState('networkidle')
  await page.getByRole('link', { name: 'แบบฟอร์มประเมิน', exact: true }).click()
  await expect(page.getByText('ชื่อเดิม', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'การจัดการแบบฟอร์ม' }).click()
  await page.getByRole('menuitem', { name: 'แก้ไข / ออกแบบฟอร์ม' }).click()
  await expect(page).toHaveURL(
    /\/app\/evaluations\/forms\/create\?id=metadata-form/
  )
  const codeInput = page.getByLabel('รหัสแบบฟอร์ม', { exact: true })
  await expect(codeInput).toBeDisabled()
  await page.getByLabel('ชื่อแบบฟอร์มภาษาไทย', { exact: true }).fill('ชื่อใหม่')
  await page
    .getByLabel('ชื่อแบบฟอร์มภาษาอังกฤษ', { exact: true })
    .fill('Renamed form')
  await page
    .getByRole('button', { name: 'บันทึกการแก้ไข', exact: true })
    .first()
    .click()
  await expect(page).toHaveURL('/app/evaluations/forms')
  expect(nameWrites).toBe(1)
  await expect(page.getByText('ชื่อใหม่', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'การจัดการแบบฟอร์ม' }).click()
  await page.getByRole('menuitem', { name: 'แก้ไข / ออกแบบฟอร์ม' }).click()
  await expect(page).toHaveURL(
    /\/app\/evaluations\/forms\/create\?id=metadata-form/
  )
  await expect(
    page.getByLabel('ชื่อแบบฟอร์มภาษาไทย', { exact: true })
  ).toHaveValue('ชื่อใหม่')
  await expect(
    page.getByLabel('ชื่อแบบฟอร์มภาษาอังกฤษ', { exact: true })
  ).toHaveValue('Renamed form')
  await expect(page.getByLabel('รหัสแบบฟอร์ม', { exact: true })).toHaveValue(
    'FIXED-CODE'
  )
})
