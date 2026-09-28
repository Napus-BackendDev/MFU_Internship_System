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
