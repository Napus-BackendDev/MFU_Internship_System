import { ConflictException, UnprocessableEntityException } from '@nestjs/common'
import { Types, type ClientSession, type Model } from 'mongoose'

import type { ProgramRecord, SchoolRecord } from './academic.schema.js'

export interface AcademicReferenceScope {
  readonly schoolId?: string
  readonly programId?: string
}

export async function lockActiveAcademicScope(
  schools: Model<SchoolRecord>,
  programs: Model<ProgramRecord>,
  scope: AcademicReferenceScope,
  session: ClientSession
): Promise<AcademicReferenceScope> {
  if (scope.schoolId === undefined && scope.programId === undefined) return {}

  let requestedSchoolId = scope.schoolId
  if (
    scope.programId !== undefined &&
    !Types.ObjectId.isValid(scope.programId)
  ) {
    throw new UnprocessableEntityException({
      code: 'PROGRAM_REFERENCE_INVALID',
      field: 'programId'
    })
  }
  if (scope.programId !== undefined) {
    const program = await programs
      .findOne({
        _id: new Types.ObjectId(scope.programId),
        status: 'active'
      })
      .session(session)
      .exec()
    if (!program) {
      throw new UnprocessableEntityException({
        code: 'PROGRAM_REFERENCE_NOT_FOUND',
        field: 'programId'
      })
    }
    if (
      requestedSchoolId !== undefined &&
      requestedSchoolId !== program.schoolId
    ) {
      throw new UnprocessableEntityException({
        code: 'PROGRAM_SCHOOL_MISMATCH',
        field: 'programId'
      })
    }
    requestedSchoolId = program.schoolId
  }

  if (!requestedSchoolId || !Types.ObjectId.isValid(requestedSchoolId)) {
    throw new UnprocessableEntityException({
      code: 'SCHOOL_REFERENCE_INVALID',
      field: 'schoolId'
    })
  }
  const school = await schools
    .findOne({
      _id: new Types.ObjectId(requestedSchoolId),
      status: 'active'
    })
    .session(session)
    .exec()
  if (!school) {
    throw new UnprocessableEntityException({
      code: 'SCHOOL_REFERENCE_NOT_FOUND',
      field: 'schoolId'
    })
  }

  const schoolLock = await schools.updateOne(
    { _id: school._id, __v: school.__v, status: 'active' },
    { $inc: { __v: 1 } },
    { session }
  )
  if (schoolLock.matchedCount !== 1) {
    throw new ConflictException({ code: 'SCHOOL_CHANGED' })
  }

  if (scope.programId === undefined) return { schoolId: school.id }

  const program = await programs
    .findOne({
      _id: new Types.ObjectId(scope.programId),
      schoolId: school.id,
      status: 'active'
    })
    .session(session)
    .exec()
  if (!program) {
    throw new UnprocessableEntityException({
      code: 'PROGRAM_REFERENCE_NOT_FOUND',
      field: 'programId'
    })
  }
  const programLock = await programs.updateOne(
    {
      _id: program._id,
      schoolId: school.id,
      __v: program.__v,
      status: 'active'
    },
    { $inc: { __v: 1 } },
    { session }
  )
  if (programLock.matchedCount !== 1) {
    throw new ConflictException({ code: 'PROGRAM_CHANGED' })
  }
  return { schoolId: school.id, programId: program.id }
}
