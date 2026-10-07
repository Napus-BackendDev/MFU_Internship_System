import { expect, test } from '@playwright/test'

const routes = [
  '/',
  '/login',
  '/evaluate',
  '/app',
  '/app/students',
  '/app/evaluations',
  '/app/evaluations/forms',
  '/app/evaluations/cycles',
  '/app/correspondence',
  '/app/documents',
  '/app/users',
  '/app/audit',
  '/app/settings/academic',
  '/app/settings/general',
  '/app/settings/email',
  '/app/settings/smtp',
  '/app/support'
] as const

for (const width of [360, 768, 1280]) {
  for (const locale of ['th', 'en']) {
    for (const theme of ['light', 'dark'] as const) {
      test(`all routes: ${width}px ${locale} ${theme}`, async ({
        page,
        context
      }, testInfo) => {
        test.setTimeout(180_000)
        await page.setViewportSize({ width, height: 900 })
        await context.addCookies([
          {
            name: 'nuxt-color-mode',
            value: theme,
            url: 'http://127.0.0.1:18080'
          }
        ])
        await page.addInitScript((mode) => {
          if (window.top === window)
            localStorage.setItem('nuxt-color-mode', mode)
        }, theme)
        await page.emulateMedia({ colorScheme: theme, reducedMotion: 'reduce' })
        const errors: string[] = []
        page.on('pageerror', (error) => errors.push(error.message))
        for (const route of routes) {
          const path =
            locale === 'en' ? `/en${route === '/' ? '' : route}` : route
          await page.goto(path)
          await page.waitForLoadState('networkidle')
          await expect(page).toHaveURL(`http://127.0.0.1:18080${path}`)
          if (theme === 'dark')
            await expect(page.locator('html')).toHaveClass(/dark/)
          else await expect(page.locator('html')).not.toHaveClass(/dark/)
          await expect(page.locator('h1')).toHaveCount(1)
          await expect(page.locator('h1')).toBeVisible()
          expect(
            await page.evaluate(
              () => document.documentElement.scrollWidth <= innerWidth + 1
            ),
            path
          ).toBe(true)
          if (route === '/app/students') {
            await page
              .getByRole('button', { name: 'เพิ่มข้อมูลด้วยตัวเอง' })
              .click()
            await expect(page.getByRole('dialog')).toBeVisible()
            expect(
              await page
                .getByRole('dialog')
                .evaluate((el) => el.scrollWidth <= el.clientWidth + 1)
            ).toBe(true)
            await page.keyboard.press('Escape')
            await expect(page.getByRole('dialog')).toHaveCount(0)
          }
          if (route === '/app/settings/general' && width === 360) {
            await page.screenshot({
              path: testInfo.outputPath(`general-${theme}-${locale}.png`),
              fullPage: true
            })
          }
        }
        expect(errors).toEqual([])
      })
    }
  }
}

const roles = [
  'admin',
  'staff',
  'coordinator',
  'student',
  'evaluator',
  'auditor'
] as const
for (const role of roles) {
  test(`route permissions: ${role}, Thai and English`, async ({
    context,
    page
  }) => {
    test.setTimeout(180_000)
    await context.addCookies([
      { name: 'e2e-actor', value: role, url: 'http://127.0.0.1:18080' }
    ])
    for (const prefix of ['', '/en']) {
      for (const [route, allowed] of [
        ['/app/settings/smtp', ['admin']],
        ['/app/users', ['admin', 'staff']],
        ['/app/audit', ['admin', 'auditor']],
        ['/app/correspondence', ['admin', 'staff', 'auditor']],
        ['/app/students', ['admin', 'staff', 'coordinator', 'auditor']],
        [
          '/app/evaluations',
          ['admin', 'staff', 'coordinator', 'auditor', 'evaluator']
        ],
        ['/app/evaluations/forms', ['admin', 'staff']],
        ['/app/evaluations/cycles', ['admin', 'staff']],
        ['/app/documents', ['admin', 'staff', 'coordinator', 'auditor']],
        ['/app/settings/academic', ['admin', 'staff']],
        ['/app/settings/general', ['admin', 'staff']],
        ['/app/settings/email', ['admin', 'staff']],
        ['/app', roles],
        ['/app/support', roles]
      ] as const) {
        await page.goto(`${prefix}${route}`)
        await page.waitForLoadState('networkidle')
        const permitted = (allowed as readonly string[]).includes(role)
        await expect(page).toHaveURL(
          `http://127.0.0.1:18080${prefix}${permitted ? route : '/app'}`
        )
        if (role === 'student' && (!permitted || route === '/app')) {
          await expect(page.locator('h1')).toHaveText('นักศึกษาทดสอบ')
        }
      }
    }
  })
}

