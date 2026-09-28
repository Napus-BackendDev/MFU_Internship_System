import { expect, test } from '@playwright/test'

const assignmentId = 'assignment-browser-e2e'
const pin = 'ABCD1234EFGH5678'

const actor = {
  id: 'evaluator-browser-e2e',
  email: 'evaluator@example.test',
  displayName: 'Evaluator test',
  roles: ['evaluator'],
  scope: {
    tenant: false,
    schoolIds: [],
    programIds: [],
    assignmentId
  }
}

const questionSnapshot = [
  {
    id: 'hard-skills',
    title: { th: 'ทักษะการทำงาน', en: 'Hard skills' },
    questions: [
      {
        id: 'hard-teamwork',
        label: { th: 'ทำงานเป็นทีมได้ดี', en: 'Works well in a team' },
        type: 'rating',
        required: true,
        scaleMin: 1,
        scaleMax: 5
      }
    ]
  },
  {
    id: 'soft-skills',
    title: { th: 'ทักษะการสื่อสาร Communication', en: 'Communication' },
    questions: [
      {
        id: 'soft-communication',
        label: { th: 'สื่อสารกับทีมได้ชัดเจน', en: 'Communicates clearly' },
        type: 'rating',
        required: true,
        scaleMin: 1,
        scaleMax: 5
      }
    ]
  },
  {
    id: 'situation',
    title: { th: 'สถานการณ์และข้อเสนอแนะ', en: 'Situation and feedback' },
    questions: [
      {
        id: 'situation-feedback',
        label: { th: 'ข้อเสนอแนะเพิ่มเติม', en: 'Additional feedback' },
        type: 'text',
        required: false
      }
    ]
  }
]

