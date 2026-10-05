export {
  campaignStatusFromDeliveryCounts,
  type CampaignStatus
} from './campaign-status.js'
export {
  parseCanonicalDocumentV1,
  parseCanonicalDocumentV2,
  type CanonicalCanvasElementTypeV2,
  type CanonicalCanvasElementV2,
  type CanonicalDocumentV2,
  type CanonicalDocumentV1,
  type CanonicalTextElementV1
} from './document-template.js'
export type {
  DocumentIssueCategoryScore,
  DocumentIssueEvaluationSnapshot,
  DocumentIssueLocalizedText,
  DocumentIssueSnapshotV1
} from './document-snapshot.js'

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

export const REPORT_EXPORT_FIELDS = [
  'studentNumber',
  'studentName',
  'studentEmail',
  'schoolId',
  'programId',
  'termId',
  'cycleId',
  'status',
  'deadlineAt'
] as const

export type ReportExportField = (typeof REPORT_EXPORT_FIELDS)[number]

export const DEFAULT_REPORT_EXPORT_FIELDS = [
  'schoolId',
  'programId',
  'termId',
  'status',
  'deadlineAt'
] as const satisfies readonly ReportExportField[]

export const REPORT_EXPORT_TYPES = ['assignments', 'studentDirectory'] as const
export type ReportExportType = (typeof REPORT_EXPORT_TYPES)[number]

export const REPORT_EXPORT_FORMATS = ['csv', 'xlsx'] as const
export type ReportExportFormat = (typeof REPORT_EXPORT_FORMATS)[number]

export type StudentDirectoryExportLocale = 'th' | 'en'

export interface StudentDirectoryExportValues {
  readonly studentId: string
  readonly nameTh: string
  readonly nameEn: string
  readonly email: string
  readonly schoolTh: string
  readonly schoolEn: string
  readonly programTh: string
  readonly programEn: string
  readonly courseDisplay: string
  readonly academicYear: string | number
  readonly academicYearEn: string | number
  readonly semester: string
  readonly semesterEn: string
  readonly company: string
  readonly companyAddress: string
  readonly province: string
  readonly advisorTh: string
  readonly advisorEn: string
  readonly evaluatorTh: string
  readonly evaluatorEn: string
  readonly evaluatorPositionTh: string
  readonly evaluatorPositionEn: string
  readonly evaluatorEmail: string
  readonly statusTh: string
  readonly statusEn: string
  readonly hardSkillScore: string
  readonly softSkillScore: string
}

export interface AccessScope {
  readonly tenant: boolean
  readonly schoolIds: readonly string[]
  readonly programIds: readonly string[]
  readonly studentId?: string
  readonly assignmentId?: string
  readonly invitationId?: string
  readonly invitationVersion?: number
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
