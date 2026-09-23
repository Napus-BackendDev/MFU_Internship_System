export interface EvaluationCategoryScore {
  readonly average: number | null
  readonly answeredCount: number
  readonly scaleMin: number | null
  readonly scaleMax: number | null
}

export interface EvaluationQuestionSnapshot {
  readonly id: string
  readonly label: { readonly th: string; readonly en: string }
  readonly type: 'rating' | 'text' | 'boolean'
  readonly scaleMin?: number
  readonly scaleMax?: number
}

export interface EvaluationSectionSnapshot {
  readonly id: string
  readonly title: { readonly th: string; readonly en: string }
  readonly category?: 'general' | 'special' | 'suggestion' | 'situation'
  readonly questions: readonly EvaluationQuestionSnapshot[]
}

export interface StudentEvaluationRecord {
  readonly answers?: Readonly<Record<string, unknown>>
  readonly questionSnapshot?: readonly EvaluationSectionSnapshot[]
  readonly categoryScores?: {
    readonly hardSkill: EvaluationCategoryScore
    readonly softSkill: EvaluationCategoryScore
    readonly scoringPolicyVersion: string
  }
}

export interface EvaluationRatingAnswer {
  readonly id: string
  readonly label: { readonly th: string; readonly en: string }
  readonly score: number | null
  readonly scaleMin: number | null
  readonly scaleMax: number | null
}

export interface EvaluationTextAnswer {
  readonly id: string
  readonly label: { readonly th: string; readonly en: string }
  readonly value: string | null
}

export function buildStudentEvaluationResult(
  evaluation: StudentEvaluationRecord | null | undefined
) {
  const answers = evaluation?.answers ?? {}
  const sections = evaluation?.questionSnapshot ?? []

  const ratingAnswers = (category: 'general' | 'special') =>
    sections
      .filter((section) => section.category === category)
      .flatMap((section) =>
        section.questions
          .filter((question) => question.type === 'rating')
          .map((question): EvaluationRatingAnswer => {
            const answer = answers[question.id]
            return {
              id: question.id,
              label: question.label,
              score:
                typeof answer === 'number' && Number.isFinite(answer)
                  ? answer
                  : null,
              scaleMin:
                typeof question.scaleMin === 'number' &&
                Number.isFinite(question.scaleMin)
                  ? question.scaleMin
                  : null,
              scaleMax:
                typeof question.scaleMax === 'number' &&
                Number.isFinite(question.scaleMax)
                  ? question.scaleMax
                  : null
            }
          })
      )

  const suggestions: EvaluationTextAnswer[] = sections
    .filter((section) => section.category === 'suggestion')
    .flatMap((section) =>
      section.questions
        .filter((question) => question.type === 'text')
        .map((question) => {
          const answer = answers[question.id]
          return {
            id: question.id,
            label: question.label,
            value:
              typeof answer === 'string' && answer.trim().length > 0
                ? answer.trim()
                : null
          }
        })
    )

  return {
    hardSkillScore: evaluation?.categoryScores?.hardSkill ?? null,
    softSkillScore: evaluation?.categoryScores?.softSkill ?? null,
    hardSkillQuestions: ratingAnswers('special'),
    softSkillQuestions: ratingAnswers('general'),
    suggestions,
    hasQuestionSnapshot: sections.length > 0
  } as const
}

export function formatCategoryAverage(
  score: EvaluationCategoryScore | null | undefined
): string {
  return typeof score?.average === 'number' && Number.isFinite(score.average)
    ? score.average.toFixed(1)
    : '—'
}
