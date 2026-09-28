import { ZodError } from 'zod'
import { describe, expect, it, vi } from 'vitest'

import { EvaluationsController } from '../src/evaluations/evaluations.controller.js'
import type { EvaluationsService } from '../src/evaluations/evaluations.service.js'
import type { AuthenticatedRequest } from '../src/common/http.js'

describe('EvaluationsController competency-set list contract', () => {
  it('parses bounded search and archived filter', async () => {
    const listCompetencySets = vi.fn().mockResolvedValue({ items: [] })
    const controller = new EvaluationsController({
      listCompetencySets
    } as unknown as EvaluationsService)
    const actor = { id: 'staff-1' }

    await controller.listCompetencySets({ actor } as AuthenticatedRequest, {
      page: '2',
      pageSize: '25',
      search: '  MFU-SET ',
      archived: 'false'
    })

    expect(listCompetencySets).toHaveBeenCalledWith(
      actor,
      { page: 2, pageSize: 25 },
      { search: 'MFU-SET', archived: false }
    )
  })

  it('rejects invalid archived query values', () => {
    const controller = new EvaluationsController({
      listCompetencySets: vi.fn()
    } as unknown as EvaluationsService)

    expect(() =>
      controller.listCompetencySets(
        { actor: { id: 'staff-1' } } as AuthenticatedRequest,
        { archived: 'no' }
      )
    ).toThrow(ZodError)
  })
})

describe('EvaluationsController bounded cycle lookups', () => {
  it('parses search, status, Term, and bounded Cycle IDs', async () => {
    const listCycles = vi.fn().mockResolvedValue({ items: [] })
    const controller = new EvaluationsController({
      listCycles
    } as unknown as EvaluationsService)
    const actor = { id: 'staff-1' }
    const cycleId = 'A'.repeat(24)
    const termId = 'B'.repeat(24)

    await controller.listCycles({ actor } as AuthenticatedRequest, {
      page: '3',
      pageSize: '25',
      search: '  1/2569 ',
      cycleIds: cycleId,
      termId,
      status: 'active'
    })

    expect(listCycles).toHaveBeenCalledWith(
      actor,
      {
        page: 3,
        pageSize: 25,
        search: '1/2569',
        cycleIds: [cycleId.toLowerCase()],
        termId,
        status: 'active'
      },
      {
        search: '1/2569',
        cycleIds: [cycleId.toLowerCase()],
        termId,
        status: 'active'
      }
    )
  })

  it('rejects malformed and excessive Cycle ID filters', () => {
    const controller = new EvaluationsController({
      listCycles: vi.fn()
    } as unknown as EvaluationsService)
    const request = { actor: { id: 'staff-1' } } as AuthenticatedRequest

    expect(() =>
      controller.listCycles(request, { cycleIds: 'not-an-object-id' })
    ).toThrow(ZodError)
    expect(() =>
      controller.listCycles(request, {
        cycleIds: Array.from({ length: 101 }, () => 'a'.repeat(24)).join(',')
      })
    ).toThrow(ZodError)
  })
})

describe('EvaluationsController assignment directory filters', () => {
  it('parses search and organization filters with assignment pagination', async () => {
    const listAssignments = vi.fn().mockResolvedValue({ items: [] })
    const controller = new EvaluationsController({
      listAssignments
    } as unknown as EvaluationsService)
    const actor = { id: 'staff-1' }
    const organizationId = 'A'.repeat(24)

    await controller.listAssignments({ actor } as AuthenticatedRequest, {
      page: '2',
      pageSize: '10',
      status: 'submitted',
      organizationId,
      search: '  TARGET  '
    })

    expect(listAssignments).toHaveBeenCalledWith(actor, {
      page: 2,
      pageSize: 10,
      status: 'submitted',
      organizationId: organizationId.toLowerCase(),
      search: 'TARGET'
    })
  })

  it('rejects malformed Organization IDs and excessive search terms', () => {
    const controller = new EvaluationsController({
      listAssignments: vi.fn()
    } as unknown as EvaluationsService)
    const request = { actor: { id: 'staff-1' } } as AuthenticatedRequest

    expect(() =>
      controller.listAssignments(request, { organizationId: 'not-an-id' })
    ).toThrow(ZodError)
    expect(() =>
      controller.listAssignments(request, { search: 'x'.repeat(101) })
    ).toThrow(ZodError)
  })
})
