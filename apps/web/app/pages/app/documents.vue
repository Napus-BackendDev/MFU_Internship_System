<script setup lang="ts">
definePageMeta({ layout: 'app', middleware: 'auth' })

interface StudentItem {
  readonly id: string
  readonly studentId: string
  readonly name: { readonly th: string; readonly en: string }
  readonly email: string
  readonly schoolId: string
  readonly programId: string
  readonly status: string
}

interface SchoolItem {
  readonly id: string
  readonly schoolCode: string
  readonly name: { readonly th: string; readonly en: string }
}

interface ProgramItem {
  readonly id: string
  readonly schoolId: string
  readonly programCode: string
  readonly name: { readonly th: string; readonly en: string }
}

interface PlacementItem {
  readonly id: string
  readonly studentId: string
  readonly organizationId: string
  readonly positionTitle?: { readonly th: string; readonly en: string }
  readonly startsAt?: string
  readonly endsAt?: string
}

interface OrganizationItem {
  readonly id: string
  readonly name: { readonly th: string; readonly en: string }
}

export type BackgroundType =
  'watermark' | 'certificate_pattern' | 'geometric' | 'custom' | 'none'

export interface TableData {
  headers: string[]
  rows: string[][]
}

// Canvas element definition for Canva-like layout
export interface CanvasElement {
  id: string
  type:
    | 'text'
    | 'variable'
    | 'heading'
    | 'badge'
    | 'table'
    | 'custom_table'
    | 'signature'
    | 'emblem'
    | 'divider'
    | 'shape'
  content: string
  variableKey?: string
  x: number // px on canvas
  y: number // px on canvas
  width?: number
  height?: number
  fontSize: number // px
  fontFamily?: string
  fontWeight: 'normal' | 'bold' | 'semibold'
  fontStyle?: 'normal' | 'italic'
  textDecoration?: 'none' | 'underline'
  color: string
  textAlign: 'left' | 'center' | 'right'
  letterSpacing?: string
  bgColor?: string
  borderWidth?: number
  borderColor?: string
  borderRadius?: number
  padding?: number
  shapeType?: 'rectangle' | 'circle' | 'line' | 'star'
  tableData?: TableData
}

export interface DocumentTemplateItem {
  id: string
  code: string
  nameTh: string
  nameEn: string
  docType: 'pdf' | 'certificate'
  description: string
  createdAt: string
  status: 'active' | 'inactive'
  backgroundType: BackgroundType
  customBgUrl?: string
  bgOpacity: number
  elements: CanvasElement[]
}

const api = useApi()
const toast = useToast()
const runtimeConfig = useRuntimeConfig()
const isProduction = runtimeConfig.public.appEnvironment !== 'development'

function showDocumentFeatureUnavailable(): void {
  toast.add({
    title: 'ยังไม่พร้อมใช้งานใน Production',
    description:
      'หน้านี้ยังไม่เชื่อมต่อการบันทึกแม่แบบและการออก PDF ผ่าน API จึงไม่สามารถบันทึกหรือออกเอกสารจริงได้',
    color: 'warning'
  })
}

// Load dynamic data from system API
const { data: studentsData } = await useAsyncData('docs-students', () =>
  api<{ items: StudentItem[] }>('/students', {
    query: { pageSize: 100 }
  }).catch(() => ({ items: [] }))
)

const { data: schoolsData } = await useAsyncData('docs-schools', () =>
  api<{ items: SchoolItem[] }>('/academic/schools', {
    query: { pageSize: 100 }
  }).catch(() => ({ items: [] }))
)

const { data: programsData } = await useAsyncData('docs-programs', () =>
  api<{ items: ProgramItem[] }>('/academic/programs', {
    query: { pageSize: 100 }
  }).catch(() => ({ items: [] }))
)

const { data: placementsData } = await useAsyncData('docs-placements', () =>
  api<{ items: PlacementItem[] }>('/placements', {
    query: { pageSize: 100 }
  }).catch(() => ({ items: [] }))
)

const { data: orgsData } = await useAsyncData('docs-orgs', () =>
  api<{ items: OrganizationItem[] }>('/organizations', {
    query: { pageSize: 100 }
  }).catch(() => ({ items: [] }))
)

// Font Options for Canvas typography
const fontFamilies = [
  { label: 'Sarabun (ทางการ / มาตรฐานราชการ)', value: 'Sarabun, sans-serif' },
  { label: 'Prompt (โมเดิร์น / ทันสมัยคมชัด)', value: 'Prompt, sans-serif' },
  { label: 'Kanit (คณิต / หัวกลมร่วมสมัย)', value: 'Kanit, sans-serif' },
  { label: 'Charm (ชาร์ม / ลายมือเกียรติบัตร)', value: 'Charm, cursive' },
  {
    label: 'Serif (คลาสสิก / หรูหราทางการ)',
    value: 'ui-serif, Georgia, serif'
  },
  { label: 'Monospace (ตัวเลขอ้างอิง)', value: 'ui-monospace, monospace' }
]

// Default Elements for Transcript Template
const defaultTranscriptElements: CanvasElement[] = [
  {
    id: 'el-tr-emblem',
    type: 'emblem',
    content: 'MFU-CREST',
    x: 360,
    y: 35,
    width: 74,
    height: 74,
    fontSize: 14,
    fontWeight: 'normal',
    color: '#b45309',
    textAlign: 'center'
  },
  {
    id: 'el-tr-title-th',
    type: 'heading',
    content: 'มหาวิทยาลัยแม่ฟ้าหลวง',
    x: 0,
    y: 118,
    width: 794,
    fontSize: 22,
    fontFamily: 'Sarabun, sans-serif',
    fontWeight: 'bold',
    color: '#0f172a',
    textAlign: 'center'
  },
  {
    id: 'el-tr-title-en',
    type: 'text',
    content: 'MAE FAH LUANG UNIVERSITY',
    x: 0,
    y: 148,
    width: 794,
    fontSize: 12,
    fontFamily: 'Prompt, sans-serif',
    fontWeight: 'bold',
    letterSpacing: '0.2em',
    color: '#b45309',
    textAlign: 'center'
  },
  {
    id: 'el-tr-dept',
    type: 'text',
    content:
      'ศูนย์บริการวิชาการและสหกิจศึกษา ฝ่ายส่งเสริมและพัฒนาการฝึกงานวิชาชีพ',
    x: 0,
    y: 172,
    width: 794,
    fontSize: 11,
    fontFamily: 'Sarabun, sans-serif',
    fontWeight: 'normal',
    color: '#64748b',
    textAlign: 'center'
  },
  {
    id: 'el-tr-docbadge',
    type: 'badge',
    content: 'ใบบันทึกผลการประเมินการฝึกงาน (INTERNSHIP TRANSCRIPT)',
    x: 217,
    y: 200,
    width: 360,
    fontSize: 13,
    fontFamily: 'Sarabun, sans-serif',
    fontWeight: 'bold',
    color: '#1e293b',
    bgColor: '#f1f5f9',
    borderRadius: 6,
    padding: 6,
    textAlign: 'center'
  },
  {
    id: 'el-tr-meta-docno',
    type: 'text',
    content: 'เลขที่เอกสาร: {{doc_number}}',
    x: 60,
    y: 250,
    width: 300,
    fontSize: 11,
    fontFamily: 'Sarabun, sans-serif',
    fontWeight: 'normal',
    color: '#475569',
    textAlign: 'left'
  },
  {
    id: 'el-tr-meta-date',
    type: 'text',
    content: 'วันที่ออกเอกสาร: {{issue_date}}',
    x: 434,
    y: 250,
    width: 300,
    fontSize: 11,
    fontFamily: 'Sarabun, sans-serif',
    fontWeight: 'normal',
    color: '#475569',
    textAlign: 'right'
  },
  {
    id: 'el-tr-box1',
    type: 'text',
    content: '1. ข้อมูลนักศึกษา (Student Information)',
    x: 60,
    y: 280,
    width: 674,
    fontSize: 12,
    fontFamily: 'Sarabun, sans-serif',
    fontWeight: 'bold',
    color: '#92400e',
    textAlign: 'left'
  },
  {
    id: 'el-tr-std-id',
    type: 'variable',
    variableKey: 'student_id',
    content: 'รหัสนักศึกษา: {{student_id}}',
    x: 75,
    y: 310,
    width: 300,
    fontSize: 12,
    fontFamily: 'Sarabun, sans-serif',
    fontWeight: 'bold',
    color: '#0f172a',
    textAlign: 'left'
  },
  {
    id: 'el-tr-std-name-th',
    type: 'variable',
    variableKey: 'student_name_th',
    content: 'ชื่อ-นามสกุล (TH): {{student_name_th}}',
    x: 380,
    y: 310,
    width: 340,
    fontSize: 12,
    fontFamily: 'Sarabun, sans-serif',
    fontWeight: 'bold',
    color: '#0f172a',
    textAlign: 'left'
  },
  {
    id: 'el-tr-std-name-en',
    type: 'variable',
    variableKey: 'student_name_en',
    content: 'Full Name (EN): {{student_name_en}}',
    x: 75,
    y: 338,
    width: 300,
    fontSize: 12,
    fontFamily: 'Prompt, sans-serif',
    fontWeight: 'normal',
    color: '#334155',
    textAlign: 'left'
  },
  {
    id: 'el-tr-std-year',
    type: 'text',
    content: 'ปีการศึกษา: 2569 (2026)',
    x: 380,
    y: 338,
    width: 340,
    fontSize: 12,
    fontFamily: 'Sarabun, sans-serif',
    fontWeight: 'normal',
    color: '#334155',
    textAlign: 'left'
  },
  {
    id: 'el-tr-std-school',
    type: 'variable',
    variableKey: 'school_name',
    content: 'สำนักวิชา: {{school_name}}',
    x: 75,
    y: 366,
    width: 640,
    fontSize: 12,
    fontFamily: 'Sarabun, sans-serif',
    fontWeight: 'normal',
    color: '#334155',
    textAlign: 'left'
  },
  {
    id: 'el-tr-std-prog',
    type: 'variable',
    variableKey: 'program_name',
    content: 'หลักสูตร/สาขาวิชา: {{program_name}}',
    x: 75,
    y: 394,
    width: 640,
    fontSize: 12,
    fontFamily: 'Sarabun, sans-serif',
    fontWeight: 'normal',
    color: '#334155',
    textAlign: 'left'
  },
  {
    id: 'el-tr-box2',
    type: 'text',
    content: '2. ข้อมูลการฝึกงานวิชาชีพ (Internship Placement)',
    x: 60,
    y: 435,
    width: 674,
    fontSize: 12,
    fontFamily: 'Sarabun, sans-serif',
    fontWeight: 'bold',
    color: '#92400e',
    textAlign: 'left'
  },
  {
    id: 'el-tr-place-org',
    type: 'variable',
    variableKey: 'organization_name',
    content: 'สถานประกอบการ: {{organization_name}}',
    x: 75,
    y: 462,
    width: 640,
    fontSize: 12,
    fontFamily: 'Sarabun, sans-serif',
    fontWeight: 'bold',
    color: '#0f172a',
    textAlign: 'left'
  },
  {
    id: 'el-tr-place-pos',
    type: 'variable',
    variableKey: 'position_title',
    content: 'ตำแหน่ง: {{position_title}}',
    x: 75,
    y: 490,
    width: 320,
    fontSize: 12,
    fontFamily: 'Sarabun, sans-serif',
    fontWeight: 'normal',
    color: '#334155',
    textAlign: 'left'
  },
  {
    id: 'el-tr-place-hrs',
    type: 'variable',
    variableKey: 'total_hours',
    content: 'จำนวนชั่วโมงรวม: {{total_hours}} ชั่วโมง (ครบตามเกณฑ์)',
    x: 380,
    y: 490,
    width: 340,
    fontSize: 12,
    fontFamily: 'Sarabun, sans-serif',
    fontWeight: 'bold',
    color: '#047857',
    textAlign: 'left'
  },
  {
    id: 'el-tr-place-period',
    type: 'variable',
    variableKey: 'training_period',
    content: 'ระยะเวลา: {{training_period}}',
    x: 75,
    y: 518,
    width: 640,
    fontSize: 12,
    fontFamily: 'Sarabun, sans-serif',
    fontWeight: 'normal',
    color: '#334155',
    textAlign: 'left'
  },
  {
    id: 'el-tr-table',
    type: 'table',
    content: 'COMPETENCY_TABLE',
    x: 60,
    y: 560,
    width: 674,
    height: 190,
    fontSize: 11,
    fontFamily: 'Sarabun, sans-serif',
    fontWeight: 'normal',
    color: '#0f172a',
    textAlign: 'left'
  },
  {
    id: 'el-tr-signatures',
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
  },
  {
    id: 'el-tr-footer',
    type: 'text',
    content:
      'เอกสารนี้สร้างและรับรองความถูกต้องจากระบบสารสนเทศมหาวิทยาลัยแม่ฟ้าหลวง • รหัสอ้างอิง: {{doc_number}}',
    x: 0,
    y: 910,
    width: 794,
    fontSize: 9,
    fontFamily: 'Sarabun, sans-serif',
    fontWeight: 'normal',
    color: '#94a3b8',
    textAlign: 'center'
  }
]

