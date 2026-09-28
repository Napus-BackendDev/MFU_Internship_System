import { ZodError } from 'zod'
import { describe, expect, it, vi } from 'vitest'

import type { AuthenticatedRequest } from '../src/common/http.js'
import type { MembersService } from '../src/members/members.service.js'
import { MembersController } from '../src/members/members.controller.js'
import type { StudentImportService } from '../src/members/student-import.service.js'

describe('Student directory query contract', () => {
  it('parses display-year and semester filters before calling the service', async () => {
    const actor = { id: 'staff-1' }
    const listStudents = vi.fn().mockResolvedValue({ items: [], meta: {} })
    const controller = new MembersController(
      { listStudents } as unknown as MembersService,
      {} as StudentImportService
    )

    await controller.listStudents({ actor } as AuthenticatedRequest, {
      page: '2',
      pageSize: '10',
      academicYear: '2571',
      semester: '  ภาคการศึกษาต้น  '
    })

    expect(listStudents).toHaveBeenCalledWith(actor, {
      page: 2,
      pageSize: 10,
      includeDirectoryData: false,
      academicYear: 2571,
      semester: 'ภาคการศึกษาต้น'
    })
  })

  it('accepts exact directory status filters for server-side paging', async () => {
    const actor = { id: 'staff-1' }
    const listStudents = vi.fn().mockResolvedValue({ items: [], meta: {} })
    const controller = new MembersController(
      { listStudents } as unknown as MembersService,
      {} as StudentImportService
    )

    await controller.listStudents({ actor } as AuthenticatedRequest, {
      cycleId: '507f1f77bcf86cd799439011',
      evaluationStatus: 'inProgress'
    })

    expect(listStudents).toHaveBeenCalledWith(
      actor,
      expect.objectContaining({
        cycleId: '507f1f77bcf86cd799439011',
        evaluationStatus: 'inProgress'
      })
    )
  })

  it('enables scope-bound directory summaries only when requested', async () => {
    const actor = { id: 'staff-1' }
    const listStudents = vi.fn().mockResolvedValue({ items: [], meta: {} })
    const controller = new MembersController(
      { listStudents } as unknown as MembersService,
      {} as StudentImportService
    )

    await controller.listStudents({ actor } as AuthenticatedRequest, {
      page: '1',
      pageSize: '5',
      includeDirectoryData: 'true',
      cycleId: '507f1f77bcf86cd799439011'
    })

    expect(listStudents).toHaveBeenCalledWith(
      actor,
      expect.objectContaining({
        page: 1,
        pageSize: 5,
        includeDirectoryData: true,
        cycleId: '507f1f77bcf86cd799439011'
      })
    )
  })

  it('rejects invalid display-year and blank semester values', () => {
    const listStudents = vi.fn()
    const controller = new MembersController(
      { listStudents } as unknown as MembersService,
      {} as StudentImportService
    )
    const request = { actor: { id: 'staff-1' } } as AuthenticatedRequest

    expect(() =>
      controller.listStudents(request, { academicYear: '1900' })
    ).toThrow(ZodError)
    expect(() => controller.listStudents(request, { semester: '   ' })).toThrow(
      ZodError
    )
    expect(listStudents).not.toHaveBeenCalled()
  })
})
