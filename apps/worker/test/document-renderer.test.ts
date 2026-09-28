import { describe, expect, it, vi } from 'vitest'
import type { PDFFont, PDFDocument, PDFPage } from 'pdf-lib'
import type {
  CanonicalCanvasElementV2,
  CanonicalDocumentV2,
  DocumentIssueSnapshotV1
} from '@internship/shared-types'

import {
  buildDocumentValues,
  renderDocumentTemplate
} from '../src/runtime/document-renderer.js'

function createSnapshot(): DocumentIssueSnapshotV1 {
  return {
    snapshotVersion: 1,
    capturedAt: '2026-09-25T00:00:00.000Z',
    documentNumber: 'MFU-CERT-TEST-001',
    template: {
      versionId: 'template-version-1',
      documentType: 'certificate',
      schemaVersion: 2,
      canonicalJson: {},
      placeholders: [],
      fontAssets: [{ key: 'private/font.ttf', sha256: 'a'.repeat(64) }]
    },
    student: {
      recordId: 'student-record-1',
      studentId: '6531501001',
      name: { th: 'นักศึกษาทดสอบ', en: 'Test Student' },
      academicYear: 2569,
      schoolId: 'school-1',
      schoolName: { th: 'สำนักวิชา', en: 'School' },
      programId: 'program-1',
      programName: { th: 'หลักสูตร', en: 'Program' }
    },
    placement: {
      id: 'placement-1',
      organizationId: 'organization-1',
      organizationName: { th: 'สถานประกอบการ', en: 'Organization' },
      positionTitle: { th: 'นักศึกษาฝึกงาน', en: 'Intern' },
      schoolId: 'school-1',
      programId: 'program-1',
      startsAt: '2026-06-01T00:00:00.000Z',
      endsAt: '2026-08-01T00:00:00.000Z',
      academicTermId: 'term-1',
      academicTermCode: '1/2569',
      academicYear: 2569,
      semester: '1'
    },
    evaluations: [
      {
        id: 'evaluation-1',
        assignmentId: 'assignment-1',
        version: 1,
        submittedAt: '2026-09-24T00:00:00.000Z',
        answers: {},
        questionSnapshot: [],
        categoryScores: {
          hardSkill: {
            average: 4.25,
            answeredCount: 4,
            scaleMin: 1,
            scaleMax: 5
          },
          softSkill: {
            average: 3.5,
            answeredCount: 2,
            scaleMin: 1,
            scaleMax: 5
          },
          scoringPolicyVersion: 'mvp-v1'
        }
      }
    ]
  }
}

function element(
  id: string,
  type: CanonicalCanvasElementV2['type'],
  overrides: Partial<CanonicalCanvasElementV2> = {}
): CanonicalCanvasElementV2 {
  return {
    id,
    type,
    content: 'ตัวอย่าง',
    x: 10,
    y: 10,
    width: 120,
    height: 36,
    fontSize: 12,
    fontWeight: 'normal',
    color: '#0f172a',
    textAlign: 'left',
    ...overrides
  }
}

function createRendererMocks(): {
  page: PDFPage
  font: PDFFont
  pdf: PDFDocument
  drawText: ReturnType<typeof vi.fn>
  drawRectangle: ReturnType<typeof vi.fn>
  drawEllipse: ReturnType<typeof vi.fn>
  drawLine: ReturnType<typeof vi.fn>
  drawSvgPath: ReturnType<typeof vi.fn>
  drawImage: ReturnType<typeof vi.fn>
  embedPng: ReturnType<typeof vi.fn>
} {
  const drawText = vi.fn()
  const drawRectangle = vi.fn()
  const drawEllipse = vi.fn()
  const drawLine = vi.fn()
  const drawSvgPath = vi.fn()
  const drawImage = vi.fn()
  const page = {
    drawText,
    drawRectangle,
    drawEllipse,
    drawLine,
    drawSvgPath,
    drawImage
  } as unknown as PDFPage
  const font = {
    widthOfTextAtSize: vi.fn(
      (value: string, size: number) => Array.from(value).length * size * 0.5
    )
  } as unknown as PDFFont
  const embedPng = vi.fn().mockResolvedValue({ width: 120, height: 60 })
  const pdf = { embedPng } as unknown as PDFDocument
  return {
    page,
    font,
    pdf,
    drawText,
    drawRectangle,
    drawEllipse,
    drawLine,
    drawSvgPath,
    drawImage,
    embedPng
  }
}

