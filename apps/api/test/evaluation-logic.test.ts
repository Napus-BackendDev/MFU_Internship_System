import { describe, expect, it } from 'vitest'

import { assignmentIdWithinScope } from '../src/evaluations/evaluation-assignment.scope.js'
import { calculateCategoryScores } from '../src/evaluations/evaluation.scoring.js'
import {
  validateAnswers,
  validateCompetencySections
} from '../src/evaluations/evaluation.validation.js'
import type {
  EvaluationAssignmentRecord,
  SectionRecord
} from '../src/evaluations/evaluation.schema.js'

const sections: SectionRecord[] = [
  {
    id: 'soft',
    title: { th: 'ทักษะทั่วไป', en: 'Soft skills' },
    category: 'general',
    questions: [
      {
        id: 'soft-a',
        label: { th: 'ข้อหนึ่ง', en: 'One' },
        type: 'rating',
        required: true,
        scaleMin: 1,
        scaleMax: 5
      },
      {
        id: 'soft-b',
        label: { th: 'ข้อสอง', en: 'Two' },
        type: 'rating',
        required: false,
        scaleMin: 1,
        scaleMax: 5
      }
    ]
  },
  {
    id: 'hard',
    title: { th: 'ทักษะวิชาชีพ', en: 'Hard skills' },
    category: 'special',
    questions: [
      {
        id: 'hard-a',
        label: { th: 'ข้อสาม', en: 'Three' },
        type: 'rating',
        required: true,
        scaleMin: 1,
        scaleMax: 5
      }
    ]
  },
  {
    id: 'situation',
    title: { th: 'สถานการณ์', en: 'Situation' },
    category: 'suggestion',
    questions: [
      {
        id: 'situation-a',
        label: { th: 'เล่าเหตุการณ์', en: 'Describe' },
        type: 'rating',
        required: false,
        scaleMin: 1,
        scaleMax: 5
      }
    ]
  }
]

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
  questionSnapshot: sections
}

describe('evaluation resource and score rules', () => {
  it('keeps the requested assignment ID and authorized scope as AND conditions', () => {
    expect(assignmentIdWithinScope('requested', { _id: 'authorized' })).toEqual(
      { $and: [{ _id: 'requested' }, { _id: 'authorized' }] }
    )
  })

  it('averages hard and soft ratings independently and excludes situations', () => {
    expect(
      calculateCategoryScores(sections, {
        'soft-a': 3,
        'soft-b': 5,
        'hard-a': 4,
        'situation-a': 1
      })
    ).toEqual({
      hardSkill: {
        average: 4,
        answeredCount: 1,
        scaleMin: 1,
        scaleMax: 5
      },
      softSkill: {
        average: 4,
        answeredCount: 2,
        scaleMin: 1,
        scaleMax: 5
      },
      scoringPolicyVersion: 'mfu-category-mean-v1'
    })
  })

  it('returns null when a category has no answered ratings', () => {
    const score = calculateCategoryScores(sections, {})
    expect(score.hardSkill.average).toBeNull()
    expect(score.softSkill.average).toBeNull()
    expect(score.hardSkill.answeredCount).toBe(0)
  })

  it('rejects unknown answers in a final submission', () => {
    expect(() =>
      validateAnswers(assignment, {
        'soft-a': 3,
        'hard-a': 4,
        'not-in-snapshot': 'injected'
      })
    ).toThrow()
  })

  it('rejects mixed scales and non-unit weights before publishing', () => {
    const mixedScale = structuredClone(sections)
    mixedScale[0]!.questions[1]!.scaleMax = 10
    expect(() => validateCompetencySections(mixedScale)).toThrow()

    const weighted = structuredClone(sections)
    weighted[1]!.questions[0]!.weight = 2
    expect(() => validateCompetencySections(weighted)).toThrow()
  })
})
