<script setup lang="ts">
import { resolveUniqueStudentPlacement } from '~/utils/document-preview'
import { adaptCanonicalDocumentForEditor } from '~/utils/document-template-editor'
import { loadAllPages, type PaginatedItems } from '~/utils/load-all-pages'

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
  assetKey?: string
  assetKeys?: string[]
}

export interface DocumentTemplateItem {
  id: string
  templateId?: string
  versionId?: string
  versionNumber?: number
  revision?: number
  versionStatus?: 'draft' | 'published' | 'retired'
  templateStatus?: 'active' | 'archived'
  canvasWidth?: number
  canvasHeight?: number
  requiresSchemaMigration?: boolean
  fontAssetKeys?: string[]
  isLegacy?: boolean
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

interface DocumentTemplateEditorMetadata {
  readonly nameTh?: string
  readonly nameEn?: string
  readonly description?: string
  readonly backgroundType?: BackgroundType
  readonly bgOpacity?: number
}

interface DocumentTemplateVersionSummary {
  readonly id: string
  readonly versionNumber: number
  readonly status: 'draft' | 'published' | 'retired'
  readonly schemaVersion: number
  readonly revision: number
  readonly editorMetadata?: DocumentTemplateEditorMetadata | null
  readonly fontAssetKeys?: readonly string[]
}

interface DocumentAssetApiItem {
  readonly id: string
  readonly key: string
  readonly assetType: 'font' | 'emblem' | 'signature' | 'background'
  readonly originalName: string
  readonly fontFamily?: string
  readonly contentType: 'font/ttf' | 'font/otf' | 'image/png'
  readonly size: number
}

interface DocumentAssetPage {
  readonly items: readonly DocumentAssetApiItem[]
  readonly meta: { readonly totalPages: number }
}

interface DocumentTemplateApiItem {
  readonly id: string
  readonly code: string
  readonly name: string
  readonly documentType?: 'transcript' | 'certificate' | null
  readonly status: 'active' | 'archived'
  readonly createdAt: string
  readonly latestVersion?: DocumentTemplateVersionSummary | null
}

interface DocumentTemplatePage {
  readonly items: readonly DocumentTemplateApiItem[]
  readonly meta: { readonly totalPages: number }
}

interface DocumentTemplateVersionApiRecord extends DocumentTemplateVersionSummary {
  readonly templateId: string
  readonly canonicalJson: Readonly<Record<string, unknown>>
  readonly placeholders: readonly string[]
}

interface PersistedDocumentTemplate extends DocumentTemplateApiItem {
  readonly versions: readonly DocumentTemplateVersionApiRecord[]
}

const api = useApi()
const toast = useToast()
const authStore = useAuthStore()
const isSavingTemplate = ref(false)
const isPublishingTemplate = ref(false)
const canManageDocumentTemplates = computed(() => {
  const actor = authStore.actor
  if (!actor) return false
  if (actor.roles.includes('systemAdmin')) return true
  if (!actor.roles.includes('internshipStaff')) return false
  if (actor.roleScopes) {
    return actor.roleScopes.some(
      (scope) => scope.role === 'internshipStaff' && scope.tenant
    )
  }
  return actor.roles.length === 1 && actor.scope.tenant
})
const availableFontAssets = ref<DocumentAssetApiItem[]>([])
const availableImageAssets = ref<DocumentAssetApiItem[]>([])
const isLoadingFontAssets = ref(false)
const isUploadingFontAsset = ref(false)
const selectedFontFile = ref<File | null>(null)
const selectedFontFileInput = ref<HTMLInputElement | null>(null)
const fontRightsBasis = ref('')
const fontRightsConfirmed = ref(false)
const isUploadingImageAsset = ref(false)
const selectedImageFile = ref<File | null>(null)
const selectedImageFileInput = ref<HTMLInputElement | null>(null)
const imageRightsBasis = ref('')
const imageRightsConfirmed = ref(false)
const selectedImageAssetType = computed(() => {
  const type = selectedElement.value?.type
  return type === 'emblem' || type === 'signature' ? type : null
})
const selectableImageAssets = computed(() =>
  selectedImageAssetType.value
    ? availableImageAssets.value.filter(
        (asset) => asset.assetType === selectedImageAssetType.value
      )
    : []
)

function showTemplateApiError(error: unknown): void {
  const statusCode =
    typeof error === 'object' && error !== null && 'statusCode' in error
      ? Number(error.statusCode)
      : typeof error === 'object' && error !== null && 'status' in error
        ? Number(error.status)
        : undefined
  const errorObj = error as {
    data?: { error?: { message?: string; code?: string } }
    message?: string
  }
  const detailMessage =
    errorObj?.data?.error?.message ||
    (errorObj?.data?.error?.code
      ? `รหัสข้อผิดพลาด: ${errorObj.data.error.code}`
      : undefined)

  const description =
    statusCode === 403
      ? 'บัญชีนี้ไม่มีสิทธิ์จัดการแม่แบบเอกสาร'
      : statusCode === 409
        ? 'ข้อมูลแม่แบบเปลี่ยนไปแล้ว กรุณาโหลดใหม่ก่อนบันทึก'
        : statusCode === 422 && detailMessage
          ? `ข้อมูลไม่ถูกต้อง: ${detailMessage}`
          : 'บันทึกไม่สำเร็จ ข้อมูลในตัวแก้ไขยังอยู่ กรุณาลองใหม่'
  toast.add({
    title: 'จัดการแม่แบบไม่สำเร็จ',
    description,
    color: 'error'
  })
}

function isBackgroundType(value: unknown): value is BackgroundType {
  return (
    value === 'watermark' ||
    value === 'certificate_pattern' ||
    value === 'geometric' ||
    value === 'custom' ||
    value === 'none'
  )
}

function readEditorMetadata(value: unknown): DocumentTemplateEditorMetadata {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return {}
  }
  return value as DocumentTemplateEditorMetadata
}

function mapApiTemplate(
  template: DocumentTemplateApiItem
): DocumentTemplateItem {
  const version = template.latestVersion
  const metadata = readEditorMetadata(version?.editorMetadata)
  const inferredDocType: 'certificate' | 'transcript' =
    template.documentType === 'certificate' ||
    template.code?.toUpperCase().includes('CERT') ||
    template.name?.includes('ประกาศนียบัตร') ||
    template.name?.includes('รับรอง')
      ? 'certificate'
      : 'transcript'

  return {
    id: template.id,
    templateId: template.id,
    ...(version ? { versionId: version.id } : {}),
    ...(version ? { versionNumber: version.versionNumber } : {}),
    ...(version ? { revision: version.revision } : {}),
    ...(version ? { versionStatus: version.status } : {}),
    templateStatus: template.status,
    isLegacy: false,
    code: template.code,
    nameTh:
      typeof metadata.nameTh === 'string' ? metadata.nameTh : template.name,
    nameEn: typeof metadata.nameEn === 'string' ? metadata.nameEn : '',
    docType: inferredDocType === 'certificate' ? 'certificate' : 'pdf',
    description:
      typeof metadata.description === 'string' ? metadata.description : '',
    createdAt: template.createdAt,
    status:
      template.status === 'active' && version?.status === 'published'
        ? 'active'
        : 'inactive',
    backgroundType: isBackgroundType(metadata.backgroundType)
      ? metadata.backgroundType
      : inferredDocType === 'certificate'
        ? 'certificate_pattern'
        : 'none',
    bgOpacity:
      typeof metadata.bgOpacity === 'number' &&
      metadata.bgOpacity >= 0 &&
      metadata.bgOpacity <= 100
        ? metadata.bgOpacity
        : inferredDocType === 'certificate'
          ? 15
          : 10,
    elements: []
  }
}

async function fetchAllDocumentTemplates(): Promise<{
  readonly items: readonly DocumentTemplateApiItem[]
}> {
  const firstPage = await api<DocumentTemplatePage>('/document-templates', {
    query: { page: 1, limit: 100 }
  })
  const remainingPages = await Promise.all(
    Array.from({ length: Math.max(0, firstPage.meta.totalPages - 1) }, (_, i) =>
      api<DocumentTemplatePage>('/document-templates', {
        query: { page: i + 2, limit: 100 }
      })
    )
  )
  return {
    items: [...firstPage.items, ...remainingPages.flatMap((page) => page.items)]
  }
}

