import type { Connection, InferSchemaType, Model } from 'mongoose'
import { Schema } from 'mongoose'

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
    processingStartedAt: Date
  },
  { collection: 'deliveries', timestamps: true }
)

const invitationSchema = new Schema(
  {
    assignmentId: { type: String, required: true },
    evaluatorId: { type: String, required: true },
    email: { type: String, required: true },
    expiresAt: { type: Date, required: true },
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
    email: String
  },
  { collection: 'students', timestamps: true }
)

const documentSchema = new Schema(
  {
    studentId: { type: String, required: true },
    templateVersionId: { type: String, required: true },
    evaluationIds: { type: [String], default: [] },
    status: { type: String, required: true },
    objectKey: String,
    sha256: String,
    failureCode: String,
    processingStartedAt: Date
  },
  { collection: 'generatedDocuments', timestamps: true }
)

const documentVersionSchema = new Schema(
  {
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
    submittedAt: { type: Date, required: true }
  },
  { collection: 'evaluations', timestamps: true }
)

const campaignSchema = new Schema(
  {
    status: {
      type: String,
      enum: ['queued', 'processing', 'completed', 'partial'],
      required: true
    }
  },
  { collection: 'campaigns', timestamps: true }
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
export type DocumentVersion = InferSchemaType<typeof documentVersionSchema>
export type Evaluation = InferSchemaType<typeof evaluationSchema>
export type Campaign = InferSchemaType<typeof campaignSchema>
export type SmtpSetting = InferSchemaType<typeof smtpSettingSchema>
export type SmtpTestDelivery = InferSchemaType<typeof smtpTestDeliverySchema>

export interface WorkerModels {
  readonly Delivery: Model<Delivery>
  readonly Invitation: Model<Invitation>
  readonly EmailVersion: Model<EmailVersion>
  readonly Assignment: Model<Assignment>
  readonly Evaluator: Model<Evaluator>
  readonly Student: Model<Student>
  readonly GeneratedDocument: Model<GeneratedDocument>
  readonly DocumentVersion: Model<DocumentVersion>
  readonly Evaluation: Model<Evaluation>
  readonly Campaign: Model<Campaign>
  readonly SmtpSetting: Model<SmtpSetting>
  readonly SmtpTestDelivery: Model<SmtpTestDelivery>
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
    DocumentVersion: connection.model('DocumentVersion', documentVersionSchema),
    Evaluation: connection.model('Evaluation', evaluationSchema),
    Campaign: connection.model('Campaign', campaignSchema),
    SmtpSetting: connection.model('SmtpSetting', smtpSettingSchema),
    SmtpTestDelivery: connection.model(
      'SmtpTestDelivery',
      smtpTestDeliverySchema
    )
  }
}
