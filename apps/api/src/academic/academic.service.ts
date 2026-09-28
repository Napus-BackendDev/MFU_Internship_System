import type { AccessScope, AuthenticatedActor } from '@internship/shared-types'
import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  Optional,
  ServiceUnavailableException,
  UnprocessableEntityException
} from '@nestjs/common'
import { InjectModel } from '@nestjs/mongoose'
import {
  Types,
  type ClientSession,
  type HydratedDocument,
  type Model,
  type QueryFilter
} from 'mongoose'

import { AuditService, type AuditInput } from '../audit/audit.service.js'
import type { AuditResourceScope } from '../audit/audit.schema.js'
import { paginate, type PaginationInput } from '../common/pagination.js'
import { boundedSearch } from '../common/search.js'
import { assertActorScope, scopeFilter } from '../common/scope.js'
import {
  EvaluationAssignmentRecord,
  EvaluationCycleRecord
} from '../evaluations/evaluation.schema.js'
import { PlacementRecord, StudentRecord } from '../members/members.schema.js'
import { lockActiveAcademicScope } from './academic-reference-lock.js'
import { studentReferenceFilter } from '../members/student-reference.js'
import {
  AcademicTermRecord,
  CourseRecord,
  ProgramRecord,
  SchoolRecord
} from './academic.schema.js'

function andFilters<T>(filters: readonly QueryFilter<T>[]): QueryFilter<T> {
  if (filters.length === 0) return {}
  if (filters.length === 1) return filters[0]!
  return { $and: [...filters] }
}

@Injectable()
export class AcademicService {
  public constructor(
    @InjectModel(SchoolRecord.name)
    private readonly schools: Model<SchoolRecord>,
    @InjectModel(ProgramRecord.name)
    private readonly programs: Model<ProgramRecord>,
    @InjectModel(CourseRecord.name)
    private readonly courses: Model<CourseRecord>,
    @InjectModel(AcademicTermRecord.name)
    private readonly terms: Model<AcademicTermRecord>,
    private readonly auditService: AuditService,
    @Optional()
    @InjectModel(EvaluationCycleRecord.name)
    private readonly cycles?: Model<EvaluationCycleRecord>,
    @Optional()
    @InjectModel(PlacementRecord.name)
    private readonly placements?: Model<PlacementRecord>,
    @Optional()
    @InjectModel(StudentRecord.name)
    private readonly students?: Model<StudentRecord>,
    @Optional()
    @InjectModel(EvaluationAssignmentRecord.name)
    private readonly assignments?: Model<EvaluationAssignmentRecord>
  ) {}

  private auditedMutation<T>(
    actor: AuthenticatedActor,
    requestId: string,
    mutation: (session: ClientSession) => Promise<{
      readonly value: T
      readonly audit: Omit<AuditInput, 'actorId' | 'actorEmail' | 'requestId'>
    }>
  ): Promise<T> {
    return this.schools.db.transaction(async (session) => {
      const { value, audit } = await mutation(session)
      await this.auditService.record(
        {
          ...audit,
          requestId,
          actorId: actor.id,
          actorEmail: actor.email
        },
        session
      )
      return value
    })
  }

  private programAuditScopes(
    programs: readonly { readonly id: string; readonly schoolId: string }[]
  ): AuditResourceScope[] {
    return programs.map((program) => ({
      schoolIds: [program.schoolId],
      programIds: [program.id]
    }))
  }

  private actorAcademicScopes(
    actor: AuthenticatedActor
  ): readonly Pick<AccessScope, 'tenant' | 'schoolIds' | 'programIds'>[] {
    if (actor.roles.includes('systemAdmin')) {
      return [{ tenant: true, schoolIds: [], programIds: [] }]
    }
    if (actor.roleScopes) {
      return actor.roleScopes
        .filter(
          (scope) =>
            actor.roles.includes(scope.role) &&
            (!scope.tenant || scope.role === 'internshipStaff')
        )
        .map((scope) => ({
          tenant: scope.role === 'internshipStaff' && scope.tenant,
          schoolIds: scope.schoolIds,
          programIds: scope.programIds
        }))
    }
    if (actor.roles.length !== 1) return []
    return [
      {
        tenant: actor.roles[0] === 'internshipStaff' && actor.scope.tenant,
        schoolIds: actor.scope.schoolIds,
        programIds: actor.scope.programIds
      }
    ]
  }

