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
  Req
} from '@nestjs/common'
import { z } from 'zod'

import {
  RequireAnyPermission,
  RequirePermissions
} from '../auth/auth.decorators.js'
import type { AuthenticatedRequest } from '../common/http.js'
import { DocumentsService } from './documents.service.js'

const pageSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25)
})
const canonicalJsonSchema = z
  .object({
    width: z.number().positive(),
    height: z.number().positive(),
    elements: z.array(z.record(z.string(), z.unknown()))
  })
  .passthrough()
const templateSchema = z.object({
  code: z.string().min(1),
  name: z.string().min(1),
  canonicalJson: canonicalJsonSchema,
  placeholders: z.array(z.string()).default([]),
  fontAssetKeys: z.array(z.string()).default([])
})
const generateSchema = z.object({
  studentId: z.string().min(1),
  templateVersionId: z.string().min(1),
  evaluationIds: z.array(z.string()).default([])
})

@Controller()
export class DocumentsController {
  public constructor(private readonly service: DocumentsService) {}

  @RequirePermissions('documentTemplates.read')
  @Get('document-templates')
  public listTemplates(@Query() raw: unknown): Promise<unknown> {
    return this.service.listTemplates(pageSchema.parse(raw))
  }

  @RequirePermissions('documentTemplates.manage')
  @Post('document-templates')
  public createTemplate(@Body() raw: unknown): Promise<unknown> {
    return this.service.createTemplate(templateSchema.parse(raw))
  }

  @RequirePermissions('documentTemplates.read')
  @Get('document-template-versions/:versionId')
  public getVersion(@Param('versionId') id: string): Promise<unknown> {
    return this.service.getVersion(id)
  }

  @RequirePermissions('documentTemplates.manage')
  @Patch('document-template-versions/:versionId')
  public updateVersion(
    @Param('versionId') id: string,
    @Body() raw: unknown
  ): Promise<unknown> {
    const { canonicalJson } = z
      .object({ canonicalJson: canonicalJsonSchema })
      .parse(raw)
    return this.service.updateVersion(id, canonicalJson)
  }

  @RequirePermissions('documentTemplates.publish')
  @Post('document-template-versions/:versionId/publish')
  public publishVersion(@Param('versionId') id: string): Promise<unknown> {
    return this.service.publishVersion(id)
  }

  @RequireAnyPermission('documents.generateOwn', 'documents.generateScoped')
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
      z.string().min(8).max(128).parse(idempotencyKey)
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
    return this.service.getDocument(request.actor!, id)
  }

  @RequireAnyPermission('documents.readOwn', 'documents.readScoped')
  @Get('generated-documents/:documentId/download-url')
  public downloadUrl(
    @Req() request: AuthenticatedRequest,
    @Param('documentId') id: string
  ): Promise<unknown> {
    return this.service.downloadUrl(request.actor!, id)
  }
}