test('evaluator verifies PIN, resumes draft, and submits final evaluation', async ({
  page
}) => {
  let authenticated = false
  let assignmentStatus = 'pending'
  let draftAnswers: Record<string, unknown> | null = null
  let draftRevision = 0
  let failFirstDraftSave = true
  let submitBody: Record<string, unknown> | null = null
  let finalAnswers: Record<string, unknown> | null = null
  let submitIdempotencyKey: string | undefined
  let submitCount = 0

  await page.setViewportSize({ width: 360, height: 800 })
  await page.route('**/api/v2/**', async (route) => {
    const request = route.request()
    const path = new URL(request.url()).pathname.replace('/api/v2', '')
    const method = request.method()

    if (method === 'GET' && path === '/auth/me') {
      await route.fulfill(
        authenticated
          ? { json: { actor } }
          : { status: 401, json: { error: { code: 'UNAUTHENTICATED' } } }
      )
      return
    }

    if (method === 'POST' && path === '/auth/refresh') {
      await route.fulfill({
        status: 401,
        json: { error: { code: 'SESSION_NOT_FOUND' } }
      })
      return
    }

    if (method === 'POST' && path === '/public/evaluations/verify-pin') {
      const body = request.postDataJSON() as { pin?: string }
      if (body.pin !== pin) {
        await route.fulfill({
          status: 401,
          json: { error: { code: 'INVALID_PIN' } }
        })
        return
      }

      authenticated = true
      await route.fulfill({ json: { actor, assignmentId } })
      return
    }

    if (method === 'GET' && path === `/evaluations/${assignmentId}`) {
      await route.fulfill({
        json: {
          assignment: {
            id: assignmentId,
            studentId: 'student-e2e',
            deadlineAt: '2027-12-31T23:59:59.000Z',
            status: assignmentStatus,
            questionSnapshot
          },
          draft:
            assignmentStatus === 'submitted' || !draftAnswers
              ? null
              : { answers: draftAnswers, revision: draftRevision },
          evaluations:
            assignmentStatus === 'submitted'
              ? [
                  {
                    answers: finalAnswers,
                    submittedAt: '2026-09-26T00:00:00.000Z'
                  }
                ]
              : [],
          student: {
            id: 'student-record-e2e',
            studentId: 'student-e2e',
            name: { th: 'นักศึกษาทดสอบ', en: 'Test student' }
          }
        }
      })
      return
    }

    if (method === 'PUT' && path === `/evaluations/${assignmentId}/draft`) {
      const body = request.postDataJSON() as {
        answers: Record<string, unknown>
        revision: number
      }
      if (failFirstDraftSave) {
        failFirstDraftSave = false
        await route.fulfill({
          status: 409,
          json: { error: { code: 'VERSION_CONFLICT' } }
        })
        return
      }

      if (body.revision !== draftRevision) {
        await route.fulfill({
          status: 409,
          json: { error: { code: 'VERSION_CONFLICT' } }
        })
        return
      }
      draftAnswers = body.answers
      draftRevision += 1
      assignmentStatus = 'inProgress'
      await route.fulfill({
        json: { assignmentId, answers: draftAnswers, revision: draftRevision }
      })
      return
    }

    if (method === 'POST' && path === `/evaluations/${assignmentId}/submit`) {
      submitCount += 1
      submitBody = request.postDataJSON() as Record<string, unknown>
      finalAnswers = submitBody.answers as Record<string, unknown>
      draftAnswers = null
      submitIdempotencyKey = request.headers()['idempotency-key']
      assignmentStatus = 'submitted'
      await route.fulfill({
        json: {
          id: 'evaluation-final-e2e',
          assignmentId,
          submittedAt: '2026-09-26T00:00:00.000Z'
        }
      })
      return
    }

    await route.fulfill({
      status: 404,
      json: { error: { code: 'UNEXPECTED_E2E_REQUEST', path, method } }
    })
  })

  await page.goto('/evaluate')
  await page.getByRole('button', { name: 'เปลี่ยนเป็นแบบช่องเดียว' }).click()
  await page.getByPlaceholder('กรอก PIN 16 หลัก').fill(pin)
  await page
    .getByRole('button', { name: 'ตรวจสอบรหัส PIN และเข้าสู่แบบฟอร์ม' })
    .click()

  await expect(
    page.getByRole('heading', { name: 'แบบประเมินสมรรถนะการฝึกงาน' })
  ).toBeVisible()
  await expect(page.getByText('ทักษะการสื่อสาร Communication')).toBeVisible()
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth
    )
  ).toBe(true)

  const hardSection = page
    .getByRole('group')
    .filter({ hasText: 'ทำงานเป็นทีมได้ดี' })
  const hardRating = hardSection.getByRole('radio', { name: '4' })
  await hardRating.focus()
  await page.keyboard.press('Space')
  await expect(hardRating).toBeChecked()
  await page
    .getByPlaceholder('พิมพ์ข้อเสนอแนะหรือความคิดเห็น...')
    .fill('Resolved a difficult customer issue calmly.')

  await page.getByRole('button', { name: 'บันทึกร่าง' }).click()
  await expect(
    page.getByText('บันทึกร่างไม่สำเร็จ อาจมีข้อมูลเวอร์ชันใหม่กว่า')
  ).toBeVisible()
  await expect(hardRating).toBeChecked()

  await page.getByRole('button', { name: 'บันทึกร่าง' }).click()
  await expect.poll(() => draftRevision).toBe(1)
  expect(draftAnswers).toEqual({
    'hard-teamwork': 4,
    'situation-feedback': 'Resolved a difficult customer issue calmly.'
  })

  await page.reload()
  await expect(
    page.getByRole('heading', { name: 'แบบประเมินสมรรถนะการฝึกงาน' })
  ).toBeVisible()
  await expect(
    page
      .getByRole('group')
      .filter({ hasText: 'ทำงานเป็นทีมได้ดี' })
      .getByRole('radio', { name: '4' })
  ).toBeChecked()
  await expect(
    page.getByPlaceholder('พิมพ์ข้อเสนอแนะหรือความคิดเห็น...')
  ).toHaveValue('Resolved a difficult customer issue calmly.')

  await page.getByRole('button', { name: 'ตรวจสอบก่อนส่ง' }).click()
  await expect(
    page.getByText('หลังส่งแล้ว ผลประเมินจะถูกล็อกและไม่สามารถแก้ไขได้')
  ).toBeVisible()
  await page.getByRole('button', { name: 'ยืนยันและส่ง' }).click()
  await expect(page.getByText(/กรุณาตอบคำถามบังคับ/u)).toBeVisible()
  expect(submitCount).toBe(0)

  const softSection = page
    .getByRole('group')
    .filter({ hasText: 'สื่อสารกับทีมได้ชัดเจน' })
  const softRating = softSection.getByRole('radio', { name: '5' })
  await softRating.focus()
  await page.keyboard.press('Space')
  await expect(softRating).toBeChecked()
  await page.getByRole('button', { name: 'ตรวจสอบก่อนส่ง' }).click()
  await page.getByRole('button', { name: 'ยืนยันและส่ง' }).click()

  await expect(
    page.getByRole('heading', { name: 'ส่งผลการประเมินเรียบร้อยแล้ว' })
  ).toBeVisible()
  expect(submitCount).toBe(1)
  expect(submitIdempotencyKey).toBeTruthy()
  expect(submitBody).toEqual({
    answers: {
      'hard-teamwork': 4,
      'soft-communication': 5,
      'situation-feedback': 'Resolved a difficult customer issue calmly.'
    }
  })

  await page.reload()
  await expect(
    page.getByRole('heading', { name: 'ส่งผลการประเมินเรียบร้อยแล้ว' })
  ).toBeVisible()
  await expect(page.getByRole('radio')).toHaveCount(0)
  await expect(page.getByText('4 / 5.0 คะแนน')).toBeVisible()
  await expect(page.getByText('5 / 5.0 คะแนน')).toBeVisible()
})

