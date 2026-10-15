import { expect, test } from '@playwright/test'

for (const width of [360, 1280]) {
  test(`contact matching works directly by student ID and requires explicit update confirmation at ${width}px`, async ({
    page
  }) => {
    test.setTimeout(90_000)
    await page.setViewportSize({ width, height: 900 })
    let previews = 0
    await page.route('**/api/v2/students/import-preview?*', async (route) => {
      previews++
      const url = new URL(route.request().url())
      expect(url.searchParams.get('mode')).toBe('contacts')
      await route.fulfill({
        json: {
          batchId: 'contact-batch',
          mode: 'contacts',
          academicTermId: 'term-e2e',
          sourceName: 'contacts.csv',
          status: 'preview',
          questionFieldsDetected: [],
          summary: {
            total: 1,
            creates: 0,
            updates: 1,
            unchanged: 0,
            invalid: 0,
            warnings: 0,
            committed: 0
          },
          items: [
            {
              id: 'contact-row',
              sheet: 'Contacts',
              rowNumber: 2,
              action: 'update',
              status: 'pending',
              student: {
                studentId: '6631503001',
                name: 'Synthetic Student',
                email: 'student@example.test'
              },
              issues: [],
              warnings: [],
              changes: [
                {
                  field: 'advisorEmail',
                  before: '',
                  after: 'advisor@example.test'
                },
                {
                  field: 'evaluatorEmail',
                  before: '',
                  after: 'evaluator@example.test'
                }
              ]
            }
          ]
        }
      })
    })
    await page.goto('/app/students')
    await page.waitForLoadState('networkidle')
    await expect(
      page.getByRole('columnheader', {
        name: 'อาจารย์ที่ปรึกษา / ผู้ประสานงาน'
      })
    ).toBeVisible()
    const evaluatorSummary = page.getByTestId('student-contacts').nth(0)
    const advisorSummary = page.getByTestId('student-contacts').nth(1)
    await expect(evaluatorSummary).toContainText('evaluator@example.test')
    await expect(advisorSummary).toContainText('Academic Coordinator')
    await expect(advisorSummary).toContainText('Site Visitor')
    await expect(advisorSummary).not.toContainText('ขาดอีเมล')
    await page.getByRole('button', { name: 'นำเข้าจาก Excel' }).click()
    await page.getByRole('combobox', { name: 'ประเภทข้อมูลนำเข้า' }).click()
    await page
      .getByRole('option', {
        name: '2. จับคู่อาจารย์และผู้ประเมิน (Checklist)'
      })
      .click()
    const upload = page.getByRole('dialog').locator('input[type=file]')
    const file = {
      name: 'contacts.csv',
      mimeType: 'text/csv',
      buffer: Buffer.from(
        'Student ID,advisorEmail\n6631503001,advisor@example.test'
      )
    }
    await upload.setInputFiles(file)
    expect(previews).toBe(1)
    await expect(
      page.getByRole('button', { name: 'ยืนยันนำเข้าข้อมูล (1 รายการ)' })
    ).toBeEnabled()
    await expect(
      page.getByRole('dialog').getByText('พร้อมอัปเดต')
    ).toBeVisible()
    const confirmRow = page.getByRole('checkbox', {
      name: 'ยืนยันแถว Contacts/2'
    })
    await confirmRow.uncheck()
    await expect(
      page.getByRole('button', { name: 'ยืนยันนำเข้าข้อมูล (0 รายการ)' })
    ).toBeDisabled()
    await confirmRow.check()
    await expect(
      page.getByRole('button', { name: 'ยืนยันนำเข้าข้อมูล (1 รายการ)' })
    ).toBeEnabled()
    expect(
      await page
        .getByRole('dialog')
        .evaluate((el) => el.scrollWidth <= el.clientWidth + 1)
    ).toBe(true)
  })
}
