import { ZodError } from 'zod'
import { describe, expect, it, vi } from 'vitest'

import type { AuthenticatedRequest } from '../src/common/http.js'
import type { MembersService } from '../src/members/members.service.js'
import type { StudentImportService } from '../src/members/student-import.service.js'
import { MembersController } from '../src/members/members.controller.js'

describe('MembersController page-bounded relation lookups', () => {
  it('validates completion revision, actual timestamp, reason and rejects unknown fields', async () => {
    const completePlacement = vi.fn().mockResolvedValue({ status: 'completed' })
    const controller = new MembersController(
      { completePlacement } as unknown as MembersService,
      {} as StudentImportService
    )
    const request = {
      actor: { id: 'staff-1' },
      requestId: 'completion-request'
    } as AuthenticatedRequest
    const command = {
      expectedRevision: 0,
      actualEndsAt: '2026-10-15T00:00:00Z',
      reason: ' ตรวจรับแล้ว '
    }
    await controller.completePlacement(request, 'a'.repeat(24), command)
    expect(completePlacement).toHaveBeenCalledWith(
      request.actor,
      'a'.repeat(24),
      {
        ...command,
        actualEndsAt: new Date(command.actualEndsAt),
        reason: 'ตรวจรับแล้ว'
      },
      'completion-request'
    )
    for (const invalid of [
      { ...command, expectedRevision: -1 },
      { ...command, expectedRevision: 0.5 },
      { ...command, actualEndsAt: 'invalid' },
      { ...command, reason: ' ' },
      { ...command, status: 'completed' }
    ]) {
      expect(() =>
        controller.completePlacement(request, 'a'.repeat(24), invalid)
      ).toThrow(ZodError)
    }
  })
  it('parses Student references and Organization/Evaluator ObjectId filters', async () => {
    const listStudents = vi.fn().mockResolvedValue({ items: [] })
    const listOrganizations = vi.fn().mockResolvedValue({ items: [] })
    const listEvaluators = vi.fn().mockResolvedValue({ items: [] })
    const controller = new MembersController(
      {
        listStudents,
        listOrganizations,
        listEvaluators
      } as unknown as MembersService,
      {} as StudentImportService
    )
    const actor = { id: 'staff-1' }
    const request = { actor } as AuthenticatedRequest
    const studentObjectId = 'A'.repeat(24)
    const organizationId = 'B'.repeat(24)
    const evaluatorId = 'C'.repeat(24)

    await controller.listStudents(request, {
      studentIds: `${studentObjectId},65300000001,${studentObjectId}`
    })
    await controller.listOrganizations(request, {
      organizationIds: organizationId
    })
    await controller.listEvaluators(request, { evaluatorIds: evaluatorId })

    expect(listStudents).toHaveBeenCalledWith(
      actor,
      expect.objectContaining({
        studentIds: [studentObjectId.toLowerCase(), '65300000001']
      })
    )
    expect(listOrganizations).toHaveBeenCalledWith(
      actor,
      expect.objectContaining({
        organizationIds: [organizationId.toLowerCase()]
      })
    )
    expect(listEvaluators).toHaveBeenCalledWith(
      actor,
      expect.objectContaining({ evaluatorIds: [evaluatorId.toLowerCase()] })
    )
  })

  it('rejects malformed, excessive, and empty relation ID filters', () => {
    const controller = new MembersController(
      {
        listStudents: vi.fn(),
        listOrganizations: vi.fn(),
        listEvaluators: vi.fn()
      } as unknown as MembersService,
      {} as StudentImportService
    )
    const request = { actor: { id: 'staff-1' } } as AuthenticatedRequest

    expect(() =>
      controller.listStudents(request, { studentIds: 'ab' })
    ).toThrow(ZodError)
    expect(() =>
      controller.listOrganizations(request, { organizationIds: 'not-an-id' })
    ).toThrow(ZodError)
    expect(() =>
      controller.listEvaluators(request, {
        evaluatorIds: Array.from({ length: 101 }, () => 'a'.repeat(24)).join(
          ','
        )
      })
    ).toThrow(ZodError)
  })
})
