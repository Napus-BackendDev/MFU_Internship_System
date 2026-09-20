import type { AuthenticatedActor } from '@internship/shared-types'
import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException
} from '@nestjs/common'
import { InjectConnection, InjectModel } from '@nestjs/mongoose'
import type { Connection, HydratedDocument, Model, QueryFilter } from 'mongoose'

import { paginate, type PaginationInput } from '../common/pagination.js'
import { idempotencyScopeKey, requestHash } from '../common/idempotency.js'
import { assertActorScope, scopeFilter } from '../common/scope.js'
import {
  CompetencySetRecord,
  CompetencyVersionRecord,
  EvaluationAssignmentRecord,
  EvaluationCycleRecord,
  EvaluationDraftRecord,
  EvaluationRecord
} from './evaluation.schema.js'
import { StudentRecord } from '../members/members.schema.js'
import {
  validateAnswers,
  validateCompetencySections,
  validateDraftAnswers
} from './evaluation.validation.js'

@Injectable()
export class EvaluationsService {
  public constructor(
    @InjectConnection() private readonly connection: Connection,
    @InjectModel(CompetencySetRecord.name)
    private readonly competencySets: Model<CompetencySetRecord>,
    @InjectModel(CompetencyVersionRecord.name)
    private readonly competencyVersions: Model<CompetencyVersionRecord>,
    @InjectModel(EvaluationCycleRecord.name)
    private readonly cycles: Model<EvaluationCycleRecord>,
    @InjectModel(EvaluationAssignmentRecord.name)
    private readonly assignments: Model<EvaluationAssignmentRecord>,
    @InjectModel(EvaluationDraftRecord.name)
    private readonly drafts: Model<EvaluationDraftRecord>,
    @InjectModel(EvaluationRecord.name)
    private readonly evaluations: Model<EvaluationRecord>,
    @InjectModel(StudentRecord.name)
    private readonly students: Model<StudentRecord>
  ) {}

  public listCompetencySets(page: PaginationInput): Promise<unknown> {
    return paginate(this.competencySets, {}, page, { code: 1, _id: 1 })
  }

  public async createCompetencySet(
    input: CompetencySetRecord
  ): Promise<unknown> {
    return (await this.competencySets.create(input)).toJSON()
  }

  public async createCompetencyVersion(
    competencySetId: string,
    sections: CompetencyVersionRecord['sections']
  ): Promise<unknown> {
    const exists = await this.competencySets.exists({ _id: competencySetId })
    if (!exists) throw new NotFoundException({ code: 'RESOURCE_NOT_FOUND' })
    const latest = await this.competencyVersions
      .findOne({ competencySetId })
      .sort({ versionNumber: -1 })
      .select({ versionNumber: 1 })
      .lean()
      .exec()
    return (
      await this.competencyVersions.create({
        competencySetId,
        versionNumber: (latest?.versionNumber ?? 0) + 1,
        sections,
        status: 'draft'
      })
    ).toJSON()
  }

  public async listCompetencyVersions(
    competencySetId: string
  ): Promise<unknown> {
    const versions = await this.competencyVersions
      .find({ competencySetId })
      .sort({ versionNumber: -1 })
      .exec()
    return versions.map((v) => v.toJSON())
  }

  public async getCompetencyVersion(id: string): Promise<unknown> {
    const version = await this.competencyVersions.findById(id).exec()
    if (!version) throw new NotFoundException({ code: 'RESOURCE_NOT_FOUND' })
    return version.toJSON()
  }

  public async updateCompetencyVersion(
    id: string,
    sections: CompetencyVersionRecord['sections']
  ): Promise<unknown> {
    const version = await this.competencyVersions
      .findOneAndUpdate(
        { _id: id, status: 'draft' },
        { $set: { sections } },
        { new: true, runValidators: true }
      )
      .exec()
    if (!version) {
      const exists = await this.competencyVersions.exists({ _id: id })
      if (!exists) throw new NotFoundException({ code: 'RESOURCE_NOT_FOUND' })
      throw new ConflictException({ code: 'PUBLISHED_VERSION_IMMUTABLE' })
    }
    return version.toJSON()
  }

  public async publishCompetencyVersion(
    id: string,
    actor: AuthenticatedActor
  ): Promise<unknown> {
    const current = await this.competencyVersions.findById(id).exec()
    if (!current) throw new NotFoundException({ code: 'RESOURCE_NOT_FOUND' })
    if (current.status !== 'draft') {
      throw new ConflictException({ code: 'PUBLISHED_VERSION_IMMUTABLE' })
    }
    validateCompetencySections(current.sections)
    const published = await this.competencyVersions
      .findOneAndUpdate(
        { _id: id, status: 'draft' },
        {
          $set: {
            status: 'published',
            publishedAt: new Date(),
            publishedBy: actor.id
          }
        },
        { new: true }
      )
      .exec()
    if (!published) throw new ConflictException({ code: 'VERSION_CONFLICT' })
    return published.toJSON()
  }

