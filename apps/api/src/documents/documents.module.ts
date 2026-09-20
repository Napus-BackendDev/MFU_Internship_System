import { BullModule } from '@nestjs/bullmq'
import { Module } from '@nestjs/common'
import { MongooseModule } from '@nestjs/mongoose'

import { StudentRecord, StudentSchema } from '../members/members.schema.js'
import {
  EvaluationAssignmentRecord,
  EvaluationAssignmentSchema,
  EvaluationRecord,
  EvaluationSchema
} from '../evaluations/evaluation.schema.js'
import {
  DocumentTemplateRecord,
  DocumentTemplateSchema,
  DocumentTemplateVersionRecord,
  DocumentTemplateVersionSchema,
  GeneratedDocumentRecord,
  GeneratedDocumentSchema
} from './document.schema.js'
import { DocumentsController } from './documents.controller.js'
import { DocumentsService } from './documents.service.js'

@Module({
  imports: [
    BullModule.registerQueue({ name: 'documents' }),
    MongooseModule.forFeature([
      { name: StudentRecord.name, schema: StudentSchema },
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
  providers: [DocumentsService]
})
export class DocumentsModule {}
