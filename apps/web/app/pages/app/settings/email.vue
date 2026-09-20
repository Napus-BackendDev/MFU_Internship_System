<script setup lang="ts">
definePageMeta({ layout: 'app', middleware: 'auth' })

interface SystemTemplateItem {
  id: string
  code: 'evaluation_request' | 'evaluation_reminder'
  name: string
  description: string
  subject: string
  html: string
  text: string
  placeholders: string[]
  versionId: string
  versionNumber: number
  updatedAt: string
}

interface FriendlyForm {
  subject: string
  headerTitle: string
  headerSubtitle: string
  greeting: string
  mainMessage: string
  secondMessage: string
  showInfoBox: boolean
  buttonText: string
  footerNote: string
  footerOrg: string
}

const api = useApi()
const toast = useToast()

const activeTab = ref<'evaluation_request' | 'evaluation_reminder'>('evaluation_request')
// Mode: 'friendly' (Easy form, default), 'preview' (Full preview), 'html' (Advanced code)
const editorMode = ref<'friendly' | 'preview' | 'html'>('friendly')

const loading = ref(true)
const saving = ref(false)
const resetting = ref(false)

const templates = ref<Record<'evaluation_request' | 'evaluation_reminder', SystemTemplateItem>>({
  evaluation_request: {
    id: '',
    code: 'evaluation_request',
    name: 'ขอความอนุเคราะห์ประเมินผลการฝึกงาน / กรอกข้อมูลผู้ประเมิน',
    description: 'ส่งไปยังสถานประกอบการหรือผู้ประสานงาน เพื่อขอความอนุเคราะห์กรอกข้อมูลผู้ประเมินหรือเริ่มการประเมินนักศึกษา',
    subject: '',
    html: '',
    text: '',
    placeholders: [],
    versionId: '',
    versionNumber: 1,
    updatedAt: ''
  },
  evaluation_reminder: {
    id: '',
    code: 'evaluation_reminder',
    name: 'แจ้งเตือนการกรอกแบบประเมินผลการฝึกงาน',
    description: 'ส่งไปยังผู้ประเมินเพื่อแจ้งเตือนว่ายังไม่ได้กรอกแบบประเมิน หรือแบบประเมินยังไม่เสร็จสมบูรณ์',
    subject: '',
    html: '',
    text: '',
    placeholders: [],
    versionId: '',
    versionNumber: 1,
    updatedAt: ''
  }
})

// Friendly form state for each template
const friendlyForms = ref<Record<'evaluation_request' | 'evaluation_reminder', FriendlyForm>>({
  evaluation_request: {
    subject: '',
    headerTitle: 'มหาวิทยาลัยแม่ฟ้าหลวง',
    headerSubtitle: 'ระบบประเมินผลการฝึกงานและสหกิจศึกษา',
    greeting: 'เรียน {{evaluator_name}} (สถานประกอบการ: {{company_name}}),',
    mainMessage: 'เนื่องด้วยนักศึกษา {{student_name}} (รหัสนักศึกษา: {{student_id}}) ได้เข้าปฏิบัติการฝึกงาน ณ สถานประกอบการของท่าน ทางมหาวิทยาลัยแม่ฟ้าหลวงใคร่ขอความอนุเคราะห์ท่านในการประเมินผลการปฏิบัติงานของนักศึกษา หรือมอบหมายผู้ประเมินเพื่อดำเนินการตามขั้นตอน',
    secondMessage: '',
    showInfoBox: true,
    buttonText: 'เข้าสู่แบบประเมินออนไลน์',
    footerNote: 'หากท่านดำเนินการเรียบร้อยแล้ว หรือมีข้อสงสัยประการใด สามารถติดต่อสอบถามศูนย์บริการฝึกงานฯ',
    footerOrg: 'ศูนย์บริการฝึกงานและสหกิจศึกษา มหาวิทยาลัยแม่ฟ้าหลวง'
  },
  evaluation_reminder: {
    subject: '',
    headerTitle: 'มหาวิทยาลัยแม่ฟ้าหลวง',
    headerSubtitle: 'แจ้งเตือน: แบบประเมินผลการฝึกงานรอการดำเนินการ',
    greeting: 'เรียน {{evaluator_name}} (สถานประกอบการ: {{company_name}}),',
    mainMessage: 'ตามที่ทางมหาวิทยาลัยแม่ฟ้าหลวงได้ส่งแบบประเมินผลการฝึกงานของนักศึกษา {{student_name}} (รหัสนักศึกษา: {{student_id}}) ไปยังท่านแล้วนั้น ปัจจุบันระบบพบว่าแบบประเมินดังกล่าวยังไม่ได้ดำเนินการให้เสร็จสิ้นสมบูรณ์',
    secondMessage: 'ทางมหาวิทยาลัยจึงขอความกรุณาท่านช่วยสละเวลาเข้ามาบันทึกผลการประเมินให้แก่นักศึกษา ก่อนครบกำหนดส่งในวันที่ {{deadline}} เพื่อให้นักศึกษาสามารถนำผลไปประกอบการสำเร็จการศึกษาตามกำหนดการ',
    showInfoBox: true,
    buttonText: 'คลิกที่นี่เพื่อดำเนินการต่อ',
    footerNote: 'หากท่านดำเนินการเรียบร้อยแล้ว ขออภัยในอีเมลแจ้งเตือนฉบับนี้',
    footerOrg: 'ศูนย์บริการฝึกงานและสหกิจศึกษา มหาวิทยาลัยแม่ฟ้าหลวง'
  }
})

// Raw drafts for HTML mode
const rawDrafts = ref<Record<'evaluation_request' | 'evaluation_reminder', { html: string; text: string }>>({
  evaluation_request: { html: '', text: '' },
  evaluation_reminder: { html: '', text: '' }
})

