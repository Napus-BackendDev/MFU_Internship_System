<script setup lang="ts">
import { createSandboxedEmailPreviewDocument } from '~/utils/email-preview'

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

interface EmailDesignOptions {
  themeColor: string
  headerStyle: 'top_border' | 'banner' | 'minimal'
  borderRadius: '0px' | '8px' | '12px' | '16px'
  textSize: 'small' | 'medium' | 'large'
  buttonShape: 'rounded' | 'pill' | 'square'
  buttonSize: 'normal' | 'large'
  buttonStyle: 'solid' | 'outline'
  boxStyle: 'pastel' | 'left_bar' | 'dotted'
  cardBg: '#ffffff' | '#fdfbf7' | '#f8fafc'
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
  design: EmailDesignOptions
}

const api = useApi()
const toast = useToast()

const activeTab = ref<'evaluation_request' | 'evaluation_reminder'>(
  'evaluation_request'
)
// Mode: 'friendly' (Easy form), 'preview' (Full preview), 'html' (Advanced code)
const editorMode = ref<'friendly' | 'preview' | 'html'>('friendly')
// Sub-tab inside friendly mode: 'content' | 'design'
const activeSubTab = ref<'content' | 'design'>('content')

const loading = ref(true)
const saving = ref(false)
const resetting = ref(false)

const templates = ref<
  Record<'evaluation_request' | 'evaluation_reminder', SystemTemplateItem>
>({
  evaluation_request: {
    id: '',
    code: 'evaluation_request',
    name: 'ขอความอนุเคราะห์ประเมินผลการฝึกงาน / กรอกข้อมูลผู้ประเมิน',
    description:
      'ส่งไปยังสถานประกอบการหรือผู้ประสานงาน เพื่อขอความอนุเคราะห์กรอกข้อมูลผู้ประเมินหรือเริ่มการประเมินนักศึกษา',
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
    description:
      'ส่งไปยังผู้ประเมินเพื่อแจ้งเตือนว่ายังไม่ได้กรอกแบบประเมิน หรือแบบประเมินยังไม่เสร็จสมบูรณ์',
    subject: '',
    html: '',
    text: '',
    placeholders: [],
    versionId: '',
    versionNumber: 1,
    updatedAt: ''
  }
})

// Palette presets
const themePresets = [
  {
    name: 'เขียว มฟล.',
    color: '#059669',
    bgName: 'bg-emerald-600',
    desc: 'ทางการ น่าเชื่อถือ (เอกสารทางการ)'
  },
  {
    name: 'กรมท่าวิชาการ',
    color: '#1d4ed8',
    bgName: 'bg-blue-700',
    desc: 'สุขุม สุภาพ ภูมิฐาน'
  },
  {
    name: 'ส้ม-ทอง เตือนด่วน',
    color: '#d97706',
    bgName: 'bg-amber-600',
    desc: 'กระตุ้นความสนใจ แจ้งเตือนด่วน'
  },
  {
    name: 'ม่วงสง่างาม',
    color: '#7c3aed',
    bgName: 'bg-purple-600',
    desc: 'โดดเด่น สวยงาม ทันสมัย'
  },
  {
    name: 'แดงสุภาพ',
    color: '#be123c',
    bgName: 'bg-rose-700',
    desc: 'หนักแน่น ชัดเจน'
  },
  {
    name: 'เทาโมเดิร์น',
    color: '#334155',
    bgName: 'bg-slate-700',
    desc: 'มินิมอล เรียบง่าย'
  }
]

// Friendly form state for each template
const friendlyForms = ref<
  Record<'evaluation_request' | 'evaluation_reminder', FriendlyForm>
>({
  evaluation_request: {
    subject: '',
    headerTitle: 'มหาวิทยาลัยแม่ฟ้าหลวง',
    headerSubtitle: 'ระบบประเมินผลการฝึกงานและสหกิจศึกษา',
    greeting: 'เรียน {{evaluator_name}} (สถานประกอบการ: {{company_name}}),',
    mainMessage:
      'เนื่องด้วยนักศึกษา {{student_name}} (รหัสนักศึกษา: {{student_id}}) ได้เข้าปฏิบัติการฝึกงาน ณ สถานประกอบการของท่าน ทางมหาวิทยาลัยแม่ฟ้าหลวงใคร่ขอความอนุเคราะห์ท่านในการประเมินผลการปฏิบัติงานของนักศึกษา หรือมอบหมายผู้ประเมินเพื่อดำเนินการตามขั้นตอน',
    secondMessage: '',
    showInfoBox: true,
    buttonText: 'เข้าสู่แบบประเมินออนไลน์',
    footerNote:
      'หากท่านดำเนินการเรียบร้อยแล้ว หรือมีข้อสงสัยประการใด สามารถติดต่อสอบถามศูนย์บริการฝึกงานฯ',
    footerOrg: 'ศูนย์บริการฝึกงานและสหกิจศึกษา มหาวิทยาลัยแม่ฟ้าหลวง',
    design: {
      themeColor: '#059669',
      headerStyle: 'top_border',
      borderRadius: '12px',
      textSize: 'medium',
      buttonShape: 'rounded',
      buttonSize: 'normal',
      buttonStyle: 'solid',
      boxStyle: 'pastel',
      cardBg: '#ffffff'
    }
  },
  evaluation_reminder: {
    subject: '',
    headerTitle: 'มหาวิทยาลัยแม่ฟ้าหลวง',
    headerSubtitle: 'แจ้งเตือน: แบบประเมินผลการฝึกงานรอการดำเนินการ',
    greeting: 'เรียน {{evaluator_name}} (สถานประกอบการ: {{company_name}}),',
    mainMessage:
      'ตามที่ทางมหาวิทยาลัยแม่ฟ้าหลวงได้ส่งแบบประเมินผลการฝึกงานของนักศึกษา {{student_name}} (รหัสนักศึกษา: {{student_id}}) ไปยังท่านแล้วนั้น ปัจจุบันระบบพบว่าแบบประเมินดังกล่าวยังไม่ได้ดำเนินการให้เสร็จสิ้นสมบูรณ์',
    secondMessage:
      'ทางมหาวิทยาลัยจึงขอความกรุณาท่านช่วยสละเวลาเข้ามาบันทึกผลการประเมินให้แก่นักศึกษา ก่อนครบกำหนดส่งในวันที่ {{deadline}} เพื่อให้นักศึกษาสามารถนำผลไปประกอบการสำเร็จการศึกษาตามกำหนดการ',
    showInfoBox: true,
    buttonText: 'คลิกที่นี่เพื่อดำเนินการต่อ',
    footerNote: 'หากท่านดำเนินการเรียบร้อยแล้ว ขออภัยในอีเมลแจ้งเตือนฉบับนี้',
    footerOrg: 'ศูนย์บริการฝึกงานและสหกิจศึกษา มหาวิทยาลัยแม่ฟ้าหลวง',
    design: {
      themeColor: '#d97706',
      headerStyle: 'top_border',
      borderRadius: '12px',
      textSize: 'medium',
      buttonShape: 'rounded',
      buttonSize: 'normal',
      buttonStyle: 'solid',
      boxStyle: 'pastel',
      cardBg: '#ffffff'
    }
  }
})

// Raw drafts for HTML mode
const rawDrafts = ref<
  Record<
    'evaluation_request' | 'evaluation_reminder',
    { html: string; text: string }
  >
>({
  evaluation_request: { html: '', text: '' },
  evaluation_reminder: { html: '', text: '' }
})

