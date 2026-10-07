import type { AppEnvironment } from '@internship/config'
import type {
  AuthenticatedActor,
  DocumentIssueSnapshotV1
} from '@internship/shared-types'
import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client
} from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'
import { createHash, randomUUID } from 'node:crypto'
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
import type {
  ClientSession,
  HydratedDocument,
  Model,
  QueryFilter
} from 'mongoose'
import {
  parseCanonicalDocumentV1,
  parseCanonicalDocumentV2
} from '@internship/shared-types'

import {
  AcademicTermRecord,
  ProgramRecord,
  SchoolRecord
} from '../academic/academic.schema.js'
import type { AuditResourceScope } from '../audit/audit.schema.js'
import { AuditService } from '../audit/audit.service.js'
import { hasTenantDocumentTemplateManagementScope } from '../auth/permission-map.js'
import { paginate, type PaginationInput } from '../common/pagination.js'
import { runWithTransaction } from '../common/mongo-transaction.js'
import { idempotencyScopeKey, requestHash } from '../common/idempotency.js'
import { scopeFilter } from '../common/scope.js'
import {
  EvaluationAssignmentRecord,
  EvaluationRecord
} from '../evaluations/evaluation.schema.js'
import {
  OrganizationRecord,
  PlacementRecord
} from '../members/members.schema.js'
import {
  DocumentAssetRecord,
  DocumentTemplateRecord,
  DocumentTemplateVersionRecord,
  GeneratedDocumentRecord
} from './document.schema.js'
import { studentReferenceFilter } from '../members/student-reference.js'
import {
  extractFontFamilyName,
  normalizeFontFamilyStack
} from './font-metadata.js'

import { StudentRecord } from '../members/members.schema.js'

function resolveStudentNamePair(name: unknown): {
  readonly th: string
  readonly en: string
} {
  if (typeof name === 'string') {
    return { th: name, en: name }
  }
  if (typeof name === 'object' && name !== null) {
    const localized = name as { readonly th?: unknown; readonly en?: unknown }
    const th =
      typeof localized.th === 'string'
        ? localized.th
        : typeof localized.en === 'string'
          ? localized.en
          : ''
    const en =
      typeof localized.en === 'string'
        ? localized.en
        : typeof localized.th === 'string'
          ? localized.th
          : ''
    return { th, en }
  }
  return { th: '', en: '' }
}

const DOCUMENT_READ_SCOPE_ROLES = [
  'internshipStaff',
  'coordinator',
  'auditor'
] as const

const DOCUMENT_TEMPLATE_BACKGROUND_TYPES = new Set([
  'watermark',
  'certificate_pattern',
  'geometric',
  'custom',
  'none'
])

