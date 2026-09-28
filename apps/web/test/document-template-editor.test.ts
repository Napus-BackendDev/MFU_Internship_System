import { describe, expect, it } from 'vitest'

import { adaptCanonicalDocumentForEditor } from '../app/utils/document-template-editor.js'
import legacyV1Fixture from './fixtures/document-template-v1.js'

describe('document template editor schema adapter', () => {
  it('converts a valid v1 fixture into an editable v2 layout without changing page geometry', () => {
    expect(
      adaptCanonicalDocumentForEditor(legacyV1Fixture, 1, [
        'student_name',
        'student_id'
      ])
    ).toEqual({
      document: {
        width: 794,
        height: 1123,
        editorMetadata: {
          nameTh: 'แบบบันทึกผลการฝึกงาน',
          nameEn: 'Internship Transcript',
          backgroundType: 'none',
          bgOpacity: 10
        },
        elements: [
          {
            id: 'legacy-v1-text-1',
            type: 'text',
            content: '{{student_name_th}} / {{student_id}}',
            x: 30,
            y: 40,
            fontSize: 14,
            fontWeight: 'normal',
            color: '#1f2633',
            textAlign: 'left'
          }
        ]
      },
      migratedFromV1: true
    })
  })

  it('rejects malformed v1 data and versions without a supported adapter', () => {
    expect(adaptCanonicalDocumentForEditor(legacyV1Fixture, 3, [])).toBeNull()
    expect(
      adaptCanonicalDocumentForEditor(legacyV1Fixture, 1, ['student_id'])
    ).toBeNull()
    expect(
      adaptCanonicalDocumentForEditor(
        {
          width: 794,
          height: 1123,
          elements: [
            { type: 'text', x: 0, y: 0, fontSize: 300, text: 'too large' }
          ]
        },
        1,
        []
      )
    ).toBeNull()
  })

  it('validates v2 and preserves supported element data without marking migration', () => {
    const canonical = {
      width: 794,
      height: 1040,
      elements: [
        {
          id: 'heading-1',
          type: 'heading',
          content: '{{student_name_th}}',
          x: 10,
          y: 20,
          fontSize: 24,
          fontWeight: 'bold',
          color: '#1f2633',
          textAlign: 'center'
        }
      ]
    }
    expect(
      adaptCanonicalDocumentForEditor(canonical, 2, ['student_name_th'])
    ).toEqual({ document: canonical, migratedFromV1: false })
    expect(adaptCanonicalDocumentForEditor(canonical, 2, [])).toBeNull()
  })
})
