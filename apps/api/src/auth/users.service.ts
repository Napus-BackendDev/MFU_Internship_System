import type { AuthenticatedActor, RoleKey } from '@internship/shared-types'
import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
  UnprocessableEntityException,
  UnauthorizedException
} from '@nestjs/common'
import { InjectConnection, InjectModel } from '@nestjs/mongoose'
import type { ClientSession, Connection, Model, QueryFilter } from 'mongoose'

import {
  AuditService,
  resourceScopesFromRoleAssignments
} from '../audit/audit.service.js'
import { paginate, type PaginationInput } from '../common/pagination.js'
import { boundedSearch } from '../common/search.js'
import { idempotencyScopeKey, requestHash } from '../common/idempotency.js'
import {
  assertCanAssignRole,
  isSystemAdministrator,
  roleAssignmentWithinScope,
  userManagementScope
} from './user-management.policy.js'
import {
  UserRecord,
  type UserDocument,
  type RoleAssignmentRecord
} from './user.schema.js'
import { StudentRecord } from '../members/members.schema.js'

export interface CreateUserInput {
  email: string
  displayName: string
  role: RoleKey
  status?: 'active' | 'archived' | 'suspended'
  studentId?: string
  schoolIds?: string[]
  programIds?: string[]
}

export interface UpdateUserInput {
  email?: string
  displayName?: string
  role?: RoleKey
  status?: 'active' | 'archived' | 'suspended'
  studentId?: string
  schoolIds?: string[]
  programIds?: string[]
}

export interface ListUsersFilter {
  search?: string
  role?: RoleKey
  status?: string
  schoolId?: string
}

export interface LinkOidcAccountInput {
  readonly targetUserId: string
  readonly issuer: string
  readonly subject: string
  readonly reason: string
  readonly idempotencyKey: string
  readonly requestId: string
}

const ACTIVE_ADMIN_MUTEX_ID = 'active-system-administrators'
interface SystemInvariantRecord {
  readonly _id: string
  readonly revision: number
}

function isDuplicateKeyError(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error.code === 11000 || error.code === 11001)
  )
}

@Injectable()
export class UsersService {
  public constructor(
    @InjectConnection()
    private readonly connection: Connection,
    @InjectModel(UserRecord.name)
    private readonly users: Model<UserRecord>,
    @InjectModel(StudentRecord.name)
    private readonly students: Model<StudentRecord>,
    private readonly auditService: AuditService
  ) {}

  public async resolveOidcActor(input: {
    issuer: string
    subject: string
    email: string
    displayName: string
    avatarUrl?: string
  }): Promise<AuthenticatedActor> {
    const existing = await this.users
      .findOne({ oidcIssuer: input.issuer, oidcSubject: input.subject })
      .exec()
    if (!existing) {
      throw new UnauthorizedException({ code: 'ACCOUNT_LINK_REQUIRED' })
    }
    const email = input.email.toLowerCase()
    const emailOwner = await this.users
      .findOne({ email, _id: { $ne: existing.id } })
      .select({ _id: 1 })
      .exec()
    if (emailOwner) {
      throw new ConflictException({ code: 'USER_EMAIL_EXISTS' })
    }
    const user = await this.users
      .findOneAndUpdate(
        {
          _id: existing.id,
          oidcIssuer: input.issuer,
          oidcSubject: input.subject
        },
        {
          $set: {
            email,
            displayName: input.displayName,
            ...(input.avatarUrl ? { avatarUrl: input.avatarUrl } : {})
          }
        },
        { returnDocument: 'after' }
      )
      .exec()

    if (!user)
      throw new UnauthorizedException({ code: 'ACCOUNT_LINK_REQUIRED' })

    if (user.status !== 'active') {
      throw new UnauthorizedException({ code: 'ACCOUNT_INACTIVE' })
    }

    const actor = this.toActor(user)
    if (actor.roles.length === 0) {
      throw new UnauthorizedException({ code: 'ROLE_NOT_ASSIGNED' })
    }
    return actor
  }

