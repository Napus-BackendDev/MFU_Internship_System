import { Module } from '@nestjs/common'
import { MongooseModule } from '@nestjs/mongoose'

import { AuditModule } from '../audit/audit.module.js'
import {
  AcademicTermRecord,
  AcademicTermSchema,
  ProgramRecord,
  ProgramSchema,
  SchoolRecord,
  SchoolSchema
} from '../academic/academic.schema.js'
import {
  EvaluatorRecord,
  EvaluatorSchema,
  OrganizationRecord,
  OrganizationSchema,
  PlacementRecord,
  PlacementSchema,
  StudentRecord,
  StudentSchema
} from '../members/members.schema.js'
import {
  CompetencySetRecord,
  CompetencySetSchema,
  CompetencyVersionRecord,
  CompetencyVersionSchema,
  EvaluationAssignmentRecord,
  EvaluationAssignmentSchema,
  EvaluationCycleRecord,
  EvaluationCycleSchema,
  EvaluationDraftRecord,
  EvaluationDraftSchema,
  EvaluationRecord,
  EvaluationSchema
} from './evaluation.schema.js'
import { EvaluationsController } from './evaluations.controller.js'
import { EvaluationsService } from './evaluations.service.js'

@Module({
  imports: [
    AuditModule,
    MongooseModule.forFeature([
      { name: SchoolRecord.name, schema: SchoolSchema },
      { name: ProgramRecord.name, schema: ProgramSchema },
      { name: AcademicTermRecord.name, schema: AcademicTermSchema },
      { name: StudentRecord.name, schema: StudentSchema },
      { name: EvaluatorRecord.name, schema: EvaluatorSchema },
      { name: OrganizationRecord.name, schema: OrganizationSchema },
      { name: PlacementRecord.name, schema: PlacementSchema },
      { name: CompetencySetRecord.name, schema: CompetencySetSchema },
      { name: CompetencyVersionRecord.name, schema: CompetencyVersionSchema },
      { name: EvaluationCycleRecord.name, schema: EvaluationCycleSchema },
      {
        name: EvaluationAssignmentRecord.name,
        schema: EvaluationAssignmentSchema
      },
      { name: EvaluationDraftRecord.name, schema: EvaluationDraftSchema },
      { name: EvaluationRecord.name, schema: EvaluationSchema }
    ])
  ],
  controllers: [EvaluationsController],
  providers: [EvaluationsService]
})
export class EvaluationsModule {}