test('evaluator refreshes an expired session once and saves the draft without losing answers', async ({
  page
}) => {
  let authenticated = false
  let postAuthenticationRefreshes = 0
  let draftRequests = 0
  let savedAnswers: Record<string, unknown> | null = null

  await page.route('**/api/v2/**', async (route) => {
    const request = route.request()
    const path = new URL(request.url()).pathname.replace('/api/v2', '')
    const method = request.method()

    if (method === 'GET' && path === '/auth/me') {
      await route.fulfill({
        status: 401,
        json: { error: { code: 'UNAUTHENTICATED' } }
      })
      return
    }

    if (method === 'POST' && path === '/auth/refresh') {
      if (!authenticated) {
        await route.fulfill({
          status: 401,
          json: { error: { code: 'SESSION_NOT_FOUND' } }
        })
        return
      }
      postAuthenticationRefreshes += 1
      await route.fulfill({ status: 204 })
      return
    }

    if (method === 'POST' && path === '/public/evaluations/verify-pin') {
      authenticated = true
      await route.fulfill({ json: { actor, assignmentId } })
      return
    }

    if (method === 'GET' && path === `/evaluations/${assignmentId}`) {
      await route.fulfill({
        json: {
          assignment: {
            id: assignmentId,
            studentId: 'student-e2e',
            deadlineAt: '2027-12-31T23:59:59.000Z',
            status: 'pending',
            questionSnapshot
          },
          draft: null,
          evaluations: [],
          student: {
            id: 'student-record-e2e',
            studentId: 'student-e2e',
            name: { th: 'นักศึกษาทดสอบ', en: 'Test student' }
          }
        }
      })
      return
    }

    if (method === 'PUT' && path === `/evaluations/${assignmentId}/draft`) {
      draftRequests += 1
      if (draftRequests === 1) {
        await route.fulfill({
          status: 401,
          json: { error: { code: 'UNAUTHENTICATED' } }
        })
        return
      }
      savedAnswers = (
        request.postDataJSON() as { answers: Record<string, unknown> }
      ).answers
      await route.fulfill({
        json: { assignmentId, answers: savedAnswers, revision: 1 }
      })
      return
    }

    await route.fulfill({
      status: 404,
      json: { error: { code: 'UNEXPECTED_E2E_REQUEST', path, method } }
    })
  })

  await page.goto('/evaluate')
  await page.getByRole('button', { name: 'เปลี่ยนเป็นแบบช่องเดียว' }).click()
  await page.getByPlaceholder('กรอก PIN 16 หลัก').fill(pin)
  await page
    .getByRole('button', { name: 'ตรวจสอบรหัส PIN และเข้าสู่แบบฟอร์ม' })
    .click()

  const hardSection = page
    .getByRole('group')
    .filter({ hasText: 'ทำงานเป็นทีมได้ดี' })
  const hardRating = hardSection.getByRole('radio', { name: '4' })
  await hardRating.focus()
  await page.keyboard.press('Space')
  await page
    .getByPlaceholder('พิมพ์ข้อเสนอแนะหรือความคิดเห็น...')
    .fill('Saved after refresh.')
  await page.getByRole('button', { name: 'บันทึกร่าง' }).click()

  await expect.poll(() => draftRequests).toBe(2)
  await expect
    .poll(() => savedAnswers)
    .toEqual({
      'hard-teamwork': 4,
      'situation-feedback': 'Saved after refresh.'
    })
  expect(postAuthenticationRefreshes).toBe(1)
  await expect(page.getByText(/บันทึกร่างไม่สำเร็จ/u)).toHaveCount(0)
  await expect(hardRating).toBeChecked()
})

