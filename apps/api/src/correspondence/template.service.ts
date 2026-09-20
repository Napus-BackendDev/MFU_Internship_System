import {
  ConflictException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException
} from '@nestjs/common'
import { InjectModel } from '@nestjs/mongoose'
import type { Model } from 'mongoose'

import { paginate, type PaginationInput } from '../common/pagination.js'
import {
  EmailTemplateRecord,
  EmailTemplateVersionRecord
} from './correspondence.schema.js'

const ALLOWED_PLACEHOLDERS = new Set([
  'student_name',
  'student_id',
  'company_name',
  'evaluator_name',
  'invitation_url',
  'deadline',
  'pin'
])

export const DEFAULT_SYSTEM_TEMPLATES = {
  evaluation_request: {
    code: 'evaluation_request',
    name: 'ขอความอนุเคราะห์ประเมินผลการฝึกงาน / กรอกข้อมูลผู้ประเมิน',
    description: 'ส่งไปยังสถานประกอบการหรือผู้ประสานงาน เพื่อขอความอนุเคราะห์กรอกข้อมูลผู้ประเมินหรือเริ่มการประเมินนักศึกษา',
    subject: '[มหาวิทยาลัยแม่ฟ้าหลวง] ขอความอนุเคราะห์ประเมินผลการฝึกงานของนักศึกษา ({{student_name}})',
    html: `<div style="font-family: 'Sarabun', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; padding: 24px; border: 1px solid #e2e8f0; border-radius: 12px; background-color: #ffffff;">
  <div style="text-align: center; margin-bottom: 24px;">
    <h2 style="color: #0f172a; margin: 0; font-size: 20px;">มหาวิทยาลัยแม่ฟ้าหลวง</h2>
    <p style="color: #64748b; margin: 4px 0 0; font-size: 14px;">ระบบประเมินผลการฝึกงานและสหกิจศึกษา</p>
  </div>
  <div style="border-top: 2px solid #059669; padding-top: 20px;">
    <p style="font-size: 15px; color: #1e293b;">เรียน <strong>{{evaluator_name}}</strong> (สถานประกอบการ: <strong>{{company_name}}</strong>),</p>
    <p style="font-size: 14px; color: #334155; line-height: 1.6;">
      เนื่องด้วยนักศึกษา <strong>{{student_name}}</strong> (รหัสนักศึกษา: <strong>{{student_id}}</strong>) ได้เข้าปฏิบัติการฝึกงาน ณ สถานประกอบการของท่าน ทางมหาวิทยาลัยแม่ฟ้าหลวงใคร่ขอความอนุเคราะห์ท่านในการประเมินผลการปฏิบัติงานของนักศึกษา หรือมอบหมายผู้ประเมินเพื่อดำเนินการตามขั้นตอน
    </p>
    <div style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 16px; margin: 20px 0;">
      <p style="margin: 0 0 8px; font-size: 13px; color: #64748b;">ข้อมูลการเข้าทำแบบประเมิน:</p>
      <p style="margin: 4px 0; font-size: 14px; color: #0f172a;"><strong>นักศึกษา:</strong> {{student_name}} ({{student_id}})</p>
      <p style="margin: 4px 0; font-size: 14px; color: #0f172a;"><strong>กำหนดส่งผลประเมิน:</strong> {{deadline}}</p>
      <p style="margin: 4px 0; font-size: 14px; color: #0f172a;"><strong>รหัส PIN สำหรับเข้าใช้งาน:</strong> <span style="font-family: monospace; font-weight: bold; color: #059669;">{{pin}}</span></p>
    </div>
    <div style="text-align: center; margin: 28px 0;">
      <a href="{{invitation_url}}" style="background-color: #059669; color: #ffffff; text-decoration: none; padding: 12px 28px; border-radius: 8px; font-weight: bold; font-size: 15px; display: inline-block;">
        เข้าสู่ระบบทำแบบประเมิน
      </a>
    </div>
    <p style="font-size: 13px; color: #64748b; line-height: 1.5;">
      หากปุ่มด้านบนไม่สามารถคลิกได้ สามารถคัดลอกลิงก์ด้านล่างนี้ไปวางในเบราว์เซอร์ของท่าน:<br/>
      <a href="{{invitation_url}}" style="color: #059669; word-break: break-all;">{{invitation_url}}</a>
    </p>
  </div>
  <div style="margin-top: 32px; border-top: 1px solid #f1f5f9; padding-top: 16px; text-align: center; color: #94a3b8; font-size: 12px;">
    ขอขอบพระคุณในความร่วมมือ<br/>
    ศูนย์บริการฝึกงานและสหกิจศึกษา มหาวิทยาลัยแม่ฟ้าหลวง
  </div>
</div>`,
    text: `เรียน {{evaluator_name}} ({{company_name}}),

เนื่องด้วยนักศึกษา {{student_name}} (รหัสนักศึกษา: {{student_id}}) ได้เข้าปฏิบัติการฝึกงาน ณ สถานประกอบการของท่าน ทางมหาวิทยาลัยแม่ฟ้าหลวงใคร่ขอความอนุเคราะห์ท่านในการประเมินผลการปฏิบัติงานของนักศึกษา

ลิงก์เข้าสู่ระบบทำแบบประเมิน: {{invitation_url}}
รหัส PIN: {{pin}}
กำหนดส่ง: {{deadline}}

ขอขอบพระคุณในความร่วมมือ
มหาวิทยาลัยแม่ฟ้าหลวง`
  },
  evaluation_reminder: {
    code: 'evaluation_reminder',
    name: 'แจ้งเตือนการกรอกแบบประเมินผลการฝึกงาน',
    description: 'ส่งไปยังผู้ประเมินเพื่อแจ้งเตือนว่ายังไม่ได้กรอกแบบประเมิน หรือแบบประเมินยังไม่เสร็จสมบูรณ์',
    subject: '[แจ้งเตือน] ขอความอนุเคราะห์กรอกแบบประเมินการฝึกงานของนักศึกษา ({{student_name}})',
    html: `<div style="font-family: 'Sarabun', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; padding: 24px; border: 1px solid #e2e8f0; border-radius: 12px; background-color: #ffffff;">
  <div style="text-align: center; margin-bottom: 24px;">
    <h2 style="color: #0f172a; margin: 0; font-size: 20px;">มหาวิทยาลัยแม่ฟ้าหลวง</h2>
    <p style="color: #d97706; margin: 4px 0 0; font-size: 14px; font-weight: 600;">แจ้งเตือน: แบบประเมินผลการฝึกงานรอการดำเนินการ</p>
  </div>
  <div style="border-top: 2px solid #d97706; padding-top: 20px;">
    <p style="font-size: 15px; color: #1e293b;">เรียน <strong>{{evaluator_name}}</strong> (สถานประกอบการ: <strong>{{company_name}}</strong>),</p>
    <p style="font-size: 14px; color: #334155; line-height: 1.6;">
      ตามที่ทางมหาวิทยาลัยแม่ฟ้าหลวงได้ส่งแบบประเมินผลการฝึกงานของนักศึกษา <strong>{{student_name}}</strong> (รหัสนักศึกษา: <strong>{{student_id}}</strong>) ไปยังท่านแล้วนั้น ปัจจุบันระบบพบว่าแบบประเมินดังกล่าวยังไม่ได้ดำเนินการให้เสร็จสิ้นสมบูรณ์
    </p>
    <p style="font-size: 14px; color: #334155; line-height: 1.6;">
      ทางมหาวิทยาลัยจึงขอความกรุณาท่านช่วยสละเวลาเข้ามาบันทึกผลการประเมินให้แก่นักศึกษา ก่อนครบกำหนดส่งในวันที่ <strong>{{deadline}}</strong> เพื่อให้นักศึกษาสามารถนำผลไปประกอบการสำเร็จการศึกษาตามกำหนดการ
    </p>
    <div style="background-color: #fffbeb; border: 1px solid #fde68a; border-radius: 8px; padding: 16px; margin: 20px 0;">
      <p style="margin: 0 0 8px; font-size: 13px; color: #92400e; font-weight: 600;">ข้อมูลแบบประเมินที่ค้างอยู่:</p>
      <p style="margin: 4px 0; font-size: 14px; color: #0f172a;"><strong>นักศึกษา:</strong> {{student_name}} ({{student_id}})</p>
      <p style="margin: 4px 0; font-size: 14px; color: #0f172a;"><strong>กำหนดส่งสุดท้าย:</strong> <span style="color: #b45309; font-weight: bold;">{{deadline}}</span></p>
      <p style="margin: 4px 0; font-size: 14px; color: #0f172a;"><strong>รหัส PIN สำหรับเข้าใช้งาน:</strong> <span style="font-family: monospace; font-weight: bold; color: #059669;">{{pin}}</span></p>
    </div>
    <div style="text-align: center; margin: 28px 0;">
      <a href="{{invitation_url}}" style="background-color: #d97706; color: #ffffff; text-decoration: none; padding: 12px 28px; border-radius: 8px; font-weight: bold; font-size: 15px; display: inline-block;">
        คลิกที่นี่เพื่อดำเนินการต่อ
      </a>
    </div>
    <p style="font-size: 13px; color: #64748b; line-height: 1.5;">
      ลิงก์ตรงสำหรับเข้าใช้งาน:<br/>
      <a href="{{invitation_url}}" style="color: #d97706; word-break: break-all;">{{invitation_url}}</a>
    </p>
  </div>
  <div style="margin-top: 32px; border-top: 1px solid #f1f5f9; padding-top: 16px; text-align: center; color: #94a3b8; font-size: 12px;">
    หากท่านดำเนินการเรียบร้อยแล้ว ขออภัยในอีเมลแจ้งเตือนฉบับนี้<br/>
    ศูนย์บริการฝึกงานและสหกิจศึกษา มหาวิทยาลัยแม่ฟ้าหลวง
  </div>
</div>`,
    text: `[แจ้งเตือน] เรียน {{evaluator_name}} ({{company_name}}),

ตามที่ทางมหาวิทยาลัยแม่ฟ้าหลวงได้ส่งแบบประเมินผลการฝึกงานของนักศึกษา {{student_name}} (รหัสนักศึกษา: {{student_id}}) ไปยังท่าน ปัจจุบันแบบประเมินยังไม่เสร็จสมบูรณ์ ทางมหาวิทยาลัยใคร่ขอความอนุเคราะห์ดำเนินการให้แล้วเสร็จภายใน {{deadline}}

ลิงก์สำหรับเข้าดำเนินการ: {{invitation_url}}
รหัส PIN: {{pin}}

ขอขอบพระคุณในความร่วมมือ
มหาวิทยาลัยแม่ฟ้าหลวง`
  }
} as const

