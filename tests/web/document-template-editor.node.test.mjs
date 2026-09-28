import assert from 'node:assert/strict'
import { test } from 'node:test'

import fixture from '../../apps/web/test/fixtures/document-template-v1.ts'
import { adaptCanonicalDocumentForEditor } from '../../apps/web/app/utils/document-template-editor.ts'

test('schema v1 adapts into v2 editor layout without changing page geometry', () => {
  const adapted = adaptCanonicalDocumentForEditor(fixture, 1, [
    'student_name',
    'student_id'
  ])

  assert.deepEqual(adapted, {
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

test('unsupported schema versions, malformed v1, and undeclared placeholders fail closed', () => {
  assert.equal(adaptCanonicalDocumentForEditor(fixture, 3, []), null)
  assert.equal(
    adaptCanonicalDocumentForEditor(fixture, 1, ['student_id']),
    null
  )
  assert.equal(
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
    ),
    null
  )
})

test('schema v2 is fully validated and remains unchanged', () => {
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

  assert.deepEqual(
    adaptCanonicalDocumentForEditor(canonical, 2, ['student_name_th']),
    { document: canonical, migratedFromV1: false }
  )
  assert.equal(adaptCanonicalDocumentForEditor(canonical, 2, []), null)
})