  private programFilterForScopes(
    scopes: readonly Pick<AccessScope, 'tenant' | 'schoolIds' | 'programIds'>[]
  ): QueryFilter<ProgramRecord> {
    if (scopes.some((scope) => scope.tenant)) return {}
    const clauses: QueryFilter<ProgramRecord>[] = []
    for (const scope of scopes) {
      const dimensions: QueryFilter<ProgramRecord>[] = []
      if (scope.schoolIds.length > 0) {
        dimensions.push({ schoolId: { $in: [...scope.schoolIds] } })
      }
      if (scope.programIds.length > 0) {
        dimensions.push({ _id: { $in: [...scope.programIds] } })
      }
      if (dimensions.length === 1 && dimensions[0]) clauses.push(dimensions[0])
      else if (dimensions.length > 1) clauses.push({ $and: dimensions })
    }
    if (clauses.length === 0) return { _id: null }
    return clauses.length === 1 ? clauses[0]! : { $or: clauses }
  }

  private assertTenantAcademicManagement(actor: AuthenticatedActor): void {
    if (actor.roles.includes('systemAdmin')) return
    const hasTenantStaffScope = actor.roleScopes
      ? actor.roleScopes.some(
          (scope) =>
            scope.role === 'internshipStaff' &&
            scope.tenant &&
            actor.roles.includes(scope.role)
        )
      : actor.roles.length === 1 &&
        actor.roles[0] === 'internshipStaff' &&
        actor.scope.tenant
    if (!hasTenantStaffScope) {
      throw new ForbiddenException({ code: 'PERMISSION_DENIED' })
    }
  }

  private assertResourceScope(
    actor: AuthenticatedActor,
    record: { schoolId?: string; programId?: string }
  ): void {
    try {
      assertActorScope(actor, record)
    } catch (error) {
      if (error instanceof ForbiddenException) {
        throw new NotFoundException({ code: 'RESOURCE_NOT_FOUND' })
      }
      throw error
    }
  }

  private async resolveActiveSchool(
    id: string
  ): Promise<HydratedDocument<SchoolRecord>> {
    if (!Types.ObjectId.isValid(id)) {
      throw new UnprocessableEntityException({
        code: 'SCHOOL_REFERENCE_INVALID',
        field: 'schoolId'
      })
    }
    const school = await this.schools
      .findOne({ _id: new Types.ObjectId(id), status: { $ne: 'archived' } })
      .exec()
    if (!school) {
      throw new UnprocessableEntityException({
        code: 'SCHOOL_REFERENCE_NOT_FOUND',
        field: 'schoolId'
      })
    }
    return school
  }

  private async resolveActivePrograms(
    ids: readonly string[]
  ): Promise<HydratedDocument<ProgramRecord>[]> {
    const uniqueIds = [...new Set(ids)]
    if (
      uniqueIds.length === 0 ||
      uniqueIds.some((id) => !Types.ObjectId.isValid(id))
    ) {
      throw new UnprocessableEntityException({
        code: 'PROGRAM_REFERENCES_INVALID',
        field: 'programIds'
      })
    }
    const programs = await this.programs
      .find({
        _id: { $in: uniqueIds.map((id) => new Types.ObjectId(id)) },
        status: { $ne: 'archived' }
      })
      .exec()
    if (programs.length !== uniqueIds.length) {
      throw new UnprocessableEntityException({
        code: 'PROGRAM_REFERENCES_NOT_FOUND',
        field: 'programIds'
      })
    }
    return programs
  }

