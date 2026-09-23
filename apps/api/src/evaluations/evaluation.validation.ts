import { ConflictException, UnprocessableEntityException } from '@nestjs/common'

import type {
  EvaluationAssignmentRecord,
  QuestionRecord,
  SectionRecord
} from './evaluation.schema.js'

export function validateCompetencySections(
  sections: readonly SectionRecord[]
): void {
  if (sections.length === 0) {
    throw new UnprocessableEntityException({
      code: 'COMPETENCY_CONTRACT_INCOMPLETE',
      message: 'At least one competency section is required.'
    })
  }

  const ids = new Set<string>()
  const ratingScales = new Map<
    'general' | 'special',
    { scaleMin: number; scaleMax: number }
  >()
  for (const section of sections) {
    if (section.questions.length === 0) {
      throw new UnprocessableEntityException({
        code: 'COMPETENCY_CONTRACT_INCOMPLETE',
        message: `Section ${section.id} has no questions.`
      })
    }
    for (const question of section.questions) {
      if (ids.has(question.id)) {
        throw new UnprocessableEntityException({
          code: 'COMPETENCY_CONTRACT_INCOMPLETE',
          message: `Question ID ${question.id} is duplicated.`
        })
      }
      ids.add(question.id)
      validateQuestion(question)
      if (question.type === 'rating' && section.category !== 'suggestion') {
        if (question.weight !== undefined && question.weight !== 1) {
          throw new UnprocessableEntityException({
            code: 'SCORING_WEIGHT_NOT_SUPPORTED'
          })
        }
        const category = section.category === 'special' ? 'special' : 'general'
        const previous = ratingScales.get(category)
        const scale = {
          scaleMin: question.scaleMin!,
          scaleMax: question.scaleMax!
        }
        if (
          previous &&
          (previous.scaleMin !== scale.scaleMin ||
            previous.scaleMax !== scale.scaleMax)
        ) {
          throw new UnprocessableEntityException({
            code: 'MIXED_RATING_SCALES'
          })
        }
        ratingScales.set(category, scale)
      }
    }
  }
}

export function validateAnswers(
  assignment: EvaluationAssignmentRecord,
  answers: Readonly<Record<string, unknown>>
): void {
  assertAssignmentMutable(assignment)

  const knownQuestionIds = new Set(
    assignment.questionSnapshot
      .flatMap((section) => section.questions)
      .map((question) => question.id)
  )
  if (
    Object.keys(answers).some((questionId) => !knownQuestionIds.has(questionId))
  ) {
    throw new UnprocessableEntityException({
      code: 'EVALUATION_ANSWER_INVALID'
    })
  }

  for (const question of assignment.questionSnapshot.flatMap(
    (section) => section.questions
  )) {
    const answer = answers[question.id]
    if (
      question.required &&
      (answer === undefined || answer === null || answer === '')
    ) {
      throw new UnprocessableEntityException({
        code: 'EVALUATION_INCOMPLETE',
        message: `Question ${question.id} is required.`
      })
    }
    validateAnswerType(question, answer)
  }
}

export function validateDraftAnswers(
  assignment: EvaluationAssignmentRecord,
  answers: Readonly<Record<string, unknown>>
): void {
  assertAssignmentMutable(assignment)
  const questions = new Map(
    assignment.questionSnapshot
      .flatMap((section) => section.questions)
      .map((question) => [question.id, question] as const)
  )
  for (const [questionId, answer] of Object.entries(answers)) {
    const question = questions.get(questionId)
    if (!question) {
      throw new UnprocessableEntityException({
        code: 'EVALUATION_ANSWER_INVALID'
      })
    }
    validateAnswerType(question, answer)
  }
}

function assertAssignmentMutable(assignment: EvaluationAssignmentRecord): void {
  if (assignment.deadlineAt.getTime() <= Date.now()) {
    throw new ConflictException({ code: 'ASSIGNMENT_EXPIRED' })
  }
  if (!['pending', 'inProgress'].includes(assignment.status)) {
    throw new ConflictException({ code: 'INVALID_STATE_TRANSITION' })
  }
}

function validateQuestion(question: QuestionRecord): void {
  if (question.type !== 'rating') return
  if (
    question.scaleMin === undefined ||
    question.scaleMax === undefined ||
    question.scaleMax <= question.scaleMin
  ) {
    throw new UnprocessableEntityException({
      code: 'COMPETENCY_CONTRACT_INCOMPLETE',
      message: `Rating question ${question.id} requires a valid scale.`
    })
  }
}

function validateAnswerType(question: QuestionRecord, answer: unknown): void {
  if (answer === undefined || answer === null || answer === '') return
  if (question.type === 'text' && typeof answer !== 'string') {
    throw new UnprocessableEntityException({
      code: 'EVALUATION_ANSWER_INVALID'
    })
  }
  if (question.type === 'boolean' && typeof answer !== 'boolean') {
    throw new UnprocessableEntityException({
      code: 'EVALUATION_ANSWER_INVALID'
    })
  }
  if (
    question.type === 'rating' &&
    (typeof answer !== 'number' ||
      answer < (question.scaleMin ?? Number.NEGATIVE_INFINITY) ||
      answer > (question.scaleMax ?? Number.POSITIVE_INFINITY))
  ) {
    throw new UnprocessableEntityException({
      code: 'EVALUATION_ANSWER_INVALID'
    })
  }
}
