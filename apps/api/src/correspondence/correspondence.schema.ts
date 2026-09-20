import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose'

const schemaOptions = {
  timestamps: true,
  toJSON: {
    virtuals: true,
    transform: (_document: unknown, result: Record<string, unknown>) => {
      delete result._id
      delete result.__v
      return result
    }
  }
} as const

@Schema({ ...schemaOptions, collection: 'emailTemplates' })
export class EmailTemplateRecord {
  @Prop({ required: true, unique: true })
  public code!: string

  @Prop({ enum: ['evaluator', 'student', 'staff'], required: true })
  public audience!: 'evaluator' | 'student' | 'staff'

  @Prop({ default: 'active', enum: ['active', 'archived'] })
  public status!: 'active' | 'archived'
}

export const EmailTemplateSchema =
  SchemaFactory.createForClass(EmailTemplateRecord)

@Schema({ ...schemaOptions, collection: 'emailTemplateVersions' })
export class EmailTemplateVersionRecord {
  @Prop({ index: true, required: true })
  public templateId!: string

  @Prop({ min: 1, required: true })
  public versionNumber!: number

  @Prop({ default: 'draft', enum: ['draft', 'published', 'retired'] })
  public status!: 'draft' | 'published' | 'retired'

  @Prop({ required: true })
  public subject!: string

  @Prop({ required: true })
  public html!: string

  @Prop({ required: true })
  public text!: string

  @Prop({ default: [], type: [String] })
  public placeholders!: string[]

  @Prop()
  public publishedAt?: Date
}

export const EmailTemplateVersionSchema = SchemaFactory.createForClass(
  EmailTemplateVersionRecord
)
EmailTemplateVersionSchema.index(
  { templateId: 1, versionNumber: 1 },
  { unique: true }
)

@Schema({ ...schemaOptions, collection: 'campaigns' })
export class CampaignRecord {
  @Prop({ required: true })
  public idempotencyKey!: string

  @Prop({ index: true, sparse: true, unique: true })
  public idempotencyScopeKey?: string

  @Prop()
  public requestHash?: string

  @Prop({ enum: ['invitation', 'reminder'], required: true })
  public type!: 'invitation' | 'reminder'

  @Prop({ required: true })
  public templateVersionId!: string

  @Prop({ required: true, type: [String] })
  public assignmentIds!: string[]

  @Prop({ required: true })
  public createdBy!: string

  @Prop({
    default: 'queued',
    enum: ['queued', 'processing', 'completed', 'partial']
  })
  public status!: 'queued' | 'processing' | 'completed' | 'partial'

  @Prop({ default: 0 })
  public total!: number
}

export const CampaignSchema = SchemaFactory.createForClass(CampaignRecord)

@Schema({ ...schemaOptions, collection: 'deliveries' })
export class DeliveryRecord {
  @Prop({ index: true, required: true })
  public campaignId!: string

  @Prop({ index: true, required: true })
  public assignmentId!: string

  @Prop({ lowercase: true, required: true })
  public recipientEmail!: string

  @Prop({ required: true })
  public templateVersionId!: string

  @Prop({
    default: 'queued',
    enum: ['queued', 'sending', 'sent', 'failed', 'uncertain'],
    index: true
  })
  public status!: 'queued' | 'sending' | 'sent' | 'failed' | 'uncertain'

  @Prop({ default: 0 })
  public attempts!: number

  @Prop()
  public providerMessageId?: string

  @Prop()
  public lastErrorCode?: string

  @Prop()
  public processingStartedAt?: Date
}

export const DeliverySchema = SchemaFactory.createForClass(DeliveryRecord)
DeliverySchema.index({ campaignId: 1, assignmentId: 1 }, { unique: true })

@Schema({ ...schemaOptions, collection: 'invitations' })
export class InvitationRecord {
  @Prop({ index: true, required: true, unique: true })
  public assignmentId!: string

  @Prop({ index: true, required: true })
  public evaluatorId!: string

  @Prop({ lowercase: true, required: true })
  public email!: string

  @Prop({ required: true })
  public expiresAt!: Date

  @Prop({ default: 'active', enum: ['active', 'revoked', 'expired'] })
  public status!: 'active' | 'revoked' | 'expired'

  @Prop()
  public lastExchangedAt?: Date

  @Prop({
    index: true,
    select: false,
    sparse: true,
    uppercase: true,
    trim: true
  })
  public accessPin?: string

  @Prop({ index: true, sparse: true, select: false })
  public accessPinHash?: string
}

export const InvitationSchema = SchemaFactory.createForClass(InvitationRecord)
