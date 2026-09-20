import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose'

import {
  LocalizedText,
  LocalizedTextSchema
} from '../academic/academic.schema.js'

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

@Schema({ _id: false })
export class QuestionRecord {
  @Prop({ required: true })
  public id!: string

  @Prop({ required: true, type: LocalizedTextSchema })
  public label!: LocalizedText

  @Prop({ enum: ['rating', 'text', 'boolean'], required: true })
  public type!: 'rating' | 'text' | 'boolean'

  @Prop({ default: true })
  public required!: boolean

  @Prop({ min: 0 })
  public weight?: number

  @Prop()
  public scaleMin?: number

  @Prop()
  public scaleMax?: number
}

export const QuestionSchema = SchemaFactory.createForClass(QuestionRecord)

@Schema({ _id: false })
export class SectionRecord {
  @Prop({ required: true })
  public id!: string

  @Prop({ required: true, type: LocalizedTextSchema })
  public title!: LocalizedText

  @Prop({ default: 'general', enum: ['general', 'special', 'suggestion'] })
  public category?: 'general' | 'special' | 'suggestion'

  @Prop()
  public schoolId?: string

  @Prop()
  public programId?: string

  @Prop({ required: true, type: [QuestionSchema] })
  public questions!: QuestionRecord[]
}

export const SectionSchema = SchemaFactory.createForClass(SectionRecord)

@Schema({ ...schemaOptions, collection: 'competencySets' })
export class CompetencySetRecord {
  @Prop({ required: true, unique: true, uppercase: true })
  public code!: string

  @Prop({ required: true, type: LocalizedTextSchema })
  public name!: LocalizedText

  @Prop({ default: 'active', enum: ['active', 'archived'] })
  public status!: 'active' | 'archived'
}

export const CompetencySetSchema =
  SchemaFactory.createForClass(CompetencySetRecord)

@Schema({ ...schemaOptions, collection: 'competencySetVersions' })
export class CompetencyVersionRecord {
  @Prop({ index: true, required: true })
  public competencySetId!: string

  @Prop({ min: 1, required: true })
  public versionNumber!: number

  @Prop({
    default: 'draft',
    enum: ['draft', 'published', 'retired'],
    index: true
  })
  public status!: 'draft' | 'published' | 'retired'

  @Prop({ default: [], type: [SectionSchema] })
  public sections!: SectionRecord[]

  @Prop()
  public publishedAt?: Date

  @Prop()
  public publishedBy?: string
}

export const CompetencyVersionSchema = SchemaFactory.createForClass(
  CompetencyVersionRecord
)
CompetencyVersionSchema.index(
  { competencySetId: 1, versionNumber: 1 },
  { unique: true }
)

@Schema({ ...schemaOptions, collection: 'evaluationCycles' })
export class EvaluationCycleRecord {
  @Prop({ required: true, unique: true })
  public code!: string

  @Prop({ required: true, type: LocalizedTextSchema })
  public name!: LocalizedText

  @Prop({ required: true })
  public competencySetVersionId!: string

  @Prop({ index: true, required: true })
  public academicTermId!: string

  @Prop({ index: true })
  public schoolId?: string

  @Prop({ index: true })
  public programId?: string

  @Prop({ required: true })
  public opensAt!: Date

  @Prop({ required: true })
  public closesAt!: Date

  @Prop({ default: 'draft', enum: ['draft', 'active', 'closed'], index: true })
  public status!: 'draft' | 'active' | 'closed'
}

export const EvaluationCycleSchema = SchemaFactory.createForClass(
  EvaluationCycleRecord
)

@Schema({ ...schemaOptions, collection: 'evaluationAssignments' })
export class EvaluationAssignmentRecord {
  @Prop({ index: true, required: true })
  public cycleId!: string

  @Prop({ index: true, required: true })
  public placementId!: string

  @Prop({ index: true, required: true })
  public evaluatorId!: string

  @Prop({ index: true, required: true })
  public studentId!: string

  @Prop({ index: true, required: true })
  public schoolId!: string

  @Prop({ index: true, required: true })
  public programId!: string

  @Prop({ required: true, type: [SectionSchema] })
  public questionSnapshot!: SectionRecord[]

  @Prop({ required: true })
  public competencySetVersionId!: string

  @Prop({ required: true })
  public deadlineAt!: Date

  @Prop({
    default: 'pending',
    enum: ['pending', 'inProgress', 'submitted', 'expired', 'reopened'],
    index: true
  })
  public status!:
    'pending' | 'inProgress' | 'submitted' | 'expired' | 'reopened'

  @Prop({ default: 1, min: 1 })
  public evaluationVersion!: number

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

export const EvaluationAssignmentSchema = SchemaFactory.createForClass(
  EvaluationAssignmentRecord
)
EvaluationAssignmentSchema.index(
  { cycleId: 1, placementId: 1, evaluatorId: 1 },
  { unique: true }
)

@Schema({ ...schemaOptions, collection: 'evaluationDrafts' })
export class EvaluationDraftRecord {
  @Prop({ required: true, unique: true })
  public assignmentId!: string

  @Prop({ default: {}, required: true, type: Object })
  public answers!: Readonly<Record<string, unknown>>

  @Prop({ default: 0, min: 0 })
  public revision!: number

  @Prop({ required: true })
  public updatedBy!: string
}

export const EvaluationDraftSchema = SchemaFactory.createForClass(
  EvaluationDraftRecord
)

@Schema({ ...schemaOptions, collection: 'evaluations' })
export class EvaluationRecord {
  @Prop({ index: true, required: true })
  public assignmentId!: string

  @Prop({ required: true })
  public version!: number

  @Prop({ required: true, type: Object })
  public answers!: Readonly<Record<string, unknown>>

  @Prop({ required: true, type: [SectionSchema] })
  public questionSnapshot!: SectionRecord[]

  @Prop({ default: null, type: Number })
  public aggregateScore!: number | null

  @Prop({ required: true })
  public evaluatorId!: string

  @Prop({ required: true })
  public submittedAt!: Date

  @Prop({ required: true })
  public idempotencyKey!: string

  @Prop({ index: true, sparse: true })
  public idempotencyScopeKey?: string

  @Prop()
  public requestHash?: string

  @Prop()
  public supersededAt?: Date
}

export const EvaluationSchema = SchemaFactory.createForClass(EvaluationRecord)
EvaluationSchema.index({ assignmentId: 1, version: 1 }, { unique: true })
EvaluationSchema.index({ assignmentId: 1, idempotencyKey: 1 }, { unique: true })
EvaluationSchema.index(
  { assignmentId: 1, idempotencyScopeKey: 1 },
  { sparse: true, unique: true }
)