const currentTemplate = computed(() => templates.value[activeTab.value])
const currentFriendly = computed(() => friendlyForms.value[activeTab.value])
const currentRaw = computed(() => rawDrafts.value[activeTab.value])

const availablePlaceholders = [
  {
    tag: '{{student_name}}',
    label: 'ชื่อนักศึกษา',
    example: 'นายกิตติภูมิ พงษ์ศิริ',
    icon: 'i-lucide-user'
  },
  {
    tag: '{{student_id}}',
    label: 'รหัสนักศึกษา',
    example: '6531501001',
    icon: 'i-lucide-id-card'
  },
  {
    tag: '{{company_name}}',
    label: 'สถานประกอบการ',
    example: 'บริษัท โบวองค์ แบบบอนวาเทอร์ลี่ จำกัด',
    icon: 'i-lucide-building-2'
  },
  {
    tag: '{{evaluator_name}}',
    label: 'ชื่อผู้ประเมิน',
    example: 'คุณสมชาย ใจดี',
    icon: 'i-lucide-user-check'
  },
  {
    tag: '{{deadline}}',
    label: 'กำหนดส่ง',
    example: '12 พฤศจิกายน 2569',
    icon: 'i-lucide-calendar'
  },
  {
    tag: '{{pin}}',
    label: 'รหัส PIN',
    example: '[สร้างเมื่อส่งจริง]',
    icon: 'i-lucide-key'
  },
  {
    tag: '{{invitation_url}}',
    label: 'ลิงก์ทำแบบประเมิน',
    example: '[ลิงก์ลงนามสร้างเมื่อส่งจริง]',
    icon: 'i-lucide-link'
  }
]

function getPastelColors(color: string) {
  if (color === '#059669')
    return { bg: '#ecfdf5', border: '#a7f3d0', text: '#065f46' }
  if (color === '#1d4ed8')
    return { bg: '#eff6ff', border: '#bfdbfe', text: '#1e40af' }
  if (color === '#d97706')
    return { bg: '#fffbeb', border: '#fde68a', text: '#92400e' }
  if (color === '#7c3aed')
    return { bg: '#f5f3ff', border: '#ddd6fe', text: '#5b21b6' }
  if (color === '#be123c')
    return { bg: '#fff1f2', border: '#fecdd3', text: '#9f1239' }
  if (color === '#334155')
    return { bg: '#f8fafc', border: '#cbd5e1', text: '#1e293b' }
  return { bg: '#f8fafc', border: '#e2e8f0', text: color }
}

