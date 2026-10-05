import type { AuthenticatedActor } from '@internship/shared-types'
import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException
} from '@nestjs/common'
import { InjectModel } from '@nestjs/mongoose'
import {
  Types,
  type ClientSession,
  type HydratedDocument,
  type Model,
  type PipelineStage,
  type QueryFilter
} from 'mongoose'

import { paginate, type PaginationInput } from '../common/pagination.js'
import { boundedSearch } from '../common/search.js'
import { assertActorScope, scopeFilter } from '../common/scope.js'
import { runWithTransaction } from '../common/mongo-transaction.js'
import { AuditService } from '../audit/audit.service.js'
import type { AuditResourceScope } from '../audit/audit.schema.js'
import {
  AcademicTermRecord,
  CourseRecord,
  ProgramRecord,
  SchoolRecord
} from '../academic/academic.schema.js'
import { lockActiveAcademicScope } from '../academic/academic-reference-lock.js'
import {
  EvaluationAssignmentRecord,
  EvaluationCycleRecord,
  EvaluationRecord
} from '../evaluations/evaluation.schema.js'
import {
  EvaluatorRecord,
  OrganizationRecord,
  PlacementRecord,
  StudentRecord
} from './members.schema.js'

export type StudentCreateInput = Pick<
  StudentRecord,
  'studentId' | 'name' | 'email' | 'schoolId' | 'programId'
> &
  Partial<
    Pick<
      StudentRecord,
      | 'courseId'
      | 'academicTermId'
      | 'semester'
      | 'company'
      | 'companyAddress'
      | 'province'
      | 'evaluatorName'
      | 'evaluatorEmail'
      | 'admissionYear'
      | 'academicYear'
      | 'status'
    >
  >

function normalizedEmail(email: string): string {
  return email.trim().toLowerCase()
}

interface SessionBindable {
  session(session: ClientSession): unknown
}

function bindSession<T extends SessionBindable>(
  query: T,
  session?: ClientSession
): T {
  if (session) query.session(session)
  return query
}

function studentReferenceFilter(
  references: readonly unknown[]
): QueryFilter<StudentRecord> | undefined {
  const strings = references.filter(
    (reference): reference is string => typeof reference === 'string'
  )
  const objectIds = strings
    .filter((reference) => Types.ObjectId.isValid(reference))
    .map((reference) => new Types.ObjectId(reference))
  const branches: QueryFilter<StudentRecord>[] = []
  if (strings.length > 0) branches.push({ studentId: { $in: strings } })
  if (objectIds.length > 0) branches.push({ _id: { $in: objectIds } })
  return branches.length > 0 ? { $or: branches } : undefined
}

function duplicateStudentErrorCode(error: unknown): string | undefined {
  if (typeof error !== 'object' || error === null) return undefined
  const value = error as {
    code?: unknown
    keyPattern?: unknown
  }
  if (value.code !== 11000) return undefined
  if (
    typeof value.keyPattern === 'object' &&
    value.keyPattern !== null &&
    Object.hasOwn(value.keyPattern, 'email')
  ) {
    return 'STUDENT_EMAIL_ALREADY_USED'
  }
  return 'STUDENT_UNIQUE_VALUE_ALREADY_USED'
}

interface ResolvedAcademicTerm {
  readonly id: string
  readonly semester: string
  readonly academicYear: number
  readonly referenceId: Types.ObjectId
  readonly revision: number
}

@Injectable()
export class MembersService {
  public constructor(
    @InjectModel(StudentRecord.name)
    private readonly students: Model<StudentRecord>,
    @InjectModel(OrganizationRecord.name)
    private readonly organizations: Model<OrganizationRecord>,
    @InjectModel(EvaluatorRecord.name)
    private readonly evaluators: Model<EvaluatorRecord>,
    @InjectModel(PlacementRecord.name)
    private readonly placements: Model<PlacementRecord>,
    @InjectModel(AcademicTermRecord.name)
    private readonly academicTerms: Model<AcademicTermRecord>,
    @InjectModel(EvaluationAssignmentRecord.name)
    private readonly assignments: Model<EvaluationAssignmentRecord>,
    @InjectModel(EvaluationRecord.name)
    private readonly evaluations: Model<EvaluationRecord>,
    @InjectModel(EvaluationCycleRecord.name)
    private readonly cycles: Model<EvaluationCycleRecord>,
    @InjectModel(SchoolRecord.name)
    private readonly schools: Model<SchoolRecord>,
    @InjectModel(ProgramRecord.name)
    private readonly programs: Model<ProgramRecord>,
    @InjectModel(CourseRecord.name)
    private readonly courses: Model<CourseRecord>,
    private readonly auditService: AuditService
  ) {}

