import type { AuthenticatedActor, RoleKey } from '@internship/shared-types'
import { ForbiddenException } from '@nestjs/common'
import type { QueryFilter } from 'mongoose'

import type { UserRecord } from './user.schema.js'

const STAFF_ASSIGNABLE_ROLES: readonly RoleKey[] = [
  'internshipStaff',
  'coordinator',
  'student'
]

type AuthorizedScope = {
  readonly role?: RoleKey
  readonly tenant: boolean
  readonly schoolIds: readonly string[]
  readonly programIds: readonly string[]
}

export interface UserRoleAssignmentScope {
  readonly role: RoleKey
  readonly tenant: boolean
  readonly schoolIds: readonly string[]
  readonly programIds: readonly string[]
  readonly active: boolean
}

export function isSystemAdministrator(actor: AuthenticatedActor): boolean {
  return actor.roles.includes('systemAdmin')
}

function authorizedScopes(
  actor: AuthenticatedActor,
  mode: 'read' | 'manage'
): readonly AuthorizedScope[] {
  if (actor.roleScopes) {
    return actor.roleScopes.filter(
      (scope) =>
        (scope.role === 'internshipStaff' ||
          (mode === 'read' && scope.role === 'auditor')) &&
        !scope.tenant
    )
  }
  const allowedRoles: readonly RoleKey[] =
    mode === 'manage' ? ['internshipStaff'] : ['internshipStaff', 'auditor']
  if (!actor.roles.some((role) => allowedRoles.includes(role))) return []
  const role: RoleKey = actor.roles.includes('internshipStaff')
    ? 'internshipStaff'
    : 'auditor'
  return [
    {
      role,
      tenant: actor.scope.tenant,
      schoolIds: actor.scope.schoolIds,
      programIds: actor.scope.programIds
    }
  ].filter((scope) => !scope.tenant)
}

function targetAssignmentScope(
  scope: AuthorizedScope
): QueryFilter<UserRecord> {
  const dimensions: QueryFilter<UserRecord>[] = []
  if (scope.schoolIds.length > 0) {
    dimensions.push({ schoolIds: { $in: [...scope.schoolIds] } })
  }
  if (scope.programIds.length > 0) {
    dimensions.push({ programIds: { $in: [...scope.programIds] } })
  }
  return { $and: dimensions }
}

function exactAssignmentScopeFilter(
  scopes: readonly AuthorizedScope[]
): QueryFilter<UserRecord> {
  const assignmentMatches = scopes.map((scope) => {
    const dimensions: Record<string, unknown>[] = [
      { $eq: ['$$assignment.active', true] },
      { $eq: ['$$assignment.tenant', false] },
      { $in: ['$$assignment.role', STAFF_ASSIGNABLE_ROLES] }
    ]

    for (const [field, values] of [
      ['schoolIds', scope.schoolIds],
      ['programIds', scope.programIds]
    ] as const) {
      if (values.length === 0) continue
      const assignmentValues = { $ifNull: [`$$assignment.${field}`, []] }
      dimensions.push(
        { $gt: [{ $size: assignmentValues }, 0] },
        {
          $eq: [
            {
              $size: {
                $setDifference: [assignmentValues, { $literal: [...values] }]
              }
            },
            0
          ]
        }
      )
    }

    return { $and: dimensions }
  })

  return {
    $expr: {
      $gt: [
        {
          $size: {
            $filter: {
              input: { $ifNull: ['$roleAssignments', []] },
              as: 'assignment',
              cond: { $or: assignmentMatches }
            }
          }
        },
        0
      ]
    }
  }
}

export function userManagementScope(
  actor: AuthenticatedActor,
  mode: 'read' | 'manage' = 'manage'
): QueryFilter<UserRecord> {
  if (isSystemAdministrator(actor)) return {}

  const scopedAssignments = authorizedScopes(actor, mode).filter(
    (scope) => scope.schoolIds.length > 0 || scope.programIds.length > 0
  )
  if (scopedAssignments.length === 0) {
    if (
      mode === 'read' &&
      actor.roles.includes('student') &&
      actor.scope.studentId
    ) {
      return { _id: actor.id }
    }
    return { _id: null }
  }

  const scopeFilters = scopedAssignments.map(targetAssignmentScope)
  return {
    $and: [
      {
        roleAssignments: {
          $elemMatch: {
            active: true,
            tenant: { $ne: true },
            role: { $in: STAFF_ASSIGNABLE_ROLES },
            $or: scopeFilters
          }
        }
      },
      exactAssignmentScopeFilter(scopedAssignments),
      {
        $nor: [
          {
            roleAssignments: {
              $elemMatch: { active: true, role: 'systemAdmin' }
            }
          },
          { roleAssignments: { $elemMatch: { active: true, tenant: true } } }
        ]
      }
    ]
  }
}

export function roleAssignmentWithinScope(
  actor: AuthenticatedActor,
  assignment: UserRoleAssignmentScope,
  mode: 'read' | 'manage'
): boolean {
  if (isSystemAdministrator(actor)) return true
  if (
    !assignment.active ||
    assignment.tenant ||
    !STAFF_ASSIGNABLE_ROLES.includes(assignment.role)
  ) {
    return false
  }
  return authorizedScopes(actor, mode).some((scope) => {
    const schoolMatches =
      scope.schoolIds.length === 0 ||
      (assignment.schoolIds.length > 0 &&
        assignment.schoolIds.every((id) => scope.schoolIds.includes(id)))
    const programMatches =
      scope.programIds.length === 0 ||
      (assignment.programIds.length > 0 &&
        assignment.programIds.every((id) => scope.programIds.includes(id)))
    return schoolMatches && programMatches
  })
}

export function assertCanAssignRole(
  actor: AuthenticatedActor,
  role: RoleKey,
  tenant: boolean,
  schoolIds: readonly string[],
  programIds: readonly string[],
  studentScope = false
): void {
  if (isSystemAdministrator(actor)) {
    if (tenant && role !== 'systemAdmin' && role !== 'internshipStaff') {
      throw new ForbiddenException({ code: 'PERMISSION_DENIED' })
    }
    return
  }

  const scopes = authorizedScopes(actor, 'manage').filter(
    (scope) => scope.role === 'internshipStaff'
  )
  const requestedAnyScope = schoolIds.length > 0 || programIds.length > 0
  const coveredByOneAssignment = scopes.some((scope) => {
    const schoolMatches =
      scope.schoolIds.length === 0 ||
      (schoolIds.length > 0 &&
        schoolIds.every((id) => scope.schoolIds.includes(id)))
    const programMatches =
      scope.programIds.length === 0 ||
      (programIds.length > 0 &&
        programIds.every((id) => scope.programIds.includes(id)))
    return (
      schoolMatches && programMatches && (!studentScope || requestedAnyScope)
    )
  })

  if (
    !STAFF_ASSIGNABLE_ROLES.includes(role) ||
    tenant ||
    !requestedAnyScope ||
    !coveredByOneAssignment
  ) {
    throw new ForbiddenException({ code: 'PERMISSION_DENIED' })
  }
}