test('general settings preserve failures, retry, and prevent saving unloaded config', async ({
  page
}) => {
  await page.goto('/app/support')
  await page.waitForLoadState('networkidle')
  let failProvinces = true
  let failConfig = true
  await page.route('**/api/v2/system-settings/provinces*', async (route) => {
    if (failProvinces)
      await route.fulfill({ status: 503, json: { code: 'TEST_FAILURE' } })
    else await route.continue()
  })
  await page.route('**/api/v2/system-settings/general', async (route) => {
    if (failConfig)
      await route.fulfill({ status: 503, json: { code: 'TEST_FAILURE' } })
    else await route.continue()
  })
  await page.getByRole('link', { name: 'ตั้งค่าระบบ', exact: true }).click()
  await expect(
    page.getByText('โหลดข้อมูลจังหวัดไม่สำเร็จ', { exact: true })
  ).toBeVisible()
  await expect(page.getByText('ไม่พบข้อมูลจังหวัดตามเงื่อนไข')).toHaveCount(0)
  failProvinces = false
  await page.getByRole('button', { name: 'ลองโหลดจังหวัดใหม่' }).click()
  await expect(
    page.getByText('โหลดข้อมูลจังหวัดไม่สำเร็จ', { exact: true })
  ).toHaveCount(0)
  await page
    .getByRole('button', { name: 'ประเภทสถานประกอบการ (Company Types)' })
    .click()
  await expect(
    page.getByRole('button', { name: 'บันทึกประเภทสถานประกอบการ' }).last()
  ).toBeDisabled()
  failConfig = false
  await page
    .getByRole('button', { name: 'ลองโหลดประเภทสถานประกอบการใหม่' })
    .click()
  await expect(
    page.getByRole('button', { name: 'บันทึกประเภทสถานประกอบการ' }).last()
  ).toBeEnabled()
})

test('dropdown labels, keyboard, required validation and modal focus', async ({
  page
}) => {
  await page.goto('/app/audit')
  await page.waitForLoadState('networkidle')
  const trigger = page.getByRole('button', { name: 'หมวด Action', exact: true })
  await trigger.focus()
  await trigger.press('ArrowDown')
  const search = page.getByRole('searchbox', {
    name: 'หมวด Action ค้นหา',
    exact: true
  })
  await expect(search).toBeFocused()
  await search.fill('Auth')
  await expect(
    page.getByRole('button', { name: 'ล้างการค้นหา: หมวด Action' })
  ).toBeVisible()
  await page.getByRole('button', { name: 'ล้างการค้นหา: หมวด Action' }).click()
  await expect(search).toBeFocused()
  await search.press('ArrowDown')
  await expect(
    page.getByRole('button', { name: 'ทุก Action', exact: true })
  ).toBeFocused()
  await page.keyboard.press('ArrowDown')
  await page.keyboard.press('Enter')
  await expect(trigger).toBeFocused()
  await trigger.click()
  await page.keyboard.press('Escape')
  await expect(trigger).toBeFocused()
  await page.goto('/app/students')
  await page.waitForLoadState('networkidle')
  const add = page.getByRole('button', { name: 'เพิ่มข้อมูลด้วยตัวเอง' })
  await add.click()
  const dialog = page.getByRole('dialog')
  const school = dialog.getByRole('button', { name: 'สำนักวิชา', exact: true })
  const required = dialog.locator('input.sr-only[required]').first()
  expect(
    await dialog
      .locator('form')
      .evaluate((el) => (el as HTMLFormElement).checkValidity())
  ).toBe(false)
  await expect(
    dialog.getByRole('searchbox', { name: 'สำนักวิชา ค้นหา' })
  ).toBeFocused()
  await expect(
    dialog.getByRole('searchbox', { name: 'สาขาวิชา / หลักสูตร ค้นหา' })
  ).toHaveCount(0)
  await dialog.getByRole('button', { name: /SCI —/ }).click()
  expect(
    await required.evaluate((el) => (el as HTMLInputElement).checkValidity())
  ).toBe(true)
  await expect(school).toBeFocused()
  for (let i = 0; i < 30; i++) {
    await page.keyboard.press('Tab')
    expect(
      await dialog.evaluate((el) => el.contains(document.activeElement))
    ).toBe(true)
  }
  await page.keyboard.press('Escape')
  await expect(dialog).toHaveCount(0)
  await expect(add).toBeFocused()
})