// Default Elements for Certificate Template
const defaultCertificateElements: CanvasElement[] = [
  {
    id: 'el-cr-emblem',
    type: 'emblem',
    content: 'GOLD-AWARD',
    x: 476,
    y: 45,
    width: 72,
    height: 72,
    fontSize: 16,
    fontWeight: 'normal',
    color: '#b45309',
    textAlign: 'center'
  },
  {
    id: 'el-cr-univ',
    type: 'text',
    content: 'มหาวิทยาลัยแม่ฟ้าหลวง • MAE FAH LUANG UNIVERSITY',
    x: 0,
    y: 128,
    width: 1024,
    fontSize: 13,
    fontFamily: 'Charm, cursive',
    fontWeight: 'bold',
    letterSpacing: '0.25em',
    color: '#b45309',
    textAlign: 'center'
  },
  {
    id: 'el-cr-title-th',
    type: 'heading',
    content: 'ใบประกาศนียบัตรรับรองการฝึกงาน',
    x: 0,
    y: 156,
    width: 1024,
    fontSize: 34,
    fontFamily: 'Prompt, sans-serif',
    fontWeight: 'bold',
    letterSpacing: '0.05em',
    color: '#0f172a',
    textAlign: 'center'
  },
  {
    id: 'el-cr-title-en',
    type: 'text',
    content: 'CERTIFICATE OF INTERNSHIP COMPLETION',
    x: 0,
    y: 202,
    width: 1024,
    fontSize: 13,
    fontFamily: 'Prompt, sans-serif',
    fontWeight: 'bold',
    letterSpacing: '0.2em',
    color: '#64748b',
    textAlign: 'center'
  },
  {
    id: 'el-cr-certify-line',
    type: 'text',
    content: 'ใบประกาศนียบัตรนี้ออกให้เพื่อแสดงว่า / This is to certify that',
    x: 0,
    y: 240,
    width: 1024,
    fontSize: 13,
    fontFamily: 'Sarabun, sans-serif',
    fontWeight: 'normal',
    color: '#475569',
    textAlign: 'center'
  },
  {
    id: 'el-cr-std-name-th',
    type: 'variable',
    variableKey: 'student_name_th',
    content: '{{student_name_th}}',
    x: 0,
    y: 270,
    width: 1024,
    fontSize: 34,
    fontFamily: 'Prompt, sans-serif',
    fontWeight: 'bold',
    color: '#78350f',
    textAlign: 'center'
  },
  {
    id: 'el-cr-std-name-en',
    type: 'variable',
    variableKey: 'student_name_en',
    content: '({{student_name_en}})',
    x: 0,
    y: 318,
    width: 1024,
    fontSize: 16,
    fontFamily: 'Prompt, sans-serif',
    fontWeight: 'semibold',
    color: '#475569',
    textAlign: 'center'
  },
  {
    id: 'el-cr-std-id',
    type: 'variable',
    variableKey: 'student_id',
    content: 'รหัสนักศึกษา (Student ID): {{student_id}}',
    x: 0,
    y: 346,
    width: 1024,
    fontSize: 13,
    fontFamily: 'Sarabun, sans-serif',
    fontWeight: 'semibold',
    color: '#64748b',
    textAlign: 'center'
  },
  {
    id: 'el-cr-detail-text1',
    type: 'text',
    content:
      'ได้ผ่านการฝึกปฏิบัติงานวิชาชีพตามเกณฑ์มาตรฐานการศึกษา ระดับปริญญาตรี',
    x: 0,
    y: 382,
    width: 1024,
    fontSize: 13,
    fontFamily: 'Sarabun, sans-serif',
    fontWeight: 'normal',
    color: '#334155',
    textAlign: 'center'
  },
  {
    id: 'el-cr-detail-school-prog',
    type: 'text',
    content: '{{school_name}} • {{program_name}}',
    x: 0,
    y: 406,
    width: 1024,
    fontSize: 13,
    fontFamily: 'Prompt, sans-serif',
    fontWeight: 'bold',
    color: '#0f172a',
    textAlign: 'center'
  },
  {
    id: 'el-cr-detail-org',
    type: 'text',
    content:
      'ณ สถานประกอบการ: {{organization_name}} (ตำแหน่ง: {{position_title}})',
    x: 0,
    y: 432,
    width: 1024,
    fontSize: 13,
    fontFamily: 'Sarabun, sans-serif',
    fontWeight: 'bold',
    color: '#0f172a',
    textAlign: 'center'
  },
  {
    id: 'el-cr-detail-time',
    type: 'text',
    content:
      'ระหว่างวันที่ {{training_period}} (รวมทั้งสิ้น {{total_hours}} ชั่วโมง)',
    x: 0,
    y: 458,
    width: 1024,
    fontSize: 12,
    fontFamily: 'Sarabun, sans-serif',
    fontWeight: 'normal',
    color: '#475569',
    textAlign: 'center'
  },
  {
    id: 'el-cr-detail-grade',
    type: 'variable',
    variableKey: 'evaluation_grade',
    content: 'ด้วยผลการประเมินระดับ {{evaluation_grade}}',
    x: 0,
    y: 486,
    width: 1024,
    fontSize: 14,
    fontFamily: 'Prompt, sans-serif',
    fontWeight: 'bold',
    color: '#047857',
    textAlign: 'center'
  },
  {
    id: 'el-cr-signatures',
    type: 'signature',
    content: 'CERTIFICATE_SIGNATURES',
    x: 100,
    y: 530,
    width: 824,
    height: 90,
    fontSize: 12,
    fontFamily: 'Sarabun, sans-serif',
    fontWeight: 'normal',
    color: '#0f172a',
    textAlign: 'center'
  },
  {
    id: 'el-cr-footer-meta',
    type: 'text',
    content:
      'เลขที่รับรอง: {{doc_number}}  |  ออกให้ ณ วันที่: {{issue_date}}  |  ตรวจสอบความถูกต้อง: verify.mfu.ac.th',
    x: 0,
    y: 645,
    width: 1024,
    fontSize: 10,
    fontFamily: 'Sarabun, sans-serif',
    fontWeight: 'normal',
    color: '#94a3b8',
    textAlign: 'center'
  }
]

// Table data: Document templates with Canva canvas elements
const documents = ref<DocumentTemplateItem[]>(
  isProduction
    ? []
    : [
        {
          id: 'doc-001',
          code: 'DOC-TR-001',
          nameTh: 'ใบบันทึกผลการประเมินการฝึกงาน (Internship Transcript)',
          nameEn: 'Internship Transcript & Competency Report',
          docType: 'pdf',
          description:
            'เอกสารรายงานผลคะแนนสมรรถนะรายหมวด บันทึกเวลาฝึกงาน และลายมือชื่อรับรอง (A4 แนวตั้ง)',
          createdAt: '2026-09-02T10:00:00Z',
          status: 'active',
          backgroundType: 'watermark',
          bgOpacity: 12,
          elements: JSON.parse(JSON.stringify(defaultTranscriptElements))
        },
        {
          id: 'doc-002',
          code: 'DOC-CR-001',
          nameTh: 'ใบประกาศนียบัตรรับรองการฝึกงาน (Certificate of Completion)',
          nameEn: 'Certificate of Professional Internship Completion',
          docType: 'certificate',
          description:
            'เกียรติบัตรรับรองการผ่านการฝึกงานอย่างเป็นทางการ กรอบทองหรูหราพร้อมตรามหาวิทยาลัย (A4 แนวนอน)',
          createdAt: '2026-09-02T10:30:00Z',
          status: 'active',
          backgroundType: 'certificate_pattern',
          bgOpacity: 15,
          elements: JSON.parse(JSON.stringify(defaultCertificateElements))
        },
        {
          id: 'doc-003',
          code: 'DOC-RF-001',
          nameTh: 'หนังสือส่งตัวนักศึกษาฝึกงาน (Internship Referral Letter)',
          nameEn: 'Official Student Internship Referral Letter',
          docType: 'pdf',
          description:
            'หนังสือราชการจากมหาวิทยาลัยส่งตัวนักศึกษาเข้าฝึกงาน ณ สถานประกอบการ',
          createdAt: '2026-09-01T08:00:00Z',
          status: 'inactive',
          backgroundType: 'none',
          bgOpacity: 10,
          elements: []
        }
      ]
)

// Search & Filter state
const searchQuery = ref('')
const statusFilter = ref<'all' | 'active' | 'inactive'>('all')
const typeFilter = ref<'all' | 'pdf' | 'certificate'>('all')

const filteredDocuments = computed(() => {
  return documents.value.filter((doc) => {
    const q = searchQuery.value.toLowerCase().trim()
    const matchesSearch =
      !q ||
      doc.code.toLowerCase().includes(q) ||
      doc.nameTh.toLowerCase().includes(q) ||
      doc.nameEn.toLowerCase().includes(q)

    const matchesStatus =
      statusFilter.value === 'all' || doc.status === statusFilter.value

    const matchesType =
      typeFilter.value === 'all' || doc.docType === typeFilter.value

    return matchesSearch && matchesStatus && matchesType
  })
})

const hasActiveFilters = computed(
  () =>
    !!searchQuery.value.trim() ||
    statusFilter.value !== 'all' ||
    typeFilter.value !== 'all'
)

function resetFilters() {
  searchQuery.value = ''
  statusFilter.value = 'all'
  typeFilter.value = 'all'
  page.value = 1
}

// Pagination (Configurable: 5, 10, 15, 20 items per page)
const page = ref(1)
const pageSize = ref(5)
const paginatedDocuments = computed(() => {
  const start = (page.value - 1) * pageSize.value
  return filteredDocuments.value.slice(start, start + pageSize.value)
})

watch([searchQuery, statusFilter, typeFilter, pageSize], () => {
  page.value = 1
})

// =========================================================================
// CANVA DESIGNER STUDIO STATE
// =========================================================================
const isCanvaStudioOpen = ref(false)
const activeEditingDoc = ref<DocumentTemplateItem | null>(null)
const selectedElementId = ref<string | null>(null)
const canvasScale = ref<number>(0.9) // zoom level
const canvaSidebarTab = ref<
  'variables' | 'text' | 'shapes' | 'tables' | 'elements' | 'background'
>('variables')
const livePreviewMode = ref<'variables' | 'real_data'>('real_data')

// Active dynamic student selection
const activeStudentId = ref<string>('')

const dynamicStudentValues = computed(() => {
  const std = studentsData.value?.items?.find(
    (s) => s.studentId === activeStudentId.value
  )
  const school = schoolsData.value?.items?.find((s) => s.id === std?.schoolId)
  const program = programsData.value?.items?.find(
    (p) => p.id === std?.programId
  )
  const placement = placementsData.value?.items?.find(
    (p) => p.studentId === std?.id || p.studentId === std?.studentId
  )
  const org = orgsData.value?.items?.find(
    (o) => o.id === placement?.organizationId
  )

  let period = '[ยังไม่มีช่วงเวลาฝึกงาน]'
  if (placement?.startsAt && placement?.endsAt) {
    const sDate = new Date(placement.startsAt).toLocaleDateString('th-TH', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    })
    const eDate = new Date(placement.endsAt).toLocaleDateString('th-TH', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    })
    period = `${sDate} ถึง ${eDate}`
  }

  return {
    student_id: std?.studentId || '[ไม่พบรหัสนักศึกษา]',
    student_name_th: std?.name?.th || '[ไม่พบชื่อนักศึกษา]',
    student_name_en: std?.name?.en || '[ไม่พบชื่อภาษาอังกฤษ]',
    school_name: school
      ? `${school.name.th} (${school.name.en})`
      : '[ไม่พบสำนักวิชา]',
    program_name: program
      ? `${program.name.th} (${program.name.en})`
      : '[ไม่พบหลักสูตร]',
    organization_name: org
      ? `${org.name.th} (${org.name.en})`
      : '[ไม่พบสถานประกอบการ]',
    position_title: placement?.positionTitle?.th || '[ไม่พบตำแหน่งฝึกงาน]',
    training_period: period,
    total_hours: '[ยังไม่มีข้อมูลชั่วโมงจากระบบ]',
    evaluation_grade: '[ยังไม่มีผลประเมินจากระบบ]',
    issue_date: '[กำหนดเมื่อออกเอกสารจริง]',
    doc_number: '[กำหนดเลขที่โดยระบบเมื่อออกเอกสารจริง]'
  }
})

// Replace dynamic variables in element content
function renderElementContent(text: string): string {
  if (livePreviewMode.value === 'variables') return text
  const vals = dynamicStudentValues.value
  return text
    .replace(/\{\{student_id\}\}/g, vals.student_id)
    .replace(/\{\{student_name_th\}\}/g, vals.student_name_th)
    .replace(/\{\{student_name_en\}\}/g, vals.student_name_en)
    .replace(/\{\{school_name\}\}/g, vals.school_name)
    .replace(/\{\{program_name\}\}/g, vals.program_name)
    .replace(/\{\{organization_name\}\}/g, vals.organization_name)
    .replace(/\{\{position_title\}\}/g, vals.position_title)
    .replace(/\{\{training_period\}\}/g, vals.training_period)
    .replace(/\{\{total_hours\}\}/g, vals.total_hours)
    .replace(/\{\{evaluation_grade\}\}/g, vals.evaluation_grade)
    .replace(/\{\{issue_date\}\}/g, vals.issue_date)
    .replace(/\{\{doc_number\}\}/g, vals.doc_number)
}

// Available Dynamic Variables Chips
const availableVariables = [
  { key: 'student_id', label: 'รหัสนักศึกษา', tag: '{{student_id}}' },
  {
    key: 'student_name_th',
    label: 'ชื่อ-นามสกุล (ไทย)',
    tag: '{{student_name_th}}'
  },
  {
    key: 'student_name_en',
    label: 'Student Full Name (EN)',
    tag: '{{student_name_en}}'
  },
  { key: 'school_name', label: 'สำนักวิชา', tag: '{{school_name}}' },
  { key: 'program_name', label: 'สาขาวิชา/หลักสูตร', tag: '{{program_name}}' },
  {
    key: 'organization_name',
    label: 'สถานประกอบการ',
    tag: '{{organization_name}}'
  },
  { key: 'position_title', label: 'ตำแหน่งงาน', tag: '{{position_title}}' },
  {
    key: 'training_period',
    label: 'ช่วงเวลาฝึกงาน',
    tag: '{{training_period}}'
  },
  { key: 'total_hours', label: 'จำนวนชั่วโมงรวม', tag: '{{total_hours}}' },
  {
    key: 'evaluation_grade',
    label: 'ผลการประเมิน/เกรด',
    tag: '{{evaluation_grade}}'
  },
  { key: 'issue_date', label: 'วันที่ออกเอกสาร', tag: '{{issue_date}}' },
  { key: 'doc_number', label: 'เลขที่เอกสาร', tag: '{{doc_number}}' }
]

// Format Selection Modal state
const isFormatSelectModalOpen = ref(false)

function openCreateChooser() {
  if (isProduction) {
    showDocumentFeatureUnavailable()
    return
  }
  isFormatSelectModalOpen.value = true
}

function selectFormatAndOpenStudio(type: 'pdf' | 'certificate') {
  if (isProduction) {
    showDocumentFeatureUnavailable()
    return
  }
  isFormatSelectModalOpen.value = false
  if (type === 'certificate') {
    const newDoc: DocumentTemplateItem = {
      id: `doc-${Date.now()}`,
      code: `DOC-CR-${Math.floor(100 + Math.random() * 900)}`,
      nameTh: 'ใบประกาศนียบัตรรับรองการฝึกงาน (Certificate of Completion)',
      nameEn: 'Certificate of Professional Internship Completion',
      docType: 'certificate',
      description:
        'เกียรติบัตรรับรองการผ่านการฝึกงานอย่างเป็นทางการ (A4 แนวนอน)',
      createdAt: new Date().toISOString(),
      status: 'active',
      backgroundType: 'certificate_pattern',
      bgOpacity: 15,
      elements: JSON.parse(JSON.stringify(defaultCertificateElements))
    }
    activeEditingDoc.value = newDoc
  } else {
    const newDoc: DocumentTemplateItem = {
      id: `doc-${Date.now()}`,
      code: `DOC-TR-${Math.floor(100 + Math.random() * 900)}`,
      nameTh: 'ใบบันทึกผลการประเมินการฝึกงาน (Internship Transcript)',
      nameEn: 'Internship Transcript & Competency Report',
      docType: 'pdf',
      description:
        'เอกสารรายงานผลคะแนนสมรรถนะรายหมวด บันทึกเวลาฝึกงาน (A4 แนวตั้ง)',
      createdAt: new Date().toISOString(),
      status: 'active',
      backgroundType: 'watermark',
      bgOpacity: 12,
      elements: JSON.parse(JSON.stringify(defaultTranscriptElements))
    }
    activeEditingDoc.value = newDoc
  }

  selectedElementId.value = activeEditingDoc.value?.elements?.[0]?.id || null
  isCanvaStudioOpen.value = true
}

