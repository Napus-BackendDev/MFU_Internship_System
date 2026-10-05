import type { ClientSession } from 'mongoose'
import type { WorkerModels } from './models.js'

interface DocumentAuditScope {
  readonly tenant?: boolean | undefined
  readonly schoolIds?: readonly string[] | undefined
  readonly programIds?: readonly string[] | undefined
}

export interface DocumentIssueSource {
  readonly id: string
  readonly studentId: string
  readonly templateVersionId: string
  readonly evaluationIds: readonly string[]
  readonly requestedBy?: string | null | undefined
  readonly requestedByEmail?: string | null | undefined
  readonly requestId?: string | null | undefined
  readonly processingToken: string
  readonly resourceScopes?: readonly DocumentAuditScope[] | null | undefined
}

interface MongoErrorLike {
  readonly code?: number | string | undefined
  readonly codeName?: string | undefined
  readonly message?: string | undefined
  readonly originalError?: {
    readonly code?: number | string | undefined
    readonly codeName?: string | undefined
    readonly message?: string | undefined
  } | undefined
}

function isUnsupportedTransactionError(error: unknown): boolean {
  if (typeof error !== 'object' || error === null) {
    return false
  }
  const candidate = error as MongoErrorLike
  const code = candidate.code ?? candidate.originalError?.code
  const codeName = candidate.codeName ?? candidate.originalError?.codeName
  const message = `${candidate.message ?? ''} ${candidate.originalError?.message ?? ''}`

  return (
    code === 20 ||
    code === '20' ||
    codeName === 'IllegalOperation' ||
    message.includes(
      'Transaction numbers are only allowed on a replica set member'
    ) ||
    message.includes('Transaction numbers are only allowed') ||
    message.includes('does not support retryable writes')
  )
}

export async function persistDocumentIssue(
  models: WorkerModels,
  document: DocumentIssueSource,
  objectKey: string,
  sha256: string
): Promise<void> {
  const db = models.GeneratedDocument.db
  const execute = async (session?: ClientSession): Promise<void> => {
    const update = await models.GeneratedDocument.updateOne(
      {
        _id: document.id,
        status: 'processing',
        processingToken: document.processingToken
      },
      {
        $set: { status: 'ready', objectKey, sha256 },
        $unset: {
          processingStartedAt: 1,
          processingLeaseUntil: 1,
          processingToken: 1
        }
      },
      session ? { session } : {}
    )
    if (update.matchedCount !== 1) {
      throw new Error('DOCUMENT_STATUS_CHANGED')
    }
    await models.AuditLog.create(
      [
        {
          requestId: document.requestId ?? `document:${document.id}`,
          actorId: document.requestedBy ?? 'legacy-unknown',
          actorEmail: document.requestedByEmail ?? 'legacy-unknown',
          action: 'documents.issued',
          route: 'worker:document-processor',
          method: 'JOB',
          outcome: 'success',
          ...(document.resourceScopes
            ? {
                resourceScopes: document.resourceScopes.map((scope) => ({
                  ...scope,
                  ...(scope.schoolIds
                    ? { schoolIds: [...scope.schoolIds] }
                    : {}),
                  ...(scope.programIds
                    ? { programIds: [...scope.programIds] }
                    : {})
                }))
              }
            : {}),
          metadata: {
            documentId: document.id,
            studentId: document.studentId,
            templateVersionId: document.templateVersionId,
            evaluationIds: [...document.evaluationIds],
            objectKey,
            sha256
          }
        }
      ],
      session ? { session } : {}
    )
  }

  let session: ClientSession | undefined
  try {
    session = await db.startSession()
    try {
      await session.withTransaction(async () => {
        await execute(session)
      })
      return
    } finally {
      await session.endSession().catch(() => undefined)
    }
  } catch (error: unknown) {
    if (isUnsupportedTransactionError(error)) {
      await execute()
      return
    }
    throw error
  }
}

