import * as XLSX from 'xlsx'
import { createHash } from 'node:crypto'
import { MongoMemoryReplSet } from 'mongodb-memory-server-core'
import { createConnection, type Connection, type Model } from 'mongoose'
import type { AuthenticatedActor } from '@internship/shared-types'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import {
  DocumentProcessor,
  type DocumentFontEmbedder
} from '../../worker/src/runtime/document.processor.js'
import { EmailProcessor } from '../../worker/src/runtime/email.processor.js'
import {
  createModels as createWorkerModels,
  type WorkerModels
} from '../../worker/src/runtime/models.js'

import {
  AcademicTermRecord,
  AcademicTermSchema,
  CourseRecord,
  CourseSchema,
  ProgramRecord,
  ProgramSchema,
  SchoolRecord,
  SchoolSchema
} from '../src/academic/academic.schema.js'
import { AuditLogRecord, AuditLogSchema } from '../src/audit/audit.schema.js'
import { AuditService } from '../src/audit/audit.service.js'
import { SessionRecord, SessionSchema } from '../src/auth/user.schema.js'
import { TokenService } from '../src/auth/token.service.js'
import {
  CampaignRecord,
  CampaignSchema,
  DeliveryRecord,
  DeliverySchema,
  DeliveryRetryRequestRecord,
  DeliveryRetryRequestSchema,
  EmailTemplateVersionRecord,
  EmailTemplateVersionSchema,
  InvitationRecord,
  InvitationSchema
} from '../src/correspondence/correspondence.schema.js'
import { CampaignService } from '../src/correspondence/campaign.service.js'
import { InvitationService } from '../src/correspondence/invitation.service.js'
import { hashPin } from '../src/correspondence/pin.js'
import type { TemplateService } from '../src/correspondence/template.service.js'
import {
  DocumentAssetRecord,
  DocumentAssetSchema,
  DocumentTemplateRecord,
  DocumentTemplateSchema,
  DocumentTemplateVersionRecord,
  DocumentTemplateVersionSchema,
  GeneratedDocumentRecord,
  GeneratedDocumentSchema
} from '../src/documents/document.schema.js'
import { DocumentsService } from '../src/documents/documents.service.js'
import {
  CompetencySetRecord,
  CompetencySetSchema,
  CompetencyVersionRecord,
  CompetencyVersionSchema,
  EvaluationAssignmentRecord,
  EvaluationAssignmentSchema,
  EvaluationCycleRecord,
  EvaluationCycleSchema,
  EvaluationDraftRecord,
  EvaluationDraftSchema,
  EvaluationRecord,
  EvaluationSchema,
  type SectionRecord
} from '../src/evaluations/evaluation.schema.js'
import { EvaluationsService } from '../src/evaluations/evaluations.service.js'
import { ReportsService } from '../src/reports/reports.service.js'
import {
  EvaluatorRecord,
  EvaluatorSchema,
  OrganizationRecord,
  OrganizationSchema,
  PlacementRecord,
  PlacementSchema,
  StudentRecord,
  StudentSchema
} from '../src/members/members.schema.js'
import {
  StudentImportBatchRecord,
  StudentImportBatchSchema,
  StudentImportCommitRecord,
  StudentImportCommitSchema,
  StudentImportRowRecord,
  StudentImportRowSchema
} from '../src/members/student-import.schema.js'
import { StudentImportService } from '../src/members/student-import.service.js'

const authSecret = 'isolated-production-flow-test-secret-at-least-32-bytes'
const invitationPepper =
  'isolated-production-flow-test-pepper-at-least-32-bytes'
