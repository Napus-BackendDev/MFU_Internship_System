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

@Schema({ ...schemaOptions, collection: 'documentTemplates' })
export class DocumentTemplateRecord {
  @Prop({ required: true, unique: true })
  public code!: string

  @Prop({ required: true })
  public name!: string

  @Prop({ default: 'active', enum: ['active', 'archived'] })
  public status!: 'active' | 'archived'
}

export const DocumentTemplateSchema = SchemaFactory.createForClass(
  DocumentTemplateRecord
)

@Schema({ ...schemaOptions, collection: 'documentTemplateVersions' })
export class DocumentTemplateVersionRecord {
  @Prop({ index: true, required: true })
  public templateId!: string

  @Prop({ min: 1, required: true })
  public versionNumber!: number

  @Prop({ default: 'draft', enum: ['draft', 'published', 'retired'] })
  public status!: 'draft' | 'published' | 'retired'

  @Prop({ required: true, type: Object })
  public canonicalJson!: Readonly<Record<string, unknown>>

  @Prop({ default: [], type: [String] })
  public placeholders!: string[]

  @Prop({ default: [], type: [String] })
  public fontAssetKeys!: string[]

  @Prop()
  public publishedAt?: Date
}

export const DocumentTemplateVersionSchema = SchemaFactory.createForClass(
  DocumentTemplateVersionRecord
)
DocumentTemplateVersionSchema.index(
  { templateId: 1, versionNumber: 1 },
  { unique: true }
)

@Schema({ ...schemaOptions, collection: 'generatedDocuments' })
export class GeneratedDocumentRecord {
  @Prop({ index: true, required: true })
  public studentId!: string

  @Prop({ required: true })
  public templateVersionId!: string

  @Prop({ default: [], type: [String] })
  public evaluationIds!: string[]

  @Prop({ required: true })
  public requestedBy!: string

  @Prop({ required: true })
  public idempotencyKey!: string

  @Prop({ index: true, sparse: true, unique: true })
  public idempotencyScopeKey?: string

  @Prop()
  public requestHash?: string

  @Prop({
    default: 'queued',
    enum: ['queued', 'processing', 'ready', 'failed']
  })
  public status!: 'queued' | 'processing' | 'ready' | 'failed'

  @Prop()
  public objectKey?: string

  @Prop()
  public sha256?: string

  @Prop()
  public failureCode?: string

  @Prop()
  public processingStartedAt?: Date
}

export const GeneratedDocumentSchema = SchemaFactory.createForClass(
  GeneratedDocumentRecord
)
GeneratedDocumentSchema.index({ studentId: 1, createdAt: -1 })
