import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
  UploadedFile,
  UseInterceptors
} from '@nestjs/common'
import { FileInterceptor } from '@nestjs/platform-express'
import { z } from 'zod'

import {
  RequireAnyPermission,
  RequirePermissions
} from '../auth/auth.decorators.js'
import type { AuthenticatedRequest } from '../common/http.js'
import { DocumentGenerationRateLimitGuard } from './document-generation-rate-limit.guard.js'
import { DocumentsService } from './documents.service.js'

const pageFields = {
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).optional(),
  pageSize: z.coerce.number().int().min(1).max(100).optional()
}
const pagination = (query: {
  readonly page: number
  readonly limit?: number
  readonly pageSize?: number
}): { page: number; pageSize: number } => ({
  page: query.page,
  pageSize: query.pageSize ?? query.limit ?? 25
})
const pageSchema = z.object(pageFields).transform(pagination)
const templateListSchema = z
  .object({
    ...pageFields,
    status: z.enum(['active', 'archived']).optional(),
    documentType: z.enum(['transcript', 'certificate']).optional()
  })
  .transform((query) => ({
    ...pagination(query),
    status: query.status,
    documentType: query.documentType
  }))
const versionListSchema = z
  .object({
    ...pageFields,
    status: z.enum(['draft', 'published', 'retired']).optional()
  })
  .transform((query) => ({ ...pagination(query), status: query.status }))
const objectIdSchema = z.string().regex(/^[a-f\d]{24}$/i)
const canonicalJsonSchema = z
  .object({
    width: z.number().positive(),
    height: z.number().positive(),
    elements: z.array(z.record(z.string(), z.unknown()))
  })
  .passthrough()
const templateVersionSchema = z.object({
  schemaVersion: z.union([z.literal(1), z.literal(2)]),
  canonicalJson: canonicalJsonSchema,
  placeholders: z.array(z.string()).default([]),
  fontAssetKeys: z.array(z.string()).default([])
})
const templateSchema = templateVersionSchema.extend({
  code: z.string().min(1),
  name: z.string().min(1),
  documentType: z.enum(['transcript', 'certificate'])
})
const templateVersionUpdateSchema = templateVersionSchema.extend({
  revision: z.number().int().min(1)
})
const assetUploadSchema = z
  .object({
    assetType: z.enum(['font', 'emblem', 'signature', 'background']),
    rightsBasis: z.string().trim().min(1).max(1000),
    rightsConfirmed: z.literal('true')
  })
  .transform((input) => ({ ...input, rightsConfirmed: true as const }))
const assetListSchema = z
  .object({
    ...pageFields,
    assetType: z.enum(['font', 'emblem', 'signature', 'background']).optional()
  })
  .transform((query) => ({ ...pagination(query), assetType: query.assetType }))
const generateSchema = z.object({
  studentId: z.string().min(1).max(64),
  templateVersionId: objectIdSchema,
  evaluationIds: z.array(objectIdSchema).min(1).max(50)
})

@Controller()
export class DocumentsController {
  public constructor(private readonly service: DocumentsService) {}