export function extractPlaceholders(
  ...content: readonly string[]
): readonly string[] {
  const matches = content.flatMap((value) =>
    [...value.matchAll(/{{\s*([a-z_]+)\s*}}/g)].map((match) => match[1] ?? '')
  )
  return [...new Set(matches.filter(Boolean))]
}

@Injectable()
export class TemplateService {
  public constructor(
    @InjectModel(EmailTemplateRecord.name)
    private readonly templates: Model<EmailTemplateRecord>,
    @InjectModel(EmailTemplateVersionRecord.name)
    private readonly versions: Model<EmailTemplateVersionRecord>
  ) {}

  public list(
    page: PaginationInput & { audience?: EmailTemplateRecord['audience'] }
  ): Promise<unknown> {
    return paginate(
      this.templates,
      page.audience ? { audience: page.audience } : {},
      page,
      { code: 1, _id: 1 }
    )
  }

  public async create(input: {
    code: string
    audience: EmailTemplateRecord['audience']
    subject: string
    html: string
    text: string
  }): Promise<unknown> {
    const template = await this.templates.create({
      code: input.code,
      audience: input.audience,
      status: 'active'
    })
    const version = await this.versions.create({
      templateId: template.id,
      versionNumber: 1,
      status: 'draft',
      subject: input.subject,
      html: input.html,
      text: input.text,
      placeholders: [
        ...extractPlaceholders(input.subject, input.html, input.text)
      ]
    })
    return { ...template.toJSON(), versions: [version.toJSON()] }
  }

