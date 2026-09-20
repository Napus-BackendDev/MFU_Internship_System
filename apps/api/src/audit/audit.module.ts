import { Module } from '@nestjs/common'
import { MongooseModule } from '@nestjs/mongoose'

import { AuditController } from './audit.controller.js'
import { AuditLogRecord, AuditLogSchema } from './audit.schema.js'
import { AuditService } from './audit.service.js'

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: AuditLogRecord.name, schema: AuditLogSchema }
    ])
  ],
  controllers: [AuditController],
  providers: [AuditService],
  exports: [AuditService]
})
export class AuditModule {}
