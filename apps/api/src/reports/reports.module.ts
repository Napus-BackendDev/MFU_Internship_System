import { Module } from '@nestjs/common'
import { BullModule } from '@nestjs/bullmq'
import { MongooseModule } from '@nestjs/mongoose'

import { AuditModule } from '../audit/audit.module.js'
import { MembersModule } from '../members/members.module.js'
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
  EvaluationAssignmentSchema,
  EvaluationCycleRecord,
  EvaluationCycleSchema
} from '../evaluations/evaluation.schema.js'
import { StudentRecord, StudentSchema } from '../members/members.schema.js'
import { ReportsController } from './reports.controller.js'
import {
  ReportExportRecord,
  ReportExportSchema,
  ReportExportSnapshotRecord,
  ReportExportSnapshotSchema
} from './report-export.schema.js'
import { ReportExportService } from './report-export.service.js'
import { ReportsService } from './reports.service.js'

@Module({
  imports: [
    AuditModule,
    MembersModule,
    BullModule.registerQueue({ name: 'report-exports' }),
    MongooseModule.forFeature([
      {
        name: EvaluationAssignmentRecord.name,
        schema: EvaluationAssignmentSchema
      },
      { name: EvaluationCycleRecord.name, schema: EvaluationCycleSchema },
      { name: StudentRecord.name, schema: StudentSchema },
      { name: DeliveryRecord.name, schema: DeliverySchema },
      { name: GeneratedDocumentRecord.name, schema: GeneratedDocumentSchema },
      { name: ReportExportRecord.name, schema: ReportExportSchema },
      {
        name: ReportExportSnapshotRecord.name,
        schema: ReportExportSnapshotSchema
      }
    ])
  ],
  controllers: [ReportsController],
  providers: [ReportsService, ReportExportService]
})
export class ReportsModule {}
