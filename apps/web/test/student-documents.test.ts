import { describe, expect, it } from 'vitest'

import {
  createStudentDocumentIdempotencyKey,
  findDocumentForEvaluationSet,
  getStudentDocumentState,
  resolvePublishedDocumentVersion
} from '../app/utils/student-documents.js'

describe('student generated-document state', () => {
  it('shows the newest processing state while retaining an older ready file', () => {
    const state = getStudentDocumentState(
      [
        {
          id: 'ready-transcript',
          documentType: 'transcript',
          status: 'ready',
          createdAt: '2026-09-01T00:00:00.000Z'
        },
        {
          id: 'processing-transcript',
          documentType: 'transcript',
          status: 'processing',
          createdAt: '2026-09-02T00:00:00.000Z'
        },
        {
          id: 'certificate',
          documentType: 'certificate',
          status: 'failed',
          createdAt: '2026-09-03T00:00:00.000Z'
        }
      ],
      'transcript'
    )

    expect(state.latest?.id).toBe('processing-transcript')
    expect(state.downloadable?.id).toBe('ready-transcript')
    expect(state.label).toBe('กำลังจัดทำ PDF')
  })

  it('does not enable download for a failed or missing document', () => {
    const failed = getStudentDocumentState(
      [
        {
          id: 'failed-certificate',
          documentType: 'certificate',
          status: 'failed',
          createdAt: '2026-09-02T00:00:00.000Z'
        }
      ],
      'certificate'
    )
    const missing = getStudentDocumentState([], 'transcript')

    expect(failed.downloadable).toBeNull()
    expect(failed.label).toBe('จัดทำ PDF ไม่สำเร็จ')
    expect(missing.latest).toBeNull()
    expect(missing.downloadable).toBeNull()
    expect(missing.label).toBe('ยังไม่มีเอกสารที่ออกแล้ว')
  })

  it('selects only one active template with a published version', () => {
    const candidates = [
      {
        templateId: 'inactive',
        documentType: 'certificate' as const,
        templateStatus: 'archived' as const,
        publishedVersionId: 'version-archived'
      },
      {
        templateId: 'draft-only',
        documentType: 'certificate' as const,
        templateStatus: 'active' as const,
        publishedVersionId: null
      },
      {
        templateId: 'published',
        documentType: 'certificate' as const,
        templateStatus: 'active' as const,
        publishedVersionId: 'version-1'
      }
    ]

    expect(resolvePublishedDocumentVersion(candidates, 'certificate')).toEqual({
      status: 'available',
      versionId: 'version-1'
    })
    expect(resolvePublishedDocumentVersion([], 'transcript')).toEqual({
      status: 'unavailable'
    })
    expect(
      resolvePublishedDocumentVersion(
        [
          ...candidates,
          {
            templateId: 'published-2',
            documentType: 'certificate',
            templateStatus: 'active',
            publishedVersionId: 'version-2'
          }
        ],
        'certificate'
      )
    ).toEqual({ status: 'ambiguous' })
  })

  it('matches existing requests by exact evaluation set, independent of order', () => {
    const documents = [
      {
        id: 'prior-document',
        documentType: 'certificate' as const,
        evaluationIds: ['eval-2', 'eval-1'],
        status: 'queued' as const,
        createdAt: '2026-09-01T00:00:00.000Z'
      }
    ]

    expect(
      findDocumentForEvaluationSet(documents, 'certificate', [
        'eval-1',
        'eval-2'
      ])?.id
    ).toBe('prior-document')
    expect(
      findDocumentForEvaluationSet(documents, 'certificate', ['eval-1'])
    ).toBeNull()
    expect(
      findDocumentForEvaluationSet(documents, 'transcript', [
        'eval-1',
        'eval-2'
      ])
    ).toBeNull()
  })

  it('creates stable scoped-generation keys for identical normalized inputs', async () => {
    const first = await createStudentDocumentIdempotencyKey({
      studentId: 'student-1',
      documentType: 'certificate',
      templateVersionId: 'version-1',
      evaluationIds: ['eval-2', 'eval-1', 'eval-1']
    })
    const retry = await createStudentDocumentIdempotencyKey({
      studentId: 'student-1',
      documentType: 'certificate',
      templateVersionId: 'version-1',
      evaluationIds: ['eval-1', 'eval-2']
    })

    expect(first).toBe(retry)
    expect(first).toHaveLength('student-document-'.length + 64)
    await expect(
      createStudentDocumentIdempotencyKey({
        studentId: 'student-1',
        documentType: 'transcript',
        templateVersionId: 'version-1',
        evaluationIds: ['eval-1', 'eval-2']
      })
    ).resolves.not.toBe(first)
  })
})
