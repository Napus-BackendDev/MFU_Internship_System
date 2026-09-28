import { describe, expect, it, vi } from 'vitest'

import { loadItemsOrEmpty } from '../app/utils/load-items-or-empty'

describe('loadItemsOrEmpty', () => {
  it('preserves a successful API response', async () => {
    const response = { items: [{ id: 'student-1' }] }
    const onError = vi.fn()

    await expect(loadItemsOrEmpty(async () => response, onError)).resolves.toBe(
      response
    )
    expect(onError).not.toHaveBeenCalled()
  })

  it('returns no invented rows and records an API failure', async () => {
    const onError = vi.fn()

    await expect(
      loadItemsOrEmpty(
        async () => Promise.reject(new Error('API unavailable')),
        onError
      )
    ).resolves.toEqual({ items: [] })
    expect(onError).toHaveBeenCalledOnce()
  })
})