  private assertProgramManagementScope(
    actor: AuthenticatedActor,
    programs: readonly HydratedDocument<ProgramRecord>[]
  ): void {
    if (programs.length === 0) {
      this.assertTenantAcademicManagement(actor)
      return
    }
    for (const program of programs) {
      assertActorScope(actor, {
        schoolId: program.schoolId,
        programId: program.id
      })
    }
  }

  public listSchools(
    actor: AuthenticatedActor,
    page: PaginationInput,
    options: {
      readonly archived?: boolean
      readonly schoolIds?: readonly string[]
      readonly search?: string
    } = {}
  ): Promise<unknown> {
    return this.listScopedSchools(actor, page, options)
  }

  private async listScopedSchools(
    actor: AuthenticatedActor,
    page: PaginationInput,
    options: {
      readonly archived?: boolean
      readonly schoolIds?: readonly string[]
      readonly search?: string
    }
  ): Promise<unknown> {
    const filters: QueryFilter<SchoolRecord>[] = []
    const scopes = this.actorAcademicScopes(actor)
    if (!scopes.some((scope) => scope.tenant)) {
      const schoolIds = new Set(scopes.flatMap((scope) => [...scope.schoolIds]))
      const programOnlyScopes = scopes.filter(
        (scope) => scope.schoolIds.length === 0 && scope.programIds.length > 0
      )
      for (const scope of programOnlyScopes) {
        const programs = await this.programs
          .find({ _id: { $in: [...scope.programIds] } })
          .select('schoolId')
          .exec()
        for (const program of programs) schoolIds.add(program.schoolId)
      }
      filters.push(
        schoolIds.size > 0 ? { _id: { $in: [...schoolIds] } } : { _id: null }
      )
    }
    if (options.schoolIds !== undefined) {
      filters.push({
        _id: { $in: options.schoolIds.map((id) => new Types.ObjectId(id)) }
      })
    }
    if (options.search) {
      filters.push({
        schoolCode: {
          $regex: new RegExp(
            `^${boundedSearch(options.search).toUpperCase()}`,
            'u'
          )
        }
      })
    }
    if (options.archived === false)
      filters.push({ status: { $ne: 'archived' } })
    return paginate(this.schools, andFilters(filters), page, {
      schoolCode: 1,
      _id: 1
    })
  }

  public async createSchool(
    actor: AuthenticatedActor,
    input: SchoolRecord,
    requestId = 'unknown'
  ): Promise<unknown> {
    this.assertTenantAcademicManagement(actor)
    return this.auditedMutation(actor, requestId, async (session) => {
      const [school] = await this.schools.create([input], { session })
      if (!school) throw new ConflictException({ code: 'SCHOOL_CREATE_FAILED' })
      return {
        value: school.toJSON(),
        audit: {
          action: 'schools.created',
          route: 'POST /api/v2/academic/schools',
          method: 'POST',
          resourceScopes: [{ tenant: true }],
          metadata: { schoolRecordId: school.id }
        }
      }
    })
  }