test('shows a safe error when PIN succeeds but assignment loading fails', async ({
  page
}) => {
  await page.route('**/api/v2/**', async (route) => {
    const request = route.request()
    const path = new URL(request.url()).pathname.replace('/api/v2', '')

    if (request.method() === 'GET' && path === '/auth/me') {
      await route.fulfill({
        status: 401,
        json: { error: { code: 'UNAUTHENTICATED' } }
      })
      return
    }

    if (request.method() === 'POST' && path === '/auth/refresh') {
      await route.fulfill({
        status: 401,
        json: { error: { code: 'SESSION_NOT_FOUND' } }
      })
      return
    }

    if (
      request.method() === 'POST' &&
      path === '/public/evaluations/verify-pin'
    ) {
      await route.fulfill({ json: { actor, assignmentId } })
      return
    }

    if (request.method() === 'GET' && path === `/evaluations/${assignmentId}`) {
      await route.fulfill({
        status: 404,
        json: { error: { code: 'RESOURCE_NOT_FOUND' } }
      })
      return
    }

    await route.fulfill({
      status: 404,
      json: { error: { code: 'UNEXPECTED_E2E_REQUEST', path } }
    })
  })

  await page.goto('/evaluate')
  await page.getByRole('button', { name: 'เปลี่ยนเป็นแบบช่องเดียว' }).click()
  await page.getByPlaceholder('กรอก PIN 16 หลัก').fill(pin)
  await page
    .getByRole('button', { name: 'ตรวจสอบรหัส PIN และเข้าสู่แบบฟอร์ม' })
    .click()

  await expect(
    page.getByText('ไม่สามารถโหลดแบบฟอร์มได้ กรุณาตรวจสอบสิทธิ์หรือโหลดใหม่')
  ).toBeVisible()
})

for (const invitationState of ['expired', 'revoked', 'submitted'] as const) {
  test(`keeps ${invitationState} PIN failures on the generic verification screen`, async ({
    page
  }) => {
    let verificationRequests = 0
    let assignmentRequests = 0

    await page.route('**/api/v2/**', async (route) => {
      const request = route.request()
      const path = new URL(request.url()).pathname.replace('/api/v2', '')
      const method = request.method()

      if (method === 'GET' && path === '/auth/me') {
        await route.fulfill({
          status: 401,
          json: { error: { code: 'UNAUTHENTICATED' } }
        })
        return
      }

      if (method === 'POST' && path === '/auth/refresh') {
        await route.fulfill({
          status: 401,
          json: { error: { code: 'SESSION_NOT_FOUND' } }
        })
        return
      }

      if (method === 'POST' && path === '/public/evaluations/verify-pin') {
        verificationRequests += 1
        await route.fulfill({
          status: 401,
          json: {
            error: {
              code: 'PIN_INVALID',
              message:
                'รหัส PIN 16 หลักไม่ถูกต้อง หรือไม่พบแบบฟอร์มที่แอดมินมอบหมาย'
            }
          }
        })
        return
      }

      if (method === 'GET' && path.startsWith('/evaluations/')) {
        assignmentRequests += 1
      }

      await route.fulfill({
        status: 404,
        json: { error: { code: 'UNEXPECTED_E2E_REQUEST', path, method } }
      })
    })

    await page.goto('/evaluate')
    await page.getByRole('button', { name: 'เปลี่ยนเป็นแบบช่องเดียว' }).click()
    await page.getByPlaceholder('กรอก PIN 16 หลัก').fill(pin)
    await page
      .getByRole('button', { name: 'ตรวจสอบรหัส PIN และเข้าสู่แบบฟอร์ม' })
      .click()

    await expect(
      page.getByRole('heading', {
        name: 'สำหรับผู้ทำแบบฟอร์มประเมินการฝึกงาน'
      })
    ).toBeVisible()
    await expect(
      page.getByText(
        'รหัส PIN 16 หลักไม่ถูกต้อง หรือไม่พบแบบฟอร์มที่แอดมินมอบหมาย'
      )
    ).toBeVisible()
    await expect(
      page.getByRole('heading', { name: 'แบบประเมินสมรรถนะการฝึกงาน' })
    ).toHaveCount(0)
    expect(verificationRequests).toBe(1)
    expect(assignmentRequests).toBe(0)
  })
}
