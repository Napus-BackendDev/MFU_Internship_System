import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose'
import type { HydratedDocument } from 'mongoose'

@Schema({
  collection: 'auditLogs',
  timestamps: { createdAt: true, updatedAt: false }
})
export class AuditLogRecord {
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
}

export type AuditLogDocument = HydratedDocument<AuditLogRecord>
export const AuditLogSchema = SchemaFactory.createForClass(AuditLogRecord)
AuditLogSchema.index({ createdAt: -1, actorId: 1 })
AuditLogSchema.index({ action: 1, createdAt: -1 })
