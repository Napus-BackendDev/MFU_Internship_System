import { readFile } from 'node:fs/promises'
import { expect, test } from '@playwright/test'

for (const width of [360, 1280]) {
  for (const role of ['admin', 'staff']) {
    test(`TC-ADM-035 Studio fills viewport and scrolls at ${width}px for ${role}`, async ({
      page,
      context
    }, testInfo) => {
      await page.setViewportSize({ width, height: 900 })
      if (role === 'staff')
        await context.addCookies([
          { name: 'e2e-actor', value: 'staff', url: 'http://127.0.0.1:18080' }
        ])
      await page.goto('/app/documents')
      await page.waitForLoadState('networkidle')
      await page.getByRole('button', { name: 'การจัดการเอกสาร' }).click()
      await page.getByRole('menuitem', { name: 'เปิดใน Designer' }).click()
      const dialog = page.getByRole('dialog')
      await expect(dialog).toBeVisible()
      await expect
        .poll(async () =>
          dialog.evaluate((el) => {
            const box = el.getBoundingClientRect()
            return {
              left: Math.round(box.left),
              top: Math.round(box.top),
              width: Math.round(box.width),
              height: Math.round(box.height),
              overflow: el.scrollWidth > el.clientWidth + 1
            }
          })
        )
        .toEqual({ left: 0, top: 0, width, height: 900, overflow: false })
      const save = page.getByRole('button', {
        name: 'บันทึก Draft',
        exact: true
      })
      await expect(save).toBeInViewport()
      const canvas = page.getByTestId('studio-canvas-scroll')
      await expect(canvas).toBeVisible()
      expect(await canvas.evaluate((el) => el.clientHeight)).toBeGreaterThan(
        300
      )
      await expect
        .poll(async () =>
          canvas.evaluate((el) => {
            el.scrollTop = 250
            return {
              scrollTop: el.scrollTop,
              height: el.clientHeight,
              contentHeight: el.scrollHeight,
              overflow: getComputedStyle(el).overflowY
            }
          })
        )
        .toMatchObject({ scrollTop: 250, overflow: 'auto' })
      if (width === 360) {
        await page
          .getByRole('button', { name: 'เครื่องมือ', exact: true })
          .click()
        await expect(
          page.getByRole('button', { name: 'ตัวแปร', exact: true })
        ).toBeVisible()
        await page.getByRole('button', { name: 'เอกสาร', exact: true }).click()
      }
      await page.screenshot({ path: testInfo.outputPath('studio.png') })
      await page.keyboard.press('Escape')
      await expect(dialog).toHaveCount(0)
    })
  }
  test(`TC-ADM-017 editor and simulator scroll independently at ${width}px`, async ({
    page
  }) => {
    await page.setViewportSize({ width, height: 900 })
    await page.goto('/app/evaluations/forms')
    await page.waitForLoadState('networkidle')
    await page.getByRole('button', { name: 'สร้างแบบฟอร์มใหม่' }).click()
    const dialog = page.getByRole('dialog')
    await expect(dialog).toBeVisible()
    await dialog.getByRole('button', { name: /จำลองมุมมองจริง/ }).click()
    const simulator = page.getByTestId('form-simulator-scroll')
    await expect(simulator).toBeVisible()
    expect(
      await simulator.evaluate((el) => {
        el.scrollTop = 300
        return el.scrollTop
      })
    ).toBeGreaterThan(0)
    await page.keyboard.press('Escape')
    await expect(dialog).toHaveCount(0)
  })
}