  public async listStudents(
    actor: AuthenticatedActor,
    input: PaginationInput & {
      search?: string
      schoolId?: string
      programId?: string
      academicTermId?: string
      cycleId?: string
      evaluationStatus?: string
      studentId?: string
      studentIds?: readonly string[]
      academicYear?: number
      semester?: string
      includeDirectoryData?: boolean
    },
    session?: ClientSession
  ): Promise<unknown> {
    let filter = await this.visibleStudentFilter(actor, session)
    let directoryFacetFilter: QueryFilter<StudentRecord> = filter
    let directoryTerm:
      { readonly academicYear: number; readonly semester: string } | undefined
    let directoryCycleTermId: string | undefined
    let directoryCycleSchoolId: string | undefined
    let directoryCycleProgramId: string | undefined
    const requestedFilters: QueryFilter<StudentRecord>[] = []
    if (input.studentId) requestedFilters.push({ studentId: input.studentId })
    if (input.studentIds?.length) {
      const requestedObjectIds = input.studentIds
        .filter((id) => Types.ObjectId.isValid(id))
        .map((id) => new Types.ObjectId(id))
      const referenceFilters: QueryFilter<StudentRecord>[] = [
        { studentId: { $in: [...input.studentIds] } }
      ]
      if (requestedObjectIds.length > 0) {
        referenceFilters.push({ _id: { $in: requestedObjectIds } })
      }
      requestedFilters.push(
        referenceFilters.length === 1
          ? referenceFilters[0]!
          : { $or: referenceFilters }
      )
    }
    if (input.schoolId) requestedFilters.push({ schoolId: input.schoolId })
    if (input.programId) requestedFilters.push({ programId: input.programId })
    if (input.academicTermId) {
      requestedFilters.push({ academicTermId: input.academicTermId })
    }
    if (!input.cycleId) {
      if (input.academicYear) {
        const pairedYear =
          input.academicYear > 2400
            ? input.academicYear - 543
            : input.academicYear + 543
        requestedFilters.push({
          academicYear: { $in: [input.academicYear, pairedYear] }
        })
      }
      if (input.semester) {
        requestedFilters.push({
          semester: { $in: this.semesterAliases(input.semester) }
        })
      }
    }

    let assignmentScope: QueryFilter<EvaluationAssignmentRecord> | undefined
    if (input.cycleId) {
      if (!Types.ObjectId.isValid(input.cycleId)) {
        throw new UnprocessableEntityException({
          code: 'EVALUATION_CYCLE_REFERENCE_INVALID'
        })
      }

      const hasScopedDirectoryRole =
        actor.roles.includes('systemAdmin') ||
        actor.roles.some((role) =>
          ['internshipStaff', 'coordinator', 'auditor'].includes(role)
        )
      let cycle: HydratedDocument<EvaluationCycleRecord> | null = null
      const authorizedAssignmentScopes: QueryFilter<EvaluationAssignmentRecord>[] =
        []
      if (hasScopedDirectoryRole) {
        const cycleScope = scopeFilter<EvaluationCycleRecord>(actor)
        cycle = await bindSession(
          this.cycles.findOne({
            $and: [{ _id: new Types.ObjectId(input.cycleId) }, cycleScope]
          }),
          session
        ).exec()
        authorizedAssignmentScopes.push(
          scopeFilter<EvaluationAssignmentRecord>(actor)
        )
      }
      if (actor.roles.includes('student') && actor.scope.studentId) {
        const references = await this.studentReferences(
          actor.scope.studentId,
          session
        )
        authorizedAssignmentScopes.push({ studentId: { $in: references } })
      }
      if (
        actor.roles.includes('evaluator') &&
        actor.scope.assignmentId &&
        Types.ObjectId.isValid(actor.scope.assignmentId)
      ) {
        authorizedAssignmentScopes.push({ _id: actor.scope.assignmentId })
      }
      assignmentScope =
        authorizedAssignmentScopes.length === 0
          ? { _id: null }
          : authorizedAssignmentScopes.length === 1
            ? authorizedAssignmentScopes[0]!
            : { $or: authorizedAssignmentScopes }

      if (!cycle) {
        if (hasScopedDirectoryRole) {
          const candidateCycle = await bindSession(
            this.cycles.findById(input.cycleId),
            session
          ).exec()
          if (candidateCycle) {
            const visiblePlacement = await bindSession(
              this.placements.exists({
                $and: [
                  { academicTermId: candidateCycle.academicTermId },
                  ...(candidateCycle.schoolId
                    ? [{ schoolId: candidateCycle.schoolId }]
                    : []),
                  ...(candidateCycle.programId
                    ? [{ programId: candidateCycle.programId }]
                    : []),
                  scopeFilter<PlacementRecord>(actor)
                ]
              }),
              session
            ).exec()
            cycle = visiblePlacement ? candidateCycle : null
          }
        }
      }

      if (!cycle) {
        const visibleAssignment = await bindSession(
          this.assignments.exists({
            $and: [{ cycleId: input.cycleId }, assignmentScope]
          }),
          session
        ).exec()
        cycle = visibleAssignment
          ? await bindSession(
              this.cycles.findById(input.cycleId),
              session
            ).exec()
          : null
      }

      if (!cycle) throw new NotFoundException({ code: 'RESOURCE_NOT_FOUND' })
      directoryCycleTermId = cycle.academicTermId
      directoryCycleSchoolId = cycle.schoolId || undefined
      directoryCycleProgramId = cycle.programId || undefined
      requestedFilters.push({ academicTermId: cycle.academicTermId })
      if (cycle.schoolId) requestedFilters.push({ schoolId: cycle.schoolId })
      if (cycle.programId) requestedFilters.push({ programId: cycle.programId })
      if (input.academicYear || input.semester || input.includeDirectoryData) {
        const termReferenceFilter = Types.ObjectId.isValid(cycle.academicTermId)
          ? { _id: new Types.ObjectId(cycle.academicTermId) }
          : { code: cycle.academicTermId }
        const term = await bindSession(
          this.academicTerms
            .findOne(termReferenceFilter)
            .select('academicYear semester'),
          session
        ).exec()
        if (!term) {
          throw new UnprocessableEntityException({
            code: 'ACADEMIC_TERM_REFERENCE_NOT_FOUND'
          })
        }
        directoryTerm = {
          academicYear: term.academicYear,
          semester: term.semester
        }
        const yearMatches =
          !input.academicYear ||
          [
            term.academicYear,
            term.academicYear > 2400
              ? term.academicYear - 543
              : term.academicYear + 543
          ].includes(input.academicYear)
        const semesterMatches =
          !input.semester ||
          this.normalizeSemester(term.semester) ===
            this.normalizeSemester(input.semester)
        if (!yearMatches || !semesterMatches) {
          requestedFilters.push({ _id: null })
        }
      }

      const placementStudentReferences = hasScopedDirectoryRole
        ? await bindSession(
            this.placements.distinct('studentId', {
              $and: [
                { academicTermId: cycle.academicTermId },
                ...(cycle.schoolId ? [{ schoolId: cycle.schoolId }] : []),
                ...(cycle.programId ? [{ programId: cycle.programId }] : []),
                scopeFilter<PlacementRecord>(actor)
              ]
            }),
            session
          ).exec()
        : []
      const ownStudentReferences =
        actor.roles.includes('student') && actor.scope.studentId
          ? await this.studentReferences(actor.scope.studentId, session)
          : []
      const ownPlacementStudentReferences =
        ownStudentReferences.length > 0
          ? await bindSession(
              this.placements.distinct('studentId', {
                $and: [
                  { academicTermId: cycle.academicTermId },
                  ...(cycle.schoolId ? [{ schoolId: cycle.schoolId }] : []),
                  ...(cycle.programId ? [{ programId: cycle.programId }] : []),
                  { studentId: { $in: ownStudentReferences } }
                ]
              }),
              session
            ).exec()
          : []
      const assignedStudentReferences = await bindSession(
        this.assignments.distinct('studentId', {
          $and: [{ cycleId: input.cycleId }, assignmentScope]
        }),
        session
      ).exec()
      const normalizedCycleStudentReferences = [
        ...new Set([
          ...placementStudentReferences,
          ...ownPlacementStudentReferences,
          ...assignedStudentReferences
        ])
      ].filter(
        (reference): reference is string => typeof reference === 'string'
      )
      const cycleStudentObjectIds = normalizedCycleStudentReferences
        .filter((reference) => Types.ObjectId.isValid(reference))
        .map((reference) => new Types.ObjectId(reference))
      const cycleStudentFilter: QueryFilter<StudentRecord> =
        normalizedCycleStudentReferences.length > 0
          ? {
              $or: [
                { _id: { $in: cycleStudentObjectIds } },
                { studentId: { $in: normalizedCycleStudentReferences } }
              ]
            }
          : { _id: null }
      requestedFilters.push(cycleStudentFilter)
      directoryFacetFilter = {
        $and: [
          filter,
          { academicTermId: cycle.academicTermId },
          ...(cycle.schoolId ? [{ schoolId: cycle.schoolId }] : []),
          ...(cycle.programId ? [{ programId: cycle.programId }] : []),
          cycleStudentFilter
        ]
      }
    }

    if (input.evaluationStatus) {
      const effectiveAssignmentScope =
        assignmentScope ?? scopeFilter<EvaluationAssignmentRecord>(actor)
      const assignmentFilter: QueryFilter<EvaluationAssignmentRecord> = {
        $and: [
          ...(input.cycleId ? [{ cycleId: input.cycleId }] : []),
          effectiveAssignmentScope
        ]
      }
        const allReferences = await bindSession(
          this.assignments.distinct('studentId', assignmentFilter),
          session
        ).exec()
        const normalizedAllReferences = allReferences.filter(
          (reference): reference is string => typeof reference === 'string'
        )
        const exactStatus = [
          'submitted',
          'email_error',
          'inProgress',
          'expired'
        ].includes(input.evaluationStatus)
          ? (input.evaluationStatus as EvaluationAssignmentRecord['status'])
          : undefined
        const selectedReferences = exactStatus
          ? await bindSession(
              this.assignments.distinct('studentId', {
                $and: [assignmentFilter, { status: exactStatus }]
              }),
              session
            ).exec()
          : input.evaluationStatus === 'awaiting_response'
            ? await bindSession(
                this.assignments.distinct('studentId', {
                  $and: [
                    assignmentFilter,
                    { status: { $nin: ['submitted', 'email_error'] } }
                  ]
                }),
                session
              ).exec()
            : input.evaluationStatus === 'pending'
              ? await bindSession(
                  this.assignments.distinct('studentId', {
                    $and: [
                      assignmentFilter,
                      { status: { $in: ['pending', 'reopened'] } }
                    ]
                  }),
                  session
                ).exec()
              : input.evaluationStatus === 'assignment_ambiguous'
                ? (
                    await bindSession(
                      this.assignments.aggregate<{ _id: string }>([
                        { $match: assignmentFilter },
                        { $group: { _id: '$studentId', count: { $sum: 1 } } },
                        { $match: { count: { $gt: 1 } } },
                        { $project: { _id: 1 } }
                      ]),
                      session
                    ).exec()
                  ).map((row) => row._id)
                : normalizedAllReferences
        const normalizedReferences = selectedReferences.filter(
          (reference): reference is string => typeof reference === 'string'
        )
        const selectedObjectIds = normalizedReferences
          .filter((reference) => Types.ObjectId.isValid(reference))
          .map((reference) => new Types.ObjectId(reference))

        if (input.evaluationStatus === 'evaluator_assigned') {
          requestedFilters.push({
            $or: [
              { evaluatorEmail: { $exists: true, $nin: ['', null] } },
              { evaluatorName: { $exists: true, $nin: ['', null] } }
            ]
          })
        } else if (input.evaluationStatus === 'awaiting_evaluator') {
          const allObjectIds = normalizedAllReferences
            .filter((reference) => Types.ObjectId.isValid(reference))
            .map((reference) => new Types.ObjectId(reference))
          requestedFilters.push({
            _id: { $nin: allObjectIds },
            studentId: { $nin: normalizedAllReferences }
          })
        } else if (input.evaluationStatus === 'pending') {
          const ambiguousReferences = (
            await bindSession(
              this.assignments.aggregate<{ _id: string }>([
                { $match: assignmentFilter },
                { $group: { _id: '$studentId', count: { $sum: 1 } } },
                { $match: { count: { $gt: 1 } } },
                { $project: { _id: 1 } }
              ]),
              session
            ).exec()
          ).map((row) => row._id)
          const ambiguousObjectIds = ambiguousReferences
            .filter((reference) => Types.ObjectId.isValid(reference))
            .map((reference) => new Types.ObjectId(reference))
          requestedFilters.push({
            $or: [
              {
                $and: [
                  {
                    $or: [
                      { _id: { $in: selectedObjectIds } },
                      { studentId: { $in: normalizedReferences } }
                    ]
                  },
                  {
                    _id: { $nin: ambiguousObjectIds },
                    studentId: { $nin: ambiguousReferences }
                  }
                ]
              },
              {
                _id: {
                  $nin: normalizedAllReferences
                    .filter((reference) => Types.ObjectId.isValid(reference))
                    .map((reference) => new Types.ObjectId(reference))
                },
                studentId: { $nin: normalizedAllReferences }
              }
            ]
          })
        } else {
          requestedFilters.push({
            $or: [
              { _id: { $in: selectedObjectIds } },
              { studentId: { $in: normalizedReferences } }
            ]
          })
        }
      }
    if (input.search) {
      const search = boundedSearch(input.search)
      const searchBranches: QueryFilter<StudentRecord>[] = [
        {
          $or: [
            { studentId: { $regex: search, $options: 'i' } },
            { email: { $regex: search, $options: 'i' } },
            { name: { $regex: search, $options: 'i' } },
            { 'name.th': { $regex: search, $options: 'i' } },
            { 'name.en': { $regex: search, $options: 'i' } },
            { company: { $regex: search, $options: 'i' } },
            { companyAddress: { $regex: search, $options: 'i' } },
            { province: { $regex: search, $options: 'i' } },
            { course: { $regex: search, $options: 'i' } },
            { courseId: { $regex: search, $options: 'i' } },
            { 'advisor.th': { $regex: search, $options: 'i' } },
            { 'advisor.en': { $regex: search, $options: 'i' } },
            { evaluatorName: { $regex: search, $options: 'i' } },
            { evaluatorEmail: { $regex: search, $options: 'i' } }
          ]
        }
      ]
      const matchingCourses = await bindSession(
        this.courses
          .find({
            $or: [
              { courseCode: { $regex: search, $options: 'i' } },
              { 'name.th': { $regex: search, $options: 'i' } },
              { 'name.en': { $regex: search, $options: 'i' } }
            ]
          })
          .select('_id courseCode'),
        session
      ).exec()
      const courseReferences = matchingCourses.flatMap((course) => [
        course._id.toString(),
        course.courseCode
      ])
      if (courseReferences.length > 0) {
        searchBranches.push({ courseId: { $in: courseReferences } })
      }

      if (input.cycleId && directoryCycleTermId) {
        const matchingEvaluators = await bindSession(
          this.evaluators
            .find({
              $or: [
                { email: { $regex: search, $options: 'i' } },
                { 'name.th': { $regex: search, $options: 'i' } },
                { 'name.en': { $regex: search, $options: 'i' } },
                { 'position.th': { $regex: search, $options: 'i' } },
                { 'position.en': { $regex: search, $options: 'i' } }
              ]
            })
            .select('_id'),
          session
        ).exec()
        if (matchingEvaluators.length > 0) {
          const matchingEvaluatorStudentReferences = await bindSession(
            this.assignments.distinct('studentId', {
              $and: [
                { cycleId: input.cycleId },
                assignmentScope ?? { _id: null },
                {
                  evaluatorId: {
                    $in: matchingEvaluators.map((evaluator) =>
                      evaluator._id.toString()
                    )
                  }
                }
              ]
            }),
            session
          ).exec()
          const referenceFilter = studentReferenceFilter(
            matchingEvaluatorStudentReferences
          )
          if (referenceFilter) searchBranches.push(referenceFilter)
        }

        const matchingOrganizations = await bindSession(
          this.organizations
            .find({
              $or: [
                { 'name.th': { $regex: search, $options: 'i' } },
                { 'name.en': { $regex: search, $options: 'i' } },
                { organizationCode: { $regex: search, $options: 'i' } },
                { 'address.street': { $regex: search, $options: 'i' } },
                { 'address.location': { $regex: search, $options: 'i' } },
                { 'address.fullAddress': { $regex: search, $options: 'i' } },
                { 'address.province': { $regex: search, $options: 'i' } }
              ]
            })
            .select('_id'),
          session
        ).exec()
        if (matchingOrganizations.length > 0) {
          const matchingPlacementStudentReferences = await bindSession(
            this.placements.distinct('studentId', {
              $and: [
                { academicTermId: directoryCycleTermId },
                ...(directoryCycleSchoolId
                  ? [{ schoolId: directoryCycleSchoolId }]
                  : []),
                ...(directoryCycleProgramId
                  ? [{ programId: directoryCycleProgramId }]
                  : []),
                scopeFilter<PlacementRecord>(actor),
                {
                  organizationId: {
                    $in: matchingOrganizations.map((organization) =>
                      organization._id.toString()
                    )
                  }
                }
              ]
            }),
            session
          ).exec()
          const referenceFilter = studentReferenceFilter(
            matchingPlacementStudentReferences
          )
          if (referenceFilter) searchBranches.push(referenceFilter)
        }
      }
      requestedFilters.push({ $or: searchBranches })
    }
    if (requestedFilters.length > 0)
      filter = { $and: [filter, ...requestedFilters] }
    const result = await paginate(
      this.students,
      filter,
      input,
      {
        studentId: 1,
        _id: 1
      },
      session
    )
    const studentReferences = result.items.flatMap((item) =>
      [item.id, item.studentId].filter(
        (reference): reference is string => typeof reference === 'string'
      )
    )
    const schoolObjectIds = [
      ...new Set(
        result.items
          .map((item) => item.schoolId)
          .filter(
            (reference): reference is string =>
              typeof reference === 'string' && Types.ObjectId.isValid(reference)
          )
      )
    ].map((reference) => new Types.ObjectId(reference))
    const programObjectIds = [
      ...new Set(
        result.items
          .map((item) => item.programId)
          .filter(
            (reference): reference is string =>
              typeof reference === 'string' && Types.ObjectId.isValid(reference)
          )
      )
    ].map((reference) => new Types.ObjectId(reference))
    const courseReferences = [
      ...new Set(
        result.items
          .map((item) => item.courseId)
          .filter(
            (reference): reference is string => typeof reference === 'string'
          )
      )
    ]
    const courseObjectIds = courseReferences
      .filter((reference) => Types.ObjectId.isValid(reference))
      .map((reference) => new Types.ObjectId(reference))
    const defaultAssignmentScope =
      scopeFilter<EvaluationAssignmentRecord>(actor)
    const ownStudentReferences =
      actor.roles.includes('student') && actor.scope.studentId
        ? await this.studentReferences(actor.scope.studentId, session)
        : undefined
    const pageAssignmentScope =
      assignmentScope ??
      (ownStudentReferences
        ? {
            $or: [
              defaultAssignmentScope,
              { studentId: { $in: ownStudentReferences } }
            ]
          }
        : defaultAssignmentScope)
    const placementScopes: QueryFilter<PlacementRecord>[] = [
      scopeFilter<PlacementRecord>(actor)
    ]
    if (ownStudentReferences) {
      placementScopes.push({ studentId: { $in: ownStudentReferences } })
    }
    const pagePlacementScope =
      placementScopes.length === 1
        ? placementScopes[0]!
        : { $or: placementScopes }
    const loadPageAssignments = (): Promise<
      HydratedDocument<EvaluationAssignmentRecord>[]
    > =>
      bindSession(
        this.assignments
          .find({
            $and: [
              pageAssignmentScope,
              { studentId: { $in: studentReferences } },
              ...(input.cycleId ? [{ cycleId: input.cycleId }] : [])
            ]
          })
          .select(
            'cycleId placementId studentId evaluatorId schoolId programId status deadlineAt'
          ),
        session
      ).exec()
    const loadPagePlacements = (): Promise<
      HydratedDocument<PlacementRecord>[]
    > =>
      bindSession(
        this.placements
          .find({
            $and: [
              { studentId: { $in: studentReferences } },
              ...(directoryCycleTermId
                ? [{ academicTermId: directoryCycleTermId }]
                : []),
              pagePlacementScope
            ]
          })
          .select(
            'studentId organizationId academicTermId schoolId programId positionTitle startsAt endsAt status'
          ),
        session
      ).exec()
    const loadPageSchools = (): Promise<HydratedDocument<SchoolRecord>[]> =>
      schoolObjectIds.length > 0
        ? bindSession(
            this.schools
              .find({ _id: { $in: schoolObjectIds } })
              .select('_id schoolCode name'),
            session
          ).exec()
        : Promise.resolve([] as HydratedDocument<SchoolRecord>[])
    const loadPagePrograms = (): Promise<HydratedDocument<ProgramRecord>[]> =>
      programObjectIds.length > 0
        ? bindSession(
            this.programs
              .find({ _id: { $in: programObjectIds } })
              .select('_id schoolId programCode name'),
            session
          ).exec()
        : Promise.resolve([] as HydratedDocument<ProgramRecord>[])
    const loadPageCourses = (): Promise<HydratedDocument<CourseRecord>[]> =>
      courseReferences.length > 0
        ? bindSession(
            this.courses
              .find({
                $or: [
                  ...(courseObjectIds.length > 0
                    ? [{ _id: { $in: courseObjectIds } }]
                    : []),
                  { courseCode: { $in: courseReferences } }
                ]
              })
              .select('_id courseCode name'),
            session
          ).exec()
        : Promise.resolve([] as HydratedDocument<CourseRecord>[])
    let pageAssignments: Awaited<ReturnType<typeof loadPageAssignments>>
    let pagePlacements: Awaited<ReturnType<typeof loadPagePlacements>>
    let pageSchools: Awaited<ReturnType<typeof loadPageSchools>>
    let pagePrograms: Awaited<ReturnType<typeof loadPagePrograms>>
    let pageCourses: Awaited<ReturnType<typeof loadPageCourses>>
    if (session) {
      pageAssignments = await loadPageAssignments()
      pagePlacements = await loadPagePlacements()
      pageSchools = await loadPageSchools()
      pagePrograms = await loadPagePrograms()
      pageCourses = await loadPageCourses()
    } else {
      ;[
        pageAssignments,
        pagePlacements,
        pageSchools,
        pagePrograms,
        pageCourses
      ] = await Promise.all([
        loadPageAssignments(),
        loadPagePlacements(),
        loadPageSchools(),
        loadPagePrograms(),
        loadPageCourses()
      ])
    }
    const submittedAssignmentIds = pageAssignments
      .filter((assignment) => assignment.status === 'submitted')
      .map((assignment) => assignment.id)
    const activeFinalByAssignmentId = new Map<
      string,
      Pick<EvaluationRecord, 'categoryScores'>
    >()
    if (submittedAssignmentIds.length > 0) {
      const activeFinals = await bindSession(
        this.evaluations
          .find({
            assignmentId: { $in: submittedAssignmentIds },
            $or: [{ supersededAt: { $exists: false } }, { supersededAt: null }]
          })
          .select('assignmentId version categoryScores')
          .sort({ version: -1 }),
        session
      )
        .lean<
          Array<
            Pick<
              EvaluationRecord,
              'assignmentId' | 'version' | 'categoryScores'
            >
          >
        >()
        .exec()
      for (const evaluation of activeFinals) {
        if (!activeFinalByAssignmentId.has(evaluation.assignmentId)) {
          activeFinalByAssignmentId.set(evaluation.assignmentId, evaluation)
        }
      }
    }
    const directoryTermIds = [
      ...new Set(
        [
          ...result.items.map((item) => item.academicTermId),
          ...pagePlacements.map((placement) => placement.academicTermId)
        ].filter(
          (termId): termId is string =>
            typeof termId === 'string' && Types.ObjectId.isValid(termId)
        )
      )
    ]
    const pageTerms =
      directoryTermIds.length > 0
        ? await bindSession(
            this.academicTerms
              .find({
                _id: {
                  $in: directoryTermIds.map(
                    (termId) => new Types.ObjectId(termId)
                  )
                }
              })
              .select('_id semester academicYear'),
            session
          ).exec()
        : []
    const directorySchoolsById = new Map(
      pageSchools.map((school) => [school._id.toString(), school])
    )
    const directoryProgramsById = new Map(
      pagePrograms.map((program) => [program._id.toString(), program])
    )
    const directoryCoursesByReference = new Map<
      string,
      HydratedDocument<CourseRecord>
    >()
    for (const course of pageCourses) {
      directoryCoursesByReference.set(course._id.toString(), course)
      directoryCoursesByReference.set(course.courseCode, course)
    }
    const directoryTermsById = new Map(
      pageTerms.map((term) => [
        term.id,
        {
          id: term.id,
          semester: term.semester,
          academicYear: term.academicYear
        }
      ])
    )
    const evaluatorsById = new Map<string, HydratedDocument<EvaluatorRecord>>()
    const evaluatorIds = [
      ...new Set(pageAssignments.map((item) => item.evaluatorId))
    ]
    if (evaluatorIds.length > 0) {
      const pageEvaluators = await bindSession(
        this.evaluators
          .find({ _id: { $in: evaluatorIds } })
          .select('_id organizationId email name position'),
        session
      ).exec()
      for (const evaluator of pageEvaluators) {
        evaluatorsById.set(evaluator._id.toString(), evaluator)
      }
    }
    const organizationIds = [
      ...new Set(pagePlacements.map((placement) => placement.organizationId))
    ].filter((organizationId) => Types.ObjectId.isValid(organizationId))
    const organizationsById = new Map<
      string,
      HydratedDocument<OrganizationRecord>
    >()
    if (organizationIds.length > 0) {
      const pageOrganizations = await bindSession(
        this.organizations
          .find({ _id: { $in: organizationIds } })
          .select('_id organizationCode name address'),
        session
      ).exec()
      for (const organization of pageOrganizations) {
        organizationsById.set(organization._id.toString(), organization)
      }
    }
    const assignmentsByStudentReference = new Map<
      string,
      HydratedDocument<EvaluationAssignmentRecord>[]
    >()
    for (const assignment of pageAssignments) {
      const matches =
        assignmentsByStudentReference.get(assignment.studentId) ?? []
      matches.push(assignment)
      assignmentsByStudentReference.set(assignment.studentId, matches)
    }
    const placementsByStudentReference = new Map<
      string,
      HydratedDocument<PlacementRecord>[]
    >()
    for (const placement of pagePlacements) {
      const matches =
        placementsByStudentReference.get(placement.studentId) ?? []
      matches.push(placement)
      placementsByStudentReference.set(placement.studentId, matches)
    }
    const placementsById = new Map(
      pagePlacements.map((placement) => [placement.id, placement])
    )
    const items = result.items.map((item) => {
      const projected: Record<string, unknown> = { ...item }
      delete projected.evaluationStatus
      const studentId = typeof projected.id === 'string' ? projected.id : ''
      const studentCode =
        typeof projected.studentId === 'string' ? projected.studentId : ''
      const school =
        typeof projected.schoolId === 'string'
          ? directorySchoolsById.get(projected.schoolId)
          : undefined
      const program =
        typeof projected.programId === 'string'
          ? directoryProgramsById.get(projected.programId)
          : undefined
      const course =
        typeof projected.courseId === 'string'
          ? directoryCoursesByReference.get(projected.courseId)
          : undefined
      const studentTerm =
        typeof projected.academicTermId === 'string'
          ? directoryTermsById.get(projected.academicTermId)
          : undefined
      const assignments = [
        ...(assignmentsByStudentReference.get(studentId) ?? []),
        ...(assignmentsByStudentReference.get(studentCode) ?? [])
      ]
      const uniquePlacements = [
        ...(placementsByStudentReference.get(studentId) ?? []),
        ...(placementsByStudentReference.get(studentCode) ?? [])
      ]
      const studentPlacementIds = new Set(
        uniquePlacements.map((placement) => placement.id)
      )
      const uniqueAssignments = [...new Set(assignments)].filter((related) => {
        const relatedPlacement = placementsById.get(related.placementId)
        const relatedEvaluator = evaluatorsById.get(related.evaluatorId)
        return Boolean(
          relatedPlacement &&
          studentPlacementIds.has(related.placementId) &&
          [studentId, studentCode].includes(relatedPlacement.studentId) &&
          relatedEvaluator?.organizationId === relatedPlacement.organizationId
        )
      })
      const assignment =
        uniqueAssignments.length === 1 ? uniqueAssignments[0] : undefined
      projected.evaluationStatus =
        uniqueAssignments.length > 1
          ? 'assignment_ambiguous'
          : assignment?.status === 'submitted'
            ? 'submitted'
            : assignment?.status === 'email_error'
              ? 'email_error'
              : assignment?.status === 'inProgress'
                ? 'inProgress'
                : assignment?.status === 'expired'
                  ? 'expired'
                  : assignment
                    ? 'pending'
                    : Boolean(
                          projected.evaluatorName || projected.evaluatorEmail
                        )
                      ? 'evaluator_assigned'
                      : 'awaiting_evaluator'
      const evaluator = assignment
        ? evaluatorsById.get(assignment.evaluatorId)
        : undefined
      if (evaluator) {
        projected.evaluatorEmail = evaluator.email
        projected.evaluatorName = evaluator.name?.th || evaluator.name?.en
      }
      projected.directoryRelations = {
        ...(school
          ? {
              school: {
                id: school._id.toString(),
                schoolCode: school.schoolCode,
                name: school.name
              }
            }
          : {}),
        ...(program
          ? {
              program: {
                id: program._id.toString(),
                schoolId: program.schoolId,
                programCode: program.programCode,
                name: program.name
              }
            }
          : {}),
        ...(course
          ? {
              course: {
                id: course._id.toString(),
                courseCode: course.courseCode,
                name: course.name
              }
            }
          : {}),
        ...(studentTerm ? { term: studentTerm } : {}),
        assignments: uniqueAssignments.map((relatedAssignment) => {
          const relatedEvaluator = evaluatorsById.get(
            relatedAssignment.evaluatorId
          )
          const categoryScores = activeFinalByAssignmentId.get(
            relatedAssignment.id
          )?.categoryScores
          return {
            id: relatedAssignment.id,
            cycleId: relatedAssignment.cycleId,
            placementId: relatedAssignment.placementId,
            studentId,
            evaluatorId: relatedAssignment.evaluatorId,
            schoolId: relatedAssignment.schoolId,
            programId: relatedAssignment.programId,
            status: relatedAssignment.status,
            deadlineAt: relatedAssignment.deadlineAt,
            ...(categoryScores
              ? {
                  categoryScores: {
                    hardSkill: {
                      average: categoryScores.hardSkill.average,
                      answeredCount: categoryScores.hardSkill.answeredCount,
                      scaleMin: categoryScores.hardSkill.scaleMin,
                      scaleMax: categoryScores.hardSkill.scaleMax
                    },
                    softSkill: {
                      average: categoryScores.softSkill.average,
                      answeredCount: categoryScores.softSkill.answeredCount,
                      scaleMin: categoryScores.softSkill.scaleMin,
                      scaleMax: categoryScores.softSkill.scaleMax
                    },
                    scoringPolicyVersion: categoryScores.scoringPolicyVersion
                  }
                }
              : {}),
            ...(relatedEvaluator
              ? {
                  evaluator: {
                    id: relatedEvaluator.id,
                    organizationId: relatedEvaluator.organizationId,
                    name: relatedEvaluator.name,
                    email: relatedEvaluator.email,
                    position: relatedEvaluator.position
                  }
                }
              : {})
          }
        }),
        placements: uniquePlacements.map((relatedPlacement) => {
          const organization = organizationsById.get(
            relatedPlacement.organizationId
          )
          const academicTerm = directoryTermsById.get(
            relatedPlacement.academicTermId
          )
          return {
            id: relatedPlacement.id,
            studentId,
            organizationId: relatedPlacement.organizationId,
            academicTermId: relatedPlacement.academicTermId,
            schoolId: relatedPlacement.schoolId,
            programId: relatedPlacement.programId,
            positionTitle: relatedPlacement.positionTitle,
            startsAt: relatedPlacement.startsAt,
            endsAt: relatedPlacement.endsAt,
            status: relatedPlacement.status,
            ...(academicTerm ? { academicTerm } : {}),
            ...(organization
              ? {
                  organization: {
                    id: organization.id,
                    organizationCode: organization.organizationCode,
                    name: organization.name,
                    address: organization.address
                  }
                }
              : {})
          }
        })
      }
      return projected
    })
    const response = { ...result, items }
    if (!input.includeDirectoryData) return response

    let statusDistribution: Map<string, number>
    let facetStatusDistribution: Map<string, number>
    let schoolIds: unknown[]
    let academicYears: unknown[]
    let semesters: unknown[]
    if (session) {
      statusDistribution = await this.studentDirectoryStatusDistribution(
        filter,
        input.cycleId,
        assignmentScope,
        session
      )
      facetStatusDistribution = await this.studentDirectoryStatusDistribution(
        directoryFacetFilter,
        input.cycleId,
        assignmentScope,
        session
      )
      schoolIds = await bindSession(
        this.students.distinct('schoolId', directoryFacetFilter),
        session
      ).exec()
      academicYears = directoryTerm
        ? [directoryTerm.academicYear]
        : await bindSession(
            this.students.distinct('academicYear', directoryFacetFilter),
            session
          ).exec()
      semesters = directoryTerm
        ? [directoryTerm.semester]
        : await bindSession(
            this.students.distinct('semester', directoryFacetFilter),
            session
          ).exec()
    } else {
      ;[
        statusDistribution,
        facetStatusDistribution,
        schoolIds,
        academicYears,
        semesters
      ] = await Promise.all([
        this.studentDirectoryStatusDistribution(
          filter,
          input.cycleId,
          assignmentScope
        ),
        this.studentDirectoryStatusDistribution(
          directoryFacetFilter,
          input.cycleId,
          assignmentScope
        ),
        this.students.distinct('schoolId', directoryFacetFilter).exec(),
        directoryTerm
          ? Promise.resolve([directoryTerm.academicYear])
          : this.students.distinct('academicYear', directoryFacetFilter).exec(),
        directoryTerm
          ? Promise.resolve([directoryTerm.semester])
          : this.students.distinct('semester', directoryFacetFilter).exec()
      ])
    }
    const facetSchoolObjectIds = schoolIds
      .filter(
        (reference): reference is string =>
          typeof reference === 'string' && Types.ObjectId.isValid(reference)
      )
      .map((reference) => new Types.ObjectId(reference))
    const facetSchoolRecords =
      facetSchoolObjectIds.length > 0
        ? await bindSession(
            this.schools
              .find({ _id: { $in: facetSchoolObjectIds } })
              .select('_id schoolCode name'),
            session
          ).exec()
        : []
    return {
      ...response,
      directory: {
        summary: {
          all: result.meta.total,
          submitted: statusDistribution.get('submitted') ?? 0,
          inProgress: statusDistribution.get('inProgress') ?? 0,
          emailError: statusDistribution.get('email_error') ?? 0,
          pending: statusDistribution.get('pending') ?? 0,
          expired: statusDistribution.get('expired') ?? 0,
          assignmentAmbiguous:
            statusDistribution.get('assignment_ambiguous') ?? 0
        },
        facets: {
          academicYears: academicYears.filter(
            (value): value is number => typeof value === 'number'
          ),
          semesters: semesters.filter(
            (value): value is string => typeof value === 'string'
          ),
          schoolIds: schoolIds.filter(
            (value): value is string => typeof value === 'string'
          ),
          schools: facetSchoolRecords.map((school) => ({
            id: school._id.toString(),
            schoolCode: school.schoolCode,
            name: school.name
          })),
          statuses: [...facetStatusDistribution.keys()]
        }
      }
    }
  }

