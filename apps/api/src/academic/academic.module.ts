import { Module } from '@nestjs/common'
import { MongooseModule } from '@nestjs/mongoose'

import { AuditModule } from '../audit/audit.module.js'
import { AcademicController } from './academic.controller.js'
import {
  EvaluationAssignmentRecord,
  EvaluationAssignmentSchema,
  EvaluationCycleRecord,
  EvaluationCycleSchema
} from '../evaluations/evaluation.schema.js'
import {
  PlacementRecord,
  PlacementSchema,
  StudentRecord,
  StudentSchema
} from '../members/members.schema.js'
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
    AuditModule,
    MongooseModule.forFeature([
      { name: SchoolRecord.name, schema: SchoolSchema },
      { name: ProgramRecord.name, schema: ProgramSchema },
      { name: CourseRecord.name, schema: CourseSchema },
      { name: AcademicTermRecord.name, schema: AcademicTermSchema },
      { name: EvaluationCycleRecord.name, schema: EvaluationCycleSchema },
      {
        name: EvaluationAssignmentRecord.name,
        schema: EvaluationAssignmentSchema
      },
      { name: PlacementRecord.name, schema: PlacementSchema },
      { name: StudentRecord.name, schema: StudentSchema }
    ])
  ],
  controllers: [AcademicController],
  providers: [AcademicService]
})
export class AcademicModule {}
