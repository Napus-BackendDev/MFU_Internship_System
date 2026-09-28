import { MongoMemoryReplSet } from 'mongodb-memory-server-core'
import fontkit from '@pdf-lib/fontkit'
import { createConnection, Types, type Connection, type Model } from 'mongoose'
import {
  afterAll,
  beforeAll,
  beforeEach,
  afterEach,
  describe,
  expect,
  it,
  vi
} from 'vitest'

import type {
  AuthenticatedActor,
  DocumentIssueSnapshotV1
} from '@internship/shared-types'
import {
  DeleteObjectCommand,
  type S3Client,
  type PutObjectCommand
} from '@aws-sdk/client-s3'

import {
  AcademicTermRecord,
  AcademicTermSchema,
  ProgramRecord,
  ProgramSchema,
  SchoolRecord,
  SchoolSchema
} from '../src/academic/academic.schema.js'
import { AuditLogRecord, AuditLogSchema } from '../src/audit/audit.schema.js'
import { AuditService } from '../src/audit/audit.service.js'
import {
  DocumentAssetRecord,
  DocumentAssetSchema,
  GeneratedDocumentRecord,
  GeneratedDocumentSchema,
  DocumentTemplateRecord,
  DocumentTemplateSchema,
  DocumentTemplateVersionRecord,
  DocumentTemplateVersionSchema
} from '../src/documents/document.schema.js'
import { DocumentsController } from '../src/documents/documents.controller.js'
import { DocumentsService } from '../src/documents/documents.service.js'
import type { AuthenticatedRequest } from '../src/common/http.js'
import {
  EvaluationAssignmentRecord,
  EvaluationAssignmentSchema,
  EvaluationRecord,
  EvaluationSchema
} from '../src/evaluations/evaluation.schema.js'
import {
  OrganizationRecord,
  OrganizationSchema,
  PlacementRecord,
  PlacementSchema,
  StudentRecord,
  StudentSchema
} from '../src/members/members.schema.js'

const canonicalJson = {
  width: 794,
  height: 1123,
  editorMetadata: {
    nameTh: 'แบบทดสอบทรานสคริปต์',
    nameEn: 'Test transcript'
  },
  elements: [
    {
      type: 'text',
      x: 30,
      y: 40,
      fontSize: 14,
      text: '{{student_name}}'
    }
  ]
} as const

const templateInput = {
  code: 'TRANSCRIPT-TEST',
  name: 'Internship transcript test',
  documentType: 'transcript' as const,
  schemaVersion: 1 as const,
  canonicalJson,
  placeholders: ['student_name'],
  fontAssetKeys: ['approved-test-fonts/noto-sans-thai.ttf']
}

const templateAdminActor: AuthenticatedActor = {
  id: 'document-template-admin',
  email: 'documents-admin@example.test',
  displayName: 'Document Template Admin',
  roles: ['systemAdmin'],
  scope: { tenant: true, schoolIds: [], programIds: [] }
}

