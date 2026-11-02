import type { AuthenticatedActor } from '@internship/shared-types'
import {
  Injectable,
  NotFoundException,
  UnprocessableEntityException
} from '@nestjs/common'
import { InjectModel } from '@nestjs/mongoose'
import type { HydratedDocument, Model } from 'mongoose'

import { AuditService } from '../audit/audit.service.js'
import { assertActorScope } from '../common/scope.js'
import {
  EvaluationAssignmentRecord,
  EvaluationRecord,
  type SectionRecord
} from '../evaluations/evaluation.schema.js'
import { AiSettingsService } from './ai-settings.service.js'
import { FeedbackSummaryRecord } from './ai-settings.schema.js'

type SummaryDocument = HydratedDocument<FeedbackSummaryRecord> & {
  updatedAt?: Date
}

const MAX_FEEDBACK_LENGTH = 8000

// Only the question wording and the evaluator's free text leave the system:
// no student, evaluator or organization identifiers are sent to the provider.
export function collectFeedbackText(
  sections: readonly SectionRecord[],
  answers: Readonly<Record<string, unknown>>
): string {
  const lines: string[] = []
  for (const section of sections) {
    for (const question of section.questions) {
      const answer = answers[question.id]
      if (
        question.type === 'text' &&
        typeof answer === 'string' &&
        answer.trim()
      ) {
        lines.push(`${question.label.th}: ${answer.trim()}`)
      }
    }
  }
  return lines.join('\n').slice(0, MAX_FEEDBACK_LENGTH)
}

@Injectable()
export class FeedbackSummaryService {
  public constructor(
    private readonly ai: AiSettingsService,
    private readonly auditService: AuditService,
    @InjectModel(EvaluationAssignmentRecord.name)
    private readonly assignments: Model<EvaluationAssignmentRecord>,
    @InjectModel(EvaluationRecord.name)
    private readonly evaluations: Model<EvaluationRecord>,
    @InjectModel(FeedbackSummaryRecord.name)
    private readonly summaries: Model<FeedbackSummaryRecord>
  ) {}

  public async get(
    actor: AuthenticatedActor,
    assignmentId: string
  ): Promise<unknown> {
    const { evaluation } = await this.resolve(actor, assignmentId)
    const summary = evaluation
      ? await this.summaries.findOne({ evaluationId: evaluation.id }).exec()
      : null
    return this.toResponse(
      summary,
      evaluation ? this.feedbackOf(evaluation) : ''
    )
  }

  public async generate(
    actor: AuthenticatedActor,
    assignmentId: string,
    requestId: string
  ): Promise<unknown> {
    const { assignment, evaluation } = await this.resolve(actor, assignmentId)
    if (!evaluation) {
      throw new UnprocessableEntityException({
        code: 'FEEDBACK_EVALUATION_REQUIRED',
        message: 'ผู้ประเมินยังไม่ได้ส่งผล จึงยังสรุป Feedback ไม่ได้'
      })
    }
    const feedback = this.feedbackOf(evaluation)
    if (!feedback) {
      throw new UnprocessableEntityException({
        code: 'FEEDBACK_EMPTY',
        message: 'ผู้ประเมินไม่ได้เขียนข้อเสนอแนะ จึงไม่มีข้อความให้สรุป'
      })
    }
    const reply = await this.ai.generate(feedback)
    const saved = (await this.summaries
      .findOneAndUpdate(
        { evaluationId: evaluation.id },
        {
          $set: {
            assignmentId,
            summary: reply.text,
            modelId: reply.model,
            generatedBy: actor.id
          }
        },
        { returnDocument: 'after', upsert: true }
      )
      .exec()) as SummaryDocument
    await this.auditService.record({
      requestId,
      actorId: actor.id,
      actorEmail: actor.email,
      action: 'evaluations.feedback_summary_generated',
      route: `POST /api/v2/evaluation-assignments/${assignmentId}/feedback-summary`,
      method: 'POST',
      resourceScopes: [
        {
          ...(assignment.schoolId ? { schoolIds: [assignment.schoolId] } : {}),
          ...(assignment.programId
            ? { programIds: [assignment.programId] }
            : {})
        }
      ],
      metadata: { evaluationId: evaluation.id, model: reply.model }
    })
    return this.toResponse(saved, feedback)
  }

  private feedbackOf(evaluation: HydratedDocument<EvaluationRecord>): string {
    return collectFeedbackText(evaluation.questionSnapshot, evaluation.answers)
  }

  private async resolve(
    actor: AuthenticatedActor,
    assignmentId: string
  ): Promise<{
    assignment: HydratedDocument<EvaluationAssignmentRecord>
    evaluation: HydratedDocument<EvaluationRecord> | null
  }> {
    const assignment = await this.assignments.findById(assignmentId).exec()
    if (!assignment) throw new NotFoundException({ code: 'RESOURCE_NOT_FOUND' })
    try {
      assertActorScope(actor, assignment)
    } catch {
      throw new NotFoundException({ code: 'RESOURCE_NOT_FOUND' })
    }
    const evaluation = await this.evaluations
      .findOne({ assignmentId, supersededAt: { $exists: false } })
      .sort({ version: -1 })
      .exec()
    return { assignment, evaluation }
  }

  private toResponse(
    summary: SummaryDocument | null,
    feedback: string
  ): unknown {
    return {
      feedback,
      summary: summary?.summary ?? null,
      model: summary?.modelId ?? null,
      generatedAt: summary?.updatedAt?.toISOString() ?? null
    }
  }
}
