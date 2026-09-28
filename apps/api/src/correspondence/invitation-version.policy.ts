import type { QueryFilter } from 'mongoose'

import type { InvitationRecord } from './correspondence.schema.js'

export function invitationVersionFilter(
  version: number
): QueryFilter<InvitationRecord> {
  if (version === 1) {
    return {
      $or: [{ version: 1 }, { version: { $exists: false } }]
    }
  }
  return { version }
}
