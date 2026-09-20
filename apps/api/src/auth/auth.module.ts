import { Module } from '@nestjs/common'
import { MongooseModule } from '@nestjs/mongoose'

import { AuthController } from './auth.controller.js'
import { DevAuthController } from './dev-auth.controller.js'
import { OidcService } from './oidc.service.js'
import { SessionService } from './session.service.js'
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
      { name: SessionRecord.name, schema: SessionSchema }
    ])
  ],
  controllers: [
    AuthController,
    ...(process.env.NODE_ENV === 'production' ? [] : [DevAuthController])
  ],
  providers: [OidcService, SessionService, TokenService, UsersService],
  exports: [SessionService, TokenService, UsersService]
})
export class AuthModule {}
