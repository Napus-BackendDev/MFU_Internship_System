import type { AuthenticatedActor } from '@internship/shared-types'
import type { QueryFilter } from 'mongoose'
import { ForbiddenException } from '@nestjs/common'

export interface ScopedRecord {
  schoolId?: string
  programId?: string
}

export function assertActorScope(
  actor: AuthenticatedActor,
  record: ScopedRecord
): void {
  if (actor.scope.tenant) return
  const schoolAllowed =
    !!record.schoolId && actor.scope.schoolIds.includes(record.schoolId)
  const programAllowed =
    !!record.programId && actor.scope.programIds.includes(record.programId)
  if (!schoolAllowed && !programAllowed) {
    throw new ForbiddenException({ code: 'PERMISSION_DENIED' })
  }
}

export function scopeFilter<T extends ScopedRecord>(
  actor: AuthenticatedActor
): QueryFilter<T> {
  if (actor.scope.tenant) return {}

  const clauses: QueryFilter<T>[] = []
  if (actor.scope.schoolIds.length > 0) {
    clauses.push({ schoolId: { $in: actor.scope.schoolIds } })
  }
  if (actor.scope.programIds.length > 0) {
    clauses.push({ programId: { $in: actor.scope.programIds } })
  }

  return clauses.length === 0 ? { _id: null } : { $or: clauses }
}