  public async publish(versionId: string): Promise<unknown> {
    const version = await this.versions.findById(versionId).exec()
    if (!version) throw new NotFoundException({ code: 'RESOURCE_NOT_FOUND' })
    if (version.status !== 'draft') {
      throw new ConflictException({ code: 'PUBLISHED_VERSION_IMMUTABLE' })
    }
    const placeholders = extractPlaceholders(
      version.subject,
      version.html,
      version.text
    )
    const unknown = placeholders.filter(
      (item) => !ALLOWED_PLACEHOLDERS.has(item)
    )
    if (unknown.length > 0) {
      throw new UnprocessableEntityException({
        code: 'UNKNOWN_TEMPLATE_PLACEHOLDER',
        details: { placeholders: unknown }
      })
    }
    const published = await this.versions
      .findOneAndUpdate(
        { _id: versionId, status: 'draft' },
        {
          $set: { status: 'published', placeholders, publishedAt: new Date() }
        },
        { new: true }
      )
      .exec()
    if (!published) throw new ConflictException({ code: 'VERSION_CONFLICT' })
    return published.toJSON()
  }

  public async getSystemTemplates(): Promise<unknown[]> {
    const codes = ['evaluation_request', 'evaluation_reminder'] as const
    const results = []

    for (const code of codes) {
      const def = DEFAULT_SYSTEM_TEMPLATES[code]
      let template = await this.templates.findOne({ code }).exec()
      if (!template) {
        template = await this.templates.create({
          code,
          audience: 'evaluator',
          status: 'active'
        })
      }

      let version = await this.versions
        .findOne({ templateId: template.id, status: 'published' })
        .sort({ versionNumber: -1 })
        .exec()

      if (!version) {
        const latest = await this.versions
          .findOne({ templateId: template.id })
          .sort({ versionNumber: -1 })
          .exec()

        const versionNumber = (latest?.versionNumber ?? 0) + 1
        const placeholders = [
          ...extractPlaceholders(def.subject, def.html, def.text)
        ]
        version = await this.versions.create({
          templateId: template.id,
          versionNumber,
          status: 'published',
          subject: def.subject,
          html: def.html,
          text: def.text,
          placeholders,
          publishedAt: new Date()
        })
      }

      results.push({
        id: template.id,
        code,
        name: def.name,
        description: def.description,
        subject: version.subject,
        html: version.html,
        text: version.text,
        placeholders: version.placeholders,
        versionId: version.id,
        versionNumber: version.versionNumber,
        updatedAt:
          (version as unknown as { updatedAt?: Date }).updatedAt ??
          version.publishedAt ??
          new Date()
      })
    }

    return results
  }

