import type { AuthenticatedActor } from '@internship/shared-types'
import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException
} from '@nestjs/common'
import { InjectConnection, InjectModel } from '@nestjs/mongoose'
import { Types } from 'mongoose'
import type {
  ClientSession,
  Connection,
  HydratedDocument,
  Model,
  QueryFilter
} from 'mongoose'

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
import { assignmentIdWithinScope } from './evaluation-assignment.scope.js'
import { calculateCategoryScores } from './evaluation.scoring.js'
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
      this.resolveStudentReference(assignment.studentId)
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
    await this.findAssignment(actor, assignmentId, true)
    let savedDraft: HydratedDocument<EvaluationDraftRecord> | undefined
    try {
      const session = await this.connection.startSession()
      try {
        await session.withTransaction(async () => {
          const scope = await this.assignmentScope(actor, true)
          const now = new Date()
          const assignmentQuery = assignmentIdWithinScope(assignmentId, scope)
          const assignment = await this.assignments
            .findOne({
              ...assignmentQuery,
              status: { $in: ['pending', 'inProgress'] },
              deadlineAt: { $gt: now }
            })
            .session(session)
            .exec()
          if (!assignment) {
            throw new ConflictException({ code: 'ASSIGNMENT_NOT_EDITABLE' })
          }
          await this.assertCycleWritable(assignment.cycleId, now, session)
          validateDraftAnswers(assignment, input.answers)
          const draft = await this.drafts
            .findOneAndUpdate(
              { assignmentId, revision: input.revision },
              {
                $set: { answers: input.answers, updatedBy: actor.id },
                $setOnInsert: { assignmentId },
                $inc: { revision: 1 }
              },
              {
                returnDocument: 'after',
                runValidators: true,
                upsert: true,
                session
              }
            )
            .exec()
          if (!draft) throw new ConflictException({ code: 'VERSION_CONFLICT' })
          const updated = await this.assignments.updateOne(
            {
              ...assignmentQuery,
              status: { $in: ['pending', 'inProgress'] },
              deadlineAt: { $gt: now }
            },
            { $set: { status: 'inProgress' } },
            { session }
          )
          if (updated.matchedCount !== 1) {
            throw new ConflictException({ code: 'VERSION_CONFLICT' })
          }
          savedDraft = draft
        })
      } finally {
        await session.endSession()
      }
      if (!savedDraft)
        throw new ConflictException({ code: 'DRAFT_SAVE_FAILED' })
      return savedDraft.toJSON()
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

    let submitted: HydratedDocument<EvaluationRecord> | undefined
    const session = await this.connection.startSession()
    try {
      await session.withTransaction(async () => {
        const scope = await this.assignmentScope(actor, true)
        const now = new Date()
        const assignmentQuery = assignmentIdWithinScope(assignmentId, scope)
        const assignment = await this.assignments
          .findOne({
            ...assignmentQuery,
            status: { $in: ['pending', 'inProgress'] },
            deadlineAt: { $gt: now }
          })
          .session(session)
          .exec()
        if (!assignment) {
          throw new ConflictException({ code: 'ASSIGNMENT_NOT_EDITABLE' })
        }
        await this.assertCycleWritable(assignment.cycleId, now, session)
        validateAnswers(assignment, input.answers)
        const categoryScores = calculateCategoryScores(
          assignment.questionSnapshot,
          input.answers
        )
        const created = await this.evaluations.create(
          [
            {
              assignmentId,
              version: assignment.evaluationVersion,
              answers: input.answers,
              questionSnapshot: assignment.questionSnapshot,
              aggregateScore: null,
              categoryScores,
              scoringPolicyVersion: categoryScores.scoringPolicyVersion,
              evaluatorId: assignment.evaluatorId,
              submittedAt: new Date(),
              idempotencyKey: input.idempotencyKey,
              idempotencyScopeKey: scopedKey,
              requestHash: payloadHash
            }
          ],
          { session }
        )
        const submittedDoc = created[0]
        if (!submittedDoc) {
          throw new ConflictException({ code: 'SUBMIT_FAILED' })
        }
        const result = await this.assignments.updateOne(
          {
            ...assignmentQuery,
            status: assignment.status,
            deadlineAt: { $gt: now }
          },
          { $set: { status: 'submitted' } },
          { session }
        )
        if (result.modifiedCount !== 1) {
          throw new ConflictException({ code: 'VERSION_CONFLICT' })
        }
        if (assignment.studentId) {
          const student = await this.resolveStudentReference(
            assignment.studentId,
            session
          )
          if (!student) {
            throw new UnprocessableEntityException({
              code: 'STUDENT_REFERENCE_INVALID'
            })
          }
          const studentUpdate = await this.students.updateOne(
            { _id: student._id },
            { $set: { evaluationStatus: 'submitted' } },
            { session }
          )
          if (studentUpdate.matchedCount !== 1) {
            throw new ConflictException({
              code: 'STUDENT_STATUS_UPDATE_FAILED'
            })
          }
        }
        await this.drafts.deleteOne({ assignmentId }, { session })
        submitted = submittedDoc
      })
    } catch (error: unknown) {
      let retry: HydratedDocument<EvaluationRecord> | null
      try {
        retry = await this.evaluations
          .findOne({ assignmentId, idempotencyScopeKey: scopedKey })
          .exec()
      } catch {
        throw error
      }
      if (retry) {
        if (retry.requestHash !== payloadHash) {
          throw new ConflictException({ code: 'IDEMPOTENCY_KEY_REUSED' })
        }
        return retry.toJSON()
      }
      if (this.isDuplicateKey(error)) {
        throw new ConflictException({ code: 'EVALUATION_ALREADY_SUBMITTED' })
      }
      throw error
    } finally {
      await session.endSession()
    }
    if (!submitted) throw new ConflictException({ code: 'SUBMIT_FAILED' })
    return submitted.toJSON()
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
    const assignment = await this.assignments
      .findOne(assignmentIdWithinScope(id, scope))
      .exec()
    if (!assignment) throw new NotFoundException({ code: 'RESOURCE_NOT_FOUND' })
    return assignment
  }

  private async assertCycleWritable(
    cycleId: string,
    at: Date,
    session: ClientSession
  ): Promise<void> {
    const cycle = await this.cycles
      .findOne({
        _id: cycleId,
        status: 'active',
        opensAt: { $lte: at },
        closesAt: { $gt: at }
      })
      .session(session)
      .select({ _id: 1 })
      .exec()
    if (!cycle) throw new ConflictException({ code: 'CYCLE_CLOSED' })
  }

  private async resolveStudentReference(
    reference: string,
    session?: ClientSession
  ): Promise<HydratedDocument<StudentRecord> | null> {
    const byId = Types.ObjectId.isValid(reference)
      ? await this.students
          .findById(new Types.ObjectId(reference))
          .session(session ?? null)
          .exec()
      : null
    const byStudentNumber = await this.students
      .findOne({ studentId: reference })
      .session(session ?? null)
      .exec()

    if (byId && byStudentNumber && !byId._id.equals(byStudentNumber._id)) {
      throw new UnprocessableEntityException({
        code: 'AMBIGUOUS_STUDENT_REFERENCE'
      })
    }
    return byId ?? byStudentNumber
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
