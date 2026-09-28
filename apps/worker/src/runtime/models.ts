import type { Connection, InferSchemaType, Model } from 'mongoose'
import { Schema } from 'mongoose'

const auditResourceScopeSchema = new Schema(
  {
    tenant: { type: Boolean, default: false },
    schoolIds: { type: [String], default: [] },
    programIds: { type: [String], default: [] }
  },
  { _id: false }
)

const deliverySchema = new Schema(
  {
    campaignId: { type: String, required: true },
    assignmentId: { type: String, required: true },
    recipientEmail: { type: String, required: true },
    templateVersionId: { type: String, required: true },
    status: {
      type: String,
      enum: ['queued', 'sending', 'sent', 'failed', 'uncertain'],
      required: true
    },
    attempts: { type: Number, default: 0 },
    providerMessageId: String,
    lastErrorCode: String,
    processingStartedAt: Date,
    processingLeaseUntil: Date,
    processingToken: String,
    providerAttemptStartedAt: Date
  },
  { collection: 'deliveries', timestamps: true }
)
deliverySchema.index({ status: 1, processingLeaseUntil: 1 })

const invitationSchema = new Schema(
  {
    assignmentId: { type: String, required: true },
    evaluatorId: { type: String, required: true },
    email: { type: String, required: true },
    expiresAt: { type: Date, required: true },
    version: { type: Number, default: 1 },
    status: { type: String, required: true },
    accessPin: { type: String, select: false },
    accessPinHash: String
  },
  { collection: 'invitations', timestamps: true }
)

const emailVersionSchema = new Schema(
  {
    subject: { type: String, required: true },
    html: { type: String, required: true },
    text: { type: String, required: true },
    status: { type: String, required: true }
  },
  { collection: 'emailTemplateVersions', timestamps: true }
)

const assignmentSchema = new Schema(
  {
    studentId: { type: String, required: true },
    evaluatorId: { type: String, required: true },
    evaluationVersion: { type: Number, default: 1 },
    deadlineAt: { type: Date, required: true },
    status: { type: String, required: true },
    accessPin: { type: String, select: false },
    accessPinHash: String
  },
  { collection: 'evaluationAssignments', timestamps: true }
)

const evaluatorSchema = new Schema(
  {
    email: { type: String, required: true },
    name: { th: String, en: String }
  },
  { collection: 'evaluators', timestamps: true }
)

const studentSchema = new Schema(
  {
    studentId: { type: String, required: true },
    name: { th: String, en: String },
    email: String,
    company: String,
    evaluationStatus: String
  },
  { collection: 'students', timestamps: true }
)

const documentSchema = new Schema(
  {
    studentId: { type: String, required: true },
    templateVersionId: { type: String, required: true },
    evaluationIds: { type: [String], default: [] },
    requestedBy: String,
    requestedByEmail: String,
    requestId: String,
    resourceScopes: {
      type: [auditResourceScopeSchema],
      default: [],
      select: false
    },
    sourceSnapshot: { type: Schema.Types.Mixed, select: false },
    status: { type: String, required: true },
    objectKey: String,
    sha256: String,
    failureCode: String,
    processingStartedAt: Date,
    processingLeaseUntil: Date,
    processingToken: String
  },
  { collection: 'generatedDocuments', timestamps: true }
)

const auditLogSchema = new Schema(
  {
    requestId: { type: String, required: true },
    actorId: { type: String, required: true },
    actorEmail: { type: String, required: true },
    action: { type: String, required: true },
    route: { type: String, required: true },
    method: { type: String, required: true },
    outcome: { type: String, enum: ['success', 'failure'], required: true },
    resourceScopes: { type: [auditResourceScopeSchema] },
    metadata: { type: Schema.Types.Mixed }
  },
  { collection: 'auditLogs', timestamps: { createdAt: true, updatedAt: false } }
)

const documentVersionSchema = new Schema(
  {
    schemaVersion: { type: Number, default: 1 },
    revision: { type: Number, default: 1 },
    status: { type: String, required: true },
    canonicalJson: { type: Schema.Types.Mixed, required: true },
    placeholders: { type: [String], default: [] },
    fontAssetKeys: { type: [String], default: [] }
  },
  { collection: 'documentTemplateVersions', timestamps: true }
)

const evaluationSchema = new Schema(
  {
    assignmentId: { type: String, required: true },
    version: { type: Number, required: true },
    answers: { type: Schema.Types.Mixed, required: true },
    submittedAt: { type: Date, required: true },
    supersededAt: Date
  },
  { collection: 'evaluations', timestamps: true }
)

const campaignSchema = new Schema(
  {
    type: { type: String, enum: ['invitation', 'reminder'], required: true },
    status: {
      type: String,
      enum: ['queued', 'processing', 'completed', 'partial'],
      required: true
    },
    invitationVersion: { type: Number, min: 1 },
    total: { type: Number, default: 0 }
  },
  { collection: 'campaigns', timestamps: true }
)

const reportExportSchema = new Schema(
  {
    requestedBy: { type: String, required: true },
    requestId: String,
    requestHash: { type: String, required: true },
    filters: { type: Schema.Types.Mixed, required: true },
    fields: { type: [String], required: true },
    format: { type: String, enum: ['csv'], required: true },
    status: {
      type: String,
      enum: ['queued', 'processing', 'ready', 'failed', 'expired'],
      required: true
    },
    rowCount: { type: Number, required: true },
    snapshotAt: { type: Date, required: true },
    expiresAt: { type: Date, required: true },
    objectKey: String,
    sha256: String,
    failureCode: String,
    completedAt: Date,
    processingStartedAt: Date,
    processingLeaseUntil: Date,
    processingToken: String,
    resourceScopes: { type: [auditResourceScopeSchema], default: [] }
  },
  { collection: 'reportExports', timestamps: true }
)
reportExportSchema.index(
  { status: 1, processingLeaseUntil: 1, expiresAt: 1 },
  { name: 'report_export_recovery' }
)
reportExportSchema.index({ expiresAt: 1 }, { name: 'report_export_expiry' })