  public async linkOidcAccount(
    actor: AuthenticatedActor,
    input: LinkOidcAccountInput
  ): Promise<{ userId: string; issuer: string; status: 'linked' }> {
    if (!isSystemAdministrator(actor)) {
      throw new ForbiddenException({ code: 'SYSTEM_ADMIN_REQUIRED' })
    }

    const scopeKey = idempotencyScopeKey(
      actor.id,
      `users.oidc-link:${input.targetUserId}`,
      input.idempotencyKey
    )
    const payloadHash = requestHash({
      targetUserId: input.targetUserId,
      issuer: input.issuer,
      subject: input.subject,
      reason: input.reason
    })

    try {
      return await this.connection.transaction(async (session) => {
        const target = await this.users
          .findById(input.targetUserId)
          .session(session)
          .exec()

        if (!target) throw new NotFoundException({ code: 'USER_NOT_FOUND' })

        if (target.oidcLinkIdempotencyScopeKey === scopeKey) {
          if (target.oidcLinkRequestHash !== payloadHash) {
            throw new ConflictException({ code: 'IDEMPOTENCY_KEY_REUSED' })
          }
          return {
            userId: target.id,
            issuer: input.issuer,
            status: 'linked'
          }
        }

        if (
          target.status !== 'active' ||
          target.oidcIssuer ||
          (!target.oidcSubject.startsWith('local:') &&
            target.oidcSubject !== input.subject)
        ) {
          throw new ConflictException({ code: 'USER_NOT_LINKABLE' })
        }

        const updated = await this.users
          .findOneAndUpdate(
            {
              _id: target.id,
              status: 'active',
              oidcIssuer: { $exists: false },
              $or: [
                { oidcSubject: { $regex: '^local:' } },
                { oidcSubject: input.subject }
              ]
            },
            {
              $set: {
                oidcIssuer: input.issuer,
                oidcSubject: input.subject,
                oidcLinkIdempotencyScopeKey: scopeKey,
                oidcLinkRequestHash: payloadHash
              }
            },
            { returnDocument: 'after', session }
          )
          .exec()

        if (!updated) {
          throw new ConflictException({ code: 'USER_NOT_LINKABLE' })
        }

        await this.auditService.record(
          {
            requestId: input.requestId,
            actorId: actor.id,
            actorEmail: actor.email,
            action: 'users.oidc_identity.linked',
            route: 'POST /api/v2/users/:id/oidc-link',
            method: 'POST',
            metadata: {
              targetUserId: updated.id,
              issuer: input.issuer,
              subjectHash: requestHash(input.subject),
              reason: input.reason.trim(),
              idempotencyScopeKey: scopeKey
            }
          },
          session
        )

        return { userId: updated.id, issuer: input.issuer, status: 'linked' }
      })
    } catch (error: unknown) {
      if (isDuplicateKeyError(error)) {
        throw new ConflictException({ code: 'OIDC_IDENTITY_ALREADY_LINKED' })
      }
      throw error
    }
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
      roleScopes: assignments.map((assignment) => ({
        role: assignment.role,
        tenant: assignment.tenant,
        schoolIds: assignment.schoolIds,
        programIds: assignment.programIds
      })),
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

  public async listUsers(
    actor: AuthenticatedActor,
    page: PaginationInput,
    filters: ListUsersFilter = {}
  ): Promise<unknown> {
    const conditions: QueryFilter<UserRecord>[] = [
      userManagementScope(actor, 'read', {
        ...(filters.role ? { role: filters.role } : {}),
        ...(filters.schoolId ? { schoolId: filters.schoolId } : {})
      })
    ]

    if (filters.role) {
      conditions.push({ 'roleAssignments.role': filters.role })
    }
    if (filters.status) {
      conditions.push({ status: filters.status as UserRecord['status'] })
    }
    if (filters.schoolId) {
      conditions.push({ 'roleAssignments.schoolIds': filters.schoolId })
    }
    if (filters.search) {
      const search = boundedSearch(filters.search)
      conditions.push({
        $or: [
          { email: { $regex: search, $options: 'i' } },
          { displayName: { $regex: search, $options: 'i' } },
          { studentId: { $regex: search, $options: 'i' } }
        ]
      })
    }

    const query: QueryFilter<UserRecord> = { $and: conditions }

    const result = await paginate(this.users, query, page, {
      createdAt: -1,
      _id: -1
    })
    return {
      ...result,
      items: result.items.map((user) => {
        const safeUser = { ...user }
        if (
          safeUser.id !== actor.id &&
          Array.isArray(safeUser.roleAssignments)
        ) {
          safeUser.roleAssignments = safeUser.roleAssignments.filter(
            (assignment) =>
              roleAssignmentWithinScope(
                actor,
                assignment as RoleAssignmentRecord,
                'read'
              )
          )
        }
        delete safeUser.oidcSubject
        delete safeUser.oidcIssuer
        delete safeUser.oidcLinkIdempotencyScopeKey
        delete safeUser.oidcLinkRequestHash
        delete safeUser.__v
        delete safeUser._id
        return safeUser
      })
    }
  }

  public async getUserSummary(actor: AuthenticatedActor): Promise<{
    total: number
    systemAdmin: number
    internshipStaff: number
    coordinator: number
    student: number
  }> {
    const scope = userManagementScope(actor)
    const countRole = (role: RoleKey): Promise<number> =>
      this.users
        .countDocuments({
          $and: [
            userManagementScope(actor, 'manage', { role }),
            {
              roleAssignments: { $elemMatch: { role, active: true } },
              status: { $ne: 'archived' }
            }
          ]
        })
        .exec()
    const [total, systemAdmin, internshipStaff, coordinator, student] =
      await Promise.all([
        this.users
          .countDocuments({ $and: [scope, { status: { $ne: 'archived' } }] })
          .exec(),
        countRole('systemAdmin'),
        countRole('internshipStaff'),
        countRole('coordinator'),
        countRole('student')
      ])

    return { total, systemAdmin, internshipStaff, coordinator, student }
  }

  public async createUser(
    actor: AuthenticatedActor,
    input: CreateUserInput,
    requestId: string
  ): Promise<unknown> {
    return this.withUserMutation(async (session) => {
      const tenant =
        input.role === 'systemAdmin' ||
        (input.role === 'internshipStaff' && isSystemAdministrator(actor))
      const schoolIds = [...(input.schoolIds ?? [])]
      const programIds = [...(input.programIds ?? [])]
      let linkedStudentId: string | undefined

      if (input.role === 'student') {
        if (!input.studentId) {
          throw new UnprocessableEntityException({
            code: 'STUDENT_LINK_REQUIRED'
          })
        }
        const student = await this.students
          .findOne({ studentId: input.studentId, status: 'active' })
          .session(session ?? null)
          .exec()
        if (!student) {
          throw new NotFoundException({ code: 'STUDENT_NOT_FOUND' })
        }
        linkedStudentId = student.studentId
        if (student.email.toLowerCase() !== input.email.toLowerCase()) {
          throw new UnprocessableEntityException({
            code: 'STUDENT_EMAIL_MISMATCH'
          })
        }
        if (
          (schoolIds.length > 0 &&
            (schoolIds.length !== 1 || schoolIds[0] !== student.schoolId)) ||
          (programIds.length > 0 &&
            (programIds.length !== 1 || programIds[0] !== student.programId))
        ) {
          throw new UnprocessableEntityException({
            code: 'STUDENT_SCOPE_MISMATCH'
          })
        }
        schoolIds.splice(0, schoolIds.length, student.schoolId)
        programIds.splice(0, programIds.length, student.programId)
      } else if (input.studentId) {
        throw new UnprocessableEntityException({
          code: 'STUDENT_LINK_ROLE_MISMATCH'
        })
      }
      assertCanAssignRole(
        actor,
        input.role,
        tenant,
        schoolIds,
        programIds,
        input.role === 'student'
      )

      const existing = await this.users
        .findOne({
          $or: [
            { email: input.email.toLowerCase() },
            ...(linkedStudentId ? [{ studentId: linkedStudentId }] : [])
          ]
        })
        .session(session ?? null)
        .exec()
      if (existing) {
        throw new ConflictException({ code: 'USER_EMAIL_EXISTS' })
      }

      const [user] = await this.users.create(
        [
          {
            oidcSubject: `local:${input.email.toLowerCase()}`,
            email: input.email.toLowerCase(),
            displayName: input.displayName,
            status: input.status || 'active',
            ...(linkedStudentId ? { studentId: linkedStudentId } : {}),
            roleAssignments: [
              {
                role: input.role,
                tenant,
                schoolIds,
                programIds,
                active: true
              }
            ]
          }
        ],
        { session }
      )
      if (!user) throw new Error('User creation returned no record')

      await this.auditService.record(
        {
          requestId,
          actorId: actor.id,
          actorEmail: actor.email,
          action: 'users.created',
          route: 'POST /api/v2/users',
          method: 'POST',
          resourceScopes: resourceScopesFromRoleAssignments([
            { role: input.role, tenant, schoolIds, programIds }
          ]),
          metadata: {
            targetUserId: user.id,
            actorRoles: actor.roles,
            actorScope: actor.scope,
            roleAssignments: [
              { role: input.role, tenant, schoolIds, programIds }
            ]
          }
        },
        session
      )

      return this.serializeUser(user)
    })
  }

  public async updateUser(
    actor: AuthenticatedActor,
    id: string,
    input: UpdateUserInput,
    requestId: string
  ): Promise<unknown> {
    await this.ensureActiveAdminMutex()
    return this.withUserMutation(async (session) => {
      const user = await this.users
        .findOne({ $and: [{ _id: id }, userManagementScope(actor)] })
        .session(session ?? null)
        .exec()
      if (!user) {
        throw new NotFoundException({ code: 'RESOURCE_NOT_FOUND' })
      }
      this.assertCanManageEntireUser(actor, user)
      const roleAssignmentsBefore = user.roleAssignments.map((assignment) => ({
        role: assignment.role,
        tenant: assignment.tenant,
        schoolIds: [...assignment.schoolIds],
        programIds: [...assignment.programIds],
        active: assignment.active
      }))

      if (input.email && input.email.toLowerCase() !== user.email) {
        const existing = await this.users
          .findOne({ email: input.email.toLowerCase(), _id: { $ne: id } })
          .session(session ?? null)
          .exec()
        if (existing) {
          throw new ConflictException({ code: 'USER_EMAIL_EXISTS' })
        }
        if (user.studentId) {
          const linkedStudent = await this.students
            .findOne({ studentId: user.studentId, status: 'active' })
            .session(session ?? null)
            .exec()
          if (
            linkedStudent?.email &&
            linkedStudent.email.toLowerCase() !== input.email.toLowerCase()
          ) {
            throw new UnprocessableEntityException({
              code: 'STUDENT_EMAIL_MISMATCH'
            })
          }
        }
        user.email = input.email.toLowerCase()
      }

      if (input.displayName) user.displayName = input.displayName
      if (input.status) {
        await this.assertSystemAdministratorRemainsActive(
          user,
          input.status,
          session
        )
        user.status = input.status
      }
      if (input.studentId !== undefined) {
        if (!isSystemAdministrator(actor)) {
          throw new ConflictException({ code: 'STUDENT_LINK_MANAGED_BY_ADMIN' })
        }
        const student = await this.students
          .findOne({ studentId: input.studentId, status: 'active' })
          .session(session ?? null)
          .exec()
        if (!student) {
          throw new NotFoundException({ code: 'STUDENT_NOT_FOUND' })
        }
        if (
          !user.roleAssignments.some(
            (assignment) => assignment.active && assignment.role === 'student'
          )
        ) {
          throw new UnprocessableEntityException({
            code: 'STUDENT_LINK_ROLE_MISMATCH'
          })
        }
        if (student.email.toLowerCase() !== user.email.toLowerCase()) {
          throw new UnprocessableEntityException({
            code: 'STUDENT_EMAIL_MISMATCH'
          })
        }
        const duplicateLink = await this.users
          .findOne({ studentId: input.studentId, _id: { $ne: user.id } })
          .session(session ?? null)
          .exec()
        if (duplicateLink) {
          throw new ConflictException({ code: 'STUDENT_ACCOUNT_EXISTS' })
        }
        user.studentId = input.studentId
        const studentAssignment = user.roleAssignments.find(
          (assignment) => assignment.active && assignment.role === 'student'
        )
        if (studentAssignment) {
          studentAssignment.schoolIds = [student.schoolId]
          studentAssignment.programIds = [student.programId]
        }
      }

      if (input.role) {
        await this.assertSystemAdministratorRemainsActive(
          user,
          input.role,
          session
        )
        const schoolIds = [
          ...(input.schoolIds ?? user.roleAssignments[0]?.schoolIds ?? [])
        ]
        const programIds = [
          ...(input.programIds ?? user.roleAssignments[0]?.programIds ?? [])
        ]
        const tenant =
          input.role === 'systemAdmin' ||
          (input.role === 'internshipStaff' && isSystemAdministrator(actor))
        if (input.role === 'student') {
          if (!user.studentId) {
            throw new UnprocessableEntityException({
              code: 'STUDENT_LINK_REQUIRED'
            })
          }
          const student = await this.students
            .findOne({ studentId: user.studentId, status: 'active' })
            .session(session ?? null)
            .exec()
          if (!student) {
            throw new NotFoundException({ code: 'STUDENT_NOT_FOUND' })
          }
          if (student.email.toLowerCase() !== user.email.toLowerCase()) {
            throw new UnprocessableEntityException({
              code: 'STUDENT_EMAIL_MISMATCH'
            })
          }
          schoolIds.splice(0, schoolIds.length, student.schoolId)
          programIds.splice(0, programIds.length, student.programId)
        }
        assertCanAssignRole(
          actor,
          input.role,
          tenant,
          schoolIds,
          programIds,
          input.role === 'student'
        )
        user.roleAssignments = [
          {
            role: input.role,
            tenant,
            schoolIds,
            programIds,
            active: true
          }
        ]
      } else if (
        input.schoolIds !== undefined ||
        input.programIds !== undefined
      ) {
        if (user.roleAssignments.length > 0 && user.roleAssignments[0]) {
          const assignment = user.roleAssignments[0]
          const schoolIds = input.schoolIds ?? assignment.schoolIds
          const programIds = input.programIds ?? assignment.programIds
          assertCanAssignRole(
            actor,
            assignment.role,
            assignment.tenant,
            schoolIds,
            programIds,
            assignment.role === 'student'
          )
          if (assignment.role === 'student' && user.studentId) {
            const student = await this.students
              .findOne({ studentId: user.studentId, status: 'active' })
              .session(session ?? null)
              .exec()
            if (
              !student ||
              schoolIds.some((id) => id !== student.schoolId) ||
              programIds.some((id) => id !== student.programId)
            ) {
              throw new UnprocessableEntityException({
                code: 'STUDENT_SCOPE_MISMATCH'
              })
            }
          }
          assignment.schoolIds = [...schoolIds]
          assignment.programIds = [...programIds]
        }
      }

      await user.save({ session })
      const roleAssignmentsAfter = user.roleAssignments.map((assignment) => ({
        role: assignment.role,
        tenant: assignment.tenant,
        schoolIds: [...assignment.schoolIds],
        programIds: [...assignment.programIds],
        active: assignment.active
      }))
      const roleAssignmentChanged =
        input.role !== undefined ||
        input.studentId !== undefined ||
        input.schoolIds !== undefined ||
        input.programIds !== undefined
      await this.auditService.record(
        {
          requestId,
          actorId: actor.id,
          actorEmail: actor.email,
          action: roleAssignmentChanged
            ? 'users.role_assignments.changed'
            : 'users.updated',
          route: 'PATCH /api/v2/users/:id',
          method: 'PATCH',
          resourceScopes: resourceScopesFromRoleAssignments([
            ...roleAssignmentsBefore,
            ...roleAssignmentsAfter
          ]),
          metadata: {
            targetUserId: user.id,
            actorRoles: actor.roles,
            actorScope: actor.scope,
            changedFields: Object.keys(input).sort(),
            roleAssignmentsBefore,
            roleAssignmentsAfter
          }
        },
        session
      )
      return this.serializeUser(user)
    })
  }

  public async deleteUser(
    actor: AuthenticatedActor,
    id: string,
    requestId: string
  ): Promise<void> {
    await this.ensureActiveAdminMutex()
    await this.withUserMutation(async (session) => {
      const user = await this.users
        .findOne({ $and: [{ _id: id }, userManagementScope(actor)] })
        .session(session ?? null)
        .exec()
      if (!user) {
        throw new NotFoundException({ code: 'RESOURCE_NOT_FOUND' })
      }
      this.assertCanManageEntireUser(actor, user)
      await this.assertSystemAdministratorRemainsActive(
        user,
        'archived',
        session
      )
      user.status = 'archived'
      await user.save({ session })
      const roleAssignments = user.roleAssignments.map((assignment) => ({
        role: assignment.role,
        tenant: assignment.tenant,
        schoolIds: [...assignment.schoolIds],
        programIds: [...assignment.programIds],
        active: assignment.active
      }))
      await this.auditService.record(
        {
          requestId,
          actorId: actor.id,
          actorEmail: actor.email,
          action: 'users.archived',
          route: 'DELETE /api/v2/users/:id',
          method: 'DELETE',
          resourceScopes: resourceScopesFromRoleAssignments(roleAssignments),
          metadata: {
            targetUserId: user.id,
            actorRoles: actor.roles,
            actorScope: actor.scope,
            previousStatus: 'active',
            roleAssignments
          }
        },
        session
      )
    })
  }

  private async assertSystemAdministratorRemainsActive(
    user: UserDocument,
    nextStatusOrRole: string,
    session?: ClientSession
  ): Promise<void> {
    const isActiveSystemAdmin =
      user.status === 'active' &&
      user.roleAssignments.some(
        (assignment) => assignment.active && assignment.role === 'systemAdmin'
      )
    const remainsAdmin =
      nextStatusOrRole === 'active' || nextStatusOrRole === 'systemAdmin'
    if (!isActiveSystemAdmin || remainsAdmin) return

    if (session) {
      const lock = await this.connection
        .collection<SystemInvariantRecord>('systemInvariants')
        .updateOne(
          { _id: ACTIVE_ADMIN_MUTEX_ID },
          { $inc: { revision: 1 } },
          { session }
        )
      if (lock.matchedCount !== 1) {
        throw new ServiceUnavailableException({
          code: 'SYSTEM_ADMIN_INVARIANT_UNAVAILABLE'
        })
      }
    }

    const remainingAdmin = await this.users
      .findOne({
        _id: { $ne: user.id },
        status: 'active',
        roleAssignments: {
          $elemMatch: { active: true, role: 'systemAdmin' }
        }
      })
      .select({ _id: 1 })
      .session(session ?? null)
      .lean()
      .exec()
    if (!remainingAdmin) {
      throw new ConflictException({ code: 'SYSTEM_ADMIN_TRANSFER_REQUIRED' })
    }
  }

  private async ensureActiveAdminMutex(): Promise<void> {
    const invariants =
      this.connection.collection<SystemInvariantRecord>('systemInvariants')
    try {
      await invariants.updateOne(
        { _id: ACTIVE_ADMIN_MUTEX_ID },
        { $setOnInsert: { revision: 0 } },
        { upsert: true }
      )
    } catch (error: unknown) {
      if (!isDuplicateKeyError(error)) throw error
      const exists = await invariants.findOne({ _id: ACTIVE_ADMIN_MUTEX_ID })
      if (!exists) throw error
    }
  }

  private withUserMutation<T>(
    operation: (session?: ClientSession) => Promise<T>
  ): Promise<T> {
    if (
      process.env.NODE_ENV === undefined ||
      process.env.NODE_ENV === 'development'
    ) {
      return operation()
    }
    return this.connection.transaction((session) => operation(session))
  }

  private assertCanManageEntireUser(
    actor: AuthenticatedActor,
    user: UserDocument
  ): void {
    if (isSystemAdministrator(actor)) return
    if (
      user.roleAssignments.length !== 1 ||
      !roleAssignmentWithinScope(actor, user.roleAssignments[0]!, 'manage')
    ) {
      throw new ConflictException({
        code: 'ROLE_ASSIGNMENT_SCOPE_ADMIN_REQUIRED'
      })
    }
  }

  private serializeUser(user: UserDocument): Readonly<Record<string, unknown>> {
    const result = user.toJSON() as unknown as Record<string, unknown>
    delete result.oidcSubject
    delete result.oidcIssuer
    delete result.oidcLinkIdempotencyScopeKey
    delete result.oidcLinkRequestHash
    delete result.__v
    delete result._id
    return result
  }
}
