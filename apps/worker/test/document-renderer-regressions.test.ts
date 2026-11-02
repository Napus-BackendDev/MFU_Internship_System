import fs from 'node:fs'

import fontkit from '@pdf-lib/fontkit'
import { parseCanonicalDocumentV2 } from '@internship/shared-types'
import type {
  CanonicalCanvasElementV2,
  CanonicalDocumentV2,
  DocumentIssueSnapshotV1
} from '@internship/shared-types'
import { PDFDocument } from 'pdf-lib'
import { describe, expect, it, vi } from 'vitest'

import {
  buildDocumentValues,
  renderDocumentTemplate
} from '../src/runtime/document-renderer.js'

const score = (
  average: number,
  answeredCount: number
): {
  average: number
  answeredCount: number
  scaleMin: number
  scaleMax: number
} => ({
  average,
  answeredCount,
  scaleMin: 1,
  scaleMax: 5
})

function snapshot(
  evaluation: Partial<DocumentIssueSnapshotV1['evaluations'][number]> = {}
): DocumentIssueSnapshotV1 {
  return {
    capturedAt: '2026-09-25T00:00:00.000Z',
    documentNumber: 'MFU-TR-2569-000001',
    student: {
      studentId: '6531501001',
      name: { th: 'นักศึกษาทดสอบ', en: 'Test Student' },
      schoolName: { th: 'สำนักวิชา', en: 'School' },
      programName: { th: 'หลักสูตร', en: 'Program' }
    },
    placement: {
      organizationName: { th: 'บริษัท', en: 'Company' },
      positionTitle: { th: 'นักศึกษาฝึกงาน', en: 'Intern' },
      startsAt: '2026-06-01T00:00:00.000Z',
      endsAt: '2026-08-01T00:00:00.000Z',
      academicYear: 2569
    },
    evaluations: [
      {
        id: 'e1',
        assignmentId: 'a1',
        version: 1,
        submittedAt: '2026-09-24T00:00:00.000Z',
        answers: {},
        questionSnapshot: [],
        categoryScores: {
          hardSkill: score(4.25, 4),
          softSkill: score(3.5, 2),
          scoringPolicyVersion: 'mfu-category-mean-v1'
        },
        ...evaluation
      }
    ]
  } as unknown as DocumentIssueSnapshotV1
}

function element(
  id: string,
  type: CanonicalCanvasElementV2['type'],
  overrides: Partial<CanonicalCanvasElementV2> = {}
): CanonicalCanvasElementV2 {
  return {
    id,
    type,
    content: '',
    x: 10,
    y: 10,
    width: 120,
    height: 60,
    fontSize: 12,
    fontWeight: 'normal',
    color: '#0f172a',
    textAlign: 'left',
    ...overrides
  }
}

type Mocks = ReturnType<typeof createMocks>

function createMocks(): {
  page: Record<
    | 'drawText'
    | 'drawRectangle'
    | 'drawEllipse'
    | 'drawLine'
    | 'drawSvgPath'
    | 'drawImage',
    ReturnType<typeof vi.fn>
  >
  font: { widthOfTextAtSize: (value: string, size: number) => number }
  pdf: { embedPng: ReturnType<typeof vi.fn> }
} {
  const page = {
    drawText: vi.fn(),
    drawRectangle: vi.fn(),
    drawEllipse: vi.fn(),
    drawLine: vi.fn(),
    drawSvgPath: vi.fn(),
    drawImage: vi.fn()
  }
  const font = {
    widthOfTextAtSize: (value: string, size: number) =>
      Array.from(value).length * size * 0.5
  }
  const pdf = {
    embedPng: vi.fn().mockResolvedValue({ width: 100, height: 100 })
  }
  return { page, font, pdf }
}

async function render(
  canonical: CanonicalDocumentV2,
  source = snapshot(),
  images = new Map<string, Uint8Array>()
): Promise<Mocks> {
  const parts = createMocks()
  await renderDocumentTemplate(
    parts.pdf as never,
    parts.page as never,
    canonical,
    2,
    source,
    parts.font as never,
    images
  )
  return parts
}

