import { describe, expect, it, vi } from 'vitest'

import { loadAllPages } from '../app/utils/load-all-pages'

describe('loadAllPages', () => {
  it('reads every server page and preserves deterministic order', async () => {
    const items = Array.from({ length: 1_001 }, (_, index) => ({
      id: `student-${index + 1}`
    }))
    const loadPage = vi.fn(async (page: number, pageSize: number) => ({
      items: items.slice((page - 1) * pageSize, page * pageSize),
      meta: { page, pageSize, total: items.length, totalPages: 3 }
    }))

    const result = await loadAllPages(loadPage, 500)

    expect(result.items).toHaveLength(1_001)
    expect(result.items[0]?.id).toBe('student-1')
    expect(result.items.at(-1)?.id).toBe('student-1001')
    expect(loadPage.mock.calls.map(([page]) => page)).toEqual([1, 2, 3])
  })

  it('loads all 165 Student records when the selector page size is 100', async () => {
    const items = Array.from({ length: 165 }, (_, index) => ({
      id: `student-${index + 1}`
    }))
    const loadPage = vi.fn(async (page: number, pageSize: number) => ({
      items: items.slice((page - 1) * pageSize, page * pageSize),
      meta: { page, pageSize, total: items.length, totalPages: 2 }
    }))

    const result = await loadAllPages(loadPage, 100)

    expect(result.items).toHaveLength(165)
    expect(result.items.at(-1)?.id).toBe('student-165')
    expect(loadPage.mock.calls.map(([page]) => page)).toEqual([1, 2])
  })

  it('fails closed when result count changes between pages', async () => {
    const loadPage = vi.fn(async (page: number, pageSize: number) => ({
      items:
        page === 1 ? [{ id: 'item-1' }, { id: 'item-2' }] : [{ id: 'item-3' }],
      meta: {
        page,
        pageSize,
        total: page === 1 ? 3 : 4,
        totalPages: 2
      }
    }))

    await expect(loadAllPages(loadPage, 2)).rejects.toThrow(
      'PAGINATED_LIST_CHANGED_DURING_READ'
    )
  })

  it('propagates page failures instead of returning partial reference data', async () => {
    const loadPage = vi.fn(async (page: number, pageSize: number) => {
      if (page === 2) throw new Error('REFERENCE_PAGE_UNAVAILABLE')
      return {
        items: [{ id: 'student-1' }],
        meta: { page, pageSize, total: 2, totalPages: 2 }
      }
    })

    await expect(loadAllPages(loadPage, 1)).rejects.toThrow(
      'REFERENCE_PAGE_UNAVAILABLE'
    )
  })

  it('rejects duplicate identities across pages', async () => {
    const loadPage = vi.fn(async (page: number, pageSize: number) => ({
      items: [{ id: 'same-record' }],
      meta: { page, pageSize, total: 2, totalPages: 2 }
    }))

    await expect(loadAllPages(loadPage, 1)).rejects.toThrow(
      'PAGINATED_LIST_ID_INVALID'
    )
  })

  it('accepts an empty list without requesting nonexistent pages', async () => {
    const loadPage = vi.fn(async (page: number, pageSize: number) => ({
      items: [],
      meta: { page, pageSize, total: 0, totalPages: 0 }
    }))

    await expect(loadAllPages(loadPage, 500)).resolves.toMatchObject({
      items: [],
      meta: { total: 0, totalPages: 0 }
    })
    expect(loadPage).toHaveBeenCalledOnce()
  })
})
