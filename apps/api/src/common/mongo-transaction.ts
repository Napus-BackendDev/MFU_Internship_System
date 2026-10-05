import type { ClientSession } from 'mongoose'

export interface SessionFactory {
  startSession: () => Promise<ClientSession>
}

export function isUnsupportedTransactionError(error: unknown): boolean {
  if (typeof error !== 'object' || error === null) return false
  const err = error as {
    code?: number
    message?: string
    originalError?: { code?: number; message?: string }
  }
  if (err.code === 20 || err.originalError?.code === 20) return true
  const message = `${err.message ?? ''} ${err.originalError?.message ?? ''}`
  return (
    message.includes('Transaction numbers are only allowed') ||
    message.includes('does not support retryable writes')
  )
}

export async function runWithTransaction<T>(
  target: SessionFactory,
  operation: (session?: ClientSession) => Promise<T>,
  options?: Parameters<ClientSession['withTransaction']>[1]
): Promise<T> {
  if (
    process.env.NODE_ENV === undefined ||
    process.env.NODE_ENV === 'development' ||
    typeof target?.startSession !== 'function'
  ) {
    return operation(undefined)
  }

  let session: ClientSession | undefined
  try {
    session = await target.startSession()
    let result: T | undefined
    await session.withTransaction(async () => {
      result = await operation(session)
    }, options)
    return result!
  } catch (error: unknown) {
    if (isUnsupportedTransactionError(error)) {
      return operation(undefined)
    }
    throw error
  } finally {
    if (session) {
      await session.endSession().catch(() => undefined)
    }
  }
}
