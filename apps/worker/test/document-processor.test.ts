import { describe, expect, it, vi } from 'vitest'
import { createHash } from 'node:crypto'
import { PutObjectCommand } from '@aws-sdk/client-s3'
import type { GetObjectCommand } from '@aws-sdk/client-s3'
import type { Queue } from 'bullmq'
import { Types } from 'mongoose'
import { PDFDocument, StandardFonts, type PDFFont } from 'pdf-lib'

import type { AppEnvironment } from '@internship/config'
import type { DocumentIssueSnapshotV1 } from '@internship/shared-types'

import { DocumentProcessor } from '../src/runtime/document.processor.js'
import type { DocumentJob } from '../src/runtime/document.processor.js'
import type { WorkerModels } from '../src/runtime/models.js'

function createProcessor(
  input: {
    readonly evaluationIds?: readonly string[]
    readonly snapshot?: unknown
    readonly queue?: Queue<DocumentJob>
  } = {}
): {
  readonly processor: DocumentProcessor
  readonly models: WorkerModels
  readonly updateOne: ReturnType<typeof vi.fn>
  readonly liveReads: {
    readonly student: ReturnType<typeof vi.fn>
    readonly evaluation: ReturnType<typeof vi.fn>
    readonly assignment: ReturnType<typeof vi.fn>
    readonly template: ReturnType<typeof vi.fn>
  }
  readonly send: ReturnType<typeof vi.fn>
} {
  const liveReads = {
    student: vi.fn(),
    evaluation: vi.fn(),
    assignment: vi.fn(),
    template: vi.fn()
  }
  const document = {
    id: 'document-1',
    studentId: 'student-record-1',
    templateVersionId: 'template-version-1',
    evaluationIds: input.evaluationIds ?? ['evaluation-1'],
    sourceSnapshot: 'snapshot' in input ? input.snapshot : createSnapshot(),
    status: 'processing',
    processingToken: 'processing-token-1'
  }
  const updateOne = vi.fn().mockResolvedValue({ matchedCount: 1 })
  const session = {
    withTransaction: vi.fn(async (operation: () => Promise<void>) =>
      operation()
    ),
    endSession: vi.fn().mockResolvedValue(undefined)
  }
  const models = {
    GeneratedDocument: {
      db: { startSession: vi.fn().mockResolvedValue(session) },
      findOneAndUpdate: vi.fn().mockReturnValue({
        select: vi.fn().mockResolvedValue(document)
      }),
      updateOne
    },
    AuditLog: { create: vi.fn().mockResolvedValue([]) },
    DocumentVersion: { findOne: liveReads.template },
    Student: { findOne: liveReads.student },
    Evaluation: { find: liveReads.evaluation },
    Assignment: { find: liveReads.assignment }
  } as unknown as WorkerModels
  const processor = new DocumentProcessor(
    {
      S3_BUCKET: 'documents',
      S3_ENDPOINT: 'http://127.0.0.1:9000',
      S3_REGION: 'us-east-1',
      S3_FORCE_PATH_STYLE: true,
      S3_ACCESS_KEY_ID: 'test-access-key',
      S3_SECRET_ACCESS_KEY: 'test-secret-key'
    } as AppEnvironment,
    models,
    { info: vi.fn(), warn: vi.fn(), error: vi.fn() } as never,
    input.queue
  )
  const send = vi.fn()
  Object.defineProperty(processor, 's3', {
    configurable: true,
    value: { send }
  })
  return { processor, models, updateOne, liveReads, send }
}