describe('V2 document renderer', () => {
  it('maps captured sources and separate category averages into placeholders', () => {
    const values = buildDocumentValues(createSnapshot())
    expect(values).toMatchObject({
      student_id: '6531501001',
      student_name_th: 'นักศึกษาทดสอบ',
      organization_name: 'สถานประกอบการ',
      academic_year: '2569',
      evaluation_count: '1',
      hard_skill_average: '4.3',
      hard_skill_answered_count: '4',
      soft_skill_average: '3.5',
      soft_skill_answered_count: '2',
      doc_number: 'MFU-CERT-TEST-001'
    })
    expect(values.hard_skill_average).not.toBe(values.soft_skill_average)
  })

  it('resolves placeholders in custom table headers and cells', async () => {
    const snapshot = createSnapshot()
    const canonical: CanonicalDocumentV2 = {
      width: 300,
      height: 300,
      elements: [
        element('custom', 'custom_table', {
          content: 'CUSTOM_TABLE',
          width: 300,
          height: 60,
          tableData: {
            headers: ['Student', '{{student_name_th}}'],
            rows: [['Student ID', '{{student_id}}']]
          }
        })
      ]
    }
    const { page, font, pdf, drawText } = createRendererMocks()

    await renderDocumentTemplate(
      pdf,
      page,
      canonical,
      2,
      snapshot,
      font,
      new Map()
    )

    const renderedTexts = drawText.mock.calls.map(([text]) => String(text))
    expect(renderedTexts).toContain('นักศึกษาทดสอบ')
    expect(renderedTexts).toContain('6531501001')
    expect(renderedTexts.some((text) => text.includes('{{'))).toBe(false)
  })

  it('renders all editor element families with registered snapshot images', async () => {
    const snapshot = createSnapshot()
    const canonical: CanonicalDocumentV2 = {
      width: 500,
      height: 700,
      elements: [
        element('title', 'heading', {
          content: 'ผลฝึกงานของ {{student_name_th}}',
          fontWeight: 'bold'
        }),
        element('id', 'variable', {
          content: 'รหัส {{student_id}}',
          variableKey: 'student_id'
        }),
        element('badge', 'badge', {
          content: 'ปี {{academic_year}}',
          bgColor: '#f1f5f9',
          borderRadius: 6,
          padding: 4
        }),
        element('competencies', 'table', {
          content: 'COMPETENCY_TABLE',
          width: 300,
          height: 100
        }),
        element('custom', 'custom_table', {
          content: 'CUSTOM_TABLE',
          width: 300,
          height: 100,
          tableData: { headers: ['หัวข้อ', 'คะแนน'], rows: [['Soft', '3.5']] }
        }),
        element('logo', 'emblem', {
          content: 'MFU-CREST',
          assetKey: 'private/emblem.png',
          width: 60,
          height: 60
        }),
        element('signatures', 'signature', {
          content: 'DUAL_SIGNATURES',
          assetKeys: ['private/signature-a.png', 'private/signature-b.png'],
          width: 220,
          height: 80
        }),
        element('divider', 'divider', { width: 200, height: 1 }),
        element('rect', 'shape', {
          content: 'กรอบ',
          shapeType: 'rectangle',
          bgColor: '#ffffff',
          borderColor: '#cbd5e1',
          borderWidth: 1
        }),
        element('rounded', 'shape', {
          content: '',
          shapeType: 'rectangle',
          borderRadius: 8,
          bgColor: '#f8fafc'
        }),
        element('circle', 'shape', { content: '', shapeType: 'circle' }),
        element('line', 'shape', { content: '', shapeType: 'line' }),
        element('star', 'shape', { content: '★', shapeType: 'star' })
      ]
    }
    const {
      page,
      font,
      pdf,
      drawText,
      drawRectangle,
      drawEllipse,
      drawLine,
      drawSvgPath,
      drawImage,
      embedPng
    } = createRendererMocks()
    const imageBytes = new Map([
      ['private/emblem.png', new Uint8Array([1])],
      ['private/signature-a.png', new Uint8Array([2])],
      ['private/signature-b.png', new Uint8Array([3])]
    ])

    await renderDocumentTemplate(
      pdf,
      page,
      canonical,
      2,
      snapshot,
      font,
      imageBytes
    )

    expect(embedPng).toHaveBeenCalledTimes(3)
    expect(drawImage).toHaveBeenCalledTimes(3)
    expect(drawText).toHaveBeenCalled()
    expect(drawRectangle).toHaveBeenCalled()
    expect(drawEllipse).toHaveBeenCalled()
    expect(drawLine).toHaveBeenCalled()
    expect(drawSvgPath).toHaveBeenCalled()
  })

  it('fails closed for unsupported values and absent image assets', async () => {
    const snapshot = createSnapshot()
    const { page, font, pdf } = createRendererMocks()
    const missingHours: CanonicalDocumentV2 = {
      width: 300,
      height: 300,
      elements: [
        element('hours', 'variable', {
          content: '{{total_hours}}',
          variableKey: 'total_hours'
        })
      ]
    }
    await expect(
      renderDocumentTemplate(
        pdf,
        page,
        missingHours,
        2,
        snapshot,
        font,
        new Map()
      )
    ).rejects.toThrow('DOCUMENT_PLACEHOLDER_SOURCE_UNAVAILABLE')

    const missingImage: CanonicalDocumentV2 = {
      width: 300,
      height: 300,
      elements: [
        element('emblem', 'emblem', { assetKey: 'private/missing.png' })
      ]
    }
    await expect(
      renderDocumentTemplate(
        pdf,
        page,
        missingImage,
        2,
        snapshot,
        font,
        new Map()
      )
    ).rejects.toThrow('DOCUMENT_IMAGE_ASSET_NOT_FOUND')
  })
})
