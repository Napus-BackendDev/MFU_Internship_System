export {
  campaignStatusFromDeliveryCounts,
  type CampaignStatus
} from './campaign-status.js'

export const ROLE_KEYS = [
  'systemAdmin',
  'internshipStaff',
  'coordinator',
  'student',
  'evaluator',
  'auditor'
] as const

export type RoleKey = (typeof ROLE_KEYS)[number]

export const PERMISSIONS = [
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
  'evaluations.draft',
  'evaluations.submit',
  'evaluations.reopen',
  'emailTemplates.read',
  'emailTemplates.manage',
  'emailTemplates.publish',
  'campaigns.read',
  'campaigns.send',
  'deliveries.retry',
  'documentTemplates.read',
  'documentTemplates.manage',
  'documentTemplates.publish',
  'documents.generateOwn',
  'documents.generateScoped',
  'documents.readOwn',
  'documents.readScoped',
  'reports.read',
  'exports.create',
  'exports.download'
] as const

export type Permission = (typeof PERMISSIONS)[number]

export interface AccessScope {
  readonly tenant: boolean
  readonly schoolIds: readonly string[]
  readonly programIds: readonly string[]
  readonly studentId?: string
  readonly assignmentId?: string
}

export interface AuthenticatedActor {
  readonly id: string
  readonly email: string
  readonly displayName: string
  readonly roles: readonly RoleKey[]
  readonly scope: AccessScope
  readonly roleScopes?: readonly {
    readonly role: RoleKey
    readonly tenant: boolean
    readonly schoolIds: readonly string[]
    readonly programIds: readonly string[]
  }[]
  readonly avatarUrl?: string
  readonly picture?: string
}

export interface ApiErrorBody {
  readonly error: {
    readonly code: string
    readonly message: string
    readonly requestId: string
    readonly details?: Readonly<Record<string, unknown>>
  }
}

export interface PageMeta {
  readonly page: number
  readonly pageSize: number
  readonly total: number
  readonly totalPages: number
}

export interface Paginated<T> {
  readonly items: readonly T[]
  readonly meta: PageMeta
}

export interface HealthStatus {
  readonly service: 'api' | 'web' | 'worker'
  readonly status: 'ok'
  readonly timestamp: string
  readonly version: string
}