  private async studentDirectoryStatusDistribution(
    filter: QueryFilter<StudentRecord>,
    cycleId: string | undefined,
    assignmentScope: QueryFilter<EvaluationAssignmentRecord> | undefined,
    session?: ClientSession
  ): Promise<Map<string, number>> {
    const pipeline: PipelineStage[] = [{ $match: filter }]
    const authorizedAssignmentScope = assignmentScope ?? {}
    pipeline.push(
      {
        $lookup: {
          from: this.assignments.collection.name,
          let: {
            directoryStudentId: '$studentId',
            directoryMongoId: { $toString: '$_id' }
          },
          pipeline: [
            {
              $match: {
                $and: [
                  ...(cycleId ? [{ cycleId }] : []),
                  authorizedAssignmentScope,
                  {
                    $expr: {
                      $in: [
                        '$studentId',
                        ['$$directoryStudentId', '$$directoryMongoId']
                      ]
                    }
                  }
                ]
              }
            },
            { $project: { status: 1 } }
          ],
          as: 'directoryAssignments'
        }
      },
      {
        $addFields: {
          directoryStatus: {
            $switch: {
              branches: [
                {
                  case: { $gt: [{ $size: '$directoryAssignments' }, 1] },
                  then: 'assignment_ambiguous'
                },
                ...(
                  [
                    'submitted',
                    'email_error',
                    'inProgress',
                    'expired'
                  ] as const
                ).map((status) => ({
                  case: {
                    $eq: [
                      { $arrayElemAt: ['$directoryAssignments.status', 0] },
                      status
                    ]
                  },
                  then: status
                })),
                {
                  case: {
                    $in: [
                      { $arrayElemAt: ['$directoryAssignments.status', 0] },
                      ['pending', 'reopened']
                    ]
                  },
                  then: 'pending'
                }
              ],
              default: 'pending'
            }
          }
        }
      }
    )
    pipeline.push({ $group: { _id: '$directoryStatus', count: { $sum: 1 } } })
    const counts = await bindSession(
      this.students.aggregate<{ _id: string; count: number }>(pipeline),
      session
    ).exec()
    return new Map(counts.map(({ _id, count }) => [_id, count]))
  }

