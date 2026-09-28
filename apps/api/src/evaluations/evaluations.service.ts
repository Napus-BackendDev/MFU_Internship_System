import type {
  AuthenticatedActor,
  Paginated,
  RoleKey
} from '@internship/shared-types'
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
  PipelineStage,
  QueryFilter
} from 'mongoose'

import { AuditService } from '../audit/audit.service.js'
import {
  AcademicTermRecord,
  ProgramRecord,
  SchoolRecord
} from '../academic/academic.schema.js'
import { lockActiveAcademicScope } from '../academic/academic-reference-lock.js'
import { actorHasPermission } from '../auth/permission-map.js'
import { paginate, type PaginationInput } from '../common/pagination.js'
import { idempotencyScopeKey, requestHash } from '../common/idempotency.js'
import { boundedSearch } from '../common/search.js'
import { assertActorScope, scopeFilter } from '../common/scope.js'
import {
  CompetencySetRecord,
  CompetencyVersionRecord,
  EvaluationAssignmentRecord,
  EvaluationCycleRecord,
  EvaluationDraftRecord,
  EvaluationRecord,
  type SectionRecord
} from './evaluation.schema.js'
import {
  EvaluatorRecord,
  OrganizationRecord,
  PlacementRecord,
  StudentRecord
} from '../members/members.schema.js'
import { studentReferenceFilter } from '../members/student-reference.js'
import { assignmentIdWithinScope } from './evaluation-assignment.scope.js'
import { calculateCategoryScores } from './evaluation.scoring.js'
import {
  validateAnswers,
  validateCompetencySections,
  validateDraftAnswers
} from './evaluation.validation.js'

function competencySectionsForScope(
  sections: readonly SectionRecord[],
  scope: { readonly schoolId?: string; readonly programId?: string }
): SectionRecord[] {
  return sections.filter(
    (section) =>
      (!section.schoolId ||
        !scope.schoolId ||
        section.schoolId === scope.schoolId) &&
      (!section.programId ||
        !scope.programId ||
        section.programId === scope.programId)
  )
}

function competencyReadScopes(actor: AuthenticatedActor): readonly {
  readonly role: RoleKey
  readonly tenant?: boolean
  readonly schoolIds: readonly string[]
  readonly programIds: readonly string[]
}[] {
  if (actor.roles.includes('systemAdmin')) {
    return [
      { role: 'systemAdmin', tenant: true, schoolIds: [], programIds: [] }
    ]
  }
  if (actor.roleScopes) {
    return actor.roleScopes
      .filter(
        (scope) =>
          actor.roles.includes(scope.role) &&
          scope.role !== 'evaluator' &&
          (!scope.tenant || scope.role === 'internshipStaff') &&
          actorHasPermission([scope.role], 'competencies.read')
      )
      .map(({ role, tenant, schoolIds, programIds }) => ({
        role,
        tenant: role === 'internshipStaff' && tenant,
        schoolIds,
        programIds
      }))
  }
  if (actor.roles.length !== 1) return []
  return actor.roles
    .filter(
      (role) =>
        role !== 'evaluator' && actorHasPermission([role], 'competencies.read')
    )
    .map((role) => ({
      role,
      ...actor.scope,
      tenant: role === 'internshipStaff' && actor.scope.tenant
    }))
}

function andFilters<T>(filters: readonly QueryFilter<T>[]): QueryFilter<T> {
  if (filters.length === 0) return {}
  if (filters.length === 1) return filters[0]!
  return { $and: [...filters] }
}

function competencyVersionScopeFilter(
  actor: AuthenticatedActor
): QueryFilter<CompetencyVersionRecord> {
  const clauses = competencyReadScopes(actor).flatMap((scope) => {
    if (scope.tenant && scope.role !== 'student') return [{}]
    const sectionScopes: Record<string, unknown>[] = [
      { schoolId: { $in: [null] }, programId: { $in: [null] } }
    ]
    if (scope.schoolIds.length > 0) {
      sectionScopes.push({
        schoolId: { $in: [...scope.schoolIds] },
        ...(scope.programIds.length > 0
          ? { programId: { $in: [null, ...scope.programIds] } }
          : {})
      })
    }
    if (scope.programIds.length > 0) {
      sectionScopes.push({
        programId: { $in: [...scope.programIds] },
        ...(scope.schoolIds.length > 0
          ? { schoolId: { $in: [null, ...scope.schoolIds] } }
          : {})
      })
    }
    return [
      {
        ...(scope.role === 'student' ? { status: 'published' } : {}),
        sections: { $elemMatch: { $or: sectionScopes } }
      }
    ]
  })
  if (clauses.some((clause) => Object.keys(clause).length === 0)) return {}
  if (clauses.length === 0) return { _id: null }
  return clauses.length === 1 ? clauses[0]! : { $or: clauses }
}

function competencySectionsForActor(
  actor: AuthenticatedActor,
  sections: readonly SectionRecord[]
): SectionRecord[] {
  const scopes = competencyReadScopes(actor)
  if (scopes.some((scope) => scope.tenant)) return [...sections]
  return sections.filter((section) => {
    if (!section.schoolId && !section.programId) return true
    return scopes.some((scope) => {
      const schoolMatches =
        !section.schoolId ||
        scope.schoolIds.length === 0 ||
        scope.schoolIds.includes(section.schoolId)
      const programMatches =
        !section.programId ||
        scope.programIds.length === 0 ||
        scope.programIds.includes(section.programId)
      const hasScopeAnchor =
        (section.schoolId && scope.schoolIds.includes(section.schoolId)) ||
        (section.programId && scope.programIds.includes(section.programId))
      return Boolean(hasScopeAnchor && schoolMatches && programMatches)
    })
  })
}

function competencySectionWithinStaffScope(
  actor: AuthenticatedActor,
  section: SectionRecord
): boolean {
  if (actor.roles.includes('systemAdmin')) return true

  const scopes = competencyReadScopes(actor).filter(
    (scope) => scope.role === 'internshipStaff'
  )
  return scopes.some((scope) => {
    if (scope.tenant) return true
    const hasScopeAnchor =
      (!!section.schoolId && scope.schoolIds.includes(section.schoolId)) ||
      (!!section.programId && scope.programIds.includes(section.programId))
    const schoolMatches =
      !section.schoolId ||
      scope.schoolIds.length === 0 ||
      scope.schoolIds.includes(section.schoolId)
    const programMatches =
      !section.programId ||
      scope.programIds.length === 0 ||
      scope.programIds.includes(section.programId)
    return hasScopeAnchor && schoolMatches && programMatches
  })
}

function competencySectionsWithinStaffScope(
  actor: AuthenticatedActor,
  sections: readonly SectionRecord[]
): boolean {
  if (actor.roles.includes('systemAdmin')) return true
  return (
    sections.length > 0 &&
    sections.every((section) =>
      competencySectionWithinStaffScope(actor, section)
    )
  )
}

