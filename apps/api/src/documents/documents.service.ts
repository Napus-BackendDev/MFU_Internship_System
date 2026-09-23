import type { AppEnvironment } from '@internship/config'
import type { AuthenticatedActor } from '@internship/shared-types'
import {
  GetObjectCommand,
  HeadObjectCommand,
  S3Client
} from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'
import { InjectQueue } from '@nestjs/bullmq'
import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
  UnprocessableEntityException
} from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { InjectModel } from '@nestjs/mongoose'
import type { Queue } from 'bullmq'
import type { HydratedDocument, Model, QueryFilter } from 'mongoose'

import { paginate, type PaginationInput } from '../common/pagination.js'
import { idempotencyScopeKey, requestHash } from '../common/idempotency.js'
import { scopeFilter } from '../common/scope.js'
import {
  EvaluationAssignmentRecord,
  EvaluationRecord
} from '../evaluations/evaluation.schema.js'
import {
  DocumentTemplateRecord,
  DocumentTemplateVersionRecord,
  GeneratedDocumentRecord
} from './document.schema.js'
import { studentReferenceFilter } from '../members/student-reference.js'

import { StudentRecord } from '../members/members.schema.js'

@Injectable()
export class DocumentsService {
  private readonly s3: S3Client
  private readonly bucket: string

  public constructor(
    @InjectQueue('documents') private readonly documentQueue: Queue,
    @InjectModel(DocumentTemplateRecord.name)
    private readonly templates: Model<DocumentTemplateRecord>,
    @InjectModel(DocumentTemplateVersionRecord.name)
    private readonly versions: Model<DocumentTemplateVersionRecord>,
    @InjectModel(GeneratedDocumentRecord.name)
    private readonly documents: Model<GeneratedDocumentRecord>,
    @InjectModel(StudentRecord.name)
    private readonly students: Model<StudentRecord>,
    @InjectModel(EvaluationRecord.name)
    private readonly evaluations: Model<EvaluationRecord>,
    @InjectModel(EvaluationAssignmentRecord.name)
    private readonly assignments: Model<EvaluationAssignmentRecord>,
    config: ConfigService<AppEnvironment, true>
  ) {
    this.bucket = config.get('S3_BUCKET', { infer: true })
    this.s3 = new S3Client({
      endpoint: config.get('S3_ENDPOINT', { infer: true }),
      region: config.get('S3_REGION', { infer: true }),
      forcePathStyle: config.get('S3_FORCE_PATH_STYLE', { infer: true }),
      credentials: {
        accessKeyId: config.get('S3_ACCESS_KEY_ID', { infer: true }),
        secretAccessKey: config.get('S3_SECRET_ACCESS_KEY', { infer: true })
      }
    })
  }

  public listTemplates(page: PaginationInput): Promise<unknown> {
    return paginate(this.templates, {}, page, { code: 1, _id: 1 })
  }

  public async createTemplate(input: {
    code: string
    name: string
    canonicalJson: Readonly<Record<string, unknown>>
    placeholders: readonly string[]
    fontAssetKeys: readonly string[]
  }): Promise<unknown> {
    const template = await this.templates.create({
      code: input.code,
      name: input.name,
      status: 'active'
    })
    const version = await this.versions.create({
      templateId: template.id,
      versionNumber: 1,
      status: 'draft',
      canonicalJson: input.canonicalJson,
      placeholders: [...input.placeholders],
      fontAssetKeys: [...input.fontAssetKeys]
    })
    return { ...template.toJSON(), versions: [version.toJSON()] }
  }

  public async getVersion(id: string): Promise<unknown> {
    const version = await this.versions.findById(id).exec()
    if (!version) throw new NotFoundException({ code: 'RESOURCE_NOT_FOUND' })
    return version.toJSON()
  }

  public async updateVersion(
    id: string,
    canonicalJson: Readonly<Record<string, unknown>>
  ): Promise<unknown> {
    const version = await this.versions
      .findOneAndUpdate(
        { _id: id, status: 'draft' },
        { $set: { canonicalJson } },
        { new: true, runValidators: true }
      )
      .exec()
    if (!version) {
      const exists = await this.versions.exists({ _id: id })
      if (!exists) throw new NotFoundException({ code: 'RESOURCE_NOT_FOUND' })
      throw new ConflictException({ code: 'PUBLISHED_VERSION_IMMUTABLE' })
    }
    return version.toJSON()
  }

