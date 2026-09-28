import { ZodError } from 'zod'
import { describe, expect, it, vi } from 'vitest'

import type { AuthenticatedRequest } from '../src/common/http.js'
import type { AcademicService } from '../src/academic/academic.service.js'
import { AcademicController } from '../src/academic/academic.controller.js'

describe('AcademicController course creation contract', () => {
  it('rejects a missing or blank course code instead of inventing master data', () => {
    const createCourse = vi.fn()
    const controller = new AcademicController({
      createCourse
    } as unknown as AcademicService)
    const request = {
      actor: { id: 'staff-1' },
      requestId: 'request-1'
    } as AuthenticatedRequest

    expect(() =>
      controller.createCourse(request, {
        programIds: [],
        name: { th: 'หลักสูตรทดสอบ', en: 'Test program' }
      })
    ).toThrow(ZodError)
    expect(() =>
      controller.createCourse(request, {
        courseCode: '   ',
        programIds: [],
        name: { th: 'หลักสูตรทดสอบ', en: 'Test program' }
      })
    ).toThrow(ZodError)
    expect(createCourse).not.toHaveBeenCalled()
  })

  it('trims a supplied course code and applies the optional program default', async () => {
    const createCourse = vi.fn().mockResolvedValue({ id: 'course-1' })
    const controller = new AcademicController({
      createCourse
    } as unknown as AcademicService)
    const actor = { id: 'staff-1' }
    const request = { actor, requestId: 'request-1' } as AuthenticatedRequest

    await expect(
      controller.createCourse(request, {
        courseCode: '  SWE491  ',
        name: { th: 'หลักสูตรทดสอบ', en: 'Test program' }
      })
    ).resolves.toEqual({ id: 'course-1' })
    expect(createCourse).toHaveBeenCalledWith(
      actor,
      expect.objectContaining({ courseCode: 'SWE491', programIds: [] }),
      'request-1'
    )
  })
})

describe('AcademicController program lookup contract', () => {
  it('parses a bounded comma-separated Program ID filter', async () => {
    const listPrograms = vi.fn().mockResolvedValue({ items: [] })
    const controller = new AcademicController({
      listPrograms
    } as unknown as AcademicService)
    const actor = { id: 'staff-1' }
    const request = { actor } as AuthenticatedRequest
    const programIds = ['a'.repeat(24), 'b'.repeat(24)]

    await controller.listPrograms(request, {
      page: '1',
      pageSize: '25',
      schoolId: 'school-1',
      programIds: programIds.join(',')
    })

    expect(listPrograms).toHaveBeenCalledWith(
      actor,
      {
        page: 1,
        pageSize: 25,
        schoolId: 'school-1',
        programIds
      },
      'school-1',
      programIds
    )
  })

  it('rejects malformed and excessive Program ID filters', () => {
    const controller = new AcademicController({
      listPrograms: vi.fn()
    } as unknown as AcademicService)
    const request = { actor: { id: 'staff-1' } } as AuthenticatedRequest

    expect(() =>
      controller.listPrograms(request, { programIds: 'not-an-object-id' })
    ).toThrow(ZodError)
    expect(() =>
      controller.listPrograms(request, {
        programIds: Array.from({ length: 101 }, () => 'a'.repeat(24)).join(',')
      })
    ).toThrow(ZodError)
  })
})

describe('AcademicController bounded reference lookups', () => {
  it('parses the scoped School search and ID filters', async () => {
    const listSchools = vi.fn().mockResolvedValue({ items: [] })
    const controller = new AcademicController({
      listSchools
    } as unknown as AcademicService)
    const actor = { id: 'staff-1' }
    const request = { actor } as AuthenticatedRequest
    const schoolId = 'A'.repeat(24)

    await controller.listSchools(request, {
      page: '2',
      pageSize: '25',
      search: '  SCI ',
      schoolIds: `${schoolId},${schoolId.toLowerCase()}`,
      archived: 'false'
    })

    expect(listSchools).toHaveBeenCalledWith(
      actor,
      { page: 2, pageSize: 25 },
      { search: 'SCI', schoolIds: [schoolId.toLowerCase()], archived: false }
    )
  })

  it('rejects malformed or excessive School ID filters', () => {
    const controller = new AcademicController({
      listSchools: vi.fn()
    } as unknown as AcademicService)
    const request = { actor: { id: 'staff-1' } } as AuthenticatedRequest

    expect(() =>
      controller.listSchools(request, { schoolIds: 'not-an-object-id' })
    ).toThrow(ZodError)
    expect(() =>
      controller.listSchools(request, {
        schoolIds: Array.from({ length: 101 }, () => 'a'.repeat(24)).join(',')
      })
    ).toThrow(ZodError)
  })

  it('parses term search, archived filter, and bounded Term IDs', async () => {
    const listTerms = vi.fn().mockResolvedValue({ items: [] })
    const controller = new AcademicController({
      listTerms
    } as unknown as AcademicService)
    const actor = { id: 'staff-1' }
    const request = { actor } as AuthenticatedRequest
    const termId = 'B'.repeat(24)

    await controller.listTerms(request, {
      page: '1',
      pageSize: '25',
      academicYear: '2569',
      search: ' 1/2569 ',
      termIds: termId,
      archived: 'true'
    })

    expect(listTerms).toHaveBeenCalledWith(
      actor,
      { page: 1, pageSize: 25 },
      2569,
      { search: '1/2569', termIds: [termId.toLowerCase()], archived: true }
    )
  })
})
