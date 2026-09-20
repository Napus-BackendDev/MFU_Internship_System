import { describe, expect, it } from 'vitest'

import { actorHasPermission } from '../src/auth/permission-map.js'
import type { EvaluationAssignmentRecord } from '../src/evaluations/evaluation.schema.js'
import {
  validateAnswers,
  validateDraftAnswers
} from '../src/evaluations/evaluation.validation.js'

const assignment: EvaluationAssignmentRecord = {
  cycleId: 'cycle',
  placementId: 'placement',
  evaluatorId: 'evaluator',
  studentId: 'student',
  schoolId: 'school',
  programId: 'program',
  competencySetVersionId: 'version',
  deadlineAt: new Date(Date.now() + 60_000),
  status: 'pending',
  evaluationVersion: 1,
  questionSnapshot: [
    {
      id: 'section-1',
      title: { th: 'หัวข้อ', en: 'Section' },
      questions: [
        {
          id: 'rating-1',
          label: { th: 'คะแนน', en: 'Rating' },
          type: 'rating',
          required: true,
          scaleMin: 1,
          scaleMax: 5
        },
        {
          id: 'comment-1',
          label: { th: 'ความคิดเห็น', en: 'Comment' },
          type: 'text',
          required: false
        }
      ]
    }
  ]
}

describe('authorization policy', () => {
  it('reserves system configuration for system administrators', () => {
    expect(actorHasPermission(['systemAdmin'], 'system.config.manage')).toBe(
      true
    )
    expect(
      actorHasPermission(['internshipStaff'], 'system.config.manage')
    ).toBe(false)
  })

  it('default role matrix denies evaluator administrative mutation', () => {
    expect(actorHasPermission(['evaluator'], 'students.manage')).toBe(false)
  })

  it('permits evaluator Draft and submit actions', () => {
    expect(actorHasPermission(['evaluator'], 'evaluations.draft')).toBe(true)
    expect(actorHasPermission(['evaluator'], 'evaluations.submit')).toBe(true)
  })

  it('permits student to access dashboard, evaluations, documents, and reports', () => {
    expect(actorHasPermission(['student'], 'students.read')).toBe(true)
    expect(actorHasPermission(['student'], 'organizations.read')).toBe(true)
    expect(actorHasPermission(['student'], 'evaluations.read')).toBe(true)
    expect(actorHasPermission(['student'], 'documents.readOwn')).toBe(true)
    expect(actorHasPermission(['student'], 'reports.read')).toBe(true)
    expect(actorHasPermission(['student'], 'placements.read')).toBe(true)
    expect(actorHasPermission(['student'], 'audit.read')).toBe(false)
  })
})

describe('evaluation contract', () => {
  it('allows an incomplete but type-safe Draft', () => {
    expect(() => validateDraftAnswers(assignment, {})).not.toThrow()
  })

  it('rejects incomplete final submission', () => {
    expect(() => validateAnswers(assignment, {})).toThrow()
  })

  it('accepts a complete final submission', () => {
    expect(() => validateAnswers(assignment, { 'rating-1': 5 })).not.toThrow()
  })
})