// Open Canva Studio
function openCanvaStudio(doc?: DocumentTemplateItem) {
  if (isProduction) {
    showDocumentFeatureUnavailable()
    return
  }
  if (doc) {
    activeEditingDoc.value = JSON.parse(JSON.stringify(doc))
    selectedElementId.value = activeEditingDoc.value?.elements?.[0]?.id || null
    isCanvaStudioOpen.value = true
  } else {
    openCreateChooser()
  }
}

// Save Changes from Studio back to documents list
function saveStudioChanges() {
  if (isProduction) {
    showDocumentFeatureUnavailable()
    return
  }
  if (!activeEditingDoc.value) return

  // Enforce single active document PER TYPE rule (PDF มีได้ 1 อัน, Certificate มีได้ 1 อัน)
  if (activeEditingDoc.value.status === 'active') {
    for (const d of documents.value) {
      if (
        d.docType === activeEditingDoc.value.docType &&
        d.id !== activeEditingDoc.value.id
      ) {
        d.status = 'inactive'
      }
    }
  }

  const idx = documents.value.findIndex(
    (d) => d.id === activeEditingDoc.value?.id
  )
  if (idx !== -1) {
    documents.value[idx] = JSON.parse(JSON.stringify(activeEditingDoc.value))
    toast.add({
      title: 'บันทึกฉบับทดลองในหน้าปัจจุบันแล้ว',
      description:
        'การเปลี่ยนแปลงนี้ยังไม่ถูกบันทึกลงฐานข้อมูล และจะหายเมื่อออกจากหน้านี้',
      color: 'warning'
    })
  } else {
    documents.value.unshift(JSON.parse(JSON.stringify(activeEditingDoc.value)))
    toast.add({
      title: 'เพิ่มฉบับทดลองในหน้าปัจจุบันแล้ว',
      description:
        'แม่แบบนี้ยังไม่ถูกบันทึกลงฐานข้อมูล และใช้สร้างเอกสารจริงไม่ได้',
      color: 'warning'
    })
  }

  isCanvaStudioOpen.value = false
}

// Current Selected Element in Studio
const selectedElement = computed(() => {
  return (
    activeEditingDoc.value?.elements.find(
      (el) => el.id === selectedElementId.value
    ) || null
  )
})

// =========================================================================
// LAYERING (Z-INDEX / ARRANGE FORWARD & BACKWARD)
// =========================================================================
function bringToFront() {
  if (!activeEditingDoc.value || !selectedElementId.value) return
  const els = activeEditingDoc.value.elements
  const idx = els.findIndex((el) => el.id === selectedElementId.value)
  if (idx !== -1 && idx < els.length - 1) {
    const [item] = els.splice(idx, 1)
    if (item) {
      els.push(item)
      toast.add({ title: 'นำมาไว้ข้างหน้าสุดแล้ว', color: 'neutral' })
    }
  }
}

function bringForward() {
  if (!activeEditingDoc.value || !selectedElementId.value) return
  const els = activeEditingDoc.value.elements
  const idx = els.findIndex((el) => el.id === selectedElementId.value)
  if (idx !== -1 && idx < els.length - 1) {
    const itemA = els[idx]
    const itemB = els[idx + 1]
    if (itemA && itemB) {
      els[idx] = itemB
      els[idx + 1] = itemA
      toast.add({ title: 'เลื่อนขึ้นข้างหน้า 1 ชั้น', color: 'neutral' })
    }
  }
}

function sendBackward() {
  if (!activeEditingDoc.value || !selectedElementId.value) return
  const els = activeEditingDoc.value.elements
  const idx = els.findIndex((el) => el.id === selectedElementId.value)
  if (idx > 0) {
    const itemA = els[idx]
    const itemB = els[idx - 1]
    if (itemA && itemB) {
      els[idx] = itemB
      els[idx - 1] = itemA
      toast.add({ title: 'เลื่อนลงข้างหลัง 1 ชั้น', color: 'neutral' })
    }
  }
}

function sendToBack() {
  if (!activeEditingDoc.value || !selectedElementId.value) return
  const els = activeEditingDoc.value.elements
  const idx = els.findIndex((el) => el.id === selectedElementId.value)
  if (idx > 0) {
    const [item] = els.splice(idx, 1)
    if (item) {
      els.unshift(item)
      toast.add({ title: 'นำไปไว้ข้างหลังสุดแล้ว', color: 'neutral' })
    }
  }
}

function centerHorizontally() {
  if (!activeEditingDoc.value || !selectedElement.value) return
  const canvasWidth = activeEditingDoc.value.docType === 'pdf' ? 794 : 1024
  const elWidth = selectedElement.value.width || 200
  selectedElement.value.x = Math.round((canvasWidth - elWidth) / 2)
}

function centerVertically() {
  if (!activeEditingDoc.value || !selectedElement.value) return
  const canvasHeight = activeEditingDoc.value.docType === 'pdf' ? 1000 : 724
  const elHeight = selectedElement.value.height || 40
  selectedElement.value.y = Math.round((canvasHeight - elHeight) / 2)
}

// =========================================================================
// SHAPES ADDITION
// =========================================================================
function addShape(
  shape: 'rectangle' | 'rounded' | 'circle' | 'line' | 'star' | 'banner'
) {
  if (!activeEditingDoc.value) return
  let newEl: CanvasElement

  if (shape === 'rectangle') {
    newEl = {
      id: `el-shape-${Date.now()}`,
      type: 'shape',
      shapeType: 'rectangle',
      content: '',
      x: 100,
      y: 200,
      width: 250,
      height: 120,
      bgColor: '#f8fafc',
      borderWidth: 1,
      borderColor: '#cbd5e1',
      borderRadius: 0,
      fontSize: 12,
      fontWeight: 'normal',
      color: '#0f172a',
      textAlign: 'center'
    }
  } else if (shape === 'rounded') {
    newEl = {
      id: `el-shape-${Date.now()}`,
      type: 'shape',
      shapeType: 'rectangle',
      content: '',
      x: 100,
      y: 200,
      width: 280,
      height: 140,
      bgColor: '#f1f5f9',
      borderWidth: 1,
      borderColor: '#94a3b8',
      borderRadius: 14,
      fontSize: 12,
      fontWeight: 'normal',
      color: '#0f172a',
      textAlign: 'center'
    }
  } else if (shape === 'circle') {
    newEl = {
      id: `el-shape-${Date.now()}`,
      type: 'shape',
      shapeType: 'circle',
      content: '',
      x: 150,
      y: 200,
      width: 100,
      height: 100,
      bgColor: '#fef3c7',
      borderWidth: 2,
      borderColor: '#f59e0b',
      borderRadius: 9999,
      fontSize: 12,
      fontWeight: 'normal',
      color: '#b45309',
      textAlign: 'center'
    }
  } else if (shape === 'line') {
    newEl = {
      id: `el-shape-${Date.now()}`,
      type: 'shape',
      shapeType: 'line',
      content: '',
      x: 60,
      y: 240,
      width: 674,
      height: 2,
      bgColor: '#cbd5e1',
      borderWidth: 0,
      fontSize: 12,
      fontWeight: 'normal',
      color: '#cbd5e1',
      textAlign: 'center'
    }
  } else if (shape === 'banner') {
    newEl = {
      id: `el-shape-${Date.now()}`,
      type: 'shape',
      shapeType: 'rectangle',
      content: 'ป้ายเน้นข้อความ (Accent Banner)',
      x: 60,
      y: 200,
      width: 674,
      height: 36,
      bgColor: '#0f172a',
      color: '#ffffff',
      fontSize: 13,
      fontWeight: 'bold',
      borderRadius: 4,
      padding: 8,
      textAlign: 'center'
    }
  } else {
    // Star shape
    newEl = {
      id: `el-shape-${Date.now()}`,
      type: 'shape',
      shapeType: 'star',
      content: '★',
      x: 200,
      y: 200,
      width: 64,
      height: 64,
      fontSize: 48,
      color: '#f59e0b',
      fontWeight: 'bold',
      textAlign: 'center'
    }
  }

  activeEditingDoc.value.elements.push(newEl)
  selectedElementId.value = newEl.id
  toast.add({ title: 'เพิ่มรูปทรงเรียบร้อยแล้ว', color: 'success' })
}

// =========================================================================
// CUSTOM TABLES ADDITION
// =========================================================================
function addCustomTable(preset: 'competency' | 'hours_log' | 'blank_3x3') {
  if (!activeEditingDoc.value) return
  let tableData: TableData

  if (preset === 'hours_log') {
    tableData = {
      headers: [
        'ลำดับ',
        'วัน/เดือน/ปี',
        'กิจกรรมการฝึกงาน',
        'จำนวน ชม.',
        'ลายมือชื่อผู้คุม'
      ],
      rows: [
        [
          '1',
          '1 มิ.ย. 2569',
          'ปฐมนิเทศและรับมอบหมายระบบงาน',
          '8.0',
          '....................'
        ],
        [
          '2',
          '2 มิ.ย. 2569',
          'วิเคราะห์ความต้องการและการออกแบบ UI',
          '8.0',
          '....................'
        ],
        [
          '3',
          '3 มิ.ย. 2569',
          'พัฒนา REST API และเชื่อมต่อ Database',
          '8.0',
          '....................'
        ]
      ]
    }
  } else if (preset === 'blank_3x3') {
    tableData = {
      headers: ['หัวข้อคอลัมน์ 1', 'หัวข้อคอลัมน์ 2', 'หัวข้อคอลัมน์ 3'],
      rows: [
        ['แถวที่ 1 ข้อมูล A', 'แถวที่ 1 ข้อมูล B', 'แถวที่ 1 ข้อมูล C'],
        ['แถวที่ 2 ข้อมูล A', 'แถวที่ 2 ข้อมูล B', 'แถวที่ 2 ข้อมูล C']
      ]
    }
  } else {
    tableData = {
      headers: ['หมวดสมรรถนะ', 'เกณฑ์', 'คะแนน', 'ผลประเมิน'],
      rows: [
        ['1. ทักษะทั่วไปและการสื่อสาร', '5.00', '4.80', 'ผ่านเกณฑ์'],
        ['2. ทักษะวิชาชีพและการปฏิบัติงาน', '5.00', '4.90', 'ผ่านเกณฑ์ดีเยี่ยม']
      ]
    }
  }

  const newTableEl: CanvasElement = {
    id: `el-tbl-${Date.now()}`,
    type: 'custom_table',
    content: 'CUSTOM_TABLE',
    tableData,
    x: 60,
    y: 400,
    width: 674,
    fontSize: 11,
    fontFamily: 'Sarabun, sans-serif',
    fontWeight: 'normal',
    color: '#0f172a',
    textAlign: 'left'
  }

  activeEditingDoc.value.elements.push(newTableEl)
  selectedElementId.value = newTableEl.id
  toast.add({ title: 'เพิ่มตารางลงในเอกสารเรียบร้อยแล้ว', color: 'success' })
}

function addTableRow() {
  if (!selectedElement.value?.tableData) return
  const cols = selectedElement.value.tableData.headers.length
  const newRow = Array(cols).fill('ข้อมูลใหม่')
  selectedElement.value.tableData.rows.push(newRow)
}

function addTableColumn() {
  if (!selectedElement.value?.tableData) return
  const colNum = selectedElement.value.tableData.headers.length + 1
  selectedElement.value.tableData.headers.push(`หัวข้อ ${colNum}`)
  for (const row of selectedElement.value.tableData.rows) {
    row.push('-')
  }
}

function removeTableRow(idx: number) {
  if (!selectedElement.value?.tableData) return
  selectedElement.value.tableData.rows.splice(idx, 1)
}

// Text & Variable elements addition
function addVariableElement(vKey: string, vTag: string) {
  if (!activeEditingDoc.value) return
  const newEl: CanvasElement = {
    id: `el-var-${Date.now()}`,
    type: 'variable',
    variableKey: vKey,
    content: vTag,
    x: 100,
    y: 200,
    width: 400,
    fontSize: 14,
    fontFamily: 'Prompt, sans-serif',
    fontWeight: 'bold',
    color: '#0f172a',
    textAlign: 'left'
  }
  activeEditingDoc.value.elements.push(newEl)
  selectedElementId.value = newEl.id
  toast.add({
    title: 'เพิ่มตัวแปรสำเร็จ',
    description: `เพิ่มตัวแปร ${vTag} ลงบนเอกสารแล้ว`,
    color: 'success'
  })
}

function addTextElement(type: 'heading' | 'subheading' | 'body') {
  if (!activeEditingDoc.value) return
  const newEl: CanvasElement = {
    id: `el-txt-${Date.now()}`,
    type: 'text',
    content:
      type === 'heading'
        ? 'หัวข้อเอกสาร (Heading)'
        : type === 'subheading'
          ? 'หัวข้อย่อย (Subheading)'
          : 'ข้อความรายละเอียดเพิ่มเติมพิมพ์ที่นี่...',
    x: 100,
    y: 220,
    width: type === 'heading' ? 600 : 400,
    fontSize: type === 'heading' ? 24 : type === 'subheading' ? 16 : 12,
    fontFamily:
      type === 'heading' ? 'Prompt, sans-serif' : 'Sarabun, sans-serif',
    fontWeight: type === 'heading' ? 'bold' : 'normal',
    color: '#0f172a',
    textAlign: 'left'
  }
  activeEditingDoc.value.elements.push(newEl)
  selectedElementId.value = newEl.id
}

function duplicateSelectedElement() {
  if (!activeEditingDoc.value || !selectedElement.value) return
  const copy: CanvasElement = {
    ...JSON.parse(JSON.stringify(selectedElement.value)),
    id: `el-copy-${Date.now()}`,
    x: selectedElement.value.x + 20,
    y: selectedElement.value.y + 20
  }
  activeEditingDoc.value.elements.push(copy)
  selectedElementId.value = copy.id
}

function deleteSelectedElement() {
  if (!activeEditingDoc.value || !selectedElementId.value) return
  activeEditingDoc.value.elements = activeEditingDoc.value.elements.filter(
    (el) => el.id !== selectedElementId.value
  )
  selectedElementId.value = null
}

// Drag & Drop Handling on Canvas
let isDragging = false
let startMouseX = 0
let startMouseY = 0
let startElemX = 0
let startElemY = 0

