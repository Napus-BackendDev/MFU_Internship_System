import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose'
import { Schema as MongooseSchema } from 'mongoose'

@Schema({ timestamps: true, collection: 'studentImportBatches' })
export class StudentImportBatchRecord {
  @Prop({ index: true, required: true })
  public actorId!: string

  @Prop({ required: true })
  public sourceName!: string

  @Prop({ required: true })
  public checksum!: string

  @Prop({ required: true })
  public expiresAt!: Date

  @Prop({ required: true })
  public sourceRowCount!: number

  @Prop({ default: [], type: [String] })
  public questionFields!: string[]

  @Prop({ default: 'preview', enum: ['preview', 'committed'] })
  public status!: 'preview' | 'committed'
}

export const StudentImportBatchSchema = SchemaFactory.createForClass(
  StudentImportBatchRecord
)
StudentImportBatchSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 })

@Schema({ timestamps: true, collection: 'studentImportRows' })
export class StudentImportRowRecord {
  @Prop({ index: true, required: true })
  public batchId!: string

  @Prop({ index: true, required: true })
  public actorId!: string

  @Prop({ required: true })
  public rowKey!: string

  @Prop({ required: true })
  public sourceRowHash!: string

  @Prop({ required: true })
  public sheet!: string

  @Prop({ min: 1, required: true })
  public rowNumber!: number

  @Prop({ required: true, enum: ['create', 'update', 'unchanged', 'invalid'] })
  public action!: 'create' | 'update' | 'unchanged' | 'invalid'

  @Prop({ default: 'pending', enum: ['pending', 'committed', 'skipped'] })
  public status!: 'pending' | 'committed' | 'skipped'

  @Prop({ type: MongooseSchema.Types.Mixed })
  public payload?: Record<string, unknown>

  @Prop({ type: MongooseSchema.Types.Mixed })
  public sourcePreview?: Record<string, unknown>

  @Prop({ default: [], type: [MongooseSchema.Types.Mixed] })
  public issues!: Record<string, unknown>[]

  @Prop({ default: [], type: [MongooseSchema.Types.Mixed] })
  public warnings!: Record<string, unknown>[]

  @Prop({ default: [], type: [MongooseSchema.Types.Mixed] })
  public changes!: Record<string, unknown>[]

  @Prop()
  public expectedStudentId?: string

  @Prop()
  public expectedUpdatedAt?: Date

  @Prop()
  public expectedPayloadHash?: string

  @Prop()
  public confirmedAction?: 'create' | 'update'

  @Prop()
  public outcome?: 'created' | 'updated' | 'unchanged' | 'skipped'

  @Prop({ required: true })
  public expiresAt!: Date
}

export const StudentImportRowSchema = SchemaFactory.createForClass(
  StudentImportRowRecord
)
StudentImportRowSchema.index({ batchId: 1, rowKey: 1 }, { unique: true })
StudentImportRowSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 })

@Schema({ _id: false })
export class StudentImportDecisionRecord {
  @Prop({ required: true })
  public rowId!: string

  @Prop({ required: true, enum: ['create', 'update'] })
  public action!: 'create' | 'update'

  @Prop({ enum: ['created', 'updated', 'unchanged', 'skipped'] })
  public outcome?: 'created' | 'updated' | 'unchanged' | 'skipped'
}

const StudentImportDecisionSchema = SchemaFactory.createForClass(
  StudentImportDecisionRecord
)

@Schema({ timestamps: true, collection: 'studentImportCommits' })
export class StudentImportCommitRecord {
  @Prop({ index: true, required: true })
  public batchId!: string

  @Prop({ index: true, required: true })
  public actorId!: string

  @Prop({ required: true, unique: true })
  public idempotencyScopeKey!: string

  @Prop({ required: true })
  public requestHash!: string

  @Prop({ required: true, type: [StudentImportDecisionSchema] })
  public decisions!: StudentImportDecisionRecord[]

  @Prop({ default: 'processing', enum: ['processing', 'completed'] })
  public status!: 'processing' | 'completed'
}

export const StudentImportCommitSchema = SchemaFactory.createForClass(
  StudentImportCommitRecord
)
StudentImportCommitSchema.index({ batchId: 1, actorId: 1 })
