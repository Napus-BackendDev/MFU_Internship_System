import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose'

@Schema({ _id: false })
export class LocalizedText {
  @Prop({ required: true })
  public th!: string

  @Prop({ required: true })
  public en!: string
}

export const LocalizedTextSchema = SchemaFactory.createForClass(LocalizedText)

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

@Schema({ ...schemaOptions, collection: 'schools' })
export class SchoolRecord {
  @Prop({ required: true, trim: true, unique: true, uppercase: true })
  public schoolCode!: string

  @Prop({ required: true, type: LocalizedTextSchema })
  public name!: LocalizedText

  @Prop({ default: 'active', enum: ['active', 'archived'], index: true })
  public status!: 'active' | 'archived'
}

export const SchoolSchema = SchemaFactory.createForClass(SchoolRecord)

@Schema({ ...schemaOptions, collection: 'programs' })
export class ProgramRecord {
  @Prop({ index: true, required: true })
  public schoolId!: string

  @Prop({ required: true, trim: true, uppercase: true })
  public programCode!: string

  @Prop({ required: true, type: LocalizedTextSchema })
  public name!: LocalizedText

  @Prop({ default: 'active', enum: ['active', 'archived'], index: true })
  public status!: 'active' | 'archived'
}

export const ProgramSchema = SchemaFactory.createForClass(ProgramRecord)
ProgramSchema.index({ schoolId: 1, programCode: 1 }, { unique: true })

@Schema({ ...schemaOptions, collection: 'courses' })
export class CourseRecord {
  @Prop({ required: true, trim: true, unique: true, uppercase: true })
  public courseCode!: string

  @Prop({ default: [], index: true, type: [String] })
  public programIds!: string[]

  @Prop({ required: true, type: LocalizedTextSchema })
  public name!: LocalizedText

  @Prop({ min: 0 })
  public credits?: number

  @Prop({ default: 'active', enum: ['active', 'archived'], index: true })
  public status!: 'active' | 'archived'
}

export const CourseSchema = SchemaFactory.createForClass(CourseRecord)

@Schema({ ...schemaOptions, collection: 'academicTerms' })
export class AcademicTermRecord {
  @Prop({ required: true, unique: true })
  public code!: string

  @Prop({ min: 2000, required: true })
  public academicYear!: number

  @Prop({ required: true })
  public semester!: string

  @Prop({ required: true })
  public startsAt!: Date

  @Prop({ required: true })
  public endsAt!: Date

  @Prop({ default: 'Asia/Bangkok' })
  public timezone!: string

  @Prop({ default: 'planned', enum: ['planned', 'open', 'closed', 'archived'] })
  public status!: 'planned' | 'open' | 'closed' | 'archived'
}

export const AcademicTermSchema =
  SchemaFactory.createForClass(AcademicTermRecord)