  public async updateSchool(
    actor: AuthenticatedActor,
    id: string,
    input: Partial<SchoolRecord>,
    requestId = 'unknown'
  ): Promise<unknown> {
    const current = await this.schools.findById(id).exec()
    if (!current) throw new NotFoundException({ code: 'RESOURCE_NOT_FOUND' })
    this.assertResourceScope(actor, { schoolId: current.id })
    const archiving =
      input.status === 'archived' && current.status !== 'archived'
    const currentVersion = typeof current.__v === 'number' ? current.__v : 0
    return this.auditedMutation(actor, requestId, async (session) => {
      let linkedPrograms: HydratedDocument<ProgramRecord>[] = []
      if (archiving) {
        if (!this.cycles || !this.placements) {
          throw new ServiceUnavailableException({
            code: 'ACADEMIC_REFERENCE_ARCHIVE_GUARD_UNAVAILABLE'
          })
        }
        linkedPrograms = await this.programs
          .find({ schoolId: current.id })
          .select('_id schoolId status')
          .session(session)
          .exec()
        if (linkedPrograms.some((program) => program.status !== 'archived')) {
          throw new ConflictException({ code: 'SCHOOL_HAS_ACTIVE_PROGRAMS' })
        }
        const programIds = linkedPrograms.map((program) => program.id)
        const cycleScope: QueryFilter<EvaluationCycleRecord> =
          programIds.length > 0
            ? {
                $or: [
                  { schoolId: current.id },
                  { programId: { $in: programIds } }
                ]
              }
            : { schoolId: current.id }
        const openCycle = await this.cycles
          .exists({
            $and: [cycleScope, { status: { $in: ['draft', 'active'] } }]
          })
          .session(session)
          .exec()
        const placementScope =
          programIds.length > 0
            ? {
                $or: [
                  { schoolId: current.id },
                  { programId: { $in: programIds } }
                ]
              }
            : { schoolId: current.id }
        const livePlacement = await this.placements
          .exists({
            $and: [placementScope, { status: { $in: ['planned', 'active'] } }]
          })
          .session(session)
          .exec()
        if (openCycle || livePlacement) {
          throw new ConflictException({ code: 'SCHOOL_HAS_OPEN_WORK' })
        }
      }
      const school = await this.schools
        .findOneAndUpdate(
          { _id: current._id, __v: currentVersion, status: current.status },
          { $set: input, $inc: { __v: 1 } },
          { returnDocument: 'after', runValidators: true, session }
        )
        .exec()
      if (!school) {
        const stillExists = await this.schools
          .exists({ _id: current._id })
          .session(session)
          .exec()
        if (!stillExists) {
          throw new NotFoundException({ code: 'RESOURCE_NOT_FOUND' })
        }
        throw new ConflictException({ code: 'SCHOOL_CHANGED' })
      }
      const programs = archiving
        ? linkedPrograms
        : await this.programs
            .find({ schoolId: school.id })
            .select('_id schoolId')
            .session(session)
            .exec()
      return {
        value: school.toJSON(),
        audit: {
          action: 'schools.updated',
          route: 'PATCH /api/v2/academic/schools/:schoolId',
          method: 'PATCH',
          resourceScopes: [
            { schoolIds: [school.id] },
            ...this.programAuditScopes(programs)
          ],
          metadata: { schoolRecordId: school.id }
        }
      }
    })
  }

  public listPrograms(
    actor: AuthenticatedActor,
    page: PaginationInput,
    schoolId?: string,
    programIds?: readonly string[]
  ): Promise<unknown> {
    const baseFilter = this.programFilterForScopes(
      this.actorAcademicScopes(actor)
    )
    const filters: QueryFilter<ProgramRecord>[] = [baseFilter]
    if (schoolId) filters.push({ schoolId })
    if (programIds !== undefined) {
      filters.push({ _id: { $in: [...programIds] } })
    }
    const filter: QueryFilter<ProgramRecord> =
      filters.length === 1 ? baseFilter : { $and: filters }
    return paginate(this.programs, filter, page, { programCode: 1, _id: 1 })
  }

  public async createProgram(
    actor: AuthenticatedActor,
    input: ProgramRecord,
    requestId = 'unknown'
  ): Promise<unknown> {
    const school = await this.resolveActiveSchool(input.schoolId)
    assertActorScope(actor, { schoolId: school.id })
    return this.auditedMutation(actor, requestId, async (session) => {
      const lockedScope = await lockActiveAcademicScope(
        this.schools,
        this.programs,
        { schoolId: school.id },
        session
      )
      const [program] = await this.programs.create(
        [{ ...input, schoolId: lockedScope.schoolId ?? school.id }],
        { session }
      )
      if (!program) {
        throw new ConflictException({ code: 'PROGRAM_CREATE_FAILED' })
      }
      return {
        value: program.toJSON(),
        audit: {
          action: 'programs.created',
          route: 'POST /api/v2/academic/programs',
          method: 'POST',
          resourceScopes: [
            { schoolIds: [program.schoolId], programIds: [program.id] }
          ],
          metadata: { programRecordId: program.id }
        }
      }
    })
  }