function handleElementMouseDown(e: MouseEvent, el: CanvasElement) {
  e.stopPropagation()
  selectedElementId.value = el.id
  isDragging = true
  startMouseX = e.clientX
  startMouseY = e.clientY
  startElemX = el.x
  startElemY = el.y

  window.addEventListener('mousemove', handleWindowMouseMove)
  window.addEventListener('mouseup', handleWindowMouseUp)
}

function handleWindowMouseMove(e: MouseEvent) {
  if (!isDragging || !selectedElement.value) return
  const scale = canvasScale.value || 1
  const dx = (e.clientX - startMouseX) / scale
  const dy = (e.clientY - startMouseY) / scale

  selectedElement.value.x = Math.round(startElemX + dx)
  selectedElement.value.y = Math.round(startElemY + dy)
}

function handleWindowMouseUp() {
  isDragging = false
  window.removeEventListener('mousemove', handleWindowMouseMove)
  window.removeEventListener('mouseup', handleWindowMouseUp)
}

// Background Image Upload for Studio
function handleStudioBgUpload(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  if (!file || !activeEditingDoc.value) return

  const reader = new FileReader()
  reader.onload = (e) => {
    if (activeEditingDoc.value) {
      activeEditingDoc.value.customBgUrl = e.target?.result as string
      activeEditingDoc.value.backgroundType = 'custom'
    }
  }
  reader.readAsDataURL(file)
}

// Quick Actions in Table: Enforce single active document PER TYPE rule
function handleToggleStatus(doc: DocumentTemplateItem) {
  if (isProduction) {
    showDocumentFeatureUnavailable()
    return
  }
  if (doc.status === 'active') {
    doc.status = 'inactive'
    toast.add({
      title: 'ปิดใช้งานแม่แบบ',
      description: `ปิดการใช้งาน ${doc.nameTh} เรียบร้อยแล้ว`,
      color: 'neutral'
    })
    return
  }

  // Deactivate other templates OF THE SAME TYPE so only 1 template is active per type!
  for (const item of documents.value) {
    if (item.docType === doc.docType && item.id !== doc.id) {
      item.status = 'inactive'
    }
  }
  doc.status = 'active'
  const typeLabel =
    doc.docType === 'pdf'
      ? 'PDF (ใบบันทึกผล)'
      : 'Certification (ใบประกาศนียบัตร)'
  toast.add({
    title: 'เปลี่ยนสถานะฉบับทดลองแล้ว',
    description: `การเปลี่ยนสถานะ "${doc.nameTh}" มีผลเฉพาะในหน้านี้ และยังไม่ใช่สถานะใช้งานจริง (${typeLabel})`,
    color: 'warning'
  })
}

function handleDeleteDocument(doc: DocumentTemplateItem) {
  if (isProduction) {
    showDocumentFeatureUnavailable()
    return
  }
  documents.value = documents.value.filter((d) => d.id !== doc.id)
  toast.add({
    title: 'นำออกจากรายการฉบับทดลองแล้ว',
    description: `การนำ ${doc.nameTh} ออกจากรายการมีผลเฉพาะในหน้านี้ ไม่ได้ลบข้อมูลในระบบ`,
    color: 'warning'
  })
}
</script>

