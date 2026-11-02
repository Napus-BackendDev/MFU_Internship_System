import { describe, expect, it } from 'vitest'

import {
  findOverlappingPairs,
  measureDistances,
  normalizeCanvasElement,
  resizeRect,
  snapToGuides,
  upgradeLegacyScoreTable
} from '../app/utils/document-canvas'

const page = { width: 800, height: 1000 }

describe('document canvas geometry', () => {
  it('snaps to the page centre on both axes', () => {
    const result = snapToGuides(
      { x: 348, y: 447, width: 100, height: 100 },
      [],
      page
    )
    expect(result.dx).toBe(2)
    expect(result.dy).toBe(3)
    expect(result.guides).toEqual([
      { axis: 'x', position: 400, kind: 'center' },
      { axis: 'y', position: 500, kind: 'center' }
    ])
  })

  it('snaps to edges of other elements and leaves far ones alone', () => {
    const other = { x: 100, y: 100, width: 50, height: 50 }
    const near = snapToGuides(
      { x: 103, y: 300, width: 30, height: 30 },
      [other],
      page
    )
    expect(near.dx).toBe(-3)
    expect(near.guides).toContainEqual({
      axis: 'x',
      position: 100,
      kind: 'smart'
    })
    const far = snapToGuides(
      { x: 600, y: 700, width: 30, height: 30 },
      [other],
      page
    )
    expect(far).toMatchObject({ dx: 0, dy: 0, guides: [] })
  })

  it('measures the gap to the nearest neighbour only', () => {
    const distances = measureDistances(
      { x: 200, y: 100, width: 50, height: 50 },
      [
        { x: 100, y: 100, width: 50, height: 50 },
        { x: 0, y: 100, width: 50, height: 50 },
        { x: 200, y: 300, width: 50, height: 50 }
      ]
    )
    expect(distances).toContainEqual({ axis: 'x', at: 125, from: 150, to: 200 })
    expect(distances).toContainEqual({ axis: 'y', at: 225, from: 150, to: 300 })
    expect(distances).toHaveLength(2)
  })

  it('reports overlapping elements but not ones that merely touch', () => {
    expect(
      findOverlappingPairs([
        { id: 'a', x: 0, y: 0, width: 100, height: 100 },
        { id: 'b', x: 50, y: 50, width: 100, height: 100 },
        { id: 'c', x: 150, y: 0, width: 10, height: 10 }
      ])
    ).toEqual([['a', 'b']])
  })

  it('never resizes past the page or under the minimum size', () => {
    const limits = {
      pageWidth: 800,
      pageHeight: 1000,
      minWidth: 120,
      minHeight: 20
    }
    const start = { x: 700, y: 10, width: 90, height: 50 }
    expect(resizeRect(start, 'e', 500, 0, limits).width).toBe(100)
    expect(
      resizeRect({ ...start, x: 100, width: 300 }, 'w', 1000, 0, limits)
    ).toMatchObject({ x: 280, width: 120 })
    expect(resizeRect(start, 's', 0, -500, limits).height).toBe(20)
  })
})

describe('normalizeCanvasElement', () => {
  const base = {
    id: 'a',
    type: 'text',
    x: 0,
    y: 0,
    fontSize: 12
  }

  it('brings a dragged-off element back onto the page', () => {
    expect(
      normalizeCanvasElement({ ...base, x: -20, y: 990, height: 40 }, page)
    ).toMatchObject({ x: 0, y: 960 })
  })

  it('drops values that cleared number inputs leave behind', () => {
    const cleared = {
      ...base,
      width: '',
      borderWidth: '',
      padding: ''
    } as unknown as typeof base
    const result = normalizeCanvasElement(cleared, page) as typeof base & {
      width?: number
      borderWidth?: number
      padding?: number
    }
    expect(result.width).toBeUndefined()
    expect(result.borderWidth).toBe(0)
    expect(result.padding).toBe(0)
  })

  it('gives every element the one font a published template may use', () => {
    expect(
      normalizeCanvasElement(
        { ...base, fontFamily: 'Prompt, sans-serif' },
        page,
        'Sarabun'
      ).fontFamily
    ).toBe('Sarabun')
  })
})

describe('upgradeLegacyScoreTable', () => {
  it('replaces the literal placeholders of an old score table', () => {
    const upgraded = upgradeLegacyScoreTable({
      type: 'custom_table',
      tableData: {
        headers: ['หมวดทักษะ', 'คะแนนเฉลี่ย', 'คะแนนรวมทั้งหมด'],
        rows: [
          ['Hard Skill', '—', '—'],
          ['Soft Skill', '—', '—']
        ]
      }
    })
    expect(upgraded.tableData?.rows).toEqual([
      ['Hard Skill', '{{hard_skill_score}}', '{{hard_skill_max_score}}'],
      ['Soft Skill', '{{soft_skill_score}}', '{{soft_skill_max_score}}']
    ])
    expect(upgraded.tableData?.headers[1]).toBe('คะแนนที่ได้ (Earned Score)')
  })

  it('leaves tables a person has edited untouched', () => {
    const edited = {
      type: 'custom_table',
      tableData: {
        headers: ['หมวดทักษะ', 'คะแนนเฉลี่ย', 'หมายเหตุ'],
        rows: [['Hard Skill', '4.5', 'ดีมาก']]
      }
    }
    expect(upgradeLegacyScoreTable(edited)).toBe(edited)
  })
})
