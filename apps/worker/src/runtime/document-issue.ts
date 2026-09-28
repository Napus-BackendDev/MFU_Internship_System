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

export async function persistDocumentIssue(
  models: WorkerModels,
  document: DocumentIssueSource,
  objectKey: string,
  sha256: string
): Promise<void> {
  const session = await models.GeneratedDocument.db.startSession()
  try {
    await session.withTransaction(async () => {
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
        { session }
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
        { session }
      )
    })
  } finally {
    await session.endSession()
  }
}