function projectTemplateEditorMetadata(
  value: unknown
): Record<string, unknown> | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return null
  }
  const source = value as Record<string, unknown>
  const summary: Record<string, unknown> = {}
  for (const field of ['nameTh', 'nameEn', 'description'] as const) {
    if (typeof source[field] === 'string') summary[field] = source[field]
  }
  if (
    typeof source.backgroundType === 'string' &&
    DOCUMENT_TEMPLATE_BACKGROUND_TYPES.has(source.backgroundType)
  ) {
    summary.backgroundType = source.backgroundType
  }
  if (
    typeof source.bgOpacity === 'number' &&
    Number.isFinite(source.bgOpacity) &&
    source.bgOpacity >= 0 &&
    source.bgOpacity <= 100
  ) {
    summary.bgOpacity = source.bgOpacity
  }
  return summary
}

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
    config: ConfigService<AppEnvironment, true>,
    private readonly auditService: AuditService,
    @InjectModel(DocumentAssetRecord.name)
    private readonly assets: Model<DocumentAssetRecord>,
    @InjectModel(AcademicTermRecord.name)
    private readonly terms: Model<AcademicTermRecord>,
    @InjectModel(SchoolRecord.name)
    private readonly schools: Model<SchoolRecord>,
    @InjectModel(ProgramRecord.name)
    private readonly programs: Model<ProgramRecord>,
    @InjectModel(PlacementRecord.name)
    private readonly placements: Model<PlacementRecord>,
    @InjectModel(OrganizationRecord.name)
    private readonly organizations: Model<OrganizationRecord>
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

  public async uploadAsset(
    actor: AuthenticatedActor,
    input: {
      readonly assetType: DocumentAssetRecord['assetType']
      readonly rightsBasis: string
      readonly rightsConfirmed: boolean
    },
    file: {
      readonly originalname: string
      readonly buffer: Buffer
    },
    requestId: string
  ): Promise<unknown> {
    if (!hasTenantDocumentTemplateManagementScope(actor)) {
      throw new ForbiddenException({ code: 'PERMISSION_DENIED' })
    }
    if (!input.rightsConfirmed) {
      throw new UnprocessableEntityException({
        code: 'DOCUMENT_ASSET_RIGHTS_CONFIRMATION_REQUIRED'
      })
    }
    const detected = this.detectDocumentAsset(file.buffer, input.assetType)
    if (!detected) {
      throw new UnprocessableEntityException({
        code: 'DOCUMENT_ASSET_CONTENT_INVALID'
      })
    }
    if (
      file.buffer.byteLength === 0 ||
      file.buffer.byteLength > 8 * 1024 * 1024
    ) {
      throw new UnprocessableEntityException({
        code: 'DOCUMENT_ASSET_SIZE_INVALID'
      })
    }

    const fontFamily =
      input.assetType === 'font'
        ? extractFontFamilyName(file.buffer)
        : undefined

    const key = `document-assets/${randomUUID()}.${detected.extension}`
    const sha256 = createHash('sha256').update(file.buffer).digest('hex')
    const originalName = this.safeAssetName(file.originalname)
    const rightsBasis = input.rightsBasis.trim()
    if (!originalName || !rightsBasis) {
      throw new UnprocessableEntityException({
        code: 'DOCUMENT_ASSET_METADATA_REQUIRED'
      })
    }

    try {
      await this.s3.send(
        new PutObjectCommand({
          Bucket: this.bucket,
          Key: key,
          Body: file.buffer,
          ContentLength: file.buffer.byteLength,
          ContentType: detected.contentType,
          ContentDisposition: 'attachment',
          Metadata: { sha256, assettype: input.assetType }
        })
      )
    } catch {
      throw new ServiceUnavailableException({
        code: 'DOCUMENT_ASSET_STORAGE_UNAVAILABLE'
      })
    }

    try {
      const asset = await runWithTransaction(
        this.assets.db,
        async (session) => {
          const [created] = await this.assets.create(
            [
              {
                key,
                assetType: input.assetType,
                originalName,
                ...(fontFamily ? { fontFamily } : {}),
                contentType: detected.contentType,
                size: file.buffer.byteLength,
                sha256,
                rightsBasis,
                rightsConfirmedBy: actor.id,
                rightsConfirmedAt: new Date(),
                status: 'active'
              }
            ],
            session ? { session } : {}
          )
          if (!created) throw new Error('DOCUMENT_ASSET_RECORD_CREATE_FAILED')
          await this.auditService.record(
            {
              requestId,
              actorId: actor.id,
              actorEmail: actor.email,
              action: 'documents.asset_uploaded',
              route: 'POST /api/v2/document-assets',
              method: 'POST',
              resourceScopes: [{ tenant: true }],
              metadata: {
                assetId: created.id,
                assetType: input.assetType,
                ...(fontFamily ? { fontFamily } : {}),
                contentType: detected.contentType,
                size: file.buffer.byteLength,
                sha256,
                rightsBasis
              }
            },
            session
          )
          return created
        }
      )
      if (!asset) throw new Error('DOCUMENT_ASSET_TRANSACTION_EMPTY')
      return asset.toJSON()
    } catch (error: unknown) {
      let persisted: HydratedDocument<DocumentAssetRecord> | null
      try {
        persisted = await this.assets.findOne({ key }).exec()
      } catch {
        throw new ServiceUnavailableException({
          code: 'DOCUMENT_ASSET_RECONCILIATION_REQUIRED'
        })
      }
      if (persisted) return persisted.toJSON()
      try {
        await this.s3.send(
          new DeleteObjectCommand({ Bucket: this.bucket, Key: key })
        )
      } catch {
        throw new ServiceUnavailableException({
          code: 'DOCUMENT_ASSET_ROLLBACK_REQUIRED'
        })
      }
      throw error
    }
  }

  public async listAssets(
    actor: AuthenticatedActor,
    page: PaginationInput,
    assetType?: DocumentAssetRecord['assetType']
  ): Promise<unknown> {
    if (!hasTenantDocumentTemplateManagementScope(actor)) {
      throw new ForbiddenException({ code: 'PERMISSION_DENIED' })
    }
    return paginate(
      this.assets,
      { status: 'active', ...(assetType ? { assetType } : {}) },
      page,
      { createdAt: -1, _id: -1 }
    )
  }

  public listTemplates(
    actor: AuthenticatedActor,
    page: PaginationInput,
    filters: {
      readonly status?: 'active' | 'archived'
      readonly documentType?: 'transcript' | 'certificate'
    } = {}
  ): Promise<unknown> {
    return this.listTemplatesWithLatestVersion(actor, page, filters)
  }

  private async listTemplatesWithLatestVersion(
    actor: AuthenticatedActor,
    page: PaginationInput,
    filters: {
      readonly status?: 'active' | 'archived'
      readonly documentType?: 'transcript' | 'certificate'
    }
  ): Promise<unknown> {
    const canManageGlobally = hasTenantDocumentTemplateManagementScope(actor)
    const publishedTemplateIds = canManageGlobally
      ? undefined
      : await this.versions
          .distinct('templateId', { status: 'published' })
          .exec()
    const filter: QueryFilter<DocumentTemplateRecord> = {
      ...(canManageGlobally && filters.status
        ? { status: filters.status }
        : canManageGlobally
          ? {}
          : { status: 'active' as const }),
      ...(!canManageGlobally
        ? { _id: { $in: publishedTemplateIds ?? [] } }
        : {}),
      ...(filters.documentType ? { documentType: filters.documentType } : {})
    }
    const [templates, total] = await Promise.all([
      this.templates
        .find(filter)
        .sort({ code: 1, _id: 1 })
        .skip((page.page - 1) * page.pageSize)
        .limit(page.pageSize)
        .exec(),
      this.templates.countDocuments(filter).exec()
    ])
    const templateIds = templates.map((template) => template.id)
    const versions = templateIds.length
      ? await this.versions
          .find({
            templateId: { $in: templateIds },
            ...(!canManageGlobally ? { status: 'published' as const } : {})
          })
          .select(
            'templateId versionNumber status schemaVersion revision canonicalJson.editorMetadata'
          )
          .sort({ versionNumber: -1, _id: -1 })
          .exec()
      : []
    const latest = new Map<
      string,
      HydratedDocument<DocumentTemplateVersionRecord>
    >()
    for (const version of versions) {
      if (!latest.has(version.templateId))
        latest.set(version.templateId, version)
    }
    return {
      items: templates.map((template) => {
        const version = latest.get(template.id)
        return {
          ...template.toJSON(),
          latestVersion: version
            ? {
                id: version.id,
                versionNumber: version.versionNumber,
                status: version.status,
                schemaVersion: version.schemaVersion ?? 1,
                revision: version.revision ?? 1,
                editorMetadata: projectTemplateEditorMetadata(
                  version.canonicalJson.editorMetadata
                )
              }
            : null
        }
      }),
      meta: {
        page: page.page,
        pageSize: page.pageSize,
        total,
        totalPages: Math.ceil(total / page.pageSize)
      }
    }
  }

  public async createTemplate(
    actor: AuthenticatedActor,
    input: {
      code: string
      name: string
      documentType: 'transcript' | 'certificate'
      schemaVersion: 1 | 2
      canonicalJson: Readonly<Record<string, unknown>>
      placeholders: readonly string[]
      fontAssetKeys: readonly string[]
    }
  ): Promise<unknown> {
    if (!hasTenantDocumentTemplateManagementScope(actor)) {
      throw new ForbiddenException({ code: 'PERMISSION_DENIED' })
    }
    this.validateDraftTemplate(
      input.canonicalJson,
      input.placeholders,
      input.schemaVersion
    )
    try {
      const result = await runWithTransaction(
        this.templates.db,
        async (session) => {
          const [template] = await this.templates.create(
            [
              {
                code: input.code,
                name: input.name,
                documentType: input.documentType,
                status: 'active'
              }
            ],
            session ? { session } : {}
          )
          if (!template)
            throw new ConflictException({ code: 'TEMPLATE_CREATE_FAILED' })
          const [version] = await this.versions.create(
            [
              {
                templateId: template.id,
                versionNumber: 1,
                schemaVersion: input.schemaVersion,
                revision: 1,
                status: 'draft',
                canonicalJson: input.canonicalJson,
                placeholders: [...input.placeholders],
                fontAssetKeys: [...input.fontAssetKeys]
              }
            ],
            session ? { session } : {}
          )
          if (!version)
            throw new ConflictException({ code: 'VERSION_CREATE_FAILED' })
          return { template, version }
        }
      )
      if (!result)
        throw new ConflictException({ code: 'TEMPLATE_CREATE_FAILED' })
      return {
        ...result.template.toJSON(),
        versions: [result.version.toJSON()]
      }
    } catch (error: unknown) {
      if (this.isDuplicateKey(error)) {
        throw new ConflictException({ code: 'TEMPLATE_CODE_ALREADY_EXISTS' })
      }
      throw error
    }
  }

  public async activateTemplate(
    actor: AuthenticatedActor,
    templateId: string
  ): Promise<unknown> {
    if (!hasTenantDocumentTemplateManagementScope(actor)) {
      throw new ForbiddenException({ code: 'PERMISSION_DENIED' })
    }
    const template = await this.templates.findById(templateId).exec()
    if (!template) {
      throw new NotFoundException({ code: 'RESOURCE_NOT_FOUND' })
    }

    const documentType = template.documentType
    if (!documentType) {
      throw new UnprocessableEntityException({
        code: 'TEMPLATE_DOCUMENT_TYPE_REQUIRED'
      })
    }

    const publishedVersion = await this.versions
      .findOne({ templateId: template.id, status: 'published' })
      .exec()

    if (!publishedVersion) {
      const draftVersion = await this.versions
        .findOne({ templateId: template.id, status: 'draft' })
        .sort({ versionNumber: -1, _id: -1 })
        .exec()
      if (draftVersion) {
        draftVersion.status = 'published'
        draftVersion.publishedAt = new Date()
        await draftVersion.save()
      } else {
        throw new UnprocessableEntityException({
          code: 'PUBLISHED_VERSION_REQUIRED'
        })
      }
    }

    // Enforce strictly 1 active template per type:
    // Archive other templates of the same documentType
    await this.templates
      .updateMany(
        { documentType, _id: { $ne: template._id } },
        { $set: { status: 'archived' } }
      )
      .exec()

    template.status = 'active'
    await template.save()

    const latest = await this.versions
      .findOne({ templateId: template.id })
      .sort({ versionNumber: -1, _id: -1 })
      .exec()

    return {
      ...template.toJSON(),
      latestVersion: latest
        ? {
            id: latest.id,
            versionNumber: latest.versionNumber,
            status: latest.status,
            schemaVersion: latest.schemaVersion ?? 1,
            revision: latest.revision ?? 1,
            editorMetadata:
              (latest.canonicalJson as Record<string, unknown>)
                ?.editorMetadata ?? null
          }
        : null
    }
  }

  public async deactivateTemplate(
    actor: AuthenticatedActor,
    templateId: string
  ): Promise<unknown> {
    if (!hasTenantDocumentTemplateManagementScope(actor)) {
      throw new ForbiddenException({ code: 'PERMISSION_DENIED' })
    }
    const template = await this.templates.findById(templateId).exec()
    if (!template) {
      throw new NotFoundException({ code: 'RESOURCE_NOT_FOUND' })
    }

    template.status = 'archived'
    await template.save()

    const latest = await this.versions
      .findOne({ templateId: template.id })
      .sort({ versionNumber: -1, _id: -1 })
      .exec()

    return {
      ...template.toJSON(),
      latestVersion: latest
        ? {
            id: latest.id,
            versionNumber: latest.versionNumber,
            status: latest.status,
            schemaVersion: latest.schemaVersion ?? 1,
            revision: latest.revision ?? 1,
            editorMetadata:
              (latest.canonicalJson as Record<string, unknown>)
                ?.editorMetadata ?? null
          }
        : null
    }
  }

  public async listVersions(
    actor: AuthenticatedActor,
    templateId: string,
    page: PaginationInput,
    status?: 'draft' | 'published' | 'retired'
  ): Promise<unknown> {
    const canManageGlobally = hasTenantDocumentTemplateManagementScope(actor)
    const templateExists = await this.templates.exists({
      _id: templateId,
      ...(!canManageGlobally ? { status: 'active' } : {})
    })
    if (!templateExists)
      throw new NotFoundException({ code: 'RESOURCE_NOT_FOUND' })
    if (!canManageGlobally) {
      const filter = { templateId, status: 'published' as const }
      const [versions, total] = await Promise.all([
        this.versions
          .find(filter)
          .select(
            'templateId versionNumber status schemaVersion revision publishedAt'
          )
          .sort({ versionNumber: -1, _id: -1 })
          .skip((page.page - 1) * page.pageSize)
          .limit(page.pageSize)
          .exec(),
        this.versions.countDocuments(filter).exec()
      ])
      return {
        items: versions.map((version) => version.toJSON()),
        meta: {
          page: page.page,
          pageSize: page.pageSize,
          total,
          totalPages: Math.ceil(total / page.pageSize)
        }
      }
    }
    return paginate(
      this.versions,
      { templateId, ...(status ? { status } : {}) },
      page,
      { versionNumber: -1, _id: -1 }
    )
  }

  public async createVersion(
    actor: AuthenticatedActor,
    templateId: string,
    input: {
      schemaVersion: 1 | 2
      canonicalJson: Readonly<Record<string, unknown>>
      placeholders: readonly string[]
      fontAssetKeys: readonly string[]
    }
  ): Promise<unknown> {
    if (!hasTenantDocumentTemplateManagementScope(actor)) {
      throw new ForbiddenException({ code: 'PERMISSION_DENIED' })
    }
    this.validateDraftTemplate(
      input.canonicalJson,
      input.placeholders,
      input.schemaVersion
    )
    try {
      const created = await runWithTransaction(
        this.templates.db,
        async (session) => {
          const template = await this.templates
            .findOne({ _id: templateId, status: 'active' })
            .session(session ?? null)
            .exec()
          if (!template)
            throw new NotFoundException({ code: 'RESOURCE_NOT_FOUND' })
          const latest = await this.versions
            .findOne({ templateId })
            .sort({ versionNumber: -1 })
            .session(session ?? null)
            .exec()
          const [version] = await this.versions.create(
            [
              {
                templateId,
                versionNumber: (latest?.versionNumber ?? 0) + 1,
                schemaVersion: input.schemaVersion,
                revision: 1,
                status: 'draft',
                canonicalJson: input.canonicalJson,
                placeholders: [...input.placeholders],
                fontAssetKeys: [...input.fontAssetKeys]
              }
            ],
            session ? { session } : {}
          )
          if (!version)
            throw new ConflictException({ code: 'VERSION_CREATE_FAILED' })
          return version
        }
      )
      if (!created)
        throw new ConflictException({ code: 'VERSION_CREATE_FAILED' })
      return created.toJSON()
    } catch (error: unknown) {
      if (this.isDuplicateKey(error)) {
        throw new ConflictException({ code: 'VERSION_CONFLICT' })
      }
      throw error
    }
  }

  public async getVersion(
    actor: AuthenticatedActor,
    id: string
  ): Promise<unknown> {
    const canManageGlobally = hasTenantDocumentTemplateManagementScope(actor)
    const version = canManageGlobally
      ? await this.versions.findById(id).exec()
      : await this.versions
          .findOne({ _id: id, status: 'published' })
          .select(
            'templateId versionNumber status schemaVersion revision publishedAt'
          )
          .exec()
    if (!version) throw new NotFoundException({ code: 'RESOURCE_NOT_FOUND' })
    if (
      !canManageGlobally &&
      !(await this.templates.exists({
        _id: version.templateId,
        status: 'active'
      }))
    ) {
      throw new NotFoundException({ code: 'RESOURCE_NOT_FOUND' })
    }
    return version.toJSON()
  }

  public async updateVersion(
    actor: AuthenticatedActor,
    id: string,
    input: {
      readonly revision: number
      readonly schemaVersion: 1 | 2
      readonly canonicalJson: Readonly<Record<string, unknown>>
      readonly placeholders: readonly string[]
      readonly fontAssetKeys: readonly string[]
    }
  ): Promise<unknown> {
    if (!hasTenantDocumentTemplateManagementScope(actor)) {
      throw new ForbiddenException({ code: 'PERMISSION_DENIED' })
    }
    this.validateDraftTemplate(
      input.canonicalJson,
      input.placeholders,
      input.schemaVersion
    )
    const version = await this.versions
      .findOneAndUpdate(
        { _id: id, status: 'draft', revision: input.revision },
        {
          $set: {
            schemaVersion: input.schemaVersion,
            canonicalJson: input.canonicalJson,
            placeholders: [...input.placeholders],
            fontAssetKeys: [...input.fontAssetKeys]
          },
          $inc: { revision: 1 }
        },
        { returnDocument: 'after', runValidators: true }
      )
      .exec()
    if (!version) {
      const exists = await this.versions.exists({ _id: id })
      if (!exists) throw new NotFoundException({ code: 'RESOURCE_NOT_FOUND' })
      const draft = await this.versions.exists({
        _id: id,
        status: 'draft'
      })
      throw new ConflictException({
        code: draft ? 'VERSION_CONFLICT' : 'PUBLISHED_VERSION_IMMUTABLE'
      })
    }
    return version.toJSON()
  }

  public async publishVersion(
    actor: AuthenticatedActor,
    id: string
  ): Promise<unknown> {
    if (!hasTenantDocumentTemplateManagementScope(actor)) {
      throw new ForbiddenException({ code: 'PERMISSION_DENIED' })
    }
    const current = await this.versions.findById(id).exec()
    if (!current) throw new NotFoundException({ code: 'RESOURCE_NOT_FOUND' })
    if (current.status !== 'draft') {
      throw new ConflictException({ code: 'PUBLISHED_VERSION_IMMUTABLE' })
    }
    const template = await this.templates.findOne({
      _id: current.templateId,
      status: 'active'
    })
    if (!template) throw new NotFoundException({ code: 'RESOURCE_NOT_FOUND' })
    this.validateCanonicalTemplate(
      current.canonicalJson,
      current.placeholders,
      current.fontAssetKeys,
      current.schemaVersion ?? 1
    )
    if ((current.schemaVersion ?? 1) === 2) {
      this.validateV2PublicationData(
        current.canonicalJson,
        current.placeholders
      )
      await this.resolveImageAssets(
        2,
        current.canonicalJson,
        current.placeholders
      )
    }
    const registeredFonts = await this.assets
      .find({
        key: { $in: current.fontAssetKeys },
        assetType: 'font',
        status: 'active'
      })
      .select('key fontFamily')
      .lean()
      .exec()
    if (
      registeredFonts.length !== new Set(current.fontAssetKeys).size ||
      registeredFonts.some(
        (asset) => !current.fontAssetKeys.includes(asset.key)
      )
    ) {
      throw new UnprocessableEntityException({
        code: 'DOCUMENT_FONT_ASSET_NOT_REGISTERED'
      })
    }
    this.validateFontAssetFamilyMapping(
      current.canonicalJson,
      current.placeholders,
      current.schemaVersion ?? 1,
      registeredFonts[0]?.fontFamily,
      true
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
        { _id: id, status: 'draft', revision: current.revision ?? 1 },
        { $set: { status: 'published', publishedAt: new Date() } },
        { returnDocument: 'after' }
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
    idempotencyKey: string,
    requestId = 'unknown'
  ): Promise<unknown> {
    const student = await this.resolveStudent(actor, input.studentId)
    const canonicalStudentId = student.id
    const scopedKey = idempotencyScopeKey(
      actor.id,
      'generated-document',
      idempotencyKey
    )
    const requestedEvaluationIds = [...new Set(input.evaluationIds)].sort()
    const payloadHash = requestHash({
      studentId: canonicalStudentId,
      templateVersionId: input.templateVersionId,
      evaluationIds: requestedEvaluationIds
    })
    let document = await this.documents
      .findOne({ idempotencyScopeKey: scopedKey })
      .exec()
    if (document && document.requestHash !== payloadHash) {
      throw new ConflictException({ code: 'IDEMPOTENCY_KEY_REUSED' })
    }
    if (
      document &&
      !(
        document.status === 'failed' &&
        document.failureCode === 'QUEUE_ENQUEUE_FAILED'
      )
    ) {
      return document.toJSON()
    }

    if (document) {
      document.status = 'queued'
      document.failureCode = undefined
      await document.save()
    } else {
      const template = await this.versions.findOne({
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
        requestedEvaluationIds
      )
      const sourceSnapshot = await this.createIssueSnapshot(
        student,
        template,
        source
      )
      try {
        document = await this.createGenerationRequest({
          actor,
          canonicalStudentId,
          evaluationIds: source.evaluationIds,
          idempotencyKey: scopedKey,
          payloadHash,
          requestId,
          sourceSnapshot,
          resourceScopes: [
            {
              schoolIds: [student.schoolId],
              programIds: [student.programId]
            }
          ],
          templateVersionId: input.templateVersionId
        })
      } catch (error: unknown) {
        if (!this.isDuplicateKey(error)) throw error
        document = await this.documents
          .findOne({ idempotencyScopeKey: scopedKey })
          .exec()
        if (!document) throw error
        if (document.requestHash !== payloadHash) {
          throw new ConflictException({ code: 'IDEMPOTENCY_KEY_REUSED' })
        }
        return document.toJSON()
      }
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

  private async createGenerationRequest(input: {
    readonly actor: AuthenticatedActor
    readonly canonicalStudentId: string
    readonly templateVersionId: string
    readonly evaluationIds: readonly string[]
    readonly idempotencyKey: string
    readonly payloadHash: string
    readonly requestId: string
    readonly sourceSnapshot: DocumentIssueSnapshotV1
    readonly resourceScopes: readonly AuditResourceScope[]
  }): Promise<HydratedDocument<GeneratedDocumentRecord>> {
    const create = async (
      session?: ClientSession
    ): Promise<HydratedDocument<GeneratedDocumentRecord>> => {
      const record = {
        studentId: input.canonicalStudentId,
        templateVersionId: input.templateVersionId,
        evaluationIds: [...input.evaluationIds],
        idempotencyKey: input.idempotencyKey,
        idempotencyScopeKey: input.idempotencyKey,
        requestHash: input.payloadHash,
        requestedBy: input.actor.id,
        requestedByEmail: input.actor.email,
        requestId: input.requestId,
        sourceSnapshot: input.sourceSnapshot,
        resourceScopes: input.resourceScopes.map(
          ({ tenant, schoolIds, programIds }) => ({
            ...(tenant !== undefined ? { tenant } : {}),
            ...(schoolIds ? { schoolIds: [...schoolIds] } : {}),
            ...(programIds ? { programIds: [...programIds] } : {})
          })
        ),
        status: 'queued' as const
      }
      const [document] = session
        ? await this.documents.create([record], { session })
        : await this.documents.create([record])
      if (!document)
        throw new Error('Document request write returned no record')
      document.sourceSnapshot = {
        ...input.sourceSnapshot,
        documentNumber: `MFU-${input.sourceSnapshot.template.documentType === 'certificate' ? 'CERT' : 'TR'}-${document.id.toUpperCase()}`
      }
      await document.save()
      await this.auditService.record(
        {
          requestId: input.requestId,
          actorId: input.actor.id,
          actorEmail: input.actor.email,
          action: 'documents.generation_requested',
          route: 'POST /api/v2/generated-documents',
          method: 'POST',
          resourceScopes: input.resourceScopes,
          metadata: {
            actorRoles: input.actor.roles,
            studentId: input.canonicalStudentId,
            documentId: document.id,
            templateVersionId: input.templateVersionId,
            evaluationIds: input.evaluationIds
          }
        },
        session
      )
      return document
    }

    return runWithTransaction(this.documents.db, async (session) => {
      const document = await create(session)
      if (!document) throw new Error('Document request transaction was empty')
      return document
    })
  }

  public async listDocuments(
    actor: AuthenticatedActor,
    page: PaginationInput
  ): Promise<unknown> {
    const filter = await this.documentScope(actor)
    const [documents, total] = await Promise.all([
      this.documents
        .find(filter)
        .sort({ createdAt: -1, _id: -1 })
        .skip((page.page - 1) * page.pageSize)
        .limit(page.pageSize)
        .exec(),
      this.documents.countDocuments(filter).exec()
    ])
    const versions = documents.length
      ? await this.versions
          .find({
            _id: {
              $in: documents.map((document) => document.templateVersionId)
            }
          })
          .select('_id templateId')
          .lean()
          .exec()
      : []
    const templateIds = [
      ...new Set(versions.map((version) => version.templateId))
    ]
    const templates = templateIds.length
      ? await this.templates
          .find({ _id: { $in: templateIds } })
          .select('_id documentType')
          .lean()
          .exec()
      : []
    const templateTypeById = new Map(
      templates.map((template) => [
        template._id.toString(),
        template.documentType ?? null
      ])
    )
    const documentTypeByVersionId = new Map(
      versions.map((version) => [
        version._id.toString(),
        templateTypeById.get(version.templateId) ?? null
      ])
    )
    return {
      items: documents.map((document) => {
        const documentType = documentTypeByVersionId.get(
          document.templateVersionId
        )
        const view = document.toJSON() as unknown as Record<string, unknown>
        return {
          ...view,
          documentType,
          documentNumber:
            document.status === 'ready' && documentType
              ? `MFU-${documentType === 'certificate' ? 'CERT' : 'TR'}-${document.id.toUpperCase()}`
              : null
        }
      }),
      meta: {
        page: page.page,
        pageSize: page.pageSize,
        total,
        totalPages: Math.ceil(total / page.pageSize)
      }
    }
  }

  public async getDocument(
    actor: AuthenticatedActor,
    id: string,
    requestId = 'unknown'
  ): Promise<GeneratedDocumentRecord & { toJSON(): unknown }> {
    const scope = await this.documentScope(actor)
    const document = await this.documents
      .findOne({
        _id: id,
        ...scope
      })
      .select('+resourceScopes')
    if (!document) {
      await this.recordDocumentAudit(actor, {
        requestId,
        action: 'documents.access_denied',
        outcome: 'failure',
        route: 'GET /api/v2/documents/generated-documents/:documentId',
        metadata: {
          resourceType: 'generatedDocument',
          result: 'not_found_or_out_of_scope'
        }
      })
      throw new NotFoundException({ code: 'RESOURCE_NOT_FOUND' })
    }
    return document
  }

  public async downloadUrl(
    actor: AuthenticatedActor,
    id: string,
    requestId = 'unknown'
  ): Promise<unknown> {
    const document = await this.getDocument(actor, id, requestId)
    if (document.status !== 'ready' || !document.objectKey) {
      await this.recordDocumentAudit(actor, {
        requestId,
        action: 'documents.download_denied',
        outcome: 'failure',
        route:
          'GET /api/v2/documents/generated-documents/:documentId/download-url',
        resourceScopes: document.resourceScopes,
        metadata: {
          documentId: id,
          reason: 'not_ready'
        }
      })
      throw new ConflictException({ code: 'DOCUMENT_NOT_READY' })
    }
    const url = await getSignedUrl(
      this.s3,
      new GetObjectCommand({
        Bucket: this.bucket,
        Key: document.objectKey,
        ResponseContentType: 'application/pdf',
        ResponseContentDisposition:
          'attachment; filename="internship-document.pdf"'
      }),
      { expiresIn: 300 }
    )
    await this.recordDocumentAudit(actor, {
      requestId,
      action: 'documents.download_url_issued',
      outcome: 'success',
      route:
        'GET /api/v2/documents/generated-documents/:documentId/download-url',
      resourceScopes: document.resourceScopes,
      metadata: { documentId: id, expiresIn: 300 }
    })
    return {
      url,
      expiresIn: 300
    }
  }

  private async recordDocumentAudit(
    actor: AuthenticatedActor,
    input: {
      readonly requestId: string
      readonly action: string
      readonly outcome: 'success' | 'failure'
      readonly route: string
      readonly resourceScopes?: readonly AuditResourceScope[]
      readonly metadata: Readonly<Record<string, unknown>>
    }
  ): Promise<void> {
    try {
      await this.auditService.record({
        ...input,
        actorId: actor.id,
        actorEmail: actor.email,
        method: 'GET'
      })
    } catch {
      throw new ServiceUnavailableException({ code: 'AUDIT_UNAVAILABLE' })
    }
  }

  private async documentScope(
    actor: AuthenticatedActor
  ): Promise<QueryFilter<GeneratedDocumentRecord>> {
    if (
      actor.roles.includes('systemAdmin') ||
      this.hasTenantStaffScope(actor)
    ) {
      return {}
    }

    const studentReferences = new Set<string>()
    if (actor.roles.includes('student') && actor.scope.studentId) {
      studentReferences.add(actor.scope.studentId)
      const student = await this.students
        .findOne(studentReferenceFilter(actor.scope.studentId))
        .select('_id studentId')
        .lean()
        .exec()
      if (student) {
        studentReferences.add(student._id.toString())
        studentReferences.add(student.studentId)
      }
    }

    const hasScopedReadRole = DOCUMENT_READ_SCOPE_ROLES.some((role) =>
      actor.roles.includes(role)
    )
    if (hasScopedReadRole) {
      const scopedStudents = await this.students
        .find(scopeFilter<StudentRecord>(actor, DOCUMENT_READ_SCOPE_ROLES))
        .select('_id studentId')
        .lean()
        .exec()
      for (const student of scopedStudents) {
        studentReferences.add(student._id.toString())
        studentReferences.add(student.studentId)
      }
    }

    if (studentReferences.size > 0) {
      return { studentId: { $in: [...studentReferences] } }
    }
    if (hasScopedReadRole) return { studentId: { $in: [] } }
    throw new ForbiddenException({ code: 'PERMISSION_DENIED' })
  }

  private hasTenantStaffScope(actor: AuthenticatedActor): boolean {
    if (!actor.roles.includes('internshipStaff')) return false
    if (actor.roleScopes) {
      return actor.roleScopes.some(
        (scope) =>
          scope.role === 'internshipStaff' &&
          actor.roles.includes(scope.role) &&
          scope.tenant
      )
    }
    return actor.roles.length === 1 && actor.scope.tenant
  }

  private async resolveStudent(
    actor: AuthenticatedActor,
    id: string
  ): Promise<HydratedDocument<StudentRecord>> {
    const identity = studentReferenceFilter(id)
    if (actor.roles.includes('systemAdmin')) {
      const student = await this.students.findOne(identity).exec()
      if (!student) throw new NotFoundException({ code: 'RESOURCE_NOT_FOUND' })
      return student
    }

    const allowedStudentScopes: QueryFilter<StudentRecord>[] = []
    if (actor.roles.includes('student') && actor.scope.studentId) {
      allowedStudentScopes.push(studentReferenceFilter(actor.scope.studentId))
    }
    if (actor.roles.includes('internshipStaff')) {
      allowedStudentScopes.push(
        scopeFilter<StudentRecord>(actor, ['internshipStaff'])
      )
    }
    if (allowedStudentScopes.length === 0) {
      throw new NotFoundException({ code: 'RESOURCE_NOT_FOUND' })
    }
    const accessFilter =
      allowedStudentScopes.length === 1
        ? allowedStudentScopes[0]!
        : { $or: allowedStudentScopes }
    const filter: QueryFilter<StudentRecord> = {
      $and: [identity, accessFilter]
    }
    const student = await this.students.findOne(filter).exec()
    if (!student) throw new NotFoundException({ code: 'RESOURCE_NOT_FOUND' })
    return student
  }

  private async createIssueSnapshot(
    student: HydratedDocument<StudentRecord>,
    templateVersion: HydratedDocument<DocumentTemplateVersionRecord>,
    source: {
      readonly evaluationIds: readonly string[]
      readonly evaluations: readonly HydratedDocument<EvaluationRecord>[]
      readonly assignments: readonly HydratedDocument<EvaluationAssignmentRecord>[]
    }
  ): Promise<DocumentIssueSnapshotV1> {
    const placementIds = [
      ...new Set(source.assignments.map((assignment) => assignment.placementId))
    ]
    if (placementIds.length !== 1) {
      throw new UnprocessableEntityException({
        code: 'DOCUMENT_PLACEMENT_AMBIGUOUS'
      })
    }
    const placementId = placementIds[0]
    if (!placementId) {
      throw new UnprocessableEntityException({
        code: 'DOCUMENT_PLACEMENT_REQUIRED'
      })
    }
    const placement = await this.placements
      .findOne({
        _id: placementId,
        studentId: { $in: [student.id, student.studentId] },
        status: 'completed'
      })
      .exec()
    if (!placement) {
      throw new UnprocessableEntityException({
        code: 'DOCUMENT_COMPLETED_PLACEMENT_REQUIRED'
      })
    }
    if (
      placement.schoolId !== student.schoolId ||
      placement.programId !== student.programId
    ) {
      throw new UnprocessableEntityException({
        code: 'DOCUMENT_PLACEMENT_SCOPE_MISMATCH'
      })
    }

    const [school, program, organization, term, parentTemplate, fontAssets] =
      await Promise.all([
        this.schools.findById(placement.schoolId).exec(),
        this.programs.findById(placement.programId).exec(),
        this.organizations.findById(placement.organizationId).exec(),
        this.terms.findById(placement.academicTermId).exec(),
        this.templates
          .findOne({ _id: templateVersion.templateId, status: 'active' })
          .exec(),
        this.assets
          .find({
            key: { $in: templateVersion.fontAssetKeys },
            assetType: 'font',
            status: 'active'
          })
          .select('key sha256 fontFamily')
          .exec()
      ])
    if (
      !school ||
      !program ||
      program.schoolId !== school.id ||
      !organization ||
      !term ||
      !parentTemplate?.documentType ||
      !Number.isFinite(placement.startsAt.getTime()) ||
      !Number.isFinite(placement.endsAt.getTime()) ||
      placement.endsAt < placement.startsAt
    ) {
      throw new UnprocessableEntityException({
        code: 'DOCUMENT_SOURCE_DATA_INCOMPLETE'
      })
    }
    const fontAssetKeys = templateVersion.fontAssetKeys ?? []
    let resolvedFontAssets = fontAssets
    if (fontAssetKeys.length > 0) {
      if (
        fontAssetKeys.length !== 1 ||
        new Set(fontAssetKeys).size !== fontAssetKeys.length ||
        fontAssets.length !== new Set(fontAssetKeys).size ||
        fontAssets.some((asset) => !fontAssetKeys.includes(asset.key))
      ) {
        throw new UnprocessableEntityException({
          code:
            fontAssetKeys.length === 1
              ? 'DOCUMENT_FONT_ASSET_NOT_REGISTERED'
              : 'DOCUMENT_FONT_MAPPING_UNSUPPORTED'
        })
      }
      this.validateFontAssetFamilyMapping(
        templateVersion.canonicalJson,
        templateVersion.placeholders ?? [],
        templateVersion.schemaVersion ?? 1,
        fontAssets[0]?.fontFamily,
        false
      )
    } else if (resolvedFontAssets.length === 0) {
      const defaultFont = await this.assets
        .findOne({ assetType: 'font', status: 'active' })
        .select('key sha256 fontFamily')
        .exec()
      if (defaultFont) {
        resolvedFontAssets = [defaultFont]
      }
    }

    const imageAssets = await this.resolveImageAssets(
      templateVersion.schemaVersion ?? 1,
      templateVersion.canonicalJson,
      templateVersion.placeholders ?? [],
      false
    )

    return {
      snapshotVersion: 1,
      capturedAt: new Date().toISOString(),
      documentNumber: '',
      template: {
        versionId: templateVersion.id,
        documentType: parentTemplate.documentType,
        schemaVersion: templateVersion.schemaVersion ?? 1,
        canonicalJson: templateVersion.canonicalJson,
        placeholders: [...(templateVersion.placeholders ?? [])],
        fontAssets: resolvedFontAssets.map((asset) => ({
          key: asset.key,
          sha256: asset.sha256,
          ...(asset.fontFamily ? { fontFamily: asset.fontFamily } : {})
        })),
        ...(imageAssets.length > 0 ? { imageAssets } : {})
      },
      student: {
        recordId: student.id,
        studentId: student.studentId,
        name: resolveStudentNamePair(student.name),
        academicYear: term.academicYear,
        schoolId: school.id,
        schoolName: { th: school.name.th, en: school.name.en },
        programId: program.id,
        programName: { th: program.name.th, en: program.name.en }
      },
      placement: {
        id: placement.id,
        organizationId: organization.id,
        organizationName: {
          th: organization.name.th,
          en: organization.name.en
        },
        positionTitle: {
          th: placement.positionTitle.th,
          en: placement.positionTitle.en
        },
        schoolId: placement.schoolId,
        programId: placement.programId,
        startsAt: placement.startsAt.toISOString(),
        endsAt: placement.endsAt.toISOString(),
        academicTermId: term.id,
        academicTermCode: term.code,
        academicYear: term.academicYear,
        semester: term.semester
      },
      evaluations: source.evaluations.map((evaluation) => ({
        id: evaluation.id,
        assignmentId: evaluation.assignmentId,
        version: evaluation.version,
        submittedAt: evaluation.submittedAt.toISOString(),
        answers: evaluation.answers,
        questionSnapshot: evaluation.questionSnapshot,
        categoryScores: evaluation.categoryScores ?? null
      }))
    }
  }

  private async validateEvaluationSources(
    studentRecordId: string,
    studentNumber: string,
    evaluationIds: readonly string[]
  ): Promise<{
    readonly evaluationIds: readonly string[]
    readonly evaluations: readonly HydratedDocument<EvaluationRecord>[]
    readonly assignments: readonly HydratedDocument<EvaluationAssignmentRecord>[]
  }> {
    const uniqueIds = [...new Set(evaluationIds)]
    if (uniqueIds.length === 0) {
      throw new UnprocessableEntityException({
        code: 'DOCUMENT_EVALUATION_REQUIRED'
      })
    }
    const evaluations = await this.evaluations
      .find({ _id: { $in: uniqueIds } })
      .select(
        '_id assignmentId version supersededAt answers questionSnapshot categoryScores submittedAt'
      )
      .exec()
    if (evaluations.length !== uniqueIds.length) {
      throw new UnprocessableEntityException({
        code: 'EVALUATION_SOURCE_INVALID'
      })
    }
    const assignmentIds = evaluations.map(
      (evaluation) => evaluation.assignmentId
    )
    const uniqueAssignmentIds = new Set(assignmentIds)
    if (
      uniqueAssignmentIds.size !== assignmentIds.length ||
      evaluations.some((evaluation) => evaluation.supersededAt)
    ) {
      throw new UnprocessableEntityException({
        code: 'EVALUATION_SOURCE_INVALID'
      })
    }
    const matchingAssignments = await this.assignments
      .find({
        _id: { $in: assignmentIds },
        studentId: { $in: [studentRecordId, studentNumber] },
        status: 'submitted'
      })
      .select('_id evaluationVersion placementId')
      .exec()
    const assignmentVersions = new Map(
      matchingAssignments.map((assignment) => [
        assignment.id,
        assignment.evaluationVersion
      ])
    )
    if (
      matchingAssignments.length !== uniqueAssignmentIds.size ||
      evaluations.some(
        (evaluation) =>
          assignmentVersions.get(evaluation.assignmentId) !== evaluation.version
      )
    ) {
      throw new UnprocessableEntityException({
        code: 'EVALUATION_SOURCE_INVALID'
      })
    }
    return {
      evaluationIds: evaluations.map((evaluation) => evaluation.id),
      evaluations,
      assignments: matchingAssignments
    }
  }

  private validateCanonicalTemplate(
    canonical: Readonly<Record<string, unknown>>,
    declaredPlaceholders: readonly string[],
    fontAssetKeys: readonly string[],
    schemaVersion: number
  ): void {
    const invalid = (): never => {
      throw new UnprocessableEntityException({
        code: 'DOCUMENT_TEMPLATE_INVALID'
      })
    }
    if (
      !this.isCanonicalTemplateValid(
        canonical,
        declaredPlaceholders,
        schemaVersion
      ) ||
      fontAssetKeys.length === 0 ||
      fontAssetKeys.some((key) => !key.trim())
    ) {
      invalid()
    }
    if (
      fontAssetKeys.length !== 1 ||
      new Set(fontAssetKeys).size !== fontAssetKeys.length
    ) {
      throw new UnprocessableEntityException({
        code: 'DOCUMENT_FONT_MAPPING_UNSUPPORTED'
      })
    }
  }

  private validateDraftTemplate(
    canonical: Readonly<Record<string, unknown>>,
    declaredPlaceholders: readonly string[],
    schemaVersion: number
  ): void {
    if (
      !this.isCanonicalTemplateValid(
        canonical,
        declaredPlaceholders,
        schemaVersion
      )
    ) {
      throw new UnprocessableEntityException({
        code: 'DOCUMENT_TEMPLATE_INVALID'
      })
    }
  }

  private isCanonicalTemplateValid(
    canonical: Readonly<Record<string, unknown>>,
    declaredPlaceholders: readonly string[],
    schemaVersion: number
  ): boolean {
    if (schemaVersion === 1) {
      return Boolean(
        parseCanonicalDocumentV1(canonical, schemaVersion, declaredPlaceholders)
      )
    }
    return Boolean(
      parseCanonicalDocumentV2(canonical, schemaVersion, declaredPlaceholders)
    )
  }

  private validateV2PublicationData(
    canonicalJson: Readonly<Record<string, unknown>>,
    placeholders: readonly string[]
  ): void {
    const canonical = parseCanonicalDocumentV2(canonicalJson, 2, placeholders)
    if (!canonical) {
      throw new UnprocessableEntityException({
        code: 'DOCUMENT_TEMPLATE_INVALID'
      })
    }
    if (placeholders.includes('total_hours')) {
      throw new UnprocessableEntityException({
        code: 'DOCUMENT_PLACEHOLDER_SOURCE_UNAVAILABLE',
        placeholder: 'total_hours'
      })
    }
    if (
      canonical.elements.some(
        (element) =>
          element.type === 'table' && element.content !== 'COMPETENCY_TABLE'
      )
    ) {
      throw new UnprocessableEntityException({
        code: 'DOCUMENT_TABLE_RENDERER_UNSUPPORTED'
      })
    }
    const fontFamilies = new Set(
      canonical.elements.flatMap((element) =>
        element.fontFamily ? [normalizeFontFamilyStack(element.fontFamily)] : []
      )
    )
    if (fontFamilies.size > 1) {
      throw new UnprocessableEntityException({
        code: 'DOCUMENT_FONT_MAPPING_UNSUPPORTED'
      })
    }
    if (
      typeof canonicalJson.editorMetadata === 'object' &&
      canonicalJson.editorMetadata !== null &&
      !Array.isArray(canonicalJson.editorMetadata) &&
      'backgroundType' in canonicalJson.editorMetadata &&
      canonicalJson.editorMetadata.backgroundType !== 'none'
    ) {
      throw new UnprocessableEntityException({
        code: 'DOCUMENT_BACKGROUND_RENDERER_UNSUPPORTED'
      })
    }
  }

  private validateFontAssetFamilyMapping(
    canonicalJson: Readonly<Record<string, unknown>>,
    placeholders: readonly string[],
    schemaVersion: number,
    fontFamily: string | undefined,
    requireMetadata: boolean
  ): void {
    if (!fontFamily) {
      if (requireMetadata) {
        throw new UnprocessableEntityException({
          code: 'DOCUMENT_FONT_MAPPING_UNSUPPORTED'
        })
      }
      return
    }
    if (schemaVersion !== 2) return

    const canonical = parseCanonicalDocumentV2(
      canonicalJson,
      schemaVersion,
      placeholders
    )
    if (!canonical) {
      throw new UnprocessableEntityException({
        code: 'DOCUMENT_TEMPLATE_INVALID'
      })
    }
    const embeddedFamily = normalizeFontFamilyStack(fontFamily)
    const elementFamilies = canonical.elements.flatMap((element) =>
      element.fontFamily ? [normalizeFontFamilyStack(element.fontFamily)] : []
    )
    if (
      !embeddedFamily ||
      elementFamilies.some((family) => !family || family !== embeddedFamily)
    ) {
      throw new UnprocessableEntityException({
        code: 'DOCUMENT_FONT_MAPPING_UNSUPPORTED'
      })
    }
  }

  private async resolveImageAssets(
    schemaVersion: number,
    canonicalJson: Readonly<Record<string, unknown>>,
    declaredPlaceholders: readonly string[],
    requireAssets = true
  ): Promise<
    readonly {
      key: string
      assetType: 'emblem' | 'signature'
      sha256: string
    }[]
  > {
    if (schemaVersion !== 2) return []
    const canonical = parseCanonicalDocumentV2(
      canonicalJson,
      2,
      declaredPlaceholders
    )
    if (!canonical) {
      throw new UnprocessableEntityException({
        code: 'DOCUMENT_TEMPLATE_INVALID'
      })
    }
    return this.resolveImageAssetsFromCanonical(canonical, requireAssets)
  }

  private async resolveImageAssetsFromCanonical(
    canonical: NonNullable<ReturnType<typeof parseCanonicalDocumentV2>>,
    requireAssets = true
  ): Promise<
    readonly {
      key: string
      assetType: 'emblem' | 'signature'
      sha256: string
    }[]
  > {
    const required = new Map<string, 'emblem' | 'signature'>()
    for (const element of canonical.elements) {
      if (element.type === 'emblem') {
        if (!element.assetKey) {
          if (requireAssets) {
            throw new UnprocessableEntityException({
              code: 'DOCUMENT_IMAGE_ASSET_REQUIRED',
              elementId: element.id,
              assetType: 'emblem'
            })
          }
          continue
        }
        required.set(element.assetKey, 'emblem')
      }
      if (element.type === 'signature') {
        if (!element.assetKeys || element.assetKeys.length !== 2) {
          if (requireAssets) {
            throw new UnprocessableEntityException({
              code: 'DOCUMENT_IMAGE_ASSET_REQUIRED',
              elementId: element.id,
              assetType: 'signature'
            })
          }
          continue
        }
        for (const key of element.assetKeys) {
          if (required.has(key)) {
            throw new UnprocessableEntityException({
              code: 'DOCUMENT_IMAGE_ASSET_TYPE_MISMATCH'
            })
          }
          required.set(key, 'signature')
        }
      }
    }
    if (required.size === 0) return []

    const registered = await this.assets
      .find({ key: { $in: [...required.keys()] }, status: 'active' })
      .select(
        'key assetType sha256 rightsBasis rightsConfirmedBy rightsConfirmedAt'
      )
      .lean()
      .exec()
    const byKey = new Map(registered.map((asset) => [asset.key, asset]))
    if (byKey.size !== required.size) {
      throw new UnprocessableEntityException({
        code: 'DOCUMENT_IMAGE_ASSET_NOT_REGISTERED'
      })
    }
    for (const [key, requiredType] of required) {
      const asset = byKey.get(key)
      if (
        !asset ||
        asset.assetType !== requiredType ||
        !asset.rightsBasis.trim() ||
        !asset.rightsConfirmedBy ||
        !asset.rightsConfirmedAt
      ) {
        throw new UnprocessableEntityException({
          code: 'DOCUMENT_IMAGE_ASSET_TYPE_MISMATCH'
        })
      }
    }
    try {
      await Promise.all(
        [...required.keys()].map((key) =>
          this.s3.send(new HeadObjectCommand({ Bucket: this.bucket, Key: key }))
        )
      )
    } catch {
      throw new UnprocessableEntityException({
        code: 'DOCUMENT_IMAGE_ASSET_NOT_FOUND'
      })
    }
    return [...required].map(([key, assetType]) => {
      const asset = byKey.get(key)
      if (!asset) throw new Error('DOCUMENT_IMAGE_ASSET_NOT_FOUND')
      return { key, assetType, sha256: asset.sha256 }
    })
  }

  private isDuplicateKey(error: unknown): boolean {
    return (
      typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      error.code === 11000
    )
  }

  private safeAssetName(value: string): string {
    return Array.from(value.split(/[\\/]/u).at(-1) ?? '')
      .filter((character) => {
        const codePoint = character.charCodeAt(0)
        return codePoint > 0x1f && codePoint !== 0x7f
      })
      .join('')
      .trim()
      .slice(0, 160)
  }

  private detectDocumentAsset(
    bytes: Buffer,
    assetType: DocumentAssetRecord['assetType']
  ): {
    readonly contentType: DocumentAssetRecord['contentType']
    readonly extension: 'ttf' | 'otf' | 'png'
  } | null {
    if (assetType === 'font') {
      const signature = bytes.subarray(0, 4).toString('ascii')
      if (signature === 'OTTO') {
        return { contentType: 'font/otf', extension: 'otf' }
      }
      if (signature === '\u0000\u0001\u0000\u0000' || signature === 'true') {
        return { contentType: 'font/ttf', extension: 'ttf' }
      }
      return null
    }

    const pngSignature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])
    if (
      bytes.byteLength < 24 ||
      !bytes.subarray(0, 8).equals(pngSignature) ||
      bytes.subarray(12, 16).toString('ascii') !== 'IHDR'
    ) {
      return null
    }
    const width = bytes.readUInt32BE(16)
    const height = bytes.readUInt32BE(20)
    if (
      width === 0 ||
      height === 0 ||
      width > 4096 ||
      height > 4096 ||
      width * height > 16_000_000
    ) {
      return null
    }
    return { contentType: 'image/png', extension: 'png' }
  }
}
