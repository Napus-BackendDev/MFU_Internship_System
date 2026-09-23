import type { SectionRecord } from './evaluation.schema.js'

export interface CategoryScore {
  readonly average: number | null
  readonly answeredCount: number
  readonly scaleMin: number | null
  readonly scaleMax: number | null
}

export interface EvaluationCategoryScores {
  readonly hardSkill: CategoryScore
  readonly softSkill: CategoryScore
  readonly scoringPolicyVersion: 'mfu-category-mean-v1'
}

const emptyScore = (): CategoryScore => ({
  average: null,
  answeredCount: 0,
  scaleMin: null,
  scaleMax: null
})

export function calculateCategoryScores(
  sections: readonly SectionRecord[],
  answers: Readonly<Record<string, unknown>>
): EvaluationCategoryScores {
  const questions = {
    hardSkill: [] as Array<{ id: string; scaleMin: number; scaleMax: number }>,
    softSkill: [] as Array<{ id: string; scaleMin: number; scaleMax: number }>
  }

  for (const section of sections) {
    const category =
      section.category === 'special'
        ? 'hardSkill'
        : section.category === 'general'
          ? 'softSkill'
          : undefined
    if (!category) continue
    for (const question of section.questions) {
      if (
        question.type === 'rating' &&
        question.scaleMin !== undefined &&
        question.scaleMax !== undefined
      ) {
        questions[category].push({
          id: question.id,
          scaleMin: question.scaleMin,
          scaleMax: question.scaleMax
        })
      }
    }
  }

  const scoreCategory = (
    categoryQuestions: typeof questions.hardSkill
  ): CategoryScore => {
    const firstQuestion = categoryQuestions[0]
    if (!firstQuestion) return emptyScore()

    let total = 0
    let answeredCount = 0
    for (const question of categoryQuestions) {
      const answer = answers[question.id]
      if (typeof answer !== 'number' || !Number.isFinite(answer)) continue
      total += answer
      answeredCount += 1
    }
    return {
      average: answeredCount === 0 ? null : total / answeredCount,
      answeredCount,
      scaleMin: firstQuestion.scaleMin,
      scaleMax: firstQuestion.scaleMax
    }
  }

  return {
    hardSkill: scoreCategory(questions.hardSkill),
    softSkill: scoreCategory(questions.softSkill),
    scoringPolicyVersion: 'mfu-category-mean-v1'
  }
}
