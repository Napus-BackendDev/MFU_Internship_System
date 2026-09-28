import { describe, expect, it, vi } from 'vitest'

import { retryAfterSessionRefresh } from '../app/composables/useApi'

describe('API session refresh retry', () => {
  it('replays the original request once after refresh succeeds', async () => {
    const originalError = { status: 401 }
    const refresh = vi.fn().mockResolvedValue(true)
    const retryRequest = vi.fn().mockResolvedValue({ revision: 1 })

    await expect(
      retryAfterSessionRefresh(originalError, refresh, retryRequest)
    ).resolves.toEqual({ revision: 1 })
    expect(refresh).toHaveBeenCalledOnce()
    expect(retryRequest).toHaveBeenCalledOnce()
  })

  it('preserves the original error and does not replay when refresh fails', async () => {
    const originalError = { status: 401 }
    const refresh = vi.fn().mockResolvedValue(false)
    const retryRequest = vi.fn()

    await expect(
      retryAfterSessionRefresh(originalError, refresh, retryRequest)
    ).rejects.toBe(originalError)
    expect(refresh).toHaveBeenCalledOnce()
    expect(retryRequest).not.toHaveBeenCalled()
  })

  it('propagates the retry response error instead of masking it with the first 401', async () => {
    const originalError = { status: 401 }
    const conflictError = { status: 409 }
    const refresh = vi.fn().mockResolvedValue(true)
    const retryRequest = vi.fn().mockRejectedValue(conflictError)

    await expect(
      retryAfterSessionRefresh(originalError, refresh, retryRequest)
    ).rejects.toBe(conflictError)
    expect(retryRequest).toHaveBeenCalledOnce()
  })
})
