import type { Permission, RoleKey } from '@internship/shared-types'
import { PERMISSIONS } from '@internship/shared-types'

const without = (...denied: readonly Permission[]): readonly Permission[] =>
  PERMISSIONS.filter((permission) => !denied.includes(permission))

export const ROLE_PERMISSIONS: Readonly<
  Record<RoleKey, readonly Permission[]>
> = {
  systemAdmin: without(
    'evaluations.draft',
    'evaluations.submit',
    'evaluations.reopen',
    'documents.generateOwn',
    'documents.readOwn'
  ),
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
    'competencies.read',
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

export function actorHasPermission(
  roles: readonly RoleKey[],
  permission: Permission
): boolean {
  return roles.some((role) => ROLE_PERMISSIONS[role].includes(permission))
}
