import type { AuthenticatedActor } from '@internship/shared-types'
import type { Model } from 'mongoose'
import { describe, expect, it, vi } from 'vitest'

import type { AcademicTermRecord } from '../src/academic/academic.schema.js'
import { AcademicService } from '../src/academic/academic.service.js'

const actor: AuthenticatedActor = {
  id: 'staff-1',
  email: 'staff@mfu.ac.th',
  displayName: 'Internship Staff',
  roles: ['internshipStaff'],
  scope: { tenant: true, schoolIds: [], programIds: [] }
}

const currentTerm = {
  _id: '64b000000000000000000001',
  __v: 7,
  startsAt: new Date('2026-01-01T00:00:00.000Z'),
  endsAt: new Date('2026-12-31T23:59:59.000Z')
}

const findByIdResult = (value: unknown): { exec: () => Promise<unknown> } => ({
  exec: vi.fn().mockResolvedValue(value)
})

function serviceWith(terms: object): AcademicService {
  return new AcademicService(
    {
      db: {
        transaction: (operation: (session: object) => Promise<unknown>) =>
          operation({})
      }
    } as never,
    {} as never,
    {} as never,
    terms as Model<AcademicTermRecord>,
    { record: vi.fn().mockResolvedValue(undefined) } as never
  )
}

describe('academic term updates', () => {
  it('rejects tenant academic writes when multi-role scope metadata is missing', async () => {
    const create = vi.fn()
    const service = serviceWith({ create })
    const ambiguousActor: AuthenticatedActor = {
      ...actor,
      roles: ['internshipStaff', 'coordinator'],
      scope: { tenant: true, schoolIds: [], programIds: [] },
      roleScopes: undefined
    }

    await expect(
      service.createTerm(ambiguousActor, {} as never)
    ).rejects.toMatchObject({ status: 403 })
    expect(create).not.toHaveBeenCalled()
  })

  it('rejects a partial date update that would invert the stored date range', async () => {
    const findByIdAndUpdate = vi.fn(() => ({
      exec: vi.fn().mockResolvedValue({ toJSON: () => ({ saved: true }) })
    }))
    const findById = vi.fn(() => findByIdResult(currentTerm))
    const service = serviceWith({ findByIdAndUpdate, findById })

    await expect(
      service.updateTerm(actor, currentTerm._id, {
        startsAt: new Date('2027-01-01T00:00:00.000Z')
      })
    ).rejects.toMatchObject({
      status: 422,
      response: { code: 'ACADEMIC_TERM_DATE_RANGE_INVALID' }
    })
    expect(findByIdAndUpdate).not.toHaveBeenCalled()
  })

  it('guards a valid one-sided date change atomically against the stored opposite date', async () => {
    let updateFilter: unknown
    const updateResult = (): { exec: () => Promise<unknown> } => ({
      exec: vi.fn().mockResolvedValue({ toJSON: () => ({ saved: true }) })
    })
    const findOneAndUpdate = vi.fn((filter: unknown) => {
      updateFilter = filter
      return updateResult()
    })
    const service = serviceWith({
      findOneAndUpdate,
      findByIdAndUpdate: vi.fn(updateResult),
      findById: vi.fn(() => findByIdResult(currentTerm))
    })

    await expect(
      service.updateTerm(actor, currentTerm._id, {
        startsAt: new Date('2026-02-01T00:00:00.000Z')
      })
    ).resolves.toEqual({ saved: true })
    expect(updateFilter).toMatchObject({
      _id: currentTerm._id,
      startsAt: currentTerm.startsAt,
      endsAt: currentTerm.endsAt,
      __v: 7
    })
  })

  it('fails closed when an archive check cannot inspect cycle and placement references', async () => {
    const findOneAndUpdate = vi.fn(() => ({
      exec: vi.fn().mockResolvedValue({ toJSON: () => ({ saved: true }) })
    }))
    const service = serviceWith({
      findById: vi.fn(() => findByIdResult(currentTerm)),
      findOneAndUpdate
    })

    await expect(
      service.updateTerm(actor, currentTerm._id, { status: 'archived' })
    ).rejects.toMatchObject({
      status: 503,
      response: { code: 'ACADEMIC_TERM_ARCHIVE_GUARD_UNAVAILABLE' }
    })
    expect(findOneAndUpdate).not.toHaveBeenCalled()
  })

  it('rejects a stale date update if another request changed the term first', async () => {
    const findById = vi
      .fn()
      .mockReturnValueOnce(findByIdResult(currentTerm))
      .mockReturnValueOnce(findByIdResult(currentTerm))
    const service = serviceWith({
      findById,
      findOneAndUpdate: vi.fn(() => ({
        exec: vi.fn().mockResolvedValue(null)
      })),
      exists: vi.fn(() => ({
        session: vi.fn().mockReturnThis(),
        exec: vi.fn().mockResolvedValue({ _id: currentTerm._id })
      })),
      findByIdAndUpdate: vi.fn(() => ({
        exec: vi.fn().mockResolvedValue(null)
      }))
    })

    await expect(
      service.updateTerm(actor, currentTerm._id, {
        endsAt: new Date('2026-11-30T23:59:59.000Z')
      })
    ).rejects.toMatchObject({
      status: 409,
      response: { code: 'ACADEMIC_TERM_CHANGED' }
    })
  })
})