  public async updateProgram(
    actor: AuthenticatedActor,
    id: string,
    input: Partial<ProgramRecord>,
    requestId = 'unknown'
  ): Promise<unknown> {
    const current = await this.programs.findById(id).exec()
    if (!current) throw new NotFoundException({ code: 'RESOURCE_NOT_FOUND' })
    this.assertResourceScope(actor, {
      schoolId: current.schoolId,
      programId: current.id
    })
    if (input.schoolId !== undefined && input.schoolId !== current.schoolId) {
      this.assertTenantAcademicManagement(actor)
      throw new UnprocessableEntityException({
        code: 'PROGRAM_SCHOOL_CHANGE_REQUIRES_MIGRATION',
        field: 'schoolId'
      })
    }
    const archiving =
      input.status === 'archived' && current.status !== 'archived'
    const reactivating =
      input.status === 'active' && current.status === 'archived'
    const currentVersion = typeof current.__v === 'number' ? current.__v : 0
    return this.auditedMutation(actor, requestId, async (session) => {
      if (archiving) {
        if (!this.cycles || !this.placements) {
          throw new ServiceUnavailableException({
            code: 'ACADEMIC_REFERENCE_ARCHIVE_GUARD_UNAVAILABLE'
          })
        }
        const openCycle = await this.cycles
          .exists({
            programId: current.id,
            status: { $in: ['draft', 'active'] }
          })
          .session(session)
          .exec()
        const livePlacement = await this.placements
          .exists({
            programId: current.id,
            status: { $in: ['planned', 'active'] }
          })
          .session(session)
          .exec()
        if (openCycle || livePlacement) {
          throw new ConflictException({ code: 'PROGRAM_HAS_OPEN_WORK' })
        }
      }
      if (reactivating) {
        await lockActiveAcademicScope(
          this.schools,
          this.programs,
          { schoolId: current.schoolId },
          session
        )
      }
      const program = await this.programs
        .findOneAndUpdate(
          {
            _id: current._id,
            schoolId: current.schoolId,
            status: current.status,
            __v: currentVersion
          },
          { $set: input, $inc: { __v: 1 } },
          { returnDocument: 'after', runValidators: true, session }
        )
        .exec()
      if (!program) {
        const stillExists = await this.programs
          .exists({ _id: current._id, schoolId: current.schoolId })
          .session(session)
          .exec()
        if (!stillExists) {
          throw new NotFoundException({ code: 'RESOURCE_NOT_FOUND' })
        }
        throw new ConflictException({ code: 'PROGRAM_CHANGED' })
      }
      return {
        value: program.toJSON(),
        audit: {
          action: 'programs.updated',
          route: 'PATCH /api/v2/academic/programs/:programId',
          method: 'PATCH',
          resourceScopes: [
            { schoolIds: [program.schoolId], programIds: [program.id] }
          ],
          metadata: { programRecordId: program.id }
        }
      }
    })
  }

  public async listCourses(
    actor: AuthenticatedActor,
    page: PaginationInput
  ): Promise<unknown> {
    const scopes = this.actorAcademicScopes(actor)
    if (scopes.some((scope) => scope.tenant)) {
      return paginate(this.courses, {}, page, { courseCode: 1, _id: 1 })
    }

    const authorizedProgramIds = new Set<string>()
    for (const scope of scopes) {
      if (scope.schoolIds.length === 0 && scope.programIds.length === 0)
        continue
      const programs = await this.programs
        .find(this.programFilterForScopes([scope]))
        .select('_id')
        .exec()
      for (const program of programs) authorizedProgramIds.add(program.id)
    }
    const filter: QueryFilter<CourseRecord> =
      authorizedProgramIds.size > 0
        ? { programIds: { $in: [...authorizedProgramIds] } }
        : { _id: null }
    return paginate(this.courses, filter, page, { courseCode: 1, _id: 1 })
  }