  private async studentReferences(
    reference: string,
    session?: ClientSession
  ): Promise<string[]> {
    const references = new Set([reference])
    const filter = Types.ObjectId.isValid(reference)
      ? {
          $or: [
            { studentId: reference },
            { _id: new Types.ObjectId(reference) }
          ]
        }
      : { studentId: reference }
    const student = await bindSession(
      this.students.findOne(filter).select('_id studentId'),
      session
    ).exec()
    if (student) {
      references.add(student.id)
      references.add(student.studentId)
    }
    return [...references]
  }

  private studentDocumentsFilter(
    references: readonly string[]
  ): QueryFilter<StudentRecord> {
    const objectIds = references
      .filter((reference) => Types.ObjectId.isValid(reference))
      .map((reference) => new Types.ObjectId(reference))
    return {
      $or: [
        { studentId: { $in: [...references] } },
        ...(objectIds.length > 0 ? [{ _id: { $in: objectIds } }] : [])
      ]
    }
  }

  private async visibleStudentFilter(
    actor: AuthenticatedActor,
    session?: ClientSession
  ): Promise<QueryFilter<StudentRecord>> {
    if (this.isTenantDataReader(actor)) return { status: { $ne: 'archived' } }

    const scopes: QueryFilter<StudentRecord>[] = []
    if (
      actor.roles.some((role) =>
        ['internshipStaff', 'coordinator', 'auditor'].includes(role)
      )
    ) {
      scopes.push(scopeFilter<StudentRecord>(actor))
    }
    if (actor.roles.includes('student') && actor.scope.studentId) {
      scopes.push(
        this.studentDocumentsFilter(
          await this.studentReferences(actor.scope.studentId, session)
        )
      )
    }
    if (
      actor.roles.includes('evaluator') &&
      actor.scope.assignmentId &&
      Types.ObjectId.isValid(actor.scope.assignmentId)
    ) {
      const assignment = await bindSession(
        this.assignments.findById(actor.scope.assignmentId).select('studentId'),
        session
      ).exec()
      if (assignment) {
        scopes.push(
          this.studentDocumentsFilter(
            await this.studentReferences(assignment.studentId, session)
          )
        )
      }
    }
    if (scopes.length === 0) return { _id: null }
    const baseScope = scopes.length === 1 ? scopes[0]! : { $or: scopes }
    return {
      $and: [baseScope, { status: { $ne: 'archived' } }]
    }
  }

