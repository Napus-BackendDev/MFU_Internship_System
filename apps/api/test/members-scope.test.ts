import type { AuthenticatedActor } from '@internship/shared-types'
import type { Model, QueryFilter } from 'mongoose'
import { Types } from 'mongoose'
import { describe, expect, it, vi } from 'vitest'

import type { AcademicTermRecord } from '../src/academic/academic.schema.js'
import { assertActorScope, scopeFilter } from '../src/common/scope.js'
import type { EvaluationAssignmentRecord } from '../src/evaluations/evaluation.schema.js'
import type {
  EvaluatorRecord,
  OrganizationRecord,
  PlacementRecord,
  StudentRecord
} from '../src/members/members.schema.js'
import { MembersService } from '../src/members/members.service.js'

const schoolA = '64b000000000000000000001'
const schoolB = '64b000000000000000000002'
const programA = '64b000000000000000000011'
const programB = '64b000000000000000000012'

const actor: AuthenticatedActor = {
  id: 'staff-1',
  email: 'staff@mfu.ac.th',
  displayName: 'Scoped Staff',
  roles: ['internshipStaff', 'coordinator'],
  scope: {
    tenant: false,
    schoolIds: [schoolA, schoolB],
    programIds: [programA, programB]
  },
  roleScopes: [
    {
      role: 'internshipStaff',
      tenant: false,
      schoolIds: [schoolA],
      programIds: [programA]
    },
    {
      role: 'coordinator',
      tenant: false,
      schoolIds: [schoolB],
      programIds: [programB]
    }
  ]
}

function serviceWith(models: {
  students: object
  placements?: object
  assignments?: object
  schools?: object
  programs?: object
  courses?: object
}): MembersService {
  return new MembersService(
    models.students as Model<StudentRecord>,
    {} as Model<OrganizationRecord>,
    {} as Model<EvaluatorRecord>,
    (models.placements ?? {}) as Model<PlacementRecord>,
    {} as Model<AcademicTermRecord>,
    (models.assignments ?? {}) as Model<EvaluationAssignmentRecord>,
    {} as never,
    {} as never,
    (models.schools ?? {}) as never,
    (models.programs ?? {}) as never,
    (models.courses ?? {}) as never,
    {
      record: vi.fn().mockResolvedValue(undefined),
      recordSafely: vi.fn().mockResolvedValue(undefined)
    } as never
  )
}