  public async createCourse(
    actor: AuthenticatedActor,
    input: CourseRecord,
    requestId = 'unknown'
  ): Promise<unknown> {
    const programs = input.programIds.length
      ? await this.resolveActivePrograms(input.programIds)
      : []
    this.assertProgramManagementScope(actor, programs)
    input.programIds = programs.map((program) => program.id)
    const resourceScopes = this.programAuditScopes(programs)
    return this.auditedMutation(actor, requestId, async (session) => {
      for (const program of programs) {
        await lockActiveAcademicScope(
          this.schools,
          this.programs,
          { programId: program.id },
          session
        )
      }
      const [course] = await this.courses.create([input], { session })
      if (!course) throw new ConflictException({ code: 'COURSE_CREATE_FAILED' })
      return {
        value: course.toJSON(),
        audit: {
          action: 'courses.created',
          route: 'POST /api/v2/academic/courses',
          method: 'POST',
          resourceScopes:
            resourceScopes.length > 0 ? resourceScopes : [{ tenant: true }],
          metadata: { courseRecordId: course.id }
        }
      }
    })
  }

  public async updateCourse(
    actor: AuthenticatedActor,
    id: string,
    input: Partial<CourseRecord>,
    requestId = 'unknown'
  ): Promise<unknown> {
    const current = await this.courses.findById(id).exec()
    if (!current) throw new NotFoundException({ code: 'RESOURCE_NOT_FOUND' })
    const currentPrograms = current.programIds.length
      ? await this.resolveActivePrograms(current.programIds)
      : []
    let resultingPrograms = currentPrograms
    try {
      this.assertProgramManagementScope(actor, currentPrograms)
    } catch (error) {
      if (error instanceof ForbiddenException) {
        throw new NotFoundException({ code: 'RESOURCE_NOT_FOUND' })
      }
      throw error
    }
    const update = { ...input }
    if (input.programIds !== undefined) {
      const requestedProgramIds = new Set(input.programIds)
      if (
        current.programIds.some(
          (programId) => !requestedProgramIds.has(programId)
        )
      ) {
        // Generic PATCH has no coordinated Student-reference migration path.
        throw new ConflictException({
          code: 'COURSE_PROGRAM_CHANGE_REQUIRES_MIGRATION',
          field: 'programIds'
        })
      }
      const programs = input.programIds.length
        ? await this.resolveActivePrograms(input.programIds)
        : []
      this.assertProgramManagementScope(actor, programs)
      update.programIds = programs.map((program) => program.id)
      resultingPrograms = programs
    }
    if (input.status === 'archived' && current.status !== 'archived') {
      // Retirement must be coordinated with references and in-flight writes.
      throw new ConflictException({
        code: 'COURSE_ARCHIVE_REQUIRES_MIGRATION',
        field: 'status'
      })
    }
    const programScopes = this.programAuditScopes(resultingPrograms)
    return this.auditedMutation(actor, requestId, async (session) => {
      for (const program of resultingPrograms) {
        await lockActiveAcademicScope(
          this.schools,
          this.programs,
          { programId: program.id },
          session
        )
      }
      const course = await this.courses
        .findOneAndUpdate(
          { _id: current._id },
          { $set: update, $inc: { __v: 1 } },
          { returnDocument: 'after', runValidators: true, session }
        )
        .exec()
      if (!course) throw new NotFoundException({ code: 'RESOURCE_NOT_FOUND' })
      return {
        value: course.toJSON(),
        audit: {
          action: 'courses.updated',
          route: 'PATCH /api/v2/academic/courses/:courseId',
          method: 'PATCH',
          resourceScopes:
            programScopes.length > 0 ? programScopes : [{ tenant: true }],
          metadata: { courseRecordId: course.id }
        }
      }
    })
  }