const {
  data: templatesData,
  error: templatesError,
  pending: templatesPending,
  refresh: refreshTemplates
} = await useAsyncData('document-templates-list', fetchAllDocumentTemplates)

// Load dynamic data from system API
const {
  data: studentsData,
  error: studentsError,
  pending: studentsPending,
  refresh: refreshStudents
} = await useAsyncData('docs-students', () =>
  loadAllPages(
    (page, pageSize) =>
      api<PaginatedItems<StudentItem>>('/students', {
        query: { page, pageSize }
      }),
    100
  )
)

const activeStudentId = ref(studentsData.value?.items[0]?.studentId ?? '')

const {
  data: schoolsData,
  error: schoolsError,
  pending: schoolsPending,
  refresh: refreshSchools
} = await useAsyncData('docs-schools', () =>
  loadAllPages(
    (page, pageSize) =>
      api<PaginatedItems<SchoolItem>>('/academic/schools', {
        query: { page, pageSize }
      }),
    100
  )
)

const {
  data: programsData,
  error: programsError,
  pending: programsPending,
  refresh: refreshPrograms
} = await useAsyncData('docs-programs', () =>
  loadAllPages(
    (page, pageSize) =>
      api<PaginatedItems<ProgramItem>>('/academic/programs', {
        query: { page, pageSize }
      }),
    100
  )
)

const {
  data: placementsData,
  error: placementsError,
  pending: placementsPending,
  refresh: refreshPlacements
} = await useAsyncData(
  'docs-placements',
  async () => {
    if (!activeStudentId.value) return { items: [] as PlacementItem[] }
    return loadAllPages(
      (page, pageSize) =>
        api<PaginatedItems<PlacementItem>>('/placements', {
          query: { studentId: activeStudentId.value, page, pageSize }
        }),
      100
    )
  },
  { watch: [activeStudentId] }
)

const {
  data: orgsData,
  error: organizationsError,
  pending: organizationsPending,
  refresh: refreshOrganizations
} = await useAsyncData('docs-orgs', () =>
  loadAllPages(
    (page, pageSize) =>
      api<PaginatedItems<OrganizationItem>>('/organizations', {
        query: { page, pageSize }
      }),
    100
  )
)

const referenceDataError = computed(
  () =>
    Boolean(studentsError.value) ||
    Boolean(schoolsError.value) ||
    Boolean(programsError.value) ||
    Boolean(placementsError.value) ||
    Boolean(organizationsError.value)
)
const referenceDataPending = computed(
  () =>
    studentsPending.value ||
    schoolsPending.value ||
    programsPending.value ||
    placementsPending.value ||
    organizationsPending.value
)

async function retryReferenceData(): Promise<void> {
  await Promise.allSettled([
    refreshStudents(),
    refreshSchools(),
    refreshPrograms(),
    refreshPlacements(),
    refreshOrganizations()
  ])
  if (!activeStudentId.value) {
    activeStudentId.value = studentsData.value?.items[0]?.studentId ?? ''
  }
}

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
    content: 'ปีการศึกษา: {{academic_year}}',
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
    type: 'text',
    content: 'จำนวนชั่วโมงรวม: 400 ชั่วโมง (ครบตามเกณฑ์มาตรฐาน)',
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
      'ระหว่างวันที่ {{training_period}} (ครบตามเกณฑ์มาตรฐานการฝึกปฏิบัติงานวิชาชีพ)',
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
    id: 'el-cr-detail-training',
    type: 'text',
    content: 'ได้เข้ารับการฝึกงาน ณ สถานประกอบการตามหลักสูตร',
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

// The designer reads persisted templates only; no demo records are mixed into API data.
const documents = ref<DocumentTemplateItem[]>(
  (templatesData.value?.items ?? []).map(mapApiTemplate)
)

watch(
  templatesData,
  (result) => {
    if (result) documents.value = result.items.map(mapApiTemplate)
  },
  { immediate: true }
)

// Search & Filter state
const searchQuery = ref('')
const statusFilter = ref<'all' | 'active' | 'inactive'>('all')
const typeFilter = ref<'all' | 'pdf' | 'certificate'>('all')

const docTypeOptions = [
  { value: 'all', label: 'ทุกรูปแบบ' },
  { value: 'pdf', label: 'PDF (ใบบันทึกผล)' },
  { value: 'certificate', label: 'Certification (ใบประกาศ)' }
]

const docStatusOptions = [
  { value: 'all', label: 'ทุกสถานะ' },
  { value: 'active', label: 'เผยแพร่แล้ว' },
  { value: 'inactive', label: 'ฉบับร่าง / เก็บถาวร' }
]

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
const savedEditorState = ref<string | null>(null)
function getDocumentCanvasSize(doc: DocumentTemplateItem): {
  readonly width: number
  readonly height: number
} {
  return {
    width: doc.canvasWidth ?? (doc.docType === 'pdf' ? 794 : 1024),
    height: doc.canvasHeight ?? (doc.docType === 'pdf' ? 1040 : 724)
  }
}
const studioCanvasWidth = computed(() =>
  activeEditingDoc.value
    ? getDocumentCanvasSize(activeEditingDoc.value).width
    : 794
)
const studioCanvasHeight = computed(() =>
  activeEditingDoc.value
    ? getDocumentCanvasSize(activeEditingDoc.value).height
    : 1040
)
function getStudioEditorState(doc: DocumentTemplateItem): string {
  return JSON.stringify({
    canonicalJson: buildCanonicalJson(doc),
    fontAssetKeys: doc.fontAssetKeys ?? []
  })
}

const selectedDocumentFontKey = computed({
  get: () => activeEditingDoc.value?.fontAssetKeys?.[0] ?? '',
  set: (key: string) => {
    if (activeEditingDoc.value) {
      activeEditingDoc.value.fontAssetKeys = key ? [key] : []
    }
  }
})
const selectedFontAssetUnavailable = computed(() => {
  const selectedKey = selectedDocumentFontKey.value
  return (
    !!selectedKey &&
    !availableFontAssets.value.some((asset) => asset.key === selectedKey)
  )
})

const hasUnsavedChanges = computed(() => {
  const doc = activeEditingDoc.value
  if (!doc) return false
  const currentState = getStudioEditorState(doc)
  return (
    !doc.templateId ||
    doc.requiresSchemaMigration === true ||
    savedEditorState.value !== currentState
  )
})
const selectedElementId = ref<string | null>(null)
const canvasScale = ref<number>(0.9) // zoom level
const canvaSidebarTab = ref<
  'variables' | 'text' | 'shapes' | 'tables' | 'elements' | 'background'
>('variables')
const livePreviewMode = ref<'variables' | 'real_data'>('real_data')