function competencySectionFingerprint(section: SectionRecord): string {
  return JSON.stringify({
    id: section.id,
    title: { th: section.title.th, en: section.title.en },
    category: section.category ?? 'general',
    schoolId: section.schoolId ?? null,
    programId: section.programId ?? null,
    questions: section.questions.map((question) => ({
      id: question.id,
      label: { th: question.label.th, en: question.label.en },
      type: question.type,
      required: question.required ?? true,
      weight: question.weight ?? null,
      scaleMin: question.scaleMin ?? null,
      scaleMax: question.scaleMax ?? null
    }))
  })
}

function mergeScopedCompetencySections(
  actor: AuthenticatedActor,
  submitted: readonly SectionRecord[],
  baseline: readonly SectionRecord[]
): SectionRecord[] {
  if (actor.roles.includes('systemAdmin')) return [...submitted]

  const baselineById = new Map(baseline.map((section) => [section.id, section]))
  const submittedIds = new Set<string>()
  const submittedProtectedIds: string[] = []
  const merged = submitted.map((section) => {
    if (submittedIds.has(section.id)) {
      throw new UnprocessableEntityException({
        code: 'COMPETENCY_CONTRACT_INCOMPLETE'
      })
    }
    submittedIds.add(section.id)

    const previous = baselineById.get(section.id)
    if (previous && !competencySectionWithinStaffScope(actor, previous)) {
      if (
        competencySectionFingerprint(section) !==
        competencySectionFingerprint(previous)
      ) {
        throw new ForbiddenException({ code: 'PERMISSION_DENIED' })
      }
      submittedProtectedIds.push(previous.id)
      return previous
    }
    if (!competencySectionWithinStaffScope(actor, section)) {
      throw new ForbiddenException({ code: 'PERMISSION_DENIED' })
    }
    return section
  })

  const baselineProtectedIds = baseline
    .filter((section) => !competencySectionWithinStaffScope(actor, section))
    .map((section) => section.id)
  let previousProtectedIndex = -1
  for (const id of submittedProtectedIds) {
    const baselineIndex = baselineProtectedIds.indexOf(id)
    if (baselineIndex <= previousProtectedIndex) {
      throw new ForbiddenException({ code: 'PERMISSION_DENIED' })
    }
    previousProtectedIndex = baselineIndex
  }

  for (let index = 0; index < baseline.length; index += 1) {
    const section = baseline[index]!
    if (
      !competencySectionWithinStaffScope(actor, section) &&
      !submittedIds.has(section.id)
    ) {
      merged.splice(Math.min(index, merged.length), 0, section)
    }
  }
  const protectedSections = baseline.filter(
    (section) => !competencySectionWithinStaffScope(actor, section)
  )
  const protectedIds = new Set(protectedSections.map(({ id }) => id))
  const protectedPositions = merged.flatMap((section, index) =>
    protectedIds.has(section.id) ? [index] : []
  )
  protectedPositions.forEach((position, index) => {
    merged[position] = protectedSections[index]!
  })
  return merged
}

function assertCompetencyPermission(
  actor: AuthenticatedActor,
  permission: 'competencies.manage' | 'competencies.publish'
): void {
  if (actor.roles.some((role) => actorHasPermission([role], permission))) return
  throw new ForbiddenException({ code: 'PERMISSION_DENIED' })
}

function assertCompetencyInputScope(
  actor: AuthenticatedActor,
  sections: readonly SectionRecord[]
): void {
  if (!competencySectionsWithinStaffScope(actor, sections)) {
    throw new ForbiddenException({ code: 'PERMISSION_DENIED' })
  }
}

function assertCompetencyResourceScope(
  actor: AuthenticatedActor,
  sections: readonly SectionRecord[]
): void {
  if (
    !actor.roles.includes('systemAdmin') &&
    !sections.some((section) =>
      competencySectionWithinStaffScope(actor, section)
    )
  ) {
    throw new NotFoundException({ code: 'RESOURCE_NOT_FOUND' })
  }
}

