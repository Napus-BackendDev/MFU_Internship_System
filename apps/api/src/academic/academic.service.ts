import type { AuthenticatedActor } from '@internship/shared-types'
import { Injectable, NotFoundException } from '@nestjs/common'
import { InjectModel } from '@nestjs/mongoose'
import type { Model, QueryFilter } from 'mongoose'

import { paginate, type PaginationInput } from '../common/pagination.js'
import {
  AcademicTermRecord,
  CourseRecord,
  ProgramRecord,
  SchoolRecord
} from './academic.schema.js'

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
    private readonly terms: Model<AcademicTermRecord>
  ) {}

  public listSchools(
    actor: AuthenticatedActor,
    page: PaginationInput
  ): Promise<unknown> {
    const filter: QueryFilter<SchoolRecord> = actor.scope.tenant
      ? {}
      : { _id: { $in: actor.scope.schoolIds } }
    return paginate(this.schools, filter, page, { schoolCode: 1, _id: 1 })
  }

  public async createSchool(input: SchoolRecord): Promise<unknown> {
    return (await this.schools.create(input)).toJSON()
  }

  public async updateSchool(
    id: string,
    input: Partial<SchoolRecord>
  ): Promise<unknown> {
    const school = await this.schools
      .findByIdAndUpdate(
        id,
        { $set: input },
        { new: true, runValidators: true }
      )
      .exec()
    if (!school) throw new NotFoundException({ code: 'RESOURCE_NOT_FOUND' })
    return school.toJSON()
  }

  public listPrograms(
    actor: AuthenticatedActor,
    page: PaginationInput,
    schoolId?: string
  ): Promise<unknown> {
    const baseFilter: QueryFilter<ProgramRecord> = actor.scope.tenant
      ? {}
      : {
          $or: [
            { schoolId: { $in: actor.scope.schoolIds } },
            { _id: { $in: actor.scope.programIds } }
          ]
        }
    const filter: QueryFilter<ProgramRecord> = schoolId
      ? { ...baseFilter, schoolId }
      : baseFilter
    return paginate(this.programs, filter, page, { programCode: 1, _id: 1 })
  }

  public async createProgram(input: ProgramRecord): Promise<unknown> {
    return (await this.programs.create(input)).toJSON()
  }

  public async updateProgram(
    id: string,
    input: Partial<ProgramRecord>
  ): Promise<unknown> {
    const program = await this.programs
      .findByIdAndUpdate(
        id,
        { $set: input },
        { new: true, runValidators: true }
      )
      .exec()
    if (!program) throw new NotFoundException({ code: 'RESOURCE_NOT_FOUND' })
    return program.toJSON()
  }

  public listCourses(page: PaginationInput): Promise<unknown> {
    return paginate(this.courses, {}, page, { courseCode: 1, _id: 1 })
  }

  public async createCourse(input: CourseRecord): Promise<unknown> {
    return (await this.courses.create(input)).toJSON()
  }

  public async updateCourse(
    id: string,
    input: Partial<CourseRecord>
  ): Promise<unknown> {
    const course = await this.courses
      .findByIdAndUpdate(
        id,
        { $set: input },
        { new: true, runValidators: true }
      )
      .exec()
    if (!course) throw new NotFoundException({ code: 'RESOURCE_NOT_FOUND' })
    return course.toJSON()
  }

  public listTerms(page: PaginationInput): Promise<unknown> {
    return paginate(this.terms, {}, page, { startsAt: -1, _id: -1 })
  }

  public async createTerm(input: AcademicTermRecord): Promise<unknown> {
    return (await this.terms.create(input)).toJSON()
  }

  public async updateTerm(
    id: string,
    input: Partial<AcademicTermRecord>
  ): Promise<unknown> {
    const term = await this.terms
      .findByIdAndUpdate(
        id,
        { $set: input },
        { new: true, runValidators: true }
      )
      .exec()
    if (!term) throw new NotFoundException({ code: 'RESOURCE_NOT_FOUND' })
    return term.toJSON()
  }
}
