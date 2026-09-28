import type { AuthenticatedActor } from '@internship/shared-types'
import type { QueryFilter } from 'mongoose'
import { ForbiddenException } from '@nestjs/common'

export interface ScopedRecord {
  schoolId?: string
  programId?: string
}

type AssignedScope = Pick<
  AuthenticatedActor['scope'],
  'tenant' | 'schoolIds' | 'programIds'
>

const DATA_SCOPE_ROLES = new Set(['internshipStaff', 'coordinator', 'auditor'])

function scopeClause<T extends ScopedRecord>(
  scope: AssignedScope
): QueryFilter<T> | undefined {
  const dimensions: QueryFilter<T>[] = []
  if (scope.schoolIds.length > 0) {
    dimensions.push({
      schoolId: { $in: [...scope.schoolIds] }
    })
  }
  if (scope.programIds.length > 0) {
    dimensions.push({
      programId: { $in: [...scope.programIds] }
    })
  }
  if (dimensions.length === 0) return undefined
  return dimensions.length === 1 ? dimensions[0] : { $and: dimensions }
}

function scopeMatches(scope: AssignedScope, record: ScopedRecord): boolean {
  const hasSchool = scope.schoolIds.length > 0
  const hasProgram = scope.programIds.length > 0
  return (
    (hasSchool || hasProgram) &&
    (!hasSchool ||
      (!!record.schoolId && scope.schoolIds.includes(record.schoolId))) &&
    (!hasProgram ||
      (!!record.programId && scope.programIds.includes(record.programId)))
  )
}

export function assertActorScope(
  actor: AuthenticatedActor,
  record: ScopedRecord
): void {
  if (actor.roles.includes('systemAdmin')) return

  if (actor.roleScopes) {
    const staffScopes = actor.roleScopes.filter(
      (scope) =>
        scope.role === 'internshipStaff' && actor.roles.includes(scope.role)
    )
    if (staffScopes.some((scope) => scope.tenant)) return
    if (staffScopes.some((scope) => scopeMatches(scope, record))) return
  } else if (
    actor.roles.length === 1 &&
    actor.roles.includes('internshipStaff') &&
    (actor.scope.tenant || scopeMatches(actor.scope, record))
  ) {
    return
  }

  throw new ForbiddenException({ code: 'PERMISSION_DENIED' })
}

export function scopeFilter<T extends ScopedRecord>(
  actor: AuthenticatedActor,
  allowedRoles?: readonly string[]
): QueryFilter<T> {
  if (actor.roles.includes('systemAdmin')) return {}
  const roleFilter = new Set(allowedRoles ?? DATA_SCOPE_ROLES)

  if (actor.roleScopes) {
    const assignedScopes = actor.roleScopes.filter(
      (scope) => actor.roles.includes(scope.role) && roleFilter.has(scope.role)
    )
    if (
      assignedScopes.some(
        (scope) => scope.role === 'internshipStaff' && scope.tenant
      )
    ) {
      return {}
    }
    const clauses = assignedScopes
      .filter((scope) => !scope.tenant)
      .map((scope) => scopeClause<T>(scope))
      .filter((clause): clause is QueryFilter<T> => clause !== undefined)
    return clauses.length > 0 ? { $or: clauses } : { _id: null }
  }

  const hasDataScopeRole = actor.roles.some((role) => roleFilter.has(role))
  if (!hasDataScopeRole) return { _id: null }
  if (actor.roles.length !== 1) return { _id: null }
  if (
    actor.roles.includes('internshipStaff') &&
    roleFilter.has('internshipStaff') &&
    actor.scope.tenant
  ) {
    return {}
  }
  const clause = scopeClause<T>(actor.scope)
  return clause ?? { _id: null }
}
