import { describe, expect, it } from 'vitest'

import {
  parseCanonicalDocumentV1,
  parseCanonicalDocumentV2
} from '../src/document-template.js'

describe('canonical document v1 contract', () => {
  const canonical = {
    width: 794,
    height: 1123,
    elements: [
      {
        type: 'text',
        x: 30,
        y: 40,
        fontSize: 14,
        text: '{{student_name}}'
      }
    ]
  }

  it('parses supported text elements with declared placeholders', () => {
    expect(parseCanonicalDocumentV1(canonical, 1, ['student_name'])).toEqual(
      canonical
    )
  })

  it('rejects editor elements that do not use canonical text fields', () => {
    expect(
      parseCanonicalDocumentV1(
        {
          ...canonical,
          elements: [
            { type: 'text', x: 1, y: 1, fontSize: 12, content: 'name' }
          ]
        },
        1,
        []
      )
    ).toBeNull()
  })

  it('rejects unsupported element kinds and undeclared placeholders', () => {
    expect(
      parseCanonicalDocumentV1(
        { ...canonical, elements: [{ type: 'table', x: 0, y: 0 }] },
        1,
        []
      )
    ).toBeNull()
    expect(parseCanonicalDocumentV1(canonical, 1, ['student_id'])).toBeNull()
  })

  it('rejects invalid page dimensions, element coordinates, and schema versions', () => {
    expect(
      parseCanonicalDocumentV1({ ...canonical, width: Number.NaN }, 1, [])
    ).toBeNull()
    expect(
      parseCanonicalDocumentV1(
        {
          ...canonical,
          elements: [{ ...canonical.elements[0], x: 795 }]
        },
        1,
        ['student_name']
      )
    ).toBeNull()
    expect(parseCanonicalDocumentV1(canonical, 2, ['student_name'])).toBeNull()
  })
})

describe('canonical document v2 contract', () => {
  const canvas = {
    width: 794,
    height: 1040,
    editorMetadata: { backgroundType: 'none', bgOpacity: 10 },
    elements: [
      {
        id: 'heading-1',
        type: 'heading',
        content: 'Certificate {{student_name_th}}',
        x: 10,
        y: 12,
        width: 700,
        fontSize: 24,
        fontFamily: 'Sarabun, sans-serif',
        fontWeight: 'bold',
        color: '#0f172a',
        textAlign: 'center'
      },
      {
        id: 'table-1',
        type: 'custom_table',
        content: '',
        x: 20,
        y: 200,
        width: 650,
        height: 180,
        fontSize: 11,
        fontWeight: 'normal',
        color: '#334155',
        textAlign: 'left',
        tableData: {
          headers: ['หมวด', 'คะแนน'],
          rows: [['Hard Skill', '{{hard_skill_average}}']]
        }
      },
      {
        id: 'shape-1',
        type: 'shape',
        content: '',
        x: 30,
        y: 400,
        width: 100,
        height: 40,
        fontSize: 12,
        fontWeight: 'normal',
        color: '#ffffff',
        bgColor: '#b45309',
        borderWidth: 1,
        borderColor: '#78350f',
        textAlign: 'center',
        shapeType: 'rectangle'
      }
    ]
  }

  it('parses rich canvas elements and declared supported placeholders', () => {
    expect(
      parseCanonicalDocumentV2(canvas, 2, [
        'student_name_th',
        'hard_skill_average'
      ])
    ).toEqual(canvas)
  })

  it('rejects undeclared placeholders and overall-score placeholders', () => {
    expect(
      parseCanonicalDocumentV2(
        {
          ...canvas,
          elements: [{ ...canvas.elements[0], content: '{{evaluation_grade}}' }]
        },
        2,
        ['evaluation_grade']
      )
    ).toBeNull()
    expect(
      parseCanonicalDocumentV2(
        {
          ...canvas,
          elements: [{ ...canvas.elements[0], content: '{{student_id}}' }]
        },
        2,
        []
      )
    ).toBeNull()
  })

  it('retains known but not-yet-backed placeholders in drafts', () => {
    expect(
      parseCanonicalDocumentV2(
        {
          ...canvas,
          elements: [{ ...canvas.elements[0], content: '{{total_hours}}' }]
        },
        2,
        ['total_hours']
      )
    ).not.toBeNull()
  })

  it('requires variable elements to match their declared placeholder key', () => {
    const variable = {
      ...canvas,
      elements: [
        {
          ...canvas.elements[0],
          type: 'variable',
          variableKey: 'student_id',
          content: '{{student_name_th}}'
        }
      ]
    }
    expect(
      parseCanonicalDocumentV2(variable, 2, ['student_name_th'])
    ).toBeNull()
    expect(
      parseCanonicalDocumentV2(
        {
          ...variable,
          elements: [
            {
              ...variable.elements[0],
              content: 'Student: {{student_id}}'
            }
          ]
        },
        2,
        ['student_id']
      )
    ).not.toBeNull()
  })

  it('rejects out-of-bounds elements, malformed colors, and inconsistent tables', () => {
    expect(
      parseCanonicalDocumentV2(
        {
          ...canvas,
          elements: [{ ...canvas.elements[0], x: 100, width: 700 }]
        },
        2,
        []
      )
    ).toBeNull()
    expect(
      parseCanonicalDocumentV2(
        {
          ...canvas,
          elements: [{ ...canvas.elements[0], color: 'transparent' }]
        },
        2,
        ['student_name_th']
      )
    ).toBeNull()
    expect(
      parseCanonicalDocumentV2(
        {
          ...canvas,
          elements: [
            {
              ...canvas.elements[1],
              tableData: { headers: ['one', 'two'], rows: [['one-cell']] }
            }
          ]
        },
        2,
        []
      )
    ).toBeNull()
  })
})