describe('role-assignment data scopes', () => {
  it('keeps each role assignment as a paired school/program scope', () => {
    expect(scopeFilter(actor)).toEqual({
      $or: [
        {
          $and: [
            { schoolId: { $in: [schoolA] } },
            { programId: { $in: [programA] } }
          ]
        },
        {
          $and: [
            { schoolId: { $in: [schoolB] } },
            { programId: { $in: [programB] } }
          ]
        }
      ]
    })
  })

  it('does not use coordinator scope to authorize a staff-only mutation', () => {
    expect(() =>
      assertActorScope(actor, { schoolId: schoolB, programId: programB })
    ).toThrow()
    expect(() =>
      assertActorScope(actor, { schoolId: schoolA, programId: programA })
    ).not.toThrow()
    expect(() =>
      assertActorScope(actor, { schoolId: schoolA, programId: programB })
    ).toThrow()
  })

  it('can construct filters from only the role assignment granting an action', () => {
    expect(scopeFilter(actor, ['internshipStaff'])).toEqual({
      $or: [
        {
          $and: [
            { schoolId: { $in: [schoolA] } },
            { programId: { $in: [programA] } }
          ]
        }
      ]
    })
  })

  it('ignores role scope entries absent from the actor active role list', () => {
    const actorWithRevokedRole: AuthenticatedActor = {
      ...actor,
      roles: ['coordinator']
    }

    expect(scopeFilter(actorWithRevokedRole, ['internshipStaff'])).toEqual({
      _id: null
    })
    expect(() =>
      assertActorScope(actorWithRevokedRole, {
        schoolId: schoolA,
        programId: programA
      })
    ).toThrow()
  })

  it('fails closed when a multi-role actor has no role-specific scopes', () => {
    const actorWithoutRoleScopes: AuthenticatedActor = {
      ...actor,
      roleScopes: undefined
    }

    expect(scopeFilter(actorWithoutRoleScopes, ['internshipStaff'])).toEqual({
      _id: null
    })
    expect(() =>
      assertActorScope(actorWithoutRoleScopes, {
        schoolId: schoolA,
        programId: programA
      })
    ).toThrow()
  })

  it('does not treat a Coordinator tenant flag as a system-wide data scope', () => {
    const tenantCoordinator: AuthenticatedActor = {
      ...actor,
      roles: ['coordinator'],
      scope: { tenant: true, schoolIds: [], programIds: [] },
      roleScopes: [
        {
          role: 'coordinator',
          tenant: true,
          schoolIds: [],
          programIds: []
        }
      ]
    }

    expect(scopeFilter(tenantCoordinator)).toEqual({ _id: null })
  })

  it('rejects PATCH when coordinator read scope differs from staff mutation scope', async () => {
    const targetId = new Types.ObjectId()
    const existing = {
      _id: targetId,
      studentId: '6631503001',
      schoolId: schoolB,
      programId: programB
    }
    const filters: QueryFilter<StudentRecord>[] = []
    const findOne = vi.fn((filter: QueryFilter<StudentRecord>) => {
      filters.push(filter)
      return { exec: vi.fn().mockResolvedValue(existing) }
    })
    const findOneAndUpdate = vi.fn()
    const service = serviceWith({
      students: { findOne, findOneAndUpdate }
    })

    await expect(
      service.updateStudent(actor, targetId.toString(), {
        schoolId: schoolA,
        programId: programA
      })
    ).rejects.toMatchObject({ status: 403 })
    expect(filters[0]).toEqual({
      $and: [{ _id: targetId }, scopeFilter(actor)]
    })
    expect(findOneAndUpdate).not.toHaveBeenCalled()
  })

  it('blocks generic scope transfer while an open placement or assignment exists', async () => {
    const transferActor: AuthenticatedActor = {
      ...actor,
      roles: ['internshipStaff'],
      roleScopes: [
        {
          role: 'internshipStaff',
          tenant: false,
          schoolIds: [schoolA],
          programIds: [programA]
        },
        {
          role: 'internshipStaff',
          tenant: false,
          schoolIds: [schoolB],
          programIds: [programB]
        }
      ]
    }
    const existing = {
      _id: new Types.ObjectId(),
      studentId: '6631503001',
      schoolId: schoolA,
      programId: programA
    }
    const findOneAndUpdate = vi.fn(() => ({
      exec: vi.fn().mockResolvedValue({ toJSON: () => ({ saved: true }) })
    }))
    const service = serviceWith({
      students: {
        findOne: vi.fn(() => ({ exec: vi.fn().mockResolvedValue(existing) })),
        findOneAndUpdate
      },
      placements: { exists: vi.fn().mockResolvedValue(null) },
      assignments: { exists: vi.fn().mockResolvedValue({ _id: 'open' }) }
    })

    await expect(
      service.updateStudent(transferActor, existing._id.toString(), {
        schoolId: schoolB,
        programId: programB
      })
    ).rejects.toMatchObject({
      status: 409,
      response: {
        code: 'STUDENT_SCOPE_TRANSFER_REQUIRES_CLOSED_PLACEMENT'
      }
    })
    expect(findOneAndUpdate).not.toHaveBeenCalled()
  })

  it('keeps completed placement and assignment snapshots untouched on profile update', async () => {
    const transferActor: AuthenticatedActor = {
      ...actor,
      roles: ['internshipStaff'],
      roleScopes: [
        {
          role: 'internshipStaff',
          tenant: false,
          schoolIds: [schoolA],
          programIds: [programA]
        },
        {
          role: 'internshipStaff',
          tenant: false,
          schoolIds: [schoolB],
          programIds: [programB]
        }
      ]
    }
    const existing = {
      _id: new Types.ObjectId(),
      studentId: '6631503001',
      schoolId: schoolA,
      programId: programA
    }
    const placementUpdateMany = vi.fn()
    const assignmentUpdateMany = vi.fn()
    const findOne = vi.fn(() => ({
      session: vi.fn().mockReturnThis(),
      exec: vi.fn().mockResolvedValue(existing)
    }))
    const emptySessionQuery = (): {
      select: () => unknown
      session: () => unknown
      exec: () => Promise<null>
    } => ({
      select: vi.fn().mockReturnThis(),
      session: vi.fn().mockReturnThis(),
      exec: vi.fn().mockResolvedValue(null)
    })
    const service = serviceWith({
      students: {
        findOne,
        findOneAndUpdate: vi.fn(() => ({
          exec: vi.fn().mockResolvedValue({ toJSON: () => ({ saved: true }) })
        })),
        db: {
          transaction: (operation: (session: unknown) => Promise<unknown>) =>
            operation({})
        }
      },
      placements: {
        exists: vi.fn().mockResolvedValue(null),
        findOne: vi.fn(emptySessionQuery),
        updateMany: placementUpdateMany
      },
      assignments: {
        exists: vi.fn().mockResolvedValue(null),
        findOne: vi.fn(emptySessionQuery),
        updateMany: assignmentUpdateMany
      },
      schools: {
        findOne: vi.fn((filter: { _id: Types.ObjectId }) => ({
          session: vi.fn().mockReturnThis(),
          exec: vi.fn().mockResolvedValue({
            id: filter._id.toString(),
            status: 'active',
            __v: 0
          })
        })),
        updateOne: vi.fn().mockResolvedValue({ matchedCount: 1 })
      },
      programs: {
        findOne: vi.fn((filter: { _id: Types.ObjectId }) => ({
          session: vi.fn().mockReturnThis(),
          exec: vi.fn().mockResolvedValue({
            id: filter._id.toString(),
            schoolId: schoolB,
            status: 'active',
            __v: 0
          })
        })),
        updateOne: vi.fn().mockResolvedValue({ matchedCount: 1 })
      }
    })

    await expect(
      service.updateStudent(transferActor, existing._id.toString(), {
        schoolId: schoolB,
        programId: programB
      })
    ).resolves.toEqual({ saved: true })
    expect(placementUpdateMany).not.toHaveBeenCalled()
    expect(assignmentUpdateMany).not.toHaveBeenCalled()
  })

  it('does not archive a student with an open placement', async () => {
    const existing = {
      _id: new Types.ObjectId(),
      studentId: '6631503001',
      schoolId: schoolA,
      programId: programA
    }
    const updateOne = vi.fn()
    const service = serviceWith({
      students: {
        findOne: vi.fn(() => ({ exec: vi.fn().mockResolvedValue(existing) })),
        updateOne
      },
      placements: { exists: vi.fn().mockResolvedValue({ _id: 'active' }) },
      assignments: { exists: vi.fn().mockResolvedValue(null) }
    })

    await expect(
      service.archiveStudent(actor, existing._id.toString())
    ).rejects.toMatchObject({
      status: 409,
      response: { code: 'STUDENT_HAS_OPEN_PLACEMENT' }
    })
    expect(updateOne).not.toHaveBeenCalled()
  })
})
