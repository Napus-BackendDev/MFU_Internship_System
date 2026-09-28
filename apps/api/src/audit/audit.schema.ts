import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose'
import type { HydratedDocument } from 'mongoose'

export interface AuditResourceScope {
  readonly tenant?: boolean
  readonly schoolIds?: readonly string[]
  readonly programIds?: readonly string[]
}

@Schema({ _id: false })
export class AuditResourceScopeRecord implements AuditResourceScope {
  @Prop({ default: false })
  public tenant?: boolean

  @Prop({ default: [], type: [String] })
  public schoolIds?: string[]

  @Prop({ default: [], type: [String] })
  public programIds?: string[]
}

export const AuditResourceScopeSchema = SchemaFactory.createForClass(
  AuditResourceScopeRecord
)

@Schema({
  collection: 'auditLogs',
  timestamps: { createdAt: true, updatedAt: false }
})
export class AuditLogRecord {
  public createdAt!: Date

  @Prop({ index: true, required: true })
  public requestId!: string

  @Prop({ index: true, required: true })
  public actorId!: string

  @Prop({ required: true })
  public actorEmail!: string

  @Prop({ index: true, required: true })
  public action!: string

  @Prop({ required: true })
  public route!: string

  @Prop({ required: true })
  public method!: string

  @Prop({ required: true })
  public outcome!: 'success' | 'failure'

  @Prop({ type: Object })
  public metadata?: Readonly<Record<string, unknown>>

  @Prop({ type: [AuditResourceScopeSchema] })
  public resourceScopes?: AuditResourceScopeRecord[]
}

export type AuditLogDocument = HydratedDocument<AuditLogRecord>
export const AuditLogSchema = SchemaFactory.createForClass(AuditLogRecord)
AuditLogSchema.index({ createdAt: -1, actorId: 1 })
AuditLogSchema.index({ action: 1, createdAt: -1 })
AuditLogSchema.index({ 'resourceScopes.schoolIds': 1, createdAt: -1 })
AuditLogSchema.index({ 'resourceScopes.programIds': 1, createdAt: -1 })