describe('earned scores', () => {
  it('prints the earned and maximum score instead of an average', async () => {
    const { page } = await render({
      width: 800,
      height: 500,
      elements: [
        element('t', 'table', {
          content: 'COMPETENCY_TABLE',
          width: 700,
          height: 120
        })
      ]
    })
    const texts = page.drawText.mock.calls.map(([text]) => String(text))
    expect(texts).toEqual(
      expect.arrayContaining([
        'คะแนนที่ได้ (Earned Score)',
        '17',
        '20',
        '7',
        '10'
      ])
    )
    expect(texts).not.toContain('คะแนนเฉลี่ย')
  })

  it('derives scores from answers when the evaluation has no stored scores', () => {
    const values = buildDocumentValues(
      snapshot({
        categoryScores: null,
        answers: { q1: 5, q2: 3, c1: 'ดี' },
        questionSnapshot: [
          {
            category: 'special',
            questions: [
              { id: 'q1', type: 'rating', scaleMax: 5 },
              { id: 'q2', type: 'rating', scaleMax: 5 }
            ]
          }
        ]
      })
    )
    expect(values.hard_skill_score).toBe('8')
    expect(values.hard_skill_max_score).toBe('10')
    expect(values.soft_skill_score).toBe('—')
  })

  it('accepts the score placeholders in a saved template', () => {
    expect(
      parseCanonicalDocumentV2(
        {
          width: 500,
          height: 500,
          elements: [
            element('t', 'custom_table', {
              tableData: {
                headers: ['หมวด', 'คะแนน'],
                rows: [['Hard Skill', '{{hard_skill_score}}']]
              }
            })
          ]
        },
        2,
        ['hard_skill_score']
      )
    ).not.toBeNull()
  })
})

describe('shapes', () => {
  it('accepts the radius the designer gives a circle', () => {
    expect(
      parseCanonicalDocumentV2(
        {
          width: 500,
          height: 500,
          elements: [
            element('c', 'shape', { shapeType: 'circle', borderRadius: 9999 })
          ]
        },
        2,
        []
      )
    ).not.toBeNull()
  })

  it('anchors SVG shapes at the top edge pdf-lib flips them around', async () => {
    const { page } = await render({
      width: 500,
      height: 500,
      elements: [
        element('r', 'shape', {
          shapeType: 'rectangle',
          borderRadius: 8,
          bgColor: '#f1f5f9',
          y: 100,
          height: 60
        }),
        element('s', 'shape', { shapeType: 'star', y: 200, height: 60 })
      ]
    })
    expect(page.drawSvgPath.mock.calls[0]?.[1]).toMatchObject({ x: 10, y: 400 })
    expect(page.drawSvgPath.mock.calls[1]?.[1]).toMatchObject({ x: 10, y: 300 })
  })

  it('does not print the glyph stored on older star shapes', async () => {
    const { page } = await render({
      width: 500,
      height: 500,
      elements: [element('s', 'shape', { shapeType: 'star', content: '★' })]
    })
    expect(page.drawText).not.toHaveBeenCalled()
    expect(page.drawSvgPath).toHaveBeenCalledOnce()
  })

  it('draws a line as thick as the designer shows it', async () => {
    const { page } = await render({
      width: 500,
      height: 500,
      elements: [
        element('l', 'shape', {
          shapeType: 'line',
          height: 2,
          borderWidth: 0,
          bgColor: '#cbd5e1'
        })
      ]
    })
    expect(page.drawLine.mock.calls[0]?.[0]).toMatchObject({ thickness: 2 })
  })
})

describe('backgrounds', () => {
  const withBackground = (
    editorMetadata: Record<string, unknown>
  ): CanonicalDocumentV2 => ({
    width: 500,
    height: 700,
    elements: [],
    editorMetadata
  })

  it.each(['watermark', 'certificate_pattern', 'geometric'])(
    'draws the %s background',
    async (backgroundType) => {
      const { page } = await render(
        withBackground({ backgroundType, bgOpacity: 15 })
      )
      expect(page.drawEllipse).toHaveBeenCalled()
    }
  )

  it('covers the page with an uploaded background at the chosen opacity', async () => {
    const { page, pdf } = await render(
      withBackground({
        backgroundType: 'custom',
        backgroundAssetKey: 'document-assets/bg.png',
        bgOpacity: 20
      }),
      snapshot(),
      new Map([['document-assets/bg.png', new Uint8Array([1])]])
    )
    expect(pdf.embedPng).toHaveBeenCalledOnce()
    expect(page.drawImage.mock.calls[0]?.[1]).toMatchObject({
      width: 700,
      height: 700,
      opacity: 0.2
    })
  })

  it('fails when an uploaded background is missing from the snapshot', async () => {
    await expect(
      render(
        withBackground({
          backgroundType: 'custom',
          backgroundAssetKey: 'document-assets/bg.png'
        })
      )
    ).rejects.toThrow('DOCUMENT_IMAGE_ASSET_NOT_FOUND')
  })
})