function createSnapshot(
  evaluations: readonly unknown[] = [
    {
      id: 'evaluation-1',
      assignmentId: 'assignment-1',
      version: 1,
      submittedAt: '2026-09-25T00:00:00.000Z',
      answers: {},
      questionSnapshot: [],
      categoryScores: null
    }
  ]
): Record<string, unknown> {
  return {
    snapshotVersion: 1,
    capturedAt: '2026-09-25T00:00:00.000Z',
    documentNumber: 'MFU-CERT-document-1',
    template: {
      versionId: 'template-version-1',
      documentType: 'certificate',
      schemaVersion: 1,
      canonicalJson: {
        width: 100,
        height: 100,
        elements: [
          { type: 'text', x: 1, y: 1, fontSize: 12, text: '{{student_name}}' }
        ]
      },
      placeholders: ['student_name'],
      fontAssets: [{ key: 'private/font.ttf', sha256: 'a'.repeat(64) }]
    },
    student: {
      recordId: 'student-record-1',
      studentId: '6531501001',
      name: { th: 'นักศึกษาตัวอย่าง', en: 'Example Student' },
      academicYear: 2569,
      schoolId: 'school-1',
      schoolName: { th: 'สำนักวิชา', en: 'School' },
      programId: 'program-1',
      programName: { th: 'หลักสูตร', en: 'Program' }
    },
    placement: {
      id: 'placement-1',
      organizationId: 'organization-1',
      organizationName: { th: 'สถานประกอบการ', en: 'Organization' },
      positionTitle: { th: 'นักศึกษาฝึกงาน', en: 'Intern' },
      schoolId: 'school-1',
      programId: 'program-1',
      startsAt: '2026-06-01T00:00:00.000Z',
      endsAt: '2026-08-01T00:00:00.000Z',
      academicTermId: 'term-1',
      academicTermCode: '1/2569',
      academicYear: 2569,
      semester: '1'
    },
    evaluations
  }
}