interface CycleReadinessCounts {
  readonly candidateStudentCount: number
  readonly eligibleStudentCount: number
  readonly missingStudentDataCount: number
  readonly missingPlacementCount: number
  readonly missingEvaluatorCount: number
}

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
    @InjectModel(AcademicTermRecord.name)
    private readonly academicTerms: Model<AcademicTermRecord>,
    @InjectModel(StudentRecord.name)
    private readonly students: Model<StudentRecord>,
    @InjectModel(PlacementRecord.name)
    private readonly placements: Model<PlacementRecord>,
    @InjectModel(EvaluatorRecord.name)
    private readonly evaluators: Model<EvaluatorRecord>,
    @InjectModel(OrganizationRecord.name)
    private readonly organizations: Model<OrganizationRecord>,
    @InjectModel(SchoolRecord.name)
    private readonly schools: Model<SchoolRecord>,
    @InjectModel(ProgramRecord.name)
    private readonly programs: Model<ProgramRecord>,
    private readonly auditService: AuditService
  ) {}

  public async listCompetencySets(
    actor: AuthenticatedActor,
    page: PaginationInput,
    options: { readonly archived?: boolean; readonly search?: string } = {}
  ): Promise<unknown> {
    const filters: QueryFilter<CompetencySetRecord>[] = []
    if (!competencyReadScopes(actor).some((scope) => scope.tenant)) {
      const versionFilter = competencyVersionScopeFilter(actor)
      const setIds = await this.competencyVersions
        .distinct('competencySetId', versionFilter)
        .exec()
      filters.push(setIds.length > 0 ? { _id: { $in: setIds } } : { _id: null })
    }
    if (options.search) {
      filters.push({
        code: {
          $regex: new RegExp(
            `^${boundedSearch(options.search).toUpperCase()}`,
            'u'
          )
        }
      })
    }
    if (options.archived === false) {
      filters.push({ status: { $ne: 'archived' } })
    }
    return paginate(this.competencySets, andFilters(filters), page, {
      code: 1,
      _id: 1
    })
  }

  public async createCompetencySet(
    actor: AuthenticatedActor,
    input: CompetencySetRecord
  ): Promise<unknown> {
    assertCompetencyPermission(actor, 'competencies.manage')
    return (await this.competencySets.create(input)).toJSON()
  }

  public async createCompetencyVersion(
    actor: AuthenticatedActor,
    competencySetId: string,
    sections: CompetencyVersionRecord['sections']
  ): Promise<unknown> {
    assertCompetencyPermission(actor, 'competencies.manage')
    if (
      !actor.roles.includes('systemAdmin') &&
      !sections.some((section) =>
        competencySectionWithinStaffScope(actor, section)
      )
    ) {
      throw new ForbiddenException({ code: 'PERMISSION_DENIED' })
    }
    const exists = await this.competencySets.exists({ _id: competencySetId })
    if (!exists) throw new NotFoundException({ code: 'RESOURCE_NOT_FOUND' })
    const latest = await this.competencyVersions
      .findOne({ competencySetId })
      .sort({ versionNumber: -1 })
      .select({ versionNumber: 1, sections: 1 })
      .lean()
      .exec()
    const mergedSections = latest
      ? mergeScopedCompetencySections(actor, sections, latest.sections)
      : sections
    if (!latest) assertCompetencyInputScope(actor, mergedSections)
    return (
      await this.competencyVersions.create({
        competencySetId,
        versionNumber: (latest?.versionNumber ?? 0) + 1,
        sections: mergedSections,
        status: 'draft'
      })
    ).toJSON()
  }

  public async listCompetencyVersions(
    actor: AuthenticatedActor,
    competencySetId: string
  ): Promise<unknown> {
    const versions = await this.competencyVersions
      .find({
        $and: [{ competencySetId }, competencyVersionScopeFilter(actor)]
      })
      .sort({ versionNumber: -1 })
      .exec()
    return versions.map((version) => ({
      ...version.toJSON(),
      sections: competencySectionsForActor(actor, version.sections)
    }))
  }

  public async getCompetencyVersion(
    actor: AuthenticatedActor,
    id: string
  ): Promise<unknown> {
    const version = await this.competencyVersions
      .findOne({
        $and: [{ _id: id }, competencyVersionScopeFilter(actor)]
      })
      .exec()
    if (!version) throw new NotFoundException({ code: 'RESOURCE_NOT_FOUND' })
    return {
      ...version.toJSON(),
      sections: competencySectionsForActor(actor, version.sections)
    }
  }

  public async updateCompetencyVersion(
    actor: AuthenticatedActor,
    id: string,
    sections: CompetencyVersionRecord['sections']
  ): Promise<unknown> {
    assertCompetencyPermission(actor, 'competencies.manage')
    const current = await this.competencyVersions.findById(id).exec()
    if (!current) throw new NotFoundException({ code: 'RESOURCE_NOT_FOUND' })
    assertCompetencyResourceScope(actor, current.sections)
    if (current.status !== 'draft') {
      throw new ConflictException({ code: 'PUBLISHED_VERSION_IMMUTABLE' })
    }
    const mergedSections = mergeScopedCompetencySections(
      actor,
      sections,
      current.sections
    )
    assertCompetencyResourceScope(actor, mergedSections)
    const version = await this.competencyVersions
      .findOneAndUpdate(
        { _id: id, status: 'draft' },
        { $set: { sections: mergedSections } },
        { returnDocument: 'after', runValidators: true }
      )
      .exec()
    if (!version) throw new ConflictException({ code: 'VERSION_CONFLICT' })
    return version.toJSON()
  }

  public async publishCompetencyVersion(
    id: string,
    actor: AuthenticatedActor
  ): Promise<unknown> {
    assertCompetencyPermission(actor, 'competencies.publish')
    const current = await this.competencyVersions.findById(id).exec()
    if (!current) throw new NotFoundException({ code: 'RESOURCE_NOT_FOUND' })
    assertCompetencyResourceScope(actor, current.sections)
    if (current.status !== 'draft') {
      throw new ConflictException({ code: 'PUBLISHED_VERSION_IMMUTABLE' })
    }
    const previousPublished = await this.competencyVersions
      .findOne({
        competencySetId: current.competencySetId,
        status: 'published',
        versionNumber: { $lt: current.versionNumber }
      })
      .sort({ versionNumber: -1 })
      .lean()
      .exec()
    if (previousPublished) {
      const mergedSections = mergeScopedCompetencySections(
        actor,
        current.sections,
        previousPublished.sections
      )
      if (
        mergedSections.length !== current.sections.length ||
        mergedSections.some(
          (section, index) =>
            competencySectionFingerprint(section) !==
            competencySectionFingerprint(current.sections[index]!)
        )
      ) {
        throw new NotFoundException({ code: 'RESOURCE_NOT_FOUND' })
      }
    } else {
      assertCompetencyInputScope(actor, current.sections)
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
        { returnDocument: 'after' }
      )
      .exec()
    if (!published) throw new ConflictException({ code: 'VERSION_CONFLICT' })
    return published.toJSON()
  }

  public async listCycles(
    actor: AuthenticatedActor,
    page: PaginationInput,
    options: {
      readonly search?: string
      readonly cycleIds?: readonly string[]
      readonly termId?: string
      readonly status?: EvaluationCycleRecord['status']
    } = {}
  ): Promise<unknown> {
    const filters: QueryFilter<EvaluationCycleRecord>[] = []
    if (options.cycleIds !== undefined) {
      filters.push({ _id: { $in: options.cycleIds } })
    }
    if (options.termId) filters.push({ academicTermId: options.termId })
    if (options.status) filters.push({ status: options.status })
    if (options.search) {
      const search = new RegExp(`^${boundedSearch(options.search)}`, 'iu')
      filters.push({
        $or: [{ code: search }, { 'name.th': search }, { 'name.en': search }]
      })
    }
    const applyFilters = (
      scope: QueryFilter<EvaluationCycleRecord>
    ): QueryFilter<EvaluationCycleRecord> => andFilters([scope, ...filters])
    const cycleScope = scopeFilter<EvaluationCycleRecord>(actor)
    const hasTenantStaffScope =
      actor.roleScopes?.some(
        (scope) =>
          scope.role === 'internshipStaff' &&
          actor.roles.includes(scope.role) &&
          scope.tenant
      ) ??
      (!actor.roleScopes &&
        actor.roles.length === 1 &&
        actor.roles.includes('internshipStaff') &&
        actor.scope.tenant)
    if (actor.roles.includes('systemAdmin') || hasTenantStaffScope) {
      return this.attachCycleTermSummaries(
        await paginate(this.cycles, applyFilters(cycleScope), page)
      )
    }

    const scopedRoles = new Set(['internshipStaff', 'coordinator', 'auditor'])
    const assignedScopes = actor.roleScopes
      ? actor.roleScopes.filter(
          (scope) =>
            actor.roles.includes(scope.role) && scopedRoles.has(scope.role)
        )
      : actor.roles.length === 1 && scopedRoles.has(actor.roles[0]!)
        ? [actor.scope]
        : []
    const participantAssignmentScopes: QueryFilter<EvaluationAssignmentRecord>[] =
      []
    let ownStudentReferences: string[] = []
    if (actor.roles.includes('student') && actor.scope.studentId) {
      const ownStudent = await this.students
        .findOne(studentReferenceFilter(actor.scope.studentId))
        .select('studentId')
        .exec()
      if (ownStudent) {
        ownStudentReferences = [ownStudent.id, ownStudent.studentId]
        participantAssignmentScopes.push({
          studentId: { $in: ownStudentReferences }
        })
      }
    }
    if (
      actor.roles.includes('evaluator') &&
      actor.scope.assignmentId &&
      Types.ObjectId.isValid(actor.scope.assignmentId)
    ) {
      participantAssignmentScopes.push({
        _id: new Types.ObjectId(actor.scope.assignmentId)
      })
    }
    const participantCycleIds =
      participantAssignmentScopes.length > 0
        ? await this.assignments
            .distinct('cycleId', { $or: participantAssignmentScopes })
            .exec()
        : []
    const participantCycleObjectIds = [
      ...new Set(
        participantCycleIds.filter(
          (cycleId): cycleId is string =>
            typeof cycleId === 'string' && Types.ObjectId.isValid(cycleId)
        )
      )
    ].map((cycleId) => new Types.ObjectId(cycleId))
    const ownPlacements =
      ownStudentReferences.length > 0
        ? await this.placements
            .find({ studentId: { $in: ownStudentReferences } })
            .select('academicTermId schoolId programId')
            .exec()
        : []
    const ownPlacementCycleScopes: QueryFilter<EvaluationCycleRecord>[] =
      ownPlacements.map((placement) => ({
        academicTermId: placement.academicTermId,
        schoolId: { $in: [null, placement.schoolId] },
        programId: { $in: [null, placement.programId] },
        status: { $in: ['active', 'closed'] as const }
      }))
    const visibleTerms = await this.placements
      .distinct('academicTermId', {
        $and: [scopeFilter<PlacementRecord>(actor)]
      })
      .exec()
    const visibleTermIds = visibleTerms.filter(
      (termId): termId is string => typeof termId === 'string'
    )
    const applicableCycleScopes: QueryFilter<EvaluationCycleRecord>[] =
      visibleTermIds.length > 0
        ? assignedScopes
            .filter((scope) => !scope.tenant)
            .map((scope) => ({
              academicTermId: { $in: visibleTermIds },
              schoolId: { $in: [null, ...scope.schoolIds] },
              programId: { $in: [null, ...scope.programIds] }
            }))
        : []
    const visibleCycleScopes: QueryFilter<EvaluationCycleRecord>[] = [
      cycleScope,
      ...applicableCycleScopes,
      ...ownPlacementCycleScopes,
      ...(participantCycleObjectIds.length > 0
        ? [
            {
              _id: { $in: participantCycleObjectIds },
              status: { $in: ['active', 'closed'] as const }
            }
          ]
        : [])
    ]
    const filter: QueryFilter<EvaluationCycleRecord> =
      visibleCycleScopes.length === 1
        ? visibleCycleScopes[0]!
        : { $or: visibleCycleScopes }
    return this.attachCycleTermSummaries(
      await paginate(this.cycles, applyFilters(filter), page)
    )
  }

  private async attachCycleTermSummaries(
    page: Paginated<Readonly<Record<string, unknown>>>
  ): Promise<Paginated<Readonly<Record<string, unknown>>>> {
    const termIds = [
      ...new Set(
        page.items
          .map((cycle) => cycle.academicTermId)
          .filter(
            (termId): termId is string =>
              typeof termId === 'string' && Types.ObjectId.isValid(termId)
          )
      )
    ]
    if (termIds.length === 0) return page

    const terms = await this.academicTerms
      .find({
        _id: { $in: termIds.map((termId) => new Types.ObjectId(termId)) }
      })
      .select('_id academicYear semester')
      .exec()
    const termsById = new Map(terms.map((term) => [term._id.toString(), term]))
    return {
      ...page,
      items: page.items.map((cycle) => {
        const termId = cycle.academicTermId
        const term = typeof termId === 'string' ? termsById.get(termId) : null
        return term
          ? {
              ...cycle,
              academicTerm: {
                id: term.id,
                academicYear: term.academicYear,
                semester: term.semester
              }
            }
          : cycle
      })
    }
  }

  public async createCycle(
    actor: AuthenticatedActor,
    input: EvaluationCycleRecord,
    requestId = 'unknown'
  ): Promise<unknown> {
    assertActorScope(actor, input)
    if (
      !Types.ObjectId.isValid(input.academicTermId) ||
      !Types.ObjectId.isValid(input.competencySetVersionId)
    ) {
      throw new UnprocessableEntityException({
        code: 'CYCLE_REFERENCE_INVALID'
      })
    }
    try {
      const created = await this.connection.transaction(async (session) => {
        const lockedScope = await lockActiveAcademicScope(
          this.schools,
          this.programs,
          { schoolId: input.schoolId, programId: input.programId },
          session
        )
        const cycleInput = { ...input, ...lockedScope }
        assertActorScope(actor, cycleInput)
        const version = await this.competencyVersions
          .findOne({
            _id: input.competencySetVersionId,
            status: 'published'
          })
          .session(session)
          .exec()
        if (!version) {
          throw new UnprocessableEntityException({
            code: 'PUBLISHED_VERSION_REQUIRED'
          })
        }
        if (
          competencySectionsForScope(version.sections, cycleInput).length === 0
        ) {
          throw new UnprocessableEntityException({
            code: 'COMPETENCY_SET_NOT_APPLICABLE'
          })
        }
        const term = await this.academicTerms
          .findOne({
            _id: input.academicTermId,
            status: { $ne: 'archived' }
          })
          .session(session)
          .exec()
        if (!term) {
          throw new UnprocessableEntityException({
            code: 'ACTIVE_ACADEMIC_TERM_REQUIRED'
          })
        }
        const termLock = await this.academicTerms.updateOne(
          {
            _id: term._id,
            __v: term.__v,
            status: { $ne: 'archived' }
          },
          { $inc: { __v: 1 } },
          { session }
        )
        if (termLock.matchedCount !== 1) {
          throw new ConflictException({ code: 'ACADEMIC_TERM_CHANGED' })
        }
        const [cycle] = await this.cycles.create([cycleInput], { session })
        if (!cycle) throw new Error('Evaluation cycle write returned no record')
        await this.auditService.record(
          {
            requestId,
            actorId: actor.id,
            actorEmail: actor.email,
            action: 'cycles.created',
            route: 'POST /api/v2/evaluation-cycles',
            method: 'POST',
            resourceScopes: [
              {
                ...(actor.roles.includes('systemAdmin') &&
                !cycle.schoolId &&
                !cycle.programId
                  ? { tenant: true }
                  : {}),
                ...(cycle.schoolId ? { schoolIds: [cycle.schoolId] } : {}),
                ...(cycle.programId ? { programIds: [cycle.programId] } : {})
              }
            ],
            metadata: {
              actorRoles: actor.roles,
              cycleId: cycle.id,
              academicTermId: term.id,
              competencySetVersionId: version.id
            }
          },
          session
        )
        return cycle
      })
      return created.toJSON()
    } catch (error: unknown) {
      if (this.isDuplicateKey(error)) {
        throw new ConflictException({ code: 'CYCLE_ALREADY_EXISTS' })
      }
      throw error
    }
  }

  public async previewCycle(
    actor: AuthenticatedActor,
    id: string
  ): Promise<unknown> {
    const cycle = await this.cycles
      .findOne({
        $and: [
          { _id: id },
          scopeFilter<EvaluationCycleRecord>(actor, ['internshipStaff'])
        ]
      })
      .exec()
    if (!cycle) throw new NotFoundException({ code: 'RESOURCE_NOT_FOUND' })
    const [version, term] = await Promise.all([
      this.competencyVersions
        .findOne({
          _id: cycle.competencySetVersionId,
          status: 'published'
        })
        .exec(),
      this.academicTerms.exists({
        _id: cycle.academicTermId,
        status: { $ne: 'archived' }
      })
    ])
    const hasApplicableSections =
      version !== null &&
      competencySectionsForScope(version.sections, cycle).length > 0
    const readiness = await this.getCycleReadiness(cycle)
    return {
      cycleId: id,
      readiness,
      valid:
        Boolean(version && term && hasApplicableSections) &&
        cycle.closesAt > cycle.opensAt,
      issues: [
        ...(!version ? [{ code: 'PUBLISHED_VERSION_REQUIRED' }] : []),
        ...(version && !hasApplicableSections
          ? [{ code: 'COMPETENCY_SET_NOT_APPLICABLE' }]
          : []),
        ...(!term ? [{ code: 'ACTIVE_ACADEMIC_TERM_REQUIRED' }] : []),
        ...(cycle.closesAt <= cycle.opensAt
          ? [{ code: 'INVALID_CYCLE_WINDOW' }]
          : [])
      ]
    }
  }

  private async getCycleReadiness(
    cycle: EvaluationCycleRecord
  ): Promise<CycleReadinessCounts> {
    const pipeline = [
      {
        $match: {
          status: 'active',
          academicTermId: cycle.academicTermId,
          ...(cycle.schoolId ? { schoolId: cycle.schoolId } : {}),
          ...(cycle.programId ? { programId: cycle.programId } : {})
        }
      },
      {
        $lookup: {
          from: this.schools.collection.name,
          let: { schoolId: '$schoolId' },
          pipeline: [
            {
              $match: {
                $expr: {
                  $and: [
                    { $eq: [{ $toString: '$_id' }, '$$schoolId'] },
                    { $eq: ['$status', 'active'] }
                  ]
                }
              }
            },
            { $project: { _id: 1 } }
          ],
          as: '_readinessSchool'
        }
      },
      {
        $lookup: {
          from: this.programs.collection.name,
          let: { programId: '$programId', schoolId: '$schoolId' },
          pipeline: [
            {
              $match: {
                $expr: {
                  $and: [
                    { $eq: [{ $toString: '$_id' }, '$$programId'] },
                    { $eq: ['$schoolId', '$$schoolId'] },
                    { $eq: ['$status', 'active'] }
                  ]
                }
              }
            },
            { $project: { _id: 1 } }
          ],
          as: '_readinessProgram'
        }
      },
      {
        $lookup: {
          from: this.placements.collection.name,
          let: {
            studentReferences: {
              $setUnion: [[{ $toString: '$_id' }], ['$studentId']]
            },
            schoolId: '$schoolId',
            programId: '$programId'
          },
          pipeline: [
            {
              $match: {
                status: { $in: ['planned', 'active'] },
                academicTermId: cycle.academicTermId,
                startsAt: { $lt: cycle.closesAt },
                endsAt: { $gt: cycle.opensAt },
                $expr: {
                  $and: [
                    { $in: ['$studentId', '$$studentReferences'] },
                    { $eq: ['$schoolId', '$$schoolId'] },
                    { $eq: ['$programId', '$$programId'] }
                  ]
                }
              }
            },
            {
              $lookup: {
                from: this.organizations.collection.name,
                let: { organizationId: '$organizationId' },
                pipeline: [
                  {
                    $match: {
                      status: 'active',
                      $expr: {
                        $eq: [{ $toString: '$_id' }, '$$organizationId']
                      }
                    }
                  },
                  { $project: { _id: 1 } }
                ],
                as: '_readinessOrganization'
              }
            },
            { $match: { '_readinessOrganization.0': { $exists: true } } },
            { $project: { _id: 0, organizationId: 1 } }
          ],
          as: '_readinessPlacements'
        }
      },
      {
        $lookup: {
          from: this.evaluators.collection.name,
          let: {
            organizationIds: {
              $map: {
                input: '$_readinessPlacements',
                as: 'placement',
                in: '$$placement.organizationId'
              }
            }
          },
          pipeline: [
            {
              $match: {
                status: 'active',
                $expr: { $in: ['$organizationId', '$$organizationIds'] }
              }
            },
            { $project: { _id: 1 } }
          ],
          as: '_readinessEvaluators'
        }
      },
      {
        $addFields: {
          _hasValidReferences: {
            $and: [
              { $gt: [{ $size: '$_readinessSchool' }, 0] },
              { $gt: [{ $size: '$_readinessProgram' }, 0] }
            ]
          }
        }
      },
      {
        $group: {
          _id: null,
          candidateStudentCount: { $sum: 1 },
          eligibleStudentCount: {
            $sum: {
              $cond: [
                {
                  $and: [
                    '$_hasValidReferences',
                    { $gt: [{ $size: '$_readinessPlacements' }, 0] },
                    { $gt: [{ $size: '$_readinessEvaluators' }, 0] }
                  ]
                },
                1,
                0
              ]
            }
          },
          missingStudentDataCount: {
            $sum: { $cond: ['$_hasValidReferences', 0, 1] }
          },
          missingPlacementCount: {
            $sum: {
              $cond: [
                {
                  $and: [
                    '$_hasValidReferences',
                    { $eq: [{ $size: '$_readinessPlacements' }, 0] }
                  ]
                },
                1,
                0
              ]
            }
          },
          missingEvaluatorCount: {
            $sum: {
              $cond: [
                {
                  $and: [
                    '$_hasValidReferences',
                    { $gt: [{ $size: '$_readinessPlacements' }, 0] },
                    { $eq: [{ $size: '$_readinessEvaluators' }, 0] }
                  ]
                },
                1,
                0
              ]
            }
          }
        }
      },
      { $project: { _id: 0 } }
    ] as PipelineStage[]
    const [counts] = await this.students
      .aggregate<CycleReadinessCounts>(pipeline)
      .exec()
    return (
      counts ?? {
        candidateStudentCount: 0,
        eligibleStudentCount: 0,
        missingStudentDataCount: 0,
        missingPlacementCount: 0,
        missingEvaluatorCount: 0
      }
    )
  }

  public async activateCycle(
    actor: AuthenticatedActor,
    id: string,
    requestId = 'unknown'
  ): Promise<unknown> {
    let activated: HydratedDocument<EvaluationCycleRecord> | null | undefined
    await this.connection.transaction(async (session) => {
      const cycleScope = scopeFilter<EvaluationCycleRecord>(actor, [
        'internshipStaff'
      ])
      const cycle = await this.cycles
        .findOne({
          $and: [{ _id: id, status: 'draft' }, cycleScope]
        })
        .session(session)
        .exec()
      if (!cycle) {
        const visibleCycle = await this.cycles
          .exists({ $and: [{ _id: id }, cycleScope] })
          .session(session)
        if (!visibleCycle) {
          throw new NotFoundException({ code: 'RESOURCE_NOT_FOUND' })
        }
        throw new ConflictException({ code: 'INVALID_STATE_TRANSITION' })
      }

      const version = await this.competencyVersions
        .findOne({
          _id: cycle.competencySetVersionId,
          status: 'published'
        })
        .session(session)
        .exec()
      const term = await this.academicTerms
        .findOne({
          _id: cycle.academicTermId,
          status: { $ne: 'archived' }
        })
        .session(session)
        .exec()
      const hasApplicableSections =
        version !== null &&
        competencySectionsForScope(version.sections, cycle).length > 0
      const issues = [
        ...(!version ? [{ code: 'PUBLISHED_VERSION_REQUIRED' }] : []),
        ...(version && !hasApplicableSections
          ? [{ code: 'COMPETENCY_SET_NOT_APPLICABLE' }]
          : []),
        ...(!term ? [{ code: 'ACTIVE_ACADEMIC_TERM_REQUIRED' }] : []),
        ...(cycle.closesAt <= cycle.opensAt
          ? [{ code: 'INVALID_CYCLE_WINDOW' }]
          : [])
      ]
      if (issues.length > 0) {
        throw new UnprocessableEntityException({
          code: 'CYCLE_ACTIVATION_INVALID',
          details: { issues }
        })
      }

      if (!term) {
        throw new ConflictException({ code: 'ACTIVE_ACADEMIC_TERM_REQUIRED' })
      }
      const termLock = await this.academicTerms.updateOne(
        {
          _id: term._id,
          __v: term.__v,
          status: { $ne: 'archived' }
        },
        { $inc: { __v: 1 } },
        { session }
      )
      if (termLock.matchedCount !== 1) {
        throw new ConflictException({ code: 'ACADEMIC_TERM_CHANGED' })
      }

      activated = await this.cycles
        .findOneAndUpdate(
          {
            $and: [
              { _id: cycle.id, status: 'draft', __v: cycle.__v ?? 0 },
              cycleScope
            ]
          },
          { $set: { status: 'active' }, $inc: { __v: 1 } },
          { returnDocument: 'after', session }
        )
        .exec()
      if (!activated) {
        throw new ConflictException({ code: 'INVALID_STATE_TRANSITION' })
      }
      await this.auditService.record(
        {
          requestId,
          actorId: actor.id,
          actorEmail: actor.email,
          action: 'cycles.activated',
          route: 'POST /api/v2/evaluation-cycles/:cycleId/activate',
          method: 'POST',
          resourceScopes: [
            {
              ...(actor.roles.includes('systemAdmin') &&
              !cycle.schoolId &&
              !cycle.programId
                ? { tenant: true }
                : {}),
              ...(cycle.schoolId ? { schoolIds: [cycle.schoolId] } : {}),
              ...(cycle.programId ? { programIds: [cycle.programId] } : {})
            }
          ],
          metadata: { actorRoles: actor.roles, cycleId: cycle.id }
        },
        session
      )
    })
    if (!activated) {
      throw new ConflictException({ code: 'CYCLE_ACTIVATION_FAILED' })
    }
    return activated.toJSON()
  }

  public async closeCycle(
    actor: AuthenticatedActor,
    id: string,
    requestId = 'unknown'
  ): Promise<unknown> {
    let closed: HydratedDocument<EvaluationCycleRecord> | undefined
    await this.connection.transaction(async (session) => {
      const cycleScope = scopeFilter<EvaluationCycleRecord>(actor, [
        'internshipStaff'
      ])
      const cycle = await this.cycles
        .findOne({ $and: [{ _id: id }, cycleScope] })
        .session(session)
        .exec()
      if (!cycle) throw new NotFoundException({ code: 'RESOURCE_NOT_FOUND' })
      if (cycle.status === 'closed') {
        closed = cycle
        return
      }

      const update = await this.cycles
        .findOneAndUpdate(
          {
            $and: [
              {
                _id: cycle._id,
                status: cycle.status,
                __v: cycle.__v ?? 0
              },
              cycleScope
            ]
          },
          { $set: { status: 'closed' }, $inc: { __v: 1 } },
          { returnDocument: 'after', session }
        )
        .exec()
      if (!update) throw new ConflictException({ code: 'CYCLE_CHANGED' })

      const expiredAssignments = await this.assignments.updateMany(
        {
          cycleId: cycle.id,
          status: { $in: ['pending', 'inProgress'] }
        },
        { $set: { status: 'expired' } },
        { session }
      )
      await this.auditService.record(
        {
          requestId,
          actorId: actor.id,
          actorEmail: actor.email,
          action: 'cycles.closed',
          route: 'POST /api/v2/evaluation-cycles/:cycleId/close',
          method: 'POST',
          resourceScopes: [
            {
              ...(actor.roles.includes('systemAdmin') &&
              !cycle.schoolId &&
              !cycle.programId
                ? { tenant: true }
                : {}),
              ...(cycle.schoolId ? { schoolIds: [cycle.schoolId] } : {}),
              ...(cycle.programId ? { programIds: [cycle.programId] } : {})
            }
          ],
          metadata: {
            actorRoles: actor.roles,
            cycleId: cycle.id,
            expiredAssignmentCount: expiredAssignments.modifiedCount
          }
        },
        session
      )
      closed = update
    })
    if (!closed) throw new ConflictException({ code: 'CYCLE_CLOSE_FAILED' })
    return closed.toJSON()
  }

  public async listAssignments(
    actor: AuthenticatedActor,
    input: PaginationInput & {
      cycleId?: string
      studentId?: string
      organizationId?: string
      search?: string
      status?: EvaluationAssignmentRecord['status']
    }
  ): Promise<unknown> {
    const filters: QueryFilter<EvaluationAssignmentRecord>[] = [
      await this.assignmentScope(actor)
    ]
    if (input.cycleId) filters.push({ cycleId: input.cycleId })
    if (input.studentId) filters.push({ studentId: input.studentId })
    if (input.status) filters.push({ status: input.status })
    const filter: QueryFilter<EvaluationAssignmentRecord> =
      filters.length === 1 ? filters[0]! : { $and: filters }
    if (!input.search && !input.organizationId) {
      return paginate(this.assignments, filter, input)
    }

    const pipeline: PipelineStage[] = [
      { $match: filter },
      {
        $lookup: {
          from: this.students.collection.name,
          let: { studentReference: '$studentId' },
          pipeline: [
            {
              $match: {
                $expr: {
                  $or: [
                    {
                      $eq: [{ $toString: '$_id' }, '$$studentReference']
                    },
                    { $eq: ['$studentId', '$$studentReference'] }
                  ]
                }
              }
            },
            {
              $project: {
                studentId: 1,
                email: 1,
                name: 1,
                company: 1,
                companyAddress: 1,
                province: 1
              }
            }
          ],
          as: 'directoryStudent'
        }
      },
      {
        $lookup: {
          from: this.evaluators.collection.name,
          let: { evaluatorReference: '$evaluatorId' },
          pipeline: [
            {
              $match: {
                $expr: {
                  $eq: [{ $toString: '$_id' }, '$$evaluatorReference']
                }
              }
            },
            ...(input.organizationId
              ? [{ $match: { organizationId: input.organizationId } }]
              : []),
            {
              $project: {
                email: 1,
                name: 1,
                position: 1,
                organizationId: 1
              }
            }
          ],
          as: 'directoryEvaluator'
        }
      }
    ]

    if (input.organizationId) {
      pipeline.push({
        $match: {
          $expr: { $gt: [{ $size: '$directoryEvaluator' }, 0] }
        }
      })
    }

    if (input.search) {
      pipeline.push({
        $lookup: {
          from: this.organizations.collection.name,
          let: {
            organizationReference: {
              $arrayElemAt: ['$directoryEvaluator.organizationId', 0]
            }
          },
          pipeline: [
            {
              $match: {
                $expr: {
                  $eq: [{ $toString: '$_id' }, '$$organizationReference']
                }
              }
            },
            {
              $project: {
                organizationCode: 1,
                name: 1,
                'address.province': 1
              }
            }
          ],
          as: 'directoryOrganization'
        }
      })

      const search = boundedSearch(input.search)
      const matches = (value: unknown): Record<string, unknown> => ({
        $regexMatch: {
          input: { $ifNull: [value, ''] },
          regex: search,
          options: 'i'
        }
      })
      pipeline.push({
        $match: {
          $expr: {
            $or: [
              ...[
                '$directoryStudent.studentId',
                '$directoryStudent.email',
                '$directoryStudent.name.th',
                '$directoryStudent.name.en',
                '$directoryStudent.company',
                '$directoryStudent.companyAddress',
                '$directoryStudent.province',
                '$directoryEvaluator.email',
                '$directoryEvaluator.name.th',
                '$directoryEvaluator.name.en',
                '$directoryEvaluator.position.th',
                '$directoryEvaluator.position.en',
                '$directoryOrganization.organizationCode',
                '$directoryOrganization.name.th',
                '$directoryOrganization.name.en',
                '$directoryOrganization.address.province'
              ].map((path) => matches({ $arrayElemAt: [path, 0] }))
            ]
          }
        }
      })
    }

    const projection = {
      _id: 1,
      cycleId: 1,
      placementId: 1,
      evaluatorId: 1,
      studentId: 1,
      schoolId: 1,
      programId: 1,
      questionSnapshot: 1,
      competencySetVersionId: 1,
      deadlineAt: 1,
      status: 1,
      evaluationVersion: 1,
      createdAt: 1,
      updatedAt: 1
    } as const
    pipeline.push(
      { $sort: { createdAt: -1, _id: -1 } },
      {
        $facet: {
          items: [
            { $skip: (input.page - 1) * input.pageSize },
            { $limit: input.pageSize },
            { $project: projection }
          ],
          total: [{ $count: 'count' }]
        }
      }
    )
    const [result] = await this.assignments.aggregate<{
      items: EvaluationAssignmentRecord[]
      total: { count: number }[]
    }>(pipeline)
    const total = result?.total[0]?.count ?? 0
    return {
      items: (result?.items ?? []).map((item) =>
        this.assignments.hydrate(item).toJSON()
      ),
      meta: {
        page: input.page,
        pageSize: input.pageSize,
        total,
        totalPages: Math.ceil(total / input.pageSize)
      }
    }
  }

  public async createAssignment(
    actor: AuthenticatedActor,
    input: Omit<
      EvaluationAssignmentRecord,
      'questionSnapshot' | 'competencySetVersionId'
    >,
    requestId = 'unknown'
  ): Promise<unknown> {
    if (
      !Types.ObjectId.isValid(input.cycleId) ||
      !Types.ObjectId.isValid(input.placementId) ||
      !Types.ObjectId.isValid(input.evaluatorId)
    ) {
      throw new UnprocessableEntityException({
        code: 'ASSIGNMENT_REFERENCE_INVALID'
      })
    }

    let created: HydratedDocument<EvaluationAssignmentRecord> | undefined
    try {
      await this.connection.transaction(async (session) => {
        const now = new Date()
        const cycle = await this.cycles
          .findById(input.cycleId)
          .session(session)
          .exec()
        if (!cycle) {
          throw new NotFoundException({ code: 'RESOURCE_NOT_FOUND' })
        }
        if (cycle.schoolId || cycle.programId) {
          const visibleCycle = await this.cycles
            .exists({
              $and: [
                { _id: cycle.id },
                scopeFilter<EvaluationCycleRecord>(actor, ['internshipStaff'])
              ]
            })
            .session(session)
          if (!visibleCycle) {
            throw new NotFoundException({ code: 'RESOURCE_NOT_FOUND' })
          }
        }
        if (
          cycle.status !== 'active' ||
          cycle.opensAt > now ||
          cycle.closesAt <= now
        ) {
          throw new ConflictException({ code: 'ACTIVE_CYCLE_REQUIRED' })
        }

        const placement = await this.placements
          .findOne({
            $and: [
              { _id: input.placementId },
              scopeFilter<PlacementRecord>(actor, ['internshipStaff'])
            ]
          })
          .session(session)
          .exec()
        if (!placement) {
          throw new NotFoundException({ code: 'RESOURCE_NOT_FOUND' })
        }
        if (!['planned', 'active'].includes(placement.status)) {
          throw new ConflictException({ code: 'PLACEMENT_NOT_ASSIGNABLE' })
        }

        const student = await this.resolveStudentReference(
          placement.studentId,
          session
        )
        if (!student || student.status !== 'active') {
          throw new NotFoundException({ code: 'RESOURCE_NOT_FOUND' })
        }
        assertActorScope(actor, student)

        const requestedStudent = await this.resolveStudentReference(
          input.studentId,
          session
        )
        if (!requestedStudent) {
          throw new NotFoundException({ code: 'RESOURCE_NOT_FOUND' })
        }
        if (!requestedStudent._id.equals(student._id)) {
          throw new UnprocessableEntityException({
            code: 'ASSIGNMENT_STUDENT_MISMATCH'
          })
        }
        if (
          !student.academicTermId ||
          !student.schoolId ||
          !student.programId
        ) {
          throw new UnprocessableEntityException({
            code: 'STUDENT_PLACEMENT_PROFILE_INCOMPLETE'
          })
        }
        if (
          placement.schoolId !== student.schoolId ||
          placement.programId !== student.programId ||
          input.schoolId !== student.schoolId ||
          input.programId !== student.programId
        ) {
          throw new UnprocessableEntityException({
            code: 'ASSIGNMENT_SCOPE_MISMATCH'
          })
        }
        if (
          student.academicTermId !== placement.academicTermId ||
          cycle.academicTermId !== placement.academicTermId
        ) {
          throw new UnprocessableEntityException({
            code: 'ASSIGNMENT_TERM_MISMATCH'
          })
        }
        const academicTerm = await this.academicTerms
          .findOne({
            _id: placement.academicTermId,
            status: { $ne: 'archived' }
          })
          .session(session)
          .exec()
        if (!academicTerm) {
          throw new UnprocessableEntityException({
            code: 'ACTIVE_ACADEMIC_TERM_REQUIRED'
          })
        }
        if (
          (cycle.schoolId && cycle.schoolId !== student.schoolId) ||
          (cycle.programId && cycle.programId !== student.programId)
        ) {
          throw new UnprocessableEntityException({
            code: 'ASSIGNMENT_CYCLE_SCOPE_MISMATCH'
          })
        }
        if (input.deadlineAt <= now || input.deadlineAt > cycle.closesAt) {
          throw new UnprocessableEntityException({
            code: 'ASSIGNMENT_DEADLINE_INVALID'
          })
        }

        const organization = await this.organizations
          .findOne({ _id: placement.organizationId, status: 'active' })
          .session(session)
          .exec()
        const evaluator = await this.evaluators
          .findOne({ _id: input.evaluatorId, status: 'active' })
          .session(session)
          .exec()
        if (!organization || !evaluator) {
          throw new UnprocessableEntityException({
            code: 'ACTIVE_ORGANIZATION_AND_EVALUATOR_REQUIRED'
          })
        }
        if (evaluator.organizationId !== organization.id) {
          throw new UnprocessableEntityException({
            code: 'EVALUATOR_ORGANIZATION_MISMATCH'
          })
        }

        const version = await this.competencyVersions
          .findOne({
            _id: cycle.competencySetVersionId,
            status: 'published'
          })
          .session(session)
          .exec()
        if (!version) {
          throw new ConflictException({ code: 'PUBLISHED_VERSION_REQUIRED' })
        }
        const questionSnapshot = competencySectionsForScope(version.sections, {
          schoolId: student.schoolId,
          programId: student.programId
        })
        if (questionSnapshot.length === 0) {
          throw new UnprocessableEntityException({
            code: 'COMPETENCY_SET_NOT_APPLICABLE'
          })
        }

        const existingAssignment = await this.assignments
          .findOne({
            cycleId: cycle.id,
            studentId: { $in: [student.id, student.studentId] }
          })
          .session(session)
          .select({ _id: 1 })
          .exec()
        if (existingAssignment) {
          throw new ConflictException({ code: 'ASSIGNMENT_ALREADY_EXISTS' })
        }

        const cycleLock = await this.cycles.updateOne(
          {
            _id: cycle._id,
            __v: cycle.__v ?? 0,
            status: 'active',
            opensAt: { $lte: now },
            closesAt: { $gt: now }
          },
          { $inc: { __v: 1 } },
          { session }
        )
        if (cycleLock.matchedCount !== 1) {
          throw new ConflictException({ code: 'CYCLE_CLOSED' })
        }

        const studentLock = await this.students.updateOne(
          { _id: student._id, status: 'active' },
          { $inc: { __v: 1 } },
          { session }
        )
        if (studentLock.matchedCount === 0) {
          throw new NotFoundException({ code: 'RESOURCE_NOT_FOUND' })
        }

        created = await new this.assignments({
          cycleId: cycle.id,
          placementId: placement.id,
          evaluatorId: evaluator.id,
          studentId: student.id,
          schoolId: student.schoolId,
          programId: student.programId,
          competencySetVersionId: version.id,
          questionSnapshot,
          deadlineAt: input.deadlineAt,
          status: 'pending',
          evaluationVersion: 1
        }).save({ session })

        await this.auditService.record(
          {
            requestId,
            actorId: actor.id,
            actorEmail: actor.email,
            action: 'evaluations.assignment_created',
            route: 'POST /api/v2/evaluation-assignments',
            method: 'POST',
            resourceScopes: [
              {
                schoolIds: [student.schoolId],
                programIds: [student.programId]
              }
            ],
            metadata: {
              actorRoles: actor.roles,
              assignmentId: created.id,
              cycleId: cycle.id,
              placementId: placement.id,
              studentId: student.id,
              evaluatorId: evaluator.id,
              competencySetVersionId: version.id
            }
          },
          session
        )
      })
    } catch (error: unknown) {
      if (this.isDuplicateKey(error)) {
        throw new ConflictException({ code: 'ASSIGNMENT_ALREADY_EXISTS' })
      }
      throw error
    }
    if (!created)
      throw new ConflictException({ code: 'ASSIGNMENT_CREATE_FAILED' })
    return created.toJSON()
  }

  public async getEvaluation(
    actor: AuthenticatedActor,
    assignmentId: string
  ): Promise<unknown> {
    const assignment = await this.findAssignment(actor, assignmentId)
    const mayReadDraft =
      actorHasPermission(actor.roles, 'evaluations.draft') &&
      actor.scope.assignmentId === assignment.id
    const [draft, finals, student] = await Promise.all([
      mayReadDraft ? this.drafts.findOne({ assignmentId }).exec() : null,
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
    },
    requestId = 'unknown'
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
        }
        await this.drafts.deleteOne({ assignmentId }, { session })
        await this.auditService.record(
          {
            requestId,
            actorId: actor.id,
            actorEmail: actor.email,
            action: 'evaluations.submitted',
            route: 'POST /api/v2/evaluations/:evaluationId/submit',
            method: 'POST',
            resourceScopes: [
              {
                schoolIds: [assignment.schoolId],
                programIds: [assignment.programId]
              }
            ],
            metadata: {
              actorRoles: actor.roles,
              evaluationId: submittedDoc.id,
              assignmentId: assignment.id,
              cycleId: assignment.cycleId,
              evaluationVersion: assignment.evaluationVersion
            }
          },
          session
        )
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
      .exec()
    if (!cycle) throw new ConflictException({ code: 'CYCLE_CLOSED' })
    const cycleLock = await this.cycles.updateOne(
      {
        _id: cycle._id,
        __v: cycle.__v ?? 0,
        status: 'active',
        opensAt: { $lte: at },
        closesAt: { $gt: at }
      },
      { $inc: { __v: 1 } },
      { session }
    )
    if (cycleLock.matchedCount !== 1) {
      throw new ConflictException({ code: 'CYCLE_CLOSED' })
    }
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
    if (mutation) {
      if (
        !actor.roles.includes('evaluator') ||
        !actor.scope.assignmentId ||
        !Types.ObjectId.isValid(actor.scope.assignmentId)
      ) {
        throw new ForbiddenException({ code: 'PERMISSION_DENIED' })
      }
      return { _id: actor.scope.assignmentId }
    }

    const scopes: QueryFilter<EvaluationAssignmentRecord>[] = [
      scopeFilter<EvaluationAssignmentRecord>(actor)
    ]
    if (actor.roles.includes('student') && actor.scope.studentId) {
      const student = await this.students
        .findOne(studentReferenceFilter(actor.scope.studentId))
        .select('_id studentId')
        .exec()
      const ids = [actor.scope.studentId]
      if (student?._id) ids.push(student.id)
      if (student?.studentId) ids.push(student.studentId)
      scopes.push({ studentId: { $in: [...new Set(ids)] } })
    }
    if (
      actor.roles.includes('evaluator') &&
      actor.scope.assignmentId &&
      Types.ObjectId.isValid(actor.scope.assignmentId)
    ) {
      scopes.push({ _id: actor.scope.assignmentId })
    }
    return scopes.length === 1 ? scopes[0]! : { $or: scopes }
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