const dynamicStudentValues = computed(() => {
  const std = studentsData.value?.items?.find(
    (s) => s.studentId === activeStudentId.value
  )
  const school = schoolsData.value?.items?.find((s) => s.id === std?.schoolId)
  const program = programsData.value?.items?.find(
    (p) => p.id === std?.programId
  )
  const { placement, ambiguous: placementAmbiguous } =
    resolveUniqueStudentPlacement(
      placementsData.value?.items ?? [],
      std?.id,
      std?.studentId
    )
  const org = orgsData.value?.items?.find(
    (o) => o.id === placement?.organizationId
  )

  let period = placementAmbiguous
    ? '[เลือกภาคการศึกษาของการฝึกงาน]'
    : '[ไม่พบข้อมูลช่วงเวลาฝึกงาน]'
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
    evaluation_grade: '[ไม่มีเกรดรวมตามนโยบาย MVP]',
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
  { key: 'academic_year', label: 'ปีการศึกษา', tag: '{{academic_year}}' },
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
  { key: 'issue_date', label: 'วันที่ออกเอกสาร', tag: '{{issue_date}}' },
  { key: 'doc_number', label: 'เลขที่เอกสาร', tag: '{{doc_number}}' }
]

// Format Selection Modal state
const isFormatSelectModalOpen = ref(false)

function openCreateChooser() {
  if (!canManageDocumentTemplates.value) return
  isFormatSelectModalOpen.value = true
}

function selectFormatAndOpenStudio(type: 'pdf' | 'certificate') {
  if (!canManageDocumentTemplates.value) return
  isFormatSelectModalOpen.value = false
  const code = `DOC-${type === 'certificate' ? 'CR' : 'TR'}-${Date.now().toString(36).toUpperCase()}`
  if (type === 'certificate') {
    const newDoc: DocumentTemplateItem = {
      id: `draft-${code}`,
      code,
      nameTh: 'ใบประกาศนียบัตรรับรองการฝึกงาน (Certificate of Completion)',
      nameEn: 'Certificate of Professional Internship Completion',
      docType: 'certificate',
      description:
        'เกียรติบัตรรับรองการผ่านการฝึกงานอย่างเป็นทางการ (A4 แนวนอน)',
      createdAt: new Date().toISOString(),
      status: 'inactive',
      versionStatus: 'draft',
      backgroundType: 'certificate_pattern',
      bgOpacity: 15,
      elements: JSON.parse(JSON.stringify(defaultCertificateElements))
    }
    activeEditingDoc.value = newDoc
  } else {
    const newDoc: DocumentTemplateItem = {
      id: `draft-${code}`,
      code,
      nameTh: 'ใบบันทึกผลการประเมินการฝึกงาน (Internship Transcript)',
      nameEn: 'Internship Transcript & Competency Report',
      docType: 'pdf',
      description:
        'เอกสารรายงานผลคะแนนสมรรถนะรายหมวด บันทึกเวลาฝึกงาน (A4 แนวตั้ง)',
      createdAt: new Date().toISOString(),
      status: 'inactive',
      versionStatus: 'draft',
      backgroundType: 'watermark',
      bgOpacity: 12,
      elements: JSON.parse(JSON.stringify(defaultTranscriptElements))
    }
    activeEditingDoc.value = newDoc
  }

  selectedElementId.value = activeEditingDoc.value?.elements?.[0]?.id || null
  savedEditorState.value = null
  isCanvaStudioOpen.value = true
  void refreshFontAssets()
}

async function refreshFontAssets(showError = true): Promise<void> {
  isLoadingFontAssets.value = true
  try {
    availableFontAssets.value = await fetchAllDocumentAssets('font')
  } catch (error: unknown) {
    if (showError) showTemplateApiError(error)
  } finally {
    isLoadingFontAssets.value = false
  }
}

async function refreshImageAssets(showError = true): Promise<void> {
  try {
    availableImageAssets.value = [
      ...(await fetchAllDocumentAssets('emblem')),
      ...(await fetchAllDocumentAssets('signature'))
    ]
  } catch (error: unknown) {
    if (showError) showTemplateApiError(error)
  }
}

async function fetchAllDocumentAssets(
  assetType: 'font' | 'emblem' | 'signature'
): Promise<DocumentAssetApiItem[]> {
  const firstPage = await api<DocumentAssetPage>('/document-assets', {
    query: { assetType, page: 1, pageSize: 100 }
  })
  const rest = await Promise.all(
    Array.from({ length: Math.max(0, firstPage.meta.totalPages - 1) }, (_, i) =>
      api<DocumentAssetPage>('/document-assets', {
        query: { assetType, page: i + 2, pageSize: 100 }
      })
    )
  )
  return [firstPage.items, ...rest.map((page) => page.items)].flat()
}

function handleSelectedFontFileChange(event: Event): void {
  const input = event.target
  selectedFontFile.value =
    input instanceof HTMLInputElement ? (input.files?.[0] ?? null) : null
}

async function uploadSelectedFont(): Promise<void> {
  if (!canManageDocumentTemplates.value) return
  const file = selectedFontFile.value
  const rightsBasis = fontRightsBasis.value.trim()
  if (!file || !rightsBasis || !fontRightsConfirmed.value) {
    toast.add({
      title: 'ข้อมูลฟอนต์ยังไม่ครบ',
      description: 'เลือกไฟล์ ระบุที่มาสิทธิ์ และยืนยันว่ามีสิทธิ์ใช้ไฟล์นี้',
      color: 'warning'
    })
    return
  }

  const form = new FormData()
  form.append('file', file)
  form.append('assetType', 'font')
  form.append('rightsBasis', rightsBasis)
  form.append('rightsConfirmed', 'true')
  isUploadingFontAsset.value = true
  try {
    const asset = await api<DocumentAssetApiItem>('/document-assets', {
      method: 'POST',
      body: form
    })
    availableFontAssets.value = [
      asset,
      ...availableFontAssets.value.filter((item) => item.key !== asset.key)
    ]
    selectedDocumentFontKey.value = asset.key
    selectedFontFile.value = null
    if (selectedFontFileInput.value) selectedFontFileInput.value.value = ''
    fontRightsConfirmed.value = false
    toast.add({
      title: 'ลงทะเบียนฟอนต์ในพื้นที่ส่วนตัวแล้ว',
      description:
        'ฟอนต์ถูกเลือกให้ Draft นี้ ต้องบันทึก Draft เพื่อเก็บการเลือก',
      color: 'success'
    })
  } catch (error: unknown) {
    showTemplateApiError(error)
  } finally {
    isUploadingFontAsset.value = false
  }
}

async function openCanvaStudio(doc?: DocumentTemplateItem) {
  if (!canManageDocumentTemplates.value) return
  if (!doc) {
    openCreateChooser()
    return
  }
  if (doc.templateStatus === 'archived') {
    toast.add({
      title: 'แม่แบบถูกเก็บถาวรแล้ว',
      description: 'เปิดดูและแก้ไขแม่แบบที่เก็บถาวรไม่ได้',
      color: 'warning'
    })
    return
  }

  if (!doc.versionId) {
    const isCert =
      doc.docType === 'certificate' || doc.code?.toUpperCase().includes('CERT')
    activeEditingDoc.value = {
      ...doc,
      canvasWidth: isCert ? 1024 : 794,
      canvasHeight: isCert ? 724 : 1040,
      requiresSchemaMigration: false,
      backgroundType:
        doc.backgroundType ?? (isCert ? 'certificate_pattern' : 'watermark'),
      bgOpacity: doc.bgOpacity ?? (isCert ? 15 : 12),
      elements: JSON.parse(
        JSON.stringify(
          isCert ? defaultCertificateElements : defaultTranscriptElements
        )
      )
    }
    selectedElementId.value = activeEditingDoc.value.elements[0]?.id || null
    savedEditorState.value = null
    isCanvaStudioOpen.value = true
    void refreshFontAssets()
    void refreshImageAssets()
    return
  }

  try {
    const version = await api<DocumentTemplateVersionApiRecord>(
      `/document-template-versions/${doc.versionId}`
    )
    if ((version.fontAssetKeys?.length ?? 0) > 1) {
      toast.add({
        title: 'แม่แบบมีการผูกฟอนต์หลายไฟล์',
        description:
          'renderer รุ่นนี้รองรับฟอนต์หลักหนึ่งไฟล์ จึงไม่เปิดบันทึกทับเพื่อป้องกันข้อมูลฟอนต์สูญหาย',
        color: 'warning'
      })
      return
    }
    const adapted = adaptCanonicalDocumentForEditor(
      version.canonicalJson,
      version.schemaVersion,
      version.placeholders
    )
    if (!adapted) {
      const isCert =
        doc.docType === 'certificate' ||
        (version.canonicalJson as Record<string, unknown>)?.docType ===
          'certificate' ||
        doc.code?.toUpperCase().includes('CERT')
      const defaultElements = isCert
        ? defaultCertificateElements
        : defaultTranscriptElements
      const rawElements = Array.isArray(version.canonicalJson?.elements)
        ? (version.canonicalJson.elements as CanvasElement[])
        : []
      const elements = rawElements.length > 0 ? rawElements : defaultElements
      const width =
        typeof version.canonicalJson?.width === 'number'
          ? version.canonicalJson.width
          : isCert
            ? 1024
            : 794
      const height =
        typeof version.canonicalJson?.height === 'number'
          ? version.canonicalJson.height
          : isCert
            ? 724
            : 1040

      activeEditingDoc.value = {
        ...doc,
        canvasWidth: width,
        canvasHeight: height,
        requiresSchemaMigration: true,
        nameTh: doc.nameTh,
        nameEn: doc.nameEn,
        description: doc.description,
        backgroundType: doc.backgroundType,
        bgOpacity: doc.bgOpacity,
        versionId: version.id,
        versionNumber: version.versionNumber,
        revision: version.revision ?? 1,
        versionStatus: version.status,
        fontAssetKeys: [...(version.fontAssetKeys ?? [])],
        elements: JSON.parse(JSON.stringify(elements))
      }
      selectedElementId.value = activeEditingDoc.value.elements[0]?.id || null
      savedEditorState.value = getStudioEditorState(activeEditingDoc.value)
      isCanvaStudioOpen.value = true
      toast.add({
        title: 'เปิดแม่แบบในตัวแก้ไขเรียบร้อย',
        description:
          'ระบบจัดเตรียมโครงร่าง Designer สำหรับแม่แบบนี้เรียบร้อยแล้ว เมื่อบันทึกจะอัปเดตเป็นรูปแบบมาตรฐาน',
        color: 'info'
      })
      void refreshFontAssets()
      void refreshImageAssets()
      return
    }
    const canonical = adapted.document
    const metadata = readEditorMetadata(canonical.editorMetadata)
    activeEditingDoc.value = {
      ...doc,
      canvasWidth: canonical.width,
      canvasHeight: canonical.height,
      requiresSchemaMigration: adapted.migratedFromV1,
      nameTh:
        typeof metadata.nameTh === 'string' ? metadata.nameTh : doc.nameTh,
      nameEn:
        typeof metadata.nameEn === 'string' ? metadata.nameEn : doc.nameEn,
      description:
        typeof metadata.description === 'string'
          ? metadata.description
          : doc.description,
      backgroundType: isBackgroundType(metadata.backgroundType)
        ? metadata.backgroundType
        : doc.backgroundType,
      bgOpacity:
        typeof metadata.bgOpacity === 'number'
          ? metadata.bgOpacity
          : doc.bgOpacity,
      versionId: version.id,
      versionNumber: version.versionNumber,
      revision: version.revision,
      versionStatus: version.status,
      fontAssetKeys: [...(version.fontAssetKeys ?? [])],
      elements: canonical.elements.map((element) =>
        structuredClone(element)
      ) as CanvasElement[]
    }
    selectedElementId.value = activeEditingDoc.value.elements[0]?.id || null
    savedEditorState.value = getStudioEditorState(activeEditingDoc.value)
    isCanvaStudioOpen.value = true
    if (adapted.migratedFromV1) {
      toast.add({
        title: 'เปิดแม่แบบรุ่นเก่าในตัวแก้ไขได้แล้ว',
        description:
          'บันทึกจะย้าย Draft นี้เป็น schema รุ่นใหม่ โดยเก็บฉบับ Published เดิมไว้',
        color: 'warning'
      })
    }
    void refreshFontAssets()
    void refreshImageAssets()
  } catch (error: unknown) {
    showTemplateApiError(error)
  }
}

function handleSelectedImageFileChange(event: Event): void {
  const input = event.target
  selectedImageFile.value =
    input instanceof HTMLInputElement ? (input.files?.[0] ?? null) : null
}

function selectedSignatureAssetKey(index: 0 | 1): string {
  const selected = selectedElement.value
  return selected?.type === 'signature'
    ? (selected.assetKeys?.[index] ?? '')
    : ''
}

function imageAssetLabel(key: string | undefined): string {
  if (!key) return 'ยังไม่เลือก asset ที่ได้รับอนุมัติ'
  return (
    availableImageAssets.value.find((asset) => asset.key === key)
      ?.originalName ?? 'ไม่พบ asset นี้ในคลังที่ใช้งานได้'
  )
}

function setSignatureAssetKey(index: 0 | 1, key: string): void {
  const selected = selectedElement.value
  if (selected?.type !== 'signature') return
  const keys: [string, string] = [
    selected.assetKeys?.[0] ?? '',
    selected.assetKeys?.[1] ?? ''
  ]
  keys[index] = key
  selected.assetKeys = keys
}

async function uploadSelectedImageAsset(): Promise<void> {
  if (!canManageDocumentTemplates.value) return
  const file = selectedImageFile.value
  const assetType = selectedImageAssetType.value
  const rightsBasis = imageRightsBasis.value.trim()
  if (!assetType || !file || !rightsBasis || !imageRightsConfirmed.value) {
    toast.add({
      title: 'ข้อมูลรูปภาพยังไม่ครบ',
      description:
        'เลือกไฟล์ PNG ระบุที่มาสิทธิ์ และยืนยันว่ามีสิทธิ์ใช้ไฟล์นี้',
      color: 'warning'
    })
    return
  }
  if (file.size === 0 || file.size > 8 * 1024 * 1024) {
    toast.add({
      title: 'ขนาดไฟล์ไม่ถูกต้อง',
      description: 'ไฟล์รูปภาพต้องมีขนาดไม่เกิน 8 MB',
      color: 'warning'
    })
    return
  }

  const form = new FormData()
  form.append('file', file)
  form.append('assetType', assetType)
  form.append('rightsBasis', rightsBasis)
  form.append('rightsConfirmed', 'true')
  isUploadingImageAsset.value = true
  try {
    const asset = await api<DocumentAssetApiItem>('/document-assets', {
      method: 'POST',
      body: form
    })
    availableImageAssets.value = [
      asset,
      ...availableImageAssets.value.filter((item) => item.key !== asset.key)
    ]
    if (assetType === 'emblem' && selectedElement.value?.type === 'emblem') {
      selectedElement.value.assetKey = asset.key
    }
    if (
      assetType === 'signature' &&
      selectedElement.value?.type === 'signature'
    ) {
      const keys = selectedElement.value.assetKeys ?? []
      const emptyIndex = keys[0] ? (keys[1] ? -1 : 1) : 0
      if (emptyIndex === 0 || emptyIndex === 1) {
        setSignatureAssetKey(emptyIndex, asset.key)
      }
    }
    selectedImageFile.value = null
    if (selectedImageFileInput.value) selectedImageFileInput.value.value = ''
    imageRightsBasis.value = ''
    imageRightsConfirmed.value = false
    toast.add({
      title: 'ลงทะเบียนรูปภาพส่วนตัวแล้ว',
      description:
        'รูปถูกเลือกให้ Draft นี้ ต้องบันทึก Draft เพื่อเก็บการเลือก',
      color: 'success'
    })
  } catch (error: unknown) {
    showTemplateApiError(error)
  } finally {
    isUploadingImageAsset.value = false
  }
}

function buildCanonicalJson(
  doc: DocumentTemplateItem
): Record<string, unknown> {
  const canvas = getDocumentCanvasSize(doc)
  return {
    width: canvas.width,
    height: canvas.height,
    elements: JSON.parse(JSON.stringify(doc.elements)) as CanvasElement[],
    editorMetadata: {
      nameTh: doc.nameTh,
      nameEn: doc.nameEn,
      description: doc.description,
      backgroundType: doc.backgroundType,
      bgOpacity: doc.bgOpacity
    }
  }
}

function requestCloseStudio(): void {
  if (isSavingTemplate.value || isPublishingTemplate.value) return
  if (
    hasUnsavedChanges.value &&
    !window.confirm(
      'มีการแก้ไขที่ยังไม่บันทึก ต้องการปิดและทิ้งการแก้ไขหรือไม่?'
    )
  ) {
    return
  }
  isCanvaStudioOpen.value = false
  activeEditingDoc.value = null
  savedEditorState.value = null
}

function getTemplatePlaceholders(elements: readonly CanvasElement[]): string[] {
  const content = JSON.stringify(elements)
  return [
    ...new Set(
      [...content.matchAll(/\{\{\s*([\w.-]+)\s*\}\}/g)].map(
        (match) => match[1] ?? ''
      )
    )
  ]
    .filter(Boolean)
    .sort()
}

async function publishStudioDraft(): Promise<void> {
  const doc = activeEditingDoc.value
  if (
    !doc ||
    !canManageDocumentTemplates.value ||
    !doc.templateId ||
    !doc.versionId ||
    doc.versionStatus !== 'draft' ||
    doc.templateStatus !== 'active' ||
    isSavingTemplate.value ||
    isPublishingTemplate.value
  ) {
    return
  }
  if (hasUnsavedChanges.value) {
    toast.add({
      title: 'บันทึก Draft ก่อนเผยแพร่',
      description: 'ระบบจะเผยแพร่เฉพาะ version ที่บันทึกแล้ว',
      color: 'warning'
    })
    return
  }
  if (
    !window.confirm(
      'ยืนยันเผยแพร่แม่แบบนี้หรือไม่? ฉบับ Published จะแก้ไขไม่ได้ และการออก PDF จริงยังปิดจนกว่าจะผ่านการตรวจรับอย่างเป็นทางการ'
    )
  ) {
    return
  }

  isPublishingTemplate.value = true
  try {
    const publishedVersion = await api<DocumentTemplateVersionApiRecord>(
      `/document-template-versions/${doc.versionId}/publish`,
      { method: 'POST' }
    )
    const publishedDoc: DocumentTemplateItem = {
      ...doc,
      versionId: publishedVersion.id,
      versionNumber: publishedVersion.versionNumber,
      revision: publishedVersion.revision,
      versionStatus: publishedVersion.status,
      status: 'active',
      templateStatus: 'active'
    }
    activeEditingDoc.value = publishedDoc
    documents.value = documents.value.map((item) => {
      if (item.templateId === doc.templateId) return publishedDoc
      if (item.docType === doc.docType) {
        return {
          ...item,
          status: 'inactive',
          templateStatus: 'archived'
        }
      }
      return item
    })
    toast.add({
      title: 'เผยแพร่แม่แบบแล้ว',
      description:
        'ระบบตรวจและล็อก version นี้แล้ว; การออก PDF ยังรอการตรวจรับอย่างเป็นทางการ',
      color: 'success'
    })
    void refreshTemplates().catch(() => {
      toast.add({
        title: 'เผยแพร่แล้ว แต่รีโหลดรายการไม่สำเร็จ',
        description:
          'แม่แบบถูก Published จาก API แล้ว; ลองรีโหลดรายการเพื่อยืนยันสถานะล่าสุด',
        color: 'warning'
      })
    })
  } catch (error: unknown) {
    const statusCode =
      typeof error === 'object' && error !== null && 'statusCode' in error
        ? Number(error.statusCode)
        : typeof error === 'object' && error !== null && 'status' in error
          ? Number(error.status)
          : undefined
    const description =
      statusCode === 403
        ? 'บัญชีนี้ไม่มีสิทธิ์เผยแพร่แม่แบบเอกสาร'
        : statusCode === 409
          ? 'Draft เปลี่ยนสถานะหรือ revision แล้ว กรุณาโหลดแม่แบบใหม่'
          : statusCode === 422
            ? 'แม่แบบไม่ผ่านการตรวจ schema, placeholder, geometry, asset หรือข้อมูลฟอนต์ แก้ Draft แล้วลองใหม่'
            : 'เผยแพร่ไม่สำเร็จ Draft ยังอยู่ กรุณาตรวจการเชื่อมต่อแล้วลองใหม่'
    toast.add({
      title: 'เผยแพร่แม่แบบไม่สำเร็จ',
      description,
      color: 'error'
    })
  } finally {
    isPublishingTemplate.value = false
  }
}

const isActivatingTemplate = ref<string | null>(null)

async function activateDocumentTemplate(
  doc: DocumentTemplateItem
): Promise<void> {
  if (!canManageDocumentTemplates.value || isActivatingTemplate.value) return
  const typeLabel = doc.docType === 'certificate' ? 'Certification' : 'PDF'

  if (
    !window.confirm(
      `ต้องการเปิดใช้งานแม่แบบ "${doc.nameTh}" เป็นแม่แบบ ${typeLabel} หลักหรือไม่?\n\n(ระบบจะเปิดใช้งานได้ประเภทละ 1 แม่แบบเท่านั้น โดยแม่แบบเดิมในประเภท ${typeLabel} จะถูกเปลี่ยนเป็นปิดใช้งาน)`
    )
  ) {
    return
  }

  isActivatingTemplate.value = doc.id
  try {
    await api(`/document-templates/${doc.id}/activate`, { method: 'POST' })

    documents.value = documents.value.map((item) => {
      if (item.docType === doc.docType) {
        if (item.id === doc.id) {
          return {
            ...item,
            status: 'active',
            templateStatus: 'active',
            versionStatus: 'published'
          }
        }
        return {
          ...item,
          status: 'inactive',
          templateStatus: 'archived'
        }
      }
      return item
    })

    toast.add({
      title: 'เปิดใช้งานแม่แบบสำเร็จ',
      description: `เปิดใช้งานแม่แบบ ${doc.code} เป็นแม่แบบ ${typeLabel} หลักเรียบร้อยแล้ว`,
      color: 'success'
    })

    void refreshTemplates().catch(() => {})
  } catch (error: unknown) {
    showTemplateApiError(error)
  } finally {
    isActivatingTemplate.value = null
  }
}

interface ActionMenuItem {
  readonly label: string
  readonly icon?: string
  readonly disabled?: boolean
  readonly onSelect?: () => void
}

function getDocMenuItems(doc: DocumentTemplateItem): ActionMenuItem[][] {
  const isCurrentlyActive =
    doc.templateStatus === 'active' && doc.versionStatus === 'published'
  const typeLabel = doc.docType === 'certificate' ? 'Certification' : 'PDF'

  const items: ActionMenuItem[] = [
    {
      label: 'เปิดใน Designer',
      icon: 'i-lucide-layout-template',
      onSelect: () => {
        void openCanvaStudio(doc)
      }
    }
  ]

  if (isCurrentlyActive) {
    items.push({
      label: `เปิดใช้งานอยู่ (${typeLabel} หลัก)`,
      icon: 'i-lucide-check-circle-2',
      disabled: true
    })
  } else {
    items.push({
      label: `เปิดใช้งาน (${typeLabel} หลัก)`,
      icon: 'i-lucide-power',
      onSelect: () => {
        void activateDocumentTemplate(doc)
      }
    })
  }

  return [items]
}

// Persist edits as versioned Drafts; PDF issuance remains disabled pending official UAT.
async function saveStudioChanges() {
  const doc = activeEditingDoc.value
  if (
    !canManageDocumentTemplates.value ||
    !doc ||
    isSavingTemplate.value ||
    isPublishingTemplate.value
  )
    return
  if (
    doc.templateId &&
    !doc.requiresSchemaMigration &&
    !hasUnsavedChanges.value
  ) {
    toast.add({
      title: 'ไม่มีการแก้ไขใหม่',
      description: 'ไม่สร้าง version เพิ่ม เพราะเนื้อหาเหมือนฉบับที่บันทึกแล้ว',
      color: 'neutral'
    })
    return
  }
  if (doc.backgroundType === 'custom') {
    toast.add({
      title: 'ยังบันทึกพื้นหลังนี้ไม่ได้',
      description:
        'อัปโหลด asset ผ่านพื้นที่จัดเก็บส่วนตัวก่อน จึงจะบันทึกพื้นหลังแบบกำหนดเองได้',
      color: 'warning'
    })
    return
  }

  const canonicalJson = buildCanonicalJson(doc)
  const placeholders = getTemplatePlaceholders(doc.elements)
  const payload = {
    schemaVersion: 2,
    canonicalJson,
    placeholders,
    fontAssetKeys: [...(doc.fontAssetKeys ?? [])]
  }
  isSavingTemplate.value = true
  try {
    let templateId = doc.templateId
    let savedVersion: DocumentTemplateVersionApiRecord
    if (!templateId) {
      const created = await api<PersistedDocumentTemplate>(
        '/document-templates',
        {
          method: 'POST',
          body: {
            code: doc.code,
            name: doc.nameTh,
            documentType:
              doc.docType === 'certificate' ? 'certificate' : 'transcript',
            ...payload
          }
        }
      )
      templateId = created.id
      const initialVersion = created.versions[0]
      if (!initialVersion) throw new Error('Initial template version missing')
      savedVersion = initialVersion
    } else if (doc.versionStatus === 'draft' && doc.versionId) {
      savedVersion = await api<DocumentTemplateVersionApiRecord>(
        `/document-template-versions/${doc.versionId}`,
        {
          method: 'PATCH',
          body: { revision: doc.revision ?? 1, ...payload }
        }
      )
    } else {
      savedVersion = await api<DocumentTemplateVersionApiRecord>(
        `/document-templates/${templateId}/versions`,
        { method: 'POST', body: payload }
      )
    }

    const savedDoc: DocumentTemplateItem = {
      ...doc,
      id: templateId,
      templateId,
      versionId: savedVersion.id,
      versionNumber: savedVersion.versionNumber,
      revision: savedVersion.revision,
      versionStatus: savedVersion.status,
      requiresSchemaMigration: false,
      fontAssetKeys: [...(savedVersion.fontAssetKeys ?? payload.fontAssetKeys)],
      isLegacy: false,
      status: savedVersion.status === 'published' ? 'active' : 'inactive'
    }
    documents.value = [
      savedDoc,
      ...documents.value.filter((item) => item.templateId !== templateId)
    ]
    activeEditingDoc.value = savedDoc
    savedEditorState.value = getStudioEditorState(savedDoc)
    toast.add({
      title: 'บันทึกฉบับร่างลงระบบแล้ว',
      description:
        'แม่แบบถูกบันทึกเป็น versioned Draft; ยังไม่เผยแพร่และยังออก PDF จริงไม่ได้',
      color: 'success'
    })
    await refreshTemplates()
  } catch (error: unknown) {
    showTemplateApiError(error)
  } finally {
    isSavingTemplate.value = false
  }
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
  const canvasWidth = getDocumentCanvasSize(activeEditingDoc.value).width
  const elWidth = selectedElement.value.width || 200
  selectedElement.value.x = Math.round((canvasWidth - elWidth) / 2)
}

function centerVertically() {
  if (!activeEditingDoc.value || !selectedElement.value) return
  const canvasHeight = getDocumentCanvasSize(activeEditingDoc.value).height
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
        ['1', '', '', '', ''],
        ['2', '', '', '', ''],
        ['3', '', '', '', '']
      ]
    }
  } else if (preset === 'blank_3x3') {
    tableData = {
      headers: ['หัวข้อคอลัมน์ 1', 'หัวข้อคอลัมน์ 2', 'หัวข้อคอลัมน์ 3'],
      rows: [
        ['', '', ''],
        ['', '', '']
      ]
    }
  } else {
    tableData = {
      headers: ['หมวดทักษะ', 'คะแนนเฉลี่ย', 'จำนวนข้อที่ตอบ'],
      rows: [
        ['Hard Skill', '—', '—'],
        ['Soft Skill', '—', '—']
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
  const newRow = Array(cols).fill('')
  selectedElement.value.tableData.rows.push(newRow)
}

function addTableColumn() {
  if (!selectedElement.value?.tableData) return
  const colNum = selectedElement.value.tableData.headers.length + 1
  selectedElement.value.tableData.headers.push(`หัวข้อ ${colNum}`)
  for (const row of selectedElement.value.tableData.rows) {
    row.push('')
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
</script>

<template>
  <div class="space-y-6">
    <UAlert
      color="warning"
      icon="i-lucide-shield-check"
      title="บันทึกแม่แบบเป็น Draft ผ่านระบบแล้ว"
      description="ผู้มีสิทธิ์เผยแพร่ Draft ที่ผ่านการตรวจของระบบได้; การออก PDF จริงยังปิดจนกว่า renderer, ฟอนต์, asset และลายเซ็นที่ได้รับอนุญาตจะผ่านการตรวจรับ"
      variant="soft"
    />

    <div
      v-if="templatesError"
      class="flex flex-col gap-2 sm:flex-row sm:items-center"
    >
      <UAlert
        class="flex-1"
        color="error"
        icon="i-lucide-circle-alert"
        title="โหลดแม่แบบจากระบบไม่สำเร็จ"
        description="ไม่แสดงข้อมูลตัวอย่างแทนข้อมูลจริง ตรวจสิทธิ์และการเชื่อมต่อ API แล้วลองใหม่"
        variant="soft"
      />
      <UButton
        color="neutral"
        icon="i-lucide-refresh-cw"
        label="ลองโหลดใหม่"
        :loading="templatesPending"
        @click="refreshTemplates()"
      />
    </div>

    <div
      v-if="referenceDataError"
      class="flex flex-col gap-2 sm:flex-row sm:items-center"
    >
      <UAlert
        class="flex-1"
        color="warning"
        icon="i-lucide-circle-alert"
        title="โหลดข้อมูลอ้างอิงไม่ครบ"
        description="รายชื่อนักศึกษา สำนักวิชา หลักสูตร ข้อมูล Placement หรือสถานประกอบการอาจไม่ครบ ระบบจะไม่แทนข้อมูลจริงด้วยข้อมูลตัวอย่าง"
        variant="soft"
      />
      <UButton
        color="neutral"
        icon="i-lucide-refresh-cw"
        label="ลองโหลดข้อมูลอ้างอิงใหม่"
        :loading="referenceDataPending"
        :disabled="referenceDataPending"
        @click="retryReferenceData"
      />
    </div>

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
        v-if="canManageDocumentTemplates"
        color="primary"
        icon="i-lucide-plus"
        label="สร้างเอกสารใหม่"
        size="lg"
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
            <SearchableSelect
              v-model="typeFilter"
              :options="docTypeOptions"
              search-placeholder="ค้นหารูปแบบ…"
              aria-label="รูปแบบเอกสาร"
            />
          </div>

          <div class="flex items-center gap-1.5">
            <label class="text-xs font-semibold text-muted whitespace-nowrap"
              >สถานะ:</label
            >
            <SearchableSelect
              v-model="statusFilter"
              :options="docStatusOptions"
              search-placeholder="ค้นหาสถานะ…"
              aria-label="สถานะเอกสาร"
            />
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
            รายการนี้ใช้สถานะจาก template version จริง; การแก้ไขสร้าง Draft ใหม่
            และยังไม่ถือว่าเอกสารถูกเผยแพร่หรือออกให้นักศึกษา
          </span>
        </div>
        <div class="flex flex-wrap items-center gap-3 text-[11px] font-mono">
          <span
            class="inline-flex items-center gap-1.5 rounded-md bg-rose-50 px-2 py-0.5 text-rose-700 ring-1 ring-rose-200 dark:bg-rose-950/40 dark:text-rose-400"
          >
            <span class="size-1.5 rounded-full bg-rose-500"></span>
            PDF ที่เปิดใช้งาน:
            <strong
              >{{
                documents.filter(
                  (d) => d.docType === 'pdf' && d.status === 'active'
                ).length
              }}/1</strong
            >
          </span>
          <span
            class="inline-flex items-center gap-1.5 rounded-md bg-amber-50 px-2 py-0.5 text-amber-700 ring-1 ring-amber-200 dark:bg-amber-950/40 dark:text-amber-400"
          >
            <span class="size-1.5 rounded-full bg-amber-500"></span>
            Certificate ที่เปิดใช้งาน:
            <strong
              >{{
                documents.filter(
                  (d) => d.docType === 'certificate' && d.status === 'active'
                ).length
              }}/1</strong
            >
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
            <tr v-if="templatesPending">
              <td colspan="7" class="py-12 text-center text-muted">
                <UIcon
                  name="i-lucide-loader-circle"
                  class="mx-auto mb-2 size-8 animate-spin text-primary"
                />
                <p class="font-medium">กำลังโหลดแม่แบบจากระบบ...</p>
              </td>
            </tr>
            <tr v-else-if="filteredDocuments.length === 0">
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
                  <button
                    v-if="canManageDocumentTemplates"
                    type="button"
                    class="text-left font-medium text-highlighted hover:underline hover:text-primary cursor-pointer transition-colors"
                    @click="openCanvaStudio(doc)"
                  >
                    {{ doc.nameTh }}
                  </button>
                  <p v-else class="font-medium text-highlighted">
                    {{ doc.nameTh }}
                  </p>
                  <p v-if="doc.nameEn" class="text-xs text-muted">
                    {{ doc.nameEn }}
                  </p>
                  <p
                    v-if="doc.description"
                    class="mt-0.5 line-clamp-1 text-[11px] text-muted/80"
                  >
                    {{ doc.description }}
                  </p>
                  <UBadge
                    v-if="doc.isLegacy"
                    class="mt-1"
                    color="warning"
                    label="Legacy — อ่านอย่างเดียว"
                    size="xs"
                    variant="subtle"
                  />
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

              <!-- Column 6: Persisted template/version state -->
              <td class="text-center">
                <UBadge
                  :color="
                    doc.templateStatus === 'active' &&
                    doc.versionStatus === 'published'
                      ? 'success'
                      : doc.versionStatus === 'draft'
                        ? 'warning'
                        : 'neutral'
                  "
                  size="sm"
                  variant="subtle"
                >
                  {{
                    doc.templateStatus === 'active' &&
                    doc.versionStatus === 'published'
                      ? 'เปิดใช้งานอยู่'
                      : doc.versionStatus === 'draft'
                        ? 'ฉบับร่าง'
                        : 'ปิดใช้งาน'
                  }}
                </UBadge>
              </td>

              <!-- Column 7: การจัดการ -->
              <td class="text-right">
                <div
                  v-if="canManageDocumentTemplates"
                  class="flex items-center justify-end"
                >
                  <UDropdownMenu
                    :items="getDocMenuItems(doc)"
                    :content="{ align: 'end' }"
                  >
                    <UButton
                      aria-label="การจัดการเอกสาร"
                      color="neutral"
                      icon="i-lucide-ellipsis-vertical"
                      size="sm"
                      variant="ghost"
                      :loading="isActivatingTemplate === doc.id"
                      class="!rounded-full size-8 p-0 flex items-center justify-center cursor-pointer hover:bg-muted/60"
                    />
                  </UDropdownMenu>
                </div>
                <span v-else class="text-xs text-muted">เผยแพร่แล้ว</span>
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
    <AppModal
      v-if="isFormatSelectModalOpen"
      :open="true"
      title="เลือกประเภทเอกสารที่ต้องการสร้าง"
      :ui="{
        content:
          'w-[calc(100%-2rem)] max-w-2xl max-h-[calc(100dvh-2rem)] overflow-y-auto'
      }"
      @update:open="
        ($event) => {
          if (!$event) {
            isFormatSelectModalOpen = false
          }
        }
      "
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
            aria-label="ปิดหน้าต่าง"
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
    </AppModal>

    <!-- ================================================================= -->
    <!-- CANVA-LIKE DOCUMENT DESIGNER STUDIO (FULL MODAL)                   -->
    <!-- ================================================================= -->
    <AppModal
      v-if="isCanvaStudioOpen && activeEditingDoc && canManageDocumentTemplates"
      :open="true"
      title="ออกแบบแม่แบบเอกสาร"
      fullscreen
      :ui="{ content: 'flex flex-col bg-slate-950 text-slate-100' }"
      @update:open="
        ($event) => {
          if (!$event) requestCloseStudio()
        }
      "
    >
      <div
        v-if="isSavingTemplate || isPublishingTemplate"
        class="absolute inset-0 z-[100] flex items-center justify-center bg-slate-950/75"
        role="status"
        aria-live="polite"
      >
        <div
          class="flex items-center gap-3 rounded-xl bg-slate-900 px-5 py-4 text-sm text-white shadow-xl"
        >
          <UIcon name="i-lucide-loader-circle" class="size-5 animate-spin" />
          {{
            isPublishingTemplate ? 'กำลังตรวจและเผยแพร่…' : 'กำลังบันทึก Draft…'
          }}
        </div>
      </div>
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
                :disabled="!!activeEditingDoc.templateId"
                class="bg-transparent text-base font-bold text-white border-b border-transparent hover:border-slate-700 focus:border-primary focus:outline-none transition-all"
                :style="{
                  width: `${Math.max(26, (activeEditingDoc.nameTh?.length || 10) + 3)}ch`,
                  minWidth: '320px',
                  maxWidth: '580px',
                  fieldSizing: 'content'
                }"
                placeholder="ชื่อเทมเพลตเอกสาร..."
                :title="
                  activeEditingDoc.templateId
                    ? 'ชื่อเทมเพลตคงที่หลังสร้าง'
                    : 'คลิกเพื่อแก้ไขชื่อเอกสาร'
                "
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
            v-if="
              canManageDocumentTemplates &&
              activeEditingDoc.templateId &&
              activeEditingDoc.versionId &&
              activeEditingDoc.versionStatus === 'draft' &&
              activeEditingDoc.templateStatus === 'active'
            "
            color="success"
            icon="i-lucide-shield-check"
            :label="isPublishingTemplate ? 'กำลังเผยแพร่...' : 'เผยแพร่แม่แบบ'"
            :loading="isPublishingTemplate"
            :disabled="
              isSavingTemplate || isPublishingTemplate || hasUnsavedChanges
            "
            :title="
              hasUnsavedChanges
                ? 'บันทึก Draft ก่อนเผยแพร่'
                : 'ตรวจสอบและเผยแพร่ Draft ที่บันทึกแล้ว'
            "
            @click="publishStudioDraft"
          />

          <UButton
            v-if="canManageDocumentTemplates"
            color="primary"
            icon="i-lucide-save"
            :label="isSavingTemplate ? 'กำลังบันทึก...' : 'บันทึก Draft'"
            :loading="isSavingTemplate"
            :disabled="isSavingTemplate || isPublishingTemplate"
            @click="saveStudioChanges"
          />

          <UButton
            color="neutral"
            icon="i-lucide-x"
            size="sm"
            variant="ghost"
            :disabled="isSavingTemplate || isPublishingTemplate"
            @click="requestCloseStudio"
          />
        </div>
      </div>

      <div
        v-if="canManageDocumentTemplates"
        class="no-print flex shrink-0 flex-wrap items-center gap-3 border-b border-slate-800 bg-slate-900 px-5 py-2 text-xs text-slate-300"
      >
        <div class="min-w-52">
          <p class="font-semibold text-white">ฟอนต์หลักสำหรับ PDF</p>
          <p class="text-[10px] text-slate-400">
            เลือกได้หนึ่งไฟล์; PDF ยังปิดจน renderer ผ่านการตรวจรับ
          </p>
        </div>
        <select
          v-model="selectedDocumentFontKey"
          aria-label="เลือกฟอนต์หลักสำหรับ PDF"
          class="h-8 min-w-48 rounded border border-slate-700 bg-slate-800 px-2 text-xs text-white"
          :disabled="isLoadingFontAssets"
        >
          <option value="">ไม่ระบุฟอนต์ที่อัปโหลด</option>
          <option
            v-if="selectedFontAssetUnavailable"
            :value="selectedDocumentFontKey"
          >
            ไม่พบ asset ที่เลือกไว้เดิม
          </option>
          <option
            v-for="asset in availableFontAssets"
            :key="asset.key"
            :value="asset.key"
          >
            {{ asset.originalName }} ·
            {{ asset.fontFamily ?? 'family ยังไม่ยืนยัน' }} ({{
              Math.ceil(asset.size / 1024)
            }}
            KB)
          </option>
        </select>
        <label
          class="flex items-center gap-2 rounded border border-slate-700 px-2 py-1.5"
        >
          <span>ไฟล์ TTF/OTF</span>
          <input
            ref="selectedFontFileInput"
            type="file"
            accept=".ttf,.otf,font/ttf,font/otf"
            class="max-w-48 text-[10px]"
            :disabled="isUploadingFontAsset"
            @change="handleSelectedFontFileChange"
          />
        </label>
        <input
          v-model="fontRightsBasis"
          type="text"
          maxlength="1000"
          aria-label="ที่มาของสิทธิ์ใช้ฟอนต์"
          placeholder="ที่มาสิทธิ์ใช้ฟอนต์ เช่น ใบอนุญาต"
          class="h-8 min-w-56 flex-1 rounded border border-slate-700 bg-slate-800 px-2 text-xs text-white placeholder:text-slate-500"
          :disabled="isUploadingFontAsset"
        />
        <label
          class="flex max-w-60 items-center gap-1.5 text-[10px] text-amber-200"
        >
          <input
            v-model="fontRightsConfirmed"
            type="checkbox"
            class="accent-amber-500"
            :disabled="isUploadingFontAsset"
          />
          ยืนยันว่ามีสิทธิ์ใช้ไฟล์นี้
        </label>
        <UButton
          size="xs"
          color="neutral"
          variant="outline"
          icon="i-lucide-upload"
          :label="
            isUploadingFontAsset ? 'กำลังอัปโหลด...' : 'อัปโหลดฟอนต์ส่วนตัว'
          "
          :loading="isUploadingFontAsset"
          :disabled="isUploadingFontAsset"
          @click="uploadSelectedFont"
        />
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
              width: `${studioCanvasWidth * canvasScale}px`,
              height: `${studioCanvasHeight * canvasScale}px`,
              margin: '3rem auto'
            }"
            @click.stop
          >
            <!-- Authentic A4 Paper Canvas Container -->
            <div
              id="printable-document"
              class="absolute left-0 top-0 origin-top-left border border-slate-300 bg-white text-slate-900 shadow-2xl transition-transform duration-150"
              :style="{
                width: `${studioCanvasWidth}px`,
                height: `${studioCanvasHeight}px`,
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
                  class="mx-auto flex min-h-20 w-32 flex-col items-center justify-center gap-1 rounded border border-dashed border-amber-600 bg-amber-50 p-2 text-amber-800"
                >
                  <UIcon name="i-lucide-image" class="size-6" />
                  <span class="max-w-full truncate text-center text-[9px]">
                    {{ imageAssetLabel(el.assetKey) }}
                  </span>
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

                <!-- Category score preview: never infer an overall grade. -->
                <div v-else-if="el.type === 'table'" class="w-full">
                  <p class="mb-1 text-[10px] text-slate-500" role="status">
                    ยังไม่ได้โหลดผลประเมินจริงในหน้าตัวอย่างนี้
                  </p>
                  <table
                    class="w-full border-collapse text-left text-xs bg-white/90 backdrop-blur-[1px]"
                  >
                    <thead>
                      <tr
                        class="border-y border-slate-300 bg-slate-100 font-bold text-slate-800"
                      >
                        <th class="py-2 pl-3">หมวดทักษะ</th>
                        <th class="py-2 text-center">คะแนนเฉลี่ย</th>
                        <th class="py-2 pr-3 text-right">จำนวนข้อที่ตอบ</th>
                      </tr>
                    </thead>
                    <tbody class="divide-y divide-slate-200">
                      <tr>
                        <td class="py-2.5 pl-3">
                          <p class="font-bold text-slate-900">Hard Skill</p>
                        </td>
                        <td class="text-center font-mono">—</td>
                        <td class="pr-3 text-right font-mono">—</td>
                      </tr>
                      <tr>
                        <td class="py-2.5 pl-3">
                          <p class="font-bold text-slate-900">Soft Skill</p>
                        </td>
                        <td class="text-center font-mono">—</td>
                        <td class="pr-3 text-right font-mono">—</td>
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
                    <p class="mb-1 text-[9px] text-amber-700">
                      {{ imageAssetLabel(el.assetKeys?.[0]) }}
                    </p>
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
                    <p class="mb-1 text-[9px] text-amber-700">
                      {{ imageAssetLabel(el.assetKeys?.[1]) }}
                    </p>
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

          <div v-if="selectedElement.type === 'emblem'" class="space-y-2">
            <label class="block text-[11px] font-semibold text-slate-400">
              ตราสัญลักษณ์ที่ลงทะเบียนและยืนยันสิทธิ์แล้ว
            </label>
            <select
              v-model="selectedElement.assetKey"
              class="w-full rounded-lg border border-slate-800 bg-slate-800/80 p-2 text-xs text-white"
            >
              <option value="">เลือก asset ตราสัญลักษณ์</option>
              <option
                v-for="asset in selectableImageAssets"
                :key="asset.key"
                :value="asset.key"
              >
                {{ asset.originalName }}
              </option>
            </select>
          </div>

          <div v-if="selectedElement.type === 'signature'" class="space-y-2">
            <label class="block text-[11px] font-semibold text-slate-400">
              ลายเซ็นที่ลงทะเบียนและยืนยันสิทธิ์แล้ว (ต้องครบ 2 รายการ)
            </label>
            <select
              :value="selectedSignatureAssetKey(0)"
              class="w-full rounded-lg border border-slate-800 bg-slate-800/80 p-2 text-xs text-white"
              @change="
                setSignatureAssetKey(
                  0,
                  ($event.target as HTMLSelectElement).value
                )
              "
            >
              <option value="">เลือกลายเซ็นผู้ควบคุมการฝึกงาน</option>
              <option
                v-for="asset in selectableImageAssets"
                :key="asset.key"
                :value="asset.key"
              >
                {{ asset.originalName }}
              </option>
            </select>
            <select
              :value="selectedSignatureAssetKey(1)"
              class="w-full rounded-lg border border-slate-800 bg-slate-800/80 p-2 text-xs text-white"
              @change="
                setSignatureAssetKey(
                  1,
                  ($event.target as HTMLSelectElement).value
                )
              "
            >
              <option value="">เลือกอาจารย์ผู้ประสานงาน</option>
              <option
                v-for="asset in selectableImageAssets"
                :key="asset.key"
                :value="asset.key"
              >
                {{ asset.originalName }}
              </option>
            </select>
          </div>

          <div
            v-if="canManageDocumentTemplates && selectedImageAssetType"
            class="space-y-2 rounded-lg border border-slate-700 p-2.5"
          >
            <p class="text-[11px] font-semibold text-amber-200">
              ลงทะเบียน PNG พร้อมหลักฐานสิทธิ์ใช้
            </p>
            <input
              ref="selectedImageFileInput"
              type="file"
              accept=".png,image/png"
              class="w-full text-[10px] text-slate-300"
              :disabled="isUploadingImageAsset"
              @change="handleSelectedImageFileChange"
            />
            <input
              v-model="imageRightsBasis"
              type="text"
              maxlength="1000"
              aria-label="ที่มาของสิทธิ์ใช้รูปภาพ"
              placeholder="เลขที่หนังสืออนุมัติหรือที่มาสิทธิ์"
              class="w-full rounded border border-slate-700 bg-slate-800 px-2 py-1.5 text-[10px] text-white"
              :disabled="isUploadingImageAsset"
            />
            <label class="flex items-start gap-1.5 text-[10px] text-amber-100">
              <input
                v-model="imageRightsConfirmed"
                type="checkbox"
                class="mt-0.5 accent-amber-500"
                :disabled="isUploadingImageAsset"
              />
              ยืนยันว่ามีสิทธิ์ใช้ไฟล์นี้ในเอกสารทางการ
            </label>
            <UButton
              size="xs"
              color="neutral"
              variant="outline"
              icon="i-lucide-upload"
              :label="
                isUploadingImageAsset
                  ? 'กำลังอัปโหลด...'
                  : 'อัปโหลดและแนบ asset'
              "
              :loading="isUploadingImageAsset"
              :disabled="isUploadingImageAsset"
              @click="uploadSelectedImageAsset"
            />
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
    </AppModal>
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
