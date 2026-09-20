import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose'

const schemaOptions = {
  timestamps: true,
  toJSON: {
    virtuals: true,
    transform: (_document: unknown, result: Record<string, unknown>) => {
      delete result._id
      delete result.__v
      delete result.passwordCiphertext
      delete result.passwordIv
      delete result.passwordAuthTag
      return result
    }
  }
} as const

@Schema({ ...schemaOptions, collection: 'smtpSettings' })
export class SmtpSettingRecord {
  @Prop({ default: 'smtp', enum: ['smtp'], required: true, unique: true })
  public key!: 'smtp'

  @Prop({ default: false, required: true })
  public enabled!: boolean

  @Prop({ required: true })
  public host!: string

  @Prop({ max: 65_535, min: 1, required: true })
  public port!: number

  @Prop({ default: false, required: true })
  public secure!: boolean

  @Prop()
  public username?: string

  @Prop({ select: false })
  public passwordCiphertext?: string

  @Prop({ select: false })
  public passwordIv?: string

  @Prop({ select: false })
  public passwordAuthTag?: string

  @Prop({ required: true })
  public from!: string

  @Prop({ min: 1, required: true })
  public version!: number

  @Prop({ required: true })
  public updatedBy!: string
}

export const SmtpSettingSchema = SchemaFactory.createForClass(SmtpSettingRecord)

@Schema({ ...schemaOptions, collection: 'smtpTestDeliveries' })
export class SmtpTestDeliveryRecord {
  @Prop({ lowercase: true, required: true })
  public recipientEmail!: string

  @Prop({
    default: 'queued',
    enum: ['queued', 'sending', 'sent', 'failed'],
    index: true,
    required: true
  })
  public status!: 'queued' | 'sending' | 'sent' | 'failed'

  @Prop({ enum: ['database', 'environment'], required: true })
  public configurationSource!: 'database' | 'environment'

  @Prop({ min: 0, required: true })
  public configurationVersion!: number

  @Prop({ required: true })
  public createdBy!: string

  @Prop()
  public providerMessageId?: string

  @Prop()
  public failureCode?: string

  @Prop()
  public completedAt?: Date
}

export const SmtpTestDeliverySchema = SchemaFactory.createForClass(
  SmtpTestDeliveryRecord
)
SmtpTestDeliverySchema.index({ status: 1, createdAt: -1 })