  public async getStudent(
    actor: AuthenticatedActor,
    id: string
  ): Promise<unknown> {
    const scopeQuery = await this.visibleStudentFilter(actor)
    const idFilter = Types.ObjectId.isValid(id)
      ? { $or: [{ _id: new Types.ObjectId(id) }, { studentId: id }] }
      : { studentId: id }
    const filter: QueryFilter<StudentRecord> = {
      $and: [idFilter, scopeQuery]
    }
    const student = await this.students.findOne(filter).exec()
    if (!student) throw new NotFoundException({ code: 'RESOURCE_NOT_FOUND' })
    const result = student.toJSON() as unknown as Record<string, unknown>
    delete result.evaluationStatus
    return result
  }

  private normalizeSemester(value: string): string {
    const normalized = value.trim().toLowerCase().replace(/\s+/g, ' ')
    const compound = normalized.match(
      /^([123]|first|second|third|summer)\s*[-/]\s*\d{4}$/i
    )
    const semester = compound?.[1] ?? normalized
    if (['1', 'first', 'ต้น', 'ภาคการศึกษาต้น'].includes(semester)) return '1'
    if (['2', 'second', 'ปลาย', 'ภาคการศึกษาปลาย'].includes(semester))
      return '2'
    if (
      ['3', 'third', 'summer', 'ภาคการศึกษาฤดูร้อน'].includes(semester) ||
      semester.includes('ฤดูร้อน')
    ) {
      return '3'
    }
    return semester
  }

  private semesterAliases(value: string): string[] {
    const normalized = this.normalizeSemester(value)
    if (normalized === '1') {
      return ['1', 'first', 'ต้น', 'ภาคการศึกษาต้น']
    }
    if (normalized === '2') {
      return ['2', 'second', 'ปลาย', 'ภาคการศึกษาปลาย']
    }
    if (normalized === '3') {
      return ['3', 'third', 'summer', 'ภาคการศึกษาฤดูร้อน']
    }
    return [value.trim()]
  }

  private async resolveAcademicTerm(
    semester?: string,
    academicYear?: number,
    reference?: string,
    session?: ClientSession
  ): Promise<ResolvedAcademicTerm | undefined> {
    let referencedTerm: HydratedDocument<AcademicTermRecord> | undefined
    if (reference !== undefined) {
      const referenceFilter = Types.ObjectId.isValid(reference)
        ? {
            $or: [{ _id: new Types.ObjectId(reference) }, { code: reference }]
          }
        : { code: reference }
      const referenceQuery = this.academicTerms.findOne({
        $and: [referenceFilter, { status: { $ne: 'archived' } }]
      })
      if (session) referenceQuery.session(session)
      referencedTerm = (await referenceQuery.exec()) ?? undefined
      if (!referencedTerm) {
        throw new UnprocessableEntityException({
          code: 'ACADEMIC_TERM_REFERENCE_NOT_FOUND'
        })
      }
    }

    if (semester === undefined && academicYear === undefined) {
      if (!referencedTerm) return undefined
      return {
        id: referencedTerm.id,
        semester: referencedTerm.semester,
        academicYear: referencedTerm.academicYear,
        referenceId: referencedTerm._id,
        revision: referencedTerm.__v
      }
    }
    if (semester === undefined || academicYear === undefined) {
      throw new UnprocessableEntityException({
        code: 'ACADEMIC_TERM_SEMESTER_AND_YEAR_REQUIRED'
      })
    }

    const normalizedSemester = this.normalizeSemester(semester)
    if (!normalizedSemester) {
      throw new UnprocessableEntityException({
        code: 'ACADEMIC_TERM_SEMESTER_INVALID'
      })
    }
    if (referencedTerm) {
      if (
        referencedTerm.academicYear !== academicYear ||
        this.normalizeSemester(referencedTerm.semester) !== normalizedSemester
      ) {
        throw new UnprocessableEntityException({
          code: 'ACADEMIC_TERM_REFERENCE_MISMATCH'
        })
      }
      return {
        id: referencedTerm.id,
        semester: referencedTerm.semester,
        academicYear: referencedTerm.academicYear,
        referenceId: referencedTerm._id,
        revision: referencedTerm.__v
      }
    }
    const matchingTermsQuery = this.academicTerms
      .find({
        academicYear,
        semester: normalizedSemester,
        status: { $ne: 'archived' }
      })
      .limit(2)
    if (session) matchingTermsQuery.session(session)
    const matchingTerms = await matchingTermsQuery.exec()
    if (matchingTerms.length > 1) {
      throw new ConflictException({ code: 'ACADEMIC_TERM_AMBIGUOUS' })
    }
    const periodTerm = matchingTerms[0]
    if (!periodTerm) {
      throw new UnprocessableEntityException({
        code: 'ACADEMIC_TERM_NOT_FOUND'
      })
    }
    return {
      id: periodTerm.id,
      semester: periodTerm.semester,
      academicYear: periodTerm.academicYear,
      referenceId: periodTerm._id,
      revision: periodTerm.__v
    }
  }

  private async hasOpenStudentWork(
    student: Pick<StudentRecord, 'studentId'> & { readonly id: string },
    session?: ClientSession
  ): Promise<boolean> {
    const studentReferences = [student.id, student.studentId]
    if (!session) {
      const [openPlacement, openAssignment] = await Promise.all([
        this.placements.exists({
          studentId: { $in: studentReferences },
          status: { $in: ['planned', 'active'] }
        }),
        this.assignments.exists({
          studentId: { $in: studentReferences },
          status: {
            $in: ['pending', 'inProgress', 'reopened', 'email_error']
          }
        })
      ])
      return !!openPlacement || !!openAssignment
    }
    const placementQuery = this.placements
      .findOne({
        studentId: { $in: studentReferences },
        status: { $in: ['planned', 'active'] }
      })
      .select({ _id: 1 })
    const assignmentQuery = this.assignments
      .findOne({
        studentId: { $in: studentReferences },
        status: { $in: ['pending', 'inProgress', 'reopened', 'email_error'] }
      })
      .select({ _id: 1 })
    placementQuery.session(session)
    assignmentQuery.session(session)
    const [openPlacement, openAssignment] = await Promise.all([
      placementQuery.exec(),
      assignmentQuery.exec()
    ])
    return !!openPlacement || !!openAssignment
  }

  private isTenantStaff(actor: AuthenticatedActor): boolean {
    if (actor.roles.includes('systemAdmin')) return true
    return actor.roleScopes
      ? actor.roleScopes.some(
          (scope) =>
            scope.role === 'internshipStaff' &&
            scope.tenant &&
            actor.roles.includes(scope.role)
        )
      : actor.roles.length === 1 &&
          actor.roles[0] === 'internshipStaff' &&
          actor.scope.tenant
  }

  private isTenantDataReader(actor: AuthenticatedActor): boolean {
    if (actor.roles.includes('systemAdmin')) return true
    return actor.roleScopes
      ? actor.roleScopes.some(
          (scope) =>
            scope.role === 'internshipStaff' &&
            scope.tenant &&
            actor.roles.includes(scope.role)
        )
      : actor.roles.length === 1 &&
          actor.roles[0] === 'internshipStaff' &&
          actor.scope.tenant
  }

  private async visiblePlacementFilter(
    actor: AuthenticatedActor
  ): Promise<QueryFilter<PlacementRecord> | undefined> {
    if (this.isTenantDataReader(actor)) return undefined
    const clauses: QueryFilter<PlacementRecord>[] = []
    if (
      actor.roles.some((role) =>
        ['internshipStaff', 'coordinator', 'auditor'].includes(role)
      )
    ) {
      clauses.push(scopeFilter<PlacementRecord>(actor))
    }
    if (actor.roles.includes('student') && actor.scope.studentId) {
      const reference = actor.scope.studentId
      const student = await this.students
        .findOne({
          $or: [
            { studentId: reference },
            ...(Types.ObjectId.isValid(reference)
              ? [{ _id: new Types.ObjectId(reference) }]
              : [])
          ]
        })
        .select('_id studentId')
        .exec()
      if (student) {
        clauses.push({ studentId: { $in: [student.id, student.studentId] } })
      }
    }
    if (clauses.length === 0) return { _id: null }
    return clauses.length === 1 ? clauses[0]! : { $or: clauses }
  }

