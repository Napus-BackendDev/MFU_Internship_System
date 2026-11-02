import { Module } from '@nestjs/common'
import { MongooseModule } from '@nestjs/mongoose'

import { AuditModule } from '../audit/audit.module.js'
import {
  EvaluationAssignmentRecord,
  EvaluationAssignmentSchema,
  EvaluationRecord,
  EvaluationSchema
} from '../evaluations/evaluation.schema.js'
import { AiSettingsController } from './ai-settings.controller.js'
import {
  AiSettingRecord,
  AiSettingSchema,
  FeedbackSummaryRecord,
  FeedbackSummarySchema
} from './ai-settings.schema.js'
import { AiSettingsService } from './ai-settings.service.js'
import { FeedbackSummaryService } from './feedback-summary.service.js'

@Module({
  imports: [
    AuditModule,
    MongooseModule.forFeature([
      { name: AiSettingRecord.name, schema: AiSettingSchema },
      { name: FeedbackSummaryRecord.name, schema: FeedbackSummarySchema },
      {
        name: EvaluationAssignmentRecord.name,
        schema: EvaluationAssignmentSchema
      },
      { name: EvaluationRecord.name, schema: EvaluationSchema }
    ])
  ],
  controllers: [AiSettingsController],
  providers: [AiSettingsService, FeedbackSummaryService]
})
export class AiSettingsModule {}
