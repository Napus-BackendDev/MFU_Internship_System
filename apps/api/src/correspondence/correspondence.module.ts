import { BullModule } from '@nestjs/bullmq'
import { Module } from '@nestjs/common'
import { MongooseModule } from '@nestjs/mongoose'

import { AuthModule } from '../auth/auth.module.js'
import {
  CompetencySetRecord,
  CompetencySetSchema,
  CompetencyVersionRecord,
  CompetencyVersionSchema,
  EvaluationAssignmentRecord,
  EvaluationAssignmentSchema,
  EvaluationCycleRecord,
  EvaluationCycleSchema
} from '../evaluations/evaluation.schema.js'
import {
  EvaluatorRecord,
  EvaluatorSchema,
  PlacementRecord,
  PlacementSchema,
  StudentRecord,
  StudentSchema
} from '../members/members.schema.js'
import { CampaignService } from './campaign.service.js'
import {
  CampaignRecord,
  CampaignSchema,
  DeliveryRecord,
  DeliverySchema,
  EmailTemplateRecord,
  EmailTemplateSchema,
  EmailTemplateVersionRecord,
  EmailTemplateVersionSchema,
  InvitationRecord,
  InvitationSchema
} from './correspondence.schema.js'
import { CorrespondenceController } from './correspondence.controller.js'
import { InvitationService } from './invitation.service.js'
import { TemplateService } from './template.service.js'

@Module({
  imports: [
    AuthModule,
    BullModule.registerQueue({ name: 'email' }),
    MongooseModule.forFeature([
      { name: EmailTemplateRecord.name, schema: EmailTemplateSchema },
      {
        name: EmailTemplateVersionRecord.name,
        schema: EmailTemplateVersionSchema
      },
      { name: CampaignRecord.name, schema: CampaignSchema },
      { name: DeliveryRecord.name, schema: DeliverySchema },
      { name: InvitationRecord.name, schema: InvitationSchema },
      {
        name: EvaluationAssignmentRecord.name,
        schema: EvaluationAssignmentSchema
      },
      { name: EvaluatorRecord.name, schema: EvaluatorSchema },
      { name: StudentRecord.name, schema: StudentSchema },
      { name: PlacementRecord.name, schema: PlacementSchema },
      { name: CompetencySetRecord.name, schema: CompetencySetSchema },
      {
        name: CompetencyVersionRecord.name,
        schema: CompetencyVersionSchema
      },
      { name: EvaluationCycleRecord.name, schema: EvaluationCycleSchema }
    ])
  ],
  controllers: [CorrespondenceController],
  providers: [CampaignService, InvitationService, TemplateService]
})
export class CorrespondenceModule {}
