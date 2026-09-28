import { BullModule } from '@nestjs/bullmq'
import { Module } from '@nestjs/common'
import { MongooseModule } from '@nestjs/mongoose'

import { AuditModule } from '../audit/audit.module.js'
import { AuthModule } from '../auth/auth.module.js'
import {
  AcademicTermRecord,
  AcademicTermSchema,
  ProgramRecord,
  ProgramSchema,
  SchoolRecord,
  SchoolSchema
} from '../academic/academic.schema.js'
import {
  OrganizationRecord,
  OrganizationSchema,
  PlacementRecord,
  PlacementSchema,
  StudentRecord,
  StudentSchema
} from '../members/members.schema.js'
import {
  EvaluationAssignmentRecord,
  EvaluationAssignmentSchema,
  EvaluationRecord,
  EvaluationSchema
} from '../evaluations/evaluation.schema.js'
import {
  DocumentAssetRecord,
  DocumentAssetSchema,
  DocumentTemplateRecord,
  DocumentTemplateSchema,
  DocumentTemplateVersionRecord,
  DocumentTemplateVersionSchema,
  GeneratedDocumentRecord,
  GeneratedDocumentSchema
} from './document.schema.js'
import { DocumentsController } from './documents.controller.js'
import { DocumentGenerationRateLimitGuard } from './document-generation-rate-limit.guard.js'
import { DocumentsService } from './documents.service.js'

@Module({
  imports: [
    AuditModule,
    AuthModule,
    BullModule.registerQueue({ name: 'documents' }),
    MongooseModule.forFeature([
      { name: DocumentAssetRecord.name, schema: DocumentAssetSchema },
      { name: AcademicTermRecord.name, schema: AcademicTermSchema },
      { name: SchoolRecord.name, schema: SchoolSchema },
      { name: ProgramRecord.name, schema: ProgramSchema },
      { name: StudentRecord.name, schema: StudentSchema },
      { name: PlacementRecord.name, schema: PlacementSchema },
      { name: OrganizationRecord.name, schema: OrganizationSchema },
      {
        name: EvaluationAssignmentRecord.name,
        schema: EvaluationAssignmentSchema
      },
      { name: EvaluationRecord.name, schema: EvaluationSchema },
      { name: DocumentTemplateRecord.name, schema: DocumentTemplateSchema },
      {
        name: DocumentTemplateVersionRecord.name,
        schema: DocumentTemplateVersionSchema
      },
      { name: GeneratedDocumentRecord.name, schema: GeneratedDocumentSchema }
    ])
  ],
  controllers: [DocumentsController],
  providers: [DocumentsService, DocumentGenerationRateLimitGuard]
})
export class DocumentsModule {}