const currentTemplate = computed(() => templates.value[activeTab.value])
const currentFriendly = computed(() => friendlyForms.value[activeTab.value])
const currentRaw = computed(() => rawDrafts.value[activeTab.value])

const availablePlaceholders = [
  { tag: '{{student_name}}', label: 'ชื่อนักศึกษา', example: 'นายกิตติภูมิ พงษ์ศิริ', icon: 'i-lucide-user' },
  { tag: '{{student_id}}', label: 'รหัสนักศึกษา', example: '6531501001', icon: 'i-lucide-id-card' },
  { tag: '{{company_name}}', label: 'สถานประกอบการ', example: 'บริษัท โบวองค์ แบบบอนวาเทอร์ลี่ จำกัด', icon: 'i-lucide-building-2' },
  { tag: '{{evaluator_name}}', label: 'ชื่อผู้ประเมิน', example: 'คุณสมชาย ใจดี', icon: 'i-lucide-user-check' },
  { tag: '{{deadline}}', label: 'กำหนดส่ง', example: '12 พฤศจิกายน 2569', icon: 'i-lucide-calendar' },
  { tag: '{{pin}}', label: 'รหัส PIN', example: '2026501001', icon: 'i-lucide-key' },
  { tag: '{{invitation_url}}', label: 'ลิงก์ทำแบบประเมิน', example: 'http://localhost:8180/evaluate?token=sample...', icon: 'i-lucide-link' }
]

function parseHtmlToFriendly(html: string, code: 'evaluation_request' | 'evaluation_reminder'): FriendlyForm {
  const isReminder = code === 'evaluation_reminder'
  const def: FriendlyForm = {
    subject: '',
    headerTitle: 'มหาวิทยาลัยแม่ฟ้าหลวง',
    headerSubtitle: isReminder ? 'แจ้งเตือน: แบบประเมินผลการฝึกงานรอการดำเนินการ' : 'ระบบประเมินผลการฝึกงานและสหกิจศึกษา',
    greeting: 'เรียน {{evaluator_name}} (สถานประกอบการ: {{company_name}}),',
    mainMessage: isReminder
      ? 'ตามที่ทางมหาวิทยาลัยแม่ฟ้าหลวงได้ส่งแบบประเมินผลการฝึกงานของนักศึกษา {{student_name}} (รหัสนักศึกษา: {{student_id}}) ไปยังท่านแล้วนั้น ปัจจุบันระบบพบว่าแบบประเมินดังกล่าวยังไม่ได้ดำเนินการให้เสร็จสิ้นสมบูรณ์'
      : 'เนื่องด้วยนักศึกษา {{student_name}} (รหัสนักศึกษา: {{student_id}}) ได้เข้าปฏิบัติการฝึกงาน ณ สถานประกอบการของท่าน ทางมหาวิทยาลัยแม่ฟ้าหลวงใคร่ขอความอนุเคราะห์ท่านในการประเมินผลการปฏิบัติงานของนักศึกษา หรือมอบหมายผู้ประเมินเพื่อดำเนินการตามขั้นตอน',
    secondMessage: isReminder
      ? 'ทางมหาวิทยาลัยจึงขอความกรุณาท่านช่วยสละเวลาเข้ามาบันทึกผลการประเมินให้แก่นักศึกษา ก่อนครบกำหนดส่งในวันที่ {{deadline}} เพื่อให้นักศึกษาสามารถนำผลไปประกอบการสำเร็จการศึกษาตามกำหนดการ'
      : '',
    showInfoBox: true,
    buttonText: isReminder ? 'คลิกที่นี่เพื่อดำเนินการต่อ' : 'เข้าสู่แบบประเมินออนไลน์',
    footerNote: isReminder
      ? 'หากท่านดำเนินการเรียบร้อยแล้ว ขออภัยในอีเมลแจ้งเตือนฉบับนี้'
      : 'หากท่านดำเนินการเรียบร้อยแล้ว หรือมีข้อสงสัยประการใด สามารถติดต่อศูนย์บริการฝึกงานฯ',
    footerOrg: 'ศูนย์บริการฝึกงานและสหกิจศึกษา มหาวิทยาลัยแม่ฟ้าหลวง'
  }

  if (!html || typeof html !== 'string') return def

  try {
    const h2Match = html.match(/<h2[^>]*>([\s\S]*?)<\/h2>/i)
    if (h2Match?.[1]) def.headerTitle = h2Match[1].replace(/<[^>]+>/g, '').trim()

    const subtitleMatch = html.match(/<h2[\s\S]*?<p[^>]*>([\s\S]*?)<\/p>/i)
    if (subtitleMatch?.[1]) def.headerSubtitle = subtitleMatch[1].replace(/<[^>]+>/g, '').trim()

    const greetingMatch = html.match(/<p style="[^"]*font-size:\s*15px[^"]*">([\s\S]*?)<\/p>/i)
    if (greetingMatch?.[1]) {
      def.greeting = greetingMatch[1].replace(/<\/?strong>/gi, '').trim()
    }

    const btnMatch = html.match(/<a href="{{invitation_url}}"[^>]*>([\s\S]*?)<\/a>/i)
    if (btnMatch?.[1]) {
      def.buttonText = btnMatch[1].replace(/<[^>]+>/g, '').trim()
    }

    const footerMatch = html.match(/<div style="[^"]*margin-top:\s*32px[^"]*">([\s\S]*?)<\/div>/i)
    if (footerMatch?.[1]) {
      const parts = footerMatch[1].split(/<br\s*\/?>/i).map(l => l.replace(/<[^>]+>/g, '').trim()).filter(Boolean)
      if (parts.length > 1 && parts[0]) {
        def.footerNote = parts[0]
        def.footerOrg = parts.slice(1).join(' ')
      } else if (parts.length === 1 && parts[0]) {
        def.footerOrg = parts[0]
      }
    }

    def.showInfoBox = html.includes('{{pin}}') || html.includes('ข้อมูลการเข้าทำแบบประเมิน') || html.includes('ข้อมูลแบบประเมินที่ค้างอยู่')

    const pMatches = [...html.matchAll(/<p style="[^"]*font-size:\s*14px[^"]*">([\s\S]*?)<\/p>/gi)]
    if (pMatches.length >= 2 && pMatches[0]?.[1] && pMatches[1]?.[1]) {
      def.mainMessage = pMatches[0][1].replace(/<\/?strong>/gi, '').trim()
      def.secondMessage = pMatches[1][1].replace(/<\/?strong>/gi, '').trim()
    } else if (pMatches.length === 1 && pMatches[0]?.[1]) {
      def.mainMessage = pMatches[0][1].replace(/<\/?strong>/gi, '').trim()
      def.secondMessage = ''
    }
  } catch (err) {
    console.warn('Error parsing html to friendly form:', err)
  }

  return def
}

