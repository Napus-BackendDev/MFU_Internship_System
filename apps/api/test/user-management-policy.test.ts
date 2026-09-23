import { describe, expect, it } from 'vitest'

import type { AuthenticatedActor } from '@internship/shared-types'
import {
  assertCanAssignRole,
  roleAssignmentWithinScope,
  userManagementScope
} from '../src/auth/user-management.policy.js'

const staff: AuthenticatedActor = {
  id: 'staff-user',
  email: 'staff@example.test',
  displayName: 'Scoped staff',
  roles: ['internshipStaff'],
  scope: { tenant: false, schoolIds: ['school-a'], programIds: ['program-a'] },
  roleScopes: [
    {
      role: 'internshipStaff',
      tenant: false,
      schoolIds: ['school-a'],
      programIds: ['program-a']
    }
  ]
}

describe('user management authorization', () => {
  it('allows only operational roles within one assigned scope', () => {
    expect(() =>
      assertCanAssignRole(
        staff,
        'coordinator',
        false,
        ['school-a'],
        ['program-a']
      )
    ).not.toThrow()
    expect(() =>
      assertCanAssignRole(staff, 'systemAdmin', true, [], [])
    ).toThrow()
    expect(() =>
      assertCanAssignRole(
        staff,
        'coordinator',
        false,
        ['school-b'],
        ['program-a']
      )
    ).toThrow()
    expect(() =>
      assertCanAssignRole(
        staff,
        'coordinator',
        true,
        ['school-a'],
        ['program-a']
      )
    ).toThrow()
  })

  it('requires a student school/program scope to fit the same staff assignment', () => {
    expect(() =>
      assertCanAssignRole(
        staff,
        'student',
        false,
        ['school-a'],
        ['program-b'],
        true
      )
    ).toThrow()
    expect(() =>
      assertCanAssignRole(
        staff,
        'student',
        false,
        ['school-a'],
        ['program-a'],
        true
      )
    ).not.toThrow()
    expect(() =>
      assertCanAssignRole(staff, 'coordinator', false, ['school-a'], [], false)
    ).toThrow()
  })

  it('does not combine unrelated role scopes to grant a larger scope', () => {
    const multiScopeActor: AuthenticatedActor = {
      ...staff,
      roleScopes: [
        {
          role: 'internshipStaff',
          tenant: false,
          schoolIds: ['school-a'],
          programIds: ['program-a']
        },
        {
          role: 'internshipStaff',
          tenant: false,
          schoolIds: ['school-b'],
          programIds: ['program-b']
        }
      ]
    }
    expect(() =>
      assertCanAssignRole(
        multiScopeActor,
        'coordinator',
        false,
        ['school-a'],
        ['program-b']
      )
    ).toThrow()
  })

  it('limits a student with users.read to their own account', () => {
    const student: AuthenticatedActor = {
      id: 'student-user',
      email: 'student@example.test',
      displayName: 'Student',
      roles: ['student'],
      scope: {
        tenant: false,
        schoolIds: ['school-a'],
        programIds: ['program-a'],
        studentId: 'student-number'
      }
    }
    expect(userManagementScope(student, 'read')).toEqual({
      _id: 'student-user'
    })
    expect(userManagementScope(student, 'manage')).toEqual({ _id: null })
  })

  it('excludes role assignments that span outside the actor scope', () => {
    expect(
      roleAssignmentWithinScope(
        staff,
        {
          role: 'coordinator',
          tenant: false,
          schoolIds: ['school-a', 'school-b'],
          programIds: ['program-a'],
          active: true
        },
        'read'
      )
    ).toBe(false)

    const query = JSON.stringify(userManagementScope(staff, 'read'))
    expect(query).toContain('"$setDifference"')
    expect(query).toContain('"school-a"')
    expect(query).toContain('"program-a"')
  })

  it('does not allow a tenant staff account to list users without explicit scope', () => {
    const tenantStaff: AuthenticatedActor = {
      ...staff,
      scope: { tenant: true, schoolIds: [], programIds: [] },
      roleScopes: [
        {
          role: 'internshipStaff',
          tenant: true,
          schoolIds: [],
          programIds: []
        }
      ]
    }
    expect(userManagementScope(tenantStaff, 'read')).toEqual({ _id: null })
  })
})
