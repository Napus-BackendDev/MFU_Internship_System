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

@Schema({ ...schemaOptions, collection: 'students' })
export class StudentRecord {
  @Prop({ required: true, trim: true, unique: true })
  public studentId!: string

  @Prop({ required: true, type: LocalizedTextSchema })
  public name!: LocalizedText

  @Prop({ index: true, lowercase: true, required: true })
  public email!: string

  @Prop({ index: true, lowercase: true, trim: true })
  public personalEmail?: string

  @Prop({ index: true, required: true })
  public schoolId!: string

  @Prop({ index: true, required: true })
  public programId!: string

  @Prop()
  public courseId?: string

  @Prop({ trim: true })
  public course?: string

  @Prop()
  public academicTermId?: string

  @Prop()
  public semester?: string

  @Prop({ trim: true })
  public company?: string

  @Prop({ trim: true })
  public companyAddress?: string

  @Prop({ trim: true })
  public province?: string

  @Prop({ min: 2000 })
  public admissionYear?: number

  @Prop({ default: 'active', enum: ['active', 'archived'], index: true })
  public status!: 'active' | 'archived'

  @Prop({
    default: 'awaiting_evaluator',
    enum: ['awaiting_evaluator', 'awaiting_response', 'submitted'],
    index: true
  })
  public evaluationStatus!:
    'awaiting_evaluator' | 'awaiting_response' | 'submitted'

  @Prop()
  public archivedAt?: Date
}

export const StudentSchema = SchemaFactory.createForClass(StudentRecord)
StudentSchema.index({ schoolId: 1, programId: 1, status: 1 })

@Schema({ ...schemaOptions, collection: 'organizations' })
export class OrganizationRecord {
  @Prop({ required: true, trim: true, unique: true, uppercase: true })
  public organizationCode!: string

  @Prop({ required: true, type: LocalizedTextSchema })
  public name!: LocalizedText

  @Prop({ type: Object })
  public address?: Readonly<Record<string, string>>

  @Prop({ lowercase: true })
  public contactEmail?: string

  @Prop({ default: 'active', enum: ['active', 'archived'], index: true })
  public status!: 'active' | 'archived'
}

export const OrganizationSchema =
  SchemaFactory.createForClass(OrganizationRecord)

@Schema({ ...schemaOptions, collection: 'evaluators' })
export class EvaluatorRecord {
  @Prop({ index: true, required: true })
  public organizationId!: string

  @Prop({ index: true, lowercase: true, required: true })
  public email!: string

  @Prop({ required: true, type: LocalizedTextSchema })
  public name!: LocalizedText

  @Prop({ required: true, type: LocalizedTextSchema })
  public position!: LocalizedText

  @Prop()
  public phone?: string

  @Prop({ default: 'active', enum: ['active', 'archived'], index: true })
  public status!: 'active' | 'archived'
}

export const EvaluatorSchema = SchemaFactory.createForClass(EvaluatorRecord)
EvaluatorSchema.index({ organizationId: 1, email: 1 }, { unique: true })

@Schema({ ...schemaOptions, collection: 'placements' })
export class PlacementRecord {
  @Prop({ index: true, required: true })
  public studentId!: string

  @Prop({ index: true, required: true })
  public organizationId!: string

  @Prop({ index: true, required: true })
  public academicTermId!: string

  @Prop({ index: true, required: true })
  public schoolId!: string

  @Prop({ index: true, required: true })
  public programId!: string

  @Prop({ required: true, type: LocalizedTextSchema })
  public positionTitle!: LocalizedText

  @Prop({ required: true })
  public startsAt!: Date

  @Prop({ required: true })
  public endsAt!: Date

  @Prop({
    default: 'planned',
    enum: ['planned', 'active', 'completed', 'cancelled']
  })
  public status!: 'planned' | 'active' | 'completed' | 'cancelled'
}

export const PlacementSchema = SchemaFactory.createForClass(PlacementRecord)
PlacementSchema.index({ studentId: 1, academicTermId: 1 }, { unique: true })
