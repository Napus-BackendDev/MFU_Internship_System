import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose'

import {
  AuditResourceScopeSchema,
  type AuditResourceScopeRecord
} from '../audit/audit.schema.js'
import type { DocumentIssueSnapshotV1 } from '@internship/shared-types'

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

  @Prop({ enum: ['transcript', 'certificate'] })
  public documentType?: 'transcript' | 'certificate'

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

  @Prop({ default: 1, enum: [1, 2], min: 1, max: 2 })
  public schemaVersion!: number

  @Prop({ default: 1, min: 1 })
  public revision!: number

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

@Schema({ ...schemaOptions, collection: 'documentAssets' })
export class DocumentAssetRecord {
  @Prop({ required: true, unique: true })
  public key!: string

  @Prop({ required: true, enum: ['font', 'emblem', 'signature', 'background'] })
  public assetType!: 'font' | 'emblem' | 'signature' | 'background'

  @Prop({ required: true, maxlength: 160 })
  public originalName!: string

  @Prop({ maxlength: 120 })
  public fontFamily?: string

  @Prop({ required: true, enum: ['font/ttf', 'font/otf', 'image/png'] })
  public contentType!: 'font/ttf' | 'font/otf' | 'image/png'

  @Prop({ required: true, min: 1, max: 8 * 1024 * 1024 })
  public size!: number

  @Prop({ required: true, match: /^[a-f0-9]{64}$/ })
  public sha256!: string

  @Prop({ required: true, maxlength: 1000 })
  public rightsBasis!: string

  @Prop({ required: true })
  public rightsConfirmedBy!: string

  @Prop({ required: true })
  public rightsConfirmedAt!: Date

  @Prop({ default: 'active', enum: ['active', 'revoked'] })
  public status!: 'active' | 'revoked'
}

export const DocumentAssetSchema =
  SchemaFactory.createForClass(DocumentAssetRecord)
DocumentAssetSchema.index({ assetType: 1, status: 1, createdAt: -1 })

@Schema({
  ...schemaOptions,
  collection: 'generatedDocuments',
  toJSON: {
    ...schemaOptions.toJSON,
    transform: (_document: unknown, result: Record<string, unknown>) => {
      delete result._id
      delete result.__v
      delete result.resourceScopes
      delete result.requestedBy
      delete result.requestedByEmail
      delete result.requestId
      delete result.idempotencyKey
      delete result.idempotencyScopeKey
      delete result.requestHash
      delete result.sourceSnapshot
      delete result.objectKey
      delete result.sha256
      delete result.failureCode
      delete result.processingStartedAt
      delete result.processingLeaseUntil
      delete result.processingToken
      return result
    }
  }
})
export class GeneratedDocumentRecord {
  @Prop({ index: true, required: true })
  public studentId!: string

  @Prop({ required: true })
  public templateVersionId!: string

  @Prop({ default: [], type: [String] })
  public evaluationIds!: string[]

  @Prop({ required: true })
  public requestedBy!: string

  @Prop()
  public requestedByEmail?: string

  @Prop()
  public requestId?: string

  @Prop({ required: true })
  public idempotencyKey!: string

  @Prop({ index: true, sparse: true, unique: true })
  public idempotencyScopeKey?: string

  @Prop()
  public requestHash?: string

  @Prop({ select: false, type: Object })
  public sourceSnapshot?: DocumentIssueSnapshotV1

  @Prop({ default: [], select: false, type: [AuditResourceScopeSchema] })
  public resourceScopes!: AuditResourceScopeRecord[]

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

  @Prop()
  public processingLeaseUntil?: Date

  @Prop()
  public processingToken?: string
}

export const GeneratedDocumentSchema = SchemaFactory.createForClass(
  GeneratedDocumentRecord
)
GeneratedDocumentSchema.index({ studentId: 1, createdAt: -1 })