const reportExportSnapshotSchema = new Schema(
  {
    exportId: { type: String, required: true },
    schoolId: { type: String, required: true },
    programId: { type: String, required: true },
    values: { type: Schema.Types.Mixed, required: true },
    expiresAt: { type: Date, required: true }
  },
  { collection: 'reportExportSnapshots', timestamps: true }
)
reportExportSnapshotSchema.index(
  { expiresAt: 1 },
  { name: 'report_export_snapshot_expiry', expireAfterSeconds: 0 }
)
reportExportSnapshotSchema.index(
  { exportId: 1, schoolId: 1, programId: 1 },
  { name: 'report_export_scope' }
)

const smtpSettingSchema = new Schema(
  {
    key: { type: String, enum: ['smtp'], required: true, unique: true },
    enabled: { type: Boolean, required: true },
    host: { type: String, required: true },
    port: { type: Number, required: true },
    secure: { type: Boolean, required: true },
    username: String,
    passwordCiphertext: String,
    passwordIv: String,
    passwordAuthTag: String,
    from: { type: String, required: true },
    version: { type: Number, required: true },
    updatedBy: { type: String, required: true }
  },
  { collection: 'smtpSettings', timestamps: true }
)

const smtpTestDeliverySchema = new Schema(
  {
    recipientEmail: { type: String, required: true },
    status: {
      type: String,
      enum: ['queued', 'sending', 'sent', 'failed'],
      required: true
    },
    configurationSource: {
      type: String,
      enum: ['database', 'environment'],
      required: true
    },
    configurationVersion: { type: Number, required: true },
    createdBy: { type: String, required: true },
    providerMessageId: String,
    failureCode: String,
    completedAt: Date
  },
  { collection: 'smtpTestDeliveries', timestamps: true }
)

export type Delivery = InferSchemaType<typeof deliverySchema>
export type Invitation = InferSchemaType<typeof invitationSchema>
export type EmailVersion = InferSchemaType<typeof emailVersionSchema>
export type Assignment = InferSchemaType<typeof assignmentSchema>
export type Evaluator = InferSchemaType<typeof evaluatorSchema>
export type Student = InferSchemaType<typeof studentSchema>
export type GeneratedDocument = InferSchemaType<typeof documentSchema>
export type AuditLog = InferSchemaType<typeof auditLogSchema>
export type DocumentVersion = InferSchemaType<typeof documentVersionSchema>
export type Evaluation = InferSchemaType<typeof evaluationSchema>
export type Campaign = InferSchemaType<typeof campaignSchema>
export type SmtpSetting = InferSchemaType<typeof smtpSettingSchema>
export type SmtpTestDelivery = InferSchemaType<typeof smtpTestDeliverySchema>
export type ReportExport = InferSchemaType<typeof reportExportSchema>
export type ReportExportSnapshot = InferSchemaType<
  typeof reportExportSnapshotSchema
>

export interface WorkerModels {
  readonly Delivery: Model<Delivery>
  readonly Invitation: Model<Invitation>
  readonly EmailVersion: Model<EmailVersion>
  readonly Assignment: Model<Assignment>
  readonly Evaluator: Model<Evaluator>
  readonly Student: Model<Student>
  readonly GeneratedDocument: Model<
    GeneratedDocument & {
      sourceSnapshot?: unknown
      processingLeaseUntil?: Date | null
      processingToken?: string | null
    }
  >
  readonly AuditLog: Model<AuditLog>
  readonly DocumentVersion: Model<DocumentVersion>
  readonly Evaluation: Model<Evaluation>
  readonly Campaign: Model<Campaign>
  readonly SmtpSetting: Model<SmtpSetting>
  readonly SmtpTestDelivery: Model<SmtpTestDelivery>
  readonly ReportExport: Model<ReportExport>
  readonly ReportExportSnapshot: Model<ReportExportSnapshot>
}

export function createModels(connection: Connection): WorkerModels {
  return {
    Delivery: connection.model('Delivery', deliverySchema),
    Invitation: connection.model('Invitation', invitationSchema),
    EmailVersion: connection.model('EmailVersion', emailVersionSchema),
    Assignment: connection.model('Assignment', assignmentSchema),
    Evaluator: connection.model('Evaluator', evaluatorSchema),
    Student: connection.model('Student', studentSchema),
    GeneratedDocument: connection.model('GeneratedDocument', documentSchema),
    AuditLog: connection.model('AuditLog', auditLogSchema),
    DocumentVersion: connection.model('DocumentVersion', documentVersionSchema),
    Evaluation: connection.model('Evaluation', evaluationSchema),
    Campaign: connection.model('Campaign', campaignSchema),
    SmtpSetting: connection.model('SmtpSetting', smtpSettingSchema),
    SmtpTestDelivery: connection.model(
      'SmtpTestDelivery',
      smtpTestDeliverySchema
    ),
    ReportExport: connection.model('ReportExport', reportExportSchema),
    ReportExportSnapshot: connection.model(
      'ReportExportSnapshot',
      reportExportSnapshotSchema
    )
  }
}
