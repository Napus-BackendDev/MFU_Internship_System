import { parseCanonicalDocumentV2 } from '@internship/shared-types'
import { describe, expect, it } from 'vitest'
import { createDevelopmentDocumentTemplate } from '../src/scripts/development-document-templates.js'

describe('development document defaults', () => {
  it.each(['certificate', 'transcript'] as const)(
    '%s contains student identity, placement and reference data',
    (type) => {
      const template = createDevelopmentDocumentTemplate(type)
      expect(
        parseCanonicalDocumentV2(
          template.canonicalJson,
          2,
          template.placeholders
        )
      ).not.toBeNull()
      expect(template.placeholders).toEqual(
        expect.arrayContaining([
          'student_id',
          'student_name_th',
          'school_name',
          'program_name',
          'organization_name',
          'training_period',
          'doc_number',
          'issue_date'
        ])
      )
      const content = template.canonicalJson.elements
        .map((element) => element.content)
        .join('\n')
      expect(content).not.toContain('หนังสือส่งตัว')
      if (type === 'transcript') {
        expect(content).toContain('INTERNSHIP TRANSCRIPT')
        expect(template.canonicalJson.elements).toEqual(
          expect.arrayContaining([
            expect.objectContaining({
              type: 'table',
              content: 'COMPETENCY_TABLE'
            })
          ])
        )
      } else {
        expect(content).toContain('ใบประกาศนียบัตรรับรองการฝึกงาน')
      }
    }
  )
})