test('support does not report delivery without a backend', async ({ page }) => {
  await page.goto('/app/support')
  await expect(page.getByText('ช่องทางส่งคำขอยังไม่พร้อมใช้งาน')).toBeVisible()
  await expect(
    page.getByRole('button', { name: 'ส่งข้อความถึงฝ่ายสนับสนุน' })
  ).toBeDisabled()
  await expect(
    page.getByText('เจ้าหน้าที่ผู้ดูแลระบบได้รับข้อความแล้ว')
  ).toHaveCount(0)
})

test('email and academic errors remain retryable without editing unloaded data', async ({
  page
}) => {
  await page.goto('/app/support')
  await page.waitForLoadState('networkidle')
  let failEmail = true
  await page.route('**/api/v2/email-templates/system', async (route) => {
    if (failEmail)
      await route.fulfill({ status: 503, json: { code: 'TEST_FAILURE' } })
    else await route.continue()
  })
  await page.getByRole('link', { name: 'ตั้งค่าจดหมาย', exact: true }).click()
  await expect(
    page.getByRole('button', { name: 'ลองโหลดแม่แบบใหม่' })
  ).toBeVisible()
  await expect(page.getByRole('button', { name: /บันทึกแม่แบบ/ })).toHaveCount(
    0
  )
  failEmail = false
  await page.getByRole('button', { name: 'ลองโหลดแม่แบบใหม่' }).click()
  await expect(
    page.getByRole('button', { name: 'ลองโหลดแม่แบบใหม่' })
  ).toHaveCount(0)
  let failCourses = true
  await page.route('**/api/v2/academic/courses*', async (route) => {
    if (failCourses)
      await route.fulfill({ status: 503, json: { code: 'TEST_FAILURE' } })
    else await route.continue()
  })
  await page
    .getByRole('link', { name: 'สำนักวิชาและหลักสูตร', exact: true })
    .click()
  await page.getByRole('button', { name: /^รายวิชา \(Courses\)/ }).click()
  await expect(
    page.getByRole('button', { name: 'ลองโหลดรายวิชาใหม่' })
  ).toBeVisible()
  failCourses = false
  await page.getByRole('button', { name: 'ลองโหลดรายวิชาใหม่' }).click()
  await expect(
    page.getByRole('button', { name: 'ลองโหลดรายวิชาใหม่' })
  ).toHaveCount(0)
})