const sections: SectionRecord[] = [
  {
    id: 'hard',
    title: { th: 'ทักษะวิชาชีพ', en: 'Professional skills' },
    category: 'special',
    questions: [
      {
        id: 'hard-1',
        label: { th: 'ทักษะหนึ่ง', en: 'Skill one' },
        type: 'rating',
        required: true,
        scaleMin: 1,
        scaleMax: 5
      }
    ]
  },
  {
    id: 'soft',
    title: { th: 'ทักษะทั่วไป', en: 'General skills' },
    category: 'general',
    questions: [
      {
        id: 'soft-1',
        label: { th: 'ทักษะทั่วไปหนึ่ง', en: 'General skill one' },
        type: 'rating',
        required: true,
        scaleMin: 1,
        scaleMax: 5
      }
    ]
  },
  {
    id: 'situation',
    title: { th: 'สถานการณ์', en: 'Situation' },
    category: 'suggestion',
    questions: [
      {
        id: 'situation-1',
        label: { th: 'เล่าเหตุการณ์', en: 'Describe an event' },
        type: 'text',
        required: false
      }
    ]
  }
]

describe('production MVP flow across import, invitation, evaluation, and documents', () => {
  let replicaSet: MongoMemoryReplSet
  let connection: Connection
  let students: Model<StudentRecord>
  let terms: Model<AcademicTermRecord>
  let schools: Model<SchoolRecord>
  let programs: Model<ProgramRecord>
  let courses: Model<CourseRecord>
  let importBatches: Model<StudentImportBatchRecord>
  let importRows: Model<StudentImportRowRecord>
  let importCommits: Model<StudentImportCommitRecord>
  let competencySets: Model<CompetencySetRecord>
  let competencyVersions: Model<CompetencyVersionRecord>
  let cycles: Model<EvaluationCycleRecord>
  let assignments: Model<EvaluationAssignmentRecord>
  let drafts: Model<EvaluationDraftRecord>
  let evaluations: Model<EvaluationRecord>
  let organizations: Model<OrganizationRecord>
  let evaluators: Model<EvaluatorRecord>
  let placements: Model<PlacementRecord>
  let campaigns: Model<CampaignRecord>
  let deliveries: Model<DeliveryRecord>
  let deliveryRetryRequests: Model<DeliveryRetryRequestRecord>
  let invitations: Model<InvitationRecord>
  let emailTemplateVersions: Model<EmailTemplateVersionRecord>
  let sessions: Model<SessionRecord>
  let documentTemplates: Model<DocumentTemplateRecord>
  let documentVersions: Model<DocumentTemplateVersionRecord>
  let documentAssets: Model<DocumentAssetRecord>
  let generatedDocuments: Model<GeneratedDocumentRecord>
  let workerModels: WorkerModels
  let auditLogs: Model<AuditLogRecord>
  let importService: StudentImportService
  let evaluationsService: EvaluationsService
  let campaignService: CampaignService
  let invitationService: InvitationService
  let documentsService: DocumentsService
  let emailQueueAdd: ReturnType<typeof vi.fn>
  let documentQueueAdd: ReturnType<typeof vi.fn>
  let emailTemplateVersionId: string
  const staff: AuthenticatedActor = {
    id: 'staff-production-flow',
    email: 'staff@example.test',
    displayName: 'Integration staff',
    roles: ['systemAdmin'],
    scope: { tenant: true, schoolIds: [], programIds: [] }
  }

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

    students = connection.model(StudentRecord.name, StudentSchema)
    terms = connection.model(AcademicTermRecord.name, AcademicTermSchema)
    schools = connection.model(SchoolRecord.name, SchoolSchema)
    programs = connection.model(ProgramRecord.name, ProgramSchema)
    courses = connection.model(CourseRecord.name, CourseSchema)
    importBatches = connection.model(
      StudentImportBatchRecord.name,
      StudentImportBatchSchema
    )
    importRows = connection.model(
      StudentImportRowRecord.name,
      StudentImportRowSchema
    )
    importCommits = connection.model(
      StudentImportCommitRecord.name,
      StudentImportCommitSchema
    )
    competencySets = connection.model(
      CompetencySetRecord.name,
      CompetencySetSchema
    )
    competencyVersions = connection.model(
      CompetencyVersionRecord.name,
      CompetencyVersionSchema
    )
    cycles = connection.model(EvaluationCycleRecord.name, EvaluationCycleSchema)
    assignments = connection.model(
      EvaluationAssignmentRecord.name,
      EvaluationAssignmentSchema
    )
    drafts = connection.model(EvaluationDraftRecord.name, EvaluationDraftSchema)
    evaluations = connection.model(EvaluationRecord.name, EvaluationSchema)
    organizations = connection.model(
      OrganizationRecord.name,
      OrganizationSchema
    )
    evaluators = connection.model(EvaluatorRecord.name, EvaluatorSchema)
    placements = connection.model(PlacementRecord.name, PlacementSchema)
    campaigns = connection.model(CampaignRecord.name, CampaignSchema)
    deliveries = connection.model(DeliveryRecord.name, DeliverySchema)
    deliveryRetryRequests = connection.model(
      DeliveryRetryRequestRecord.name,
      DeliveryRetryRequestSchema
    )
    invitations = connection.model(InvitationRecord.name, InvitationSchema)
    emailTemplateVersions = connection.model(
      EmailTemplateVersionRecord.name,
      EmailTemplateVersionSchema
    )
    sessions = connection.model(SessionRecord.name, SessionSchema)
    documentTemplates = connection.model(
      DocumentTemplateRecord.name,
      DocumentTemplateSchema
    )
    documentVersions = connection.model(
      DocumentTemplateVersionRecord.name,
      DocumentTemplateVersionSchema
    )
    documentAssets = connection.model(
      DocumentAssetRecord.name,
      DocumentAssetSchema
    )
    generatedDocuments = connection.model(
      GeneratedDocumentRecord.name,
      GeneratedDocumentSchema
    )
    workerModels = createWorkerModels(connection)
    auditLogs = connection.model(AuditLogRecord.name, AuditLogSchema)
    const auditService = new AuditService(auditLogs)
    importService = new StudentImportService(
      connection,
      students,
      schools,
      programs,
      courses,
      terms,
      importBatches,
      importRows,
      importCommits,
      auditService
    )
    evaluationsService = new EvaluationsService(
      connection,
      competencySets,
      competencyVersions,
      cycles,
      assignments,
      drafts,
      evaluations,
      terms,
      students,
      placements,
      evaluators,
      organizations,
      schools,
      programs,
      auditService
    )

    const config = {
      get: (key: string) =>
        ({
          AUTH_JWT_SECRET: authSecret,
          INVITATION_TOKEN_PEPPER: invitationPepper,
          PUBLIC_WEB_URL: 'https://internship.example.test',
          ACCESS_TOKEN_TTL_SECONDS: 600,
          REFRESH_TOKEN_TTL_SECONDS: 3600,
          S3_BUCKET: 'isolated-test-documents',
          S3_ENDPOINT: 'http://127.0.0.1:9000',
          S3_REGION: 'us-east-1',
          S3_FORCE_PATH_STYLE: true,
          S3_ACCESS_KEY_ID: 'test-access-key',
          S3_SECRET_ACCESS_KEY: 'test-secret-key'
        })[key]
    }
    emailQueueAdd = vi.fn().mockResolvedValue(undefined)
    documentQueueAdd = vi.fn().mockResolvedValue(undefined)
    campaignService = new CampaignService(
      connection,
      config as never,
      {
        ensureSystemTemplateVersion: vi.fn(() =>
          Promise.resolve(emailTemplateVersionId)
        )
      } as unknown as TemplateService,
      { add: emailQueueAdd } as never,
      campaigns,
      deliveries,
      deliveryRetryRequests,
      invitations,
      emailTemplateVersions,
      assignments,
      evaluators,
      students,
      placements,
      competencySets,
      competencyVersions,
      cycles,
      sessions,
      auditService
    )
    const tokenService = new TokenService(config as never)
    invitationService = new InvitationService(
      invitations,
      assignments,
      evaluators,
      config as never,
      tokenService,
      {
        issue: vi.fn(() =>
          Promise.resolve({
            accessToken: 'test-access-token',
            refreshToken: 'test-refresh-token'
          })
        )
      } as never
    )
    documentsService = new DocumentsService(
      { add: documentQueueAdd } as never,
      documentTemplates,
      documentVersions,
      generatedDocuments,
      students,
      evaluations,
      assignments,
      config as never,
      auditService,
      documentAssets,
      terms,
      schools,
      programs,
      placements,
      organizations
    )
    await Promise.all(
      [
        students,
        terms,
        schools,
        programs,
        courses,
        importBatches,
        importRows,
        importCommits,
        competencySets,
        competencyVersions,
        cycles,
        assignments,
        drafts,
        evaluations,
        organizations,
        evaluators,
        placements,
        campaigns,
        deliveries,
        invitations,
        emailTemplateVersions,
        sessions,
        documentTemplates,
        documentVersions,
        documentAssets,
        generatedDocuments,
        auditLogs
      ].map((model) => model.init())
    )
  }, 180_000)

  afterAll(async () => {
    await connection?.close()
    await replicaSet?.stop()
  }, 30_000)

  it('imports a student, assigns and invites evaluator, submits evaluation, and queues that student’s document', async () => {
    const school = await schools.create({
      schoolCode: 'ADT',
      name: { th: 'สำนักวิชาเทคโนโลยีดิจิทัล', en: 'Digital Technology' },
      status: 'active'
    })
    const program = await programs.create({
      schoolId: school.id,
      programCode: 'SE',
      name: { th: 'วิศวกรรมซอฟต์แวร์', en: 'Software Engineering' },
      status: 'active'
    })
    await courses.create({
      courseCode: 'SWE491',
      programIds: [program.id],
      name: { th: 'สหกิจศึกษา', en: 'Cooperative Education' },
      status: 'active'
    })
    const term = await terms.create({
      code: '1/2566',
      academicYear: 2566,
      semester: '1',
      startsAt: new Date(Date.now() - 86_400_000),
      endsAt: new Date(Date.now() + 86_400_000),
      status: 'open'
    })

    const workbook = XLSX.utils.book_new()
    const sheet = XLSX.utils.json_to_sheet([
      {
        'รหัสนักศึกษา (studentId)': '6631503001',
        'ชื่อ-นามสกุลไทย (nameTh)': 'นางสาวตัวอย่าง ระบบ',
        'ชื่อ-นามสกุลอังกฤษ (nameEn)': 'Example Student',
        'อีเมลนักศึกษา (email)': 'example.student@lamduan.mfu.ac.th',
        'รหัสสำนักวิชา (schoolCode)': 'ADT',
        'รหัสหลักสูตร (programCode)': 'SE',
        'รหัสวิชา (courseCode)': 'SWE491',
        'ภาคการศึกษา (semester)': '1/2566',
        'ปีการศึกษา (admissionYear)': 2566
      }
    ])
    XLSX.utils.book_append_sheet(workbook, sheet, 'Students')
    const workbookBuffer = XLSX.write(workbook, {
      type: 'buffer',
      bookType: 'xlsx'
    }) as Buffer
    const preview = (await importService.preview(
      staff,
      'students.xlsx',
      workbookBuffer
    )) as { batchId: string; items: Array<{ id: string; action: string }> }
    expect(preview.items).toMatchObject([{ action: 'create' }])
    const row = preview.items[0]
    if (!row) throw new Error('Expected one import preview row')
    await expect(
      importService.commit(
        staff,
        preview.batchId,
        'production-flow-import-key-0001',
        [{ rowId: row.id, action: 'create' }],
        'production-flow-import'
      )
    ).resolves.toMatchObject({ status: 'completed' })

    const student = await students.findOne({ studentId: '6631503001' }).exec()
    expect(student?.academicTermId).toBe(term.id)
    expect(student?.schoolId).toBe(school.id)
    expect(student?.programId).toBe(program.id)
    if (!student) throw new Error('Expected imported student')

    const organization = await organizations.create({
      organizationCode: 'TEST-ORG',
      name: { th: 'สถานประกอบการทดสอบ', en: 'Test Organization' },
      status: 'active'
    })
    const evaluator = await evaluators.create({
      organizationId: organization.id,
      email: 'evaluator@example.test',
      name: { th: 'ผู้ประเมิน', en: 'Evaluator' },
      position: { th: 'ผู้จัดการ', en: 'Manager' },
      status: 'active'
    })
    const placement = await placements.create({
      studentId: student.id,
      organizationId: organization.id,
      academicTermId: term.id,
      schoolId: school.id,
      programId: program.id,
      positionTitle: { th: 'นักศึกษาฝึกงาน', en: 'Intern' },
      startsAt: new Date(Date.now() - 60_000),
      endsAt: new Date(Date.now() + 3_600_000),
      status: 'active'
    })

    const competencySet = (await evaluationsService.createCompetencySet(staff, {
      code: 'MVP-FLOW',
      name: { th: 'แบบประเมิน MVP', en: 'MVP evaluation' },
      status: 'active'
    })) as { id: string }
    const version = (await evaluationsService.createCompetencyVersion(
      staff,
      competencySet.id,
      sections
    )) as { id: string }
    await evaluationsService.publishCompetencyVersion(version.id, staff)
    const cycle = (await evaluationsService.createCycle(staff, {
      code: 'MVP-FLOW-CYCLE',
      name: { th: 'รอบ MVP', en: 'MVP cycle' },
      competencySetVersionId: version.id,
      academicTermId: term.id,
      schoolId: school.id,
      programId: program.id,
      opensAt: new Date(Date.now() - 60_000),
      closesAt: new Date(Date.now() + 3_600_000),
      status: 'draft'
    })) as { id: string }
    await evaluationsService.activateCycle(staff, cycle.id)

    const emailTemplate = await emailTemplateVersions.create({
      templateId: 'evaluation-request',
      versionNumber: 1,
      status: 'published',
      subject: 'Evaluation request',
      html: '<p>{{evaluator_name}}</p><p>PIN: {{pin}}</p><a href="{{invitation_url}}">Open evaluation</a><p>{{deadline}}</p>',
      text: 'PIN: {{pin}} Open evaluation: {{invitation_url}} Deadline: {{deadline}}',
      placeholders: ['evaluator_name', 'pin', 'invitation_url', 'deadline']
    })
    emailTemplateVersionId = emailTemplate.id
    const invite = await campaignService.sendStudentInvitation(
      staff,
      {
        studentId: student.studentId,
        competencySetId: 'MVP-FLOW',
        recipientEmail: evaluator.email,
        deadlineDays: 1
      },
      'production-flow-invitation-key-0001'
    )
    expect(invite.status).toBe('queued')
    const invitationUrl = new URL(invite.invitationUrl)
    expect(invitationUrl.search).toBe('')
    const invitationParameters = new URLSearchParams(
      invitationUrl.hash.slice(1)
    )
    expect([...invitationParameters.keys()].sort()).toEqual([
      'assignment',
      'token'
    ])
    expect(invitationParameters.get('token')).toBeTruthy()
    expect(invitationParameters.get('assignment')).toBe(invite.assignmentId)
    expect(await assignments.countDocuments({ cycleId: cycle.id })).toBe(1)
    expect(
      await invitations.countDocuments({ assignmentId: invite.assignmentId })
    ).toBe(1)
    expect(
      await deliveries.countDocuments({
        campaignId: invite.campaignId,
        status: 'queued'
      })
    ).toBe(1)
    expect(emailQueueAdd).toHaveBeenCalledTimes(1)

    const outboundMessages: Array<{
      to: string
      html: string
      text: string
    }> = []
    const sendMail = vi.fn((message: (typeof outboundMessages)[number]) => {
      outboundMessages.push(message)
      return Promise.resolve({ messageId: 'isolated-mailpit-message-1' })
    })
    const emailProcessor = new EmailProcessor(
      {
        AUTH_JWT_SECRET: authSecret,
        INVITATION_TOKEN_PEPPER: invitationPepper,
        PUBLIC_WEB_URL: 'https://internship.example.test',
        SMTP_HOST: '127.0.0.1',
        SMTP_PORT: 1025,
        SMTP_SECURE: false,
        SMTP_FROM: 'internship@example.test',
        MAIL_DELIVERY_MODE: 'capture',
        CONTAINERIZED: false
      } as never,
      workerModels,
      { error: vi.fn(), info: vi.fn(), warn: vi.fn() } as never
    )
    Object.defineProperty(emailProcessor, 'createTransport', {
      value: () => ({ sendMail })
    })
    await emailProcessor.process({
      name: 'send-delivery',
      data: { deliveryId: invite.deliveryId, invitationId: invite.invitationId }
    } as never)

    expect(sendMail).toHaveBeenCalledTimes(1)
    expect(outboundMessages[0]).toMatchObject({ to: evaluator.email })
    const emailedToken = outboundMessages[0]?.html.match(
      /href="https:\/\/internship\.example\.test\/evaluate#token=([^"]+)"/
    )?.[1]
    expect(emailedToken).toBeTruthy()
    const emailTextLink = outboundMessages[0]?.text.match(
      /Open evaluation: (https:\/\/\S+)/
    )?.[1]
    expect(emailTextLink).toBeTruthy()
    if (!emailTextLink) throw new Error('Expected a plain-text invitation link')
    expect(new URL(emailTextLink).search).toBe('')
    expect(new URL(emailTextLink).hash).toMatch(/^#token=/u)
    const emailedPin = outboundMessages[0]?.html.match(/PIN: (\d{16})/u)?.[1]
    expect(emailedPin).toMatch(/^\d{16}$/u)
    expect(outboundMessages[0]?.text).toMatch(/PIN: \d{16}/)
    expect(outboundMessages[0]?.text).toContain('Open evaluation: https://')
    await expect(
      deliveries
        .findById(invite.deliveryId)
        .select('status providerMessageId')
        .lean()
    ).resolves.toMatchObject({
      status: 'sent',
      providerMessageId: 'isolated-mailpit-message-1'
    })
    await expect(
      campaigns.findById(invite.campaignId).select('status').lean()
    ).resolves.toMatchObject({ status: 'completed' })
    const storedInvitation = await invitations
      .findById(invite.invitationId)
      .select('+accessPin +accessPinHash')
      .lean()
    expect(storedInvitation?.accessPin).toBeUndefined()
    expect(storedInvitation?.accessPinHash).toMatch(/^v2:[a-f0-9]{64}$/u)
    if (!emailedPin) throw new Error('Expected a PIN in the captured email')
    const invalidPinError = {
      code: 'PIN_INVALID',
      message: 'รหัส PIN 16 หลักไม่ถูกต้อง หรือไม่พบแบบฟอร์มที่แอดมินมอบหมาย'
    }
    await expect(
      invitationService.verifyPin(emailedPin)
    ).resolves.toMatchObject({
      actor: { scope: { assignmentId: invite.assignmentId } }
    })
    const invitationExpiry = storedInvitation?.expiresAt
    if (!invitationExpiry) throw new Error('Expected invitation expiry')
    await invitations.updateOne(
      { _id: invite.invitationId },
      { $set: { expiresAt: new Date(Date.now() - 1_000) } }
    )
    await expect(invitationService.verifyPin(emailedPin)).rejects.toMatchObject(
      {
        status: 401,
        response: invalidPinError
      }
    )
    await invitations.updateOne(
      { _id: invite.invitationId },
      { $set: { expiresAt: invitationExpiry } }
    )
    await invitations.updateOne(
      { _id: invite.invitationId },
      { $set: { status: 'revoked' } }
    )
    await expect(invitationService.verifyPin(emailedPin)).rejects.toMatchObject(
      {
        status: 401,
        response: invalidPinError
      }
    )
    await invitations.updateOne(
      { _id: invite.invitationId },
      { $set: { status: 'active' } }
    )
    const legacyPinHash = hashPin(emailedPin, authSecret)
    await Promise.all([
      invitations.updateOne(
        { _id: invite.invitationId },
        { $set: { accessPinHash: legacyPinHash } }
      ),
      assignments.updateOne(
        { _id: invite.assignmentId },
        { $set: { accessPinHash: legacyPinHash } }
      )
    ])
    await expect(
      invitationService.verifyPin(emailedPin)
    ).resolves.toMatchObject({
      actor: { scope: { assignmentId: invite.assignmentId } }
    })

    const token = emailedToken
    if (!token) throw new Error('Expected signed invitation token')
    const evaluatorSession = await invitationService.exchange(token)
    expect(evaluatorSession.actor.scope).toMatchObject({
      assignmentId: invite.assignmentId,
      invitationId: invite.invitationId
    })
    const submitted = (await evaluationsService.submit(
      evaluatorSession.actor,
      invite.assignmentId,
      {
        answers: {
          'hard-1': 4,
          'soft-1': 3,
          'situation-1': 'Resolved a customer issue.'
        },
        idempotencyKey: 'production-flow-submit-key-0001'
      },
      'production-flow-submit'
    )) as {
      id: string
      categoryScores: {
        hardSkill: { average: number }
        softSkill: { average: number }
      }
    }
    expect(submitted.categoryScores).toMatchObject({
      hardSkill: { average: 4 },
      softSkill: { average: 3 }
    })
    await expect(invitationService.verifyPin(emailedPin)).rejects.toMatchObject(
      {
        status: 401,
        response: invalidPinError
      }
    )
    await expect(
      assignments.findById(invite.assignmentId).select('status').lean()
    ).resolves.toMatchObject({ status: 'submitted' })
    await placements.updateOne(
      { _id: placement.id },
      { $set: { status: 'completed' } }
    )

    const documentTemplate = await documentTemplates.create({
      code: 'MVP-CERTIFICATE',
      name: 'MVP Certificate',
      documentType: 'certificate',
      status: 'active'
    })
    const testFontBytes = new Uint8Array([1, 2, 3, 4])
    const testFontSha256 = createHash('sha256')
      .update(testFontBytes)
      .digest('hex')
    const documentVersion = await documentVersions.create({
      templateId: documentTemplate.id,
      versionNumber: 1,
      schemaVersion: 1,
      revision: 1,
      status: 'published',
      canonicalJson: {
        width: 794,
        height: 1123,
        elements: [
          {
            type: 'text',
            x: 24,
            y: 24,
            fontSize: 18,
            text: '{{student_id}}'
          }
        ]
      },
      placeholders: ['student_id'],
      fontAssetKeys: ['approved-test-fonts/test.ttf'],
      publishedAt: new Date()
    })
    await documentAssets.create({
      key: 'approved-test-fonts/test.ttf',
      assetType: 'font',
      originalName: 'test.ttf',
      contentType: 'font/ttf',
      size: 12,
      sha256: testFontSha256,
      rightsBasis: 'Isolated test fixture',
      rightsConfirmedBy: staff.id,
      rightsConfirmedAt: new Date(),
      status: 'active'
    })
    const document = (await documentsService.generate(
      staff,
      {
        studentId: student.studentId,
        templateVersionId: documentVersion.id,
        evaluationIds: [submitted.id]
      },
      'production-flow-document-key-0001',
      'production-flow-document'
    )) as {
      id: string
      status: string
      studentId: string
      evaluationIds: string[]
    }
    expect(document).toMatchObject({
      status: 'queued',
      studentId: student.id,
      evaluationIds: [submitted.id]
    })
    expect(document).not.toHaveProperty('sourceSnapshot')
    const persistedDocument = await generatedDocuments
      .findById(document.id)
      .select('+sourceSnapshot')
      .lean()
    expect(persistedDocument?.sourceSnapshot).toMatchObject({
      snapshotVersion: 1,
      documentNumber: `MFU-CERT-${document.id.toUpperCase()}`,
      template: {
        versionId: documentVersion.id,
        documentType: 'certificate',
        fontAssets: [
          {
            key: 'approved-test-fonts/test.ttf',
            sha256: testFontSha256
          }
        ]
      },
      student: {
        recordId: student.id,
        studentId: student.studentId,
        name: { th: 'นางสาวตัวอย่าง ระบบ', en: 'นางสาวตัวอย่าง ระบบ' },
        academicYear: 2566,
        schoolId: school.id,
        programId: program.id
      },
      placement: {
        id: placement.id,
        organizationId: organization.id,
        schoolId: school.id,
        programId: program.id,
        academicTermId: term.id,
        academicYear: 2566,
        semester: '1'
      },
      evaluations: [{ id: submitted.id }]
    })
    await students.updateOne(
      { _id: student.id },
      { $set: { name: { th: 'ชื่อเปลี่ยนหลังออกคำขอ', en: 'Changed later' } } }
    )
    const stableSnapshot = await generatedDocuments
      .findById(document.id)
      .select('+sourceSnapshot')
      .lean()
    expect(stableSnapshot?.sourceSnapshot).toMatchObject({
      student: {
        name: { th: 'นางสาวตัวอย่าง ระบบ', en: 'นางสาวตัวอย่าง ระบบ' }
      }
    })
    expect(documentQueueAdd).toHaveBeenCalledWith(
      'generate-pdf',
      { documentId: document.id },
      expect.objectContaining({ jobId: `document-${document.id}` })
    )

    const objectStorageSend = vi
      .fn()
      .mockResolvedValueOnce({
        Body: {
          transformToByteArray: () => Promise.resolve(testFontBytes)
        }
      })
      .mockResolvedValueOnce({})
    const documentProcessor = new DocumentProcessor(
      {
        S3_BUCKET: 'isolated-test-bucket',
        S3_ENDPOINT: 'http://127.0.0.1:9000',
        S3_REGION: 'us-east-1',
        S3_FORCE_PATH_STYLE: true,
        S3_ACCESS_KEY_ID: 'isolated-test-key',
        S3_SECRET_ACCESS_KEY: 'isolated-test-secret'
      } as never,
      workerModels,
      { error: vi.fn(), info: vi.fn(), warn: vi.fn() } as never,
      undefined,
      ((pdf) => {
        const testPdf = pdf as {
          embedFont: (font: string) => Promise<unknown>
        }
        return testPdf.embedFont('Helvetica')
      }) satisfies DocumentFontEmbedder
    )
    Object.defineProperty(documentProcessor, 's3', {
      configurable: true,
      value: { send: objectStorageSend }
    })

    await documentProcessor.process({
      data: { documentId: document.id }
    } as never)

    expect(objectStorageSend).toHaveBeenCalledTimes(2)
    const pdfUpload = objectStorageSend.mock.calls[1]?.[0] as
      | {
          input: {
            Bucket: string
            ContentType: string
            Key: string
            Body: Uint8Array
            Metadata: { sha256: string }
          }
        }
      | undefined
    expect(pdfUpload?.input).toMatchObject({
      Bucket: 'isolated-test-bucket',
      ContentType: 'application/pdf'
    })
    expect(pdfUpload?.input.Key).toMatch(
      new RegExp(
        `^generated-documents/${student.id}/${document.id}-[a-f0-9]{64}\\.pdf$`
      )
    )
    const issuedPdfBytes = pdfUpload?.input.Body
    expect(new TextDecoder().decode(issuedPdfBytes?.subarray(0, 5))).toBe(
      '%PDF-'
    )
    expect(createHash('sha256').update(issuedPdfBytes!).digest('hex')).toBe(
      pdfUpload?.input.Metadata.sha256
    )
    const finishedDocument = await generatedDocuments
      .findById(document.id)
      .select('status objectKey sha256')
      .lean()
    expect(finishedDocument).toMatchObject({
      status: 'ready',
      objectKey: pdfUpload?.input.Key,
      sha256: pdfUpload?.input.Metadata.sha256
    })
    expect(await auditLogs.countDocuments({ action: 'documents.issued' })).toBe(
      1
    )
    expect(
      await auditLogs.countDocuments({
        action: 'documents.generation_requested'
      })
    ).toBe(1)
    const reportsService = new ReportsService(
      assignments,
      students,
      deliveries,
      generatedDocuments,
      cycles
    )
    await expect(
      reportsService.overview(staff, {
        termId: term.id,
        schoolId: school.id,
        programId: program.id
      })
    ).resolves.toMatchObject({
      students: 1,
      assignments: { submitted: 1 },
      failedDeliveries: 0,
      readyDocuments: 1
    })
    expect(placement.studentId).toBe(student.id)
  }, 60_000)
})
