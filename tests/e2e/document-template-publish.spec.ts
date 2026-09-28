import { expect, test } from '@playwright/test'

for (const publisher of [
  { role: 'System Admin', cookie: null },
  { role: 'Internship Staff', cookie: 'staff' }
]) {
  test(`${publisher.role} can publish a persisted Draft after confirmation`, async ({
    context,
    page
  }) => {
    if (publisher.cookie) {
      await context.addCookies([
        {
          name: 'e2e-actor',
          value: publisher.cookie,
          url: 'http://127.0.0.1:18080'
        }
      ])
    }
    await page.goto('/app/documents')
    await page.waitForLoadState('networkidle')

    await page.getByRole('button', { name: 'การจัดการเอกสาร' }).click()
    await page.getByRole('menuitem', { name: 'เปิดใน Designer' }).click()

    const publishButton = page.getByRole('button', {
      name: 'เผยแพร่แม่แบบ',
      exact: true
    })
    await expect(publishButton).toBeVisible()
    page.on('dialog', (dialog) => dialog.accept())

    const publishRequest = page.waitForRequest(
      (request) =>
        request.method() === 'POST' &&
        request
          .url()
          .endsWith(
            '/document-template-versions/document-template-version-e2e/publish'
          )
    )
    await publishButton.click()
    await publishRequest

    await expect(
      page.getByText('เผยแพร่แม่แบบแล้ว', { exact: true })
    ).toBeVisible()
    await expect(
      page.getByRole('button', { name: 'เผยแพร่แม่แบบ', exact: true })
    ).toHaveCount(0)
    await expect(
      page.getByRole('button', { name: 'PDF ยังไม่พร้อมออก' })
    ).toBeDisabled()
  })
}

test('Coordinator sees Published metadata only and cannot manage document templates', async ({
  context,
  page
}) => {
  await context.addCookies([
    {
      name: 'e2e-actor',
      value: 'coordinator',
      url: 'http://127.0.0.1:18080'
    }
  ])
  await page.goto('/app/documents')
  await page.waitForLoadState('networkidle')

  await expect(
    page.getByRole('button', { name: 'สร้างเอกสารใหม่' })
  ).toHaveCount(0)
  await expect(
    page.getByRole('button', { name: 'การจัดการเอกสาร' })
  ).toHaveCount(0)
  const templateRow = page
    .getByRole('row')
    .filter({ hasText: 'E2E-TRANSCRIPT' })
  await expect(templateRow).toContainText('เผยแพร่แล้ว')
  await expect(templateRow).not.toContainText('ฉบับร่าง')
})
