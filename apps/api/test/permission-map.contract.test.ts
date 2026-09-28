import { describe, expect, it } from 'vitest'

import type { Permission, RoleKey } from '@internship/shared-types'
import { PERMISSIONS, ROLE_KEYS } from '@internship/shared-types'

import { ROLE_PERMISSIONS } from '../src/auth/permission-map.js'

const EXPECTED_ROLE_PERMISSIONS: Readonly<
  Record<RoleKey, readonly Permission[]>
> = {
  systemAdmin: [
    'system.config.manage',
    'users.read',
    'users.manage',
    'sessions.read',
    'sessions.revoke',
    'audit.read',
    'audit.export',
    'academic.read',
    'academic.manage',
    'students.read',
    'students.manage',
    'students.import',
    'organizations.read',
    'organizations.manage',
    'placements.read',
    'placements.manage',
    'competencies.read',
    'competencies.manage',
    'competencies.publish',
    'cycles.read',
    'cycles.manage',
    'evaluations.read',
    'emailTemplates.read',
    'emailTemplates.manage',
    'emailTemplates.publish',
    'campaigns.read',
    'campaigns.send',
    'deliveries.retry',
    'documentTemplates.read',
    'documentTemplates.manage',
    'documentTemplates.publish',
    'documents.generateScoped',
    'documents.readScoped',
    'reports.read',
    'exports.create',
    'exports.download'
  ],
  internshipStaff: [
    'users.read',
    'users.manage',
    'audit.read',
    'academic.read',
    'academic.manage',
    'students.read',
    'students.manage',
    'students.import',
    'organizations.read',
    'organizations.manage',
    'placements.read',
    'placements.manage',
    'competencies.read',
    'competencies.manage',
    'competencies.publish',
    'cycles.read',
    'cycles.manage',
    'evaluations.read',
    'emailTemplates.read',
    'emailTemplates.manage',
    'emailTemplates.publish',
    'campaigns.read',
    'campaigns.send',
    'deliveries.retry',
    'documentTemplates.read',
    'documentTemplates.manage',
    'documentTemplates.publish',
    'documents.generateScoped',
    'documents.readScoped',
    'reports.read',
    'exports.create',
    'exports.download'
  ],
  coordinator: [
    'academic.read',
    'students.read',
    'organizations.read',
    'placements.read',
    'competencies.read',
    'cycles.read',
    'evaluations.read',
    'campaigns.read',
    'documentTemplates.read',
    'documents.readScoped',
    'reports.read',
    'exports.create',
    'exports.download'
  ],
  student: [
    'users.read',
    'sessions.read',
    'sessions.revoke',
    'academic.read',
    'students.read',
    'organizations.read',
    'placements.read',
    'competencies.read',
    'cycles.read',
    'evaluations.read',
    'documentTemplates.read',
    'documents.generateOwn',
    'documents.readOwn',
    'reports.read'
  ],
  evaluator: [
    'sessions.read',
    'sessions.revoke',
    'academic.read',
    'students.read',
    'placements.read',
    'cycles.read',
    'evaluations.read',
    'evaluations.draft',
    'evaluations.submit'
  ],
  auditor: [
    'users.read',
    'sessions.read',
    'audit.read',
    'audit.export',
    'academic.read',
    'students.read',
    'organizations.read',
    'placements.read',
    'competencies.read',
    'cycles.read',
    'evaluations.read',
    'emailTemplates.read',
    'campaigns.read',
    'documentTemplates.read',
    'documents.readScoped',
    'reports.read',
    'exports.create',
    'exports.download'
  ]
}

describe('role permission contract', () => {
  it('defines an explicit least-privilege permission set for every role', () => {
    expect(Object.keys(ROLE_PERMISSIONS).sort()).toEqual([...ROLE_KEYS].sort())

    for (const role of ROLE_KEYS) {
      expect([...ROLE_PERMISSIONS[role]].sort(), role).toEqual(
        [...EXPECTED_ROLE_PERMISSIONS[role]].sort()
      )
    }
  })

  it('keeps the contract permission set synchronized with the shared API types', () => {
    for (const role of ROLE_KEYS) {
      for (const permission of ROLE_PERMISSIONS[role]) {
        expect(
          PERMISSIONS,
          `${role} has unknown permission ${permission}`
        ).toContain(permission)
      }
    }
  })
})