  private async visibleOrganizationIds(
    actor: AuthenticatedActor
  ): Promise<string[] | undefined> {
    const filter = await this.visiblePlacementFilter(actor)
    if (!filter) return undefined
    const organizationIds = await this.placements
      .distinct('organizationId', filter)
      .exec()
    return organizationIds.map((id) => String(id))
  }

  private async organizationAuditScopes(
    organizationId: string,
    actor: AuthenticatedActor,
    session?: ClientSession
  ): Promise<AuditResourceScope[]> {
    if (this.isTenantStaff(actor)) return [{ tenant: true }]
    const placementsQuery = this.placements
      .find({ organizationId })
      .select('schoolId programId')
      .lean()
    if (session) placementsQuery.session(session)
    const placements = await placementsQuery.exec()
    const scopes = new Map<string, AuditResourceScope>()
    for (const placement of placements) {
      const key = `${placement.schoolId}:${placement.programId}`
      scopes.set(key, {
        schoolIds: [placement.schoolId],
        programIds: [placement.programId]
      })
    }
    return [...scopes.values()]
  }

  private async assignedEvaluatorIdsForStudent(
    actor: AuthenticatedActor
  ): Promise<string[] | undefined> {
    if (
      !actor.roles.includes('student') ||
      actor.roles.some((role) =>
        ['internshipStaff', 'coordinator', 'auditor'].includes(role)
      ) ||
      this.isTenantDataReader(actor)
    ) {
      return undefined
    }
    const reference = actor.scope.studentId
    if (!reference) return []
    const student = await this.students
      .findOne({
        $or: [
          { studentId: reference },
          ...(Types.ObjectId.isValid(reference)
            ? [{ _id: new Types.ObjectId(reference) }]
            : [])
        ]
      })
      .select('_id studentId')
      .exec()
    if (!student) return []
    const studentReferences = [student.id, student.studentId]
    const ownPlacements = await this.placements
      .find({ studentId: { $in: studentReferences } })
      .select('_id organizationId')
      .lean()
      .exec()
    if (ownPlacements.length === 0) return []

    const organizationByPlacementId = new Map(
      ownPlacements.map((placement) => [
        String(placement._id),
        placement.organizationId
      ])
    )
    const ownPlacementIds = [...organizationByPlacementId.keys()]
    const assignments = await this.assignments
      .find({
        studentId: { $in: studentReferences },
        placementId: { $in: ownPlacementIds }
      })
      .select('placementId evaluatorId')
      .lean()
      .exec()

    const evaluatorOrganizationPairs = new Map<
      string,
      { _id: Types.ObjectId; organizationId: string }
    >()
    for (const assignment of assignments) {
      const evaluatorId = String(assignment.evaluatorId)
      const organizationId = organizationByPlacementId.get(
        String(assignment.placementId)
      )
      if (
        !organizationId ||
        !Types.ObjectId.isValid(evaluatorId) ||
        !Types.ObjectId.isValid(organizationId)
      ) {
        continue
      }
      evaluatorOrganizationPairs.set(`${evaluatorId}:${organizationId}`, {
        _id: new Types.ObjectId(evaluatorId),
        organizationId
      })
    }
    if (evaluatorOrganizationPairs.size === 0) return []

    const assignedEvaluators = await this.evaluators
      .find({ $or: [...evaluatorOrganizationPairs.values()] })
      .select('_id')
      .exec()
    return assignedEvaluators.map((evaluator) => evaluator.id)
  }

  private async assertStudentEmailAvailable(
    email: string,
    excludeStudentId?: string
  ): Promise<void> {
    const owner = await this.students
      .findOne({
        email: normalizedEmail(email),
        ...(excludeStudentId
          ? { _id: { $ne: new Types.ObjectId(excludeStudentId) } }
          : {})
      })
      .collation({ locale: 'en', strength: 2 })
      .select('_id')
      .exec()
    if (owner) {
      throw new ConflictException({ code: 'STUDENT_EMAIL_ALREADY_USED' })
    }
  }

  private async validateAcademicReferences(
    schoolId: string,
    programId: string,
    courseId?: string
  ): Promise<{ schoolId: string; programId: string; courseId?: string }> {
    if (!Types.ObjectId.isValid(schoolId)) {
      throw new UnprocessableEntityException({
        code: 'SCHOOL_REFERENCE_INVALID',
        field: 'schoolId'
      })
    }
    if (!Types.ObjectId.isValid(programId)) {
      throw new UnprocessableEntityException({
        code: 'PROGRAM_REFERENCE_INVALID',
        field: 'programId'
      })
    }

    const [school, program] = await Promise.all([
      this.schools
        .findOne({
          _id: new Types.ObjectId(schoolId),
          status: { $ne: 'archived' }
        })
        .exec(),
      this.programs
        .findOne({
          _id: new Types.ObjectId(programId),
          status: { $ne: 'archived' }
        })
        .exec()
    ])
    if (!school) {
      throw new UnprocessableEntityException({
        code: 'SCHOOL_REFERENCE_NOT_FOUND',
        field: 'schoolId'
      })
    }
    if (!program) {
      throw new UnprocessableEntityException({
        code: 'PROGRAM_REFERENCE_NOT_FOUND',
        field: 'programId'
      })
    }

    const canonicalSchoolId = school.id
    const canonicalProgramId = program.id
    if (program.schoolId !== canonicalSchoolId) {
      throw new UnprocessableEntityException({
        code: 'PROGRAM_SCHOOL_MISMATCH',
        field: 'programId'
      })
    }

    if (!courseId) {
      return { schoolId: canonicalSchoolId, programId: canonicalProgramId }
    }
    if (!Types.ObjectId.isValid(courseId)) {
      throw new UnprocessableEntityException({
        code: 'COURSE_REFERENCE_INVALID',
        field: 'courseId'
      })
    }
    const course = await this.courses
      .findOne({
        _id: new Types.ObjectId(courseId),
        status: { $ne: 'archived' }
      })
      .exec()
    if (!course) {
      throw new UnprocessableEntityException({
        code: 'COURSE_REFERENCE_NOT_FOUND',
        field: 'courseId'
      })
    }
    if (!course.programIds.includes(canonicalProgramId)) {
      throw new UnprocessableEntityException({
        code: 'COURSE_PROGRAM_MISMATCH',
        field: 'courseId'
      })
    }
    return {
      schoolId: canonicalSchoolId,
      programId: canonicalProgramId,
      courseId: course.id
    }
  }

  public async createStudent(
    actor: AuthenticatedActor,
    input: StudentCreateInput,
    requestId = 'unknown'
  ): Promise<unknown> {
    const normalizedInput = { ...input, email: normalizedEmail(input.email) }
    assertActorScope(actor, normalizedInput)
    Object.assign(
      normalizedInput,
      await this.validateAcademicReferences(
        normalizedInput.schoolId,
        normalizedInput.programId,
        normalizedInput.courseId
      )
    )
    await this.assertStudentEmailAvailable(normalizedInput.email)
    const term = await this.resolveAcademicTerm(
      normalizedInput.semester,
      normalizedInput.academicYear,
      normalizedInput.academicTermId
    )
    if (term) {
      normalizedInput.academicTermId = term.id
      normalizedInput.semester = term.semester
      normalizedInput.academicYear = term.academicYear
    }
    try {
      return await runWithTransaction(this.students.db, async (session) => {
        Object.assign(
          normalizedInput,
          await lockActiveAcademicScope(
            this.schools,
            this.programs,
            normalizedInput,
            session
          )
        )
        const [student] = await this.students.create([normalizedInput], {
          ...(session ? { session } : {})
        })
        if (!student) {
          throw new ConflictException({ code: 'STUDENT_CREATE_FAILED' })
        }
        await this.auditService.record(
          {
            requestId,
            actorId: actor.id,
            actorEmail: actor.email,
            action: 'students.created',
            route: 'POST /api/v2/students',
            method: 'POST',
            resourceScopes: [
              {
                schoolIds: [student.schoolId],
                programIds: [student.programId]
              }
            ],
            metadata: { studentRecordId: student.id }
          },
          session
        )
        return student.toJSON()
      })
    } catch (error) {
      const code = duplicateStudentErrorCode(error)
      if (code) throw new ConflictException({ code })
      throw error
    }
  }

