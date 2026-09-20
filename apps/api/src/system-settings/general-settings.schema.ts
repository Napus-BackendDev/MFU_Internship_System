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

@Schema({ ...schemaOptions, collection: 'system_provinces' })
export class ProvinceRecord {
  @Prop({ required: true, trim: true, unique: true, index: true })
  public code!: string

  @Prop({ required: true, trim: true, index: true })
  public nameTh!: string

  @Prop({ required: true, trim: true, index: true })
  public nameEn!: string

  @Prop({ required: true, trim: true, index: true })
  public region!: string

  @Prop({ default: 'active', enum: ['active', 'inactive'], index: true })
  public status!: 'active' | 'inactive'

  @Prop({ default: false })
  public isCustom?: boolean
}

export const ProvinceSchema = SchemaFactory.createForClass(ProvinceRecord)
ProvinceSchema.index({ region: 1, nameTh: 1 })

@Schema({ ...schemaOptions, collection: 'system_general_configs' })
export class GeneralConfigRecord {
  @Prop({ default: 'general', enum: ['general'], required: true, unique: true })
  public key!: 'general'

  @Prop({ default: 'มหาวิทยาลัยแม่ฟ้าหลวง' })
  public institutionNameTh!: string

  @Prop({ default: 'Mae Fah Luang University' })
  public institutionNameEn!: string

  @Prop({ default: 'ศูนย์บริการวิชาการและงานสหกิจศึกษา (CWIE)' })
  public departmentName!: string

  @Prop({ default: 300 })
  public defaultInternshipHours!: number

  @Prop({ default: 2566 })
  public currentAcademicYear!: number

  @Prop({ default: '1/2566' })
  public currentSemester!: string

  @Prop({ default: 'internship@mfu.ac.th' })
  public contactEmail!: string

  @Prop({ default: '0-5391-6000' })
  public contactPhone!: string

  @Prop({
    type: [String],
    default: [
      'บริษัทเอกชน (Private Company)',
      'บริษัทมหาชนจำกัด (Public Company)',
      'รัฐวิสาหกิจ (State Enterprise)',
      'หน่วยงานราชการ (Government Agency)',
      'สตาร์ทอัพ / เทคโนโลยี (Startup / Tech)',
      'โรงพยาบาล / สาธารณสุข (Hospital / Healthcare)',
      'โรงแรม / การท่องเที่ยว (Hotel / Tourism)',
      'สถาบันการศึกษา / วิจัย (Education / Research)',
      'องค์กรไม่แสวงหากำไร (NGO / Non-profit)'
    ]
  })
  public companyTypes!: string[]
}

export const GeneralConfigSchema =
  SchemaFactory.createForClass(GeneralConfigRecord)
