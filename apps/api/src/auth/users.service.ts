import type { AuthenticatedActor } from '@internship/shared-types'
import { Injectable, UnauthorizedException } from '@nestjs/common'
import { InjectModel } from '@nestjs/mongoose'
import type { Model } from 'mongoose'

import {
  UserRecord,
  type UserDocument,
  type RoleAssignmentRecord
} from './user.schema.js'

@Injectable()
export class UsersService {
  public constructor(
    @InjectModel(UserRecord.name)
    private readonly users: Model<UserRecord>
  ) {}

  public async resolveOidcActor(input: {
    subject: string
    email: string
    displayName: string
    avatarUrl?: string
  }): Promise<AuthenticatedActor> {
    const user = await this.users
      .findOneAndUpdate(
        { oidcSubject: input.subject },
        {
          $set: {
            email: input.email.toLowerCase(),
            displayName: input.displayName,
            ...(input.avatarUrl ? { avatarUrl: input.avatarUrl } : {})
          },
          $setOnInsert: {
            oidcSubject: input.subject,
            roleAssignments: [],
            status: 'active'
          }
        },
        { new: true, upsert: true }
      )
      .exec()

    if (user.status !== 'active') {
      throw new UnauthorizedException({ code: 'ACCOUNT_INACTIVE' })
    }

    return this.toActor(user)
  }

  public toActor(user: UserDocument): AuthenticatedActor {
    const assignments = user.roleAssignments.filter(
      (assignment) => assignment.active
    )
    const roles = [...new Set(assignments.map((assignment) => assignment.role))]
    const tenant = assignments.some((assignment) => assignment.tenant)
    const schoolIds = this.uniqueScope(assignments, 'schoolIds')
    const programIds = this.uniqueScope(assignments, 'programIds')

    return {
      id: user.id,
      email: user.email,
      displayName: user.displayName,
      roles,
      scope: {
        tenant,
        schoolIds,
        programIds,
        ...(user.studentId ? { studentId: user.studentId } : {})
      },
      ...(user.avatarUrl
        ? { avatarUrl: user.avatarUrl, picture: user.avatarUrl }
        : {})
    }
  }

  public async resolveActiveActorById(id: string): Promise<AuthenticatedActor> {
    const user = await this.users.findOne({ _id: id, status: 'active' }).exec()
    if (!user) {
      throw new UnauthorizedException({ code: 'ACCOUNT_INACTIVE' })
    }
    const actor = this.toActor(user)
    if (actor.roles.length === 0) {
      throw new UnauthorizedException({ code: 'ROLE_REVOKED' })
    }
    return actor
  }

  private uniqueScope(
    assignments: readonly RoleAssignmentRecord[],
    field: 'schoolIds' | 'programIds'
  ): readonly string[] {
    return [...new Set(assignments.flatMap((assignment) => assignment[field]))]
  }
}