function generateHtmlFromFriendly(form: FriendlyForm, code: 'evaluation_request' | 'evaluation_reminder'): string {
  const isReminder = code === 'evaluation_reminder'
  const brandColor = isReminder ? '#d97706' : '#059669'
  const lightBg = isReminder ? '#fffbeb' : '#f8fafc'
  const borderColor = isReminder ? '#fde68a' : '#e2e8f0'
  const titleColor = isReminder ? '#92400e' : '#64748b'

  let formattedGreeting = form.greeting || ''
  if (!formattedGreeting.includes('<strong>')) {
    formattedGreeting = formattedGreeting
      .replace('{{evaluator_name}}', '<strong>{{evaluator_name}}</strong>')
      .replace('{{company_name}}', '<strong>{{company_name}}</strong>')
  }

  let formattedMain = form.mainMessage || ''
  if (!formattedMain.includes('<strong>')) {
    formattedMain = formattedMain
      .replace('{{student_name}}', '<strong>{{student_name}}</strong>')
      .replace('{{student_id}}', '<strong>{{student_id}}</strong>')
  }

  let formattedSecond = form.secondMessage || ''
  if (!formattedSecond.includes('<strong>')) {
    formattedSecond = formattedSecond.replace('{{deadline}}', '<strong>{{deadline}}</strong>')
  }

  let infoBoxHtml = ''
  if (form.showInfoBox) {
    const boxTitle = isReminder ? 'ข้อมูลแบบประเมินที่ค้างอยู่:' : 'ข้อมูลการเข้าทำแบบประเมิน:'
    infoBoxHtml = `
    <div style="background-color: ${lightBg}; border: 1px solid ${borderColor}; border-radius: 8px; padding: 16px; margin: 20px 0;">
      <p style="margin: 0 0 8px; font-size: 13px; color: ${titleColor}; font-weight: 600;">${boxTitle}</p>
      <p style="margin: 4px 0; font-size: 14px; color: #0f172a;"><strong>นักศึกษา:</strong> {{student_name}} ({{student_id}})</p>
      <p style="margin: 4px 0; font-size: 14px; color: #0f172a;"><strong>กำหนดส่งแบบประเมิน:</strong> <span style="color: ${brandColor}; font-weight: bold;">{{deadline}}</span></p>
      <p style="margin: 4px 0; font-size: 14px; color: #0f172a;"><strong>รหัส PIN สำหรับเข้าใช้งาน:</strong> <span style="font-family: monospace; font-weight: bold; color: ${brandColor};">{{pin}}</span></p>
    </div>`
  }

  return `<div style="font-family: 'Sarabun', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; padding: 24px; border: 1px solid #e2e8f0; border-radius: 12px; background-color: #ffffff;">
  <div style="text-align: center; margin-bottom: 24px;">
    <h2 style="color: #0f172a; margin: 0; font-size: 20px;">${form.headerTitle || 'มหาวิทยาลัยแม่ฟ้าหลวง'}</h2>
    <p style="color: ${isReminder ? '#d97706' : '#64748b'}; margin: 4px 0 0; font-size: 14px; font-weight: ${isReminder ? '600' : 'normal'};">${form.headerSubtitle}</p>
  </div>
  <div style="border-top: 2px solid ${brandColor}; padding-top: 20px;">
    <p style="font-size: 15px; color: #1e293b;">${formattedGreeting}</p>
    <p style="font-size: 14px; color: #334155; line-height: 1.6;">
      ${formattedMain}
    </p>
    ${formattedSecond ? `<p style="font-size: 14px; color: #334155; line-height: 1.6;">${formattedSecond}</p>` : ''}
    ${infoBoxHtml}
    <div style="text-align: center; margin: 28px 0;">
      <a href="{{invitation_url}}" style="background-color: ${brandColor}; color: #ffffff; text-decoration: none; padding: 12px 28px; border-radius: 8px; font-weight: bold; font-size: 15px; display: inline-block;">
        ${form.buttonText || 'เข้าสู่แบบประเมินออนไลน์'}
      </a>
    </div>
    <p style="font-size: 13px; color: #64748b; line-height: 1.5;">
      หากปุ่มด้านบนใช้งานไม่ได้ ท่านสามารถคัดลอกลิงก์ด้านล่างไปเปิดในเบราว์เซอร์:<br/>
      <a href="{{invitation_url}}" style="color: ${brandColor}; word-break: break-all;">{{invitation_url}}</a>
    </p>
  </div>
  <div style="margin-top: 32px; border-top: 1px solid #f1f5f9; padding-top: 16px; text-align: center; color: #94a3b8; font-size: 12px;">
    ${form.footerNote ? `${form.footerNote}<br/>` : ''}
    ${form.footerOrg || 'มหาวิทยาลัยแม่ฟ้าหลวง'}
  </div>
</div>`
}