  public async listTerms(
    actor: AuthenticatedActor,
    page: PaginationInput,
    academicYear?: number,
    options: {
      readonly archived?: boolean
      readonly search?: string
      readonly termIds?: readonly string[]
    } = {}
  ): Promise<unknown> {
    const filters: QueryFilter<AcademicTermRecord>[] = []
    if (academicYear !== undefined) filters.push({ academicYear })
    if (options.termIds !== undefined) {
      filters.push({
        _id: { $in: options.termIds.map((id) => new Types.ObjectId(id)) }
      })
    }
    if (options.search) {
      const prefix = new RegExp(`^${boundedSearch(options.search)}`, 'u')
      filters.push({
        $or: [
          { code: { $regex: prefix } },
          { semester: { $regex: prefix } },
          ...(/^\d+$/.test(options.search)
            ? [{ academicYear: Number(options.search) }]
            : [])
        ]
      })
    }
    if (options.archived === false)
      filters.push({ status: { $ne: 'archived' } })
    const tenantStaff = actor.roleScopes
      ? actor.roleScopes.some(
          (scope) =>
            scope.role === 'internshipStaff' &&
            scope.tenant &&
            actor.roles.includes(scope.role)
        )
      : actor.roles.length === 1 &&
        actor.roles[0] === 'internshipStaff' &&
        actor.scope.tenant
    if (actor.roles.includes('systemAdmin') || tenantStaff) {
      return paginate(this.terms, andFilters(filters), page, {
        startsAt: -1,
        _id: -1
      })
    }

    const termIds = new Set<string>()
    const addTermId = (value: unknown): void => {
      const termId = String(value)
      if (Types.ObjectId.isValid(termId)) termIds.add(termId)
    }
    const scopedReadRoles = ['internshipStaff', 'coordinator', 'auditor']
    if (actor.roles.some((role) => scopedReadRoles.includes(role))) {
      if (!this.placements) {
        throw new ServiceUnavailableException({
          code: 'ACADEMIC_TERM_SCOPE_UNAVAILABLE'
        })
      }
      const scopedTermIds = await this.placements.distinct(
        'academicTermId',
        scopeFilter<PlacementRecord>(actor, scopedReadRoles)
      )
      for (const termId of scopedTermIds) addTermId(termId)
    }

    if (actor.roles.includes('student') && actor.scope.studentId) {
      if (!this.students || !this.placements) {
        throw new ServiceUnavailableException({
          code: 'ACADEMIC_TERM_SCOPE_UNAVAILABLE'
        })
      }
      const student = await this.students
        .findOne(studentReferenceFilter(actor.scope.studentId))
        .select('_id studentId academicTermId')
        .lean()
        .exec()
      if (student) {
        if (student.academicTermId) addTermId(student.academicTermId)
        const ownTermIds = await this.placements.distinct('academicTermId', {
          studentId: { $in: [student._id.toString(), student.studentId] }
        })
        for (const termId of ownTermIds) addTermId(termId)
      }
    }

    if (
      actor.roles.includes('evaluator') &&
      actor.scope.assignmentId &&
      Types.ObjectId.isValid(actor.scope.assignmentId)
    ) {
      if (!this.assignments || !this.cycles) {
        throw new ServiceUnavailableException({
          code: 'ACADEMIC_TERM_SCOPE_UNAVAILABLE'
        })
      }
      const assignment = await this.assignments
        .findById(actor.scope.assignmentId)
        .select('cycleId')
        .lean()
        .exec()
      if (assignment) {
        const cycle = await this.cycles
          .findById(assignment.cycleId)
          .select('academicTermId')
          .lean()
          .exec()
        if (cycle) addTermId(cycle.academicTermId)
      }
    }

    filters.push({
      _id: { $in: [...termIds].map((id) => new Types.ObjectId(id)) }
    })
    return paginate(this.terms, andFilters(filters), page, {
      startsAt: -1,
      _id: -1
    })
  }

