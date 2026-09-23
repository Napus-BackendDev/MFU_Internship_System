import { createHash } from 'node:crypto'

import type { AppEnvironment } from '@internship/config'
import {
  GetObjectCommand,
  PutObjectCommand,
  S3Client
} from '@aws-sdk/client-s3'
import fontkit from '@pdf-lib/fontkit'
import type { Job } from 'bullmq'
import { PDFDocument, rgb } from 'pdf-lib'
import type { Logger } from 'pino'

import type { WorkerModels } from './models.js'
import { studentReferenceFilter } from './student-reference.js'

export interface DocumentJob {
  readonly documentId: string
}

interface TextElement {
  readonly type: 'text'
  readonly x: number
  readonly y: number
  readonly fontSize: number
  readonly text: string
}

interface CanonicalDocument {
  readonly width: number
  readonly height: number
  readonly elements: readonly TextElement[]
}

export class DocumentProcessor {
  private readonly s3: S3Client

  public constructor(
    private readonly environment: AppEnvironment,
    private readonly models: WorkerModels,
    private readonly logger: Logger
  ) {
    this.s3 = new S3Client({
      endpoint: environment.S3_ENDPOINT,
      region: environment.S3_REGION,
      forcePathStyle: environment.S3_FORCE_PATH_STYLE,
      credentials: {
        accessKeyId: environment.S3_ACCESS_KEY_ID,
        secretAccessKey: environment.S3_SECRET_ACCESS_KEY
      }
    })
  }

  public async process(job: Job<DocumentJob>): Promise<void> {
    const document = await this.models.GeneratedDocument.findOneAndUpdate(
      {
        _id: job.data.documentId,
        status: { $in: ['queued', 'failed'] }
      },
      {
        $set: { status: 'processing', processingStartedAt: new Date() },
        $unset: { failureCode: 1 }
      },
      { new: true }
    )
    if (!document || document.status === 'ready') return

    try {
      const [template, student, evaluations] = await Promise.all([
        this.models.DocumentVersion.findOne({
          _id: document.templateVersionId,
          status: 'published'
        }),
        this.models.Student.findOne(studentReferenceFilter(document.studentId)),
        this.models.Evaluation.find({ _id: { $in: document.evaluationIds } })
          .sort({ version: 1 })
          .lean()
      ])
      if (!template || !student) throw new Error('DOCUMENT_SOURCE_INVALID')
      if (evaluations.length !== new Set(document.evaluationIds).size) {
        throw new Error('DOCUMENT_EVALUATION_SOURCE_INVALID')
      }
      const assignments = await this.models.Assignment.find({
        _id: { $in: evaluations.map((evaluation) => evaluation.assignmentId) },
        studentId: { $in: [student.id, student.studentId] }
      })
        .select('_id')
        .lean()
      if (
        assignments.length !==
        new Set(evaluations.map((evaluation) => evaluation.assignmentId)).size
      ) {
        throw new Error('DOCUMENT_EVALUATION_SOURCE_INVALID')
      }
      const canonical = parseCanonicalDocument(template.canonicalJson)
      const fontKey = template.fontAssetKeys[0]
      if (!fontKey) throw new Error('FONT_ASSET_REQUIRED')
      const fontResponse = await this.s3.send(
        new GetObjectCommand({
          Bucket: this.environment.S3_BUCKET,
          Key: fontKey
        })
      )
      if (!fontResponse.Body) throw new Error('FONT_ASSET_NOT_FOUND')
      const fontBytes = await fontResponse.Body.transformToByteArray()

      const pdf = await PDFDocument.create()
      pdf.registerFontkit(fontkit)
      pdf.setTitle('Internship Transcript')
      pdf.setCreator('Internship Transcript System V2')
      pdf.setProducer('Internship Transcript System V2')
      pdf.setCreationDate(new Date(0))
      pdf.setModificationDate(new Date(0))
      const font = await pdf.embedFont(fontBytes, { subset: true })
      const page = pdf.addPage([canonical.width, canonical.height])
      const values = {
        student_id: student.studentId,
        student_name: student.name?.th ?? student.name?.en ?? student.studentId,
        evaluation_count: String(evaluations.length)
      }

      for (const element of canonical.elements) {
        page.drawText(render(element.text, values), {
          x: element.x,
          y: canonical.height - element.y - element.fontSize,
          size: element.fontSize,
          font,
          color: rgb(0.12, 0.15, 0.2)
        })
      }

      const bytes = await pdf.save({
        addDefaultPage: false,
        objectsPerTick: 50,
        useObjectStreams: true,
        updateFieldAppearances: false
      })
      const sha256 = createHash('sha256').update(bytes).digest('hex')
      const objectKey = `generated-documents/${document.studentId}/${document.id}-${sha256}.pdf`
      await this.s3.send(
        new PutObjectCommand({
          Bucket: this.environment.S3_BUCKET,
          Key: objectKey,
          Body: bytes,
          ContentType: 'application/pdf',
          Metadata: { sha256 }
        })
      )
      await this.models.GeneratedDocument.updateOne(
        { _id: document.id, status: 'processing' },
        {
          $set: { status: 'ready', objectKey, sha256 },
          $unset: { processingStartedAt: 1 }
        }
      )
      this.logger.info({ documentId: document.id, sha256 }, 'PDF generated')
    } catch (error: unknown) {
      const code =
        error instanceof Error ? error.message.slice(0, 100) : 'PDF_FAILED'
      await this.models.GeneratedDocument.updateOne(
        { _id: document.id },
        {
          $set: { status: 'failed', failureCode: code },
          $unset: { processingStartedAt: 1 }
        }
      )
      throw error
    }
  }
}

function parseCanonicalDocument(input: unknown): CanonicalDocument {
  if (typeof input !== 'object' || input === null) {
    throw new Error('DOCUMENT_TEMPLATE_INVALID')
  }
  const value = input as Record<string, unknown>
  if (
    typeof value.width !== 'number' ||
    typeof value.height !== 'number' ||
    !Array.isArray(value.elements)
  ) {
    throw new Error('DOCUMENT_TEMPLATE_INVALID')
  }
  const elements = value.elements.map((element: unknown) => {
    if (typeof element !== 'object' || element === null) {
      throw new Error('DOCUMENT_TEMPLATE_INVALID')
    }
    const item = element as Record<string, unknown>
    if (
      item.type !== 'text' ||
      typeof item.x !== 'number' ||
      typeof item.y !== 'number' ||
      typeof item.fontSize !== 'number' ||
      typeof item.text !== 'string'
    ) {
      throw new Error('DOCUMENT_TEMPLATE_INVALID')
    }
    return {
      type: 'text' as const,
      x: item.x,
      y: item.y,
      fontSize: item.fontSize,
      text: item.text
    }
  })
  return { width: value.width, height: value.height, elements }
}

function render(
  template: string,
  values: Readonly<Record<string, string>>
): string {
  return template.replace(/{{\s*([a-z_]+)\s*}}/g, (_match, key: string) => {
    const value = values[key]
    if (value === undefined) throw new Error('UNKNOWN_DOCUMENT_PLACEHOLDER')
    return value
  })
}
