import type { RoleKey } from '@internship/shared-types'

const ROUTE_ROLE_PERMISSIONS: Readonly<Record<string, readonly RoleKey[]>> = {
  '/app/users': ['systemAdmin', 'internshipStaff'],
  '/app/evaluations/forms': ['systemAdmin', 'internshipStaff'],
  '/app/audit': ['systemAdmin', 'auditor'],
  '/app/settings/smtp': ['systemAdmin'],
  '/app/settings/academic': ['systemAdmin', 'internshipStaff'],
  '/app/settings/email': ['systemAdmin', 'internshipStaff'],
  '/app/settings/general': ['systemAdmin', 'internshipStaff'],
  '/app/students': ['systemAdmin', 'internshipStaff', 'coordinator', 'auditor'],
  '/app/documents': [
    'systemAdmin',
    'internshipStaff',
    'coordinator',
    'auditor'
  ],
  '/app/evaluations': [
    'systemAdmin',
    'internshipStaff',
    'coordinator',
    'auditor',
    'evaluator'
  ]
}

export default defineNuxtRouteMiddleware(async (to) => {
  const auth = useAuthStore()
  if (!auth.loaded) {
    try {
      await auth.load()
    } catch {
      return navigateTo('/login')
    }
  }
  if (!auth.actor) return navigateTo('/login')

  const actorRoles = (auth.actor.roles ?? []) as RoleKey[]

  // Route role protection
  const targetPath = to.path
  for (const [routePrefix, allowedRoles] of Object.entries(
    ROUTE_ROLE_PERMISSIONS
  )) {
    if (
      targetPath === routePrefix ||
      targetPath.startsWith(`${routePrefix}/`)
    ) {
      const hasPermission = allowedRoles.some((r) => actorRoles.includes(r))
      if (!hasPermission) {
        return navigateTo('/app')
      }
      break
    }
  }
})
