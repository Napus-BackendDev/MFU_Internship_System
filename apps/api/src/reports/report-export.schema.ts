import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose'
import { Schema as MongooseSchema } from 'mongoose'

import type {
  ReportExportField,
  ReportExportFormat
} from '@internship/shared-types'

const schemaOptions = {
  timestamps: true,
  toJSON: {
    virtuals: true,
    transform: (_document: unknown, result: Record<string, unknown>) => {
      delete result._id
      delete result.__v
      delete result.requestedBy
      delete result.requestId
      delete result.requestHash
      delete result.objectKey
      delete result.sha256
      delete result.failureCode
      delete result.processingStartedAt
      delete result.processingLeaseUntil
      delete result.processingToken
      delete result.resourceScopes
      return result
    }
  }
} as const

@Schema({ ...schemaOptions, collection: 'reportExports' })
export class ReportExportRecord {
  @Prop({ required: true })
  public requestedBy!: string

  @Prop()
  public requestId?: string

  @Prop({ required: true, match: /^[a-f\d]{64}$/i })
  public requestHash!: string

  @Prop({ required: true, type: MongooseSchema.Types.Mixed })
  public filters!: Readonly<Record<string, string>>

  @Prop({ required: true, type: [String] })
  public fields!: ReportExportField[]

  @Prop({ required: true, enum: ['csv'], type: String })
  public format!: ReportExportFormat

  @Prop({
    default: 'queued',
    enum: ['queued', 'processing', 'ready', 'failed', 'expired'],
    type: String
  })
  public status!: 'queued' | 'processing' | 'ready' | 'failed' | 'expired'

  @Prop({ required: true, min: 0 })
  public rowCount!: number

  @Prop({ required: true })
  public snapshotAt!: Date

  @Prop({ required: true })
  public expiresAt!: Date

  @Prop({ select: false })
  public objectKey?: string

  @Prop({ select: false })
  public sha256?: string

  @Prop({ select: false })
  public failureCode?: string

  @Prop()
  public completedAt?: Date

  @Prop()
  public processingStartedAt?: Date

  @Prop()
  public processingLeaseUntil?: Date

  @Prop({ select: false })
  public processingToken?: string

  @Prop({ default: [], select: false, type: [MongooseSchema.Types.Mixed] })
  public resourceScopes!: readonly Readonly<Record<string, unknown>>[]
}

export const ReportExportSchema =
  SchemaFactory.createForClass(ReportExportRecord)
ReportExportSchema.index(
  { status: 1, processingLeaseUntil: 1, expiresAt: 1 },
  { name: 'report_export_recovery' }
)
ReportExportSchema.index({ expiresAt: 1 }, { name: 'report_export_expiry' })

@Schema({ timestamps: true, collection: 'reportExportSnapshots' })
export class ReportExportSnapshotRecord {
  @Prop({ required: true })
  public exportId!: string

  @Prop({ required: true })
  public schoolId!: string

  @Prop({ required: true })
  public programId!: string

  @Prop({ required: true, type: MongooseSchema.Types.Mixed, select: false })
  public values!: Readonly<Record<string, string>>

  @Prop({ required: true })
  public expiresAt!: Date
}

export const ReportExportSnapshotSchema = SchemaFactory.createForClass(
  ReportExportSnapshotRecord
)
ReportExportSnapshotSchema.index(
  { expiresAt: 1 },
  { name: 'report_export_snapshot_expiry', expireAfterSeconds: 0 }
)
ReportExportSnapshotSchema.index(
  { exportId: 1, schoolId: 1, programId: 1 },
  { name: 'report_export_scope' }
)