test('form builder school filters work and modal contains keyboard focus at mobile and desktop', async ({
  page
}) => {
  test.setTimeout(90_000)
  for (const width of [360, 1280]) {
    await page.setViewportSize({ width, height: 900 })
    await page.goto('/app/evaluations/forms')
    await page.waitForLoadState('networkidle')
    const create = page.getByRole('button', { name: 'สร้างแบบฟอร์มใหม่' })
    await create.click()
    const dialog = page.getByRole('dialog')
    await expect(dialog).toBeVisible()
    expect(
      await dialog.evaluate((el) => {
        const rect = el.getBoundingClientRect()
        return rect.left >= 0 && rect.right <= innerWidth + 1
      })
    ).toBe(true)
    await dialog.getByRole('button', { name: /^2 หมวดเฉพาะสำนักวิชา/ }).click()
    const school = dialog.getByRole('button', {
      name: /SCI.*สำนักวิชาวิทยาศาสตร์/
    })
    await dialog.getByRole('button', { name: /^มีเกณฑ์/ }).click()
    await expect(school).toBeVisible()
    await dialog.getByRole('button', { name: /^ยังไม่ตั้ง/ }).click()
    await expect(school).toHaveCount(0)
    await dialog.getByRole('button', { name: /^ทั้งหมด \(/ }).click()
    await expect(school).toBeVisible()
    await school.focus()
    await school.press('Enter')
    expect(
      await dialog.evaluate((el) => el.contains(document.activeElement))
    ).toBe(true)
    await page.keyboard.press('Escape')
    await expect(dialog).toHaveCount(0)
    await expect(create).toBeFocused()
  }
})

test('user status change requires confirmation and preserves cancel', async ({
  page
}) => {
  let mutations = 0
  const user = {
    id: 'ui-user-e2e',
    displayName: 'Test User',
    email: 'user@example.test',
    status: 'active',
    roleAssignments: [{ role: 'internshipStaff', tenant: true, active: true }]
  }
  await page.route('**/api/v2/users**', async (route) => {
    const path = new URL(route.request().url()).pathname
    if (path.endsWith('/summary')) {
      await route.fulfill({
        json: {
          total: 1,
          systemAdmin: 0,
          internshipStaff: 1,
          coordinator: 0,
          student: 0
        }
      })
      return
    }
    if (route.request().method() === 'PATCH') {
      mutations++
      Object.assign(user, route.request().postDataJSON() as { status: string })
      await route.fulfill({ json: user })
      return
    }
    await route.fulfill({
      json: {
        items: [user],
        meta: { total: 1, page: 1, pageSize: 10, totalPages: 1 }
      }
    })
  })
  await page.goto('/app/users')
  await page.waitForLoadState('networkidle')
  const row = page.getByRole('row').filter({ hasText: 'user@example.test' })
  await row.getByRole('button', { name: 'การจัดการผู้ใช้งาน' }).click()
  page.once('dialog', async (dialog) => {
    expect(dialog.message()).toContain('user@example.test')
    await dialog.dismiss()
  })
  await page
    .getByRole('menuitem', { name: 'ระงับการใช้งานบัญชี', exact: true })
    .click()
  expect(mutations).toBe(0)
  await row.getByRole('button', { name: 'การจัดการผู้ใช้งาน' }).click()
  page.once('dialog', async (dialog) => {
    await dialog.accept()
  })
  await page
    .getByRole('menuitem', { name: 'ระงับการใช้งานบัญชี', exact: true })
    .click()
  await expect.poll(() => mutations).toBe(1)
  await expect(row).toContainText('ระงับการใช้งาน')
})

test('SMTP failure hides unloaded settings and retry restores the editor', async ({
  page
}) => {
  await page.goto('/app/support')
  await page.waitForLoadState('networkidle')
  let fail = true
  let writes = 0
  await page.route('**/api/v2/system-settings/smtp**', async (route) => {
    if (route.request().method() !== 'GET') writes++
    if (fail)
      await route.fulfill({ status: 503, json: { code: 'TEST_FAILURE' } })
    else await route.continue()
  })
  await page.getByRole('link', { name: 'ตั้งค่า SMTP', exact: true }).click()
  await expect(
    page.getByRole('button', { name: 'ลองโหลด SMTP ใหม่' })
  ).toBeVisible()
  await expect(page.locator('form')).toHaveCount(0)
  expect(writes).toBe(0)
  fail = false
  await page.getByRole('button', { name: 'ลองโหลด SMTP ใหม่' }).click()
  await expect(
    page.getByRole('button', { name: 'ลองโหลด SMTP ใหม่' })
  ).toHaveCount(0)
  await expect(page.locator('form').first()).toBeVisible()
  expect(writes).toBe(0)
})

test('failed session refresh preserves the English login route', async ({
  page
}) => {
  await page.goto('/en/app/support')
  await page.waitForLoadState('networkidle')
  await page.route('**/api/v2/system-settings/provinces', (route) =>
    route.fulfill({ status: 401, json: { code: 'SESSION_EXPIRED' } })
  )
  await page.route('**/api/v2/auth/refresh', (route) =>
    route.fulfill({ status: 401, json: { code: 'SESSION_EXPIRED' } })
  )
  await page.getByRole('link', { name: 'ตั้งค่าระบบ', exact: true }).click()
  await expect(page).toHaveURL('http://127.0.0.1:18080/en/login')
})

test('mobile menu opens, navigates, and returns focus after Escape', async ({
  page
}) => {
  test.setTimeout(60_000)
  for (const width of [360, 768]) {
    await page.setViewportSize({ width, height: 900 })
    await page.goto('/en/app/support')
    await page.waitForLoadState('networkidle')
    const toggle = page.getByRole('button', {
      name: 'เปิดเมนูหลัก',
      exact: true
    })
    await expect(toggle).toBeVisible()
    await toggle.click()
    const menu = page.getByRole('dialog', { name: 'เมนูหลัก', exact: true })
    await expect(menu).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(menu).toHaveCount(0)
    await expect(toggle).toBeFocused()
    await toggle.click()
    await menu.getByRole('link', { name: 'นักศึกษา', exact: true }).click()
    await expect(page).toHaveURL('http://127.0.0.1:18080/en/app/students')
    await expect(menu).toHaveCount(0)
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth + 1
      )
    ).toBe(true)
    await page.route('**/api/v2/auth/logout', (route) =>
      route.fulfill({ status: 204 })
    )
    await toggle.click()
    await menu.getByRole('button', { name: 'ออกจากระบบ', exact: true }).click()
    await expect(page).toHaveURL('http://127.0.0.1:18080/en/login')
  }
})