describe('document worker immutable source snapshots', () => {
  it('rejects documents without a persisted issue snapshot', async () => {
    const { processor, updateOne, send } = createProcessor({ snapshot: null })

    await expect(
      processor.process({ data: { documentId: 'document-1' } } as never)
    ).rejects.toThrow('DOCUMENT_SOURCE_SNAPSHOT_REQUIRED')
    const failureCall = updateOne.mock.calls[0] as unknown as [
      Record<string, unknown>,
      Record<string, unknown>
    ]
    expect(failureCall[0]).toMatchObject({
      _id: 'document-1',
      status: 'processing'
    })
    expect(typeof failureCall[0].processingToken).toBe('string')
    expect(failureCall[1]).toEqual({
      $set: {
        status: 'failed',
        failureCode: 'DOCUMENT_SOURCE_SNAPSHOT_REQUIRED'
      },
      $unset: {
        processingStartedAt: 1,
        processingLeaseUntil: 1,
        processingToken: 1
      }
    })
    expect(send).not.toHaveBeenCalled()
  })

  it('rejects a snapshot whose resource IDs differ from the queued request', async () => {
    const { processor, send } = createProcessor({
      evaluationIds: ['evaluation-from-another-request']
    })

    await expect(
      processor.process({ data: { documentId: 'document-1' } } as never)
    ).rejects.toThrow('DOCUMENT_SOURCE_INVALID')
    expect(send).not.toHaveBeenCalled()
  })

  it('rejects a request with no final evaluation snapshot', async () => {
    const { processor, send } = createProcessor({
      evaluationIds: [],
      snapshot: createSnapshot([])
    })

    await expect(
      processor.process({ data: { documentId: 'document-1' } } as never)
    ).rejects.toThrow('DOCUMENT_EVALUATION_REQUIRED')
    expect(send).not.toHaveBeenCalled()
  })

  it('renders only snapshot sources and checks the captured font checksum', async () => {
    const { processor, liveReads, send } = createProcessor()
    send.mockResolvedValue({
      Body: {
        transformToByteArray: () =>
          Promise.resolve(new Uint8Array([1, 2, 3, 4]))
      }
    })

    await expect(
      processor.process({ data: { documentId: 'document-1' } } as never)
    ).rejects.toThrow('FONT_ASSET_CHECKSUM_MISMATCH')
    expect(send).toHaveBeenCalledTimes(1)
    const command = send.mock.calls[0]?.[0] as GetObjectCommand | undefined
    expect(command?.input).toMatchObject({
      Bucket: 'documents',
      Key: 'private/font.ttf'
    })
    expect(liveReads.student).not.toHaveBeenCalled()
    expect(liveReads.evaluation).not.toHaveBeenCalled()
    expect(liveReads.assignment).not.toHaveBeenCalled()
    expect(liveReads.template).not.toHaveBeenCalled()
  })

  it('checks snapshot image bytes before rendering V2 documents', async () => {
    const fontBytes = new Uint8Array([1, 2, 3, 4])
    const imageBytes = new Uint8Array([5, 6, 7, 8])
    const base = createSnapshot() as unknown as DocumentIssueSnapshotV1
    const snapshot: DocumentIssueSnapshotV1 = {
      ...base,
      template: {
        ...base.template,
        schemaVersion: 2,
        placeholders: ['student_name_th'],
        canonicalJson: {
          width: 100,
          height: 100,
          elements: [
            {
              id: 'crest-1',
              type: 'emblem',
              content: 'crest',
              assetKey: 'private/emblem.png',
              x: 1,
              y: 1,
              width: 20,
              height: 20,
              fontSize: 12,
              fontWeight: 'normal',
              color: '#0f172a',
              textAlign: 'center'
            },
            {
              id: 'name-1',
              type: 'heading',
              content: '{{student_name_th}}',
              x: 1,
              y: 30,
              width: 90,
              fontSize: 12,
              fontWeight: 'normal',
              color: '#0f172a',
              textAlign: 'center'
            }
          ]
        },
        fontAssets: [
          {
            key: 'private/font.ttf',
            sha256: createHash('sha256').update(fontBytes).digest('hex')
          }
        ],
        imageAssets: [
          {
            key: 'private/emblem.png',
            assetType: 'emblem',
            sha256: 'f'.repeat(64)
          }
        ]
      }
    }
    const { processor, send, updateOne } = createProcessor({ snapshot })
    send
      .mockResolvedValueOnce({
        Body: { transformToByteArray: () => Promise.resolve(fontBytes) }
      })
      .mockResolvedValueOnce({
        Body: { transformToByteArray: () => Promise.resolve(imageBytes) }
      })

    await expect(
      processor.process({ data: { documentId: 'document-1' } } as never)
    ).rejects.toThrow('DOCUMENT_IMAGE_ASSET_CHECKSUM_MISMATCH')
    expect(send).toHaveBeenCalledTimes(2)
    const failureCall = updateOne.mock.calls[0] as unknown as [
      Record<string, unknown>,
      Record<string, unknown>
    ]
    expect(failureCall[0]).toMatchObject({
      _id: 'document-1',
      status: 'processing'
    })
    expect(typeof failureCall[0].processingToken).toBe('string')
    expect(failureCall[1]).toEqual({
      $set: {
        status: 'failed',
        failureCode: 'DOCUMENT_IMAGE_ASSET_CHECKSUM_MISMATCH'
      },
      $unset: {
        processingStartedAt: 1,
        processingLeaseUntil: 1,
        processingToken: 1
      }
    })
  })

  it('renders and issues a snapshot PDF through isolated object storage', async () => {
    const fontBytes = new Uint8Array([1, 2, 3, 4])
    const snapshot = createSnapshot() as unknown as DocumentIssueSnapshotV1
    const snapshotWithEnglishText: DocumentIssueSnapshotV1 = {
      ...snapshot,
      template: {
        ...snapshot.template,
        canonicalJson: {
          width: 400,
          height: 300,
          elements: [
            {
              type: 'text',
              x: 24,
              y: 24,
              fontSize: 18,
              text: 'Internship Certificate'
            }
          ]
        },
        placeholders: [],
        fontAssets: [
          {
            key: 'private/font.ttf',
            sha256: createHash('sha256').update(fontBytes).digest('hex')
          }
        ]
      }
    }
    const { processor, send, updateOne } = createProcessor({
      snapshot: snapshotWithEnglishText
    })
    send
      .mockResolvedValueOnce({
        Body: { transformToByteArray: () => Promise.resolve(fontBytes) }
      })
      .mockResolvedValueOnce({})

    type EmbedFontMethod = (
      this: PDFDocument,
      font: StandardFonts | string | Uint8Array | ArrayBuffer,
      options?: { subset?: boolean }
    ) => Promise<PDFFont>
    const originalEmbedFont = Object.getOwnPropertyDescriptor(
      PDFDocument.prototype,
      'embedFont'
    )?.value as unknown as EmbedFontMethod
    const embedStandardFont = vi
      .spyOn(PDFDocument.prototype, 'embedFont')
      .mockImplementation(function (this: PDFDocument, _fontData, options) {
        return Reflect.apply(originalEmbedFont, this, [
          StandardFonts.Helvetica,
          options
        ])
      })
    try {
      await processor.process({
        data: { documentId: 'document-1' }
      } as never)
    } finally {
      embedStandardFont.mockRestore()
    }

    expect(send).toHaveBeenCalledTimes(2)
    const upload = send.mock.calls[1]?.[0] as PutObjectCommand | undefined
    expect(upload).toBeInstanceOf(PutObjectCommand)
    expect(upload?.input).toMatchObject({
      Bucket: 'documents',
      ContentType: 'application/pdf'
    })
    expect(upload?.input.Key).toMatch(
      /^generated-documents\/student-record-1\/document-1-[a-f0-9]{64}\.pdf$/
    )
    const pdfBytes = upload?.input.Body as Uint8Array | undefined
    expect(pdfBytes).toBeDefined()
    const issuedPdf = await PDFDocument.load(pdfBytes!)
    expect(issuedPdf.getPageCount()).toBe(1)
    expect(issuedPdf.getTitle()).toBe('Internship Certificate')

    const readyWrite = updateOne.mock.calls[0] as unknown as [
      Record<string, unknown>,
      Record<string, unknown>
    ]
    expect(readyWrite[0]).toMatchObject({
      _id: 'document-1',
      status: 'processing'
    })
    expect(readyWrite[0]?.processingToken).toEqual(expect.any(String))
    expect(readyWrite[1]).toMatchObject({
      $set: {
        status: 'ready',
        objectKey: upload?.input.Key,
        sha256: upload?.input.Metadata?.sha256
      },
      $unset: {
        processingStartedAt: 1,
        processingLeaseUntil: 1,
        processingToken: 1
      }
    })
  })

  it('requeues stale processing documents and queued requests with stable job IDs', async () => {
    const documentId = new Types.ObjectId()
    const staleDocument = {
      _id: documentId,
      processingLeaseUntil: new Date('2026-09-25T00:00:00.000Z'),
      processingStartedAt: new Date('2026-09-24T23:55:00.000Z'),
      processingToken: 'stale-token'
    }
    const findRows = [[staleDocument], [], [{ _id: documentId }], []] as const
    const find = vi.fn(() => {
      const rows = findRows[find.mock.calls.length - 1] ?? []
      const query = {
        select: vi.fn().mockReturnThis(),
        sort: vi.fn().mockReturnThis(),
        limit: vi.fn().mockReturnThis(),
        lean: vi.fn().mockReturnThis(),
        exec: vi.fn().mockResolvedValue(rows)
      }
      return query
    })
    const updateOne = vi.fn().mockResolvedValue({ matchedCount: 1 })
    const getJob = vi.fn().mockResolvedValue(undefined)
    const queueAdd = vi.fn().mockResolvedValue(undefined)
    const queue = {
      getJob,
      add: queueAdd
    } as unknown as Queue<DocumentJob>
    const { processor, models } = createProcessor({ queue })
    ;(models.GeneratedDocument as unknown as { find: typeof find }).find = find
    ;(
      models.GeneratedDocument as unknown as { updateOne: typeof updateOne }
    ).updateOne = updateOne

    await processor.recoverStuckDocuments(new Date('2026-09-25T00:10:00.000Z'))

    expect(updateOne).toHaveBeenCalledWith(
      {
        _id: documentId,
        status: 'processing',
        processingToken: 'stale-token',
        processingLeaseUntil: { $lte: new Date('2026-09-25T00:10:00.000Z') }
      },
      {
        $set: { status: 'queued' },
        $unset: {
          processingStartedAt: 1,
          processingLeaseUntil: 1,
          processingToken: 1
        }
      }
    )
    expect(queueAdd).toHaveBeenCalledWith(
      'generate-pdf',
      { documentId: documentId.toString() },
      expect.objectContaining({ jobId: `document-${documentId.toString()}` })
    )
  })

  it('does not create a duplicate PDF job while the stable job ID is active', async () => {
    const documentId = new Types.ObjectId()
    const query = {
      select: vi.fn().mockReturnThis(),
      sort: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(),
      lean: vi.fn().mockReturnThis(),
      exec: vi
        .fn()
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([{ _id: documentId }])
        .mockResolvedValueOnce([])
    }
    const getJob = vi.fn().mockResolvedValue({
      getState: vi.fn().mockResolvedValue('active'),
      remove: vi.fn()
    })
    const queueAdd = vi.fn()
    const queue = {
      getJob,
      add: queueAdd
    } as unknown as Queue<DocumentJob>
    const { processor, models } = createProcessor({ queue })
    ;(
      models.GeneratedDocument as unknown as { find: ReturnType<typeof vi.fn> }
    ).find = vi.fn().mockReturnValue(query)

    await processor.recoverStuckDocuments()

    expect(getJob).toHaveBeenCalledWith(`document-${documentId.toString()}`)
    expect(queueAdd).not.toHaveBeenCalled()
  })
})