function parseHtmlToFriendly(
  html: string,
  code: 'evaluation_request' | 'evaluation_reminder'
): FriendlyForm {
  const isReminder = code === 'evaluation_reminder'
  const defaultTheme = isReminder ? '#d97706' : '#059669'

  const def: FriendlyForm = {
    subject: '',
    headerTitle: 'มหาวิทยาลัยแม่ฟ้าหลวง',
    headerSubtitle: isReminder
      ? 'แจ้งเตือน: แบบประเมินผลการฝึกงานรอการดำเนินการ'
      : 'ระบบประเมินผลการฝึกงานและสหกิจศึกษา',
    greeting: 'เรียน {{evaluator_name}} (สถานประกอบการ: {{company_name}}),',
    mainMessage: isReminder
      ? 'ตามที่ทางมหาวิทยาลัยแม่ฟ้าหลวงได้ส่งแบบประเมินผลการฝึกงานของนักศึกษา {{student_name}} (รหัสนักศึกษา: {{student_id}}) ไปยังท่านแล้วนั้น ปัจจุบันระบบพบว่าแบบประเมินดังกล่าวยังไม่ได้ดำเนินการให้เสร็จสิ้นสมบูรณ์'
      : 'เนื่องด้วยนักศึกษา {{student_name}} (รหัสนักศึกษา: {{student_id}}) ได้เข้าปฏิบัติการฝึกงาน ณ สถานประกอบการของท่าน ทางมหาวิทยาลัยแม่ฟ้าหลวงใคร่ขอความอนุเคราะห์ท่านในการประเมินผลการปฏิบัติงานของนักศึกษา หรือมอบหมายผู้ประเมินเพื่อดำเนินการตามขั้นตอน',
    secondMessage: isReminder
      ? 'ทางมหาวิทยาลัยจึงขอความกรุณาท่านช่วยสละเวลาเข้ามาบันทึกผลการประเมินให้แก่นักศึกษา ก่อนครบกำหนดส่งในวันที่ {{deadline}} เพื่อให้นักศึกษาสามารถนำผลไปประกอบการสำเร็จการศึกษาตามกำหนดการ'
      : '',
    showInfoBox: true,
    buttonText: isReminder
      ? 'คลิกที่นี่เพื่อดำเนินการต่อ'
      : 'เข้าสู่แบบประเมินออนไลน์',
    footerNote: isReminder
      ? 'หากท่านดำเนินการเรียบร้อยแล้ว ขออภัยในอีเมลแจ้งเตือนฉบับนี้'
      : 'หากท่านดำเนินการเรียบร้อยแล้ว หรือมีข้อสงสัยประการใด สามารถติดต่อศูนย์บริการฝึกงานฯ',
    footerOrg: 'ศูนย์บริการฝึกงานและสหกิจศึกษา มหาวิทยาลัยแม่ฟ้าหลวง',
    design: {
      themeColor: defaultTheme,
      headerStyle: 'top_border',
      borderRadius: '12px',
      textSize: 'medium',
      buttonShape: 'rounded',
      buttonSize: 'normal',
      buttonStyle: 'solid',
      boxStyle: 'pastel',
      cardBg: '#ffffff'
    }
  }

  if (!html || typeof html !== 'string') return def

  try {
    const h2Match = html.match(/<h2[^>]*>([\s\S]*?)<\/h2>/i)
    if (h2Match?.[1])
      def.headerTitle = h2Match[1].replace(/<[^>]+>/g, '').trim()

    const subtitleMatch = html.match(/<h2[\s\S]*?<p[^>]*>([\s\S]*?)<\/p>/i)
    if (subtitleMatch?.[1])
      def.headerSubtitle = subtitleMatch[1].replace(/<[^>]+>/g, '').trim()

    const greetingMatch = html.match(
      /<p style="[^"]*font-size:\s*15px[^"]*">([\s\S]*?)<\/p>/i
    )
    if (greetingMatch?.[1]) {
      def.greeting = greetingMatch[1].replace(/<\/?strong>/gi, '').trim()
    }

    const btnMatch = html.match(
      /<a href="{{invitation_url}}"[^>]*>([\s\S]*?)<\/a>/i
    )
    if (btnMatch?.[1]) {
      def.buttonText = btnMatch[1].replace(/<[^>]+>/g, '').trim()
    }

    const footerMatch = html.match(
      /<div style="[^"]*margin-top:\s*32px[^"]*">([\s\S]*?)<\/div>/i
    )
    if (footerMatch?.[1]) {
      const parts = footerMatch[1]
        .split(/<br\s*\/?>/i)
        .map((l) => l.replace(/<[^>]+>/g, '').trim())
        .filter(Boolean)
      if (parts.length > 1 && parts[0]) {
        def.footerNote = parts[0]
        def.footerOrg = parts.slice(1).join(' ')
      } else if (parts.length === 1 && parts[0]) {
        def.footerOrg = parts[0]
      }
    }

    def.showInfoBox =
      html.includes('{{pin}}') ||
      html.includes('ข้อมูลการเข้าทำแบบประเมิน') ||
      html.includes('ข้อมูลแบบประเมินที่ค้างอยู่')

    // Detect theme color from button or border
    const colorMatch = html.match(/background-color:\s*(#[0-9a-fA-F]{6})/i)
    if (colorMatch?.[1] && colorMatch[1] !== '#ffffff') {
      def.design.themeColor = colorMatch[1]
    }

    const pMatches = [
      ...html.matchAll(
        /<p style="[^"]*font-size:\s*1[346]px[^"]*">([\s\S]*?)<\/p>/gi
      )
    ]
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

function generateHtmlFromFriendly(form: FriendlyForm): string {
  const d = form.design
  const brandColor = d.themeColor || '#059669'
  const pastel = getPastelColors(brandColor)

  // Typography font size
  const fontSizeMap = { small: '13px', medium: '14px', large: '16px' }
  const lineHeightMap = { small: '1.5', medium: '1.6', large: '1.7' }
  const bodyFontSize = fontSizeMap[d.textSize] || '14px'
  const bodyLineHeight = lineHeightMap[d.textSize] || '1.6'

  // Card Border Radius
  const radius = d.borderRadius || '12px'

  // Button Shape & Size
  const btnRadiusMap = { rounded: '8px', pill: '9999px', square: '0px' }
  const btnRadius = btnRadiusMap[d.buttonShape] || '8px'
  const isLargeBtn = d.buttonSize === 'large'
  const btnPadding = isLargeBtn ? '14px 36px' : '11px 26px'
  const btnFontSize = isLargeBtn ? '16px' : '14px'

  let btnStyle = `background-color: ${brandColor}; color: #ffffff; text-decoration: none; padding: ${btnPadding}; border-radius: ${btnRadius}; font-weight: bold; font-size: ${btnFontSize}; display: inline-block;`
  if (d.buttonStyle === 'outline') {
    btnStyle = `background-color: transparent; border: 2px solid ${brandColor}; color: ${brandColor}; text-decoration: none; padding: ${btnPadding}; border-radius: ${btnRadius}; font-weight: bold; font-size: ${btnFontSize}; display: inline-block;`
  }

  // Header style
  let headerHtml = ''
  let contentTopBorder = ''
  if (d.headerStyle === 'banner') {
    headerHtml = `
  <div style="background-color: ${brandColor}; padding: 28px 20px; text-align: center; border-radius: ${radius} ${radius} 0 0;">
    <h2 style="color: #ffffff; margin: 0; font-size: 20px; font-weight: bold;">${form.headerTitle || 'มหาวิทยาลัยแม่ฟ้าหลวง'}</h2>
    <p style="color: rgba(255, 255, 255, 0.9); margin: 6px 0 0; font-size: 14px;">${form.headerSubtitle}</p>
  </div>`
  } else if (d.headerStyle === 'top_border') {
    headerHtml = `
  <div style="text-align: center; margin-bottom: 24px; padding-top: 4px;">
    <h2 style="color: #0f172a; margin: 0; font-size: 20px; font-weight: bold;">${form.headerTitle || 'มหาวิทยาลัยแม่ฟ้าหลวง'}</h2>
    <p style="color: ${brandColor}; margin: 4px 0 0; font-size: 14px; font-weight: 600;">${form.headerSubtitle}</p>
  </div>`
    contentTopBorder = `border-top: 3px solid ${brandColor}; padding-top: 20px;`
  } else {
    // minimal
    headerHtml = `
  <div style="text-align: center; margin-bottom: 20px;">
    <h2 style="color: #0f172a; margin: 0; font-size: 18px; font-weight: bold;">${form.headerTitle || 'มหาวิทยาลัยแม่ฟ้าหลวง'}</h2>
    <p style="color: #64748b; margin: 4px 0 0; font-size: 13px;">${form.headerSubtitle}</p>
  </div>`
    contentTopBorder = `border-top: 1px solid #e2e8f0; padding-top: 16px;`
  }

  // Box style
  let boxStyle = `background-color: ${pastel.bg}; border: 1px solid ${pastel.border}; border-radius: 8px; padding: 16px; margin: 20px 0;`
  if (d.boxStyle === 'left_bar') {
    boxStyle = `background-color: #f8fafc; border: 1px solid #e2e8f0; border-left: 5px solid ${brandColor}; border-radius: 6px; padding: 16px; margin: 20px 0;`
  } else if (d.boxStyle === 'dotted') {
    boxStyle = `background-color: #fafaf9; border: 2px dashed ${brandColor}; border-radius: 8px; padding: 16px; margin: 20px 0;`
  }

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
    formattedSecond = formattedSecond.replace(
      '{{deadline}}',
      '<strong>{{deadline}}</strong>'
    )
  }

  let infoBoxHtml = ''
  if (form.showInfoBox) {
    infoBoxHtml = `
    <div style="${boxStyle}">
      <p style="margin: 0 0 8px; font-size: 13px; color: ${pastel.text}; font-weight: bold;">ข้อมูลการประเมินและการเข้าใช้งาน:</p>
      <p style="margin: 4px 0; font-size: ${bodyFontSize}; color: #0f172a;"><strong>นักศึกษา:</strong> {{student_name}} ({{student_id}})</p>
      <p style="margin: 4px 0; font-size: ${bodyFontSize}; color: #0f172a;"><strong>กำหนดส่งแบบประเมิน:</strong> <span style="color: ${brandColor}; font-weight: bold;">{{deadline}}</span></p>
      <p style="margin: 4px 0; font-size: ${bodyFontSize}; color: #0f172a;"><strong>รหัส PIN สำหรับเข้าใช้งาน:</strong> <span style="font-family: monospace; font-weight: bold; color: ${brandColor}; font-size: 15px;">{{pin}}</span></p>
    </div>`
  }

  const containerPadding = d.headerStyle === 'banner' ? '0' : '24px'
  const innerPadding = d.headerStyle === 'banner' ? '24px' : '0'

  return `<div style="font-family: 'Sarabun', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; padding: ${containerPadding}; border: 1px solid #e2e8f0; border-radius: ${radius}; background-color: ${d.cardBg || '#ffffff'}; overflow: hidden; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05);">
  ${headerHtml}
  <div style="padding: ${innerPadding};">
    <div style="${contentTopBorder}">
      <p style="font-size: 15px; color: #1e293b; margin-top: 0;">${formattedGreeting}</p>
      <p style="font-size: ${bodyFontSize}; color: #334155; line-height: ${bodyLineHeight};">
        ${formattedMain}
      </p>
      ${formattedSecond ? `<p style="font-size: ${bodyFontSize}; color: #334155; line-height: ${bodyLineHeight};">${formattedSecond}</p>` : ''}
      ${infoBoxHtml}
      <div style="text-align: center; margin: 28px 0;">
        <a href="{{invitation_url}}" style="${btnStyle}">
          ${form.buttonText || 'เข้าสู่แบบประเมินออนไลน์'}
        </a>
      </div>
      <p style="font-size: 12px; color: #64748b; line-height: 1.5; margin-bottom: 0;">
        หากปุ่มด้านบนใช้งานไม่ได้ ท่านสามารถคัดลอกลิงก์ด้านล่างไปเปิดในเบราว์เซอร์:<br/>
        <a href="{{invitation_url}}" style="color: ${brandColor}; word-break: break-all;">{{invitation_url}}</a>
      </p>
    </div>
    <div style="margin-top: 30px; border-top: 1px solid #f1f5f9; padding-top: 16px; text-align: center; color: #94a3b8; font-size: 12px;">
      ${form.footerNote ? `${form.footerNote}<br/>` : ''}
      ${form.footerOrg || 'มหาวิทยาลัยแม่ฟ้าหลวง'}
    </div>
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
        if (
          item.code === 'evaluation_request' ||
          item.code === 'evaluation_reminder'
        ) {
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

// Quick formatting tools
function wrapSelection(openTag: string, closeTag: string): void {
  const form = friendlyForms.value[activeTab.value]
  form.mainMessage = `${form.mainMessage} ${openTag}ข้อความเน้น${closeTag}`
  toast.add({
    title: 'แทรกรูปแบบแล้ว',
    description: 'สามารถแก้ไขข้อความในรูปแบบที่กำหนดได้ทันที',
    color: 'success',
    icon: 'i-lucide-check'
  })
}

function insertBullet(): void {
  const form = friendlyForms.value[activeTab.value]
  form.mainMessage += '\n• '
}

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

function selectTheme(color: string): void {
  friendlyForms.value[activeTab.value].design.themeColor = color
}

// Compute live preview
const previewSubject = computed(() => {
  const code = activeTab.value
  let sub =
    editorMode.value === 'html'
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
    body = generateHtmlFromFriendly(friendlyForms.value[code])
  }
  for (const p of availablePlaceholders) {
    body = body.replaceAll(p.tag, p.example)
  }
  return body
})

const previewEmailDocument = computed(() =>
  createSandboxedEmailPreviewDocument(previewHtml.value)
)

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
      html = generateHtmlFromFriendly(form)
      text = generateTextFromFriendly(form)
      rawDrafts.value[code].html = html
      rawDrafts.value[code].text = text
    }

    const updated = await api<SystemTemplateItem>(
      `/email-templates/system/${code}`,
      {
        method: 'PUT',
        body: {
          subject,
          html,
          text
        }
      }
    )

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
  if (
    !confirm(
      `คุณต้องการคืนค่าเริ่มต้นของแม่แบบ "${currentTemplate.value.name}" หรือไม่?`
    )
  ) {
    return
  }

  resetting.value = true
  try {
    const code = activeTab.value
    const reset = await api<SystemTemplateItem>(
      `/email-templates/system/${code}/reset`,
      {
        method: 'POST'
      }
    )

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
    rawDrafts.value[code].html = generateHtmlFromFriendly(
      friendlyForms.value[code]
    )
    rawDrafts.value[code].text = generateTextFromFriendly(
      friendlyForms.value[code]
    )
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
        <p class="mfu-eyebrow">
          ระบบแม่แบบและการตกแต่งจดหมาย (Letter Design Studio)
        </p>
        <h1 class="mt-2 text-3xl font-bold text-highlighted">ตั้งค่าจดหมาย</h1>
        <p class="mt-1 text-sm text-muted">
          ปรับแต่งข้อความ สีสัน และความสวยงามของจดหมายได้ตามต้องการ
          โดยไม่ต้องมีความรู้เรื่องโค้ด
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
    <div
      class="rounded-2xl border border-default bg-default shadow-sm overflow-hidden"
    >
      <!-- 2 Main Email Category Tabs -->
      <div
        class="flex border-b border-default bg-muted/20 px-4 pt-3 gap-2 overflow-x-auto"
      >
        <button
          type="button"
          :class="[
            'inline-flex items-center gap-2.5 px-5 py-3 rounded-t-xl text-sm font-bold border-b-2 transition-all cursor-pointer whitespace-nowrap',
            activeTab === 'evaluation_request'
              ? 'border-emerald-600 text-emerald-700 dark:text-emerald-400 bg-default shadow-xs'
              : 'border-transparent text-muted hover:text-highlighted hover:bg-muted/40'
          ]"
          @click="activeTab = 'evaluation_request'"
        >
          <div
            class="size-6 rounded-full bg-emerald-500/15 flex items-center justify-center text-emerald-600 font-bold text-xs"
          >
            1
          </div>
          <span>ขอความอนุเคราะห์ประเมินผล</span>
          <span
            class="rounded-full bg-emerald-500/10 text-emerald-600 text-[11px] px-2 py-0.5 font-medium"
          >
            ส่งครั้งแรก
          </span>
        </button>

        <button
          type="button"
          :class="[
            'inline-flex items-center gap-2.5 px-5 py-3 rounded-t-xl text-sm font-bold border-b-2 transition-all cursor-pointer whitespace-nowrap',
            activeTab === 'evaluation_reminder'
              ? 'border-amber-600 text-amber-700 dark:text-amber-400 bg-default shadow-xs'
              : 'border-transparent text-muted hover:text-highlighted hover:bg-muted/40'
          ]"
          @click="activeTab = 'evaluation_reminder'"
        >
          <div
            class="size-6 rounded-full bg-amber-500/15 flex items-center justify-center text-amber-600 font-bold text-xs"
          >
            2
          </div>
          <span>แจ้งเตือนการประเมิน</span>
          <span
            class="rounded-full bg-amber-500/10 text-amber-600 text-[11px] px-2 py-0.5 font-medium"
          >
            เตือนซ้ำ
          </span>
        </button>
      </div>

      <!-- Loading State -->
      <div v-if="loading" class="p-16 text-center text-muted text-sm space-y-3">
        <UIcon
          name="i-lucide-loader-2"
          class="size-8 animate-spin mx-auto text-primary"
        />
        <p class="font-medium">กำลังโหลดข้อมูลแม่แบบอีเมล...</p>
      </div>

      <!-- Tab Content Area -->
      <div v-else class="p-6 space-y-6">
        <!-- Mode Selector Bar (Top Bar) -->
        <div
          class="flex flex-wrap items-center justify-between gap-3 border-b border-default pb-4"
        >
          <div
            class="inline-flex p-1 rounded-xl border border-default bg-muted/30"
          >
            <button
              type="button"
              :class="[
                'flex items-center gap-1.5 px-4 py-2 text-xs font-bold rounded-lg transition-all cursor-pointer',
                editorMode === 'friendly'
                  ? 'bg-default text-primary shadow-xs'
                  : 'text-muted hover:text-highlighted'
              ]"
              @click="editorMode = 'friendly'"
            >
              <UIcon name="i-lucide-sparkles" class="size-4 text-primary" />
              <span>โหมดใช้งานง่าย & ตกแต่ง (Visual Studio)</span>
            </button>

            <button
              type="button"
              :class="[
                'flex items-center gap-1.5 px-4 py-2 text-xs font-semibold rounded-lg transition-all cursor-pointer',
                editorMode === 'preview'
                  ? 'bg-default text-primary shadow-xs'
                  : 'text-muted hover:text-highlighted'
              ]"
              @click="editorMode = 'preview'"
            >
              <UIcon name="i-lucide-eye" class="size-4" />
              <span>ดูตัวอย่างเต็มจอ (Full Preview)</span>
            </button>

            <button
              type="button"
              :class="[
                'flex items-center gap-1.5 px-4 py-2 text-xs font-semibold rounded-lg transition-all cursor-pointer',
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

          <div class="text-xs text-muted flex items-center gap-2">
            <span
              class="inline-block size-2 rounded-full bg-emerald-500"
            ></span>
            <span
              >เวอร์ชันระบบ:
              <strong>{{ currentTemplate.versionNumber || 1 }}</strong></span
            >
          </div>
        </div>

        <!-- VIEW 1: FRIENDLY MODE (SPLIT INTO CONTENT & DESIGN SUB-TABS) -->
        <div v-show="editorMode === 'friendly'" class="space-y-6">
          <!-- Split Layout: Controls on Left, Real-time Live Preview on Right -->
          <div class="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
            <!-- Left Side: Controls (7 cols) -->
            <div class="lg:col-span-7 space-y-5">
              <!-- Sub-Tabs Switcher: Content vs Design -->
              <div
                class="flex items-center gap-2 p-1 rounded-xl bg-muted/40 border border-default"
              >
                <button
                  type="button"
                  :class="[
                    'flex-1 flex items-center justify-center gap-2 py-2 text-xs font-bold rounded-lg transition-all cursor-pointer',
                    activeSubTab === 'content'
                      ? 'bg-default text-highlighted shadow-xs'
                      : 'text-muted hover:text-highlighted'
                  ]"
                  @click="activeSubTab = 'content'"
                >
                  <UIcon
                    name="i-lucide-file-text"
                    class="size-4 text-primary"
                  />
                  <span>1. ข้อความและเนื้อหา (Content)</span>
                </button>

                <button
                  type="button"
                  :class="[
                    'flex-1 flex items-center justify-center gap-2 py-2 text-xs font-bold rounded-lg transition-all cursor-pointer',
                    activeSubTab === 'design'
                      ? 'bg-default text-highlighted shadow-xs'
                      : 'text-muted hover:text-highlighted'
                  ]"
                  @click="activeSubTab = 'design'"
                >
                  <UIcon
                    name="i-lucide-palette"
                    class="size-4 text-emerald-600"
                  />
                  <span>2. ตกแต่งความสวยงาม (Design Studio)</span>
                  <span
                    class="size-2 rounded-full bg-emerald-500 animate-pulse"
                  ></span>
                </button>
              </div>

              <!-- SUB-TAB 1: CONTENT EDITING -->
              <div v-show="activeSubTab === 'content'" class="space-y-4">
                <!-- Subject Box -->
                <div
                  class="rounded-xl border border-default bg-default p-4 space-y-2"
                >
                  <div class="flex items-center justify-between">
                    <label
                      class="text-xs font-bold text-highlighted flex items-center gap-1.5"
                    >
                      <UIcon name="i-lucide-mail" class="size-4 text-primary" />
                      หัวข้ออีเมล (Subject)
                    </label>
                    <button
                      type="button"
                      class="text-[11px] text-primary hover:underline flex items-center gap-1 font-medium"
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
                    placeholder="เช่น [มหาวิทยาลัยแม่ฟ้าหลวง] ขอความอนุเคราะห์ประเมินผลการฝึกงาน..."
                  />
                </div>

                <!-- Salutation Box -->
                <div
                  class="rounded-xl border border-default bg-default p-4 space-y-2"
                >
                  <label
                    class="text-xs font-bold text-highlighted flex items-center gap-1.5"
                  >
                    <UIcon
                      name="i-lucide-user-check"
                      class="size-4 text-primary"
                    />
                    คำขึ้นต้นจดหมาย (ถึงผู้รับ)
                  </label>
                  <input
                    v-model="currentFriendly.greeting"
                    type="text"
                    class="w-full rounded-lg border border-default bg-muted/10 px-3.5 py-2 text-xs text-highlighted focus:outline-none focus:ring-2 focus:ring-primary font-medium"
                    placeholder="เรียน {{evaluator_name}} (สถานประกอบการ: {{company_name}}),"
                  />
                </div>

                <!-- Main Message with Rich Text Quick Toolbar -->
                <div
                  class="rounded-xl border border-default bg-default p-4 space-y-3"
                >
                  <div class="flex items-center justify-between">
                    <label
                      class="text-xs font-bold text-highlighted flex items-center gap-1.5"
                    >
                      <UIcon
                        name="i-lucide-message-square-text"
                        class="size-4 text-primary"
                      />
                      เนื้อหาข้อความหลัก
                    </label>
                    <span class="text-[11px] text-emerald-600 font-medium"
                      >พิมพ์ข้อความเหมือนพิมพ์เอกสารทั่วไป</span
                    >
                  </div>

                  <!-- Quick Formatting Toolbar -->
                  <div
                    class="flex flex-wrap items-center gap-1.5 p-2 rounded-lg bg-muted/30 border border-default text-xs"
                  >
                    <button
                      type="button"
                      class="px-2 py-1 rounded bg-default hover:bg-muted font-bold text-xs border border-default"
                      title="ตัวหนา"
                      @click="wrapSelection('<strong>', '</strong>')"
                    >
                      B
                    </button>
                    <button
                      type="button"
                      class="px-2 py-1 rounded bg-default hover:bg-muted italic text-xs border border-default font-serif"
                      title="ตัวเอียง"
                      @click="wrapSelection('<em>', '</em>')"
                    >
                      I
                    </button>
                    <button
                      type="button"
                      class="px-2 py-1 rounded bg-default hover:bg-muted underline text-xs border border-default"
                      title="ขีดเส้นใต้"
                      @click="wrapSelection('<u>', '</u>')"
                    >
                      U
                    </button>
                    <button
                      type="button"
                      class="px-2 py-1 rounded bg-yellow-100 hover:bg-yellow-200 text-yellow-800 text-xs border border-yellow-300 font-medium"
                      title="ไฮไลต์ข้อความสีเหลือง"
                      @click="
                        wrapSelection(
                          '<mark style=\'background-color: #fef08a; padding: 2px 4px; border-radius: 4px;\'>',
                          '</mark>'
                        )
                      "
                    >
                      🖍️ ไฮไลต์
                    </button>
                    <button
                      type="button"
                      class="px-2 py-1 rounded bg-default hover:bg-muted text-xs border border-default"
                      title="เพิ่มหัวข้อย่อยแบบจุด"
                      @click="insertBullet"
                    >
                      • จุดนำ
                    </button>

                    <span class="h-4 w-px bg-default mx-1"></span>

                    <!-- Quick tag chips -->
                    <button
                      v-for="p in availablePlaceholders.slice(0, 4)"
                      :key="p.tag"
                      type="button"
                      class="px-2 py-1 rounded bg-default hover:border-primary hover:text-primary text-[11px] border border-default font-medium"
                      :title="`แทรก ${p.label}`"
                      @click="insertTagToMessage(p.tag)"
                    >
                      + {{ p.label }}
                    </button>
                  </div>

                  <textarea
                    v-model="currentFriendly.mainMessage"
                    rows="5"
                    class="w-full rounded-lg border border-default bg-muted/10 p-3 text-xs text-highlighted focus:outline-none focus:ring-2 focus:ring-primary leading-relaxed"
                    placeholder="พิมพ์ข้อความที่ต้องการแจ้งไปยังสถานประกอบการ..."
                  ></textarea>
                </div>

                <!-- Paragraph 2 -->
                <div
                  class="rounded-xl border border-default bg-default p-4 space-y-2"
                >
                  <label
                    class="text-xs font-bold text-highlighted flex items-center gap-1.5"
                  >
                    <UIcon
                      name="i-lucide-align-left"
                      class="size-4 text-primary"
                    />
                    ข้อความย่อหน้าที่ 2 (เพิ่มเติม / แจ้งกำหนดส่ง)
                  </label>
                  <textarea
                    v-model="currentFriendly.secondMessage"
                    rows="3"
                    class="w-full rounded-lg border border-default bg-muted/10 p-3 text-xs text-highlighted focus:outline-none focus:ring-2 focus:ring-primary leading-relaxed"
                    placeholder="ข้อความเพิ่มเติม เช่น กำหนดการส่งผลประเมิน หรือคำขอบคุณ..."
                  ></textarea>
                </div>

                <!-- Button and Footer Text -->
                <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div
                    class="rounded-xl border border-default bg-default p-4 space-y-2"
                  >
                    <label
                      class="text-xs font-bold text-highlighted flex items-center gap-1.5"
                    >
                      <UIcon
                        name="i-lucide-mouse-pointer-click"
                        class="size-4 text-primary"
                      />
                      ข้อความบนปุ่มกด
                    </label>
                    <input
                      v-model="currentFriendly.buttonText"
                      type="text"
                      class="w-full rounded-lg border border-default bg-muted/10 px-3 py-2 text-xs text-highlighted focus:outline-none focus:ring-2 focus:ring-primary"
                    />
                  </div>

                  <div
                    class="rounded-xl border border-default bg-default p-4 space-y-2"
                  >
                    <label
                      class="text-xs font-bold text-highlighted flex items-center gap-1.5"
                    >
                      <UIcon
                        name="i-lucide-building"
                        class="size-4 text-primary"
                      />
                      ชื่อหน่วยงานส่วนท้าย
                    </label>
                    <input
                      v-model="currentFriendly.footerOrg"
                      type="text"
                      class="w-full rounded-lg border border-default bg-muted/10 px-3 py-2 text-xs text-highlighted focus:outline-none focus:ring-2 focus:ring-primary"
                    />
                  </div>
                </div>
              </div>

              <!-- SUB-TAB 2: DESIGN STUDIO (VISUAL CSS CONTROLS) -->
              <div v-show="activeSubTab === 'design'" class="space-y-4">
                <!-- 1. Color Palette Presets -->
                <div
                  class="rounded-xl border border-default bg-default p-4 space-y-3"
                >
                  <div class="flex items-center justify-between">
                    <label
                      class="text-xs font-bold text-highlighted flex items-center gap-1.5"
                    >
                      <UIcon
                        name="i-lucide-palette"
                        class="size-4 text-emerald-600"
                      />
                      1. ธีมสีหลักของจดหมาย (Color Palette)
                    </label>
                    <span class="text-[11px] text-muted"
                      >คลิกเดียวเปลี่ยนสีทั้งฉบับ</span
                    >
                  </div>

                  <div class="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
                    <button
                      v-for="item in themePresets"
                      :key="item.color"
                      type="button"
                      :class="[
                        'flex items-center gap-2 p-2.5 rounded-xl border text-left transition-all cursor-pointer',
                        currentFriendly.design.themeColor === item.color
                          ? 'border-primary ring-2 ring-primary/20 bg-primary/5 shadow-xs font-bold'
                          : 'border-default hover:bg-muted/40 font-medium'
                      ]"
                      @click="selectTheme(item.color)"
                    >
                      <span
                        class="size-6 rounded-full shrink-0 shadow-xs border border-white/30"
                        :style="{ backgroundColor: item.color }"
                      ></span>
                      <div class="text-xs min-w-0">
                        <p class="truncate leading-tight text-highlighted">
                          {{ item.name }}
                        </p>
                        <p class="text-[10px] text-muted truncate">
                          {{ item.desc }}
                        </p>
                      </div>
                    </button>
                  </div>

                  <!-- Custom Color Input -->
                  <div
                    class="flex items-center gap-3 pt-2 border-t border-default text-xs"
                  >
                    <span class="text-muted font-medium"
                      >หรือเลือกสีเองตามต้องการ:</span
                    >
                    <input
                      v-model="currentFriendly.design.themeColor"
                      type="color"
                      class="size-7 rounded-lg border border-default cursor-pointer p-0.5"
                    />
                    <span class="font-mono text-xs text-highlighted">{{
                      currentFriendly.design.themeColor
                    }}</span>
                  </div>
                </div>

                <!-- 2. Header Style -->
                <div
                  class="rounded-xl border border-default bg-default p-4 space-y-3"
                >
                  <label
                    class="text-xs font-bold text-highlighted flex items-center gap-1.5"
                  >
                    <UIcon
                      name="i-lucide-layout-template"
                      class="size-4 text-primary"
                    />
                    2. รูปแบบหัวจดหมาย (Header Style)
                  </label>
                  <div class="grid grid-cols-3 gap-2 text-xs">
                    <button
                      type="button"
                      :class="[
                        'p-3 rounded-xl border text-center transition-all cursor-pointer flex flex-col items-center gap-1.5',
                        currentFriendly.design.headerStyle === 'top_border'
                          ? 'border-primary ring-2 ring-primary/20 bg-primary/5 font-bold text-primary'
                          : 'border-default hover:bg-muted/40 text-muted'
                      ]"
                      @click="currentFriendly.design.headerStyle = 'top_border'"
                    >
                      <div class="w-full h-2 rounded-t bg-emerald-600"></div>
                      <span>แถบสีด้านบน</span>
                    </button>

                    <button
                      type="button"
                      :class="[
                        'p-3 rounded-xl border text-center transition-all cursor-pointer flex flex-col items-center gap-1.5',
                        currentFriendly.design.headerStyle === 'banner'
                          ? 'border-primary ring-2 ring-primary/20 bg-primary/5 font-bold text-primary'
                          : 'border-default hover:bg-muted/40 text-muted'
                      ]"
                      @click="currentFriendly.design.headerStyle = 'banner'"
                    >
                      <div
                        class="w-full h-5 rounded-t bg-emerald-600 flex items-center justify-center text-[9px] text-white"
                      >
                        มฟล.
                      </div>
                      <span>แถบสีเต็ม (Banner)</span>
                    </button>

                    <button
                      type="button"
                      :class="[
                        'p-3 rounded-xl border text-center transition-all cursor-pointer flex flex-col items-center gap-1.5',
                        currentFriendly.design.headerStyle === 'minimal'
                          ? 'border-primary ring-2 ring-primary/20 bg-primary/5 font-bold text-primary'
                          : 'border-default hover:bg-muted/40 text-muted'
                      ]"
                      @click="currentFriendly.design.headerStyle = 'minimal'"
                    >
                      <div class="w-full h-1 rounded bg-slate-300"></div>
                      <span>มินิมอล เรียบหรู</span>
                    </button>
                  </div>
                </div>

                <!-- 3. Button Styling -->
                <div
                  class="rounded-xl border border-default bg-default p-4 space-y-3"
                >
                  <label
                    class="text-xs font-bold text-highlighted flex items-center gap-1.5"
                  >
                    <UIcon
                      name="i-lucide-mouse-pointer-click"
                      class="size-4 text-primary"
                    />
                    3. ตกแต่งปุ่มกด (Button Styler)
                  </label>

                  <div class="grid grid-cols-2 gap-4">
                    <!-- Shape -->
                    <div class="space-y-1.5">
                      <span class="text-[11px] text-muted font-medium"
                        >รูปทรงปุ่ม:</span
                      >
                      <div class="grid grid-cols-3 gap-1.5 text-xs">
                        <button
                          type="button"
                          :class="[
                            'py-2 px-1 rounded-lg border text-center transition-all cursor-pointer',
                            currentFriendly.design.buttonShape === 'rounded'
                              ? 'border-primary bg-primary/10 text-primary font-bold'
                              : 'border-default hover:bg-muted text-muted'
                          ]"
                          @click="
                            currentFriendly.design.buttonShape = 'rounded'
                          "
                        >
                          มนปกติ
                        </button>
                        <button
                          type="button"
                          :class="[
                            'py-2 px-1 rounded-full border text-center transition-all cursor-pointer',
                            currentFriendly.design.buttonShape === 'pill'
                              ? 'border-primary bg-primary/10 text-primary font-bold'
                              : 'border-default hover:bg-muted text-muted'
                          ]"
                          @click="currentFriendly.design.buttonShape = 'pill'"
                        >
                          แคปซูล
                        </button>
                        <button
                          type="button"
                          :class="[
                            'py-2 px-1 rounded-none border text-center transition-all cursor-pointer',
                            currentFriendly.design.buttonShape === 'square'
                              ? 'border-primary bg-primary/10 text-primary font-bold'
                              : 'border-default hover:bg-muted text-muted'
                          ]"
                          @click="currentFriendly.design.buttonShape = 'square'"
                        >
                          เหลี่ยม
                        </button>
                      </div>
                    </div>

                    <!-- Button Type -->
                    <div class="space-y-1.5">
                      <span class="text-[11px] text-muted font-medium"
                        >สไตล์สีปุ่ม:</span
                      >
                      <div class="grid grid-cols-2 gap-1.5 text-xs">
                        <button
                          type="button"
                          :class="[
                            'py-2 px-2 rounded-lg border text-center transition-all cursor-pointer',
                            currentFriendly.design.buttonStyle === 'solid'
                              ? 'border-primary bg-primary/10 text-primary font-bold'
                              : 'border-default hover:bg-muted text-muted'
                          ]"
                          @click="currentFriendly.design.buttonStyle = 'solid'"
                        >
                          สีทึบเด่นชัด
                        </button>
                        <button
                          type="button"
                          :class="[
                            'py-2 px-2 rounded-lg border text-center transition-all cursor-pointer',
                            currentFriendly.design.buttonStyle === 'outline'
                              ? 'border-primary bg-primary/10 text-primary font-bold'
                              : 'border-default hover:bg-muted text-muted'
                          ]"
                          @click="
                            currentFriendly.design.buttonStyle = 'outline'
                          "
                        >
                          ขอบเส้นโปร่ง
                        </button>
                      </div>
                    </div>
                  </div>
                </div>

                <!-- 4. Highlight Box & Typography -->
                <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <!-- Highlight Box Style -->
                  <div
                    class="rounded-xl border border-default bg-default p-4 space-y-2"
                  >
                    <label
                      class="text-xs font-bold text-highlighted flex items-center gap-1.5"
                    >
                      <UIcon name="i-lucide-box" class="size-4 text-primary" />
                      4. สไตล์กล่องข้อมูลสรุป
                    </label>
                    <div class="grid grid-cols-3 gap-1.5 text-xs">
                      <button
                        type="button"
                        :class="[
                          'py-2 px-1 rounded-lg border text-center transition-all cursor-pointer',
                          currentFriendly.design.boxStyle === 'pastel'
                            ? 'border-primary bg-primary/10 text-primary font-bold'
                            : 'border-default hover:bg-muted text-muted'
                        ]"
                        @click="currentFriendly.design.boxStyle = 'pastel'"
                      >
                        พาสเทล
                      </button>
                      <button
                        type="button"
                        :class="[
                          'py-2 px-1 rounded-lg border text-center transition-all cursor-pointer',
                          currentFriendly.design.boxStyle === 'left_bar'
                            ? 'border-primary bg-primary/10 text-primary font-bold'
                            : 'border-default hover:bg-muted text-muted'
                        ]"
                        @click="currentFriendly.design.boxStyle = 'left_bar'"
                      >
                        แถบสีซ้าย
                      </button>
                      <button
                        type="button"
                        :class="[
                          'py-2 px-1 rounded-lg border text-center transition-all cursor-pointer',
                          currentFriendly.design.boxStyle === 'dotted'
                            ? 'border-primary bg-primary/10 text-primary font-bold'
                            : 'border-default hover:bg-muted text-muted'
                        ]"
                        @click="currentFriendly.design.boxStyle = 'dotted'"
                      >
                        เส้นประ
                      </button>
                    </div>
                  </div>

                  <!-- Typography Size -->
                  <div
                    class="rounded-xl border border-default bg-default p-4 space-y-2"
                  >
                    <label
                      class="text-xs font-bold text-highlighted flex items-center gap-1.5"
                    >
                      <UIcon name="i-lucide-type" class="size-4 text-primary" />
                      5. ขนาดตัวหนังสือ
                    </label>
                    <div class="grid grid-cols-3 gap-1.5 text-xs">
                      <button
                        type="button"
                        :class="[
                          'py-2 px-1 rounded-lg border text-center transition-all cursor-pointer',
                          currentFriendly.design.textSize === 'small'
                            ? 'border-primary bg-primary/10 text-primary font-bold'
                            : 'border-default hover:bg-muted text-muted'
                        ]"
                        @click="currentFriendly.design.textSize = 'small'"
                      >
                        กะทัดรัด
                      </button>
                      <button
                        type="button"
                        :class="[
                          'py-2 px-1 rounded-lg border text-center transition-all cursor-pointer',
                          currentFriendly.design.textSize === 'medium'
                            ? 'border-primary bg-primary/10 text-primary font-bold'
                            : 'border-default hover:bg-muted text-muted'
                        ]"
                        @click="currentFriendly.design.textSize = 'medium'"
                      >
                        มาตรฐาน
                      </button>
                      <button
                        type="button"
                        :class="[
                          'py-2 px-1 rounded-lg border text-center transition-all cursor-pointer',
                          currentFriendly.design.textSize === 'large'
                            ? 'border-primary bg-primary/10 text-primary font-bold'
                            : 'border-default hover:bg-muted text-muted'
                        ]"
                        @click="currentFriendly.design.textSize = 'large'"
                      >
                        ใหญ่สบายตา
                      </button>
                    </div>
                  </div>
                </div>

                <!-- 5. Card Background & Corner Radius -->
                <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <!-- Corner Radius -->
                  <div
                    class="rounded-xl border border-default bg-default p-4 space-y-2"
                  >
                    <label
                      class="text-xs font-bold text-highlighted flex items-center gap-1.5"
                    >
                      <UIcon
                        name="i-lucide-square-dashed-mouse-pointer"
                        class="size-4 text-primary"
                      />
                      6. ความโค้งมนขอบจดหมาย
                    </label>
                    <div class="grid grid-cols-3 gap-1.5 text-xs">
                      <button
                        type="button"
                        :class="[
                          'py-2 px-1 rounded-none border text-center transition-all cursor-pointer',
                          currentFriendly.design.borderRadius === '0px'
                            ? 'border-primary bg-primary/10 text-primary font-bold'
                            : 'border-default hover:bg-muted text-muted'
                        ]"
                        @click="currentFriendly.design.borderRadius = '0px'"
                      >
                        เหลี่ยม
                      </button>
                      <button
                        type="button"
                        :class="[
                          'py-2 px-1 rounded-lg border text-center transition-all cursor-pointer',
                          currentFriendly.design.borderRadius === '8px'
                            ? 'border-primary bg-primary/10 text-primary font-bold'
                            : 'border-default hover:bg-muted text-muted'
                        ]"
                        @click="currentFriendly.design.borderRadius = '8px'"
                      >
                        มน 8px
                      </button>
                      <button
                        type="button"
                        :class="[
                          'py-2 px-1 rounded-xl border text-center transition-all cursor-pointer',
                          currentFriendly.design.borderRadius === '16px'
                            ? 'border-primary bg-primary/10 text-primary font-bold'
                            : 'border-default hover:bg-muted text-muted'
                        ]"
                        @click="currentFriendly.design.borderRadius = '16px'"
                      >
                        มน 16px
                      </button>
                    </div>
                  </div>

                  <!-- Card Background Color -->
                  <div
                    class="rounded-xl border border-default bg-default p-4 space-y-2"
                  >
                    <label
                      class="text-xs font-bold text-highlighted flex items-center gap-1.5"
                    >
                      <UIcon
                        name="i-lucide-paint-bucket"
                        class="size-4 text-primary"
                      />
                      7. สีพื้นหลังจดหมาย
                    </label>
                    <div class="grid grid-cols-3 gap-1.5 text-xs">
                      <button
                        type="button"
                        :class="[
                          'py-2 px-1 rounded-lg border text-center transition-all cursor-pointer bg-white text-slate-800',
                          currentFriendly.design.cardBg === '#ffffff'
                            ? 'border-primary ring-2 ring-primary/20 font-bold'
                            : 'border-default'
                        ]"
                        @click="currentFriendly.design.cardBg = '#ffffff'"
                      >
                        สีขาว
                      </button>
                      <button
                        type="button"
                        :class="[
                          'py-2 px-1 rounded-lg border text-center transition-all cursor-pointer bg-[#fdfbf7] text-amber-900',
                          currentFriendly.design.cardBg === '#fdfbf7'
                            ? 'border-primary ring-2 ring-primary/20 font-bold'
                            : 'border-default'
                        ]"
                        @click="currentFriendly.design.cardBg = '#fdfbf7'"
                      >
                        สีครีม
                      </button>
                      <button
                        type="button"
                        :class="[
                          'py-2 px-1 rounded-lg border text-center transition-all cursor-pointer bg-[#f8fafc] text-slate-700',
                          currentFriendly.design.cardBg === '#f8fafc'
                            ? 'border-primary ring-2 ring-primary/20 font-bold'
                            : 'border-default'
                        ]"
                        @click="currentFriendly.design.cardBg = '#f8fafc'"
                      >
                        เทาอ่อน
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <!-- Right Side: Sticky Real-time Live Preview (5 cols) -->
            <div class="lg:col-span-5 sticky top-6 space-y-3">
              <div class="flex items-center justify-between">
                <span
                  class="text-xs font-bold text-highlighted flex items-center gap-1.5"
                >
                  <UIcon name="i-lucide-monitor" class="size-4 text-primary" />
                  ตัวอย่างจดหมายจริง (Live Preview)
                </span>
                <span
                  class="text-[11px] rounded-full bg-emerald-500/10 text-emerald-600 px-2.5 py-0.5 font-bold"
                >
                  อัปเดตสด Real-time
                </span>
              </div>

              <!-- Preview Window Frame -->
              <div
                class="rounded-2xl border border-default bg-default shadow-md overflow-hidden"
              >
                <!-- Window Titlebar -->
                <div
                  class="bg-muted/40 border-b border-default p-3.5 space-y-1.5 text-xs"
                >
                  <div class="flex items-start gap-2">
                    <span class="text-muted w-12 shrink-0 font-medium"
                      >เรื่อง:</span
                    >
                    <span class="font-bold text-highlighted leading-snug">{{
                      previewSubject
                    }}</span>
                  </div>
                  <div class="flex items-center gap-2 text-muted text-[11px]">
                    <span class="w-12 shrink-0">จาก:</span>
                    <span
                      >มหาวิทยาลัยแม่ฟ้าหลวง &lt;internship@mfu.ac.th&gt;</span
                    >
                  </div>
                  <div class="flex items-center gap-2 text-muted text-[11px]">
                    <span class="w-12 shrink-0">ถึง:</span>
                    <span class="text-highlighted font-medium"
                      >คุณสมชาย ใจดี (สถานประกอบการ)</span
                    >
                  </div>
                </div>

                <!-- Live Rendered HTML -->
                <div
                  class="p-4 bg-slate-100/80 dark:bg-neutral-900/80 overflow-y-auto max-h-[620px]"
                >
                  <iframe
                    :srcdoc="previewEmailDocument"
                    title="ตัวอย่างรูปแบบอีเมล"
                    sandbox=""
                    referrerpolicy="no-referrer"
                    class="block h-[620px] w-full border-0 bg-white"
                  />
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- VIEW 2: FULL PREVIEW MODE -->
        <div v-show="editorMode === 'preview'" class="space-y-4">
          <div
            class="rounded-2xl border border-default bg-default shadow-md overflow-hidden max-w-2xl mx-auto"
          >
            <div
              class="bg-muted/30 border-b border-default p-4 space-y-2 text-xs"
            >
              <div class="flex items-center gap-2">
                <span class="text-muted w-14 shrink-0 font-medium"
                  >เรื่อง:</span
                >
                <span class="font-bold text-highlighted text-sm">{{
                  previewSubject
                }}</span>
              </div>
              <div class="flex items-center gap-2 text-muted">
                <span class="w-14 shrink-0">จาก:</span>
                <span class="font-medium"
                  >มหาวิทยาลัยแม่ฟ้าหลวง &lt;internship@mfu.ac.th&gt;</span
                >
              </div>
              <div class="flex items-center gap-2 text-muted">
                <span class="w-14 shrink-0">ถึง:</span>
                <span class="font-medium text-highlighted"
                  >คุณสมชาย ใจดี &lt;evaluator.cos@milott.com&gt;</span
                >
              </div>
            </div>

            <div
              class="p-8 bg-slate-100/60 dark:bg-neutral-900 overflow-x-auto min-h-[400px]"
            >
              <iframe
                :srcdoc="previewEmailDocument"
                title="ตัวอย่างอีเมลแบบเต็ม"
                sandbox=""
                referrerpolicy="no-referrer"
                class="block min-h-[400px] w-full border-0 bg-white"
              />
            </div>
          </div>
        </div>

        <!-- VIEW 3: ADVANCED HTML CODE MODE -->
        <div v-show="editorMode === 'html'" class="space-y-4">
          <div
            class="rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 flex items-center gap-2 text-xs text-amber-800 dark:text-amber-300"
          >
            <UIcon
              name="i-lucide-info"
              class="size-4 shrink-0 text-amber-600"
            />
            <span
              >โหมดสำหรับผู้ดูแลระบบหรือโปรแกรมเมอร์ที่ต้องการปรับแต่ง HTML Tag
              และ CSS โดยตรง</span
            >
          </div>

          <div class="space-y-1.5">
            <label class="text-xs font-semibold text-highlighted"
              >หัวข้ออีเมล (Subject):</label
            >
            <input
              v-model="currentFriendly.subject"
              type="text"
              class="w-full rounded-lg border border-default bg-default px-3 py-2 text-xs font-medium text-highlighted focus:outline-none focus:ring-1 focus:ring-primary"
            />
          </div>

          <div class="space-y-1.5">
            <label class="text-xs font-semibold text-highlighted"
              >เนื้อหา HTML (HTML Body):</label
            >
            <textarea
              v-model="currentRaw.html"
              rows="16"
              class="w-full rounded-lg border border-default bg-default p-3 text-xs text-highlighted font-mono focus:outline-none focus:ring-1 focus:ring-primary leading-relaxed"
            ></textarea>
          </div>

          <details
            class="text-xs text-muted rounded-lg border border-default p-3"
          >
            <summary
              class="cursor-pointer font-semibold text-highlighted flex items-center gap-1.5"
            >
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
        <div
          class="flex flex-wrap items-center justify-between gap-3 pt-5 border-t border-default"
        >
          <UButton
            color="neutral"
            icon="i-lucide-rotate-ccw"
            label="คืนค่าเริ่มต้น (Reset Default)"
            size="sm"
            variant="ghost"
            :loading="resetting"
            @click="resetTemplate"
          />

          <div class="flex items-center gap-3">
            <UButton
              color="primary"
              icon="i-lucide-save"
              label="บันทึกการเปลี่ยนแปลงทั้งหมด"
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
