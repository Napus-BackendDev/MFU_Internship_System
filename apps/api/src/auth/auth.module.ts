import { Module } from '@nestjs/common'
import { MongooseModule } from '@nestjs/mongoose'

import { AuthController } from './auth.controller.js'
import { AuthRateLimitStore } from './auth-rate-limit.store.js'
import { DevAuthController } from './dev-auth.controller.js'
import { UsersController } from './users.controller.js'
import { OidcService } from './oidc.service.js'
import { SessionService } from './session.service.js'
import { StudentRecord, StudentSchema } from '../members/members.schema.js'
import { TokenService } from './token.service.js'
import {
  SessionRecord,
  SessionSchema,
  UserRecord,
  UserSchema
} from './user.schema.js'
import { UsersService } from './users.service.js'

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: UserRecord.name, schema: UserSchema },
      { name: SessionRecord.name, schema: SessionSchema },
      { name: StudentRecord.name, schema: StudentSchema }
    ])
  ],
  controllers: [
    AuthController,
    UsersController,
    ...(process.env.NODE_ENV === 'production' ? [] : [DevAuthController])
  ],
  providers: [
    AuthRateLimitStore,
    OidcService,
    SessionService,
    TokenService,
    UsersService
  ],
  exports: [AuthRateLimitStore, SessionService, TokenService, UsersService]
})
export class AuthModule {}