  public async updateSystemTemplate(
    code: string,
    input: { subject: string; html: string; text: string }
  ): Promise<unknown> {
    if (code !== 'evaluation_request' && code !== 'evaluation_reminder') {
      throw new NotFoundException({ code: 'INVALID_TEMPLATE_CODE' })
    }

    const def = DEFAULT_SYSTEM_TEMPLATES[code]
    let template = await this.templates.findOne({ code }).exec()
    if (!template) {
      template = await this.templates.create({
        code,
        audience: 'evaluator',
        status: 'active'
      })
    }

    const placeholders = [
      ...extractPlaceholders(input.subject, input.html, input.text)
    ]
    const unknown = placeholders.filter(
      (item) => !ALLOWED_PLACEHOLDERS.has(item)
    )
    if (unknown.length > 0) {
      throw new UnprocessableEntityException({
        code: 'UNKNOWN_TEMPLATE_PLACEHOLDER',
        details: { placeholders: unknown }
      })
    }

    const latest = await this.versions
      .findOne({ templateId: template.id })
      .sort({ versionNumber: -1 })
      .exec()

    const versionNumber = (latest?.versionNumber ?? 0) + 1
    const newVersion = await this.versions.create({
      templateId: template.id,
      versionNumber,
      status: 'published',
      subject: input.subject,
      html: input.html,
      text: input.text,
      placeholders,
      publishedAt: new Date()
    })

    return {
      id: template.id,
      code,
      name: def.name,
      description: def.description,
      subject: newVersion.subject,
      html: newVersion.html,
      text: newVersion.text,
      placeholders: newVersion.placeholders,
      versionId: newVersion.id,
      versionNumber: newVersion.versionNumber,
      updatedAt: newVersion.publishedAt
    }
  }

  public async resetSystemTemplate(code: string): Promise<unknown> {
    if (code !== 'evaluation_request' && code !== 'evaluation_reminder') {
      throw new NotFoundException({ code: 'INVALID_TEMPLATE_CODE' })
    }
    const def = DEFAULT_SYSTEM_TEMPLATES[code]
    return this.updateSystemTemplate(code, {
      subject: def.subject,
      html: def.html,
      text: def.text
    })
  }
}