for (const [type, label] of [
  ['transcript', 'เลือกและเริ่มออกแบบ PDF'],
  ['certificate', 'เลือกและเริ่มออกแบบ Certificate']
] as const) {
  test(`TC-ADM-031 fresh ${type} starter uses licensed font and publishable canonical content`, async ({
    page
  }) => {
    let finishUpload!: () => void
    const fontReady = new Promise<void>((resolve) => {
      finishUpload = resolve
    })
    await page.route('**/api/v2/document-assets', async (route) => {
      if (route.request().method() !== 'POST') return route.continue()
      await fontReady
      await route.fulfill({
        status: 201,
        json: {
          id: 'licensed-font',
          key: 'document-assets/sarabun.ttf',
          assetType: 'font',
          originalName: 'Sarabun-Regular.ttf',
          fontFamily: 'Sarabun',
          size: 90220,
          contentType: 'font/ttf'
        }
      })
    })
    let saved: Record<string, unknown> | undefined
    await page.route('**/api/v2/document-templates', async (route) => {
      if (route.request().method() !== 'POST') return route.continue()
      saved = route.request().postDataJSON() as Record<string, unknown>
      await route.fulfill({
        status: 201,
        json: {
          id: 'new-template',
          status: 'active',
          versions: [
            {
              id: 'new-version',
              status: 'draft',
              versionNumber: 1,
              revision: 1,
              ...saved
            }
          ]
        }
      })
    })
    await page.goto('/app/documents')
    await page.waitForLoadState('networkidle')
    await page.getByRole('button', { name: 'สร้างเอกสารใหม่' }).click()
    await page.getByRole('button', { name: label }).click()
    const save = page.getByRole('button', { name: 'บันทึก Draft', exact: true })
    await expect(save).toBeDisabled()
    finishUpload()
    await expect(save).toBeEnabled()
    await save.click()
    await expect.poll(() => saved).toBeDefined()
    const fixture = JSON.parse(
      await readFile(
        new URL(`../fixtures/document-starter-${type}.json`, import.meta.url),
        'utf8'
      )
    ) as {
      width: number
      height: number
      elements: Record<string, unknown>[]
      placeholders: string[]
    }
    expect(saved).toMatchObject({
      schemaVersion: 2,
      documentType: type,
      fontAssetKeys: ['document-assets/sarabun.ttf'],
      placeholders: fixture.placeholders,
      canonicalJson: {
        width: fixture.width,
        height: fixture.height,
        elements: fixture.elements,
        editorMetadata: { backgroundType: 'none' }
      }
    })
    await expect(
      page.getByRole('button', { name: 'เผยแพร่แม่แบบ', exact: true })
    ).toBeEnabled()
  })
}

test('TC-ADM-005 manual student creation persists optional evaluator contacts', async ({
  page
}) => {
  let created: Record<string, unknown> | undefined
  await page.route('**/api/v2/students', async (route) => {
    if (route.request().method() !== 'POST') return route.continue()
    created = route.request().postDataJSON() as Record<string, unknown>
    await route.fulfill({
      status: 201,
      json: { id: 'new-student', ...created }
    })
  })
  await page.goto('/app/students')
  await page.waitForLoadState('networkidle')
  await page.getByRole('button', { name: 'เพิ่มข้อมูลด้วยตัวเอง' }).click()
  const dialog = page.getByRole('dialog')
  await dialog.getByRole('button', { name: 'สำนักวิชา', exact: true }).click()
  await dialog.locator('[data-dropdown-option]').last().click()
  await dialog
    .getByRole('button', { name: 'สาขาวิชา / หลักสูตร', exact: true })
    .click()
  await dialog.locator('[data-dropdown-option]').last().click()
  await dialog
    .locator('input[placeholder*="6631503016"]')
    .first()
    .fill('6631503999')
  await dialog.getByPlaceholder('เช่น นายกิตติศักดิ์ พัฒนา').fill('QA Student')
  await dialog
    .locator('input[type=email]')
    .first()
    .fill('student3999@example.test')
  await dialog
    .getByLabel('ชื่อผู้ประเมินสถานประกอบการ', { exact: true })
    .fill('Workplace Evaluator')
  await dialog
    .getByLabel('อีเมลผู้ประเมินสถานประกอบการ', { exact: true })
    .fill('Evaluator@Example.test')
  expect(
    await dialog.locator('form').evaluate((form) =>
      Array.from(form.querySelectorAll<HTMLInputElement>(':invalid')).map(
        (input) => ({
          id: input.id,
          name: input.name,
          placeholder: input.placeholder,
          error: input.validationMessage
        })
      )
    )
  ).toEqual([])
  await dialog.getByRole('button', { name: 'บันทึกข้อมูลนักศึกษา' }).click()
  await expect
    .poll(() => created)
    .toMatchObject({
      evaluatorName: 'Workplace Evaluator',
      evaluatorEmail: 'evaluator@example.test'
    })
})

