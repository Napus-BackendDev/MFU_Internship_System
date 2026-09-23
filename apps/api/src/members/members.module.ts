import { Module } from '@nestjs/common'
import { MongooseModule } from '@nestjs/mongoose'

import {
  CourseRecord,
  CourseSchema,
  ProgramRecord,
  ProgramSchema,
  SchoolRecord,
  SchoolSchema
} from '../academic/academic.schema.js'
import { AuditModule } from '../audit/audit.module.js'
import { MembersController } from './members.controller.js'
import {
  AcademicTermRecord,
  AcademicTermSchema
} from '../academic/academic.schema.js'
import {
  EvaluationAssignmentRecord,
  EvaluationAssignmentSchema
} from '../evaluations/evaluation.schema.js'
import {
  EvaluatorRecord,
  EvaluatorSchema,
  OrganizationRecord,
  OrganizationSchema,
  PlacementRecord,
  PlacementSchema,
  StudentRecord,
  StudentSchema
} from './members.schema.js'
import { MembersService } from './members.service.js'
import {
  StudentImportBatchRecord,
  StudentImportBatchSchema,
  StudentImportCommitRecord,
  StudentImportCommitSchema,
  StudentImportRowRecord,
  StudentImportRowSchema
} from './student-import.schema.js'
import { StudentImportService } from './student-import.service.js'

@Module({
  imports: [
    AuditModule,
    MongooseModule.forFeature([
      { name: StudentRecord.name, schema: StudentSchema },
      { name: SchoolRecord.name, schema: SchoolSchema },
      { name: ProgramRecord.name, schema: ProgramSchema },
      { name: CourseRecord.name, schema: CourseSchema },
      { name: OrganizationRecord.name, schema: OrganizationSchema },
      { name: EvaluatorRecord.name, schema: EvaluatorSchema },
      { name: PlacementRecord.name, schema: PlacementSchema },
      { name: AcademicTermRecord.name, schema: AcademicTermSchema },
      {
        name: EvaluationAssignmentRecord.name,
        schema: EvaluationAssignmentSchema
      },
      { name: StudentImportBatchRecord.name, schema: StudentImportBatchSchema },
      { name: StudentImportRowRecord.name, schema: StudentImportRowSchema },
      {
        name: StudentImportCommitRecord.name,
        schema: StudentImportCommitSchema
      }
    ])
  ],
  controllers: [MembersController],
  providers: [MembersService, StudentImportService]
})
export class MembersModule {}
