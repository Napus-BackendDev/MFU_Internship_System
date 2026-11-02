import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose'

const schemaOptions = {
  timestamps: true,
  toJSON: {
    virtuals: true,
    transform: (_document: unknown, result: Record<string, unknown>) => {
      delete result._id
      delete result.__v
      delete result.apiKeyCiphertext
      delete result.apiKeyIv
      delete result.apiKeyAuthTag
      return result
    }
  }
} as const

@Schema({ ...schemaOptions, collection: 'aiSettings' })
export class AiSettingRecord {
  @Prop({ default: 'ai', enum: ['ai'], required: true, unique: true })
  public key!: 'ai'

  @Prop({ default: false, required: true })
  public enabled!: boolean

  @Prop({ required: true })
  public modelId!: string

  @Prop({ required: true })
  public prompt!: string

  @Prop({ select: false })
  public apiKeyCiphertext?: string

  @Prop({ select: false })
  public apiKeyIv?: string

  @Prop({ select: false })
  public apiKeyAuthTag?: string

  @Prop({ min: 1, required: true })
  public version!: number

  @Prop({ required: true })
  public updatedBy!: string
}

export const AiSettingSchema = SchemaFactory.createForClass(AiSettingRecord)

// Final evaluations are immutable, so generated text lives beside them.
@Schema({ ...schemaOptions, collection: 'feedbackSummaries' })
export class FeedbackSummaryRecord {
  @Prop({ required: true, unique: true })
  public evaluationId!: string

  @Prop({ index: true, required: true })
  public assignmentId!: string

  @Prop({ required: true })
  public summary!: string

  @Prop({ required: true })
  public modelId!: string

  @Prop({ required: true })
  public generatedBy!: string
}

export const FeedbackSummarySchema = SchemaFactory.createForClass(
  FeedbackSummaryRecord
)
