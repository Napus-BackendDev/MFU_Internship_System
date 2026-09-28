import { describe, expect, it, vi } from 'vitest'

import { persistDocumentIssue } from '../src/runtime/document-issue.js'
import type { WorkerModels } from '../src/runtime/models.js'

const document = {
  id: 'document-1',
  studentId: 'student-record-1',
  templateVersionId: 'template-version-1',
  evaluationIds: ['evaluation-1'],
  requestedBy: 'staff-1',
  requestedByEmail: 'staff@example.test',
  requestId: 'request-document-1',
  processingToken: 'processing-token-1',
  resourceScopes: [{ schoolIds: ['school-a'], programIds: ['program-a'] }]
}

function createModels(
  auditWrite: ReturnType<typeof vi.fn> = vi.fn().mockResolvedValue([])
): {
  readonly models: WorkerModels
  readonly session: {
    readonly withTransaction: ReturnType<typeof vi.fn>
    readonly endSession: ReturnType<typeof vi.fn>
  }
  readonly updateOne: ReturnType<typeof vi.fn>
  readonly auditWrite: ReturnType<typeof vi.fn>
} {
  const session = {
    withTransaction: vi.fn(async (operation: () => Promise<void>) => {
      await operation()
    }),
    endSession: vi.fn().mockResolvedValue(undefined)
  }
  const updateOne = vi.fn().mockResolvedValue({ matchedCount: 1 })
  const models = {
    GeneratedDocument: {
      db: { startSession: vi.fn().mockResolvedValue(session) },
      updateOne
    },
    AuditLog: { create: auditWrite }
  } as unknown as WorkerModels
  return { models, session, updateOne, auditWrite }
}

describe('document issue audit transaction', () => {
  it('commits ready status and issued audit in the same transaction', async () => {
    const { models, session, updateOne, auditWrite } = createModels()

    await persistDocumentIssue(
      models,
      document,
      'private/documents/a.pdf',
      'a'.repeat(64)
    )

    expect(session.withTransaction).toHaveBeenCalledTimes(1)
    expect(updateOne).toHaveBeenCalledWith(
      {
        _id: document.id,
        status: 'processing',
        processingToken: document.processingToken
      },
      {
        $set: {
          status: 'ready',
          objectKey: 'private/documents/a.pdf',
          sha256: 'a'.repeat(64)
        },
        $unset: {
          processingStartedAt: 1,
          processingLeaseUntil: 1,
          processingToken: 1
        }
      },
      { session }
    )
    const auditEntries: unknown = auditWrite.mock.calls[0]?.[0]
    expect(auditEntries).toMatchObject([
      {
        requestId: document.requestId,
        actorId: document.requestedBy,
        actorEmail: document.requestedByEmail,
        action: 'documents.issued',
        outcome: 'success',
        resourceScopes: document.resourceScopes,
        metadata: {
          documentId: document.id,
          evaluationIds: document.evaluationIds,
          sha256: 'a'.repeat(64)
        }
      }
    ])
    expect(auditWrite.mock.calls[0]?.[1]).toEqual({ session })
    expect(session.endSession).toHaveBeenCalledTimes(1)
  })

  it('fails the transaction if ready status cannot be updated', async () => {
    const { models, auditWrite, updateOne } = createModels()
    updateOne.mockResolvedValue({ matchedCount: 0 })

    await expect(
      persistDocumentIssue(
        models,
        document,
        'private/documents/a.pdf',
        'a'.repeat(64)
      )
    ).rejects.toThrow('DOCUMENT_STATUS_CHANGED')
    expect(auditWrite).not.toHaveBeenCalled()
  })

  it('propagates audit failure so MongoDB aborts the ready transition', async () => {
    const { models, auditWrite, session } = createModels(
      vi.fn().mockRejectedValue(new Error('audit write failed'))
    )

    await expect(
      persistDocumentIssue(
        models,
        document,
        'private/documents/a.pdf',
        'a'.repeat(64)
      )
    ).rejects.toThrow('audit write failed')
    expect(session.withTransaction).toHaveBeenCalledTimes(1)
    expect(auditWrite).toHaveBeenCalledTimes(1)
    expect(session.endSession).toHaveBeenCalledTimes(1)
  })
})