function generateTextFromFriendly(form: FriendlyForm): string {
  const lines: string[] = []
  if (form.greeting) lines.push(form.greeting.replace(/<[^>]+>/g, ''))
  lines.push('')
  if (form.mainMessage) lines.push(form.mainMessage.replace(/<[^>]+>/g, ''))
  if (form.secondMessage) {
    lines.push('')
    lines.push(form.secondMessage.replace(/<[^>]+>/g, ''))
  }
  lines.push('')
  if (form.showInfoBox) {
    lines.push('ลิงก์สำหรับเข้าดำเนินการ: {{invitation_url}}')
    lines.push('รหัส PIN: {{pin}}')
    lines.push('กำหนดส่ง: {{deadline}}')
    lines.push('')
  } else {
    lines.push('ลิงก์: {{invitation_url}}')
    lines.push('')
  }
  if (form.footerNote) lines.push(form.footerNote)
  if (form.footerOrg) lines.push(form.footerOrg)
  return lines.join('\n')
}

async function loadTemplates(): Promise<void> {
  loading.value = true
  try {
    const res = await api<SystemTemplateItem[]>('/email-templates/system')
    if (Array.isArray(res)) {
      for (const item of res) {
        if (item.code === 'evaluation_request' || item.code === 'evaluation_reminder') {
          templates.value[item.code] = item
          const parsed = parseHtmlToFriendly(item.html, item.code)
          parsed.subject = item.subject
          friendlyForms.value[item.code] = parsed
          rawDrafts.value[item.code] = {
            html: item.html,
            text: item.text
          }
        }
      }
    }
  } catch (err: unknown) {
    console.error('Failed to load email templates:', err)
    toast.add({
      title: 'โหลดแม่แบบอีเมลไม่สำเร็จ',
      description: 'เกิดข้อผิดพลาดในการโหลดข้อมูลจากเซิร์ฟเวอร์',
      color: 'error'
    })
  } finally {
    loading.value = false
  }
}

onMounted(() => {
  void loadTemplates()
})

// Insert variable tag into active friendly field
function insertTagToMessage(tag: string): void {
  const form = friendlyForms.value[activeTab.value]
  form.mainMessage += ` ${tag} `
  toast.add({
    title: 'แทรกตัวแปรแล้ว',
    description: `เพิ่ม ${tag} ลงในเนื้อหาข้อความแล้ว`,
    color: 'success',
    icon: 'i-lucide-check'
  })
}

function insertTagToSubject(tag: string): void {
  const form = friendlyForms.value[activeTab.value]
  form.subject += ` ${tag}`
}

function copyTag(tag: string): void {
  if (import.meta.client) {
    navigator.clipboard.writeText(tag)
    toast.add({
      title: 'คัดลอกตัวแปรแล้ว',
      description: `คัดลอก ${tag} ไปยังคลิปบอร์ดแล้ว`,
      color: 'success',
      icon: 'i-lucide-check'
    })
  }
}

// Compute live preview
const previewSubject = computed(() => {
  const code = activeTab.value
  let sub = editorMode.value === 'html'
    ? currentTemplate.value.subject
    : friendlyForms.value[code].subject || ''

  for (const p of availablePlaceholders) {
    sub = sub.replaceAll(p.tag, p.example)
  }
  return sub
})

const previewHtml = computed(() => {
  const code = activeTab.value
  let body = ''
  if (editorMode.value === 'html') {
    body = rawDrafts.value[code].html || ''
  } else {
    body = generateHtmlFromFriendly(friendlyForms.value[code], code)
  }
  for (const p of availablePlaceholders) {
    body = body.replaceAll(p.tag, p.example)
  }
  return body
})

async function saveTemplate(): Promise<void> {
  saving.value = true
  try {
    const code = activeTab.value
    let subject = ''
    let html = ''
    let text = ''

    if (editorMode.value === 'html') {
      subject = friendlyForms.value[code].subject
      html = rawDrafts.value[code].html
      text = rawDrafts.value[code].text || subject
    } else {
      const form = friendlyForms.value[code]
      subject = form.subject
      html = generateHtmlFromFriendly(form, code)
      text = generateTextFromFriendly(form)
      rawDrafts.value[code].html = html
      rawDrafts.value[code].text = text
    }

    const updated = await api<SystemTemplateItem>(`/email-templates/system/${code}`, {
      method: 'PUT',
      body: {
        subject,
        html,
        text
      }
    })

    if (updated) {
      templates.value[code] = updated
      toast.add({
        title: 'บันทึกสำเร็จ',
        description: `อัปเดตแม่แบบ "${currentTemplate.value.name}" เรียบร้อยแล้ว`,
        color: 'success',
        icon: 'i-lucide-check'
      })
    }
  } catch (err: unknown) {
    console.error('Save failed:', err)
    toast.add({
      title: 'บันทึกไม่สำเร็จ',
      description: 'กรุณาตรวจสอบข้อมูลและลองใหม่อีกครั้ง',
      color: 'error'
    })
  } finally {
    saving.value = false
  }
}