  public async publishVersion(id: string): Promise<unknown> {
    const current = await this.versions.findById(id).exec()
    if (!current) throw new NotFoundException({ code: 'RESOURCE_NOT_FOUND' })
    this.validateCanonicalTemplate(
      current.canonicalJson,
      current.placeholders,
      current.fontAssetKeys
    )
    try {
      await Promise.all(
        current.fontAssetKeys.map((key) =>
          this.s3.send(new HeadObjectCommand({ Bucket: this.bucket, Key: key }))
        )
      )
    } catch {
      throw new UnprocessableEntityException({ code: 'FONT_ASSET_NOT_FOUND' })
    }
    const published = await this.versions
      .findOneAndUpdate(
        { _id: id, status: 'draft' },
        { $set: { status: 'published', publishedAt: new Date() } },
        { new: true }
      )
      .exec()
    if (!published) throw new ConflictException({ code: 'VERSION_CONFLICT' })
    return published.toJSON()
  }

  public async generate(
    actor: AuthenticatedActor,
    input: {
      studentId: string
      templateVersionId: string
      evaluationIds: readonly string[]
    },
    idempotencyKey: string
  ): Promise<unknown> {
    const student = await this.resolveStudent(actor, input.studentId)
    const canonicalStudentId = student.id
    const template = await this.versions.exists({
      _id: input.templateVersionId,
      status: 'published'
    })
    if (!template) {
      throw new UnprocessableEntityException({
        code: 'PUBLISHED_TEMPLATE_REQUIRED'
      })
    }
    const source = await this.validateEvaluationSources(
      student.id,
      student.studentId,
      input.evaluationIds
    )
    const scopedKey = idempotencyScopeKey(
      actor.id,
      'generated-document',
      idempotencyKey
    )
    const payloadHash = requestHash({
      studentId: canonicalStudentId,
      templateVersionId: input.templateVersionId,
      evaluationIds: source
    })
    let document = await this.documents
      .findOne({ idempotencyScopeKey: scopedKey })
      .exec()
    if (document && document.requestHash !== payloadHash) {
      throw new ConflictException({ code: 'IDEMPOTENCY_KEY_REUSED' })
    }
    if (!document) {
      document = await this.documents.create({
        studentId: canonicalStudentId,
        templateVersionId: input.templateVersionId,
        evaluationIds: source,
        idempotencyKey: scopedKey,
        idempotencyScopeKey: scopedKey,
        requestHash: payloadHash,
        requestedBy: actor.id,
        status: 'queued'
      })
    } else if (
      document.status === 'failed' &&
      document.failureCode === 'QUEUE_ENQUEUE_FAILED'
    ) {
      document.status = 'queued'
      document.failureCode = undefined
      await document.save()
    } else {
      return document.toJSON()
    }
    try {
      await this.documentQueue.add(
        'generate-pdf',
        { documentId: document.id },
        {
          attempts: 3,
          backoff: { type: 'exponential', delay: 10_000 },
          jobId: `document-${document.id}`,
          removeOnComplete: 500,
          removeOnFail: 1000
        }
      )
    } catch {
      await this.documents.updateOne(
        { _id: document.id, status: 'queued' },
        { $set: { status: 'failed', failureCode: 'QUEUE_ENQUEUE_FAILED' } }
      )
      throw new ServiceUnavailableException({ code: 'QUEUE_UNAVAILABLE' })
    }
    return document.toJSON()
  }

  public async listDocuments(
    actor: AuthenticatedActor,
    page: PaginationInput
  ): Promise<unknown> {
    let studentIdMatch: string[] = []
    if (actor.scope.studentId) {
      const student = await this.students
        .findOne({ studentId: actor.scope.studentId })
        .select('_id')
        .exec()
      studentIdMatch = [actor.scope.studentId]
      if (student?._id) studentIdMatch.push(student._id.toString())
    }
    const filter: QueryFilter<GeneratedDocumentRecord> =
      studentIdMatch.length > 0
        ? { studentId: { $in: studentIdMatch } }
        : { requestedBy: actor.id }
    if (actor.scope.tenant) delete filter.requestedBy
    return paginate(this.documents, filter, page)
  }

  public async getDocument(
    actor: AuthenticatedActor,
    id: string
  ): Promise<GeneratedDocumentRecord & { toJSON(): unknown }> {
    const scope = await this.documentScope(actor)
    const document = await this.documents.findOne({
      _id: id,
      ...scope
    })
    if (!document) throw new NotFoundException({ code: 'RESOURCE_NOT_FOUND' })
    return document
  }

  public async downloadUrl(
    actor: AuthenticatedActor,
    id: string
  ): Promise<unknown> {
    const document = await this.getDocument(actor, id)
    if (document.status !== 'ready' || !document.objectKey) {
      throw new ConflictException({ code: 'DOCUMENT_NOT_READY' })
    }
    return {
      url: await getSignedUrl(
        this.s3,
        new GetObjectCommand({ Bucket: this.bucket, Key: document.objectKey }),
        { expiresIn: 300 }
      ),
      expiresIn: 300
    }
  }