  public listCycles(
    actor: AuthenticatedActor,
    page: PaginationInput
  ): Promise<unknown> {
    return paginate(
      this.cycles,
      scopeFilter<EvaluationCycleRecord>(actor),
      page
    )
  }

  public async createCycle(
    actor: AuthenticatedActor,
    input: EvaluationCycleRecord
  ): Promise<unknown> {
    assertActorScope(actor, input)
    const version = await this.competencyVersions.findOne({
      _id: input.competencySetVersionId,
      status: 'published'
    })
    if (!version) {
      throw new UnprocessableEntityException({
        code: 'PUBLISHED_VERSION_REQUIRED'
      })
    }
    return (await this.cycles.create(input)).toJSON()
  }

  public async previewCycle(id: string): Promise<unknown> {
    const cycle = await this.cycles.findById(id).exec()
    if (!cycle) throw new NotFoundException({ code: 'RESOURCE_NOT_FOUND' })
    const version = await this.competencyVersions.exists({
      _id: cycle.competencySetVersionId,
      status: 'published'
    })
    return {
      cycleId: id,
      valid: Boolean(version) && cycle.closesAt > cycle.opensAt,
      issues: [
        ...(!version ? [{ code: 'PUBLISHED_VERSION_REQUIRED' }] : []),
        ...(cycle.closesAt <= cycle.opensAt
          ? [{ code: 'INVALID_CYCLE_WINDOW' }]
          : [])
      ]
    }
  }

  public async activateCycle(id: string): Promise<unknown> {
    const preview = (await this.previewCycle(id)) as {
      valid: boolean
      issues: readonly unknown[]
    }
    if (!preview.valid) {
      throw new UnprocessableEntityException({
        code: 'CYCLE_ACTIVATION_INVALID',
        details: { issues: preview.issues }
      })
    }
    const cycle = await this.cycles
      .findOneAndUpdate(
        { _id: id, status: 'draft' },
        { $set: { status: 'active' } },
        { new: true }
      )
      .exec()
    if (!cycle)
      throw new ConflictException({ code: 'INVALID_STATE_TRANSITION' })
    return cycle.toJSON()
  }

  public async listAssignments(
    actor: AuthenticatedActor,
    input: PaginationInput & {
      cycleId?: string
      status?: EvaluationAssignmentRecord['status']
    }
  ): Promise<unknown> {
    const filter = await this.assignmentScope(actor)
    if (input.cycleId) filter.cycleId = input.cycleId
    if (input.status) filter.status = input.status
    return paginate(this.assignments, filter, input)
  }

  public async createAssignment(
    actor: AuthenticatedActor,
    input: Omit<
      EvaluationAssignmentRecord,
      'questionSnapshot' | 'competencySetVersionId'
    >
  ): Promise<unknown> {
    assertActorScope(actor, input)
    const cycle = await this.cycles
      .findOne({ _id: input.cycleId, status: 'active' })
      .exec()
    if (!cycle) throw new ConflictException({ code: 'ACTIVE_CYCLE_REQUIRED' })
    const version = await this.competencyVersions.findOne({
      _id: cycle.competencySetVersionId,
      status: 'published'
    })
    if (!version)
      throw new ConflictException({ code: 'PUBLISHED_VERSION_REQUIRED' })
    return (
      await this.assignments.create({
        ...input,
        competencySetVersionId: version.id,
        questionSnapshot: version.sections,
        status: 'pending',
        evaluationVersion: 1
      })
    ).toJSON()
  }

  public async getEvaluation(
    actor: AuthenticatedActor,
    assignmentId: string
  ): Promise<unknown> {
    const assignment = await this.findAssignment(actor, assignmentId)
    const [draft, finals, student] = await Promise.all([
      this.drafts.findOne({ assignmentId }).exec(),
      this.evaluations.find({ assignmentId }).sort({ version: -1 }).exec(),
      this.students
        .findOne({
          $or: [
            { _id: assignment.studentId },
            { studentId: assignment.studentId }
          ]
        })
        .exec()
    ])
    return {
      assignment: assignment.toJSON(),
      draft: draft?.toJSON() ?? null,
      evaluations: finals.map((evaluation) => evaluation.toJSON()),
      student: student
        ? {
            id: student.id,
            studentId: student.studentId,
            name: student.name,
            email: student.email,
            company: student.company
          }
        : null
    }
  }

  public async saveDraft(
    actor: AuthenticatedActor,
    assignmentId: string,
    input: { answers: Readonly<Record<string, unknown>>; revision: number }
  ): Promise<unknown> {
    const assignment = await this.findAssignment(actor, assignmentId, true)
    validateDraftAnswers(assignment, input.answers)
    try {
      const draft = await this.drafts
        .findOneAndUpdate(
          { assignmentId, revision: input.revision },
          {
            $set: { answers: input.answers, updatedBy: actor.id },
            $setOnInsert: { assignmentId },
            $inc: { revision: 1 }
          },
          { new: true, runValidators: true, upsert: true }
        )
        .exec()
      await this.assignments.updateOne(
        { _id: assignmentId, status: 'pending' },
        { $set: { status: 'inProgress' } }
      )
      return draft.toJSON()
    } catch (error: unknown) {
      if (this.isDuplicateKey(error)) {
        throw new ConflictException({ code: 'VERSION_CONFLICT' })
      }
      throw error
    }
  }