  public async createTerm(
    actor: AuthenticatedActor,
    input: AcademicTermRecord,
    requestId = 'unknown'
  ): Promise<unknown> {
    this.assertTenantAcademicManagement(actor)
    return this.auditedMutation(actor, requestId, async (session) => {
      const [term] = await this.terms.create([input], { session })
      if (!term)
        throw new ConflictException({ code: 'ACADEMIC_TERM_CREATE_FAILED' })
      return {
        value: term.toJSON(),
        audit: {
          action: 'academicTerms.created',
          route: 'POST /api/v2/academic/terms',
          method: 'POST',
          resourceScopes: [{ tenant: true }],
          metadata: { academicTermRecordId: term.id }
        }
      }
    })
  }

  public async updateTerm(
    actor: AuthenticatedActor,
    id: string,
    input: Partial<AcademicTermRecord>,
    requestId = 'unknown'
  ): Promise<unknown> {
    this.assertTenantAcademicManagement(actor)
    const current = await this.terms.findById(id).exec()
    if (!current) throw new NotFoundException({ code: 'RESOURCE_NOT_FOUND' })

    const startsAt = input.startsAt ?? current.startsAt
    const endsAt = input.endsAt ?? current.endsAt
    if (
      !(startsAt instanceof Date) ||
      !(endsAt instanceof Date) ||
      !Number.isFinite(startsAt.getTime()) ||
      !Number.isFinite(endsAt.getTime()) ||
      endsAt <= startsAt
    ) {
      throw new UnprocessableEntityException({
        code: 'ACADEMIC_TERM_DATE_RANGE_INVALID',
        field: input.endsAt !== undefined ? 'endsAt' : 'startsAt'
      })
    }

    const archiving =
      input.status === 'archived' && current.status !== 'archived'
    const currentVersion = typeof current.__v === 'number' ? current.__v : 0

    // Compare-and-set the term revision as well as dates. Cycle/placement
    // creation increments this same revision inside its transaction, so an
    // archive cannot race a newly-created live reference.
    return this.auditedMutation(actor, requestId, async (session) => {
      if (archiving) {
        if (!this.cycles || !this.placements) {
          throw new ServiceUnavailableException({
            code: 'ACADEMIC_TERM_ARCHIVE_GUARD_UNAVAILABLE'
          })
        }
        const openCycle = await this.cycles
          .exists({
            academicTermId: current.id,
            status: { $in: ['draft', 'active'] }
          })
          .session(session)
          .exec()
        const livePlacement = await this.placements
          .exists({
            academicTermId: current.id,
            status: { $in: ['planned', 'active'] }
          })
          .session(session)
          .exec()
        if (openCycle || livePlacement) {
          throw new ConflictException({
            code: 'ACADEMIC_TERM_HAS_OPEN_WORK'
          })
        }
      }

      const term = await this.terms
        .findOneAndUpdate(
          {
            _id: current._id,
            startsAt: current.startsAt,
            endsAt: current.endsAt,
            __v: currentVersion
          },
          { $set: input, $inc: { __v: 1 } },
          { returnDocument: 'after', runValidators: true, session }
        )
        .exec()
      if (!term) {
        const stillExists = await this.terms
          .exists({ _id: current._id })
          .session(session)
          .exec()
        if (!stillExists) {
          throw new NotFoundException({ code: 'RESOURCE_NOT_FOUND' })
        }
        throw new ConflictException({ code: 'ACADEMIC_TERM_CHANGED' })
      }
      return {
        value: term.toJSON(),
        audit: {
          action: 'academicTerms.updated',
          route: 'PATCH /api/v2/academic/terms/:termId',
          method: 'PATCH',
          resourceScopes: [{ tenant: true }],
          metadata: { academicTermRecordId: term.id }
        }
      }
    })
  }
}