<template>
  <div class="space-y-6">
    <UAlert
      :color="isProduction ? 'error' : 'warning'"
      :icon="isProduction ? 'i-lucide-circle-alert' : 'i-lucide-flask-conical'"
      :title="
        isProduction
          ? 'ระบบจัดการแม่แบบและออกเอกสารยังไม่พร้อมใช้งานใน Production'
          : 'โหมดตัวอย่าง Development — ข้อมูลและการแก้ไขไม่ถูกบันทึกลงระบบ'
      "
      :description="
        isProduction
          ? 'หน้า Designer นี้ยังไม่เชื่อมต่อการบันทึกแม่แบบและการออก PDF ผ่าน API จึงปิดการสร้าง แก้ไข และพิมพ์เอกสารจริงไว้'
          : 'แม่แบบในหน้านี้เป็นข้อมูลตัวอย่าง การพิมพ์ถูกปิดไว้ และการแก้ไขจะหายเมื่อออกจากหน้านี้'
      "
      variant="soft"
    />

    <!-- Top Action Header -->
    <div
      class="no-print flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between"
    >
      <div>
        <h1 class="text-2xl font-bold tracking-tight text-highlighted">
          รายการเอกสารและระบบออกแบบแม่แบบ
        </h1>
        <p class="mt-1 text-sm text-muted">
          จัดวางคอมโพเนนต์ รูปทรง ตาราง ข้อความ และตัวแปรไดนามิกสไตล์ Canva
        </p>
      </div>

      <UButton
        color="primary"
        icon="i-lucide-plus"
        label="สร้างเอกสารใหม่"
        size="lg"
        :disabled="isProduction"
        @click="openCreateChooser"
      />
    </div>

    <!-- Filters & Search Card -->
    <div
      class="no-print rounded-xl border border-default bg-default p-4 shadow-sm space-y-3"
    >
      <div class="flex flex-col gap-3 md:flex-row md:items-center">
        <!-- Search Input with Clear Button -->
        <div class="relative flex-1">
          <UInput
            v-model="searchQuery"
            class="w-full"
            icon="i-lucide-search"
            placeholder="ค้นหารหัส หรือชื่อเอกสาร (ไทย / English)..."
            size="md"
          >
            <template #trailing>
              <button
                v-if="searchQuery"
                type="button"
                class="text-muted hover:text-highlighted cursor-pointer p-0.5"
                title="ล้างคำค้นหา"
                @click="searchQuery = ''"
              >
                <UIcon name="i-lucide-x" class="size-4" />
              </button>
            </template>
          </UInput>
        </div>

        <div class="flex flex-wrap items-center gap-2.5">
          <div class="flex items-center gap-1.5">
            <label
              for="doc-type-filter"
              class="text-xs font-semibold text-muted whitespace-nowrap"
              >รูปแบบ:</label
            >
            <select
              id="doc-type-filter"
              v-model="typeFilter"
              class="rounded-lg border border-default bg-default px-3 py-2 text-xs text-highlighted focus:outline-none focus:ring-1 focus:ring-primary font-medium"
            >
              <option value="all">ทุกรูปแบบ</option>
              <option value="pdf">PDF (ใบบันทึกผล)</option>
              <option value="certificate">Certification (ใบประกาศ)</option>
            </select>
          </div>

          <div class="flex items-center gap-1.5">
            <label
              for="doc-status-filter"
              class="text-xs font-semibold text-muted whitespace-nowrap"
              >สถานะ:</label
            >
            <select
              id="doc-status-filter"
              v-model="statusFilter"
              class="rounded-lg border border-default bg-default px-3 py-2 text-xs text-highlighted focus:outline-none focus:ring-1 focus:ring-primary font-medium"
            >
              <option value="all">ทุกสถานะ</option>
              <option value="active">ใช้งาน (Active)</option>
              <option value="inactive">ไม่ใช้งาน (Inactive)</option>
            </select>
          </div>
        </div>
      </div>

      <!-- Filter Summary & Reset Bar -->
      <div
        class="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-default/70 text-xs text-muted"
      >
        <div class="flex items-center gap-2">
          <span
            class="inline-flex items-center gap-1.5 font-medium text-highlighted"
          >
            <UIcon name="i-lucide-filter" class="size-3.5 text-primary" />
            <span>ผลการกรอง:</span>
            <span class="font-bold text-primary">{{
              filteredDocuments.length
            }}</span>
            รายการ
          </span>
          <span
            v-if="documents.length > filteredDocuments.length"
            class="text-muted"
          >
            (จากทั้งหมด {{ documents.length }} รายการ)
          </span>
        </div>

        <button
          v-if="hasActiveFilters"
          type="button"
          class="inline-flex items-center gap-1 font-medium text-primary hover:underline cursor-pointer"
          @click="resetFilters"
        >
          <UIcon name="i-lucide-rotate-ccw" class="size-3.5" />
          <span>ล้างตัวกรองทั้งหมด</span>
        </button>
      </div>

      <div
        class="flex flex-col gap-2 border-t border-dashed border-default/60 pt-2.5 text-xs text-muted sm:flex-row sm:items-center sm:justify-between"
      >
        <div class="flex items-center gap-1.5">
          <UIcon name="i-lucide-info" class="size-4 text-primary shrink-0" />
          <span>
            ข้อกำหนดระบบ: แต่ละประเภทเอกสาร (PDF และ Certification)
            สามารถมีแม่แบบสถานะ
            <strong class="text-highlighted"
              >&quot;ใช้งาน&quot; ได้เพียงประเภทละ 1 ฉบับเท่านั้น</strong
            >
          </span>
        </div>
        <div class="flex flex-wrap items-center gap-3 text-[11px] font-mono">
          <span
            class="inline-flex items-center gap-1.5 rounded-md bg-rose-50 px-2 py-0.5 text-rose-700 ring-1 ring-rose-200 dark:bg-rose-950/40 dark:text-rose-400"
          >
            <span class="size-1.5 rounded-full bg-rose-500"></span>
            PDF หลัก:
            <strong>{{
              documents.find(
                (d) => d.docType === 'pdf' && d.status === 'active'
              )?.code || 'ไม่มี'
            }}</strong>
          </span>
          <span
            class="inline-flex items-center gap-1.5 rounded-md bg-amber-50 px-2 py-0.5 text-amber-700 ring-1 ring-amber-200 dark:bg-amber-950/40 dark:text-amber-400"
          >
            <span class="size-1.5 rounded-full bg-amber-500"></span>
            Certification หลัก:
            <strong>{{
              documents.find(
                (d) => d.docType === 'certificate' && d.status === 'active'
              )?.code || 'ไม่มี'
            }}</strong>
          </span>
        </div>
      </div>
    </div>

    <!-- Documents Main Table -->
    <UCard :ui="{ body: 'p-0 sm:p-0' }" class="no-print">
      <div class="overflow-x-auto">
        <table class="data-table">
          <thead>
            <tr>
              <th class="w-36">รูปแบบเอกสาร</th>
              <th class="w-32">รหัสเอกสาร</th>
              <th>ชื่อเอกสาร</th>
              <th class="w-40">พื้นหลังแม่แบบ</th>
              <th class="w-36">วันที่สร้าง</th>
              <th class="w-28 text-center">สถานะ</th>
              <th class="w-24 text-right">การจัดการ</th>
            </tr>
          </thead>
          <tbody>
            <tr v-if="filteredDocuments.length === 0">
              <td colspan="7" class="py-12 text-center text-muted">
                <UIcon
                  name="i-lucide-file-x"
                  class="mx-auto mb-2 size-8 text-muted"
                />
                <p class="font-medium">ไม่พบเอกสารตามเงื่อนไขที่ค้นหา</p>
                <p class="text-xs">
                  คลิกปุ่ม &quot;สร้างเอกสารใหม่&quot; ด้านบนเพื่อเปิด Canva
                  Studio
                </p>
              </td>
            </tr>

            <tr v-for="doc in paginatedDocuments" :key="doc.id">
              <!-- Column 1: รูปแบบเอกสาร -->
              <td>
                <div class="flex items-center gap-2.5">
                  <span
                    class="grid size-9 shrink-0 place-items-center rounded-lg"
                    :class="
                      doc.docType === 'pdf'
                        ? 'bg-rose-50 text-rose-600 ring-1 ring-rose-200 dark:bg-rose-950/40 dark:text-rose-400 dark:ring-rose-800'
                        : 'bg-amber-50 text-amber-600 ring-1 ring-amber-200 dark:bg-amber-950/40 dark:text-amber-400 dark:ring-amber-800'
                    "
                  >
                    <UIcon
                      :name="
                        doc.docType === 'pdf'
                          ? 'i-lucide-file-text'
                          : 'i-lucide-award'
                      "
                      class="size-5"
                    />
                  </span>
                  <div>
                    <span class="block text-xs font-bold text-highlighted">
                      {{ doc.docType === 'pdf' ? 'PDF' : 'Certification' }}
                    </span>
                    <span class="block text-[11px] text-muted">
                      {{
                        doc.docType === 'pdf' ? 'ใบบันทึกผล' : 'ใบประกาศนียบัตร'
                      }}
                    </span>
                  </div>
                </div>
              </td>

              <!-- Column 2: รหัสเอกสาร -->
              <td class="font-mono text-xs font-bold text-highlighted">
                {{ doc.code }}
              </td>

              <!-- Column 3: ชื่อเอกสาร -->
              <td>
                <div>
                  <p class="font-medium text-highlighted">{{ doc.nameTh }}</p>
                  <p v-if="doc.nameEn" class="text-xs text-muted">
                    {{ doc.nameEn }}
                  </p>
                  <p
                    v-if="doc.description"
                    class="mt-0.5 line-clamp-1 text-[11px] text-muted/80"
                  >
                    {{ doc.description }}
                  </p>
                </div>
              </td>

              <!-- Column 4: พื้นหลังแม่แบบ -->
              <td>
                <div class="flex items-center gap-1.5 text-xs">
                  <span
                    class="size-2 rounded-full"
                    :class="{
                      'bg-amber-500': doc.backgroundType === 'watermark',
                      'bg-indigo-500':
                        doc.backgroundType === 'certificate_pattern',
                      'bg-emerald-500': doc.backgroundType === 'geometric',
                      'bg-purple-500': doc.backgroundType === 'custom',
                      'bg-slate-300 dark:bg-slate-700':
                        doc.backgroundType === 'none'
                    }"
                  ></span>
                  <span class="font-medium text-highlighted">
                    {{
                      doc.backgroundType === 'watermark'
                        ? 'ตราลายน้ำ มฟล.'
                        : doc.backgroundType === 'certificate_pattern'
                          ? 'ลายเกียรติบัตร'
                          : doc.backgroundType === 'geometric'
                            ? 'ลายเรขาคณิต'
                            : doc.backgroundType === 'custom'
                              ? 'รูปภาพกำหนดเอง'
                              : 'ไม่มีพื้นหลัง'
                    }}
                  </span>
                  <span
                    v-if="doc.backgroundType !== 'none'"
                    class="text-[10px] text-muted"
                  >
                    ({{ doc.bgOpacity }}%)
                  </span>
                </div>
              </td>

              <!-- Column 5: วันที่สร้าง -->
              <td class="text-xs text-muted">
                {{
                  new Date(doc.createdAt).toLocaleDateString('th-TH', {
                    year: 'numeric',
                    month: 'short',
                    day: 'numeric'
                  })
                }}
              </td>

              <!-- Column 6: สถานะใช้งาน / ไม่ใช้งาน (มีได้เพียงฉบับเดียว) -->
              <td class="text-center">
                <button
                  type="button"
                  class="inline-flex items-center gap-1 transition-all focus:outline-none"
                  :title="
                    doc.status === 'active'
                      ? 'เอกสารนี้กำลังเป็นเอกสารหลักที่เปิดใช้งาน (คลิกเพื่อปิด)'
                      : 'คลิกเพื่อตั้งค่าเป็นเอกสารหลักที่ใช้งานเพียงฉบับเดียว'
                  "
                  @click="handleToggleStatus(doc)"
                >
                  <UBadge
                    v-if="doc.status === 'active'"
                    color="success"
                    size="sm"
                    variant="subtle"
                    class="cursor-pointer font-bold ring-1 ring-success/40 hover:ring-2 hover:ring-success transition-all"
                  >
                    <UIcon name="i-lucide-check" class="size-3.5 mr-0.5" />
                    ใช้งาน (หลัก)
                  </UBadge>
                  <UBadge
                    v-else
                    color="neutral"
                    size="sm"
                    variant="subtle"
                    class="cursor-pointer opacity-70 hover:opacity-100 hover:border-primary transition-all"
                  >
                    ไม่ใช้งาน
                  </UBadge>
                </button>
              </td>

              <!-- Column 7: การจัดการ -->
              <td class="text-right">
                <div class="flex items-center justify-end">
                  <UDropdownMenu
                    :items="[
                      [
                        {
                          label: 'จัดวางและแก้ไข (Canva Studio)',
                          icon: 'i-lucide-layout-template',
                          onSelect: () => openCanvaStudio(doc)
                        },
                        {
                          label: 'ดูตัวอย่างและพิมพ์เอกสาร',
                          icon: 'i-lucide-printer',
                          onSelect: () => {
                            openCanvaStudio(doc)
                            livePreviewMode = 'real_data'
                          }
                        }
                      ],
                      [
                        {
                          label:
                            doc.status === 'active'
                              ? 'ปิดใช้งาน'
                              : 'เปิดใช้งาน',
                          icon:
                            doc.status === 'active'
                              ? 'i-lucide-ban'
                              : 'i-lucide-check',
                          color: doc.status === 'active' ? 'error' : 'success',
                          onSelect: () => handleToggleStatus(doc)
                        },
                        {
                          label: 'ลบเอกสาร',
                          icon: 'i-lucide-trash-2',
                          color: 'error',
                          onSelect: () => handleDeleteDocument(doc)
                        }
                      ]
                    ]"
                    :content="{ align: 'end' }"
                  >
                    <UButton
                      aria-label="การจัดการเอกสาร"
                      color="neutral"
                      icon="i-lucide-ellipsis-vertical"
                      size="sm"
                      variant="ghost"
                      class="!rounded-full size-8 p-0 flex items-center justify-center cursor-pointer hover:bg-muted/60"
                    />
                  </UDropdownMenu>
                </div>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <AppPagination
        v-model:page="page"
        v-model:page-size="pageSize"
        :total="filteredDocuments.length"
        items-name="เอกสาร"
      />
    </UCard>

    <!-- ================================================================= -->
    <!-- MODAL: SELECT DOCUMENT FORMAT (PDF VS CERTIFICATE)                -->
    <!-- ================================================================= -->
    <div
      v-if="isFormatSelectModalOpen"
      class="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"
      @click="isFormatSelectModalOpen = false"
    >
      <div
        class="w-full max-w-2xl rounded-2xl border border-default bg-default p-6 shadow-2xl space-y-6"
        @click.stop
      >
        <div
          class="flex items-center justify-between border-b border-default pb-4"
        >
          <div>
            <h2 class="text-xl font-bold text-highlighted">
              เลือกประเภทเอกสารที่ต้องการสร้าง
            </h2>
            <p class="text-xs text-muted mt-1">
              เลือกรูปแบบเอกสารเริ่มต้นเพื่อเปิดสตูดิโอออกแบบสไตล์ Canva
            </p>
          </div>
          <UButton
            color="neutral"
            icon="i-lucide-x"
            size="sm"
            variant="ghost"
            @click="isFormatSelectModalOpen = false"
          />
        </div>

        <!-- 2 Format Cards -->
        <div class="grid grid-cols-1 gap-5 sm:grid-cols-2">
          <!-- Card 1: PDF Transcript -->
          <div
            class="group relative flex flex-col justify-between rounded-xl border-2 border-default bg-default p-5 transition-all hover:border-primary hover:bg-primary/5 cursor-pointer shadow-sm hover:shadow-md"
            @click="selectFormatAndOpenStudio('pdf')"
          >
            <div>
              <div class="flex items-center justify-between mb-3">
                <span
                  class="grid size-12 place-items-center rounded-xl bg-rose-50 text-rose-600 ring-1 ring-rose-200 dark:bg-rose-950/40 dark:text-rose-400"
                >
                  <UIcon name="i-lucide-file-text" class="size-6" />
                </span>
                <UBadge
                  color="primary"
                  label="A4 แนวตั้ง (Portrait)"
                  size="xs"
                  variant="subtle"
                />
              </div>
              <h3
                class="text-base font-bold text-highlighted group-hover:text-primary transition-colors"
              >
                สร้างเอกสาร PDF
              </h3>
              <p class="text-xs font-medium text-muted mt-0.5">
                ใบบันทึกผลการฝึกงาน (Transcript & Report)
              </p>
              <ul class="mt-4 space-y-2 text-xs text-muted">
                <li class="flex items-center gap-2">
                  <UIcon
                    name="i-lucide-check"
                    class="size-4 text-emerald-500 shrink-0"
                  />
                  <span>หัวกระดาษทางการ มหาวิทยาลัยแม่ฟ้าหลวง</span>
                </li>
                <li class="flex items-center gap-2">
                  <UIcon
                    name="i-lucide-check"
                    class="size-4 text-emerald-500 shrink-0"
                  />
                  <span>ข้อมูลนักศึกษา & สถานประกอบการ</span>
                </li>
                <li class="flex items-center gap-2">
                  <UIcon
                    name="i-lucide-check"
                    class="size-4 text-emerald-500 shrink-0"
                  />
                  <span>ตารางสรุปผลคะแนนสมรรถนะประเมิน</span>
                </li>
                <li class="flex items-center gap-2">
                  <UIcon
                    name="i-lucide-check"
                    class="size-4 text-emerald-500 shrink-0"
                  />
                  <span>กล่องลงนามคู่ และลายน้ำ มฟล.</span>
                </li>
              </ul>
            </div>

            <div class="mt-6 pt-3 border-t border-default/60">
              <UButton
                block
                color="primary"
                icon="i-lucide-layout-template"
                label="เลือกและเริ่มออกแบบ PDF"
                @click.stop="selectFormatAndOpenStudio('pdf')"
              />
            </div>
          </div>

          <!-- Card 2: Certificate -->
          <div
            class="group relative flex flex-col justify-between rounded-xl border-2 border-default bg-default p-5 transition-all hover:border-amber-500 hover:bg-amber-500/5 cursor-pointer shadow-sm hover:shadow-md"
            @click="selectFormatAndOpenStudio('certificate')"
          >
            <div>
              <div class="flex items-center justify-between mb-3">
                <span
                  class="grid size-12 place-items-center rounded-xl bg-amber-50 text-amber-600 ring-1 ring-amber-200 dark:bg-amber-950/40 dark:text-amber-400"
                >
                  <UIcon name="i-lucide-award" class="size-6" />
                </span>
                <UBadge
                  color="warning"
                  label="A4 แนวนอน (Landscape)"
                  size="xs"
                  variant="subtle"
                />
              </div>
              <h3
                class="text-base font-bold text-highlighted group-hover:text-amber-600 transition-colors"
              >
                สร้างใบ Certificate
              </h3>
              <p class="text-xs font-medium text-muted mt-0.5">
                ใบประกาศนียบัตรรับรองการฝึกงาน
              </p>
              <ul class="mt-4 space-y-2 text-xs text-muted">
                <li class="flex items-center gap-2">
                  <UIcon
                    name="i-lucide-check"
                    class="size-4 text-amber-500 shrink-0"
                  />
                  <span>กรอบคู่ลวดลายทองหรูหรา (Ornate Gold Border)</span>
                </li>
                <li class="flex items-center gap-2">
                  <UIcon
                    name="i-lucide-check"
                    class="size-4 text-amber-500 shrink-0"
                  />
                  <span>ตราสัญลักษณ์มหาวิทยาลัยสีทอง</span>
                </li>
                <li class="flex items-center gap-2">
                  <UIcon
                    name="i-lucide-check"
                    class="size-4 text-amber-500 shrink-0"
                  />
                  <span>ข้อความรับรองเกียรติบัตรการฝึกงาน</span>
                </li>
                <li class="flex items-center gap-2">
                  <UIcon
                    name="i-lucide-check"
                    class="size-4 text-amber-500 shrink-0"
                  />
                  <span>ช่องลงนามคณบดีและผู้แทนสถานประกอบการ</span>
                </li>
              </ul>
            </div>

            <div class="mt-6 pt-3 border-t border-default/60">
              <UButton
                block
                color="warning"
                icon="i-lucide-award"
                label="เลือกและเริ่มออกแบบ Certificate"
                @click.stop="selectFormatAndOpenStudio('certificate')"
              />
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- ================================================================= -->
    <!-- CANVA-LIKE DOCUMENT DESIGNER STUDIO (FULL MODAL)                   -->
    <!-- ================================================================= -->
    <div
      v-if="isCanvaStudioOpen && activeEditingDoc"
      class="fixed inset-0 z-50 flex flex-col bg-slate-950 text-slate-100"
    >
      <!-- Studio Header -->
      <div
        class="no-print flex h-16 shrink-0 items-center justify-between border-b border-slate-800 bg-slate-900/95 px-5 backdrop-blur-md"
      >
        <!-- Document Meta Info -->
        <div class="flex items-center gap-3 min-w-0 max-w-2xl">
          <span
            class="grid size-9 shrink-0 place-items-center rounded-lg bg-primary text-inverted"
          >
            <UIcon name="i-lucide-layout-template" class="size-5" />
          </span>
          <div class="min-w-0 flex-1">
            <div class="flex items-center gap-2">
              <input
                v-model="activeEditingDoc.nameTh"
                class="bg-transparent text-base font-bold text-white border-b border-transparent hover:border-slate-700 focus:border-primary focus:outline-none transition-all"
                :style="{
                  width: `${Math.max(26, (activeEditingDoc.nameTh?.length || 10) + 3)}ch`,
                  minWidth: '320px',
                  maxWidth: '580px',
                  fieldSizing: 'content'
                }"
                placeholder="ชื่อเทมเพลตเอกสาร..."
                title="คลิกเพื่อแก้ไขชื่อเอกสาร"
              />
              <UBadge
                :color="
                  activeEditingDoc.docType === 'pdf' ? 'primary' : 'warning'
                "
                :label="
                  activeEditingDoc.docType === 'pdf'
                    ? 'A4 แนวตั้ง'
                    : 'A4 แนวนอน'
                "
                size="xs"
                class="shrink-0"
              />
            </div>
            <p class="text-[11px] text-slate-400 truncate">
              รหัส: {{ activeEditingDoc.code }} • คลิกเพื่อลากจัดวางตำแหน่งอิสระ
            </p>
          </div>
        </div>

        <!-- Student Dynamic Preview Switcher & Mode Toggle -->
        <div class="flex items-center gap-3">
          <div
            class="flex items-center gap-1.5 rounded-lg bg-slate-800 p-1 text-xs"
          >
            <span class="pl-2 text-slate-400">จำลองนักศึกษา:</span>
            <select
              v-model="activeStudentId"
              class="h-7 rounded border-none bg-slate-900 px-2 text-xs font-semibold text-white focus:outline-none"
            >
              <option
                v-for="std in studentsData?.items"
                :key="std.id"
                :value="std.studentId"
              >
                {{ std.studentId }} - {{ std.name.th }}
              </option>
            </select>
          </div>

          <!-- Mode Toggle: Variables vs Real Data -->
          <div
            class="flex items-center rounded-lg bg-slate-800 p-1 text-xs font-semibold"
          >
            <button
              type="button"
              class="rounded px-2.5 py-1 transition-all"
              :class="
                livePreviewMode === 'real_data'
                  ? 'bg-emerald-600 text-white shadow-sm'
                  : 'text-slate-400 hover:text-white'
              "
              @click="livePreviewMode = 'real_data'"
            >
              👁️ ข้อมูลจริง
            </button>
            <button
              type="button"
              class="rounded px-2.5 py-1 transition-all"
              :class="
                livePreviewMode === 'variables'
                  ? 'bg-primary text-white shadow-sm'
                  : 'text-slate-400 hover:text-white'
              "
              @click="livePreviewMode = 'variables'"
            >
              { } ตัวแปร
            </button>
          </div>

          <!-- Zoom Slider -->
          <div class="flex items-center gap-1.5 text-xs text-slate-400">
            <span>ซูม:</span>
            <input
              v-model.number="canvasScale"
              type="range"
              min="0.5"
              max="1.3"
              step="0.05"
              class="w-20 accent-primary cursor-pointer"
            />
            <span class="font-mono text-white"
              >{{ Math.round(canvasScale * 100) }}%</span
            >
          </div>

          <!-- Action Buttons -->
          <UButton
            color="neutral"
            icon="i-lucide-printer"
            label="PDF ยังไม่พร้อมออก"
            variant="outline"
            disabled
          />

          <UButton
            color="primary"
            icon="i-lucide-save"
            label="บันทึกเทมเพลต"
            @click="saveStudioChanges"
          />

          <UButton
            color="neutral"
            icon="i-lucide-x"
            size="sm"
            variant="ghost"
            @click="isCanvaStudioOpen = false"
          />
        </div>
      </div>

      <!-- Studio Canva Toolbar (Font, Layering, Shapes, Alignment) -->
      <div
        class="no-print flex h-14 shrink-0 flex-wrap items-center justify-between border-b border-slate-800/80 bg-slate-900/80 px-5 text-xs"
      >
        <div v-if="selectedElement" class="flex flex-wrap items-center gap-2.5">
          <!-- Font Family Selector -->
          <div class="flex items-center gap-1 bg-slate-800 rounded px-2 py-1">
            <span class="text-slate-400 text-[11px]">ฟอนต์:</span>
            <select
              v-model="selectedElement.fontFamily"
              class="bg-transparent text-white font-medium text-xs focus:outline-none cursor-pointer"
            >
              <option
                v-for="font in fontFamilies"
                :key="font.value"
                :value="font.value"
                class="bg-slate-900 text-white"
              >
                {{ font.label }}
              </option>
            </select>
          </div>

          <!-- Font Size Adjuster -->
          <div class="flex items-center gap-1 bg-slate-800 rounded px-2 py-1">
            <span class="text-slate-400">ขนาด:</span>
            <input
              v-model.number="selectedElement.fontSize"
              type="number"
              min="8"
              max="72"
              class="w-10 bg-transparent text-center font-bold text-white focus:outline-none"
            />
            <span class="text-[10px] text-slate-400">px</span>
          </div>

          <!-- Bold, Italic, Underline Toggles -->
          <div class="flex items-center bg-slate-800 rounded p-0.5">
            <button
              type="button"
              class="size-6 rounded font-bold transition-all text-xs"
              :class="
                selectedElement.fontWeight === 'bold'
                  ? 'bg-primary text-white'
                  : 'text-slate-300 hover:text-white'
              "
              @click="
                selectedElement.fontWeight =
                  selectedElement.fontWeight === 'bold' ? 'normal' : 'bold'
              "
            >
              B
            </button>
            <button
              type="button"
              class="size-6 rounded italic transition-all text-xs"
              :class="
                selectedElement.fontStyle === 'italic'
                  ? 'bg-primary text-white'
                  : 'text-slate-300 hover:text-white'
              "
              @click="
                selectedElement.fontStyle =
                  selectedElement.fontStyle === 'italic' ? 'normal' : 'italic'
              "
            >
              I
            </button>
            <button
              type="button"
              class="size-6 rounded underline transition-all text-xs"
              :class="
                selectedElement.textDecoration === 'underline'
                  ? 'bg-primary text-white'
                  : 'text-slate-300 hover:text-white'
              "
              @click="
                selectedElement.textDecoration =
                  selectedElement.textDecoration === 'underline'
                    ? 'none'
                    : 'underline'
              "
            >
              U
            </button>
          </div>

          <!-- Color Pickers: Text & Fill -->
          <div class="flex items-center gap-1.5 bg-slate-800 rounded px-2 py-1">
            <span class="text-slate-400">สีตัวอักษร:</span>
            <input
              v-model="selectedElement.color"
              type="color"
              class="size-5 bg-transparent border-none cursor-pointer rounded"
            />
          </div>

          <!-- Fill color if shape or badge -->
          <div
            v-if="
              selectedElement.type === 'shape' ||
              selectedElement.type === 'badge'
            "
            class="flex items-center gap-1.5 bg-slate-800 rounded px-2 py-1"
          >
            <span class="text-slate-400">สีพื้นหลัง:</span>
            <input
              v-model="selectedElement.bgColor"
              type="color"
              class="size-5 bg-transparent border-none cursor-pointer rounded"
            />
          </div>

          <!-- Alignment -->
          <div class="flex items-center bg-slate-800 rounded p-0.5">
            <button
              type="button"
              class="p-1 rounded"
              :class="
                selectedElement.textAlign === 'left'
                  ? 'bg-primary text-white'
                  : 'text-slate-400 hover:text-white'
              "
              @click="selectedElement.textAlign = 'left'"
            >
              <UIcon name="i-lucide-align-left" class="size-3.5" />
            </button>
            <button
              type="button"
              class="p-1 rounded"
              :class="
                selectedElement.textAlign === 'center'
                  ? 'bg-primary text-white'
                  : 'text-slate-400 hover:text-white'
              "
              @click="selectedElement.textAlign = 'center'"
            >
              <UIcon name="i-lucide-align-center" class="size-3.5" />
            </button>
            <button
              type="button"
              class="p-1 rounded"
              :class="
                selectedElement.textAlign === 'right'
                  ? 'bg-primary text-white'
                  : 'text-slate-400 hover:text-white'
              "
              @click="selectedElement.textAlign = 'right'"
            >
              <UIcon name="i-lucide-align-right" class="size-3.5" />
            </button>
          </div>

          <!-- Layering (Z-Index / Reordering) -->
          <div class="flex items-center gap-1 bg-slate-800 rounded p-1">
            <span class="text-[10px] text-slate-400 px-1">ลำดับชั้น:</span>
            <button
              type="button"
              title="นำมาไว้ข้างหน้าสุด (Bring to Front)"
              class="rounded p-1 hover:bg-slate-700 text-slate-300 hover:text-white"
              @click="bringToFront"
            >
              <UIcon name="i-lucide-arrow-up-to-line" class="size-3.5" />
            </button>
            <button
              type="button"
              title="เลื่อนขึ้นข้างหน้า 1 ชั้น (Bring Forward)"
              class="rounded p-1 hover:bg-slate-700 text-slate-300 hover:text-white"
              @click="bringForward"
            >
              <UIcon name="i-lucide-arrow-up" class="size-3.5" />
            </button>
            <button
              type="button"
              title="เลื่อนลงข้างหลัง 1 ชั้น (Send Backward)"
              class="rounded p-1 hover:bg-slate-700 text-slate-300 hover:text-white"
              @click="sendBackward"
            >
              <UIcon name="i-lucide-arrow-down" class="size-3.5" />
            </button>
            <button
              type="button"
              title="นำไปไว้ข้างหลังสุด (Send to Back)"
              class="rounded p-1 hover:bg-slate-700 text-slate-300 hover:text-white"
              @click="sendToBack"
            >
              <UIcon name="i-lucide-arrow-down-to-line" class="size-3.5" />
            </button>
          </div>

          <!-- Quick Auto Align to Center -->
          <div class="flex items-center gap-1 bg-slate-800 rounded p-1">
            <button
              type="button"
              title="จัดกึ่งกลางแนวนอน"
              class="rounded px-2 py-0.5 text-[10px] font-semibold hover:bg-slate-700 text-slate-300 hover:text-white"
              @click="centerHorizontally"
            >
              กึ่งกลาง ↔
            </button>
            <button
              type="button"
              title="จัดกึ่งกลางแนวตั้ง"
              class="rounded px-2 py-0.5 text-[10px] font-semibold hover:bg-slate-700 text-slate-300 hover:text-white"
              @click="centerVertically"
            >
              กึ่งกลาง ↕
            </button>
          </div>
        </div>

        <div v-else class="text-slate-500 italic text-xs">
          💡 คลิกเลือกกล่องข้อความ รูปทรง หรือตารางบนกระดาษเพื่อปรับแต่ง
          หรือลากย้ายตำแหน่งได้อย่างอิสระ
        </div>

        <!-- Element Actions -->
        <div v-if="selectedElement" class="flex items-center gap-2">
          <UButton
            color="neutral"
            icon="i-lucide-copy"
            label="ทำซ้ำ"
            size="xs"
            variant="outline"
            @click="duplicateSelectedElement"
          />
          <UButton
            color="error"
            icon="i-lucide-trash-2"
            label="ลบออก"
            size="xs"
            variant="soft"
            @click="deleteSelectedElement"
          />
        </div>
      </div>

      <!-- Studio Workspace Main Area -->
      <div class="flex flex-1 overflow-hidden">
        <!-- Left Sidebar (Canva Tool Palette) -->
        <div
          class="no-print flex w-72 shrink-0 flex-col border-r border-slate-800 bg-slate-900"
        >
          <!-- Sidebar Tabs -->
          <div
            class="grid grid-cols-6 border-b border-slate-800 text-[10px] font-semibold text-slate-400"
          >
            <button
              type="button"
              class="py-2.5 transition-all text-center"
              :class="
                canvaSidebarTab === 'variables'
                  ? 'border-b-2 border-primary bg-slate-800 text-white'
                  : 'hover:bg-slate-800/50 hover:text-white'
              "
              @click="canvaSidebarTab = 'variables'"
            >
              ตัวแปร
            </button>
            <button
              type="button"
              class="py-2.5 transition-all text-center"
              :class="
                canvaSidebarTab === 'text'
                  ? 'border-b-2 border-primary bg-slate-800 text-white'
                  : 'hover:bg-slate-800/50 hover:text-white'
              "
              @click="canvaSidebarTab = 'text'"
            >
              ข้อความ
            </button>
            <button
              type="button"
              class="py-2.5 transition-all text-center"
              :class="
                canvaSidebarTab === 'shapes'
                  ? 'border-b-2 border-primary bg-slate-800 text-white'
                  : 'hover:bg-slate-800/50 hover:text-white'
              "
              @click="canvaSidebarTab = 'shapes'"
            >
              รูปทรง
            </button>
            <button
              type="button"
              class="py-2.5 transition-all text-center"
              :class="
                canvaSidebarTab === 'tables'
                  ? 'border-b-2 border-primary bg-slate-800 text-white'
                  : 'hover:bg-slate-800/50 hover:text-white'
              "
              @click="canvaSidebarTab = 'tables'"
            >
              ตาราง
            </button>
            <button
              type="button"
              class="py-2.5 transition-all text-center"
              :class="
                canvaSidebarTab === 'elements'
                  ? 'border-b-2 border-primary bg-slate-800 text-white'
                  : 'hover:bg-slate-800/50 hover:text-white'
              "
              @click="canvaSidebarTab = 'elements'"
            >
              ตรา/เซ็น
            </button>
            <button
              type="button"
              class="py-2.5 transition-all text-center"
              :class="
                canvaSidebarTab === 'background'
                  ? 'border-b-2 border-primary bg-slate-800 text-white'
                  : 'hover:bg-slate-800/50 hover:text-white'
              "
              @click="canvaSidebarTab = 'background'"
            >
              พื้นหลัง
            </button>
          </div>

          <!-- Sidebar Content Panels -->
          <div class="flex-1 overflow-y-auto p-4 space-y-3">
            <!-- TAB 1: DYNAMIC STUDENT VARIABLES -->
            <div v-if="canvaSidebarTab === 'variables'" class="space-y-3">
              <p class="text-xs text-slate-400">
                คลิกตัวแปรเพื่อแทรกลงในเอกสาร
                ข้อมูลจะเปลี่ยนตามนักศึกษาอัตโนมัติ:
              </p>
              <div class="space-y-1.5">
                <button
                  v-for="v in availableVariables"
                  :key="v.key"
                  type="button"
                  class="flex w-full items-center justify-between rounded-lg border border-slate-800 bg-slate-800/60 px-3 py-2 text-left text-xs transition-all hover:border-primary hover:bg-slate-800 hover:text-white"
                  @click="addVariableElement(v.key, v.tag)"
                >
                  <span class="font-medium text-slate-200">{{ v.label }}</span>
                  <span class="font-mono text-[10px] text-amber-400">{{
                    v.tag
                  }}</span>
                </button>
              </div>
            </div>

            <!-- TAB 2: TEXT ELEMENTS -->
            <div v-if="canvaSidebarTab === 'text'" class="space-y-2">
              <p class="text-xs text-slate-400">คลิกเพื่อเพิ่มข้อความทั่วไป:</p>
              <button
                type="button"
                class="w-full rounded-lg border border-slate-800 bg-slate-800/70 p-3 text-left transition-all hover:border-primary hover:text-white"
                @click="addTextElement('heading')"
              >
                <p class="text-lg font-bold text-white font-prompt">
                  เพิ่มหัวข้อใหญ่ (Heading 1)
                </p>
                <p class="text-[11px] text-slate-400">
                  สำหรับชื่อเอกสาร หรือหัวเรื่องหลัก
                </p>
              </button>

              <button
                type="button"
                class="w-full rounded-lg border border-slate-800 bg-slate-800/70 p-3 text-left transition-all hover:border-primary hover:text-white"
                @click="addTextElement('subheading')"
              >
                <p class="text-sm font-semibold text-slate-200 font-prompt">
                  เพิ่มหัวข้อย่อย (Subheading)
                </p>
                <p class="text-[11px] text-slate-400">
                  สำหรับชื่อหมวด หรือหัวข้อส่วนย่อย
                </p>
              </button>

              <button
                type="button"
                class="w-full rounded-lg border border-slate-800 bg-slate-800/70 p-3 text-left transition-all hover:border-primary hover:text-white"
                @click="addTextElement('body')"
              >
                <p class="text-xs text-slate-300 font-sarabun">
                  เพิ่มข้อความเนื้อหาทั่วไป (Body Text)
                </p>
                <p class="text-[11px] text-slate-400">
                  สำหรับรายละเอียด คำอธิบาย หรือข้อความทางการ
                </p>
              </button>
            </div>

            <!-- TAB 3: SHAPES (รูปทรงต่างๆ) -->
            <div v-if="canvaSidebarTab === 'shapes'" class="space-y-3">
              <p class="text-xs text-slate-400">
                เลือกรูปทรงเพื่อเพิ่มลงบนกระดาษ:
              </p>
              <div class="grid grid-cols-2 gap-2">
                <!-- Rectangle -->
                <button
                  type="button"
                  class="flex flex-col items-center justify-center rounded-lg border border-slate-800 bg-slate-800/60 p-3 transition-all hover:border-primary hover:bg-slate-800"
                  @click="addShape('rectangle')"
                >
                  <div
                    class="size-8 rounded-none border border-slate-300 bg-slate-700/50 mb-1.5"
                  ></div>
                  <span class="text-xs font-semibold text-slate-200"
                    >สี่เหลี่ยมผืนผ้า</span
                  >
                </button>

                <!-- Rounded Box -->
                <button
                  type="button"
                  class="flex flex-col items-center justify-center rounded-lg border border-slate-800 bg-slate-800/60 p-3 transition-all hover:border-primary hover:bg-slate-800"
                  @click="addShape('rounded')"
                >
                  <div
                    class="size-8 rounded-lg border border-slate-300 bg-slate-700/50 mb-1.5"
                  ></div>
                  <span class="text-xs font-semibold text-slate-200"
                    >กล่องขอบมน</span
                  >
                </button>

                <!-- Circle -->
                <button
                  type="button"
                  class="flex flex-col items-center justify-center rounded-lg border border-slate-800 bg-slate-800/60 p-3 transition-all hover:border-primary hover:bg-slate-800"
                  @click="addShape('circle')"
                >
                  <div
                    class="size-8 rounded-full border border-amber-400 bg-amber-500/20 mb-1.5"
                  ></div>
                  <span class="text-xs font-semibold text-slate-200"
                    >วงกลม</span
                  >
                </button>

                <!-- Line -->
                <button
                  type="button"
                  class="flex flex-col items-center justify-center rounded-lg border border-slate-800 bg-slate-800/60 p-3 transition-all hover:border-primary hover:bg-slate-800"
                  @click="addShape('line')"
                >
                  <div class="w-10 h-0.5 bg-slate-300 my-4 mb-3"></div>
                  <span class="text-xs font-semibold text-slate-200"
                    >เส้นคั่นแบ่งส่วน</span
                  >
                </button>

                <!-- Banner -->
                <button
                  type="button"
                  class="flex flex-col items-center justify-center rounded-lg border border-slate-800 bg-slate-800/60 p-3 transition-all hover:border-primary hover:bg-slate-800"
                  @click="addShape('banner')"
                >
                  <div class="w-10 h-4 rounded bg-primary/80 mb-2"></div>
                  <span class="text-xs font-semibold text-slate-200"
                    >ป้ายเน้นข้อความ</span
                  >
                </button>

                <!-- Star Badge -->
                <button
                  type="button"
                  class="flex flex-col items-center justify-center rounded-lg border border-slate-800 bg-slate-800/60 p-3 transition-all hover:border-primary hover:bg-slate-800"
                  @click="addShape('star')"
                >
                  <span class="text-xl text-amber-400 mb-1">★</span>
                  <span class="text-xs font-semibold text-slate-200"
                    >ดาวเกียรติยศ</span
                  >
                </button>
              </div>
            </div>

            <!-- TAB 4: TABLES (ตารางข้อมูล) -->
            <div v-if="canvaSidebarTab === 'tables'" class="space-y-3">
              <p class="text-xs text-slate-400">
                เลือกรูปแบบตารางที่ต้องการแทรก:
              </p>

              <button
                type="button"
                class="w-full rounded-lg border border-slate-800 bg-slate-800/70 p-3 text-left transition-all hover:border-primary hover:text-white"
                @click="addCustomTable('competency')"
              >
                <div class="flex items-center gap-2">
                  <UIcon
                    name="i-lucide-table"
                    class="size-5 text-emerald-400"
                  />
                  <p class="text-xs font-bold text-white">
                    ตารางคะแนนประเมินสมรรถนะ
                  </p>
                </div>
                <p class="mt-1 text-[11px] text-slate-400">
                  มี 4 คอลัมน์: หมวดสมรรถนะ, เกณฑ์, คะแนน, ผลการประเมิน
                </p>
              </button>

              <button
                type="button"
                class="w-full rounded-lg border border-slate-800 bg-slate-800/70 p-3 text-left transition-all hover:border-primary hover:text-white"
                @click="addCustomTable('hours_log')"
              >
                <div class="flex items-center gap-2">
                  <UIcon name="i-lucide-table" class="size-5 text-sky-400" />
                  <p class="text-xs font-bold text-white">
                    ตารางบันทึกเวลาฝึกงาน
                  </p>
                </div>
                <p class="mt-1 text-[11px] text-slate-400">
                  มี 5 คอลัมน์: ลำดับ, วันที่, กิจกรรม, จำนวน ชม., ลายเซ็น
                </p>
              </button>

              <button
                type="button"
                class="w-full rounded-lg border border-slate-800 bg-slate-800/70 p-3 text-left transition-all hover:border-primary hover:text-white"
                @click="addCustomTable('blank_3x3')"
              >
                <div class="flex items-center gap-2">
                  <UIcon name="i-lucide-table" class="size-5 text-amber-400" />
                  <p class="text-xs font-bold text-white">
                    ตารางกำหนดเอง (3 คอลัมน์)
                  </p>
                </div>
                <p class="mt-1 text-[11px] text-slate-400">
                  สามารถเพิ่ม/ลดแถว และแก้ไขเนื้อหาในแต่ละช่องได้อย่างอิสระ
                </p>
              </button>
            </div>

            <!-- TAB 5: COMPONENTS (ตราสัญลักษณ์ & กล่องลายเซ็น) -->
            <div v-if="canvaSidebarTab === 'elements'" class="space-y-3">
              <p class="text-xs text-slate-400">
                คอมโพเนนต์ทางการของมหาวิทยาลัย:
              </p>

              <div
                class="flex cursor-pointer items-center gap-3 rounded-lg border border-slate-800 bg-slate-800/60 p-2.5 transition-all hover:border-primary hover:text-white"
                @click="
                  activeEditingDoc.elements.push({
                    id: `el-emblem-${Date.now()}`,
                    type: 'emblem',
                    content: 'MFU-CREST',
                    x: 360,
                    y: 50,
                    width: 74,
                    height: 74,
                    fontSize: 14,
                    fontWeight: 'normal',
                    color: '#b45309',
                    textAlign: 'center'
                  })
                "
              >
                <div
                  class="grid size-10 place-items-center rounded bg-amber-500/20 text-amber-500"
                >
                  <UIcon name="i-lucide-graduation-cap" class="size-6" />
                </div>
                <div>
                  <p class="text-xs font-bold text-white">ตราสัญลักษณ์ มฟล.</p>
                  <p class="text-[10px] text-slate-400">
                    Mae Fah Luang Crest Logo
                  </p>
                </div>
              </div>

              <div
                class="flex cursor-pointer items-center gap-3 rounded-lg border border-slate-800 bg-slate-800/60 p-2.5 transition-all hover:border-primary hover:text-white"
                @click="
                  activeEditingDoc.elements.push({
                    id: `el-sig-${Date.now()}`,
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
                  })
                "
              >
                <div
                  class="grid size-10 place-items-center rounded bg-sky-500/20 text-sky-500"
                >
                  <UIcon name="i-lucide-pencil" class="size-6" />
                </div>
                <div>
                  <p class="text-xs font-bold text-white">กล่องลงนามคู่</p>
                  <p class="text-[10px] text-slate-400">
                    อาจารย์นิเทศก์ & ผู้ควบคุมการฝึกงาน
                  </p>
                </div>
              </div>
            </div>

            <!-- TAB 6: BACKGROUND SETTINGS -->
            <div v-if="canvaSidebarTab === 'background'" class="space-y-3">
              <p class="text-xs text-slate-400">เลือกพื้นหลังของเอกสาร:</p>
              <div class="space-y-2 text-xs">
                <button
                  type="button"
                  class="flex w-full items-center gap-2 rounded-lg border p-2.5 transition-all"
                  :class="
                    activeEditingDoc.backgroundType === 'watermark'
                      ? 'border-primary bg-primary/20 text-white font-bold'
                      : 'border-slate-800 bg-slate-800/50 text-slate-300'
                  "
                  @click="activeEditingDoc.backgroundType = 'watermark'"
                >
                  <span>🏛️ ตราสัญลักษณ์ลายน้ำ มฟล.</span>
                </button>

                <button
                  type="button"
                  class="flex w-full items-center gap-2 rounded-lg border p-2.5 transition-all"
                  :class="
                    activeEditingDoc.backgroundType === 'certificate_pattern'
                      ? 'border-primary bg-primary/20 text-white font-bold'
                      : 'border-slate-800 bg-slate-800/50 text-slate-300'
                  "
                  @click="
                    activeEditingDoc.backgroundType = 'certificate_pattern'
                  "
                >
                  <span>📜 ลายเกียรติบัตรกิโยเช่</span>
                </button>

                <button
                  type="button"
                  class="flex w-full items-center gap-2 rounded-lg border p-2.5 transition-all"
                  :class="
                    activeEditingDoc.backgroundType === 'geometric'
                      ? 'border-primary bg-primary/20 text-white font-bold'
                      : 'border-slate-800 bg-slate-800/50 text-slate-300'
                  "
                  @click="activeEditingDoc.backgroundType = 'geometric'"
                >
                  <span>🔷 ลายเรขาคณิตหรูหรา</span>
                </button>

                <label
                  class="flex w-full items-center gap-2 rounded-lg border p-2.5 cursor-pointer transition-all"
                  :class="
                    activeEditingDoc.backgroundType === 'custom'
                      ? 'border-primary bg-primary/20 text-white font-bold'
                      : 'border-slate-800 bg-slate-800/50 text-slate-300'
                  "
                >
                  <span>🖼️ อัปโหลดภาพพื้นหลังเอง</span>
                  <input
                    type="file"
                    accept="image/*"
                    class="hidden"
                    @change="handleStudioBgUpload"
                  />
                </label>

                <button
                  type="button"
                  class="flex w-full items-center gap-2 rounded-lg border p-2.5 transition-all"
                  :class="
                    activeEditingDoc.backgroundType === 'none'
                      ? 'border-primary bg-primary/20 text-white font-bold'
                      : 'border-slate-800 bg-slate-800/50 text-slate-300'
                  "
                  @click="activeEditingDoc.backgroundType = 'none'"
                >
                  <span>⚪ ไม่มีพื้นหลัง (ขาวล้วน)</span>
                </button>
              </div>

              <!-- Opacity slider -->
              <div class="pt-3 border-t border-slate-800">
                <div
                  class="flex items-center justify-between text-xs text-slate-400 mb-1"
                >
                  <span>ความเข้มพื้นหลัง:</span>
                  <span class="font-bold text-white"
                    >{{ activeEditingDoc.bgOpacity }}%</span
                  >
                </div>
                <input
                  v-model.number="activeEditingDoc.bgOpacity"
                  type="range"
                  min="5"
                  max="40"
                  step="1"
                  class="w-full accent-primary cursor-pointer"
                />
              </div>
            </div>
          </div>
        </div>

        <!-- Center Canvas Workspace Area -->
        <div
          class="flex-1 overflow-auto bg-slate-950 px-8 py-10 flex justify-center relative select-none scroll-smooth"
          @click="selectedElementId = null"
        >
          <!-- Scaled Canvas Outer Box for Accurate Scroll Bounds -->
          <div
            class="shrink-0 relative transition-all duration-150"
            :style="{
              width: `${(activeEditingDoc.docType === 'pdf' ? 794 : 1024) * canvasScale}px`,
              height: `${(activeEditingDoc.docType === 'pdf' ? 1040 : 724) * canvasScale}px`,
              margin: '3rem auto'
            }"
            @click.stop
          >
            <!-- Authentic A4 Paper Canvas Container -->
            <div
              id="printable-document"
              class="absolute left-0 top-0 origin-top-left border border-slate-300 bg-white text-slate-900 shadow-2xl transition-transform duration-150"
              :style="{
                width: activeEditingDoc.docType === 'pdf' ? '794px' : '1024px',
                height: activeEditingDoc.docType === 'pdf' ? '1040px' : '724px',
                transform: `scale(${canvasScale})`
              }"
            >
              <!-- DYNAMIC BACKGROUND UNDERNEATH ALL ELEMENTS -->
              <div
                class="pointer-events-none absolute inset-0 z-0 flex items-center justify-center overflow-hidden"
                :style="{ opacity: activeEditingDoc.bgOpacity / 100 }"
              >
                <!-- Watermark -->
                <svg
                  v-if="activeEditingDoc.backgroundType === 'watermark'"
                  class="size-[380px] text-amber-700 select-none"
                  viewBox="0 0 200 200"
                  fill="none"
                  stroke="currentColor"
                >
                  <circle
                    cx="100"
                    cy="100"
                    r="92"
                    stroke-width="3"
                    stroke-dasharray="4 4"
                  />
                  <circle cx="100" cy="100" r="82" stroke-width="2" />
                  <circle cx="100" cy="100" r="74" stroke-width="1" />
                  <polygon
                    points="100,35 125,75 110,75 125,115 108,115 120,155 100,140 80,155 92,115 75,115 90,75 75,75"
                    fill="currentColor"
                    opacity="0.35"
                    stroke-width="2"
                  />
                  <text
                    x="100"
                    y="174"
                    font-size="8.5"
                    text-anchor="middle"
                    font-family="serif"
                    font-weight="bold"
                    fill="currentColor"
                  >
                    MAE FAH LUANG UNIVERSITY
                  </text>
                </svg>

                <!-- Certificate Pattern -->
                <div
                  v-else-if="
                    activeEditingDoc.backgroundType === 'certificate_pattern'
                  "
                  class="absolute inset-0 bg-[radial-gradient(#b45309_1.2px,transparent_1.2px)] [background-size:24px_24px]"
                >
                  <div
                    class="absolute inset-0 flex items-center justify-center"
                  >
                    <svg
                      class="size-[440px] text-amber-800"
                      viewBox="0 0 100 100"
                      fill="none"
                      stroke="currentColor"
                    >
                      <circle cx="50" cy="50" r="46" stroke-width="0.8" />
                      <circle
                        cx="50"
                        cy="50"
                        r="39"
                        stroke-width="0.5"
                        stroke-dasharray="1 1"
                      />
                      <circle cx="50" cy="50" r="32" stroke-width="0.8" />
                      <path
                        d="M50 5 L50 95 M5 50 L95 50 M18 18 L82 82 M18 82 L82 18"
                        stroke-width="0.5"
                      />
                    </svg>
                  </div>
                </div>

                <!-- Geometric -->
                <div
                  v-else-if="activeEditingDoc.backgroundType === 'geometric'"
                  class="absolute inset-0 size-full"
                >
                  <div
                    class="absolute -right-24 -top-24 size-96 rounded-full bg-gradient-to-br from-amber-500 to-amber-800 blur-3xl opacity-60"
                  ></div>
                  <div
                    class="absolute -bottom-24 -left-24 size-96 rounded-full bg-gradient-to-tr from-sky-600 to-indigo-900 blur-3xl opacity-60"
                  ></div>
                </div>

                <!-- Custom Image -->
                <img
                  v-else-if="
                    activeEditingDoc.backgroundType === 'custom' &&
                    activeEditingDoc.customBgUrl
                  "
                  :src="activeEditingDoc.customBgUrl"
                  alt="Custom Background"
                  class="size-full object-cover select-none"
                />
              </div>

              <!-- CERTIFICATE ORNATE FRAME BORDER (If certificate mode) -->
              <div
                v-if="activeEditingDoc.docType === 'certificate'"
                class="pointer-events-none absolute inset-4 border-4 border-double border-amber-600/70"
              >
                <div
                  class="absolute -left-1 -top-1 size-5 border-l-4 border-t-4 border-amber-600"
                ></div>
                <div
                  class="absolute -right-1 -top-1 size-5 border-r-4 border-t-4 border-amber-600"
                ></div>
                <div
                  class="absolute -bottom-1 -left-1 size-5 border-b-4 border-l-4 border-amber-600"
                ></div>
                <div
                  class="absolute -bottom-1 -right-1 size-5 border-b-4 border-r-4 border-amber-600"
                ></div>
              </div>

              <!-- CANVAS DRAGGABLE & EDITABLE ELEMENTS -->
              <div
                v-for="el in activeEditingDoc.elements"
                :key="el.id"
                class="absolute select-none cursor-move transition-shadow"
                :class="{
                  'ring-2 ring-primary ring-offset-1 shadow-lg z-30':
                    selectedElementId === el.id,
                  'hover:ring-1 hover:ring-primary/50 z-20':
                    selectedElementId !== el.id
                }"
                :style="{
                  left: `${el.x}px`,
                  top: `${el.y}px`,
                  width: el.width ? `${el.width}px` : 'auto',
                  height: el.height ? `${el.height}px` : 'auto',
                  fontSize: `${el.fontSize}px`,
                  fontFamily: el.fontFamily || 'Sarabun, sans-serif',
                  fontWeight: el.fontWeight,
                  fontStyle: el.fontStyle || 'normal',
                  textDecoration: el.textDecoration || 'none',
                  color: el.color,
                  textAlign: el.textAlign,
                  letterSpacing: el.letterSpacing || 'normal',
                  backgroundColor: el.bgColor || 'transparent',
                  borderWidth: el.borderWidth ? `${el.borderWidth}px` : '0px',
                  borderColor: el.borderColor || 'transparent',
                  borderStyle: el.borderWidth ? 'solid' : 'none',
                  borderRadius: el.borderRadius
                    ? `${el.borderRadius}px`
                    : '0px',
                  padding: el.padding ? `${el.padding}px` : '0px'
                }"
                @mousedown="handleElementMouseDown($event, el)"
              >
                <!-- Shape Component -->
                <div
                  v-if="el.type === 'shape'"
                  class="size-full flex items-center justify-center"
                >
                  <span v-if="el.content">{{ el.content }}</span>
                </div>

                <!-- Emblem Component -->
                <div
                  v-else-if="el.type === 'emblem'"
                  class="mx-auto flex size-14 items-center justify-center rounded-full bg-amber-50 text-amber-700 ring-2 ring-amber-600"
                >
                  <UIcon
                    :name="
                      el.content === 'GOLD-AWARD'
                        ? 'i-lucide-award'
                        : 'i-lucide-graduation-cap'
                    "
                    class="size-8"
                  />
                </div>

                <!-- Custom Dynamic Table Component -->
                <div
                  v-else-if="el.type === 'custom_table' && el.tableData"
                  class="w-full"
                >
                  <table
                    class="w-full border-collapse text-left text-xs bg-white/95 backdrop-blur-[1px] border border-slate-300"
                  >
                    <thead>
                      <tr
                        class="border-b border-slate-300 bg-slate-100 font-bold text-slate-800"
                      >
                        <th
                          v-for="(header, hIdx) in el.tableData.headers"
                          :key="hIdx"
                          class="p-2 border-r border-slate-200 last:border-r-0"
                        >
                          {{ renderElementContent(header) }}
                        </th>
                      </tr>
                    </thead>
                    <tbody class="divide-y divide-slate-200">
                      <tr
                        v-for="(row, rIdx) in el.tableData.rows"
                        :key="rIdx"
                        class="hover:bg-slate-50/80"
                      >
                        <td
                          v-for="(cell, cIdx) in row"
                          :key="cIdx"
                          class="p-2 border-r border-slate-200 last:border-r-0"
                        >
                          {{ renderElementContent(cell) }}
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>

                <!-- Competency Assessment Table Component -->
                <div v-else-if="el.type === 'table'" class="w-full">
                  <table
                    class="w-full border-collapse text-left text-xs bg-white/90 backdrop-blur-[1px]"
                  >
                    <thead>
                      <tr
                        class="border-y border-slate-300 bg-slate-100 font-bold text-slate-800"
                      >
                        <th class="py-2 pl-3">หมวดสมรรถนะการประเมิน</th>
                        <th class="py-2 text-center">คะแนนเต็ม</th>
                        <th class="py-2 text-center">คะแนนที่ได้</th>
                        <th class="py-2 text-center">ร้อยละ</th>
                        <th class="py-2 pr-3 text-right">ผลการประเมิน</th>
                      </tr>
                    </thead>
                    <tbody class="divide-y divide-slate-200">
                      <tr>
                        <td class="py-2.5 pl-3">
                          <p class="font-bold text-slate-900">
                            1. หมวดสมรรถนะทั่วไป (Core Competencies)
                          </p>
                          <p class="text-[11px] text-slate-500">
                            การตรงต่อเวลา, วินัย, การสื่อสาร,
                            การทำงานร่วมกับผู้อื่น
                          </p>
                        </td>
                        <td class="text-center font-mono">5.00</td>
                        <td
                          class="text-center font-mono font-bold text-slate-900"
                        >
                          4.80
                        </td>
                        <td class="text-center font-mono">96.0%</td>
                        <td class="pr-3 text-right font-bold text-emerald-700">
                          ผ่านเกณฑ์ดีเยี่ยม
                        </td>
                      </tr>
                      <tr>
                        <td class="py-2.5 pl-3">
                          <p class="font-bold text-slate-900">
                            2. หมวดสมรรถนะวิชาชีพเฉพาะ (Specialized Field)
                          </p>
                          <p class="text-[11px] text-slate-500">
                            ทักษะเชิงเทคนิค, การแก้ปัญหาหน้างาน, คุณภาพงาน
                          </p>
                        </td>
                        <td class="text-center font-mono">5.00</td>
                        <td
                          class="text-center font-mono font-bold text-slate-900"
                        >
                          4.90
                        </td>
                        <td class="text-center font-mono">98.0%</td>
                        <td class="pr-3 text-right font-bold text-emerald-700">
                          ผ่านเกณฑ์ดีเยี่ยม
                        </td>
                      </tr>
                      <tr class="bg-amber-50/70 font-bold">
                        <td class="py-2.5 pl-3 text-slate-900">
                          ผลการประเมินรวมเฉลี่ย (Overall Grade & Score)
                        </td>
                        <td class="text-center font-mono">5.00</td>
                        <td class="text-center font-mono text-amber-800">
                          4.85
                        </td>
                        <td class="text-center font-mono text-amber-800">
                          97.0%
                        </td>
                        <td class="pr-3 text-right text-emerald-800">
                          A (ผ่านเกณฑ์ดีเยี่ยม)
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>

                <!-- Signature Component -->
                <div
                  v-else-if="el.type === 'signature'"
                  class="grid grid-cols-2 gap-8 text-center text-xs w-full"
                >
                  <div>
                    <div
                      class="mx-auto h-10 w-44 border-b border-dashed border-slate-400"
                    ></div>
                    <p class="mt-2 font-bold text-slate-900">
                      (
                      ................................................................
                      )
                    </p>
                    <p class="text-slate-600">
                      ผู้ควบคุมการฝึกงาน (Mentor / Supervisor)
                    </p>
                    <p class="text-[11px] text-slate-500">
                      {{ dynamicStudentValues.organization_name }}
                    </p>
                  </div>
                  <div>
                    <div
                      class="mx-auto h-10 w-44 border-b border-dashed border-slate-400"
                    ></div>
                    <p class="mt-2 font-bold text-slate-900">
                      (
                      ................................................................
                      )
                    </p>
                    <p class="text-slate-600">
                      อาจารย์ผู้ประสานงาน / คณบดีสำนักวิชา
                    </p>
                    <p class="text-[11px] text-slate-500">
                      มหาวิทยาลัยแม่ฟ้าหลวง
                    </p>
                  </div>
                </div>

                <!-- Standard Text & Variable Component -->
                <div v-else>
                  {{ renderElementContent(el.content) }}
                </div>

                <!-- Drag Handle / Element Indicator when selected -->
                <div
                  v-if="selectedElementId === el.id"
                  class="no-print absolute -top-5 left-0 rounded bg-primary px-1.5 py-0.5 text-[9px] font-bold text-inverted uppercase shadow"
                >
                  {{ el.type }} ({{ el.x }}, {{ el.y }})
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- Right Sidebar (Properties Inspector & Table Editor) -->
        <div
          v-if="selectedElement"
          class="no-print w-80 shrink-0 border-l border-slate-800 bg-slate-900 p-4 space-y-4 overflow-y-auto"
        >
          <div
            class="flex items-center justify-between border-b border-slate-800 pb-2"
          >
            <span class="text-xs font-bold uppercase text-white"
              >คุณสมบัติองค์ประกอบ</span
            >
            <UButton
              color="neutral"
              icon="i-lucide-x"
              size="xs"
              variant="ghost"
              @click="selectedElementId = null"
            />
          </div>

          <!-- TABLE CELL EDITOR (If custom table is selected) -->
          <div
            v-if="
              selectedElement.type === 'custom_table' &&
              selectedElement.tableData
            "
            class="space-y-3"
          >
            <div class="flex items-center justify-between">
              <span class="text-xs font-bold text-amber-400">จัดการตาราง</span>
              <div class="flex items-center gap-1">
                <UButton
                  color="neutral"
                  label="+ แถว"
                  size="xs"
                  variant="outline"
                  @click="addTableRow"
                />
                <UButton
                  color="neutral"
                  label="+ คอลัมน์"
                  size="xs"
                  variant="outline"
                  @click="addTableColumn"
                />
              </div>
            </div>

            <!-- Table Headers edit -->
            <div class="space-y-1 text-xs">
              <label class="text-[11px] text-slate-400 font-semibold"
                >หัวข้อคอลัมน์ (Headers):</label
              >
              <div
                v-for="(header, hIdx) in selectedElement.tableData.headers"
                :key="hIdx"
                class="flex items-center gap-1.5"
              >
                <input
                  v-model="selectedElement.tableData.headers[hIdx]"
                  class="flex-1 rounded bg-slate-800 p-1.5 text-xs text-white focus:outline-none"
                />
              </div>
            </div>

            <!-- Table Rows edit -->
            <div class="space-y-2 text-xs pt-2 border-t border-slate-800">
              <label class="text-[11px] text-slate-400 font-semibold"
                >ข้อมูลแถว (Rows):</label
              >
              <div
                v-for="(row, rIdx) in selectedElement.tableData.rows"
                :key="rIdx"
                class="space-y-1 rounded bg-slate-800/60 p-2"
              >
                <div
                  class="flex items-center justify-between text-[10px] text-slate-400"
                >
                  <span>แถวที่ {{ rIdx + 1 }}</span>
                  <button
                    type="button"
                    class="text-rose-400 hover:text-rose-300"
                    @click="removeTableRow(rIdx)"
                  >
                    ลบแถว
                  </button>
                </div>
                <div
                  v-for="(_, cIdx) in row"
                  :key="cIdx"
                  class="flex items-center gap-1"
                >
                  <input
                    v-model="selectedElement.tableData.rows[rIdx]![cIdx]"
                    class="w-full rounded bg-slate-800 p-1 text-[11px] text-white focus:outline-none"
                  />
                </div>
              </div>
            </div>
          </div>

          <!-- Content text editor (For non-table elements) -->
          <div v-else class="space-y-1">
            <label class="block text-[11px] font-semibold text-slate-400">
              ข้อความ (รองรับแทรกตัวแปร {{}}):
            </label>
            <textarea
              v-model="selectedElement.content"
              rows="3"
              class="w-full rounded-lg border border-slate-800 bg-slate-800/80 p-2 text-xs text-white focus:border-primary focus:outline-none"
            ></textarea>
          </div>

          <!-- Quick Variable Insertion into selected text -->
          <div v-if="selectedElement.type !== 'shape'" class="space-y-1">
            <label class="block text-[11px] font-semibold text-slate-400">
              แทรกตัวแปรลงในข้อความนี้:
            </label>
            <select
              class="w-full rounded-lg border border-slate-800 bg-slate-800/80 p-2 text-xs text-amber-400 focus:border-primary focus:outline-none"
              @change="
                (e) => {
                  const tag = (e.target as HTMLSelectElement).value
                  if (tag && selectedElement) {
                    selectedElement.content += ' ' + tag
                    ;(e.target as HTMLSelectElement).value = ''
                  }
                }
              "
            >
              <option value="">-- เลือกตัวแปรที่ต้องการแทรก --</option>
              <option
                v-for="v in availableVariables"
                :key="v.key"
                :value="v.tag"
              >
                {{ v.label }} ({{ v.tag }})
              </option>
            </select>
          </div>

          <!-- Coordinates X, Y -->
          <div class="grid grid-cols-2 gap-2 text-xs">
            <div>
              <label class="text-[11px] text-slate-400">พิกัด X (px):</label>
              <input
                v-model.number="selectedElement.x"
                type="number"
                class="w-full rounded bg-slate-800 p-1.5 text-white focus:outline-none"
              />
            </div>
            <div>
              <label class="text-[11px] text-slate-400">พิกัด Y (px):</label>
              <input
                v-model.number="selectedElement.y"
                type="number"
                class="w-full rounded bg-slate-800 p-1.5 text-white focus:outline-none"
              />
            </div>
          </div>

          <!-- Width & Height -->
          <div class="grid grid-cols-2 gap-2 text-xs">
            <div>
              <label class="text-[11px] text-slate-400"
                >กว้าง (Width px):</label
              >
              <input
                v-model.number="selectedElement.width"
                type="number"
                class="w-full rounded bg-slate-800 p-1.5 text-white focus:outline-none"
              />
            </div>
            <div>
              <label class="text-[11px] text-slate-400">สูง (Height px):</label>
              <input
                v-model.number="selectedElement.height"
                type="number"
                class="w-full rounded bg-slate-800 p-1.5 text-white focus:outline-none"
              />
            </div>
          </div>

          <!-- Shape Border and Radius settings -->
          <div
            v-if="
              selectedElement.type === 'shape' ||
              selectedElement.type === 'badge'
            "
            class="space-y-2 pt-2 border-t border-slate-800 text-xs"
          >
            <div class="flex items-center justify-between">
              <span class="text-slate-400">ความโค้งมน (Radius):</span>
              <input
                v-model.number="selectedElement.borderRadius"
                type="number"
                min="0"
                max="100"
                class="w-14 rounded bg-slate-800 p-1 text-center text-white"
              />
            </div>

            <div class="flex items-center justify-between">
              <span class="text-slate-400">ความหนาเส้นขอบ (Border):</span>
              <input
                v-model.number="selectedElement.borderWidth"
                type="number"
                min="0"
                max="10"
                class="w-14 rounded bg-slate-800 p-1 text-center text-white"
              />
            </div>

            <div class="flex items-center justify-between">
              <span class="text-slate-400">สีเส้นขอบ:</span>
              <input
                v-model="selectedElement.borderColor"
                type="color"
                class="size-6 rounded border-none bg-transparent cursor-pointer"
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style>
@import url('https://fonts.googleapis.com/css2?family=Charm:wght@400;700&family=Kanit:wght@300;400;500;600;700&family=Prompt:wght@300;400;500;600;700&family=Sarabun:wght@300;400;500;600;700&display=swap');

.font-sarabun {
  font-family: Sarabun, sans-serif;
}
.font-prompt {
  font-family: Prompt, sans-serif;
}
.font-kanit {
  font-family: Kanit, sans-serif;
}
.font-charm {
  font-family: Charm, cursive;
}

@media print {
  body {
    background: white !important;
    color: black !important;
  }
  header,
  nav,
  aside,
  footer,
  .no-print,
  [data-slot='sidebar'],
  [data-slot='navbar'] {
    display: none !important;
  }
  #printable-document {
    position: fixed !important;
    left: 0 !important;
    top: 0 !important;
    width: 100% !important;
    max-width: 100% !important;
    margin: 0 !important;
    padding: 0 !important;
    border: none !important;
    box-shadow: none !important;
    background: white !important;
    transform: none !important;
    z-index: 9999999 !important;
    -webkit-print-color-adjust: exact !important;
    print-color-adjust: exact !important;
  }
  @page {
    size: auto;
    margin: 10mm;
  }
}
</style>
