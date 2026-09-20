import { Module } from '@nestjs/common'
import { MongooseModule } from '@nestjs/mongoose'

import {
  DeliveryRecord,
  DeliverySchema
} from '../correspondence/correspondence.schema.js'
import {
  GeneratedDocumentRecord,
  GeneratedDocumentSchema
} from '../documents/document.schema.js'
import {
  EvaluationAssignmentRecord,
  EvaluationAssignmentSchema
} from '../evaluations/evaluation.schema.js'
import { StudentRecord, StudentSchema } from '../members/members.schema.js'
import { ReportsController } from './reports.controller.js'
import { ReportsService } from './reports.service.js'

@Module({
  imports: [
    MongooseModule.forFeature([
      {
        name: EvaluationAssignmentRecord.name,
        schema: EvaluationAssignmentSchema
      },
      { name: StudentRecord.name, schema: StudentSchema },
      { name: DeliveryRecord.name, schema: DeliverySchema },
      { name: GeneratedDocumentRecord.name, schema: GeneratedDocumentSchema }
    ])
  ],
  controllers: [ReportsController],
  providers: [ReportsService]
})
export class ReportsModule {}
