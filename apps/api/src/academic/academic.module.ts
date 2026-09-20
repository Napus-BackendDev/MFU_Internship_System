import { Module } from '@nestjs/common'
import { MongooseModule } from '@nestjs/mongoose'

import { AcademicController } from './academic.controller.js'
import {
  AcademicTermRecord,
  AcademicTermSchema,
  CourseRecord,
  CourseSchema,
  ProgramRecord,
  ProgramSchema,
  SchoolRecord,
  SchoolSchema
} from './academic.schema.js'
import { AcademicService } from './academic.service.js'

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: SchoolRecord.name, schema: SchoolSchema },
      { name: ProgramRecord.name, schema: ProgramSchema },
      { name: CourseRecord.name, schema: CourseSchema },
      { name: AcademicTermRecord.name, schema: AcademicTermSchema }
    ])
  ],
  controllers: [AcademicController],
  providers: [AcademicService]
})
export class AcademicModule {}