test('TC-ADM-031 repairs a legacy Published copy without deleting valid assets or unrelated text', async ({
  page
}) => {
  const legacy = {
    id: 'document-template-version-e2e',
    templateId: 'document-template-e2e',
    status: 'published',
    versionNumber: 1,
    revision: 1,
    schemaVersion: 2,
    fontAssetKeys: [],
    placeholders: ['total_hours'],
    canonicalJson: {
      width: 794,
      height: 1040,
      editorMetadata: { backgroundType: 'watermark' },
      elements: [
        {
          id: 'hours',
          type: 'variable',
          variableKey: 'total_hours',
          content: 'รายงาน {{ total_hours }} / Keep this note',
          x: 20,
          y: 20,
          width: 700,
          fontSize: 16,
          fontFamily: 'Charm',
          fontWeight: 'normal',
          color: '#0f172a',
          textAlign: 'left'
        },
        {
          id: 'registered-emblem',
          type: 'emblem',
          assetKey: 'approved/emblem.png',
          content: 'MFU',
          x: 20,
          y: 80,
          width: 60,
          height: 60,
          fontSize: 16,
          fontWeight: 'normal',
          color: '#0f172a',
          textAlign: 'center'
        },
        {
          id: 'missing-emblem',
          type: 'emblem',
          content: 'GOLD-AWARD',
          x: 100,
          y: 80,
          width: 60,
          height: 60,
          fontSize: 16,
          fontWeight: 'normal',
          color: '#0f172a',
          textAlign: 'center'
        },
        {
          id: 'hours-table',
          type: 'custom_table',
          content: 'TABLE',
          tableData: {
            headers: ['Hours {{total_hours}}'],
            rows: [['{{ total_hours }} / Keep cell']]
          },
          x: 20,
          y: 170,
          width: 700,
          height: 120,
          fontSize: 12,
          fontWeight: 'normal',
          color: '#0f172a',
          textAlign: 'left'
        }
      ]
    }
  }
  const original = JSON.stringify(legacy)
  await page.route(
    '**/api/v2/document-template-versions/document-template-version-e2e',
    (route) => route.fulfill({ json: legacy })
  )
  await page.route('**/api/v2/document-assets', (route) =>
    route.request().method() === 'POST'
      ? route.fulfill({
          status: 201,
          json: {
            id: 'font',
            key: 'sarabun.ttf',
            fontFamily: 'Sarabun',
            assetType: 'font',
            size: 90220,
            contentType: 'font/ttf',
            originalName: 'Sarabun-Regular.ttf'
          }
        })
      : route.continue()
  )
  let saved: Record<string, unknown> | undefined
  await page.route(
    '**/api/v2/document-templates/document-template-e2e/versions',
    async (route) => {
      saved = route.request().postDataJSON() as Record<string, unknown>
      await route.fulfill({
        status: 201,
        json: {
          id: 'repaired-version',
          templateId: 'document-template-e2e',
          status: 'draft',
          versionNumber: 2,
          revision: 1,
          ...saved
        }
      })
    }
  )
  await page.goto('/app/documents')
  await page.waitForLoadState('networkidle')
  await page.getByRole('button', { name: 'การจัดการเอกสาร' }).click()
  await page.getByRole('menuitem', { name: 'เปิดใน Designer' }).click()
  page.on('dialog', (dialog) => dialog.accept())
  await page.getByRole('button', { name: 'ปรับสำเนาสำหรับ PDF' }).click()
  const save = page.getByRole('button', { name: 'บันทึก Draft', exact: true })
  await expect(save).toBeEnabled()
  await save.click()
  await expect.poll(() => saved).toBeDefined()
  const canonical = saved?.canonicalJson as {
    elements: {
      id: string
      type: string
      content: string
      assetKey?: string
      variableKey?: string
      tableData?: { headers: string[]; rows: string[][] }
    }[]
    editorMetadata: { backgroundType: string }
  }
  expect(canonical.editorMetadata.backgroundType).toBe('none')
  expect(
    canonical.elements.find((element) => element.id === 'hours')
  ).toMatchObject({
    type: 'text',
    content: 'รายงาน [ไม่มีข้อมูลชั่วโมงจากระบบ] / Keep this note'
  })
  expect(
    canonical.elements.find((element) => element.id === 'hours')
  ).not.toHaveProperty('variableKey')
  expect(
    canonical.elements.find((element) => element.id === 'registered-emblem')
      ?.assetKey
  ).toBe('approved/emblem.png')
  expect(
    canonical.elements.some((element) => element.id === 'missing-emblem')
  ).toBe(false)
  expect(
    canonical.elements.find((element) => element.id === 'hours-table')
      ?.tableData
  ).toEqual({
    headers: ['Hours [ไม่มีข้อมูลชั่วโมงจากระบบ]'],
    rows: [['[ไม่มีข้อมูลชั่วโมงจากระบบ] / Keep cell']]
  })
  expect(JSON.stringify(legacy)).toBe(original)
})