  public async submit(
    actor: AuthenticatedActor,
    assignmentId: string,
    input: {
      answers: Readonly<Record<string, unknown>>
      idempotencyKey: string
    }
  ): Promise<unknown> {
    await this.findAssignment(actor, assignmentId, true)
    const scopedKey = idempotencyScopeKey(
      actor.id,
      `evaluation:${assignmentId}`,
      input.idempotencyKey
    )
    const payloadHash = requestHash(input.answers)
    const existing = await this.evaluations.findOne({
      assignmentId,
      idempotencyScopeKey: scopedKey
    })
    if (existing) {
      if (existing.requestHash !== payloadHash) {
        throw new ConflictException({ code: 'IDEMPOTENCY_KEY_REUSED' })
      }
      return existing.toJSON()
    }

    const session = await this.connection.startSession()
    try {
      let submitted: HydratedDocument<EvaluationRecord> | undefined
      await session.withTransaction(async () => {
        const scope = await this.assignmentScope(actor, true)
        const assignment = await this.assignments
          .findOne({ _id: assignmentId, ...scope })
          .session(session)
          .exec()
        if (!assignment)
          throw new NotFoundException({ code: 'RESOURCE_NOT_FOUND' })
        validateAnswers(assignment, input.answers)
        const created = await this.evaluations.create(
          [
            {
              assignmentId,
              version: assignment.evaluationVersion,
              answers: input.answers,
              questionSnapshot: assignment.questionSnapshot,
              aggregateScore: null,
              evaluatorId: assignment.evaluatorId,
              submittedAt: new Date(),
              idempotencyKey: input.idempotencyKey,
              idempotencyScopeKey: scopedKey,
              requestHash: payloadHash
            }
          ],
          { session }
        )
        submitted = created[0]
        const result = await this.assignments.updateOne(
          { _id: assignmentId, status: assignment.status },
          { $set: { status: 'submitted' } },
          { session }
        )
        if (result.modifiedCount !== 1) {
          throw new ConflictException({ code: 'VERSION_CONFLICT' })
        }
        if (assignment.studentId) {
          await this.students.updateOne(
            {
              $or: [
                { studentId: assignment.studentId },
                { _id: assignment.studentId }
              ]
            },
            { $set: { evaluationStatus: 'submitted' } },
            { session }
          )
        }
        await this.drafts.deleteOne({ assignmentId }, { session })
      })
      if (!submitted) throw new ConflictException({ code: 'SUBMIT_FAILED' })
      return submitted.toJSON()
    } catch (error: unknown) {
      if (this.isDuplicateKey(error)) {
        const retry = await this.evaluations.findOne({
          assignmentId,
          idempotencyScopeKey: scopedKey
        })
        if (retry) {
          if (retry.requestHash !== payloadHash) {
            throw new ConflictException({ code: 'IDEMPOTENCY_KEY_REUSED' })
          }
          return retry.toJSON()
        }
        throw new ConflictException({ code: 'EVALUATION_ALREADY_SUBMITTED' })
      }
      throw error
    } finally {
      await session.endSession()
    }
  }

  public reopen(): never {
    throw new ConflictException({
      code: 'REOPEN_POLICY_NOT_CONFIGURED',
      message: 'Owner approval is required before enabling reopen.'
    })
  }

  private async findAssignment(
    actor: AuthenticatedActor,
    id: string,
    mutation = false
  ): Promise<HydratedDocument<EvaluationAssignmentRecord>> {
    const scope = await this.assignmentScope(actor, mutation)
    const assignment = await this.assignments.findOne({
      _id: id,
      ...scope
    })
    if (!assignment) throw new NotFoundException({ code: 'RESOURCE_NOT_FOUND' })
    return assignment
  }

  private async assignmentScope(
    actor: AuthenticatedActor,
    mutation = false
  ): Promise<QueryFilter<EvaluationAssignmentRecord>> {
    if (actor.scope.assignmentId) return { _id: actor.scope.assignmentId }
    if (mutation) throw new ForbiddenException({ code: 'PERMISSION_DENIED' })
    if (actor.scope.studentId) {
      const student = await this.students
        .findOne({ studentId: actor.scope.studentId })
        .select('_id')
        .exec()
      const ids = [actor.scope.studentId]
      if (student?._id) ids.push(student._id.toString())
      return { studentId: { $in: ids } }
    }
    return scopeFilter<EvaluationAssignmentRecord>(actor)
  }

  private isDuplicateKey(error: unknown): boolean {
    return (
      typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      error.code === 11_000
    )
  }
}