describe('text layout', () => {
  it('breaks Thai text between words, never inside one', async () => {
    const sentence =
      'มีความกระตือรือร้นในการเรียนรู้และทำงานร่วมกับผู้อื่นได้ดีมาก'
    const { page } = await render({
      width: 500,
      height: 500,
      elements: [element('t', 'text', { content: sentence, width: 110 })]
    })
    const lines = page.drawText.mock.calls.map(([text]) => String(text))
    expect(lines.length).toBeGreaterThan(1)
    expect(lines.join('')).toBe(sentence)
    const words = Array.from(
      new Intl.Segmenter('th', { granularity: 'word' }).segment(sentence),
      (part) => part.segment
    )
    let offset = 0
    const boundaries = new Set(
      words.map((word) => {
        offset += word.length
        return offset
      })
    )
    let printed = 0
    for (const line of lines.slice(0, -1)) {
      printed += line.length
      expect(boundaries.has(printed)).toBe(true)
    }
  })

  it('prints a blank instead of failing when no comment was written', async () => {
    const { page } = await render({
      width: 500,
      height: 500,
      elements: [
        element('s', 'variable', {
          content: '{{suggestion}}',
          variableKey: 'suggestion'
        })
      ]
    })
    expect(page.drawText.mock.calls.map(([text]) => String(text))).toEqual([''])
  })

  it('keeps a long comment that outgrows its box', async () => {
    const { page } = await render({
      width: 500,
      height: 500,
      elements: [
        element('t', 'text', {
          content: 'ข้อความ '.repeat(40),
          width: 100,
          height: 20
        })
      ]
    })
    expect(page.drawText.mock.calls.length).toBeGreaterThan(1)
  })

  it('refuses to lose text past the bottom of the page', async () => {
    await expect(
      render({
        width: 500,
        height: 100,
        elements: [
          element('t', 'text', {
            content: 'ข้อความ '.repeat(100),
            width: 100,
            y: 80,
            height: 20
          })
        ]
      })
    ).rejects.toThrow('DOCUMENT_TEXT_OVERFLOW')
  })
})

describe('real PDF output', () => {
  it('renders every shape and background through pdf-lib without throwing', async () => {
    const pdf = await PDFDocument.create()
    pdf.registerFontkit(fontkit)
    const font = await pdf.embedFont(
      fs.readFileSync(new URL('../assets/tahoma.ttf', import.meta.url)),
      { subset: true }
    )
    for (const backgroundType of [
      'watermark',
      'certificate_pattern',
      'geometric'
    ]) {
      await renderDocumentTemplate(
        pdf,
        pdf.addPage([794, 1040]),
        {
          width: 794,
          height: 1040,
          editorMetadata: { backgroundType, bgOpacity: 15 },
          elements: [
            element('r', 'shape', {
              shapeType: 'rectangle',
              borderRadius: 14,
              bgColor: '#f1f5f9',
              borderColor: '#94a3b8',
              borderWidth: 1
            }),
            element('c', 'shape', {
              shapeType: 'circle',
              borderRadius: 9999,
              bgColor: '#fef3c7',
              borderColor: '#f59e0b',
              borderWidth: 2,
              y: 100
            }),
            element('s', 'shape', {
              shapeType: 'star',
              content: '★',
              y: 200,
              bgColor: '#f59e0b'
            }),
            element('l', 'shape', { shapeType: 'line', y: 300, height: 2 }),
            element('t', 'table', {
              content: 'COMPETENCY_TABLE',
              y: 400,
              width: 674,
              height: 190,
              fontSize: 11
            })
          ]
        },
        2,
        snapshot(),
        font,
        new Map()
      )
    }
    expect((await pdf.save()).byteLength).toBeGreaterThan(1000)
  })
})
