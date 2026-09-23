import type { RoleKey } from '@internship/shared-types'
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose'
import { Types, type HydratedDocument } from 'mongoose'

@Schema({ _id: false })
export class RoleAssignmentRecord {
  @Prop({ required: true })
  public role!: RoleKey

  @Prop({ default: false })
  public tenant!: boolean

  @Prop({ default: [], type: [String] })
  public schoolIds!: string[]

  @Prop({ default: [], type: [String] })
  public programIds!: string[]

  @Prop({ default: true })
  public active!: boolean
}

const RoleAssignmentSchema = SchemaFactory.createForClass(RoleAssignmentRecord)

@Schema({
  collection: 'users',
  timestamps: true,
  toJSON: {
    virtuals: true,
    transform: (_doc: unknown, ret: Record<string, unknown>) => {
      ret.id =
        ret._id instanceof Types.ObjectId ? ret._id.toHexString() : ret.id
      return ret
    }
  }
})
export class UserRecord {
  @Prop({ index: true, required: true, unique: true })
  public oidcSubject!: string

  @Prop({ index: true, lowercase: true, required: true })
  public email!: string

  @Prop({ required: true })
  public displayName!: string

  @Prop({ default: 'active', enum: ['active', 'archived', 'suspended'] })
  public status!: 'active' | 'archived' | 'suspended'

  @Prop({ default: [], type: [RoleAssignmentSchema] })
  public roleAssignments!: RoleAssignmentRecord[]

  @Prop()
  public studentId?: string

  @Prop()
  public avatarUrl?: string
}

export type UserDocument = HydratedDocument<UserRecord>
export const UserSchema = SchemaFactory.createForClass(UserRecord)

@Schema({ collection: 'sessions', timestamps: true })
export class SessionRecord {
  @Prop({ index: true, required: true, unique: true })
  public tokenHash!: string

  @Prop({ index: true, required: true })
  public actorId!: string

  @Prop({ required: true })
  public expiresAt!: Date

  @Prop()
  public revokedAt?: Date
}

export const SessionSchema = SchemaFactory.createForClass(SessionRecord)
SessionSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 })