  public async updateStudent(
    actor: AuthenticatedActor,
    id: string,
    input: Partial<StudentRecord>,
    requestId = 'unknown'
  ): Promise<unknown> {
    if (!Types.ObjectId.isValid(id)) {
      throw new NotFoundException({ code: 'RESOURCE_NOT_FOUND' })
    }
    const identity = { _id: new Types.ObjectId(id) }
    const existing = await this.students
      .findOne({ $and: [identity, scopeFilter<StudentRecord>(actor)] })
      .exec()
    if (!existing) throw new NotFoundException({ code: 'RESOURCE_NOT_FOUND' })
    assertActorScope(actor, existing)

    const updateInput = { ...input }
    if (input.status === 'archived' && existing.status !== 'archived') {
      if (await this.hasOpenStudentWork(existing)) {
        throw new ConflictException({ code: 'STUDENT_HAS_OPEN_PLACEMENT' })
      }
      updateInput.archivedAt = new Date()
    }
    if (input.email !== undefined) {
      updateInput.email = normalizedEmail(input.email)
      await this.assertStudentEmailAvailable(updateInput.email, existing.id)
    }

    const schoolOrProgramChanged =
      (input.schoolId !== undefined && input.schoolId !== existing.schoolId) ||
      (input.programId !== undefined && input.programId !== existing.programId)
    if (schoolOrProgramChanged) {
      assertActorScope(actor, {
        schoolId: input.schoolId ?? existing.schoolId,
        programId: input.programId ?? existing.programId
      })

      if (await this.hasOpenStudentWork(existing)) {
        throw new ConflictException({
          code: 'STUDENT_SCOPE_TRANSFER_REQUIRES_CLOSED_PLACEMENT'
        })
      }
    }

    const academicReferencesChanged =
      schoolOrProgramChanged ||
      (input.courseId !== undefined && input.courseId !== existing.courseId)
    if (academicReferencesChanged) {
      Object.assign(
        updateInput,
        await this.validateAcademicReferences(
          input.schoolId ?? existing.schoolId,
          input.programId ?? existing.programId,
          input.courseId ?? existing.courseId
        )
      )
    }

    if (
      input.academicTermId !== undefined ||
      input.semester !== undefined ||
      input.academicYear !== undefined
    ) {
      const hasPeriodInput =
        input.semester !== undefined || input.academicYear !== undefined
      const term = await this.resolveAcademicTerm(
        input.semester ?? (hasPeriodInput ? existing.semester : undefined),
        input.academicYear ??
          (hasPeriodInput ? existing.academicYear : undefined),
        input.academicTermId
      )
      if (term) {
        updateInput.academicTermId = term.id
        updateInput.semester = term.semester
        updateInput.academicYear = term.academicYear
      }
    }

    try {
      const filter = {
        $and: [identity, scopeFilter<StudentRecord>(actor)]
      }
      const isArchiving =
        input.status === 'archived' && existing.status !== 'archived'
      const requiresWorkLock = isArchiving || schoolOrProgramChanged
      const student = requiresWorkLock
        ? await runWithTransaction(this.students.db, async (session) => {
            const current = await this.students
              .findOne(filter)
              .session(session ?? null)
              .exec()
            if (!current) {
              throw new NotFoundException({ code: 'RESOURCE_NOT_FOUND' })
            }
            assertActorScope(actor, current)
            if (isArchiving && current.status !== 'active') {
              throw new ConflictException({ code: 'STUDENT_STATUS_CHANGED' })
            }
            if (await this.hasOpenStudentWork(current, session)) {
              throw new ConflictException({
                code: isArchiving
                  ? 'STUDENT_HAS_OPEN_PLACEMENT'
                  : 'STUDENT_SCOPE_TRANSFER_REQUIRES_CLOSED_PLACEMENT'
              })
            }
            if (schoolOrProgramChanged) {
              assertActorScope(actor, {
                schoolId: input.schoolId ?? current.schoolId,
                programId: input.programId ?? current.programId
              })
              Object.assign(
                updateInput,
                await lockActiveAcademicScope(
                  this.schools,
                  this.programs,
                  {
                    schoolId: input.schoolId ?? current.schoolId,
                    programId: input.programId ?? current.programId
                  },
                  session
                )
              )
            }
            const updated = await this.students
              .findOneAndUpdate(
                {
                  $and: [
                    filter,
                    {
                      schoolId: current.schoolId,
                      programId: current.programId,
                      status: current.status
                    }
                  ]
                },
                { $set: updateInput, $inc: { __v: 1 } },
                {
                  returnDocument: 'after',
                  runValidators: true,
                  ...(session ? { session } : {})
                }
              )
              .exec()
            if (!updated) {
              throw new ConflictException({ code: 'STUDENT_STATUS_CHANGED' })
            }
            if (isArchiving) {
              await this.auditService.record(
                {
                  requestId,
                  actorId: actor.id,
                  actorEmail: actor.email,
                  action: 'students.archived',
                  route: 'PATCH /api/v2/students/:studentId',
                  method: 'PATCH',
                  resourceScopes: [
                    {
                      schoolIds: [current.schoolId],
                      programIds: [current.programId]
                    }
                  ],
                  metadata: { studentRecordId: current.id }
                },
                session
              )
            } else if (schoolOrProgramChanged) {
              await this.auditService.record(
                {
                  requestId,
                  actorId: actor.id,
                  actorEmail: actor.email,
                  action: 'students.scope_transferred',
                  route: 'PATCH /api/v2/students/:studentId',
                  method: 'PATCH',
                  resourceScopes: [
                    {
                      schoolIds: [current.schoolId],
                      programIds: [current.programId]
                    },
                    {
                      schoolIds: [updated.schoolId],
                      programIds: [updated.programId]
                    }
                  ],
                  metadata: { studentRecordId: current.id }
                },
                session
              )
            }
            return updated
          })
        : await runWithTransaction(this.students.db, async (session) => {
            const student = await this.students
              .findOneAndUpdate(
                {
                  $and: [
                    filter,
                    {
                      schoolId: existing.schoolId,
                      programId: existing.programId,
                      status: existing.status,
                      __v: existing.__v
                    }
                  ]
                },
                {
                  $set: updateInput,
                  $inc: { __v: 1 },
                  ...(input.status === 'active' &&
                  existing.status === 'archived'
                    ? { $unset: { archivedAt: 1 } }
                    : {})
                },
                {
                  returnDocument: 'after',
                  runValidators: true,
                  ...(session ? { session } : {})
                }
              )
              .exec()
            if (!student) {
              throw new ConflictException({ code: 'STUDENT_CHANGED' })
            }
            if (input.status !== 'archived') {
              await this.auditService.record(
                {
                  requestId,
                  actorId: actor.id,
                  actorEmail: actor.email,
                  action: 'students.updated',
                  route: 'PATCH /api/v2/students/:studentId',
                  method: 'PATCH',
                  resourceScopes: [
                    {
                      schoolIds: [student.schoolId],
                      programIds: [student.programId]
                    }
                  ],
                  metadata: { studentRecordId: student.id }
                },
                session
              )
            }
            return student
          })
      if (!student) throw new NotFoundException({ code: 'RESOURCE_NOT_FOUND' })
      return student.toJSON()
    } catch (error) {
      const code = duplicateStudentErrorCode(error)
      if (code) throw new ConflictException({ code })
      throw error
    }
  }

  public async archiveStudent(
    actor: AuthenticatedActor,
    id: string,
    requestId = 'unknown'
  ): Promise<void> {
    const idFilter = Types.ObjectId.isValid(id)
      ? { $or: [{ _id: new Types.ObjectId(id) }, { studentId: id }] }
      : { studentId: id }
    const filter = {
      $and: [idFilter, scopeFilter<StudentRecord>(actor)]
    }
    const current = await this.students.findOne(filter).exec()
    if (!current) throw new NotFoundException({ code: 'RESOURCE_NOT_FOUND' })
    assertActorScope(actor, current)
    if (current.status === 'archived') return
    if (await this.hasOpenStudentWork(current)) {
      throw new ConflictException({ code: 'STUDENT_HAS_OPEN_PLACEMENT' })
    }
    await runWithTransaction(this.students.db, async (session) => {
      const existing = await this.students
        .findOne(filter)
        .session(session ?? null)
        .exec()
      if (!existing) throw new NotFoundException({ code: 'RESOURCE_NOT_FOUND' })
      assertActorScope(actor, existing)
      if (existing.status === 'archived') return
      if (await this.hasOpenStudentWork(existing, session)) {
        throw new ConflictException({ code: 'STUDENT_HAS_OPEN_PLACEMENT' })
      }
      const archivedAt = new Date()
      const result = await this.students.updateOne(
        { $and: [filter, { status: 'active' }] },
        {
          $set: { status: 'archived', archivedAt },
          $inc: { __v: 1 }
        },
        { ...(session ? { session } : {}) }
      )
      if (result.matchedCount === 0) {
        throw new ConflictException({ code: 'STUDENT_STATUS_CHANGED' })
      }
      await this.auditService.record(
        {
          requestId,
          actorId: actor.id,
          actorEmail: actor.email,
          action: 'students.archived',
          route: 'DELETE /api/v2/students/:studentId',
          method: 'DELETE',
          resourceScopes: [
            {
              schoolIds: [existing.schoolId],
              programIds: [existing.programId]
            }
          ],
          metadata: { studentRecordId: existing.id }
        },
        session
      )
    })
  }

  public listOrganizations(
    actor: AuthenticatedActor,
    input: PaginationInput & {
      search?: string
      organizationIds?: readonly string[]
    }
  ): Promise<unknown> {
    const search = input.search ? boundedSearch(input.search) : undefined
    return this.listScopedOrganizations(actor, input, search)
  }

  private async listScopedOrganizations(
    actor: AuthenticatedActor,
    input: PaginationInput & {
      search?: string
      organizationIds?: readonly string[]
    },
    search?: string
  ): Promise<unknown> {
    const clauses: QueryFilter<OrganizationRecord>[] = []
    const visibleIds = await this.visibleOrganizationIds(actor)
    if (visibleIds !== undefined) {
      clauses.push({
        _id: {
          $in: visibleIds.filter((organizationId) =>
            Types.ObjectId.isValid(organizationId)
          )
        }
      })
    }
    if (input.organizationIds?.length) {
      clauses.push({
        _id: {
          $in: input.organizationIds.map((id) => new Types.ObjectId(id))
        }
      })
    }
    if (search) {
      clauses.push({
        $or: [
          { organizationCode: { $regex: search, $options: 'i' } },
          { 'name.th': { $regex: search, $options: 'i' } },
          { 'name.en': { $regex: search, $options: 'i' } }
        ]
      })
    }
    const filter: QueryFilter<OrganizationRecord> =
      clauses.length === 0
        ? {}
        : clauses.length === 1
          ? clauses[0]!
          : { $and: clauses }
    return paginate(this.organizations, filter, input, {
      organizationCode: 1,
      _id: 1
    })
  }

  public async createOrganization(
    actor: AuthenticatedActor,
    input: OrganizationRecord,
    requestId = 'unknown'
  ): Promise<unknown> {
    if (!this.isTenantStaff(actor)) {
      throw new ForbiddenException({ code: 'PERMISSION_DENIED' })
    }
    const normalizedInput = {
      ...input,
      ...(input.contactEmail
        ? { contactEmail: normalizedEmail(input.contactEmail) }
        : {})
    }
    return runWithTransaction(this.organizations.db, async (session) => {
      const [organization] = await this.organizations.create(
        [normalizedInput],
        { ...(session ? { session } : {}) }
      )
      if (!organization) {
        throw new ConflictException({ code: 'ORGANIZATION_CREATE_FAILED' })
      }
      await this.auditService.record(
        {
          requestId,
          actorId: actor.id,
          actorEmail: actor.email,
          action: 'organizations.created',
          route: 'POST /api/v2/organizations',
          method: 'POST',
          resourceScopes: [{ tenant: true }],
          metadata: { organizationRecordId: organization.id }
        },
        session
      )
      return organization.toJSON()
    })
  }

  public listEvaluators(
    actor: AuthenticatedActor,
    input: PaginationInput & {
      organizationId?: string
      evaluatorIds?: readonly string[]
      search?: string
    }
  ): Promise<unknown> {
    return this.listScopedEvaluators(actor, input)
  }

  private async listScopedEvaluators(
    actor: AuthenticatedActor,
    input: PaginationInput & {
      organizationId?: string
      evaluatorIds?: readonly string[]
      search?: string
    }
  ): Promise<unknown> {
    const clauses: QueryFilter<EvaluatorRecord>[] = []
    const visibleIds = await this.visibleOrganizationIds(actor)
    if (visibleIds !== undefined) {
      clauses.push({ organizationId: { $in: visibleIds } })
    }
    const assignedEvaluatorIds =
      await this.assignedEvaluatorIdsForStudent(actor)
    if (assignedEvaluatorIds !== undefined) {
      clauses.push({ _id: { $in: assignedEvaluatorIds } })
    }
    if (input.organizationId) {
      clauses.push({ organizationId: input.organizationId })
    }
    if (input.evaluatorIds?.length) {
      clauses.push({
        _id: {
          $in: input.evaluatorIds.map((id) => new Types.ObjectId(id))
        }
      })
    }
    if (input.search) {
      const search = boundedSearch(input.search)
      clauses.push({
        $or: [
          { email: { $regex: search, $options: 'i' } },
          { 'name.th': { $regex: search, $options: 'i' } },
          { 'name.en': { $regex: search, $options: 'i' } }
        ]
      })
    }
    const filter: QueryFilter<EvaluatorRecord> =
      clauses.length === 0
        ? {}
        : clauses.length === 1
          ? clauses[0]!
          : { $and: clauses }
    return paginate(this.evaluators, filter, input, { email: 1, _id: 1 })
  }