async function resetTemplate(): Promise<void> {
  if (!confirm(`คุณต้องการคืนค่าเริ่มต้นของแม่แบบ "${currentTemplate.value.name}" หรือไม่?`)) {
    return
  }

  resetting.value = true
  try {
    const code = activeTab.value
    const reset = await api<SystemTemplateItem>(`/email-templates/system/${code}/reset`, {
      method: 'POST'
    })

    if (reset) {
      templates.value[code] = reset
      const parsed = parseHtmlToFriendly(reset.html, code)
      parsed.subject = reset.subject
      friendlyForms.value[code] = parsed
      rawDrafts.value[code] = {
        html: reset.html,
        text: reset.text
      }
      toast.add({
        title: 'คืนค่าเริ่มต้นสำเร็จ',
        description: `แม่แบบ "${reset.name}" ถูกคืนค่าเริ่มต้นเรียบร้อยแล้ว`,
        color: 'info',
        icon: 'i-lucide-rotate-ccw'
      })
    }
  } catch (err: unknown) {
    console.error('Reset failed:', err)
    toast.add({
      title: 'คืนค่าเริ่มต้นไม่สำเร็จ',
      color: 'error'
    })
  } finally {
    resetting.value = false
  }
}

// When switching to HTML mode, sync friendly to rawDrafts
watch(editorMode, (newMode) => {
  if (newMode === 'html') {
    const code = activeTab.value
    rawDrafts.value[code].html = generateHtmlFromFriendly(friendlyForms.value[code], code)
    rawDrafts.value[code].text = generateTextFromFriendly(friendlyForms.value[code])
  } else if (newMode === 'friendly') {
    const code = activeTab.value
    if (rawDrafts.value[code].html) {
      const parsed = parseHtmlToFriendly(rawDrafts.value[code].html, code)
      parsed.subject = friendlyForms.value[code].subject
      friendlyForms.value[code] = parsed
    }
  }
})
</script>

