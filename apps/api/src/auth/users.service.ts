import type { AuthenticatedActor, RoleKey } from '@internship/shared-types'
import {
  ConflictException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
  UnauthorizedException
} from '@nestjs/common'
import { InjectModel } from '@nestjs/mongoose'
import type { Model, QueryFilter } from 'mongoose'

import { paginate, type PaginationInput } from '../common/pagination.js'
import { boundedSearch } from '../common/search.js'
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

@Injectable()
export class UsersService {
  public constructor(
    @InjectModel(UserRecord.name)
    private readonly users: Model<UserRecord>,
    @InjectModel(StudentRecord.name)
    private readonly students: Model<StudentRecord>
  ) {}

  public async resolveOidcActor(input: {
    subject: string
    email: string
    displayName: string
    avatarUrl?: string
  }): Promise<AuthenticatedActor> {
    const existing = await this.users
      .findOne({ oidcSubject: input.subject })
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
        { _id: existing.id, oidcSubject: input.subject },
        {
          $set: {
            email,
            displayName: input.displayName,
            ...(input.avatarUrl ? { avatarUrl: input.avatarUrl } : {})
          }
        },
        { new: true }
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
      userManagementScope(actor, 'read')
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
    const [total, systemAdmin, internshipStaff, coordinator, student] =
      await Promise.all([
        this.users
          .countDocuments({ $and: [scope, { status: { $ne: 'archived' } }] })
          .exec(),
        this.users
          .countDocuments({
            $and: [
              scope,
              {
                'roleAssignments.role': 'systemAdmin',
                status: { $ne: 'archived' }
              }
            ]
          })
          .exec(),
        this.users
          .countDocuments({
            $and: [
              scope,
              {
                'roleAssignments.role': 'internshipStaff',
                status: { $ne: 'archived' }
              }
            ]
          })
          .exec(),
        this.users
          .countDocuments({
            $and: [
              scope,
              {
                'roleAssignments.role': 'coordinator',
                status: { $ne: 'archived' }
              }
            ]
          })
          .exec(),
        this.users
          .countDocuments({
            $and: [
              scope,
              {
                'roleAssignments.role': 'student',
                status: { $ne: 'archived' }
              }
            ]
          })
          .exec()
      ])

    return { total, systemAdmin, internshipStaff, coordinator, student }
  }

  public async createUser(
    actor: AuthenticatedActor,
    input: CreateUserInput
  ): Promise<unknown> {
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
        .exec()
      if (!student) {
        throw new NotFoundException({ code: 'STUDENT_NOT_FOUND' })
      }
      linkedStudentId = student.studentId
      const allowedEmails = [student.email, student.personalEmail]
        .filter((email): email is string => Boolean(email))
        .map((email) => email.toLowerCase())
      if (!allowedEmails.includes(input.email.toLowerCase())) {
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
      .exec()
    if (existing) {
      throw new ConflictException({ code: 'USER_EMAIL_EXISTS' })
    }

    const user = await this.users.create({
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
    })

    return this.serializeUser(user)
  }

  public async updateUser(
    actor: AuthenticatedActor,
    id: string,
    input: UpdateUserInput
  ): Promise<unknown> {
    const user = await this.users
      .findOne({ $and: [{ _id: id }, userManagementScope(actor)] })
      .exec()
    if (!user) {
      throw new NotFoundException({ code: 'RESOURCE_NOT_FOUND' })
    }
    this.assertCanManageEntireUser(actor, user)

    if (input.email && input.email.toLowerCase() !== user.email) {
      const existing = await this.users
        .findOne({ email: input.email.toLowerCase(), _id: { $ne: id } })
        .exec()
      if (existing) {
        throw new ConflictException({ code: 'USER_EMAIL_EXISTS' })
      }
      if (user.studentId) {
        const linkedStudent = await this.students
          .findOne({ studentId: user.studentId, status: 'active' })
          .exec()
        const allowedEmails = [
          linkedStudent?.email,
          linkedStudent?.personalEmail
        ]
          .filter((email): email is string => Boolean(email))
          .map((email) => email.toLowerCase())
        if (!allowedEmails.includes(input.email.toLowerCase())) {
          throw new UnprocessableEntityException({
            code: 'STUDENT_EMAIL_MISMATCH'
          })
        }
      }
      user.email = input.email.toLowerCase()
    }

    if (input.displayName) user.displayName = input.displayName
    if (input.status) {
      this.assertSystemAdministratorRemainsActive(user, input.status)
      user.status = input.status
    }
    if (input.studentId !== undefined) {
      if (!isSystemAdministrator(actor)) {
        throw new ConflictException({ code: 'STUDENT_LINK_MANAGED_BY_ADMIN' })
      }
      const student = await this.students
        .findOne({ studentId: input.studentId, status: 'active' })
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
      const allowedEmails = [student.email, student.personalEmail]
        .filter((email): email is string => Boolean(email))
        .map((email) => email.toLowerCase())
      if (!allowedEmails.includes(user.email.toLowerCase())) {
        throw new UnprocessableEntityException({
          code: 'STUDENT_EMAIL_MISMATCH'
        })
      }
      const duplicateLink = await this.users
        .findOne({ studentId: input.studentId, _id: { $ne: user.id } })
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
      this.assertSystemAdministratorRemainsActive(user, input.role)
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
          .exec()
        if (!student) {
          throw new NotFoundException({ code: 'STUDENT_NOT_FOUND' })
        }
        const allowedEmails = [student.email, student.personalEmail]
          .filter((email): email is string => Boolean(email))
          .map((email) => email.toLowerCase())
        if (!allowedEmails.includes(user.email.toLowerCase())) {
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

    await user.save()
    return this.serializeUser(user)
  }

  public async deleteUser(
    actor: AuthenticatedActor,
    id: string
  ): Promise<void> {
    const user = await this.users
      .findOne({ $and: [{ _id: id }, userManagementScope(actor)] })
      .exec()
    if (!user) {
      throw new NotFoundException({ code: 'RESOURCE_NOT_FOUND' })
    }
    this.assertCanManageEntireUser(actor, user)
    this.assertSystemAdministratorRemainsActive(user, 'archived')
    user.status = 'archived'
    await user.save()
  }

  private assertSystemAdministratorRemainsActive(
    user: UserDocument,
    nextStatusOrRole: string
  ): void {
    const isActiveSystemAdmin =
      user.status === 'active' &&
      user.roleAssignments.some(
        (assignment) => assignment.active && assignment.role === 'systemAdmin'
      )
    const remainsAdmin =
      nextStatusOrRole === 'active' || nextStatusOrRole === 'systemAdmin'
    if (isActiveSystemAdmin && !remainsAdmin) {
      throw new ConflictException({ code: 'SYSTEM_ADMIN_TRANSFER_REQUIRED' })
    }
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
    delete result.__v
    delete result._id
    return result
  }
}
