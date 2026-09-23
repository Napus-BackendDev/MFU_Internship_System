import { describe, expect, it } from 'vitest'

import {
  buildStudentEvaluationResult,
  formatCategoryAverage
} from '../app/utils/student-evaluation-result'

describe('student evaluation result presentation', () => {
  it('keeps category scores separate and reads question labels and answers from the snapshot', () => {
    const result = buildStudentEvaluationResult({
      answers: {
        softA: 4,
        hardA: 2,
        strength: 'แก้ปัญหาเป็นระบบ',
        situation: 'คำตอบนี้ไม่ใช่ข้อเสนอแนะหรือคะแนน'
      },
      categoryScores: {
        hardSkill: {
          average: 2,
          answeredCount: 1,
          scaleMin: 1,
          scaleMax: 5
        },
        softSkill: {
          average: 4,
          answeredCount: 1,
          scaleMin: 1,
          scaleMax: 5
        },
        scoringPolicyVersion: 'mfu-category-mean-v1'
      },
      questionSnapshot: [
        {
          id: 'soft',
          title: { th: 'ทักษะทั่วไป', en: 'Soft Skills' },
          category: 'general',
          questions: [
            {
              id: 'softA',
              label: { th: 'สื่อสาร', en: 'Communication' },
              type: 'rating',
              scaleMin: 1,
              scaleMax: 5
            },
            {
              id: 'softMissing',
              label: { th: 'ทำงานร่วมกัน', en: 'Teamwork' },
              type: 'rating',
              scaleMin: 1,
              scaleMax: 5
            }
          ]
        },
        {
          id: 'hard',
          title: { th: 'ทักษะวิชาชีพ', en: 'Hard Skills' },
          category: 'special',
          questions: [
            {
              id: 'hardA',
              label: { th: 'วิเคราะห์', en: 'Analysis' },
              type: 'rating',
              scaleMin: 1,
              scaleMax: 5
            }
          ]
        },
        {
          id: 'suggestions',
          title: { th: 'ข้อเสนอแนะ', en: 'Suggestions' },
          category: 'suggestion',
          questions: [
            {
              id: 'strength',
              label: { th: 'จุดเด่น', en: 'Strengths' },
              type: 'text'
            }
          ]
        },
        {
          id: 'situation',
          title: { th: 'สถานการณ์', en: 'Situation' },
          category: 'situation',
          questions: [
            {
              id: 'situation',
              label: { th: 'สถานการณ์', en: 'Situation' },
              type: 'text'
            }
          ]
        }
      ]
    })

    expect(result.softSkillScore?.average).toBe(4)
    expect(result.hardSkillScore?.average).toBe(2)
    expect(result.softSkillQuestions).toMatchObject([
      { id: 'softA', score: 4 },
      { id: 'softMissing', score: null }
    ])
    expect(result.hardSkillQuestions).toMatchObject([{ id: 'hardA', score: 2 }])
    expect(result.suggestions).toMatchObject([
      { id: 'strength', value: 'แก้ปัญหาเป็นระบบ' }
    ])
    expect(result.suggestions.some((item) => item.id === 'situation')).toBe(
      false
    )
    expect('overallAverage' in result).toBe(false)
  })

  it('does not invent scores, questions, or comments when data is missing', () => {
    const result = buildStudentEvaluationResult({ answers: {} })

    expect(result.hardSkillScore).toBeNull()
    expect(result.softSkillScore).toBeNull()
    expect(result.hardSkillQuestions).toEqual([])
    expect(result.softSkillQuestions).toEqual([])
    expect(result.suggestions).toEqual([])
    expect(result.hasQuestionSnapshot).toBe(false)
  })

  it('formats only finite category averages and preserves empty categories', () => {
    expect(
      formatCategoryAverage({
        average: 4.25,
        answeredCount: 2,
        scaleMin: 1,
        scaleMax: 5
      })
    ).toBe('4.3')
    expect(
      formatCategoryAverage({
        average: null,
        answeredCount: 0,
        scaleMin: null,
        scaleMax: null
      })
    ).toBe('—')
    expect(
      formatCategoryAverage({
        average: Number.NaN,
        answeredCount: 1,
        scaleMin: 1,
        scaleMax: 5
      })
    ).toBe('—')
  })
})