  @RequirePermissions('documentTemplates.manage')
  @Post('document-assets')
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fields: 3, files: 1, fileSize: 8 * 1024 * 1024 }
    })
  )
  public uploadAsset(
    @Req() request: AuthenticatedRequest,
    @Body() raw: unknown,
    @UploadedFile()
    file: { readonly originalname: string; readonly buffer: Buffer } | undefined
  ): Promise<unknown> {
    if (!file) {
      throw new z.ZodError([
        {
          code: 'custom',
          path: ['file'],
          message: 'A document asset file is required.'
        }
      ])
    }
    const input = assetUploadSchema.parse(raw)
    return this.service.uploadAsset(
      request.actor!,
      input,
      file,
      request.requestId ?? 'unknown'
    )
  }

  @RequirePermissions('documentTemplates.manage')
  @Get('document-assets')
  public listAssets(
    @Req() request: AuthenticatedRequest,
    @Query() raw: unknown
  ): Promise<unknown> {
    const query = assetListSchema.parse(raw)
    return this.service.listAssets(
      request.actor!,
      { page: query.page, pageSize: query.pageSize },
      query.assetType
    )
  }

  @RequirePermissions('documentTemplates.read')
  @Get('document-templates')
  public listTemplates(
    @Req() request: AuthenticatedRequest,
    @Query() raw: unknown
  ): Promise<unknown> {
    const query = templateListSchema.parse(raw)
    return this.service.listTemplates(
      request.actor!,
      { page: query.page, pageSize: query.pageSize },
      {
        ...(query.status ? { status: query.status } : {}),
        ...(query.documentType ? { documentType: query.documentType } : {})
      }
    )
  }

  @RequirePermissions('documentTemplates.manage')
  @Post('document-templates')
  public createTemplate(
    @Req() request: AuthenticatedRequest,
    @Body() raw: unknown
  ): Promise<unknown> {
    return this.service.createTemplate(
      request.actor!,
      templateSchema.parse(raw)
    )
  }

  @RequirePermissions('documentTemplates.read')
  @Get('document-templates/:templateId/versions')
  public listVersions(
    @Req() request: AuthenticatedRequest,
    @Param('templateId') templateId: string,
    @Query() raw: unknown
  ): Promise<unknown> {
    const query = versionListSchema.parse(raw)
    return this.service.listVersions(
      request.actor!,
      objectIdSchema.parse(templateId),
      { page: query.page, pageSize: query.pageSize },
      query.status
    )
  }

  @RequirePermissions('documentTemplates.manage')
  @Post('document-templates/:templateId/versions')
  public createVersion(
    @Req() request: AuthenticatedRequest,
    @Param('templateId') templateId: string,
    @Body() raw: unknown
  ): Promise<unknown> {
    return this.service.createVersion(
      request.actor!,
      objectIdSchema.parse(templateId),
      templateVersionSchema.parse(raw)
    )
  }

  @RequirePermissions('documentTemplates.read')
  @Get('document-template-versions/:versionId')
  public getVersion(
    @Req() request: AuthenticatedRequest,
    @Param('versionId') id: string
  ): Promise<unknown> {
    return this.service.getVersion(request.actor!, objectIdSchema.parse(id))
  }

  @RequirePermissions('documentTemplates.manage')
  @Patch('document-template-versions/:versionId')
  public updateVersion(
    @Req() request: AuthenticatedRequest,
    @Param('versionId') id: string,
    @Body() raw: unknown
  ): Promise<unknown> {
    return this.service.updateVersion(
      request.actor!,
      objectIdSchema.parse(id),
      templateVersionUpdateSchema.parse(raw)
    )
  }

  @RequirePermissions('documentTemplates.publish')
  @Post('document-template-versions/:versionId/publish')
  public publishVersion(
    @Req() request: AuthenticatedRequest,
    @Param('versionId') id: string
  ): Promise<unknown> {
    return this.service.publishVersion(request.actor!, objectIdSchema.parse(id))
  }

  @RequireAnyPermission('documents.generateOwn', 'documents.generateScoped')
  @UseGuards(DocumentGenerationRateLimitGuard)
  @Post('generated-documents')
  @HttpCode(HttpStatus.ACCEPTED)
  public generate(
    @Req() request: AuthenticatedRequest,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Body() raw: unknown
  ): Promise<unknown> {
    const actor = request.actor!
    return this.service.generate(
      actor,
      generateSchema.parse(raw),
      z.string().min(8).max(128).parse(idempotencyKey),
      request.requestId ?? 'unknown'
    )
  }

  @RequireAnyPermission('documents.readOwn', 'documents.readScoped')
  @Get('generated-documents')
  public listDocuments(
    @Req() request: AuthenticatedRequest,
    @Query() raw: unknown
  ): Promise<unknown> {
    return this.service.listDocuments(request.actor!, pageSchema.parse(raw))
  }

  @RequireAnyPermission('documents.readOwn', 'documents.readScoped')
  @Get('generated-documents/:documentId')
  public getDocument(
    @Req() request: AuthenticatedRequest,
    @Param('documentId') id: string
  ): Promise<unknown> {
    return this.service.getDocument(
      request.actor!,
      objectIdSchema.parse(id),
      request.requestId ?? 'unknown'
    )
  }

  @RequireAnyPermission('documents.readOwn', 'documents.readScoped')
  @Get('generated-documents/:documentId/download-url')
  public downloadUrl(
    @Req() request: AuthenticatedRequest,
    @Param('documentId') id: string
  ): Promise<unknown> {
    return this.service.downloadUrl(
      request.actor!,
      objectIdSchema.parse(id),
      request.requestId ?? 'unknown'
    )
  }
}