  public async createEvaluator(
    actor: AuthenticatedActor,
    input: EvaluatorRecord,
    requestId = 'unknown'
  ): Promise<unknown> {
    if (!Types.ObjectId.isValid(input.organizationId)) {
      throw new UnprocessableEntityException({
        code: 'ORGANIZATION_REFERENCE_INVALID',
        field: 'organizationId'
      })
    }
    const visibleIds = await this.visibleOrganizationIds(actor)
    if (
      visibleIds !== undefined &&
      !visibleIds.includes(input.organizationId)
    ) {
      throw new NotFoundException({ code: 'RESOURCE_NOT_FOUND' })
    }
    try {
      return await runWithTransaction(this.evaluators.db, async (session) => {
        const organization = await this.organizations
          .findOne({
            _id: new Types.ObjectId(input.organizationId),
            status: 'active'
          })
          .session(session ?? null)
          .exec()
        if (!organization) {
          throw new UnprocessableEntityException({
            code: 'ORGANIZATION_REFERENCE_NOT_FOUND',
            field: 'organizationId'
          })
        }
        const [evaluator] = await this.evaluators.create(
          [
            {
              ...input,
              organizationId: organization.id,
              email: normalizedEmail(input.email)
            }
          ],
          { ...(session ? { session } : {}) }
        )
        if (!evaluator) {
          throw new ConflictException({ code: 'EVALUATOR_CREATE_FAILED' })
        }
        const resourceScopes = await this.organizationAuditScopes(
          organization.id,
          actor,
          session
        )
        if (resourceScopes.length === 0) {
          throw new NotFoundException({ code: 'RESOURCE_NOT_FOUND' })
        }
        await this.auditService.record(
          {
            requestId,
            actorId: actor.id,
            actorEmail: actor.email,
            action: 'evaluators.created',
            route: 'POST /api/v2/evaluators',
            method: 'POST',
            resourceScopes,
            metadata: {
              evaluatorRecordId: evaluator.id,
              organizationRecordId: organization.id
            }
          },
          session
        )
        return evaluator.toJSON()
      })
    } catch (error) {
      if (
        typeof error === 'object' &&
        error !== null &&
        'code' in error &&
        error.code === 11000
      ) {
        throw new ConflictException({ code: 'EVALUATOR_ALREADY_EXISTS' })
      }
      throw error
    }
  }

  public async listPlacements(
    actor: AuthenticatedActor,
    input: PaginationInput & {
      studentId?: string
      academicTermId?: string
      status?: PlacementRecord['status']
    }
  ): Promise<unknown> {
    const placementScope = await this.visiblePlacementFilter(actor)
    const isUnrestrictedReader = this.isTenantDataReader(actor)
    const scopes: QueryFilter<PlacementRecord>[] = placementScope
      ? [placementScope]
      : isUnrestrictedReader
        ? [{}]
        : []
    if (
      !isUnrestrictedReader &&
      actor.roles.includes('evaluator') &&
      actor.scope.assignmentId &&
      Types.ObjectId.isValid(actor.scope.assignmentId)
    ) {
      const assignment = await this.assignments
        .findById(actor.scope.assignmentId)
        .select('placementId')
        .exec()
      scopes.push(assignment ? { _id: assignment.placementId } : { _id: null })
    }
    let filter: QueryFilter<PlacementRecord> =
      scopes.length === 0
        ? { _id: null }
        : scopes.length === 1
          ? scopes[0]!
          : { $or: scopes }
    const requestedFilters: QueryFilter<PlacementRecord>[] = []
    if (input.studentId) {
      const requestedStudent = await this.students
        .findOne({
          $or: [
            { studentId: input.studentId },
            ...(Types.ObjectId.isValid(input.studentId)
              ? [{ _id: new Types.ObjectId(input.studentId) }]
              : [])
          ]
        })
        .select('_id studentId')
        .exec()
      requestedFilters.push({
        studentId: {
          $in: requestedStudent
            ? [requestedStudent.id, requestedStudent.studentId]
            : [input.studentId]
        }
      })
    }
    if (input.academicTermId) {
      requestedFilters.push({ academicTermId: input.academicTermId })
    }
    if (input.status) requestedFilters.push({ status: input.status })
    if (requestedFilters.length > 0)
      filter = { $and: [filter, ...requestedFilters] }
    const page = await paginate(this.placements, filter, input)
    const studentReferences = page.items
      .map((placement) => placement.studentId)
      .filter((reference): reference is string => typeof reference === 'string')
    if (studentReferences.length === 0) return page

    const objectIds = studentReferences
      .filter((reference) => Types.ObjectId.isValid(reference))
      .map((reference) => new Types.ObjectId(reference))
    const studentReferenceBranches: QueryFilter<StudentRecord>[] = [
      { studentId: { $in: studentReferences } }
    ]
    if (objectIds.length > 0) {
      studentReferenceBranches.push({ _id: { $in: objectIds } })
    }
    const studentsByReference = await this.students
      .find({ $or: studentReferenceBranches })
      .select('_id studentId')
      .exec()
    const canonicalStudentIds = new Map<string, string>()
    for (const student of studentsByReference) {
      const studentRecordId = student._id.toString()
      canonicalStudentIds.set(studentRecordId, studentRecordId)
      canonicalStudentIds.set(student.studentId, studentRecordId)
    }

    return {
      ...page,
      items: page.items.map((placement) => {
        const reference = placement.studentId
        return typeof reference === 'string'
          ? {
              ...placement,
              studentId: canonicalStudentIds.get(reference) ?? reference
            }
          : placement
      })
    }
  }

  public async createPlacement(
    actor: AuthenticatedActor,
    input: PlacementRecord,
    requestId = 'unknown'
  ): Promise<unknown> {
    assertActorScope(actor, input)
    const studentFilter = Types.ObjectId.isValid(input.studentId)
      ? {
          $or: [
            { _id: new Types.ObjectId(input.studentId) },
            { studentId: input.studentId }
          ]
        }
      : { studentId: input.studentId }
    const organizationId = Types.ObjectId.isValid(input.organizationId)
      ? new Types.ObjectId(input.organizationId)
      : undefined
    if (!organizationId) {
      throw new UnprocessableEntityException({
        code: 'ORGANIZATION_REFERENCE_INVALID',
        field: 'organizationId'
      })
    }
    try {
      return await runWithTransaction(this.students.db, async (session) => {
        const student = await this.students
          .findOne({
            $and: [
              studentFilter,
              { status: 'active' },
              scopeFilter<StudentRecord>(actor)
            ]
          })
          .session(session ?? null)
          .exec()
        if (!student) {
          throw new NotFoundException({ code: 'RESOURCE_NOT_FOUND' })
        }
        assertActorScope(actor, student)
        if (
          !student.academicTermId ||
          !student.schoolId ||
          !student.programId
        ) {
          throw new UnprocessableEntityException({
            code: 'STUDENT_PLACEMENT_PROFILE_INCOMPLETE'
          })
        }

        const organization = await this.organizations
          .findOne({ _id: organizationId, status: 'active' })
          .session(session ?? null)
          .exec()
        if (!organization) {
          throw new UnprocessableEntityException({
            code: 'ORGANIZATION_REFERENCE_NOT_FOUND',
            field: 'organizationId'
          })
        }
        const term = await this.resolveAcademicTerm(
          undefined,
          undefined,
          input.academicTermId,
          session
        )
        if (!term || term.id !== student.academicTermId) {
          throw new UnprocessableEntityException({
            code: 'PLACEMENT_STUDENT_TERM_MISMATCH',
            field: 'academicTermId'
          })
        }
        if (
          input.schoolId !== student.schoolId ||
          input.programId !== student.programId
        ) {
          throw new UnprocessableEntityException({
            code: 'PLACEMENT_STUDENT_SCOPE_MISMATCH'
          })
        }
        await lockActiveAcademicScope(
          this.schools,
          this.programs,
          { schoolId: student.schoolId, programId: student.programId },
          session
        )
        const termLock = await this.academicTerms.updateOne(
          {
            _id: term.referenceId,
            __v: term.revision,
            status: { $ne: 'archived' }
          },
          { $inc: { __v: 1 } },
          { ...(session ? { session } : {}) }
        )
        if (termLock.matchedCount !== 1) {
          throw new ConflictException({ code: 'ACADEMIC_TERM_CHANGED' })
        }
        const duplicateQuery = this.placements
          .findOne({
            studentId: { $in: [student.id, student.studentId] },
            academicTermId: term.id
          })
          .select({ _id: 1 })
        if (session) duplicateQuery.session(session)
        if (await duplicateQuery) {
          throw new ConflictException({ code: 'PLACEMENT_ALREADY_EXISTS' })
        }

        const lock = await this.students.updateOne(
          { _id: student._id, status: 'active' },
          { $inc: { __v: 1 } },
          { ...(session ? { session } : {}) }
        )
        if (lock.matchedCount === 0) {
          throw new NotFoundException({ code: 'RESOURCE_NOT_FOUND' })
        }

        const [placement] = await this.placements.create(
          [
            {
              ...input,
              studentId: student.id,
              organizationId: organization.id,
              academicTermId: term.id,
              schoolId: student.schoolId,
              programId: student.programId
            }
          ],
          { ...(session ? { session } : {}) }
        )
        if (!placement) {
          throw new ConflictException({ code: 'PLACEMENT_CREATE_FAILED' })
        }
        await this.auditService.record(
          {
            requestId,
            actorId: actor.id,
            actorEmail: actor.email,
            action: 'placements.created',
            route: 'POST /api/v2/placements',
            method: 'POST',
            resourceScopes: [
              {
                schoolIds: [student.schoolId],
                programIds: [student.programId]
              }
            ],
            metadata: { placementRecordId: placement.id }
          },
          session
        )
        return placement.toJSON()
      })
    } catch (error) {
      if (
        typeof error === 'object' &&
        error !== null &&
        'code' in error &&
        error.code === 11000
      ) {
        throw new ConflictException({ code: 'PLACEMENT_ALREADY_EXISTS' })
      }
      throw error
    }
  }
}
