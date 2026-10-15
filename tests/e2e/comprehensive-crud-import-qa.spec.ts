import { expect, test } from '@playwright/test'

const actor = {
  id: 'qa-admin-e2e',
  email: 'admin@mfu.ac.th',
  displayName: 'System Admin QA',
  roles: ['systemAdmin'],
  scope: { tenant: true, schoolIds: [], programIds: [] }
}

const e2eOrganizationId = '64f000000000000000000020'

function generateSampleStudentExcelBuffer(): Buffer {
  return Buffer.from(
    'PK\x03\x04\x14\x00\x00\x00\x08\x00synthetic-excel-file-content'
  )
}

interface StudentPatchPayload {
  company?: string
  evaluatorName?: string
  evaluatorEmail?: string
  companyAddress?: string
  [key: string]: unknown
}

test.describe('Comprehensive UI Operations & Verification (CRUD, Viewing, Excel Upload & Correctness)', () => {
  test('TC-STU-02 & TC-STU-03: Edit student data via UI, submit form, verify persistence & UI update', async ({
    page
  }) => {
    let studentPutPayload: StudentPatchPayload | null = null

    let currentStudent = {
      id: 'student-record-e2e',
      studentId: '6631503001',
      name: { th: 'นักศึกษาทดสอบ', en: 'Example Student' },
      email: 'student@example.test',
      schoolId: 'school-e2e',
      programId: 'program-e2e',
      academicTermId: 'term-e2e',
      semester: '1',
      academicYear: 2026,
      company: 'บริษัทเดิม จำกัด',
      companyAddress: 'เชียงใหม่',
      province: 'เชียงใหม่',
      evaluatorName: 'นายประเมิน เดิม',
      evaluatorEmail: 'old.evaluator@example.test',
      directoryRelations: {
        school: {
          id: 'school-e2e',
          schoolCode: 'SCI',
          name: { th: 'สำนักวิชาวิทยาศาสตร์', en: 'Science' }
        },
        program: {
          id: 'program-e2e',
          programCode: 'SE',
          name: { th: 'วิศวกรรมซอฟต์แวร์', en: 'Software Engineering' }
        },
        term: { id: 'term-e2e', semester: '1', academicYear: 2026 },
        placements: [
          {
            id: 'placement-e2e',
            studentId: 'student-record-e2e',
            organizationId: e2eOrganizationId,
            academicTermId: 'term-e2e',
            academicTerm: {
              id: 'term-e2e',
              semester: '1',
              academicYear: 2026
            },
            status: 'active',
            organization: {
              id: e2eOrganizationId,
              organizationCode: 'TEST',
              name: { th: 'บริษัทเดิม จำกัด', en: 'Old Company Ltd.' },
              address: {
                province: 'เชียงใหม่',
                location: 'อ.เมือง'
              }
            }
          }
        ]
      },
      status: 'active'
    }

    await page.route('**/api/v2/**', async (route) => {
      const request = route.request()
      const url = new URL(request.url())
      const path = url.pathname.replace('/api/v2', '')

      if (request.method() === 'GET' && path === '/auth/me') {
        await route.fulfill({ json: { actor } })
        return
      }

      if (request.method() === 'GET' && path === '/students') {
        await route.fulfill({
          json: {
            items: [currentStudent],
            meta: { total: 1, page: 1, pageSize: 25, totalPages: 1 }
          }
        })
        return
      }

      if (
        request.method() === 'PATCH' &&
        path === '/students/student-record-e2e'
      ) {
        studentPutPayload = request.postDataJSON() as Record<string, unknown>
        currentStudent = {
          ...currentStudent,
          company:
            (studentPutPayload.company as string) || currentStudent.company,
          evaluatorName:
            (studentPutPayload.evaluatorName as string) ||
            currentStudent.evaluatorName,
          evaluatorEmail:
            (studentPutPayload.evaluatorEmail as string) ||
            currentStudent.evaluatorEmail,
          companyAddress:
            (studentPutPayload.companyAddress as string) ||
            currentStudent.companyAddress,
          directoryRelations: {
            ...currentStudent.directoryRelations,
            placements: [
              {
                ...currentStudent.directoryRelations.placements[0],
                organization: {
                  ...currentStudent.directoryRelations.placements[0]
                    .organization,
                  name: {
                    th: (studentPutPayload.company as string) || 'บริษัทเดิม',
                    en: 'Updated Company'
                  }
                }
              }
            ]
          }
        }
        await route.fulfill({
          status: 200,
          json: currentStudent
        })
        return
      }

      await route.continue()
    })

    // 1. Visit Student Directory
    await page.goto('/app/students')
    await page.waitForLoadState('networkidle')

    // 2. Verify Table contains student record
    await expect(page.getByText('6631503001')).toBeVisible()
    await expect(page.getByText('นักศึกษาทดสอบ')).toBeVisible()

    // 3. Click Row Action Menu to open Edit Modal
    const actionMenuButton = page.getByRole('button', {
      name: 'การจัดการนักศึกษา'
    })
    await expect(actionMenuButton).toBeVisible()
    await actionMenuButton.click()

    // 4. Click 'แก้ไขข้อมูล' in Dropdown Menu
    const editMenuItem = page.getByRole('menuitem', { name: /แก้ไขข้อมูล/ })
    await expect(editMenuItem).toBeVisible()
    await editMenuItem.click()

    // 5. Verify Edit Modal is open
    const modalHeading = page.getByRole('heading', {
      name: /แก้ไขข้อมูลนักศึกษา/
    })
    await expect(modalHeading).toBeVisible()

    // 6. Fill in updated Company, Evaluator and Address
    const companyInput = page.getByPlaceholder(
      'เช่น บริษัท ดิจิทัล โซลูชั่นส์ จำกัด หรือ สวทช.'
    )
    await companyInput.fill('บริษัท ดิจิทัล ซิสเต็มส์ จำกัด (มหาชน)')

    const mentorInput = page.getByPlaceholder('เช่น นายสมบูรณ์ หัวหน้างาน')
    await mentorInput.fill('ดร. นภัส เกียรติสกุล')

    const emailInput = page.getByPlaceholder(
      'เช่น evaluator@workplace.co.th หรือ hr@company.com'
    )
    await emailInput.fill('mentor.napus@digitalsys.co.th')

    const addressInput = page.getByPlaceholder(
      'เช่น สำนักงานใหญ่ หรือ 99/1 ถ.พหลโยธิน'
    )
    await addressInput.fill('888 อาคารไซเบอร์เวิลด์ ทาวเวอร์ บี ชั้น 25')

    // 7. Click Save button
    const saveButton = page.getByRole('button', {
      name: 'บันทึกการแก้ไข'
    })
    await expect(saveButton).toBeVisible()
    await saveButton.click()

    // 8. Assert API received the exact updated values
    await expect
      .poll(() => studentPutPayload, { timeout: 10_000 })
      .not.toBeNull()
    const savedPayload = studentPutPayload as unknown as StudentPatchPayload
    expect(savedPayload.company).toBe('บริษัท ดิจิทัล ซิสเต็มส์ จำกัด (มหาชน)')
    expect(savedPayload.evaluatorName).toBe('ดร. นภัส เกียรติสกุล')
    expect(savedPayload.evaluatorEmail).toBe('mentor.napus@digitalsys.co.th')

    // 9. Verify Modal closes and updated info is reflected on UI
    await expect(modalHeading).not.toBeVisible()
    await expect(
      page.getByText('บริษัท ดิจิทัล ซิสเต็มส์ จำกัด (มหาชน)')
    ).toBeVisible()
  })

  test('TC-STU-01 & TC-DATA-01: Data correctness & credential non-leakage verification on UI', async ({
    page
  }) => {
    await page.route('**/api/v2/**', async (route) => {
      const request = route.request()
      const url = new URL(request.url())
      const path = url.pathname.replace('/api/v2', '')

      if (request.method() === 'GET' && path === '/auth/me') {
        await route.fulfill({ json: { actor } })
        return
      }

      if (request.method() === 'GET' && path === '/students') {
        await route.fulfill({
          json: {
            items: [
              {
                id: 'student-record-e2e',
                studentId: '6631503001',
                name: { th: 'นักศึกษาทดสอบ', en: 'Example Student' },
                email: 'student@example.test',
                schoolId: 'school-e2e',
                programId: 'program-e2e',
                academicTermId: 'term-e2e',
                semester: '1',
                academicYear: 2026,
                company: 'บริษัทแม่ฟ้า จำกัด',
                evaluatorName: 'อาจารย์ที่ปรึกษา',
                evaluatorEmail: 'advisor@mfu.ac.th',
                directoryRelations: {
                  school: {
                    id: 'school-e2e',
                    schoolCode: 'SCI',
                    name: { th: 'สำนักวิชาวิทยาศาสตร์', en: 'Science' }
                  },
                  program: {
                    id: 'program-e2e',
                    programCode: 'SE',
                    name: {
                      th: 'วิศวกรรมซอฟต์แวร์',
                      en: 'Software Engineering'
                    }
                  },
                  term: { id: 'term-e2e', semester: '1', academicYear: 2026 },
                  placements: [
                    {
                      id: 'placement-e2e',
                      studentId: 'student-record-e2e',
                      organizationId: e2eOrganizationId,
                      academicTermId: 'term-e2e',
                      status: 'active',
                      organization: {
                        id: e2eOrganizationId,
                        organizationCode: 'TEST',
                        name: {
                          th: 'บริษัทแม่ฟ้า จำกัด',
                          en: 'Mae Fah Co.'
                        },
                        address: {
                          province: 'เชียงราย',
                          location: 'มหาวิทยาลัยแม่ฟ้าหลวง'
                        }
                      }
                    }
                  ]
                },
                status: 'active'
              }
            ],
            meta: { total: 1, page: 1, pageSize: 25, totalPages: 1 }
          }
        })
        return
      }

      await route.continue()
    })

    await page.goto('/app/students')
    await page.waitForLoadState('networkidle')

    // 1. Verify exact columns and data fidelity
    await expect(page.getByText('6631503001')).toBeVisible()
    await expect(page.getByText('นักศึกษาทดสอบ')).toBeVisible()
    await expect(page.getByText('สำนักวิชาวิทยาศาสตร์')).toBeVisible()
    await expect(page.getByText('วิศวกรรมซอฟต์แวร์')).toBeVisible()
    await expect(page.getByText('บริษัททดสอบ')).toBeVisible()

    // 2. Data Security: verify no secret tokens, password hashes or PINs appear in page source
    const pageHtml = await page.content()
    expect(pageHtml).not.toContain('LEGACY-PIN')
    expect(pageHtml).not.toContain('INVITATION-TOKEN')
    expect(pageHtml).not.toContain('passwordHash')
    expect(pageHtml).not.toContain('mongodb://')
  })

  test('TC-IMP-01 & TC-IMP-02: Upload Excel student file, preview verification and database batch commit via UI', async ({
    page
  }) => {
    let previewRequestReceived = false
    let commitRequestReceived = false
    let committedRowIds: string[] = []

    const mockBatchId = 'batch-e2e-qa-999'

    await page.route('**/api/v2/**', async (route) => {
      const request = route.request()
      const url = new URL(request.url())
      const path = url.pathname.replace('/api/v2', '')

      if (request.method() === 'GET' && path === '/auth/me') {
        await route.fulfill({ json: { actor } })
        return
      }

      if (request.method() === 'POST' && path === '/students/import-preview') {
        previewRequestReceived = true
        await route.fulfill({
          status: 201,
          json: {
            batchId: mockBatchId,
            sourceName: 'Sample_Students.xlsx',
            summary: {
              total: 2,
              creates: 2,
              updates: 0,
              unchanged: 0,
              invalid: 0
            },
            questionFieldsDetected: [],
            items: [
              {
                id: 'row-1',
                sheet: 'Students',
                rowNumber: 2,
                action: 'create',
                status: 'pending',
                student: {
                  studentId: '6631503002',
                  name: { th: 'สมชาย สายมุ่งมั่น', en: 'Somchai Saimungman' },
                  email: 'somchai.sai@lamduan.mfu.ac.th',
                  schoolId: 'school-e2e',
                  programId: 'program-e2e',
                  schoolReference: 'SCI',
                  programReference: 'SE',
                  course: '1301301',
                  semester: '1',
                  company: 'สวทช. นวัตกรรมแห่งชาติ',
                  province: 'ปทุมธานี',
                  admissionYear: 2566
                },
                issues: [],
                warnings: [],
                changes: []
              },
              {
                id: 'row-2',
                sheet: 'Students',
                rowNumber: 3,
                action: 'create',
                status: 'pending',
                student: {
                  studentId: '6631503003',
                  name: { th: 'สมหญิง รักการเรียน', en: 'Somying Rakkanrian' },
                  email: 'somying.rak@lamduan.mfu.ac.th',
                  schoolId: 'school-e2e',
                  programId: 'program-e2e',
                  schoolReference: 'SCI',
                  programReference: 'SE',
                  course: '1301301',
                  semester: '1',
                  company: 'กสิกร บิซิเนส-เทคโนโลยี กรุ๊ป',
                  province: 'นนทบุรี',
                  admissionYear: 2566
                },
                issues: [],
                warnings: [],
                changes: []
              }
            ]
          }
        })
        return
      }

      if (
        request.method() === 'POST' &&
        path === `/students/imports/${mockBatchId}/commit`
      ) {
        commitRequestReceived = true
        const body = request.postDataJSON() as {
          decisions: Array<{ rowId: string; action: string }>
        }
        committedRowIds = body.decisions.map((d) => d.rowId)
        await route.fulfill({
          status: 200,
          json: {
            committed: 2,
            failed: 0,
            status: 'committed'
          }
        })
        return
      }

      if (
        request.method() === 'GET' &&
        path === `/students/imports/${mockBatchId}`
      ) {
        await route.fulfill({
          status: 200,
          json: {
            batchId: mockBatchId,
            sourceName: 'Sample_Students.xlsx',
            status: 'committed',
            questionFieldsDetected: [],
            summary: {
              total: 2,
              creates: 2,
              updates: 0,
              unchanged: 0,
              invalid: 0,
              committed: 2,
              warnings: 0
            },
            items: [
              {
                id: 'row-1',
                sheet: 'Students',
                rowNumber: 2,
                action: 'create',
                status: 'committed',
                student: { studentId: '6631503002' },
                issues: [],
                warnings: [],
                changes: []
              },
              {
                id: 'row-2',
                sheet: 'Students',
                rowNumber: 3,
                action: 'create',
                status: 'committed',
                student: { studentId: '6631503003' },
                issues: [],
                warnings: [],
                changes: []
              }
            ]
          }
        })
        return
      }

      await route.continue()
    })

    // 1. Visit Students page
    await page.goto('/app/students')
    await page.waitForLoadState('networkidle')

    // 2. Click button to open Excel Import Modal
    const openImportButton = page.getByRole('button', {
      name: 'นำเข้าจาก Excel'
    })
    await expect(openImportButton).toBeVisible()
    await openImportButton.click()

    // 3. Verify Import Modal opened
    await expect(page.getByText('1. ดาวน์โหลดเทมเพลตมาตรฐาน')).toBeVisible()

    // 4. Attach synthetic Excel file to file input
    const fileBuffer = generateSampleStudentExcelBuffer()
    const fileInput = page.locator('input[type="file"]')
    await fileInput.setInputFiles({
      name: 'Sample_Students.xlsx',
      mimeType:
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      buffer: fileBuffer
    })

    // 5. Assert preview request was triggered
    await expect
      .poll(() => previewRequestReceived, { timeout: 10_000 })
      .toBe(true)

    // 6. Verify Preview table displays uploaded students
    await expect(page.getByText('พร้อมนำเข้าข้อมูล (2 รายการ)')).toBeVisible()
    await expect(page.getByText('6631503002', { exact: true })).toBeVisible()
    await expect(
      page
        .getByRole('dialog')
        .getByRole('row')
        .filter({ hasText: '6631503002' })
    ).toContainText('สมชาย สายมุ่งมั่น')
    await expect(page.getByText('6631503003', { exact: true })).toBeVisible()
    await expect(
      page
        .getByRole('dialog')
        .getByRole('row')
        .filter({ hasText: '6631503003' })
    ).toContainText('สมหญิง รักการเรียน')

    // 7. Click Commit Import button
    const commitButton = page.getByRole('button', {
      name: /นำเข้าข้อมูลที่เลือก|ยืนยันนำเข้าข้อมูล/
    })
    await expect(commitButton).toBeVisible()
    await commitButton.click()

    // 8. Assert Commit request was triggered with both row IDs
    await expect
      .poll(() => commitRequestReceived, { timeout: 10_000 })
      .toBe(true)
    expect(committedRowIds).toEqual(['row-1', 'row-2'])

    // Inspect the completion result, then close it explicitly.
    await page.getByRole('button', { name: 'เสร็จสิ้นและปิดหน้าต่าง' }).click()
    await expect(page.getByText('1. ดาวน์โหลดเทมเพลตมาตรฐาน')).not.toBeVisible()
  })
})
