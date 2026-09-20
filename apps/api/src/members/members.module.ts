import { Module } from '@nestjs/common'
import { MongooseModule } from '@nestjs/mongoose'

import { MembersController } from './members.controller.js'
import {
  EvaluatorRecord,
  EvaluatorSchema,
  OrganizationRecord,
  OrganizationSchema,
  PlacementRecord,
  PlacementSchema,
  StudentRecord,
  StudentSchema
} from './members.schema.js'
import { MembersService } from './members.service.js'

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: StudentRecord.name, schema: StudentSchema },
      { name: OrganizationRecord.name, schema: OrganizationSchema },
      { name: EvaluatorRecord.name, schema: EvaluatorSchema },
      { name: PlacementRecord.name, schema: PlacementSchema }
    ])
  ],
  controllers: [MembersController],
  providers: [MembersService]
})
export class MembersModule {}
