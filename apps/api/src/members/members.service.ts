import type { AuthenticatedActor } from '@internship/shared-types'
import { Injectable, NotFoundException } from '@nestjs/common'
import { InjectModel } from '@nestjs/mongoose'
import { Types, type Model, type QueryFilter } from 'mongoose'

import { paginate, type PaginationInput } from '../common/pagination.js'
import { boundedSearch } from '../common/search.js'
import { assertActorScope, scopeFilter } from '../common/scope.js'
import { AcademicTermRecord } from '../academic/academic.schema.js'
import { EvaluationAssignmentRecord } from '../evaluations/evaluation.schema.js'
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
      | 'personalEmail'
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
    private readonly assignments: Model<EvaluationAssignmentRecord>
  ) {}

  public async listStudents(
    actor: AuthenticatedActor,
    input: PaginationInput & {
      search?: string
      schoolId?: string
      programId?: string
      evaluationStatus?: string
      studentId?: string
    }
  ): Promise<unknown> {
    let filter: QueryFilter<StudentRecord> = scopeFilter<StudentRecord>(actor)
    if (actor.scope.studentId) {
      const student = await this.students
        .findOne({
          $or: [
            { studentId: actor.scope.studentId },
            ...(Types.ObjectId.isValid(actor.scope.studentId)
              ? [{ _id: new Types.ObjectId(actor.scope.studentId) }]
              : [])
          ]
        })
        .select('_id studentId')
        .exec()

      const studentCodes = [actor.scope.studentId]
      const objectIds: Types.ObjectId[] = []
      if (Types.ObjectId.isValid(actor.scope.studentId)) {
        objectIds.push(new Types.ObjectId(actor.scope.studentId))
      }
      if (student?._id) {
        objectIds.push(student._id)
      }
      if (student?.studentId) {
        studentCodes.push(student.studentId)
      }

      filter = {
        $or: [
          { studentId: { $in: studentCodes } },
          ...(objectIds.length > 0 ? [{ _id: { $in: objectIds } }] : [])
        ]
      }
    }
    const requestedFilters: QueryFilter<StudentRecord>[] = []
    if (input.studentId) requestedFilters.push({ studentId: input.studentId })
    if (input.schoolId) requestedFilters.push({ schoolId: input.schoolId })
    if (input.programId) requestedFilters.push({ programId: input.programId })
    if (input.evaluationStatus) {
      requestedFilters.push({
        evaluationStatus:
          input.evaluationStatus as StudentRecord['evaluationStatus']
      })
    }
    if (input.search) {
      const search = boundedSearch(input.search)
      const searchFilter = {
        $or: [
          { studentId: { $regex: search, $options: 'i' } },
          { email: { $regex: search, $options: 'i' } },
          { personalEmail: { $regex: search, $options: 'i' } },
          { 'name.th': { $regex: search, $options: 'i' } },
          { 'name.en': { $regex: search, $options: 'i' } },
          { company: { $regex: search, $options: 'i' } },
          { province: { $regex: search, $options: 'i' } },
          { evaluatorName: { $regex: search, $options: 'i' } },
          { evaluatorEmail: { $regex: search, $options: 'i' } }
        ]
      }
      requestedFilters.push(searchFilter)
    }
    if (requestedFilters.length > 0)
      filter = { $and: [filter, ...requestedFilters] }
    const result = await paginate(this.students, filter, input, {
      studentId: 1,
      _id: 1
    })
    const items = result.items as readonly (Readonly<
      Record<string, unknown>
    > & {
      id?: string
      evaluatorEmail?: string
      evaluatorName?: string
    })[]
    const missingEvaluatorIds = items
      .filter((s) => !s.evaluatorEmail || !s.evaluatorName)
      .map((s) => s.id)
      .filter((id): id is string => typeof id === 'string' && id.length > 0)

    if (missingEvaluatorIds.length > 0) {
      const assignments = await this.assignments
        .find({ studentId: { $in: missingEvaluatorIds } })
        .select('studentId evaluatorId')
        .exec()

      if (assignments.length > 0) {
        const evIds = assignments.map((a) => a.evaluatorId).filter(Boolean)
        const evaluators = await this.evaluators
          .find({ _id: { $in: evIds } })
          .select('_id email name')
          .exec()
        const evMap = new Map(evaluators.map((e) => [e._id.toString(), e]))
        const assignMap = new Map(
          assignments.map((a) => [a.studentId, evMap.get(a.evaluatorId)])
        )

        const enrichedItems = items.map((item) => {
          const sObj: Record<string, unknown> = { ...item }
          const sId = typeof sObj.id === 'string' ? sObj.id : undefined
          const ev = sId ? assignMap.get(sId) : undefined
          if (ev) {
            if (!sObj.evaluatorEmail && ev.email) sObj.evaluatorEmail = ev.email
            if (!sObj.evaluatorName)
              sObj.evaluatorName = ev.name?.th || ev.name?.en
          }
          return sObj
        })
        return { ...result, items: enrichedItems }
      }
    }

    return result
  }

  public async getStudent(
    actor: AuthenticatedActor,
    id: string
  ): Promise<unknown> {
    let scopeQuery: QueryFilter<StudentRecord> =
      scopeFilter<StudentRecord>(actor)
    if (actor.scope.studentId) {
      const student = await this.students
        .findOne({
          $or: [
            { studentId: actor.scope.studentId },
            ...(Types.ObjectId.isValid(actor.scope.studentId)
              ? [{ _id: new Types.ObjectId(actor.scope.studentId) }]
              : [])
          ]
        })
        .select('_id studentId')
        .exec()

      const studentCodes = [actor.scope.studentId]
      const objectIds: Types.ObjectId[] = []
      if (Types.ObjectId.isValid(actor.scope.studentId)) {
        objectIds.push(new Types.ObjectId(actor.scope.studentId))
      }
      if (student?._id) {
        objectIds.push(student._id)
      }
      if (student?.studentId) {
        studentCodes.push(student.studentId)
      }

      scopeQuery = {
        $or: [
          { studentId: { $in: studentCodes } },
          ...(objectIds.length > 0 ? [{ _id: { $in: objectIds } }] : [])
        ]
      }
    }
    const idFilter = Types.ObjectId.isValid(id)
      ? { $or: [{ _id: new Types.ObjectId(id) }, { studentId: id }] }
      : { studentId: id }
    const filter: QueryFilter<StudentRecord> = {
      $and: [idFilter, scopeQuery]
    }
    const student = await this.students.findOne(filter).exec()
    if (!student) throw new NotFoundException({ code: 'RESOURCE_NOT_FOUND' })
    const studentObj = student.toJSON() as unknown as Record<string, unknown>
    if (!studentObj.evaluatorEmail || !studentObj.evaluatorName) {
      const assignment = await this.assignments
        .findOne({
          studentId: { $in: [student.id, student.studentId] }
        })
        .select('evaluatorId')
        .exec()
      if (assignment?.evaluatorId) {
        const ev = await this.evaluators.findById(assignment.evaluatorId).exec()
        if (ev) {
          if (!studentObj.evaluatorEmail && ev.email)
            studentObj.evaluatorEmail = ev.email
          if (!studentObj.evaluatorName)
            studentObj.evaluatorName = ev.name?.th || ev.name?.en
        }
      }
    }
    return studentObj
  }

  private async resolveAcademicTermId(
    semester?: string,
    academicYear?: number
  ): Promise<string | undefined> {
    if (!semester || !academicYear) return undefined

    // Normalize semester to 1, 2, 3 for DB query
    let normalizedSemester = semester
    if (semester === 'ภาคการศึกษาต้น') normalizedSemester = '1'
    else if (semester === 'ภาคการศึกษาปลาย') normalizedSemester = '2'
    else if (semester === 'ภาคการศึกษาฤดูร้อน') normalizedSemester = '3'

    const term = await this.academicTerms
      .findOne({
        academicYear,
        semester: normalizedSemester
      })
      .exec()

    return term?.code || undefined
  }

  public async createStudent(
    actor: AuthenticatedActor,
    input: StudentCreateInput
  ): Promise<unknown> {
    assertActorScope(actor, input)
    if (!input.academicTermId && input.semester && input.academicYear) {
      const termId = await this.resolveAcademicTermId(
        input.semester,
        input.academicYear
      )
      if (termId) input.academicTermId = termId
    }
    return (await this.students.create(input)).toJSON()
  }

  public async updateStudent(
    actor: AuthenticatedActor,
    id: string,
    input: Partial<StudentRecord>
  ): Promise<unknown> {
    const existing = await this.students.findById(id).exec()
    if (!existing) throw new NotFoundException({ code: 'RESOURCE_NOT_FOUND' })
    assertActorScope(actor, {
      schoolId: input.schoolId ?? existing.schoolId,
      programId: input.programId ?? existing.programId
    })

    const isSchoolOrProgramChanged =
      (input.schoolId && input.schoolId !== existing.schoolId) ||
      (input.programId && input.programId !== existing.programId)

    if (input.semester !== undefined || input.academicYear !== undefined) {
      const sem = input.semester ?? existing.semester
      const yr = input.academicYear ?? existing.academicYear
      if (sem && yr) {
        const termId = await this.resolveAcademicTermId(sem, yr)
        if (termId) input.academicTermId = termId
      }
    }

    const student = await this.students
      .findByIdAndUpdate(
        id,
        { $set: input },
        { new: true, runValidators: true }
      )
      .exec()

    if (isSchoolOrProgramChanged && student) {
      await Promise.all([
        this.placements.updateMany(
          { studentId: student.studentId },
          { $set: { schoolId: student.schoolId, programId: student.programId } }
        ),
        this.assignments.updateMany(
          { studentId: student._id.toString() },
          { $set: { schoolId: student.schoolId, programId: student.programId } }
        )
      ])
    }

    return student!.toJSON()
  }

  public async archiveStudent(
    actor: AuthenticatedActor,
    id: string
  ): Promise<void> {
    const existing = await this.students.findById(id).exec()
    if (!existing) throw new NotFoundException({ code: 'RESOURCE_NOT_FOUND' })
    assertActorScope(actor, existing)
    await this.students.updateOne(
      { _id: id },
      { $set: { status: 'archived', archivedAt: new Date() } }
    )
  }

  public listOrganizations(
    input: PaginationInput & { search?: string }
  ): Promise<unknown> {
    const search = input.search ? boundedSearch(input.search) : undefined
    const filter: QueryFilter<OrganizationRecord> = search
      ? {
          $or: [
            { organizationCode: { $regex: search, $options: 'i' } },
            { 'name.th': { $regex: search, $options: 'i' } },
            { 'name.en': { $regex: search, $options: 'i' } }
          ]
        }
      : {}
    return paginate(this.organizations, filter, input, {
      organizationCode: 1,
      _id: 1
    })
  }

  public async createOrganization(input: OrganizationRecord): Promise<unknown> {
    return (await this.organizations.create(input)).toJSON()
  }

  public listEvaluators(
    input: PaginationInput & { organizationId?: string; search?: string }
  ): Promise<unknown> {
    const filter: QueryFilter<EvaluatorRecord> = {
      ...(input.organizationId ? { organizationId: input.organizationId } : {})
    }
    if (input.search) {
      const search = boundedSearch(input.search)
      filter.$or = [
        { email: { $regex: search, $options: 'i' } },
        { 'name.th': { $regex: search, $options: 'i' } },
        { 'name.en': { $regex: search, $options: 'i' } }
      ]
    }
    return paginate(this.evaluators, filter, input, { email: 1, _id: 1 })
  }

  public async createEvaluator(input: EvaluatorRecord): Promise<unknown> {
    return (await this.evaluators.create(input)).toJSON()
  }

  public async listPlacements(
    actor: AuthenticatedActor,
    input: PaginationInput & {
      studentId?: string
      academicTermId?: string
      status?: PlacementRecord['status']
    }
  ): Promise<unknown> {
    let filter: QueryFilter<PlacementRecord> =
      scopeFilter<PlacementRecord>(actor)
    if (actor.scope.studentId) {
      const student = await this.students
        .findOne({ studentId: actor.scope.studentId })
        .select('_id')
        .exec()
      const ids = [actor.scope.studentId]
      if (student?._id) ids.push(student._id.toString())
      filter = { studentId: { $in: ids } }
    }
    const requestedFilters: QueryFilter<PlacementRecord>[] = []
    if (input.studentId) requestedFilters.push({ studentId: input.studentId })
    if (input.academicTermId) {
      requestedFilters.push({ academicTermId: input.academicTermId })
    }
    if (input.status) requestedFilters.push({ status: input.status })
    if (requestedFilters.length > 0)
      filter = { $and: [filter, ...requestedFilters] }
    return paginate(this.placements, filter, input)
  }

  public async createPlacement(
    actor: AuthenticatedActor,
    input: PlacementRecord
  ): Promise<unknown> {
    assertActorScope(actor, input)
    return (await this.placements.create(input)).toJSON()
  }
}
