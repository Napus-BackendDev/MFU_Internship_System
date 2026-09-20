import { Module } from '@nestjs/common'
import { MongooseModule } from '@nestjs/mongoose'

import { GeneralSettingsController } from './general-settings.controller.js'
import {
  GeneralConfigRecord,
  GeneralConfigSchema,
  ProvinceRecord,
  ProvinceSchema
} from './general-settings.schema.js'
import { GeneralSettingsService } from './general-settings.service.js'

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: ProvinceRecord.name, schema: ProvinceSchema },
      { name: GeneralConfigRecord.name, schema: GeneralConfigSchema }
    ])
  ],
  controllers: [GeneralSettingsController],
  providers: [GeneralSettingsService],
  exports: [GeneralSettingsService]
})
export class GeneralSettingsModule {}
