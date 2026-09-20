import type { AuthenticatedActor } from '@internship/shared-types'
import { Injectable, NotFoundException } from '@nestjs/common'
import { InjectModel } from '@nestjs/mongoose'
import type { Model, QueryFilter } from 'mongoose'

import { paginate, type PaginationInput } from '../common/pagination.js'
import { boundedSearch } from '../common/search.js'
import { assertActorScope, scopeFilter } from '../common/scope.js'
import {
  EvaluatorRecord,
  OrganizationRecord,
  PlacementRecord,
  StudentRecord
} from './members.schema.js'

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
    private readonly placements: Model<PlacementRecord>
  ) {}

  public async listStudents(
    actor: AuthenticatedActor,
    input: PaginationInput & {
      search?: string
      schoolId?: string
      programId?: string
      evaluationStatus?: string
    }
  ): Promise<unknown> {
    let filter: QueryFilter<StudentRecord> = scopeFilter<StudentRecord>(actor)
    if (actor.scope.studentId) {
      const student = await this.students
        .findOne({ studentId: actor.scope.studentId })
        .select('_id')
        .exec()
      const ids = [actor.scope.studentId]
      if (student?._id) ids.push(student._id.toString())
      filter = { $or: [{ studentId: { $in: ids } }, { _id: { $in: ids } }] }
    }
    const requestedFilters: QueryFilter<StudentRecord>[] = []
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
          { province: { $regex: search, $options: 'i' } }
        ]
      }
      requestedFilters.push(searchFilter)
    }
    if (requestedFilters.length > 0)
      filter = { $and: [filter, ...requestedFilters] }
    return paginate(this.students, filter, input, { studentId: 1, _id: 1 })
  }

  public async getStudent(
    actor: AuthenticatedActor,
    id: string
  ): Promise<unknown> {
    let scopeQuery: QueryFilter<StudentRecord> =
      scopeFilter<StudentRecord>(actor)
    if (actor.scope.studentId) {
      const student = await this.students
        .findOne({ studentId: actor.scope.studentId })
        .select('_id')
        .exec()
      const ids = [actor.scope.studentId]
      if (student?._id) ids.push(student._id.toString())
      scopeQuery = { $or: [{ studentId: { $in: ids } }, { _id: { $in: ids } }] }
    }
    const filter: QueryFilter<StudentRecord> = {
      $and: [{ $or: [{ _id: id }, { studentId: id }] }, scopeQuery]
    }
    const student = await this.students.findOne(filter).exec()
    if (!student) throw new NotFoundException({ code: 'RESOURCE_NOT_FOUND' })
    return student.toJSON()
  }

  public async createStudent(
    actor: AuthenticatedActor,
    input: StudentRecord
  ): Promise<unknown> {
    assertActorScope(actor, input)
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
    const student = await this.students
      .findByIdAndUpdate(
        id,
        { $set: input },
        { new: true, runValidators: true }
      )
      .exec()
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
