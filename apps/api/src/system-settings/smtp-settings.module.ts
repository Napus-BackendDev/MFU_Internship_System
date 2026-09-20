import { BullModule } from '@nestjs/bullmq'
import { Module } from '@nestjs/common'
import { MongooseModule } from '@nestjs/mongoose'

import { SmtpSettingsController } from './smtp-settings.controller.js'
import {
  SmtpSettingRecord,
  SmtpSettingSchema,
  SmtpTestDeliveryRecord,
  SmtpTestDeliverySchema
} from './smtp-settings.schema.js'
import { SmtpSettingsService } from './smtp-settings.service.js'

@Module({
  imports: [
    BullModule.registerQueue({ name: 'email' }),
    MongooseModule.forFeature([
      { name: SmtpSettingRecord.name, schema: SmtpSettingSchema },
      {
        name: SmtpTestDeliveryRecord.name,
        schema: SmtpTestDeliverySchema
      }
    ])
  ],
  controllers: [SmtpSettingsController],
  providers: [SmtpSettingsService]
})
export class SmtpSettingsModule {}