<template>
  <div class="space-y-6">
    <!-- Header -->
    <header class="flex flex-wrap items-end justify-between gap-4">
      <div>
        <p class="mfu-eyebrow">ระบบตั้งค่าและแม่แบบอีเมล (Email Templates)</p>
        <h1 class="mt-2 text-3xl font-bold text-highlighted">ตั้งค่าอีเมล</h1>
        <p class="mt-1 text-sm text-muted">
          แก้ไขข้อความอีเมลสำหรับส่งให้สถานประกอบการและผู้ประเมิน สามารถแก้ไขข้อความภาษาไทยได้ง่าย โดยไม่ต้องมีความรู้เรื่องโค้ด
        </p>
      </div>

      <div class="flex items-center gap-2">
        <UButton
          color="neutral"
          icon="i-lucide-mail"
          label="ประวัติการส่งอีเมล"
          to="/app/correspondence"
          variant="outline"
        />
      </div>
    </header>

    <!-- Main Card -->
    <div class="rounded-xl border border-default bg-default shadow-sm overflow-hidden">
      <!-- 2 Required Email Tabs -->
      <div class="flex border-b border-default bg-muted/20 px-4 pt-3 gap-2 overflow-x-auto">
        <button
          type="button"
          :class="[
            'inline-flex items-center gap-2.5 px-4 py-3 rounded-t-lg text-sm font-bold border-b-2 transition-all cursor-pointer whitespace-nowrap',
            activeTab === 'evaluation_request'
              ? 'border-emerald-600 text-emerald-700 dark:text-emerald-400 bg-default shadow-xs'
              : 'border-transparent text-muted hover:text-highlighted hover:bg-muted/40'
          ]"
          @click="activeTab = 'evaluation_request'"
        >
          <div class="size-6 rounded-full bg-emerald-500/10 flex items-center justify-center text-emerald-600 font-bold text-xs">
            1
          </div>
          <span>ขอความอนุเคราะห์ประเมินผล</span>
          <span class="rounded-full bg-emerald-500/10 text-emerald-600 text-[11px] px-2 py-0.5 font-medium">
            ส่งครั้งแรก
          </span>
        </button>

        <button
          type="button"
          :class="[
            'inline-flex items-center gap-2.5 px-4 py-3 rounded-t-lg text-sm font-bold border-b-2 transition-all cursor-pointer whitespace-nowrap',
            activeTab === 'evaluation_reminder'
              ? 'border-amber-600 text-amber-700 dark:text-amber-400 bg-default shadow-xs'
              : 'border-transparent text-muted hover:text-highlighted hover:bg-muted/40'
          ]"
          @click="activeTab = 'evaluation_reminder'"
        >
          <div class="size-6 rounded-full bg-amber-500/10 flex items-center justify-center text-amber-600 font-bold text-xs">
            2
          </div>
          <span>แจ้งเตือนการประเมิน</span>
          <span class="rounded-full bg-amber-500/10 text-amber-600 text-[11px] px-2 py-0.5 font-medium">
            เตือนซ้ำ
          </span>
        </button>
      </div>

      <!-- Loading State -->
      <div v-if="loading" class="p-16 text-center text-muted text-sm space-y-3">
        <UIcon name="i-lucide-loader-2" class="size-8 animate-spin mx-auto text-primary" />
        <p class="font-medium">กำลังโหลดข้อมูลแม่แบบอีเมล...</p>
      </div>

      <!-- Tab Content Area -->
      <div v-else class="p-6 space-y-6">
        <!-- Friendly Usage Banner -->
        <div
          v-if="activeTab === 'evaluation_request'"
          class="rounded-xl border border-emerald-500/30 bg-emerald-50/50 dark:bg-emerald-950/20 p-4 flex items-start gap-3.5"
        >
          <div class="size-9 rounded-lg bg-emerald-500/10 flex items-center justify-center shrink-0 mt-0.5">
            <UIcon name="i-lucide-send" class="size-5 text-emerald-600" />
          </div>
          <div class="text-xs space-y-1">
            <p class="font-bold text-sm text-emerald-950 dark:text-emerald-200">
              อีเมลประเภทที่ 1: ขอความอนุเคราะห์ประเมินผลการฝึกงาน (สำหรับส่งให้สถานประกอบการเริ่มแรก)
            </p>
            <p class="text-emerald-800 dark:text-emerald-300/80 leading-relaxed text-xs">
              ระบบจะใช้อีเมลนี้ส่งไปยังผู้ประสานงานหรือสถานประกอบการ เพื่อแจ้งว่านักศึกษาได้เข้าฝึกงาน และขอความอนุเคราะห์เข้าไปกรอกข้อมูลผู้ประเมินหรือทำแบบประเมิน
            </p>
          </div>
        </div>

        <div
          v-else
          class="rounded-xl border border-amber-500/30 bg-amber-50/50 dark:bg-amber-950/20 p-4 flex items-start gap-3.5"
        >
          <div class="size-9 rounded-lg bg-amber-500/10 flex items-center justify-center shrink-0 mt-0.5">
            <UIcon name="i-lucide-bell-ring" class="size-5 text-amber-600" />
          </div>
          <div class="text-xs space-y-1">
            <p class="font-bold text-sm text-amber-950 dark:text-amber-200">
              อีเมลประเภทที่ 2: แจ้งเตือนการประเมิน (สำหรับส่งเตือนผู้ประเมินที่ยังไม่ได้กรอก)
            </p>
            <p class="text-amber-800 dark:text-amber-300/80 leading-relaxed text-xs">
              ระบบจะใช้อีเมลนี้ส่งแจ้งเตือนผู้ประเมินที่ยังกรอกแบบประเมินไม่เสร็จสิ้น เพื่อเตือนให้เข้ามากรอกผลการประเมินให้เสร็จก่อนถึงกำหนดส่ง
            </p>
          </div>
        </div>

        <!-- Mode Selector Bar -->
        <div class="flex flex-wrap items-center justify-between gap-3 border-b border-default pb-4">
          <div class="inline-flex p-1 rounded-xl border border-default bg-muted/30">
            <button
              type="button"
              :class="[
                'flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold rounded-lg transition-all cursor-pointer',
                editorMode === 'friendly'
                  ? 'bg-default text-primary shadow-xs'
                  : 'text-muted hover:text-highlighted'
              ]"
              @click="editorMode = 'friendly'"
            >
              <UIcon name="i-lucide-sparkles" class="size-4 text-primary" />
              <span>โหมดใช้งานง่าย (แนะนำ)</span>
            </button>

            <button
              type="button"
              :class="[
                'flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold rounded-lg transition-all cursor-pointer',
                editorMode === 'preview'
                  ? 'bg-default text-primary shadow-xs'
                  : 'text-muted hover:text-highlighted'
              ]"
              @click="editorMode = 'preview'"
            >
              <UIcon name="i-lucide-eye" class="size-4" />
              <span>ดูตัวอย่างจดหมายจริง (Live Preview)</span>
            </button>

            <button
              type="button"
              :class="[
                'flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold rounded-lg transition-all cursor-pointer',
                editorMode === 'html'
                  ? 'bg-default text-primary shadow-xs'
                  : 'text-muted hover:text-highlighted'
              ]"
              @click="editorMode = 'html'"
            >
              <UIcon name="i-lucide-code" class="size-4" />
              <span>โหมดโค้ด HTML (ขั้นสูง)</span>
            </button>
          </div>

          <div class="text-xs text-muted">
            <span>เวอร์ชันปัจจุบัน: <strong>{{ currentTemplate.versionNumber || 1 }}</strong></span>
          </div>
        </div>

        <!-- Quick Tag helper palette -->
        <div class="rounded-xl border border-default bg-muted/20 p-4 space-y-2">
          <div class="flex items-center justify-between">
            <span class="text-xs font-bold text-highlighted flex items-center gap-1.5">
              <UIcon name="i-lucide-tags" class="size-4 text-primary" />
              คลิกเพื่อดึงข้อมูลอัตโนมัติมาใส่ในข้อความ:
            </span>
            <span class="text-[11px] text-muted">กดปุ่มเพื่อแทรกข้อมูลลงในเนื้อหาทันที</span>
          </div>

          <div class="flex flex-wrap gap-2">
            <button
              v-for="p in availablePlaceholders"
              :key="p.tag"
              type="button"
              class="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border border-default bg-default hover:border-primary hover:text-primary hover:shadow-xs transition-all cursor-pointer"
              :title="`คลิกเพื่อแทรก ${p.label} (${p.tag})`"
              @click="insertTagToMessage(p.tag)"
            >
              <UIcon :name="p.icon" class="size-3.5 text-primary" />
              <span>+ {{ p.label }}</span>
              <span class="text-[10px] text-muted font-mono">{{ p.tag }}</span>
            </button>
          </div>
        </div>

        <!-- VIEW 1: EASY FRIENDLY FORM WITH LIVE PREVIEW SIDE-BY-SIDE -->
        <div v-show="editorMode === 'friendly'" class="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          <!-- Left: User Friendly Form (7 cols on lg) -->
          <div class="lg:col-span-7 space-y-5">
            <!-- 1. Subject -->
            <div class="rounded-xl border border-default bg-default p-4 space-y-2">
              <div class="flex items-center justify-between">
                <label class="text-xs font-bold text-highlighted flex items-center gap-1.5">
                  <UIcon name="i-lucide-mail" class="size-4 text-primary" />
                  หัวข้ออีเมล (Subject)
                </label>
                <button
                  type="button"
                  class="text-[11px] text-primary hover:underline flex items-center gap-1"
                  @click="insertTagToSubject('({{student_name}})')"
                >
                  <UIcon name="i-lucide-plus" class="size-3" />
                  ใส่ชื่อนักศึกษาในหัวข้อ
                </button>
              </div>
              <input
                v-model="currentFriendly.subject"
                type="text"
                class="w-full rounded-lg border border-default bg-muted/10 px-3.5 py-2.5 text-xs text-highlighted focus:outline-none focus:ring-2 focus:ring-primary font-medium"
                placeholder="เช่น [มหาวิทยาลัยแม่ฟ้าหลวง] ขอความอนุเคราะห์ประเมินผลการฝึกงานของนักศึกษา ({{student_name}})"
              />
              <p class="text-[11px] text-muted">
                หัวข้อที่ผู้รับจะเห็นในกล่องจดหมาย สามารถใส่ชื่อนักศึกษาหรือชื่อมหาวิทยาลัยได้
              </p>
            </div>

            <!-- 2. Salutation / Greeting -->
            <div class="rounded-xl border border-default bg-default p-4 space-y-2">
              <label class="text-xs font-bold text-highlighted flex items-center gap-1.5">
                <UIcon name="i-lucide-user-check" class="size-4 text-primary" />
                คำขึ้นต้นจดหมาย (ถึงผู้ประเมิน / สถานประกอบการ)
              </label>
              <input
                v-model="currentFriendly.greeting"
                type="text"
                class="w-full rounded-lg border border-default bg-muted/10 px-3.5 py-2 text-xs text-highlighted focus:outline-none focus:ring-2 focus:ring-primary font-medium"
                placeholder="เรียน {{evaluator_name}} (สถานประกอบการ: {{company_name}}),"
              />
            </div>

            <!-- 3. Main Message Body -->
            <div class="rounded-xl border border-default bg-default p-4 space-y-2">
              <div class="flex items-center justify-between">
                <label class="text-xs font-bold text-highlighted flex items-center gap-1.5">
                  <UIcon name="i-lucide-message-square-text" class="size-4 text-primary" />
                  เนื้อหาข้อความหลัก (ข้อความภาษาไทยทั่วไป)
                </label>
                <span class="text-[11px] text-emerald-600 font-medium">พิมพ์ข้อความได้เลย ไม่ต้องใส่โค้ด</span>
              </div>
              <textarea
                v-model="currentFriendly.mainMessage"
                rows="5"
                class="w-full rounded-lg border border-default bg-muted/10 p-3 text-xs text-highlighted focus:outline-none focus:ring-2 focus:ring-primary leading-relaxed"
                placeholder="พิมพ์ข้อความที่ต้องการแจ้งไปยังสถานประกอบการ..."
              ></textarea>
              <p class="text-[11px] text-muted">
                สามารถคลิกปุ่มตัวแปรด้านบนเพื่อดึงชื่อนักศึกษา รหัสนักศึกษา หรือสถานประกอบการมาใส่ได้อัตโนมัติ
              </p>
            </div>

            <!-- 4. Additional Message (Paragraph 2) -->
            <div class="rounded-xl border border-default bg-default p-4 space-y-2">
              <label class="text-xs font-bold text-highlighted flex items-center gap-1.5">
                <UIcon name="i-lucide-align-left" class="size-4 text-primary" />
                ข้อความย่อหน้าที่ 2 (ข้อความเพิ่มเติมหรือแจ้งกำหนดส่ง)
              </label>
              <textarea
                v-model="currentFriendly.secondMessage"
                rows="3"
                class="w-full rounded-lg border border-default bg-muted/10 p-3 text-xs text-highlighted focus:outline-none focus:ring-2 focus:ring-primary leading-relaxed"
                placeholder="ข้อความเพิ่มเติม เช่น กำหนดการส่งผลประเมิน หรือคำขอบคุณ..."
              ></textarea>
            </div>

            <!-- 5. Summary Info Box Toggle -->
            <div class="rounded-xl border border-default bg-default p-4 flex items-center justify-between gap-4">
              <div class="space-y-0.5">
                <p class="text-xs font-bold text-highlighted flex items-center gap-1.5">
                  <UIcon name="i-lucide-clipboard-list" class="size-4 text-primary" />
                  แสดงกล่องข้อมูลสรุปในอีเมล (ชื่อนักศึกษา, กำหนดส่ง, รหัส PIN)
                </p>
                <p class="text-[11px] text-muted">
                  กล่องสี่เหลี่ยมเด่นชัดที่จะแสดงข้อมูลสำคัญและรหัส PIN สำหรับเข้าทำแบบประเมิน
                </p>
              </div>
              <input
                v-model="currentFriendly.showInfoBox"
                type="checkbox"
                class="size-4 text-primary rounded border-default focus:ring-primary cursor-pointer"
              />
            </div>

            <!-- 6. Button & Footer -->
            <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div class="rounded-xl border border-default bg-default p-4 space-y-2">
                <label class="text-xs font-bold text-highlighted flex items-center gap-1.5">
                  <UIcon name="i-lucide-mouse-pointer-click" class="size-4 text-primary" />
                  ข้อความบนปุ่มกด
                </label>
                <input
                  v-model="currentFriendly.buttonText"
                  type="text"
                  class="w-full rounded-lg border border-default bg-muted/10 px-3 py-2 text-xs text-highlighted focus:outline-none focus:ring-2 focus:ring-primary"
                  placeholder="เช่น เข้าสู่แบบประเมินออนไลน์"
                />
              </div>

              <div class="rounded-xl border border-default bg-default p-4 space-y-2">
                <label class="text-xs font-bold text-highlighted flex items-center gap-1.5">
                  <UIcon name="i-lucide-building" class="size-4 text-primary" />
                  ชื่อหน่วยงานส่วนท้าย
                </label>
                <input
                  v-model="currentFriendly.footerOrg"
                  type="text"
                  class="w-full rounded-lg border border-default bg-muted/10 px-3 py-2 text-xs text-highlighted focus:outline-none focus:ring-2 focus:ring-primary"
                  placeholder="เช่น ศูนย์บริการฝึกงานและสหกิจศึกษา มหาวิทยาลัยแม่ฟ้าหลวง"
                />
              </div>
            </div>
          </div>

          <!-- Right: Live Inbox Preview (5 cols on lg) -->
          <div class="lg:col-span-5 sticky top-6 space-y-3">
            <div class="flex items-center justify-between">
              <span class="text-xs font-bold text-highlighted flex items-center gap-1.5">
                <UIcon name="i-lucide-monitor" class="size-4 text-primary" />
                ตัวอย่างอีเมลที่ผู้รับจะเห็นจริง (Live Preview)
              </span>
              <span class="text-[11px] rounded-full bg-emerald-500/10 text-emerald-600 px-2 py-0.5 font-semibold">
                อัปเดตอัตโนมัติ
              </span>
            </div>

            <div class="rounded-xl border border-default bg-default shadow-md overflow-hidden">
              <!-- Window Header -->
              <div class="bg-muted/40 border-b border-default p-3.5 space-y-1.5 text-xs">
                <div class="flex items-start gap-2">
                  <span class="text-muted w-12 shrink-0 font-medium">เรื่อง:</span>
                  <span class="font-bold text-highlighted leading-snug">{{ previewSubject }}</span>
                </div>
                <div class="flex items-center gap-2 text-muted text-[11px]">
                  <span class="w-12 shrink-0">จาก:</span>
                  <span>มหาวิทยาลัยแม่ฟ้าหลวง &lt;internship@mfu.ac.th&gt;</span>
                </div>
                <div class="flex items-center gap-2 text-muted text-[11px]">
                  <span class="w-12 shrink-0">ถึง:</span>
                  <span class="text-highlighted font-medium">คุณสมชาย ใจดี (สถานประกอบการ)</span>
                </div>
              </div>

              <!-- Rendered HTML Content -->
              <div class="p-4 bg-white dark:bg-neutral-900 overflow-y-auto max-h-[600px]">
                <div v-html="previewHtml"></div>
              </div>
            </div>
          </div>
        </div>

        <!-- VIEW 2: FULL PREVIEW MODE (FOR EXPANDED VIEW) -->
        <div v-show="editorMode === 'preview'" class="space-y-4">
          <div class="rounded-xl border border-default bg-default shadow-sm overflow-hidden max-w-3xl mx-auto">
            <div class="bg-muted/30 border-b border-default p-4 space-y-2 text-xs">
              <div class="flex items-center gap-2">
                <span class="text-muted w-14 shrink-0 font-medium">เรื่อง:</span>
                <span class="font-bold text-highlighted text-sm">{{ previewSubject }}</span>
              </div>
              <div class="flex items-center gap-2 text-muted">
                <span class="w-14 shrink-0">จาก:</span>
                <span class="font-medium">มหาวิทยาลัยแม่ฟ้าหลวง &lt;internship@mfu.ac.th&gt;</span>
              </div>
              <div class="flex items-center gap-2 text-muted">
                <span class="w-14 shrink-0">ถึง:</span>
                <span class="font-medium text-highlighted">คุณสมชาย ใจดี &lt;evaluator.cos@milott.com&gt;</span>
              </div>
            </div>

            <div class="p-8 bg-white dark:bg-neutral-900 overflow-x-auto min-h-[400px]">
              <div v-html="previewHtml"></div>
            </div>
          </div>
        </div>

        <!-- VIEW 3: ADVANCED HTML CODE MODE -->
        <div v-show="editorMode === 'html'" class="space-y-4">
          <div class="rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 flex items-center gap-2 text-xs text-amber-800 dark:text-amber-300">
            <UIcon name="i-lucide-info" class="size-4 shrink-0 text-amber-600" />
            <span>โหมดนี้สำหรับนักพัฒนาหรือผู้ดูแลระบบที่ต้องการปรับแต่ง HTML Tag และ CSS โดยตรง</span>
          </div>

          <div class="space-y-1.5">
            <label class="text-xs font-semibold text-highlighted">หัวข้ออีเมล (Subject):</label>
            <input
              v-model="currentFriendly.subject"
              type="text"
              class="w-full rounded-lg border border-default bg-default px-3 py-2 text-xs font-medium text-highlighted focus:outline-none focus:ring-1 focus:ring-primary"
            />
          </div>

          <div class="space-y-1.5">
            <label class="text-xs font-semibold text-highlighted">เนื้อหา HTML (HTML Body):</label>
            <textarea
              v-model="currentRaw.html"
              rows="16"
              class="w-full rounded-lg border border-default bg-default p-3 text-xs text-highlighted font-mono focus:outline-none focus:ring-1 focus:ring-primary leading-relaxed"
            ></textarea>
          </div>

          <details class="text-xs text-muted rounded-lg border border-default p-3">
            <summary class="cursor-pointer font-semibold text-highlighted flex items-center gap-1.5">
              <UIcon name="i-lucide-align-left" class="size-3.5" />
              ข้อความสำรอง (Plain Text Fallback)
            </summary>
            <div class="pt-2">
              <textarea
                v-model="currentRaw.text"
                rows="5"
                class="w-full rounded-lg border border-default bg-default p-2 text-xs text-highlighted font-mono focus:outline-none focus:ring-1 focus:ring-primary"
              ></textarea>
            </div>
          </details>
        </div>

        <!-- Action Footer -->
        <div class="flex flex-wrap items-center justify-between gap-3 pt-5 border-t border-default">
          <UButton
            color="neutral"
            icon="i-lucide-rotate-ccw"
            label="คืนค่าข้อความเริ่มต้น (Reset Default)"
            size="sm"
            variant="ghost"
            :loading="resetting"
            @click="resetTemplate"
          />

          <div class="flex items-center gap-3">
            <UButton
              color="primary"
              icon="i-lucide-save"
              label="บันทึกการเปลี่ยนแปลง"
              size="md"
              :loading="saving"
              @click="saveTemplate"
            />
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