describe('Document template versions on an isolated MongoDB replica set', () => {
  let replicaSet: MongoMemoryReplSet
  let connection: Connection
  let templates: Model<DocumentTemplateRecord>
  let versions: Model<DocumentTemplateVersionRecord>
  let generatedDocuments: Model<GeneratedDocumentRecord>
  let students: Model<StudentRecord>
  let terms: Model<AcademicTermRecord>
  let schools: Model<SchoolRecord>
  let programs: Model<ProgramRecord>
  let placements: Model<PlacementRecord>
  let organizations: Model<OrganizationRecord>
  let evaluations: Model<EvaluationRecord>
  let assignments: Model<EvaluationAssignmentRecord>
  let auditLogs: Model<AuditLogRecord>
  let auditService: AuditService
  let assets: Model<DocumentAssetRecord>
  let queueAdd: ReturnType<typeof vi.fn>
  let s3Send: ReturnType<typeof vi.fn>
  let signingS3Client: S3Client
  let service: DocumentsService

  beforeAll(async () => {
    replicaSet = await MongoMemoryReplSet.create({
      binary: {
        ...(process.env.TEST_MONGODB_SYSTEM_BINARY
          ? { systemBinary: process.env.TEST_MONGODB_SYSTEM_BINARY }
          : {}),
        ...(process.platform === 'win32' && process.arch === 'arm64'
          ? { arch: 'x64' as const }
          : {}),
        version: process.env.TEST_MONGODB_VERSION ?? '8.0.28'
      },
      replSet: { count: 1, storageEngine: 'wiredTiger' }
    })
    connection = await createConnection(replicaSet.getUri()).asPromise()
    templates = connection.model(
      DocumentTemplateRecord.name,
      DocumentTemplateSchema
    )
    versions = connection.model(
      DocumentTemplateVersionRecord.name,
      DocumentTemplateVersionSchema
    )
    generatedDocuments = connection.model(
      GeneratedDocumentRecord.name,
      GeneratedDocumentSchema
    )
    students = connection.model(StudentRecord.name, StudentSchema)
    terms = connection.model(AcademicTermRecord.name, AcademicTermSchema)
    schools = connection.model(SchoolRecord.name, SchoolSchema)
    programs = connection.model(ProgramRecord.name, ProgramSchema)
    placements = connection.model(PlacementRecord.name, PlacementSchema)
    organizations = connection.model(
      OrganizationRecord.name,
      OrganizationSchema
    )
    evaluations = connection.model(EvaluationRecord.name, EvaluationSchema)
    assignments = connection.model(
      EvaluationAssignmentRecord.name,
      EvaluationAssignmentSchema
    )
    auditLogs = connection.model(AuditLogRecord.name, AuditLogSchema)
    assets = connection.model(DocumentAssetRecord.name, DocumentAssetSchema)
    auditService = new AuditService(auditLogs)
    queueAdd = vi.fn().mockResolvedValue({})
    s3Send = vi.fn().mockResolvedValue({})
    const config = {
      get: (key: string) =>
        ({
          S3_BUCKET: 'mfu-test-documents',
          S3_ENDPOINT: 'http://127.0.0.1:9000',
          S3_REGION: 'us-east-1',
          S3_FORCE_PATH_STYLE: true,
          S3_ACCESS_KEY_ID: 'test-access-key',
          S3_SECRET_ACCESS_KEY: 'test-secret-key'
        })[key]
    }
    service = new DocumentsService(
      { add: queueAdd } as never,
      templates,
      versions,
      generatedDocuments,
      students,
      evaluations,
      assignments,
      config as never,
      auditService,
      assets,
      terms,
      schools,
      programs,
      placements,
      organizations
    )
    signingS3Client = (service as unknown as { s3: S3Client }).s3
    Object.defineProperty(service, 's3', {
      configurable: true,
      value: { send: s3Send }
    })
    await Promise.all([
      templates.init(),
      versions.init(),
      generatedDocuments.init(),
      students.init(),
      evaluations.init(),
      assignments.init(),
      auditLogs.init(),
      assets.init(),
      terms.init(),
      schools.init(),
      programs.init(),
      placements.init(),
      organizations.init()
    ])
  }, 180_000)

  afterAll(async () => {
    await connection?.close()
    await replicaSet?.stop()
  }, 30_000)

  beforeEach(async () => {
    await Promise.all([
      templates.deleteMany({}),
      versions.deleteMany({}),
      generatedDocuments.deleteMany({}),
      students.deleteMany({}),
      evaluations.deleteMany({}),
      assignments.deleteMany({}),
      auditLogs.deleteMany({}),
      assets.deleteMany({}),
      terms.deleteMany({}),
      schools.deleteMany({}),
      programs.deleteMany({}),
      placements.deleteMany({}),
      organizations.deleteMany({})
    ])
    queueAdd.mockClear()
    queueAdd.mockResolvedValue({})
    s3Send.mockClear()
  })

  afterEach(() => {
    Object.defineProperty(service, 's3', {
      configurable: true,
      value: { send: s3Send }
    })
    vi.restoreAllMocks()
  })

  function stubIssueSnapshot(): void {
    vi.spyOn(
      service as unknown as {
        createIssueSnapshot: (
          ...args: unknown[]
        ) => Promise<DocumentIssueSnapshotV1>
      },
      'createIssueSnapshot'
    ).mockResolvedValue({
      snapshotVersion: 1,
      capturedAt: '2026-09-25T00:00:00.000Z',
      documentNumber: '',
      template: {
        versionId: 'test-template-version',
        documentType: 'transcript',
        schemaVersion: 1,
        canonicalJson,
        placeholders: ['student_name'],
        fontAssets: []
      },
      student: {
        recordId: 'test-student',
        studentId: '6531501001',
        name: { th: 'นักศึกษาทดสอบ', en: 'Test Student' },
        academicYear: 2569,
        schoolId: 'school-a',
        schoolName: { th: 'สำนักวิชา', en: 'School' },
        programId: 'program-a',
        programName: { th: 'หลักสูตร', en: 'Program' }
      },
      placement: {
        id: 'test-placement',
        organizationId: 'test-organization',
        organizationName: { th: 'องค์กร', en: 'Organization' },
        positionTitle: { th: 'ฝึกงาน', en: 'Intern' },
        schoolId: 'school-a',
        programId: 'program-a',
        startsAt: '2026-06-01T00:00:00.000Z',
        endsAt: '2026-08-01T00:00:00.000Z',
        academicTermId: 'term-a',
        academicTermCode: '1/2569',
        academicYear: 2569,
        semester: '1'
      },
      evaluations: [
        {
          id: 'test-evaluation',
          assignmentId: 'test-assignment',
          version: 1,
          submittedAt: '2026-09-25T00:00:00.000Z',
          answers: {},
          questionSnapshot: [],
          categoryScores: null
        }
      ]
    })
  }

  async function createEvaluationSource(
    studentId: string,
    status: 'pending' | 'submitted' = 'submitted',
    version = 1,
    placementId = `placement-${studentId}`
  ): Promise<{ id: string }> {
    const assignment = await assignments.create({
      cycleId: `cycle-${studentId}`,
      placementId,
      evaluatorId: 'evaluator-1',
      studentId,
      schoolId: 'school-a',
      programId: 'program-a',
      questionSnapshot: [],
      competencySetVersionId: 'competency-v1',
      deadlineAt: new Date(Date.now() + 60_000),
      evaluationVersion: version,
      status
    })
    const evaluation = await evaluations.create({
      assignmentId: assignment.id,
      version,
      answers: {},
      questionSnapshot: [],
      aggregateScore: null,
      evaluatorId: 'evaluator-1',
      submittedAt: new Date(),
      idempotencyKey: `evaluation-${assignment.id}`
    })
    return { id: evaluation.id }
  }

  async function createPublishedVersion(): Promise<{ id: string }> {
    const version = await versions.create({
      templateId: 'template-transcript',
      versionNumber: 1,
      schemaVersion: 1,
      revision: 1,
      status: 'published',
      canonicalJson,
      placeholders: ['student_name'],
      fontAssetKeys: templateInput.fontAssetKeys,
      publishedAt: new Date()
    })
    return { id: version.id }
  }

  it('conceals and audits document lookups outside the Student scope', async () => {
    const [studentA, studentB] = await students.create([
      {
        studentId: '6531502001',
        name: { th: 'นักศึกษา A', en: 'Student A' },
        email: 'student-a@example.test',
        schoolId: 'school-a',
        programId: 'program-a'
      },
      {
        studentId: '6531502002',
        name: { th: 'นักศึกษา B', en: 'Student B' },
        email: 'student-b@example.test',
        schoolId: 'school-a',
        programId: 'program-a'
      }
    ])
    if (!studentA || !studentB) throw new Error('Student fixture missing.')
    const template = (await service.createTemplate(
      templateAdminActor,
      templateInput
    )) as {
      id: string
      versions: readonly { id: string }[]
    }
    const templateVersion = template.versions[0]
    if (!templateVersion) throw new Error('Template version fixture missing.')
    const foreignDocument = await generatedDocuments.create({
      studentId: studentB.id,
      templateVersionId: templateVersion.id,
      requestedBy: 'student-b-user',
      idempotencyKey: 'document-b',
      status: 'ready',
      objectKey: 'private/student-b.pdf'
    })
    const ownDocument = await generatedDocuments.create({
      studentId: studentA.id,
      templateVersionId: templateVersion.id,
      requestedBy: 'student-a-user',
      idempotencyKey: 'document-a',
      status: 'ready',
      objectKey: 'private/student-a.pdf'
    })
    const actor: AuthenticatedActor = {
      id: 'student-a-user',
      email: studentA.email,
      displayName: 'Student A',
      roles: ['student'],
      scope: {
        tenant: false,
        studentId: studentA.studentId,
        schoolIds: ['school-a'],
        programIds: ['program-a']
      }
    }

    const listedDocuments = (await service.listDocuments(actor, {
      page: 1,
      pageSize: 10
    })) as {
      items: readonly {
        readonly id?: string
        readonly documentType?: string | null
        readonly documentNumber?: string | null
        readonly objectKey?: string
      }[]
    }
    expect(listedDocuments.items).toHaveLength(1)
    const ownListedDocument = listedDocuments.items[0]
    expect(ownListedDocument).toMatchObject({
      id: ownDocument.id,
      documentType: 'transcript',
      documentNumber: `MFU-TR-${ownDocument.id.toUpperCase()}`
    })
    expect(ownListedDocument).not.toHaveProperty('objectKey')

    const ownDocumentDetail = await service.getDocument(
      actor,
      ownDocument.id,
      'own-document-request'
    )
    expect(ownDocumentDetail).toHaveProperty('id', ownDocument.id)
    expect(ownDocumentDetail.toJSON()).not.toHaveProperty('resourceScopes')
    await expect(
      service.getDocument(actor, foreignDocument.id, 'foreign-document-request')
    ).rejects.toMatchObject({ status: 404 })
    await expect(
      service.getDocument(
        actor,
        new Types.ObjectId().toString(),
        'missing-document-request'
      )
    ).rejects.toMatchObject({ status: 404 })

    const denials = await auditLogs
      .find({ action: 'documents.access_denied' })
      .lean()
      .exec()
    expect(denials).toHaveLength(2)
    expect(denials.map((entry) => entry.requestId).sort()).toEqual([
      'foreign-document-request',
      'missing-document-request'
    ])
    expect(denials.map((entry) => entry.metadata)).toEqual([
      {
        resourceType: 'generatedDocument',
        result: 'not_found_or_out_of_scope'
      },
      {
        resourceType: 'generatedDocument',
        result: 'not_found_or_out_of_scope'
      }
    ])
    expect(JSON.stringify(denials)).not.toContain(foreignDocument.id)
  })

  it('audits a short-lived signed URL before returning it', async () => {
    const student = await students.create({
      studentId: '6531502003',
      name: { th: 'นักศึกษาทดสอบ', en: 'Test Student' },
      email: 'student@example.test',
      schoolId: 'school-a',
      programId: 'program-a'
    })
    const document = await generatedDocuments.create({
      studentId: student.id,
      templateVersionId: 'version-a',
      requestedBy: 'student-user',
      idempotencyKey: 'document-ready',
      status: 'ready',
      objectKey: 'private/student.pdf',
      resourceScopes: [{ schoolIds: ['school-a'], programIds: ['program-a'] }]
    })
    const actor: AuthenticatedActor = {
      id: 'student-user',
      email: student.email,
      displayName: 'Student',
      roles: ['student'],
      scope: {
        tenant: false,
        studentId: student.studentId,
        schoolIds: [],
        programIds: []
      }
    }

    Object.defineProperty(service, 's3', {
      configurable: true,
      value: signingS3Client
    })
    const result = (await service.downloadUrl(
      actor,
      document.id,
      'signed-url-request'
    )) as { url: string; expiresIn: number }

    expect(result.expiresIn).toBe(300)
    expect(result.url).toContain('X-Amz-Expires=300')
    expect(result.url).toContain('response-content-disposition=')
    const audit = await auditLogs
      .findOne({ requestId: 'signed-url-request' })
      .lean()
      .exec()
    expect(audit).toMatchObject({
      action: 'documents.download_url_issued',
      method: 'GET',
      outcome: 'success',
      resourceScopes: [{ schoolIds: ['school-a'], programIds: ['program-a'] }],
      metadata: { documentId: document.id, expiresIn: 300 }
    })
    const scopedAudit = await auditService.list(
      {
        id: 'school-a-auditor',
        email: 'auditor@example.test',
        displayName: 'School A audit reader',
        roles: ['internshipStaff'],
        scope: {
          tenant: false,
          schoolIds: ['school-a'],
          programIds: ['program-a']
        },
        roleScopes: [
          {
            role: 'internshipStaff',
            tenant: false,
            schoolIds: ['school-a'],
            programIds: ['program-a']
          }
        ]
      },
      { page: 1, pageSize: 10 }
    )
    expect(scopedAudit.items.map((item) => item.action)).toContain(
      'documents.download_url_issued'
    )
    expect(JSON.stringify(audit)).not.toContain(result.url)
    expect(JSON.stringify(audit)).not.toContain(document.objectKey)
    expect(JSON.stringify(audit)).not.toContain('test-secret-key')
  })

  it('fails closed when a document access audit cannot be persisted', async () => {
    const [owner, other] = await students.create([
      {
        studentId: '6531502004',
        name: { th: 'นักศึกษา A', en: 'Student A' },
        email: 'student-a@example.test',
        schoolId: 'school-a',
        programId: 'program-a'
      },
      {
        studentId: '6531502005',
        name: { th: 'นักศึกษา B', en: 'Student B' },
        email: 'student-b@example.test',
        schoolId: 'school-a',
        programId: 'program-a'
      }
    ])
    if (!owner || !other) throw new Error('Student fixture missing.')
    const document = await generatedDocuments.create({
      studentId: other.id,
      templateVersionId: 'version-other',
      requestedBy: 'other-user',
      idempotencyKey: 'document-other',
      status: 'ready',
      objectKey: 'private/other.pdf'
    })
    const actor: AuthenticatedActor = {
      id: 'owner-user',
      email: owner.email,
      displayName: 'Owner',
      roles: ['student'],
      scope: {
        tenant: false,
        studentId: owner.studentId,
        schoolIds: [],
        programIds: []
      }
    }
    vi.spyOn(auditService, 'record').mockRejectedValueOnce(
      new Error('test audit storage failure')
    )

    await expect(
      service.getDocument(actor, document.id, 'audit-failure-request')
    ).rejects.toMatchObject({ status: 503 })
    await expect(auditLogs.countDocuments({})).resolves.toBe(0)
  })

  it('does not return a signed URL when its issuance audit fails', async () => {
    const student = await students.create({
      studentId: '6531502006',
      name: { th: 'นักศึกษาทดสอบ', en: 'Test Student' },
      email: 'student@example.test',
      schoolId: 'school-a',
      programId: 'program-a'
    })
    const document = await generatedDocuments.create({
      studentId: student.id,
      templateVersionId: 'version-a',
      requestedBy: 'student-user',
      idempotencyKey: 'document-ready-audit-failure',
      status: 'ready',
      objectKey: 'private/student.pdf'
    })
    const actor: AuthenticatedActor = {
      id: 'student-user',
      email: student.email,
      displayName: 'Student',
      roles: ['student'],
      scope: {
        tenant: false,
        studentId: student.studentId,
        schoolIds: [],
        programIds: []
      }
    }
    Object.defineProperty(service, 's3', {
      configurable: true,
      value: signingS3Client
    })
    vi.spyOn(auditService, 'record').mockRejectedValueOnce(
      new Error('test audit storage failure')
    )

    await expect(
      service.downloadUrl(actor, document.id, 'signed-url-audit-failure')
    ).rejects.toMatchObject({ status: 503 })
    await expect(auditLogs.countDocuments({})).resolves.toBe(0)
  })

  it('audits document generation once in the same transaction as its request', async () => {
    stubIssueSnapshot()
    const student = await students.create({
      studentId: '6531501001',
      name: { th: 'นักศึกษาทดสอบ', en: 'Test Student' },
      email: 'student@example.test',
      schoolId: 'school-a',
      programId: 'program-a'
    })
    const version = await createPublishedVersion()
    const evaluation = await createEvaluationSource(student.id)
    const actor: AuthenticatedActor = {
      id: 'staff-user-id',
      email: 'staff@example.test',
      displayName: 'Staff',
      roles: ['systemAdmin'],
      scope: { tenant: true, schoolIds: [], programIds: [] }
    }
    const originalNodeEnv = process.env.NODE_ENV
    process.env.NODE_ENV = 'production'

    try {
      const first = (await service.generate(
        actor,
        {
          studentId: student.studentId,
          templateVersionId: version.id,
          evaluationIds: [evaluation.id]
        },
        'document-generation-once',
        'request-document-generation'
      )) as { id: string; status: string }
      await assignments.updateOne(
        { studentId: student.id },
        { $set: { status: 'expired' } }
      )
      const replay = (await service.generate(
        actor,
        {
          studentId: student.id,
          templateVersionId: version.id,
          evaluationIds: [evaluation.id]
        },
        'document-generation-once',
        'request-document-generation-replay'
      )) as { id: string }

      expect(first.status).toBe('queued')
      expect(replay.id).toBe(first.id)
      expect(first).not.toHaveProperty('idempotencyKey')
      expect(first).not.toHaveProperty('requestHash')
      expect(first).not.toHaveProperty('requestedByEmail')
      expect(first).not.toHaveProperty('objectKey')
      expect(queueAdd).toHaveBeenCalledTimes(1)
      await expect(
        generatedDocuments.countDocuments({ _id: first.id })
      ).resolves.toBe(1)
      await expect(
        generatedDocuments.findById(first.id).lean()
      ).resolves.toMatchObject({
        requestedBy: actor.id,
        requestedByEmail: actor.email,
        requestId: 'request-document-generation'
      })
      await expect(
        generatedDocuments.findById(first.id).lean()
      ).resolves.not.toHaveProperty('resourceScopes')
      await expect(
        auditLogs.countDocuments({
          action: 'documents.generation_requested',
          requestId: 'request-document-generation'
        })
      ).resolves.toBe(1)
      await expect(
        auditLogs.findOne({ action: 'documents.generation_requested' }).lean()
      ).resolves.toMatchObject({
        resourceScopes: [{ schoolIds: ['school-a'], programIds: ['program-a'] }]
      })
      await expect(
        auditLogs.countDocuments({ action: 'documents.generation_requested' })
      ).resolves.toBe(1)
    } finally {
      if (originalNodeEnv === undefined) delete process.env.NODE_ENV
      else process.env.NODE_ENV = originalNodeEnv
    }
  })

  it('rolls back a generated-document request when its audit write fails', async () => {
    stubIssueSnapshot()
    const student = await students.create({
      studentId: '6531501002',
      name: { th: 'นักศึกษาทดสอบ', en: 'Test Student' },
      email: 'student2@example.test',
      schoolId: 'school-a',
      programId: 'program-a'
    })
    const version = await createPublishedVersion()
    const evaluation = await createEvaluationSource(student.id)
    const actor: AuthenticatedActor = {
      id: 'staff-user-id',
      email: 'staff@example.test',
      displayName: 'Staff',
      roles: ['systemAdmin'],
      scope: { tenant: true, schoolIds: [], programIds: [] }
    }
    const originalNodeEnv = process.env.NODE_ENV
    process.env.NODE_ENV = 'production'
    const auditWrite = vi
      .spyOn(AuditService.prototype, 'record')
      .mockRejectedValueOnce(new Error('simulated audit persistence failure'))

    try {
      await expect(
        service.generate(
          actor,
          {
            studentId: student.id,
            templateVersionId: version.id,
            evaluationIds: [evaluation.id]
          },
          'document-generation-audit-failure',
          'request-document-audit-failure'
        )
      ).rejects.toThrow('simulated audit persistence failure')
    } finally {
      auditWrite.mockRestore()
      if (originalNodeEnv === undefined) delete process.env.NODE_ENV
      else process.env.NODE_ENV = originalNodeEnv
    }

    await expect(generatedDocuments.countDocuments({})).resolves.toBe(0)
    await expect(auditLogs.countDocuments({})).resolves.toBe(0)
    expect(queueAdd).not.toHaveBeenCalled()
  })

  it('rejects generation without a final evaluation before creating any records', async () => {
    const student = await students.create({
      studentId: '6531501003',
      name: { th: 'นักศึกษาทดสอบ', en: 'Test Student' },
      email: 'student3@example.test',
      schoolId: 'school-a',
      programId: 'program-a'
    })
    const version = await createPublishedVersion()
    const actor: AuthenticatedActor = {
      id: 'staff-user-id',
      email: 'staff@example.test',
      displayName: 'Staff',
      roles: ['systemAdmin'],
      scope: { tenant: true, schoolIds: [], programIds: [] }
    }

    await expect(
      service.generate(
        actor,
        {
          studentId: student.id,
          templateVersionId: version.id,
          evaluationIds: []
        },
        'document-generation-without-result'
      )
    ).rejects.toMatchObject({
      status: 422,
      response: { code: 'DOCUMENT_EVALUATION_REQUIRED' }
    })
    await expect(generatedDocuments.countDocuments({})).resolves.toBe(0)
    await expect(auditLogs.countDocuments({})).resolves.toBe(0)
    expect(queueAdd).not.toHaveBeenCalled()
  })

  it('rejects a final evaluation whose assignment is not submitted', async () => {
    const student = await students.create({
      studentId: '6531501004',
      name: { th: 'นักศึกษาทดสอบ', en: 'Test Student' },
      email: 'student4@example.test',
      schoolId: 'school-a',
      programId: 'program-a'
    })
    const version = await createPublishedVersion()
    const evaluation = await createEvaluationSource(student.id, 'pending')
    const actor: AuthenticatedActor = {
      id: 'staff-user-id',
      email: 'staff@example.test',
      displayName: 'Staff',
      roles: ['systemAdmin'],
      scope: { tenant: true, schoolIds: [], programIds: [] }
    }

    await expect(
      service.generate(
        actor,
        {
          studentId: student.id,
          templateVersionId: version.id,
          evaluationIds: [evaluation.id]
        },
        'document-generation-from-pending-assignment'
      )
    ).rejects.toMatchObject({
      status: 422,
      response: { code: 'EVALUATION_SOURCE_INVALID' }
    })
    await expect(generatedDocuments.countDocuments({})).resolves.toBe(0)
    expect(queueAdd).not.toHaveBeenCalled()
  })

  it('rejects a final evaluation superseded by the assignment revision', async () => {
    const student = await students.create({
      studentId: '6531501005',
      name: { th: 'นักศึกษาทดสอบ', en: 'Test Student' },
      email: 'student5@example.test',
      schoolId: 'school-a',
      programId: 'program-a'
    })
    const version = await createPublishedVersion()
    const evaluation = await createEvaluationSource(student.id, 'submitted', 1)
    await assignments.updateOne(
      { studentId: student.id },
      { $set: { evaluationVersion: 2 } }
    )
    const actor: AuthenticatedActor = {
      id: 'staff-user-id',
      email: 'staff@example.test',
      displayName: 'Staff',
      roles: ['systemAdmin'],
      scope: { tenant: true, schoolIds: [], programIds: [] }
    }

    await expect(
      service.generate(
        actor,
        {
          studentId: student.id,
          templateVersionId: version.id,
          evaluationIds: [evaluation.id]
        },
        'document-generation-from-old-revision'
      )
    ).rejects.toMatchObject({
      status: 422,
      response: { code: 'EVALUATION_SOURCE_INVALID' }
    })
    await expect(generatedDocuments.countDocuments({})).resolves.toBe(0)
    expect(queueAdd).not.toHaveBeenCalled()
  })

  it('does not widen Staff document generation with a separate Coordinator scope', async () => {
    const student = await students.create({
      studentId: '6531501006',
      name: { th: 'นักศึกษาทดสอบ', en: 'Test Student' },
      email: 'student6@example.test',
      schoolId: 'school-b',
      programId: 'program-b'
    })
    const version = await createPublishedVersion()
    const evaluation = await createEvaluationSource(student.id)
    const actor: AuthenticatedActor = {
      id: 'staff-coordinator-user',
      email: 'staff-coordinator@example.test',
      displayName: 'Scoped Staff and Coordinator',
      roles: ['internshipStaff', 'coordinator'],
      scope: {
        tenant: false,
        schoolIds: ['school-a', 'school-b'],
        programIds: ['program-a', 'program-b']
      },
      roleScopes: [
        {
          role: 'internshipStaff',
          tenant: false,
          schoolIds: ['school-a'],
          programIds: ['program-a']
        },
        {
          role: 'coordinator',
          tenant: false,
          schoolIds: ['school-b'],
          programIds: ['program-b']
        }
      ]
    }

    await expect(
      service.generate(
        actor,
        {
          studentId: student.id,
          templateVersionId: version.id,
          evaluationIds: [evaluation.id]
        },
        'document-generation-cross-role-scope'
      )
    ).rejects.toMatchObject({ status: 404 })
    await expect(generatedDocuments.countDocuments({})).resolves.toBe(0)
    expect(queueAdd).not.toHaveBeenCalled()

    const inScopeStudent = await students.create({
      studentId: '6531501007',
      name: { th: 'นักศึกษาทดสอบ', en: 'Test Student' },
      email: 'student7@example.test',
      schoolId: 'school-a',
      programId: 'program-a'
    })
    const inScopeEvaluation = await createEvaluationSource(inScopeStudent.id)
    stubIssueSnapshot()
    const result = (await service.generate(
      actor,
      {
        studentId: inScopeStudent.id,
        templateVersionId: version.id,
        evaluationIds: [inScopeEvaluation.id]
      },
      'document-generation-within-staff-scope'
    )) as { status: string }
    expect(result.status).toBe('queued')
    await expect(
      generatedDocuments.countDocuments({ studentId: inScopeStudent.id })
    ).resolves.toBe(1)
    expect(queueAdd).toHaveBeenCalledTimes(1)
  })

  it('combines Student-own and Staff-scoped document access without widening either scope', async () => {
    const [ownStudent, staffStudent, outsideStudent] = await students.create([
      {
        studentId: '6531501011',
        name: { th: 'นักศึกษาเจ้าของบัญชี', en: 'Own Student' },
        email: 'own-student@example.test',
        schoolId: 'school-b',
        programId: 'program-b'
      },
      {
        studentId: '6531501012',
        name: { th: 'นักศึกษาใน scope', en: 'Staff-scoped Student' },
        email: 'staff-student@example.test',
        schoolId: 'school-a',
        programId: 'program-a'
      },
      {
        studentId: '6531501013',
        name: { th: 'นักศึกษานอก scope', en: 'Out-of-scope Student' },
        email: 'outside-student@example.test',
        schoolId: 'school-c',
        programId: 'program-c'
      }
    ])
    if (!ownStudent || !staffStudent || !outsideStudent) {
      throw new Error('Student fixtures missing.')
    }
    const parentTemplate = await templates.create({
      code: 'MULTI-SCOPE-TRANSCRIPT',
      name: 'Multi-scope transcript',
      documentType: 'transcript',
      status: 'active'
    })
    const version = await versions.create({
      templateId: parentTemplate.id,
      versionNumber: 1,
      schemaVersion: 1,
      revision: 1,
      status: 'published',
      canonicalJson,
      placeholders: ['student_name'],
      fontAssetKeys: templateInput.fontAssetKeys,
      publishedAt: new Date()
    })
    const ownEvaluation = await createEvaluationSource(ownStudent.id)
    const staffEvaluation = await createEvaluationSource(staffStudent.id)
    const outsideEvaluation = await createEvaluationSource(outsideStudent.id)
    const actor: AuthenticatedActor = {
      id: 'student-staff-user',
      email: ownStudent.email,
      displayName: 'Student and Staff',
      roles: ['student', 'internshipStaff'],
      scope: {
        tenant: false,
        studentId: ownStudent.studentId,
        schoolIds: ['school-a', 'school-b'],
        programIds: ['program-a', 'program-b']
      },
      roleScopes: [
        {
          role: 'internshipStaff',
          tenant: false,
          schoolIds: ['school-a'],
          programIds: ['program-a']
        }
      ]
    }
    stubIssueSnapshot()

    const ownDocument = await service.generate(
      actor,
      {
        studentId: ownStudent.studentId,
        templateVersionId: version.id,
        evaluationIds: [ownEvaluation.id]
      },
      'student-staff-document-own'
    )
    const staffDocument = await service.generate(
      actor,
      {
        studentId: staffStudent.studentId,
        templateVersionId: version.id,
        evaluationIds: [staffEvaluation.id]
      },
      'student-staff-document-scoped'
    )

    await expect(
      service.generate(
        actor,
        {
          studentId: outsideStudent.studentId,
          templateVersionId: version.id,
          evaluationIds: [outsideEvaluation.id]
        },
        'student-staff-document-outside'
      )
    ).rejects.toMatchObject({ status: 404 })

    const listed = (await service.listDocuments(actor, {
      page: 1,
      pageSize: 10
    })) as { items: readonly { id: string }[] }
    expect(listed.items.map(({ id }) => id).sort()).toEqual(
      [
        (ownDocument as { id: string }).id,
        (staffDocument as { id: string }).id
      ].sort()
    )
    await expect(generatedDocuments.countDocuments({})).resolves.toBe(2)
    expect(queueAdd).toHaveBeenCalledTimes(2)
  })

  it('creates and publishes an immutable initial version, then creates an editable next draft', async () => {
    const created = (await service.createTemplate(
      templateAdminActor,
      templateInput
    )) as {
      id: string
      documentType: string
      versions: readonly {
        id: string
        versionNumber: number
        schemaVersion: number
        revision: number
        status: string
      }[]
    }
    const firstVersion = created.versions[0]
    expect(created.documentType).toBe('transcript')
    expect(firstVersion).toMatchObject({
      versionNumber: 1,
      schemaVersion: 1,
      revision: 1,
      status: 'draft'
    })
    if (!firstVersion) throw new Error('Expected initial version')

    await assets.create({
      key: templateInput.fontAssetKeys[0],
      assetType: 'font',
      originalName: 'approved-test-font.ttf',
      fontFamily: 'Noto Sans Thai',
      contentType: 'font/ttf',
      size: 256,
      sha256: 'a'.repeat(64),
      rightsBasis: 'isolated test fixture',
      rightsConfirmedBy: 'test-admin',
      rightsConfirmedAt: new Date(),
      status: 'active'
    })
    await service.publishVersion(templateAdminActor, firstVersion.id)
    const nextDraft = (await service.createVersion(
      templateAdminActor,
      created.id,
      {
        schemaVersion: 1,
        canonicalJson,
        placeholders: ['student_name'],
        fontAssetKeys: templateInput.fontAssetKeys
      }
    )) as {
      id: string
      versionNumber: number
      revision: number
      status: string
    }
    expect(nextDraft).toMatchObject({
      versionNumber: 2,
      revision: 1,
      status: 'draft'
    })

    const updated = (await service.updateVersion(
      templateAdminActor,
      nextDraft.id,
      {
        revision: 1,
        schemaVersion: 1,
        canonicalJson: {
          ...canonicalJson,
          width: 800
        },
        placeholders: ['student_name'],
        fontAssetKeys: templateInput.fontAssetKeys
      }
    )) as { revision: number; status: string }
    expect(updated).toMatchObject({ revision: 2, status: 'draft' })
    await expect(
      service.updateVersion(templateAdminActor, nextDraft.id, {
        revision: 1,
        schemaVersion: 1,
        canonicalJson,
        placeholders: ['student_name'],
        fontAssetKeys: templateInput.fontAssetKeys
      })
    ).rejects.toMatchObject({ status: 409 })
    await expect(
      service.updateVersion(templateAdminActor, firstVersion.id, {
        revision: 1,
        schemaVersion: 1,
        canonicalJson,
        placeholders: ['student_name'],
        fontAssetKeys: templateInput.fontAssetKeys
      })
    ).rejects.toMatchObject({ status: 409 })
    await expect(
      service.listVersions(templateAdminActor, created.id, {
        page: 1,
        pageSize: 10
      })
    ).resolves.toMatchObject({
      items: [
        { versionNumber: 2, status: 'draft' },
        { versionNumber: 1, status: 'published' }
      ],
      meta: { total: 2 }
    })
  })

  it('stores an approved asset privately and audits rights confirmation', async () => {
    const png = Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/CioAAAAASUVORK5CYII=',
      'base64'
    )
    const asset = (await service.uploadAsset(
      {
        id: 'asset-admin',
        email: 'admin@example.test',
        roles: ['systemAdmin'],
        scope: { tenant: true, schoolIds: [], programIds: [] }
      } as never,
      {
        assetType: 'signature',
        rightsBasis: 'MFU document asset approval record A-42',
        rightsConfirmed: true
      },
      { originalname: '..\\signed-approval.png', buffer: png },
      'asset-upload-request'
    )) as { key: string; originalName: string; rightsConfirmedBy: string }

    expect(asset).toMatchObject({
      originalName: 'signed-approval.png',
      rightsConfirmedBy: 'asset-admin'
    })
    expect(asset.key).toMatch(/^document-assets\/[0-9a-f-]+\.png$/u)
    expect(s3Send).toHaveBeenCalledTimes(1)
    expect((s3Send.mock.calls[0]?.[0] as PutObjectCommand).input).toMatchObject(
      {
        Bucket: 'mfu-test-documents',
        Key: asset.key,
        ContentType: 'image/png',
        ContentDisposition: 'attachment'
      }
    )
    await expect(
      assets.findOne({ key: asset.key }).lean()
    ).resolves.toMatchObject({
      assetType: 'signature',
      rightsConfirmedBy: 'asset-admin',
      rightsBasis: 'MFU document asset approval record A-42',
      status: 'active'
    })
    await expect(
      auditLogs.findOne({ action: 'documents.asset_uploaded' }).lean()
    ).resolves.toMatchObject({
      requestId: 'asset-upload-request',
      resourceScopes: [{ tenant: true }]
    })
    const tenantAudit = await auditService.list(
      {
        id: 'tenant-audit-reader',
        email: 'auditor@example.test',
        displayName: 'Tenant audit reader',
        roles: ['internshipStaff'],
        scope: { tenant: true, schoolIds: [], programIds: [] },
        roleScopes: [
          {
            role: 'internshipStaff',
            tenant: true,
            schoolIds: [],
            programIds: []
          }
        ]
      },
      { page: 1, pageSize: 10 }
    )
    expect(tenantAudit.items.map((item) => item.action)).toContain(
      'documents.asset_uploaded'
    )
  })

  it('rejects an asset whose bytes do not match its declared type', async () => {
    await expect(
      service.uploadAsset(
        {
          id: 'asset-admin',
          email: 'admin@example.test',
          roles: ['systemAdmin'],
          scope: { tenant: true, schoolIds: [], programIds: [] }
        } as never,
        {
          assetType: 'font',
          rightsBasis: 'authorized test font',
          rightsConfirmed: true
        },
        { originalname: 'font.ttf', buffer: Buffer.from('not-a-font') },
        'invalid-asset-request'
      )
    ).rejects.toMatchObject({ status: 422 })
    expect(s3Send).not.toHaveBeenCalled()
  })

  it('stores extracted font family metadata with the approved private asset', async () => {
    const parseFont = vi
      .spyOn(fontkit, 'create')
      .mockReturnValue({ familyName: 'Sarabun' } as never)
    const fontBytes = Buffer.from([0, 1, 0, 0, 0, 0, 0, 0])
    const asset = (await service.uploadAsset(
      {
        id: 'asset-admin',
        email: 'admin@example.test',
        roles: ['systemAdmin'],
        scope: { tenant: true, schoolIds: [], programIds: [] }
      } as never,
      {
        assetType: 'font',
        rightsBasis: 'MFU font approval record F-17',
        rightsConfirmed: true
      },
      { originalname: 'Sarabun-Regular.ttf', buffer: fontBytes },
      'font-upload-request'
    )) as { key: string; fontFamily: string }

    expect(parseFont).toHaveBeenCalledWith(fontBytes)
    expect(asset.fontFamily).toBe('Sarabun')
    await expect(
      assets.findOne({ key: asset.key }).lean()
    ).resolves.toMatchObject({
      fontFamily: 'Sarabun',
      assetType: 'font'
    })
    await expect(
      auditLogs.findOne({ action: 'documents.asset_uploaded' }).lean()
    ).resolves.toMatchObject({ metadata: { fontFamily: 'Sarabun' } })
  })

  it('removes uploaded bytes if asset and audit transaction fails', async () => {
    const png = Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/CioAAAAASUVORK5CYII=',
      'base64'
    )
    const auditFailure = vi
      .spyOn(AuditService.prototype, 'record')
      .mockRejectedValueOnce(new Error('injected audit failure'))

    try {
      await expect(
        service.uploadAsset(
          {
            id: 'asset-admin',
            email: 'admin@example.test',
            roles: ['systemAdmin'],
            scope: { tenant: true, schoolIds: [], programIds: [] }
          } as never,
          {
            assetType: 'emblem',
            rightsBasis: 'MFU document asset approval record A-43',
            rightsConfirmed: true
          },
          { originalname: 'mfu-mark.png', buffer: png },
          'asset-audit-failure'
        )
      ).rejects.toThrow('injected audit failure')
    } finally {
      auditFailure.mockRestore()
    }
    expect(s3Send).toHaveBeenCalledTimes(2)
    expect(s3Send.mock.calls[1]?.[0]).toBeInstanceOf(DeleteObjectCommand)
    await expect(assets.countDocuments()).resolves.toBe(0)
  })

  it('rolls back template creation if creating its initial version fails', async () => {
    const versionWrite = vi
      .spyOn(versions, 'create')
      .mockRejectedValueOnce(new Error('injected version persistence failure'))

    try {
      await expect(
        service.createTemplate(templateAdminActor, templateInput)
      ).rejects.toThrow('injected version persistence failure')
    } finally {
      versionWrite.mockRestore()
    }

    await expect(
      templates.countDocuments({ code: templateInput.code })
    ).resolves.toBe(0)
    await expect(
      versions.countDocuments({ templateId: { $exists: true } })
    ).resolves.toBe(0)
  })

  it('persists rich editor layouts as V2 drafts and blocks missing official signature assets', async () => {
    const created = (await service.createTemplate(templateAdminActor, {
      ...templateInput,
      code: 'TRANSCRIPT-V2-DRAFT',
      schemaVersion: 2,
      canonicalJson: {
        width: 794,
        height: 1040,
        editorMetadata: { backgroundType: 'none', bgOpacity: 10 },
        elements: [
          {
            id: 'title-1',
            type: 'heading',
            content: '{{student_name_th}}',
            x: 0,
            y: 40,
            width: 794,
            fontSize: 24,
            fontFamily: 'Sarabun, sans-serif',
            fontWeight: 'bold',
            color: '#0f172a',
            textAlign: 'center'
          },
          {
            id: 'signature-1',
            type: 'signature',
            content: 'DUAL_SIGNATURES',
            x: 60,
            y: 780,
            width: 674,
            height: 90,
            fontSize: 11,
            fontFamily: 'Sarabun, sans-serif',
            fontWeight: 'normal',
            color: '#0f172a',
            textAlign: 'center'
          }
        ]
      },
      placeholders: ['student_name_th']
    })) as {
      id: string
      versions: readonly { id: string; schemaVersion: number; status: string }[]
    }
    const draft = created.versions[0]
    if (!draft) throw new Error('Expected an initial V2 draft')

    expect(draft).toMatchObject({ schemaVersion: 2, status: 'draft' })
    await expect(
      service.publishVersion(templateAdminActor, draft.id)
    ).rejects.toMatchObject({
      status: 422,
      response: {
        code: 'DOCUMENT_IMAGE_ASSET_REQUIRED',
        assetType: 'signature'
      }
    })
    await expect(versions.findById(draft.id).lean()).resolves.toMatchObject({
      schemaVersion: 2,
      status: 'draft'
    })
  })

  it('publishes a renderable V2 template after validating its registered font', async () => {
    const fontKey = 'approved-test-fonts/v2-font.ttf'
    await assets.create({
      key: fontKey,
      assetType: 'font',
      originalName: 'approved-v2-font.ttf',
      fontFamily: 'Sarabun',
      contentType: 'font/ttf',
      size: 256,
      sha256: 'b'.repeat(64),
      rightsBasis: 'isolated test fixture',
      rightsConfirmedBy: 'test-admin',
      rightsConfirmedAt: new Date(),
      status: 'active'
    })
    const created = (await service.createTemplate(templateAdminActor, {
      ...templateInput,
      code: 'TRANSCRIPT-V2-RENDERABLE',
      schemaVersion: 2,
      canonicalJson: {
        width: 794,
        height: 1040,
        editorMetadata: { backgroundType: 'none' },
        elements: [
          {
            id: 'title-1',
            type: 'heading',
            content: 'ใบรับรอง {{student_name_th}}',
            x: 0,
            y: 40,
            width: 794,
            fontSize: 24,
            fontFamily: 'Sarabun, sans-serif',
            fontWeight: 'bold',
            color: '#0f172a',
            textAlign: 'center'
          }
        ]
      },
      placeholders: ['student_name_th'],
      fontAssetKeys: [fontKey]
    })) as {
      versions: readonly { id: string; status: string }[]
    }
    const draft = created.versions[0]
    if (!draft) throw new Error('Expected initial V2 draft')

    const published = (await service.publishVersion(
      templateAdminActor,
      draft.id
    )) as {
      status: string
      schemaVersion: number
    }
    expect(published).toMatchObject({ status: 'published', schemaVersion: 2 })
  })

  it('blocks V2 publication when selected and embedded font families differ', async () => {
    const fontKey = 'approved-test-fonts/font-family-match.ttf'
    await assets.create({
      key: fontKey,
      assetType: 'font',
      originalName: 'approved-font-family.ttf',
      fontFamily: 'Sarabun',
      contentType: 'font/ttf',
      size: 256,
      sha256: 'd'.repeat(64),
      rightsBasis: 'isolated test fixture',
      rightsConfirmedBy: 'test-admin',
      rightsConfirmedAt: new Date(),
      status: 'active'
    })
    const canonical = (fontFamily: string): Record<string, unknown> => ({
      width: 794,
      height: 1040,
      elements: [
        {
          id: 'title-1',
          type: 'heading',
          content: 'Internship Transcript',
          x: 0,
          y: 40,
          width: 794,
          fontSize: 24,
          fontFamily,
          fontWeight: 'bold',
          color: '#0f172a',
          textAlign: 'center'
        }
      ]
    })
    const created = (await service.createTemplate(templateAdminActor, {
      ...templateInput,
      code: 'TRANSCRIPT-V2-FONT-MAPPING',
      schemaVersion: 2,
      canonicalJson: canonical('Prompt, sans-serif'),
      placeholders: [],
      fontAssetKeys: [fontKey]
    })) as { versions: readonly { id: string }[] }
    const draft = created.versions[0]
    if (!draft) throw new Error('Expected initial V2 draft')

    await expect(
      service.publishVersion(templateAdminActor, draft.id)
    ).rejects.toMatchObject({
      status: 422,
      response: { code: 'DOCUMENT_FONT_MAPPING_UNSUPPORTED' }
    })
    await service.updateVersion(templateAdminActor, draft.id, {
      revision: 1,
      schemaVersion: 2,
      canonicalJson: canonical('"Sarabun", sans-serif'),
      placeholders: [],
      fontAssetKeys: [fontKey]
    })
    await expect(
      service.publishVersion(templateAdminActor, draft.id)
    ).resolves.toMatchObject({
      status: 'published',
      schemaVersion: 2
    })
  })

  it('blocks publishing legacy font assets until family metadata is verified', async () => {
    const fontKey = 'approved-test-fonts/unverified-family.ttf'
    await assets.create({
      key: fontKey,
      assetType: 'font',
      originalName: 'legacy-font.ttf',
      contentType: 'font/ttf',
      size: 256,
      sha256: 'e'.repeat(64),
      rightsBasis: 'isolated test fixture',
      rightsConfirmedBy: 'test-admin',
      rightsConfirmedAt: new Date(),
      status: 'active'
    })
    const created = (await service.createTemplate(templateAdminActor, {
      ...templateInput,
      code: 'TRANSCRIPT-V1-UNVERIFIED-FONT',
      fontAssetKeys: [fontKey]
    })) as { versions: readonly { id: string }[] }
    const draft = created.versions[0]
    if (!draft) throw new Error('Expected initial draft')

    await expect(
      service.publishVersion(templateAdminActor, draft.id)
    ).rejects.toMatchObject({
      status: 422,
      response: { code: 'DOCUMENT_FONT_MAPPING_UNSUPPORTED' }
    })
    await expect(versions.findById(draft.id).lean()).resolves.toMatchObject({
      status: 'draft'
    })
  })

  it('does not publish a template revision changed during publish validation', async () => {
    const fontKey = 'approved-test-fonts/concurrent-v2.ttf'
    await assets.create({
      key: fontKey,
      assetType: 'font',
      originalName: 'approved-concurrent-font.ttf',
      fontFamily: 'Sarabun',
      contentType: 'font/ttf',
      size: 256,
      sha256: 'c'.repeat(64),
      rightsBasis: 'isolated test fixture',
      rightsConfirmedBy: 'test-admin',
      rightsConfirmedAt: new Date(),
      status: 'active'
    })
    const canonicalJson = {
      width: 794,
      height: 1040,
      elements: [
        {
          id: 'title-1',
          type: 'heading',
          content: 'Original',
          x: 0,
          y: 40,
          width: 794,
          fontSize: 24,
          fontFamily: 'Sarabun, sans-serif',
          fontWeight: 'bold',
          color: '#0f172a',
          textAlign: 'center'
        }
      ]
    }
    const created = (await service.createTemplate(templateAdminActor, {
      ...templateInput,
      code: 'TRANSCRIPT-V2-PUBLISH-RACE',
      schemaVersion: 2,
      canonicalJson,
      placeholders: [],
      fontAssetKeys: [fontKey]
    })) as { versions: readonly { id: string }[] }
    const draft = created.versions[0]
    if (!draft) throw new Error('Expected initial V2 draft')
    const changedCanonical = {
      ...canonicalJson,
      elements: [{ ...canonicalJson.elements[0], content: 'Concurrent edit' }]
    }
    const resolveImageAssets = vi.spyOn(
      service as unknown as {
        resolveImageAssets: (
          schemaVersion: number,
          canonicalJson: Readonly<Record<string, unknown>>,
          declaredPlaceholders: readonly string[]
        ) => Promise<
          readonly {
            key: string
            assetType: 'emblem' | 'signature'
            sha256: string
          }[]
        >
      },
      'resolveImageAssets'
    )
    resolveImageAssets.mockImplementation(async () => {
      await service.updateVersion(templateAdminActor, draft.id, {
        revision: 1,
        schemaVersion: 2,
        canonicalJson: changedCanonical,
        placeholders: [],
        fontAssetKeys: [fontKey]
      })
      return []
    })

    await expect(
      service.publishVersion(templateAdminActor, draft.id)
    ).rejects.toMatchObject({
      status: 409,
      response: { code: 'VERSION_CONFLICT' }
    })
    await expect(versions.findById(draft.id).lean()).resolves.toMatchObject({
      revision: 2,
      status: 'draft',
      canonicalJson: changedCanonical
    })
  })

  it('publishes V2 only with rights-attested registered image references', async () => {
    const fontKey = 'approved-test-fonts/v2-images.ttf'
    const imageKeys = [
      'document-assets/mfu-emblem.png',
      'document-assets/signature-one.png',
      'document-assets/signature-two.png'
    ] as const
    await assets.create([
      {
        key: fontKey,
        assetType: 'font',
        originalName: 'approved-v2-font.ttf',
        fontFamily: 'Sarabun',
        contentType: 'font/ttf',
        size: 256,
        sha256: 'b'.repeat(64),
        rightsBasis: 'isolated test fixture',
        rightsConfirmedBy: 'test-admin',
        rightsConfirmedAt: new Date(),
        status: 'active'
      },
      ...imageKeys.map((key, index) => ({
        key,
        assetType: index === 0 ? ('emblem' as const) : ('signature' as const),
        originalName: `approved-image-${index}.png`,
        contentType: 'image/png' as const,
        size: 256,
        sha256: String(index + 1).repeat(64),
        rightsBasis: 'approved test rights record',
        rightsConfirmedBy: 'test-admin',
        rightsConfirmedAt: new Date(),
        status: 'active' as const
      }))
    ])
    const created = (await service.createTemplate(templateAdminActor, {
      ...templateInput,
      code: 'TRANSCRIPT-V2-IMAGES',
      schemaVersion: 2,
      fontAssetKeys: [fontKey],
      placeholders: [],
      canonicalJson: {
        width: 794,
        height: 1040,
        elements: [
          {
            id: 'crest-1',
            type: 'emblem',
            content: 'MFU-CREST',
            assetKey: imageKeys[0],
            x: 360,
            y: 30,
            width: 74,
            height: 74,
            fontSize: 12,
            fontWeight: 'normal',
            color: '#0f172a',
            textAlign: 'center'
          },
          {
            id: 'signature-1',
            type: 'signature',
            content: 'DUAL_SIGNATURES',
            assetKeys: [imageKeys[1], imageKeys[2]],
            x: 60,
            y: 780,
            width: 674,
            height: 90,
            fontSize: 11,
            fontWeight: 'normal',
            color: '#0f172a',
            textAlign: 'center'
          }
        ]
      }
    })) as { versions: readonly { id: string }[] }
    const draft = created.versions[0]
    if (!draft) throw new Error('Expected initial V2 draft')

    await expect(
      service.publishVersion(templateAdminActor, draft.id)
    ).resolves.toMatchObject({
      status: 'published',
      schemaVersion: 2
    })
    expect(s3Send).toHaveBeenCalledTimes(4)
  })

  it('captures approved image checksums into the generated-document source snapshot', async () => {
    const school = await schools.create({
      schoolCode: 'TEST-SCHOOL',
      name: { th: 'สำนักวิชาทดสอบ', en: 'Test School' }
    })
    const program = await programs.create({
      schoolId: school.id,
      programCode: 'TEST-PROGRAM',
      name: { th: 'หลักสูตรทดสอบ', en: 'Test Program' }
    })
    const organization = await organizations.create({
      organizationCode: 'TEST-ORG',
      name: { th: 'องค์กรทดสอบ', en: 'Test Organization' }
    })
    const term = await terms.create({
      code: '1/2569',
      academicYear: 2569,
      semester: '1',
      startsAt: new Date('2026-01-01T00:00:00.000Z'),
      endsAt: new Date('2026-12-31T23:59:59.000Z'),
      status: 'closed'
    })
    const student = await students.create({
      studentId: '6531501099',
      name: { th: 'นักศึกษาสแนปช็อต', en: 'Snapshot Student' },
      email: 'snapshot@example.test',
      schoolId: school.id,
      programId: program.id
    })
    const placement = await placements.create({
      studentId: student.id,
      organizationId: organization.id,
      academicTermId: term.id,
      schoolId: school.id,
      programId: program.id,
      positionTitle: { th: 'นักศึกษาฝึกงาน', en: 'Intern' },
      startsAt: new Date('2026-06-01T00:00:00.000Z'),
      endsAt: new Date('2026-08-01T00:00:00.000Z'),
      status: 'completed'
    })
    const evaluation = await createEvaluationSource(
      student.id,
      'submitted',
      1,
      placement.id
    )

    const fontKey = 'approved-test-fonts/snapshot.ttf'
    const imageKeys = [
      'document-assets/snapshot-emblem.png',
      'document-assets/snapshot-signature-one.png',
      'document-assets/snapshot-signature-two.png'
    ] as const
    await assets.create([
      {
        key: fontKey,
        assetType: 'font',
        originalName: 'snapshot.ttf',
        fontFamily: 'Sarabun',
        contentType: 'font/ttf',
        size: 256,
        sha256: 'f'.repeat(64),
        rightsBasis: 'isolated test approval',
        rightsConfirmedBy: 'test-admin',
        rightsConfirmedAt: new Date(),
        status: 'active'
      },
      ...imageKeys.map((key, index) => ({
        key,
        assetType: index === 0 ? ('emblem' as const) : ('signature' as const),
        originalName: `snapshot-${index}.png`,
        contentType: 'image/png' as const,
        size: 256,
        sha256: String(index + 4).repeat(64),
        rightsBasis: 'isolated test approval',
        rightsConfirmedBy: 'test-admin',
        rightsConfirmedAt: new Date(),
        status: 'active' as const
      }))
    ])
    const created = (await service.createTemplate(templateAdminActor, {
      ...templateInput,
      code: 'TRANSCRIPT-V2-SNAPSHOT',
      schemaVersion: 2,
      fontAssetKeys: [fontKey],
      placeholders: ['student_name_th'],
      canonicalJson: {
        width: 794,
        height: 1040,
        elements: [
          {
            id: 'student-name',
            type: 'heading',
            content: '{{student_name_th}}',
            x: 20,
            y: 20,
            width: 700,
            fontSize: 20,
            fontFamily: 'Sarabun, sans-serif',
            fontWeight: 'bold',
            color: '#0f172a',
            textAlign: 'center'
          },
          {
            id: 'emblem',
            type: 'emblem',
            content: 'MFU-CREST',
            assetKey: imageKeys[0],
            x: 360,
            y: 50,
            width: 60,
            height: 60,
            fontSize: 12,
            fontWeight: 'normal',
            color: '#0f172a',
            textAlign: 'center'
          },
          {
            id: 'signature',
            type: 'signature',
            content: 'DUAL_SIGNATURES',
            assetKeys: [imageKeys[1], imageKeys[2]],
            x: 60,
            y: 780,
            width: 674,
            height: 90,
            fontSize: 11,
            fontWeight: 'normal',
            color: '#0f172a',
            textAlign: 'center'
          }
        ]
      }
    })) as { versions: readonly { id: string }[] }
    const draft = created.versions[0]
    if (!draft) throw new Error('Expected initial V2 draft')
    await service.publishVersion(templateAdminActor, draft.id)

    const actor: AuthenticatedActor = {
      id: 'snapshot-staff',
      email: 'staff@example.test',
      displayName: 'Staff',
      roles: ['systemAdmin'],
      scope: { tenant: true, schoolIds: [], programIds: [] }
    }
    const result = (await service.generate(
      actor,
      {
        studentId: student.id,
        templateVersionId: draft.id,
        evaluationIds: [evaluation.id]
      },
      'document-snapshot-image-assets'
    )) as { id: string; status: string }
    const persisted = await generatedDocuments
      .findById(result.id)
      .select('+sourceSnapshot')
      .lean()

    expect(result.status).toBe('queued')
    expect(persisted?.sourceSnapshot?.template.fontAssets).toEqual([
      {
        key: fontKey,
        sha256: 'f'.repeat(64),
        fontFamily: 'Sarabun'
      }
    ])
    expect(persisted?.sourceSnapshot?.template.imageAssets).toEqual(
      expect.arrayContaining([
        { key: imageKeys[0], assetType: 'emblem', sha256: '4'.repeat(64) },
        {
          key: imageKeys[1],
          assetType: 'signature',
          sha256: '5'.repeat(64)
        },
        {
          key: imageKeys[2],
          assetType: 'signature',
          sha256: '6'.repeat(64)
        }
      ])
    )
    expect(queueAdd).toHaveBeenCalledTimes(1)
  })

  it('blocks V2 publication when a required value has no authoritative source', async () => {
    const created = (await service.createTemplate(templateAdminActor, {
      ...templateInput,
      code: 'TRANSCRIPT-V2-UNSOURCED-HOURS',
      schemaVersion: 2,
      canonicalJson: {
        width: 794,
        height: 1040,
        elements: [
          {
            id: 'hours-1',
            type: 'variable',
            variableKey: 'total_hours',
            content: '{{total_hours}}',
            x: 20,
            y: 30,
            width: 300,
            fontSize: 12,
            fontWeight: 'normal',
            color: '#0f172a',
            textAlign: 'left'
          }
        ]
      },
      placeholders: ['total_hours']
    })) as { versions: readonly { id: string }[] }
    const draft = created.versions[0]
    if (!draft) throw new Error('Expected V2 draft')

    await expect(
      service.publishVersion(templateAdminActor, draft.id)
    ).rejects.toMatchObject({
      status: 422,
      response: {
        code: 'DOCUMENT_PLACEHOLDER_SOURCE_UNAVAILABLE',
        placeholder: 'total_hours'
      }
    })
  })

  it('rejects unsupported overall-score placeholders while saving a V2 draft', async () => {
    await expect(
      service.createTemplate(templateAdminActor, {
        ...templateInput,
        code: 'TRANSCRIPT-V2-INVALID',
        schemaVersion: 2,
        canonicalJson: {
          width: 794,
          height: 1040,
          elements: [
            {
              id: 'hours-1',
              type: 'variable',
              content: '{{evaluation_grade}}',
              variableKey: 'evaluation_grade',
              x: 20,
              y: 30,
              width: 500,
              fontSize: 12,
              fontWeight: 'normal',
              color: '#0f172a',
              textAlign: 'left'
            }
          ]
        },
        placeholders: ['evaluation_grade']
      })
    ).rejects.toMatchObject({
      status: 422,
      response: { code: 'DOCUMENT_TEMPLATE_INVALID' }
    })
    await expect(
      templates.countDocuments({ code: 'TRANSCRIPT-V2-INVALID' })
    ).resolves.toBe(0)
  })

  it('rejects creating another draft when the template is archived', async () => {
    const created = (await service.createTemplate(
      templateAdminActor,
      templateInput
    )) as {
      id: string
    }
    await templates.updateOne(
      { _id: created.id },
      { $set: { status: 'archived' } }
    )

    await expect(
      service.createVersion(templateAdminActor, created.id, {
        schemaVersion: 1,
        canonicalJson,
        placeholders: ['student_name'],
        fontAssetKeys: templateInput.fontAssetKeys
      })
    ).rejects.toMatchObject({ status: 404 })
    await expect(
      versions.countDocuments({ templateId: created.id })
    ).resolves.toBe(1)
  })

  it('accepts documented page/limit filters and validates resource IDs at the route boundary', async () => {
    const created = (await service.createTemplate(
      templateAdminActor,
      templateInput
    )) as {
      id: string
    }
    const controller = new DocumentsController(service)
    const request = { actor: templateAdminActor } as AuthenticatedRequest

    const templatesResult = (await controller.listTemplates(request, {
      page: '1',
      limit: '10',
      status: 'active',
      documentType: 'transcript'
    })) as {
      items: readonly {
        id: string
        latestVersion: { editorMetadata: { nameTh: string } } | null
      }[]
      meta: { total: number }
    }
    expect(templatesResult.items.map((item) => item.id)).toEqual([created.id])
    expect(templatesResult.items[0]?.latestVersion?.editorMetadata).toEqual({
      nameTh: 'แบบทดสอบทรานสคริปต์',
      nameEn: 'Test transcript'
    })
    expect(templatesResult.meta.total).toBe(1)

    const versionsResult = (await controller.listVersions(request, created.id, {
      page: '1',
      limit: '10',
      status: 'draft'
    })) as { items: readonly { versionNumber: number; status: string }[] }
    expect(versionsResult.items).toMatchObject([
      { versionNumber: 1, status: 'draft' }
    ])

    expect(() => controller.getVersion(request, 'not-an-object-id')).toThrow()
  })

  it('limits shared document template and asset management to tenant-scoped actors', async () => {
    const created = (await service.createTemplate(templateAdminActor, {
      ...templateInput,
      code: 'SHARED-TEMPLATE-SCOPE',
      canonicalJson: {
        ...canonicalJson,
        editorMetadata: {
          ...canonicalJson.editorMetadata,
          privateAssetKey: 'private-asset-key-sentinel'
        }
      }
    })) as {
      id: string
      versions: readonly { id: string }[]
    }
    const draft = created.versions[0]
    if (!draft) throw new Error('Expected a Draft document template version')
    await versions.updateOne(
      { _id: draft.id },
      { $set: { status: 'published', publishedAt: new Date() } }
    )
    const secondDraft = (await service.createVersion(
      templateAdminActor,
      created.id,
      {
        schemaVersion: 1,
        canonicalJson,
        placeholders: ['student_name'],
        fontAssetKeys: templateInput.fontAssetKeys
      }
    )) as { id: string; status: string }
    expect(secondDraft.status).toBe('draft')

    const scopedStaff: AuthenticatedActor = {
      ...templateAdminActor,
      id: 'school-scoped-document-staff',
      roles: ['internshipStaff'],
      scope: {
        tenant: false,
        schoolIds: ['school-owned'],
        programIds: ['program-owned']
      },
      roleScopes: [
        {
          role: 'internshipStaff',
          tenant: false,
          schoolIds: ['school-owned'],
          programIds: ['program-owned']
        }
      ]
    }
    const tenantStaff: AuthenticatedActor = {
      ...templateAdminActor,
      id: 'tenant-document-staff',
      roles: ['internshipStaff'],
      roleScopes: [
        {
          role: 'internshipStaff',
          tenant: true,
          schoolIds: [],
          programIds: []
        }
      ]
    }

    await expect(
      service.createTemplate(scopedStaff, {
        ...templateInput,
        code: 'SCOPED-STAFF-MUST-NOT-CREATE-GLOBAL-TEMPLATE'
      })
    ).rejects.toMatchObject({ status: 403 })
    await expect(
      service.createVersion(scopedStaff, created.id, {
        schemaVersion: 1,
        canonicalJson,
        placeholders: ['student_name'],
        fontAssetKeys: templateInput.fontAssetKeys
      })
    ).rejects.toMatchObject({ status: 403 })
    await expect(
      service.updateVersion(scopedStaff, draft.id, {
        revision: 1,
        schemaVersion: 1,
        canonicalJson,
        placeholders: ['student_name'],
        fontAssetKeys: templateInput.fontAssetKeys
      })
    ).rejects.toMatchObject({ status: 403 })
    await expect(
      service.publishVersion(scopedStaff, draft.id)
    ).rejects.toMatchObject({
      status: 403
    })
    await expect(
      service.listAssets(scopedStaff, { page: 1, pageSize: 10 })
    ).rejects.toMatchObject({ status: 403 })
    await expect(
      service.uploadAsset(
        scopedStaff,
        {
          assetType: 'font',
          rightsBasis: 'isolated test fixture',
          rightsConfirmed: true
        },
        { originalname: 'blocked.ttf', buffer: Buffer.from('not a font') },
        'blocked-scoped-staff-upload'
      )
    ).rejects.toMatchObject({ status: 403 })

    const publishedTemplates = (await service.listTemplates(scopedStaff, {
      page: 1,
      pageSize: 10
    })) as { items: readonly Record<string, unknown>[] }
    expect(publishedTemplates).toMatchObject({
      items: [
        {
          id: created.id,
          latestVersion: {
            id: draft.id,
            status: 'published',
            editorMetadata: {
              nameTh: canonicalJson.editorMetadata.nameTh,
              nameEn: canonicalJson.editorMetadata.nameEn
            }
          }
        }
      ],
      meta: { total: 1 }
    })
    expect(publishedTemplates.items[0]).not.toHaveProperty(
      'latestVersion.editorMetadata.privateAssetKey'
    )
    const publishedVersions = (await service.listVersions(
      scopedStaff,
      created.id,
      { page: 1, pageSize: 10 },
      'draft'
    )) as { items: readonly Record<string, unknown>[] }
    expect(publishedVersions).toMatchObject({
      items: [
        {
          id: draft.id,
          status: 'published',
          templateId: created.id
        }
      ],
      meta: { total: 1 }
    })
    expect(publishedVersions.items[0]).not.toHaveProperty('canonicalJson')
    expect(publishedVersions.items[0]).not.toHaveProperty('fontAssetKeys')
    expect(publishedVersions.items[0]).not.toHaveProperty('placeholders')
    const publishedSummary = (await service.getVersion(
      scopedStaff,
      draft.id
    )) as Record<string, unknown>
    expect(publishedSummary).toMatchObject({
      id: draft.id,
      status: 'published',
      templateId: created.id
    })
    expect(publishedSummary).not.toHaveProperty('canonicalJson')
    expect(publishedSummary).not.toHaveProperty('fontAssetKeys')
    expect(publishedSummary).not.toHaveProperty('placeholders')
    await expect(
      service.getVersion(scopedStaff, secondDraft.id)
    ).rejects.toMatchObject({ status: 404 })
    await templates.updateOne(
      { _id: created.id },
      { $set: { status: 'archived' } }
    )
    await expect(
      service.getVersion(scopedStaff, draft.id)
    ).rejects.toMatchObject({
      status: 404
    })
    await templates.updateOne(
      { _id: created.id },
      { $set: { status: 'active' } }
    )

    await expect(
      service.getVersion(tenantStaff, draft.id)
    ).resolves.toMatchObject({
      id: draft.id,
      status: 'published',
      fontAssetKeys: templateInput.fontAssetKeys
    })
    await expect(
      service.getVersion(tenantStaff, secondDraft.id)
    ).resolves.toMatchObject({
      id: secondDraft.id,
      status: 'draft',
      canonicalJson
    })
    await expect(
      service.listTemplates(tenantStaff, { page: 1, pageSize: 10 })
    ).resolves.toMatchObject({
      items: [
        {
          id: created.id,
          latestVersion: { id: secondDraft.id, status: 'draft' }
        }
      ],
      meta: { total: 1 }
    })
    await expect(
      service.createTemplate(tenantStaff, {
        ...templateInput,
        code: 'TENANT-STAFF-CAN-CREATE-GLOBAL-TEMPLATE'
      })
    ).resolves.toMatchObject({ documentType: 'transcript' })
  })
})
