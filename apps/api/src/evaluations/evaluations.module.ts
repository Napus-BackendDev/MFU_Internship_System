import { Module } from '@nestjs/common'
import { MongooseModule } from '@nestjs/mongoose'

import { StudentRecord, StudentSchema } from '../members/members.schema.js'
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
    MongooseModule.forFeature([
      { name: StudentRecord.name, schema: StudentSchema },
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