  private async documentScope(
    actor: AuthenticatedActor
  ): Promise<QueryFilter<GeneratedDocumentRecord>> {
    if (actor.scope.studentId) {
      const student = await this.students
        .findOne({ studentId: actor.scope.studentId })
        .select('_id')
        .exec()
      const studentIdMatch = [actor.scope.studentId]
      if (student?._id) studentIdMatch.push(student._id.toString())
      return { studentId: { $in: studentIdMatch } }
    }
    if (actor.scope.tenant) return {}
    if (
      actor.roles.includes('coordinator') ||
      actor.roles.includes('internshipStaff')
    ) {
      return { requestedBy: actor.id }
    }
    throw new ForbiddenException({ code: 'PERMISSION_DENIED' })
  }

  private async resolveStudent(
    actor: AuthenticatedActor,
    id: string
  ): Promise<HydratedDocument<StudentRecord>> {
    const identity = studentReferenceFilter(id)
    let filter: QueryFilter<StudentRecord> = identity
    if (actor.scope.studentId) {
      filter = {
        $and: [identity, studentReferenceFilter(actor.scope.studentId)]
      }
    } else if (!actor.scope.tenant) {
      filter = { $and: [identity, scopeFilter<StudentRecord>(actor)] }
    }
    const student = await this.students.findOne(filter).exec()
    if (!student) throw new NotFoundException({ code: 'RESOURCE_NOT_FOUND' })
    return student
  }

  private async validateEvaluationSources(
    studentRecordId: string,
    studentNumber: string,
    evaluationIds: readonly string[]
  ): Promise<string[]> {
    const uniqueIds = [...new Set(evaluationIds)]
    if (uniqueIds.length === 0) return []
    const evaluations = await this.evaluations
      .find({ _id: { $in: uniqueIds } })
      .select('_id assignmentId')
      .exec()
    if (evaluations.length !== uniqueIds.length) {
      throw new UnprocessableEntityException({
        code: 'EVALUATION_SOURCE_INVALID'
      })
    }
    const assignmentIds = evaluations.map(
      (evaluation) => evaluation.assignmentId
    )
    const matchingAssignments = await this.assignments.countDocuments({
      _id: { $in: assignmentIds },
      studentId: { $in: [studentRecordId, studentNumber] }
    })
    if (matchingAssignments !== new Set(assignmentIds).size) {
      throw new UnprocessableEntityException({
        code: 'EVALUATION_SOURCE_INVALID'
      })
    }
    return evaluations.map((evaluation) => evaluation.id)
  }

  private validateCanonicalTemplate(
    canonical: Readonly<Record<string, unknown>>,
    declaredPlaceholders: readonly string[],
    fontAssetKeys: readonly string[]
  ): void {
    const width = canonical.width
    const height = canonical.height
    const elements = canonical.elements
    const invalid = (): never => {
      throw new UnprocessableEntityException({
        code: 'DOCUMENT_TEMPLATE_INVALID'
      })
    }
    if (
      typeof width !== 'number' ||
      typeof height !== 'number' ||
      !Number.isFinite(width) ||
      !Number.isFinite(height) ||
      width <= 0 ||
      height <= 0 ||
      !Array.isArray(elements) ||
      fontAssetKeys.length === 0 ||
      fontAssetKeys.some((key) => !key.trim())
    ) {
      invalid()
    }
    const pageWidth = width as number
    const pageHeight = height as number
    const allowed = new Set(['student_id', 'student_name', 'evaluation_count'])
    const declared = new Set(declaredPlaceholders)
    for (const element of elements as unknown[]) {
      if (!element || typeof element !== 'object') invalid()
      const item = element as Record<string, unknown>
      if (
        item.type !== 'text' ||
        typeof item.x !== 'number' ||
        typeof item.y !== 'number' ||
        typeof item.fontSize !== 'number' ||
        typeof item.text !== 'string' ||
        !Number.isFinite(item.x) ||
        !Number.isFinite(item.y) ||
        !Number.isFinite(item.fontSize) ||
        item.x < 0 ||
        item.y < 0 ||
        item.fontSize <= 0 ||
        item.x > pageWidth ||
        item.y > pageHeight
      ) {
        invalid()
      }
      const text = item.text as string
      const placeholders = [...text.matchAll(/\{\{\s*([a-z_]+)\s*\}\}/gu)]
      if (
        placeholders.some(
          (match) =>
            !match[1] || !allowed.has(match[1]) || !declared.has(match[1])
        )
      ) {
        invalid()
      }
    }
  }
}
