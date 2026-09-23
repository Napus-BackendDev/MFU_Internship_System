<script setup lang="ts">
import * as XLSX from 'xlsx'
import { createSandboxedEmailPreviewDocument } from '~/utils/email-preview'

definePageMeta({ layout: 'app', middleware: 'auth' })

interface Student {
  readonly id: string
  readonly studentId: string
  readonly name: { readonly th: string; readonly en: string }
  readonly email: string
  readonly personalEmail?: string
  readonly schoolId: string
  readonly programId: string
  readonly courseId?: string
  readonly academicTermId?: string
  readonly semester?: string
  readonly company?: string
  readonly companyAddress?: string
  readonly province?: string
  readonly evaluatorName?: string
  readonly evaluatorEmail?: string
  readonly status: string
  readonly evaluationStatus?:
    'awaiting_evaluator' | 'awaiting_response' | 'submitted' | string
  readonly admissionYear?: number
  readonly createdAt?: string
  readonly updatedAt?: string
}

interface StudentPage {
  readonly items: readonly Student[]
  readonly meta: { readonly total: number }
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

interface CourseItem {
  readonly id: string
  readonly courseCode: string
  readonly name: { readonly th: string; readonly en: string }
  readonly credits?: number
}

interface TermItem {
  readonly id: string
  readonly code: string
  readonly semester: string
  readonly academicYear: number
}

interface OrganizationItem {
  readonly id: string
  readonly organizationCode: string
  readonly name: { readonly th: string; readonly en: string }
  readonly address?: Readonly<Record<string, string>>
}

interface ParsedStudentRow {
  readonly id: string
  readonly sheet: string
  readonly rowNumber: number
  readonly student?: {
    readonly studentId: string
    readonly name: { readonly th: string; readonly en: string }
    readonly email: string
    readonly schoolId: string
    readonly programId: string
    readonly schoolReference?: string
    readonly programReference?: string
    readonly course?: string
    readonly semester?: string
    readonly company?: string
    readonly province?: string
    readonly admissionYear?: number
  }
  readonly action: 'create' | 'update' | 'unchanged' | 'invalid'
  readonly status: 'pending' | 'committed' | 'skipped'
  readonly outcome?: 'created' | 'updated' | 'unchanged' | 'skipped'
  readonly issues: readonly {
    readonly code: string
    readonly message: string
  }[]
  readonly warnings: readonly {
    readonly code: string
    readonly message: string
  }[]
  readonly changes: readonly {
    readonly field: string
    readonly before: unknown
    readonly after: unknown
  }[]
  selected: boolean
}

interface StudentImportBatchResponse {
  readonly batchId: string
  readonly status: 'preview' | 'committed'
  readonly questionFieldsDetected: readonly string[]
  readonly summary: {
    readonly total: number
    readonly creates: number
    readonly updates: number
    readonly unchanged: number
    readonly invalid: number
    readonly warnings: number
    readonly committed: number
  }
  readonly items: readonly Omit<ParsedStudentRow, 'selected'>[]
}

const api = useApi()
const toast = useToast()

const search = ref('')
const selectedSchool = ref('all')
const selectedProgram = ref('all')
const selectedEvaluationStatus = ref('all')
const page = ref(1)
const pageSize = ref(5)

// Fetch students list with school, program, evaluationStatus, and search filters
const { data, error, pending, refresh } = await useAsyncData(
  'students',
  () =>
    api<StudentPage>('/students', {
      query: {
        page: page.value,
        pageSize: pageSize.value,
        search: search.value || undefined,
        schoolId:
          selectedSchool.value !== 'all' ? selectedSchool.value : undefined,
        programId:
          selectedProgram.value !== 'all' ? selectedProgram.value : undefined,
        evaluationStatus:
          selectedEvaluationStatus.value !== 'all'
            ? selectedEvaluationStatus.value
            : undefined
      }
    }),
  {
    watch: [
      page,
      search,
      pageSize,
      selectedSchool,
      selectedProgram,
      selectedEvaluationStatus
    ]
  }
)

const availablePrograms = computed(() => {
  const allProgs = programsData.value?.items ?? []
  if (selectedSchool.value === 'all') return allProgs
  return allProgs.filter((p) => p.schoolId === selectedSchool.value)
})

watch(selectedSchool, () => {
  selectedProgram.value = 'all'
  page.value = 1
})

watch([search, pageSize, selectedProgram, selectedEvaluationStatus], () => {
  page.value = 1
})

function resetFilters(): void {
  search.value = ''
  selectedSchool.value = 'all'
  selectedProgram.value = 'all'
  selectedEvaluationStatus.value = 'all'
  page.value = 1
}

// Fetch schools and programs for dropdowns and matching
const { data: schoolsData } = await useAsyncData('students-schools', () =>
  api<{ items: SchoolItem[] }>('/academic/schools', {
    query: { pageSize: 100 }
  }).catch(() => ({ items: [] }))
)

const { data: programsData } = await useAsyncData('students-programs', () =>
  api<{ items: ProgramItem[] }>('/academic/programs', {
    query: { pageSize: 100 }
  }).catch(() => ({ items: [] }))
)

const { data: coursesData } = await useAsyncData('students-courses', () =>
  api<{ items: CourseItem[] }>('/academic/courses', {
    query: { pageSize: 100 }
  }).catch(() => ({ items: [] }))
)

const { data: termsData } = await useAsyncData('students-terms', () =>
  api<{ items: TermItem[] }>('/academic/terms', {
    query: { pageSize: 100 }
  }).catch(() => ({ items: [] }))
)

const { data: organizationsData } = await useAsyncData(
  'students-organizations',
  () =>
    api<{ items: OrganizationItem[] }>('/organizations', {
      query: { pageSize: 100 }
    }).catch(() => ({ items: [] }))
)

interface ProvinceMasterItem {
  id: string
  code?: string
  nameTh: string
  nameEn: string
  region?: string
  status?: string
}

const { data: provincesMasterData } = await useAsyncData(
  'students-master-provinces',
  () =>
    api<{ items: ProvinceMasterItem[] }>('/system-settings/provinces', {
      query: { status: 'active' }
    }).catch(() => ({ items: [] }))
)

const REGIONS_ORDER = [
  'ภาคเหนือ',
  'ภาคกลาง',
  'ภาคตะวันออกเฉียงเหนือ',
  'ภาคใต้',
  'ภาคตะวันออก',
  'ภาคตะวันตก'
] as const

const provinceRegions = computed(() => {
  const presentRegions = new Set<string>()
  for (const p of provincesMasterData.value?.items || []) {
    if (p.region) presentRegions.add(p.region)
  }
  const ordered: string[] = []
  for (const r of REGIONS_ORDER) {
    if (presentRegions.has(r)) ordered.push(r)
  }
  for (const r of presentRegions) {
    if (!ordered.includes(r)) ordered.push(r)
  }
  return ordered
})

function getProvincesByRegion(region: string) {
  return (provincesMasterData.value?.items || [])
    .filter((p) => p.region === region && (p.status === 'active' || !p.status))
    .sort((a, b) => a.nameTh.localeCompare(b.nameTh, 'th'))
}

function getProvincesWithoutRegion() {
  return (provincesMasterData.value?.items || [])
    .filter((p) => !p.region && (p.status === 'active' || !p.status))
    .sort((a, b) => a.nameTh.localeCompare(b.nameTh, 'th'))
}

function isProvinceInMaster(name: string) {
  return (provincesMasterData.value?.items || []).some(
    (p) => p.nameTh === name || p.nameEn === name
  )
}

interface PlacementItem {
  readonly id: string
  readonly studentId: string
  readonly organizationId?: string
  readonly academicTermId: string
  readonly courseId?: string
}

const { data: placementsData } = await useAsyncData('students-placements', () =>
  api<{ items: PlacementItem[] }>('/placements', {
    query: { pageSize: 100 }
  }).catch(() => ({ items: [] }))
)

interface CompetencySetItem {
  readonly id: string
  readonly code: string
  readonly name: { readonly th: string; readonly en: string }
  readonly status: string
  readonly createdAt?: string
}

interface QuestionPreview {
  readonly id: string
  readonly label: { readonly th: string; readonly en: string }
  readonly type: string
  readonly required?: boolean
}

interface SectionPreview {
  readonly id: string
  readonly title: { readonly th: string; readonly en: string }
  readonly category?: 'general' | 'special' | 'suggestion'
  readonly schoolId?: string
  readonly programId?: string
  readonly questions: readonly QuestionPreview[]
}

interface CompetencyVersionItem {
  readonly id: string
  readonly competencySetId: string
  readonly versionNumber: number
  readonly status: string
  readonly sections: readonly SectionPreview[]
}

const { data: evaluationFormsData } = await useAsyncData(
  'students-eval-forms',
  () =>
    api<{ items: CompetencySetItem[] }>('/competency-sets', {
      query: { pageSize: 100 }
    }).catch(() => ({ items: [] }))
)

const activeCompetencyForms = computed(() =>
  (evaluationFormsData.value?.items ?? []).filter(
    (form) => form.status === 'active'
  )
)

// Helper lookup for names
function getSchoolDisplay(schoolId: string): string {
  const s = schoolsData.value?.items?.find(
    (item) => item.id === schoolId || item.schoolCode === schoolId
  )
  if (s) return s.name.th
  return (schoolId || '-').replace(/^[A-Za-z0-9_]+\s*[-—]\s*/, '')
}

function getProgramDisplay(programId: string): string {
  const p = programsData.value?.items?.find(
    (item) => item.id === programId || item.programCode === programId
  )
  if (p) return p.name.th
  return (programId || '-').replace(/^[A-Za-z0-9_]+\s*[-—]\s*/, '')
}

function getCourseDisplay(student: Student): string {
  // 1. Direct course on student
  const directId = student.courseId
  if (directId) {
    const c = coursesData.value?.items?.find(
      (item) => item.id === directId || item.courseCode === directId
    )
    if (c) return c.name.th
    return directId
  }

  // 2. From student's placement
  const placement = placementsData.value?.items?.find(
    (p) => p.studentId === student.id || p.studentId === student.studentId
  )
  if (placement?.courseId) {
    const c = coursesData.value?.items?.find(
      (item) =>
        item.id === placement.courseId || item.courseCode === placement.courseId
    )
    if (c) return c.name.th
    return placement.courseId
  }

  // 3. If courses exist in DB, fallback to the main course
  const defaultCourse = coursesData.value?.items?.[0]
  if (defaultCourse) {
    return defaultCourse.name.th
  }

  return '-'
}

function getStudentCourseTrack(student: Student): {
  display: string
  color: 'primary' | 'neutral'
  icon: string
} {
  const directId = student.courseId
  const c = directId
    ? coursesData.value?.items?.find(
        (item) => item.id === directId || item.courseCode === directId
      )
    : null
  const placement = placementsData.value?.items?.find(
    (p) => p.studentId === student.id || p.studentId === student.studentId
  )
  const placementCourse = placement?.courseId
    ? coursesData.value?.items?.find(
        (item) =>
          item.id === placement.courseId ||
          item.courseCode === placement.courseId
      )
    : null

  const resolvedCourse = c || placementCourse || coursesData.value?.items?.[0]
  const rawCourse = (student as unknown as { course?: string }).course || ''

  if (rawCourse) {
    if (
      rawCourse.toLowerCase().includes('coop') ||
      rawCourse.includes('สหกิจ')
    ) {
      return {
        display: 'Cooperative Education',
        color: 'primary',
        icon: 'i-lucide-briefcase'
      }
    } else if (
      rawCourse.toLowerCase().includes('intern') ||
      rawCourse.includes('ฝึกงาน')
    ) {
      return {
        display: 'Internship',
        color: 'neutral',
        icon: 'i-lucide-graduation-cap'
      }
    } else {
      return {
        display: rawCourse,
        color: 'neutral',
        icon: 'i-lucide-graduation-cap'
      }
    }
  } else if (resolvedCourse) {
    const en = resolvedCourse.name?.en || ''
    const th = resolvedCourse.name?.th || ''
    if (en.toLowerCase().includes('coop') || th.includes('สหกิจ')) {
      return {
        display: 'Cooperative Education',
        color: 'primary',
        icon: 'i-lucide-briefcase'
      }
    } else {
      return {
        display: 'Internship',
        color: 'neutral',
        icon: 'i-lucide-graduation-cap'
      }
    }
  }

  return {
    display: 'Cooperative Education',
    color: 'primary',
    icon: 'i-lucide-briefcase'
  }
}

function getSemesterDisplay(student: Student): string {
  // 1. Direct semester string from student
  if (student.semester) return student.semester

  // 2. From student academicTermId or placement
  const termId =
    student.academicTermId ||
    placementsData.value?.items?.find(
      (p) => p.studentId === student.id || p.studentId === student.studentId
    )?.academicTermId

  if (termId) {
    const t = termsData.value?.items?.find(
      (item) => item.id === termId || item.code === termId
    )
    if (t) return t.code
  }

  // 3. Fallback to first available term in DB
  const defaultTerm = termsData.value?.items?.[0]
  if (defaultTerm) return defaultTerm.code

  return '-'
}

function getAcademicYearDisplay(student: Student): string {
  // 1. From academicTermId linked term
  const termId =
    student.academicTermId ||
    placementsData.value?.items?.find(
      (p) => p.studentId === student.id || p.studentId === student.studentId
    )?.academicTermId

  if (termId) {
    const t = termsData.value?.items?.find(
      (item) => item.id === termId || item.code === termId
    )
    if (t?.academicYear) {
      const y = Number(t.academicYear)
      return String(y > 2400 ? y : y + 543)
    }
  }

  // 2. Admission year calculation (admissionYear + 4, matching Dashboard)
  const admitBE =
    student.admissionYear ||
    (student.studentId && /^\d{2}/.test(student.studentId)
      ? 2500 + parseInt(student.studentId.slice(0, 2), 10)
      : undefined)

  if (admitBE) {
    if (admitBE >= 2566) {
      return String(admitBE)
    }
    return String(admitBE + 4)
  }

  // 3. Fallback to default term academicYear or 2566
  const defaultTerm = termsData.value?.items?.[0]
  if (defaultTerm?.academicYear) {
    const y = Number(defaultTerm.academicYear)
    return String(y > 2400 ? y : y + 543)
  }

  return '2566'
}

function formatSemesterText(rawSemester?: string): string {
  if (!rawSemester || rawSemester === '-') return '-'
  const trimmed = rawSemester.trim()
  const lower = trimmed.toLowerCase()

  if (
    lower === 'first' ||
    lower === '1' ||
    lower === 'ต้น' ||
    trimmed === 'ภาคการศึกษาต้น' ||
    trimmed === 'ภาคการศึกษาที่ 1'
  ) {
    return 'ภาคการศึกษาต้น'
  }

  if (
    lower === 'second' ||
    lower === '2' ||
    lower === 'ปลาย' ||
    trimmed === 'ภาคการศึกษาปลาย' ||
    trimmed === 'ภาคการศึกษาที่ 2'
  ) {
    return 'ภาคการศึกษาปลาย'
  }

  if (
    lower === 'third' ||
    lower === '3' ||
    lower === 'summer' ||
    trimmed.includes('ฤดูร้อน') ||
    trimmed === 'ภาคการศึกษาที่ 3'
  ) {
    return 'ภาคการศึกษาฤดูร้อน'
  }

  if (trimmed.startsWith('1/')) {
    return `ภาคการศึกษาต้น/${trimmed.slice(2)}`
  }
  if (trimmed.startsWith('2/')) {
    return `ภาคการศึกษาปลาย/${trimmed.slice(2)}`
  }
  if (trimmed.startsWith('3/')) {
    return `ภาคการศึกษาฤดูร้อน/${trimmed.slice(2)}`
  }

  if (trimmed.includes('ภาคการศึกษา')) return trimmed
  return `ภาคการศึกษา ${trimmed}`
}

function getCompanyDisplay(student: Student): string {
  if (student.company) return student.company
  const placement = placementsData.value?.items?.find(
    (p) => p.studentId === student.id || p.studentId === student.studentId
  )
  if (placement?.organizationId) {
    const org = organizationsData.value?.items?.find(
      (o) =>
        o.id === placement.organizationId ||
        o.organizationCode === placement.organizationId
    )
    if (org) return org.name.th || org.name.en
    return placement.organizationId
  }
  return '-'
}

function getProvinceDisplay(student: Student): string {
  if (student.province) return student.province
  const placement = placementsData.value?.items?.find(
    (p) => p.studentId === student.id || p.studentId === student.studentId
  )
  if (placement?.organizationId) {
    const org = organizationsData.value?.items?.find(
      (o) =>
        o.id === placement.organizationId ||
        o.organizationCode === placement.organizationId
    )
    if (org?.address?.province) return org.address.province
  }
  return '-'
}

function getCompanyAddressDisplay(student: Student): string {
  if ((student as unknown as { companyAddress?: string }).companyAddress) {
    return (student as unknown as { companyAddress?: string }).companyAddress!
  }
  const placement = placementsData.value?.items?.find(
    (p) => p.studentId === student.id || p.studentId === student.studentId
  )
  if (placement?.organizationId) {
    const org = organizationsData.value?.items?.find(
      (o) =>
        o.id === placement.organizationId ||
        o.organizationCode === placement.organizationId
    )
    if (org?.address) {
      const addr =
        org.address.street ||
        org.address.location ||
        (org.address as unknown as { fullAddress?: string }).fullAddress ||
        org.address.province ||
        ''
      if (addr) return addr
    }
  }
  if (student.province) return student.province
  return '-'
}

// Date time formatter for createdAt and updatedAt
function formatDateTime(isoStr?: string): string {
  if (!isoStr) return '-'
  try {
    const d = new Date(isoStr)
    if (isNaN(d.getTime())) return '-'
    const dateStr = d.toLocaleDateString('th-TH', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    })
    const timeStr = d.toLocaleTimeString('th-TH', {
      hour: '2-digit',
      minute: '2-digit'
    })
    return `${dateStr} ${timeStr} น.`
  } catch {
    return '-'
  }
}

// Helper: 3 Student Evaluation Statuses (แบบ 3)
// 1. รอระบุผู้ประเมิน (awaiting_evaluator)
// 2. ส่งคำขอประเมินแล้ว (awaiting_response)
// 3. ส่งผลประเมินแล้ว (submitted)
function getStudentEvaluationStatus(student: Student) {
  const status = student.evaluationStatus || 'awaiting_evaluator'

  if (status === 'submitted') {
    return {
      code: 'submitted',
      label: 'ส่งผลประเมินแล้ว',
      color: 'success' as const,
      icon: 'i-lucide-check-circle-2',
      description: 'นักศึกษาได้รับการประเมินผลเรียบร้อยแล้ว'
    }
  }
  if (status === 'email_error') {
    return {
      code: 'email_error',
      label: 'ส่งอีเมลผิดพลาด',
      color: 'error' as const,
      icon: 'i-lucide-alert-triangle',
      description:
        'ส่งอีเมลแบบประเมินไม่สำเร็จ เนื่องจากที่อยู่อีเมลไม่ถูกต้องหรือการส่งล้มเหลว'
    }
  }
  if (status === 'awaiting_response') {
    return {
      code: 'awaiting_response',
      label: 'ส่งคำขอประเมินแล้ว',
      color: 'warning' as const,
      icon: 'i-lucide-mail-check',
      description: 'ส่งอีเมลขอประเมินแล้ว กำลังรอผู้ประเมินบันทึกผล'
    }
  }
  return {
    code: 'awaiting_evaluator',
    label: 'รอระบุผู้ประเมิน',
    color: 'neutral' as const,
    icon: 'i-lucide-user-x',
    description: 'ยังไม่ได้ระบุหรือส่งข้อมูลให้ผู้ประเมิน'
  }
}

// Edit Student Modal state
const isEditModalOpen = ref(false)
const isEditSubmitting = ref(false)
const editingStudentId = ref<string>('')

const editForm = ref({
  studentId: '',
  nameTh: '',
  nameEn: '',
  email: '',
  personalEmail: '',
  schoolId: '',
  programId: '',
  courseId: '',
  semester: '',
  company: '',
  companyAddress: '',
  province: '',
  evaluatorName: '',
  evaluatorEmail: '',
  academicYear: 2569,
  admissionYear: 2565
})

const availableProgramsForEditSchool = computed(() => {
  if (!editForm.value.schoolId) return programsData.value?.items || []
  return (
    programsData.value?.items?.filter(
      (p) => p.schoolId === editForm.value.schoolId
    ) || []
  )
})

function openEditStudentModal(student: Student) {
  editingStudentId.value = student.id
  editForm.value = {
    studentId: student.studentId,
    nameTh: student.name.th,
    nameEn: student.name.en,
    email: student.email,
    personalEmail: student.personalEmail || '',
    schoolId: student.schoolId,
    programId: student.programId,
    courseId: student.courseId || '',
    semester: student.semester
      ? formatSemesterText(student.semester) !== '-'
        ? formatSemesterText(student.semester)
        : student.semester
      : 'ภาคการศึกษาต้น',
    company: student.company || '',
    companyAddress:
      (student as unknown as { companyAddress?: string }).companyAddress || '',
    province: student.province || '',
    evaluatorName: student.evaluatorName || '',
    evaluatorEmail: student.evaluatorEmail || '',
    academicYear: Number(getAcademicYearDisplay(student)) || 2569,
    admissionYear: student.admissionYear || 2565
  }
  isEditModalOpen.value = true
}

async function handleEditSubmit() {
  if (!editingStudentId.value) return
  isEditSubmitting.value = true
  try {
    await api(`/students/${editingStudentId.value}`, {
      method: 'PATCH',
      body: {
        name: {
          th: editForm.value.nameTh.trim(),
          en: editForm.value.nameEn.trim()
        },
        email: editForm.value.email.trim().toLowerCase(),
        personalEmail: editForm.value.personalEmail.trim()
          ? editForm.value.personalEmail.trim().toLowerCase()
          : undefined,
        schoolId: editForm.value.schoolId,
        programId: editForm.value.programId,
        courseId: editForm.value.courseId || undefined,
        semester: editForm.value.semester || undefined,
        company: editForm.value.company.trim() || undefined,
        companyAddress: editForm.value.companyAddress.trim() || undefined,
        province: editForm.value.province.trim() || undefined,
        evaluatorName: editForm.value.evaluatorName?.trim() || undefined,
        evaluatorEmail:
          editForm.value.evaluatorEmail?.trim()?.toLowerCase() || undefined,
        academicYear: Number(editForm.value.academicYear) || undefined,
        admissionYear: Number(editForm.value.admissionYear) || undefined
      }
    })

    toast.add({
      title: 'อัปเดตข้อมูลนักศึกษาสำเร็จ',
      description: `อัปเดตข้อมูล ${editForm.value.nameTh} (${editForm.value.studentId}) เรียบร้อยแล้ว`,
      color: 'success'
    })

    isEditModalOpen.value = false
    await refresh()
  } catch (err: unknown) {
    const msg =
      err instanceof Error ? err.message : 'เกิดข้อผิดพลาดในการอัปเดตข้อมูล'
    toast.add({
      title: 'อัปเดตข้อมูลไม่สำเร็จ',
      description: msg,
      color: 'error'
    })
  } finally {
    isEditSubmitting.value = false
  }
}

// =========================================================================
// MODAL 1: MANUAL ADD STUDENT (เพิ่มข้อมูลด้วยตัวเอง)
// =========================================================================
const isManualModalOpen = ref(false)
const isManualSubmitting = ref(false)

interface ManualStudentForm {
  studentId: string
  nameTh: string
  nameEn: string
  email: string
  personalEmail: string
  schoolId: string
  programId: string
  courseId: string
  academicTermId: string
  company: string
  province: string
  admissionYear?: number
  status: 'active'
}

const manualForm = ref<ManualStudentForm>({
  studentId: '',
  nameTh: '',
  nameEn: '',
  email: '',
  personalEmail: '',
  schoolId: '',
  programId: '',
  courseId: '',
  academicTermId: '',
  company: '',
  province: '',
  admissionYear: undefined,
  status: 'active'
})

// Filter programs when schoolId changes
const availableProgramsForSchool = computed(() => {
  if (!manualForm.value.schoolId) return programsData.value?.items || []
  return (
    programsData.value?.items?.filter(
      (p) => p.schoolId === manualForm.value.schoolId
    ) || []
  )
})

function openManualAddModal() {
  manualForm.value = {
    studentId: '',
    nameTh: '',
    nameEn: '',
    email: '',
    personalEmail: '',
    schoolId: '',
    programId: '',
    courseId: '',
    academicTermId: '',
    company: '',
    province: '',
    admissionYear: undefined,
    status: 'active'
  }
  isManualModalOpen.value = true
}

async function handleManualAddSubmit() {
  if (
    !manualForm.value.studentId.trim() ||
    !manualForm.value.nameTh.trim() ||
    !manualForm.value.nameEn.trim() ||
    !manualForm.value.email.trim() ||
    !manualForm.value.schoolId ||
    !manualForm.value.programId
  ) {
    toast.add({
      title: 'กรุณากรอกข้อมูลให้ครบถ้วน',
      description:
        'โปรดระบุรหัสนักศึกษา, ชื่อ-นามสกุล, อีเมล, สำนักวิชา และหลักสูตร',
      color: 'error'
    })
    return
  }

  isManualSubmitting.value = true
  try {
    await api('/students', {
      method: 'POST',
      body: {
        studentId: manualForm.value.studentId.trim(),
        name: {
          th: manualForm.value.nameTh.trim(),
          en: manualForm.value.nameEn.trim()
        },
        email: manualForm.value.email.trim().toLowerCase(),
        personalEmail: manualForm.value.personalEmail.trim()
          ? manualForm.value.personalEmail.trim().toLowerCase()
          : undefined,
        schoolId: manualForm.value.schoolId,
        programId: manualForm.value.programId,
        courseId: manualForm.value.courseId || undefined,
        academicTermId: manualForm.value.academicTermId || undefined,
        company: manualForm.value.company.trim() || undefined,
        province: manualForm.value.province.trim() || undefined,
        admissionYear: manualForm.value.admissionYear
          ? Number(manualForm.value.admissionYear)
          : undefined,
        status: manualForm.value.status
      }
    })

    toast.add({
      title: 'เพิ่มข้อมูลนักศึกษาสำเร็จ',
      description: `เพิ่มนักศึกษา ${manualForm.value.nameTh} (${manualForm.value.studentId}) เข้าสู่ระบบแล้ว`,
      color: 'success'
    })

    isManualModalOpen.value = false
    await refresh()
  } catch (err: unknown) {
    const msg =
      err instanceof Error
        ? err.message
        : 'เกิดข้อผิดพลาดในการบันทึกข้อมูลนักศึกษา'
    toast.add({
      title: 'เพิ่มนักศึกษาไม่สำเร็จ',
      description: msg,
      color: 'error'
    })
  } finally {
    isManualSubmitting.value = false
  }
}

// =========================================================================
// MODAL 2: EXCEL IMPORT (นำเข้าข้อมูลผ่านไฟล์ Excel)
// =========================================================================
const isExcelModalOpen = ref(false)
const isExcelImporting = ref(false)
const parsedRows = ref<ParsedStudentRow[]>([])
const selectedFileName = ref<string>('')
const studentImportBatchId = ref<string | null>(null)
const importQuestionFields = ref<string[]>([])
const importCommitKeys = ref<Record<string, string>>({})
const excelPreviewPage = ref(1)
const excelPreviewPageSize = 5
const selectedImportCount = computed(
  () =>
    parsedRows.value.filter(
      (row) =>
        row.selected &&
        row.status === 'pending' &&
        (row.action === 'create' || row.action === 'update')
    ).length
)
const paginatedParsedRows = computed(() => {
  const start = (excelPreviewPage.value - 1) * excelPreviewPageSize
  return parsedRows.value.slice(start, start + excelPreviewPageSize)
})

function openExcelImportModal() {
  parsedRows.value = []
  selectedFileName.value = ''
  studentImportBatchId.value = null
  importQuestionFields.value = []
  importCommitKeys.value = {}
  excelPreviewPage.value = 1
  isExcelModalOpen.value = true
}

// Download Excel Template for Students
function downloadStudentExcelTemplate() {
  const templateData = [
    {
      'รหัสนักศึกษา (studentId)': '6631503001',
      'ชื่อ-นามสกุลไทย (nameTh)': 'นายสมชาย ใจดี',
      'ชื่อ-นามสกุลอังกฤษ (nameEn)': 'Mr. Somchai Jaidee',
      'อีเมลนักศึกษา (email)': 'somchai.jai@lamduan.mfu.ac.th',
      'อีเมลส่วนตัว (personalEmail)': 'somchai.jai@gmail.com',
      'รหัสสำนักวิชา (schoolCode)': 'ADT',
      'รหัสหลักสูตร (programCode)': 'SE',
      'รหัสวิชา (courseCode)': 'SWE491',
      'ภาคการศึกษา (semester)': '1/2566',
      'สถานประกอบการ (company)': 'บริษัท นวัตกรรมดิจิทัล จำกัด',
      'จังหวัด (province)': 'กรุงเทพมหานคร',
      'ปีการศึกษา (admissionYear)': 2566
    },
    {
      'รหัสนักศึกษา (studentId)': '6631503002',
      'ชื่อ-นามสกุลไทย (nameTh)': 'นางสาวสุดารัตน์ มีสุข',
      'ชื่อ-นามสกุลอังกฤษ (nameEn)': 'Ms. Sudarat Meesook',
      'อีเมลนักศึกษา (email)': 'sudarat.mee@lamduan.mfu.ac.th',
      'อีเมลส่วนตัว (personalEmail)': 'sudarat.mee@gmail.com',
      'รหัสสำนักวิชา (schoolCode)': 'ADT',
      'รหัสหลักสูตร (programCode)': 'SE',
      'รหัสวิชา (courseCode)': 'SWE491',
      'ภาคการศึกษา (semester)': '1/2566',
      'สถานประกอบการ (company)': 'บริษัท เชียงใหม่ซอฟต์แวร์ จำกัด',
      'จังหวัด (province)': 'เชียงใหม่',
      'ปีการศึกษา (admissionYear)': 2566
    }
  ]

  const ws = XLSX.utils.json_to_sheet(templateData)
  // Set column widths
  ws['!cols'] = [
    { wch: 22 }, // studentId
    { wch: 26 }, // nameTh
    { wch: 26 }, // nameEn
    { wch: 32 }, // email
    { wch: 30 }, // personalEmail
    { wch: 18 }, // schoolCode
    { wch: 18 }, // programCode
    { wch: 18 }, // courseCode
    { wch: 18 }, // semester
    { wch: 30 }, // company
    { wch: 20 }, // province
    { wch: 16 } // admissionYear
  ]

  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'Student_Template')
  XLSX.writeFile(wb, 'MFU_Internship_Student_Template.xlsx')

  toast.add({
    title: 'ดาวน์โหลดเทมเพลตสำเร็จ',
    description:
      'ไฟล์ MFU_Internship_Student_Template.xlsx พร้อมกรอกข้อมูลแล้ว',
    color: 'success'
  })
}

// The backend owns workbook parsing, reference resolution, diffing, and commit.
function applyStudentImportBatch(batch: StudentImportBatchResponse) {
  studentImportBatchId.value = batch.batchId
  importQuestionFields.value = [...batch.questionFieldsDetected]
  parsedRows.value = batch.items.map((row) => ({
    ...row,
    selected: row.status === 'pending' && row.action === 'create'
  }))
  excelPreviewPage.value = 1
}

function importFieldLabel(field: string): string {
  const labels: Readonly<Record<string, string>> = {
    'name.th': 'ชื่อไทย',
    'name.en': 'ชื่ออังกฤษ',
    email: 'อีเมล',
    personalEmail: 'อีเมลส่วนตัว',
    schoolId: 'สำนักวิชา',
    programId: 'หลักสูตร',
    course: 'วิชา',
    courseId: 'รหัสวิชา',
    academicTermId: 'ภาคการศึกษา',
    semester: 'ภาคการศึกษา',
    academicYear: 'ปีการศึกษา',
    admissionYear: 'ปีที่เข้าศึกษา',
    company: 'สถานประกอบการ',
    province: 'จังหวัด'
  }
  return labels[field] ?? field
}

function importDiffValue(value: unknown): string {
  if (value === null || value === undefined || value === '') return '—'
  if (typeof value === 'object') {
    return Object.values(value as Record<string, unknown>).join(' / ')
  }
  return String(value)
}

function importErrorMessage(error: unknown): string {
  if (
    error &&
    typeof error === 'object' &&
    'data' in error &&
    error.data &&
    typeof error.data === 'object' &&
    'error' in error.data &&
    error.data.error &&
    typeof error.data.error === 'object' &&
    'message' in error.data.error &&
    typeof error.data.error.message === 'string'
  ) {
    return error.data.error.message
  }
  return error instanceof Error
    ? error.message
    : 'เกิดข้อผิดพลาดในการนำเข้าข้อมูล'
}

async function handleExcelFileUpload(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  if (!file) return

  selectedFileName.value = file.name
  parsedRows.value = []
  studentImportBatchId.value = null
  importQuestionFields.value = []
  importCommitKeys.value = {}
  isExcelImporting.value = true

  try {
    const form = new FormData()
    form.append('file', file)
    const batch = await api<StudentImportBatchResponse>(
      '/students/import-preview',
      { method: 'POST', body: form }
    )
    applyStudentImportBatch(batch)
    toast.add({
      title: 'ตรวจสอบไฟล์เสร็จแล้ว',
      description: `พบใหม่ ${batch.summary.creates}, มีส่วนต่าง ${batch.summary.updates}, ไม่เปลี่ยน ${batch.summary.unchanged}, ผิดเงื่อนไข ${batch.summary.invalid} รายการ`,
      color: batch.summary.invalid > 0 ? 'warning' : 'success'
    })
  } catch (error: unknown) {
    toast.add({
      title: 'ตรวจสอบไฟล์ไม่สำเร็จ',
      description: importErrorMessage(error),
      color: 'error'
    })
  } finally {
    isExcelImporting.value = false
    input.value = ''
  }
}

async function handleExecuteExcelImport() {
  const batchId = studentImportBatchId.value
  const decisions = parsedRows.value
    .filter(
      (row) =>
        row.selected &&
        row.status === 'pending' &&
        (row.action === 'create' || row.action === 'update')
    )
    .map((row) => ({
      rowId: row.id,
      action: row.action as 'create' | 'update'
    }))

  if (!batchId || decisions.length === 0) {
    toast.add({
      title: 'ไม่มีรายการที่ยืนยันนำเข้า',
      description: 'รายการแก้ไขต้องเลือกยืนยันแยกเป็นแถวก่อน',
      color: 'warning'
    })
    return
  }

  isExcelImporting.value = true
  let committedCount = 0
  let commitError: string | null = null

  try {
    for (let offset = 0; offset < decisions.length; offset += 100) {
      const chunk = decisions.slice(offset, offset + 100)
      const keySlot = `${batchId}:${chunk.map((item) => `${item.rowId}:${item.action}`).join(',')}`
      const idempotencyKey =
        importCommitKeys.value[keySlot] ?? crypto.randomUUID()
      importCommitKeys.value[keySlot] = idempotencyKey

      try {
        await api(`/students/imports/${batchId}/commit`, {
          method: 'POST',
          headers: { 'idempotency-key': idempotencyKey },
          body: { decisions: chunk }
        })
        committedCount += chunk.length
      } catch (error: unknown) {
        commitError = importErrorMessage(error)
        break
      }
    }

    const updatedBatch = await api<StudentImportBatchResponse>(
      `/students/imports/${batchId}`
    )
    applyStudentImportBatch(updatedBatch)
    if (committedCount > 0) await refresh()

    if (commitError) {
      toast.add({
        title: committedCount > 0 ? 'นำเข้าได้บางส่วน' : 'นำเข้าไม่สำเร็จ',
        description: `${committedCount} รายการสำเร็จ; ${commitError} ตรวจสถานะแล้วลองรายการที่ยังค้างใหม่ได้`,
        color: committedCount > 0 ? 'warning' : 'error'
      })
      return
    }

    toast.add({
      title: 'นำเข้าข้อมูลสำเร็จ',
      description: `บันทึกหรืออัปเดตข้อมูล ${committedCount} รายการ`,
      color: 'success'
    })
    await refresh()
    isExcelModalOpen.value = false
  } catch (error: unknown) {
    toast.add({
      title: 'ตรวจสอบสถานะการนำเข้าไม่สำเร็จ',
      description: importErrorMessage(error),
      color: 'error'
    })
  } finally {
    isExcelImporting.value = false
  }
}

// =========================================================================

// MULTI-SELECT & BULK ACTIONS
// =========================================================================
const selectedStudentIds = ref<string[]>([])
const isBulkUpdating = ref(false)

const isAllSelected = computed(() => {
  const items = data.value?.items ?? []
  if (items.length === 0) return false
  return items.every((s) => selectedStudentIds.value.includes(s.id))
})

const isSomeSelected = computed(() => {
  const items = data.value?.items ?? []
  if (items.length === 0) return false
  const count = items.filter((s) =>
    selectedStudentIds.value.includes(s.id)
  ).length
  return count > 0 && count < items.length
})

function toggleSelectAll() {
  const items = data.value?.items ?? []
  if (isAllSelected.value) {
    selectedStudentIds.value = selectedStudentIds.value.filter(
      (id) => !items.some((s) => s.id === id)
    )
  } else {
    const newIds = new Set(selectedStudentIds.value)
    items.forEach((s) => newIds.add(s.id))
    selectedStudentIds.value = Array.from(newIds)
  }
}

function toggleSelectStudent(id: string) {
  const idx = selectedStudentIds.value.indexOf(id)
  if (idx > -1) {
    selectedStudentIds.value.splice(idx, 1)
  } else {
    selectedStudentIds.value.push(id)
  }
}

function clearSelection() {
  selectedStudentIds.value = []
}

async function handleBulkDelete() {
  if (selectedStudentIds.value.length === 0) return
  if (
    !confirm(
      `คุณต้องการลบข้อมูลนักศึกษาที่เลือกจำนวน ${selectedStudentIds.value.length} รายการ หรือไม่?`
    )
  )
    return
  isBulkUpdating.value = true
  try {
    await Promise.all(
      selectedStudentIds.value.map((id) =>
        api(`/students/${id}`, {
          method: 'DELETE'
        })
      )
    )
    toast.add({
      title: 'ลบข้อมูลสำเร็จ',
      description: `ลบข้อมูลนักศึกษาที่เลือกเรียบร้อยแล้ว`,
      color: 'success'
    })
    clearSelection()
    await refresh()
  } catch {
    toast.add({
      title: 'เกิดข้อผิดพลาด',
      description: 'ไม่สามารถลบข้อมูลนักศึกษาบางรายการได้',
      color: 'error'
    })
  } finally {
    isBulkUpdating.value = false
  }
}

function handleBulkExport() {
  const selectedList = (data.value?.items ?? []).filter((s) =>
    selectedStudentIds.value.includes(s.id)
  )
  if (selectedList.length === 0) return

  const exportData = selectedList.map((s) => ({
    รหัสนักศึกษา: s.studentId,
    ชื่อภาษาไทย: s.name.th,
    ชื่อภาษาอังกฤษ: s.name.en,
    'อีเมลนักศึกษา (Student Email)': s.email,
    'อีเมลส่วนตัว (Personal Email)': s.personalEmail || '-',
    สำนักวิชา: getSchoolDisplay(s.schoolId),
    หลักสูตร: getProgramDisplay(s.programId),
    ปีการศึกษา: getAcademicYearDisplay(s),
    ภาคการศึกษา: getSemesterDisplay(s),
    รายวิชา: getCourseDisplay(s),
    สถานประกอบการ: getCompanyDisplay(s),
    'ผู้ประเมิน / พี่เลี้ยง': s.evaluatorName || '-',
    อีเมลผู้ประเมิน: s.evaluatorEmail || '-',
    จังหวัด: getProvinceDisplay(s),
    สถานะการประเมิน: getStudentEvaluationStatus(s).label,
    สถานะบัญชี: s.status
  }))

  const ws = XLSX.utils.json_to_sheet(exportData)
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'Selected_Students')
  XLSX.writeFile(wb, `MFU_Students_Selected_${Date.now()}.xlsx`)

  toast.add({
    title: 'ส่งออกข้อมูลสำเร็จ',
    description: `ส่งออกข้อมูลนักศึกษาที่เลือกจำนวน ${selectedList.length} รายการเป็น Excel เรียบร้อยแล้ว`,
    color: 'success'
  })
}

// Actions Menu for Each Student Row
function getStudentMenuItems(student: Student) {
  return [
    [
      {
        label: 'ส่งอีเมลแบบประเมิน',
        icon: 'i-lucide-mail',
        onSelect: () => openSendEmailModal(student)
      }
    ],
    [
      {
        label: 'แก้ไขข้อมูล',
        icon: 'i-lucide-pencil',
        onSelect: () => openEditStudentModal(student)
      }
    ],
    [
      {
        label: 'ลบข้อมูล',
        icon: 'i-lucide-trash-2',
        color: 'error' as const,
        onSelect: () => handleDeleteStudent(student)
      }
    ]
  ]
}

function copyStudentId(id: string) {
  if (import.meta.client) {
    navigator.clipboard.writeText(id)
    toast.add({
      title: 'คัดลอกรหัสนักศึกษาแล้ว',
      description: `คัดลอก ${id} ไปยังคลิปบอร์ดแล้ว`,
      color: 'success',
      icon: 'i-lucide-check'
    })
  }
}

async function handleDeleteStudent(student: Student) {
  if (
    !confirm(
      `คุณต้องการลบข้อมูลนักศึกษา "${student.name.th}" (${student.studentId}) หรือไม่?`
    )
  )
    return
  try {
    await api(`/students/${student.id}`, {
      method: 'DELETE'
    })
    toast.add({
      title: 'ลบข้อมูลสำเร็จ',
      description: `ลบข้อมูลนักศึกษา ${student.name.th} เรียบร้อยแล้ว`,
      color: 'success'
    })
    selectedStudentIds.value = selectedStudentIds.value.filter(
      (id) => id !== student.id
    )
    await refresh()
  } catch {
    toast.add({
      title: 'ดำเนินการไม่สำเร็จ',
      description: 'ไม่สามารถลบข้อมูลนักศึกษาได้',
      color: 'error'
    })
  }
}

// =========================================================================
// MODAL 4: SEND EVALUATION EMAIL (ส่งอีเมลแบบประเมินให้นักศึกษา)
// =========================================================================
const isSendEmailModalOpen = ref(false)
const sendModalStudent = ref<Student | null>(null)
const selectedCompetencySet = ref<CompetencySetItem | null>(null)
const selectedCompetencyVersion = ref<CompetencyVersionItem | null>(null)
const isLoadingFormVersion = ref(false)
const isSendingEvaluationEmail = ref(false)
const sendInvitationIdempotencyKey = ref('')

const sendEmailForm = ref({
  recipientEmail: '',
  evaluatorName: '',
  deadlineDays: 30,
  notes: ''
})

const sendEmailSuccessData = ref<{
  success: boolean
  status: 'queued' | 'processing' | 'completed' | 'partial'
  assignmentId: string
  invitationId: string
  campaignId: string
  deliveryId: string
  invitationUrl: string
  recipientEmail: string
  studentName: string
  deadlineAt: string
} | null>(null)

// Modal Mode: 'single' | 'bulk'
const sendEmailModalMode = ref<'single' | 'bulk'>('single')
const bulkModalStudents = ref<Student[]>([])
const bulkStudentEvaluators = ref<
  Record<string, { email: string; name: string }>
>({})
const bulkCommonEmail = ref('')
const bulkCommonEvaluator = ref('')
const bulkSendProgress = ref<{
  current: number
  total: number
  successCount: number
  failedCount: number
  currentStudentName: string
}>({
  current: 0,
  total: 0,
  successCount: 0,
  failedCount: 0,
  currentStudentName: ''
})

interface BulkSendResultItem {
  studentId: string
  studentCode: string
  studentName: string
  email: string
  evaluatorName: string
  company: string
  success: boolean
  invitationUrl?: string
  error?: string
}

const bulkSendSuccessData = ref<{
  totalSent: number
  failedCount: number
  items: BulkSendResultItem[]
} | null>(null)

interface SystemEmailTemplateItem {
  id: string
  code: string
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

const systemEmailTemplate = ref<SystemEmailTemplateItem | null>(null)
const isLoadingEmailTemplate = ref(false)
const emailPreviewTab = ref<'design' | 'text'>('design')

async function fetchEvaluationEmailTemplate() {
  isLoadingEmailTemplate.value = true
  try {
    const res = await api<SystemEmailTemplateItem[]>('/email-templates/system')
    if (Array.isArray(res)) {
      const match = res.find((t) => t.code === 'evaluation_request')
      systemEmailTemplate.value = match || res[0] || null
    }
  } catch (err) {
    console.error('Failed to load system email template:', err)
  } finally {
    isLoadingEmailTemplate.value = false
  }
}

function renderPlaceholders(str: string): string {
  if (!str) return ''
  const student = sendModalStudent.value
  const studentName =
    student?.name.th || student?.name.en || '[ไม่ระบุชื่อนักศึกษา]'
  const studentId = student?.studentId || '[ไม่ระบุรหัสนักศึกษา]'
  const companyName = student?.company || '[ไม่ระบุสถานประกอบการ]'
  const evaluatorName =
    (sendEmailModalMode.value === 'bulk' && student
      ? bulkStudentEvaluators.value[student.id]?.name
      : sendEmailForm.value.evaluatorName?.trim()) || '[ไม่ระบุชื่อผู้ประเมิน]'

  const values: Record<string, string> = {
    student_name: studentName,
    student_id: studentId,
    company_name: companyName,
    evaluator_name: evaluatorName,
    deadline: '[ระบบคำนวณจากวันปิดรอบ]',
    pin: '[ระบบสร้าง PIN เมื่อส่งคำเชิญ]',
    invitation_url: '[ระบบสร้างลิงก์เมื่อส่งคำเชิญ]'
  }

  return str.replace(/{{\s*([a-z_]+)\s*}}/g, (_, key: string) => {
    return values[key] ?? `{{${key}}}`
  })
}

const previewSubject = computed(() => {
  if (!systemEmailTemplate.value?.subject) {
    return '[ยังไม่มีเทมเพลตคำเชิญที่โหลดได้]'
  }
  return renderPlaceholders(systemEmailTemplate.value.subject)
})

const previewHtml = computed(() => {
  if (!systemEmailTemplate.value?.html) {
    return ''
  }
  return renderPlaceholders(systemEmailTemplate.value.html)
})

const previewEmailDocument = computed(() =>
  createSandboxedEmailPreviewDocument(previewHtml.value)
)

const previewText = computed(() => {
  if (!systemEmailTemplate.value?.text) {
    return ''
  }
  return renderPlaceholders(systemEmailTemplate.value.text)
})

function applyBulkEmailToAll() {
  if (!bulkCommonEmail.value.trim()) return
  bulkModalStudents.value.forEach((st) => {
    const entry = bulkStudentEvaluators.value[st.id]
    if (entry) {
      entry.email = bulkCommonEmail.value.trim()
    }
  })
  toast.add({
    title: 'ปรับใช้อีเมลกับทุกคนแล้ว',
    description: `ตั้งค่าอีเมลเป็น ${bulkCommonEmail.value} ให้กับนักศึกษาทั้งหมด ${bulkModalStudents.value.length} คน`,
    color: 'success'
  })
}

function applyBulkEvaluatorToAll() {
  if (!bulkCommonEvaluator.value.trim()) return
  bulkModalStudents.value.forEach((st) => {
    const entry = bulkStudentEvaluators.value[st.id]
    if (entry) {
      entry.name = bulkCommonEvaluator.value.trim()
    }
  })
  toast.add({
    title: 'ปรับใช้ชื่อผู้ประเมินกับทุกคนแล้ว',
    description: `ตั้งค่าชื่อผู้ประเมินเป็น "${bulkCommonEvaluator.value}" ให้ทุกคนแล้ว`,
    color: 'success'
  })
}

async function openSendEmailModal(student: Student) {
  sendEmailModalMode.value = 'single'
  sendModalStudent.value = student
  bulkModalStudents.value = [student]
  sendEmailSuccessData.value = null
  bulkSendSuccessData.value = null
  isSendingEvaluationEmail.value = false
  sendInvitationIdempotencyKey.value = crypto.randomUUID()

  sendEmailForm.value = {
    recipientEmail: student.evaluatorEmail || '',
    evaluatorName: student.evaluatorName || '',
    deadlineDays: 30,
    notes: ''
  }

  fetchEvaluationEmailTemplate()

  const firstForm = activeCompetencyForms.value[0]
  if (firstForm) {
    await selectCompetencyForm(firstForm)
  } else {
    selectedCompetencySet.value = null
    selectedCompetencyVersion.value = null
  }

  isSendEmailModalOpen.value = true
}

async function openBulkSendEmailModal() {
  const selectedList = (data.value?.items ?? []).filter((s) =>
    selectedStudentIds.value.includes(s.id)
  )
  if (selectedList.length === 0) return

  const first = selectedList[0]
  if (!first) return

  if (selectedList.length === 1) {
    openSendEmailModal(first)
    return
  }

  sendEmailModalMode.value = 'bulk'
  bulkModalStudents.value = [...selectedList]
  sendModalStudent.value = first
  sendEmailSuccessData.value = null
  bulkSendSuccessData.value = null
  isSendingEvaluationEmail.value = false

  const evaluators: Record<string, { email: string; name: string }> = {}
  selectedList.forEach((st) => {
    evaluators[st.id] = {
      email: st.evaluatorEmail || '',
      name: st.evaluatorName || ''
    }
  })
  bulkStudentEvaluators.value = evaluators
  bulkCommonEmail.value = ''
  bulkCommonEvaluator.value = ''

  sendEmailForm.value = {
    recipientEmail: '',
    evaluatorName: '',
    deadlineDays: 30,
    notes: ''
  }

  fetchEvaluationEmailTemplate()

  const firstForm = activeCompetencyForms.value[0]
  if (firstForm) {
    await selectCompetencyForm(firstForm)
  } else {
    selectedCompetencySet.value = null
    selectedCompetencyVersion.value = null
  }

  isSendEmailModalOpen.value = true
}

async function selectCompetencyForm(form: CompetencySetItem) {
  selectedCompetencySet.value = form
  isLoadingFormVersion.value = true
  try {
    const res = await api<
      CompetencyVersionItem[] | { items: CompetencyVersionItem[] }
    >(`/competency-sets/${form.id}/versions`)
    const list = Array.isArray(res) ? res : res?.items || []
    const published = list.find((v) => v.status === 'published')
    selectedCompetencyVersion.value = published || null
  } catch {
    selectedCompetencyVersion.value = null
  } finally {
    isLoadingFormVersion.value = false
  }
}

async function handleSendEvaluationEmailSubmit() {
  if (!sendModalStudent.value || !selectedCompetencySet.value) return
  if (!sendEmailForm.value.recipientEmail.trim()) {
    toast.add({
      title: 'กรุณาระบุอีเมลผู้ประเมิน',
      description: 'โปรดกรอกอีเมลของผู้ประเมินที่ลงทะเบียนกับสถานประกอบการ',
      color: 'warning'
    })
    return
  }

  isSendingEvaluationEmail.value = true
  const startTime = Date.now()
  try {
    const result = await api<{
      success: boolean
      status: 'queued' | 'processing' | 'completed' | 'partial'
      assignmentId: string
      invitationId: string
      campaignId: string
      deliveryId: string
      invitationUrl: string
      recipientEmail: string
      studentName: string
      deadlineAt: string
    }>('/campaigns/send-student-invitation', {
      method: 'POST',
      headers: { 'idempotency-key': sendInvitationIdempotencyKey.value },
      body: {
        studentId: sendModalStudent.value.id,
        competencySetId: selectedCompetencySet.value.id,
        recipientEmail: sendEmailForm.value.recipientEmail.trim(),
        evaluatorName: sendEmailForm.value.evaluatorName.trim(),
        deadlineDays: Number(sendEmailForm.value.deadlineDays),
        notes: sendEmailForm.value.notes.trim()
      }
    })

    if (import.meta.client && result.invitationUrl) {
      result.invitationUrl = result.invitationUrl.replace(
        /^https?:\/\/[^/]+/,
        window.location.origin
      )
    }

    // Ensure loading animation is visible for at least 800ms before showing success state
    const elapsed = Date.now() - startTime
    if (elapsed < 800) {
      await new Promise((resolve) => setTimeout(resolve, 800 - elapsed))
    }

    sendEmailSuccessData.value = result
    toast.add({
      title: 'คิวส่งคำเชิญแล้ว',
      description: `คิวส่งงานไปยัง ${result.recipientEmail} แล้ว ติดตามผลได้จากสถานะ Delivery`,
      color: 'info'
    })
    await refresh()
  } catch (err: unknown) {
    const msg =
      err instanceof Error ? err.message : 'ไม่สามารถส่งอีเมลแบบประเมินได้'
    toast.add({
      title: 'ส่งอีเมลไม่สำเร็จ (Email Error)',
      description: `${msg} — ตรวจสอบสถานะการส่งจากรายการอีเมลก่อนลองส่งซ้ำ`,
      color: 'error'
    })
  } finally {
    isSendingEvaluationEmail.value = false
  }
}

async function handleBulkSendEvaluationEmailSubmit() {
  if (bulkModalStudents.value.length === 0 || !selectedCompetencySet.value)
    return

  const invalid = bulkModalStudents.value.filter((st) => {
    const ev = bulkStudentEvaluators.value[st.id]
    return !ev?.email?.trim()
  })
  if (invalid.length > 0) {
    toast.add({
      title: 'กรุณาระบุอีเมลผู้ประเมินให้ครบถ้วน',
      description: `ยังมี ${invalid.length} รายการที่ขาดอีเมลผู้ประเมิน`,
      color: 'warning'
    })
    return
  }

  isSendingEvaluationEmail.value = true
  const total = bulkModalStudents.value.length
  bulkSendProgress.value = {
    current: 0,
    total,
    successCount: 0,
    failedCount: 0,
    currentStudentName: ''
  }

  const itemsResults: BulkSendResultItem[] = []

  for (let i = 0; i < bulkModalStudents.value.length; i++) {
    const st = bulkModalStudents.value[i]
    if (!st) continue
    const ev = bulkStudentEvaluators.value[st.id] ?? { email: '', name: '' }
    bulkSendProgress.value.current = i + 1
    bulkSendProgress.value.currentStudentName = `${st.name.th} (${st.studentId})`

    try {
      const idempotencyKey = crypto.randomUUID()
      const res = await api<{
        success: boolean
        assignmentId: string
        invitationId: string
        invitationUrl: string
        recipientEmail: string
        studentName: string
        deadlineAt: string
      }>('/campaigns/send-student-invitation', {
        method: 'POST',
        headers: { 'idempotency-key': idempotencyKey },
        body: {
          studentId: st.id,
          competencySetId: selectedCompetencySet.value.id,
          recipientEmail: ev.email.trim(),
          evaluatorName: ev.name.trim(),
          deadlineDays: Number(sendEmailForm.value.deadlineDays),
          notes: sendEmailForm.value.notes.trim()
        }
      })

      let finalUrl = res.invitationUrl
      if (import.meta.client && finalUrl) {
        finalUrl = finalUrl.replace(/^https?:\/\/[^/]+/, window.location.origin)
      }

      bulkSendProgress.value.successCount++
      itemsResults.push({
        studentId: st.id,
        studentCode: st.studentId,
        studentName: st.name.th,
        email: ev.email.trim(),
        evaluatorName: ev.name.trim(),
        company: st.company || '-',
        success: true,
        invitationUrl: finalUrl
      })
    } catch (err: unknown) {
      bulkSendProgress.value.failedCount++
      const msg = err instanceof Error ? err.message : 'ส่งไม่สำเร็จ'
      itemsResults.push({
        studentId: st.id,
        studentCode: st.studentId,
        studentName: st.name.th,
        email: ev.email.trim(),
        evaluatorName: ev.name.trim(),
        company: st.company || '-',
        success: false,
        error: msg
      })
    }
  }

  bulkSendSuccessData.value = {
    totalSent: bulkSendProgress.value.successCount,
    failedCount: bulkSendProgress.value.failedCount,
    items: itemsResults
  }

  isSendingEvaluationEmail.value = false
  await refresh()
  clearSelection()

  if (bulkSendProgress.value.successCount > 0) {
    toast.add({
      title: 'ส่งอีเมลแบบประเมินเรียบร้อย',
      description: `สำเร็จ ${bulkSendProgress.value.successCount} คน${bulkSendProgress.value.failedCount > 0 ? `, ผิดพลาด ${bulkSendProgress.value.failedCount} คน` : ''}`,
      color: bulkSendProgress.value.failedCount > 0 ? 'warning' : 'success'
    })
  } else {
    toast.add({
      title: 'เกิดข้อผิดพลาดในการส่งอีเมล',
      description: 'ไม่สามารถส่งอีเมลได้ กรุณาลองใหม่อีกครั้ง',
      color: 'error'
    })
  }
}

function copyInvitationLink(url?: string) {
  const targetUrl = url || sendEmailSuccessData.value?.invitationUrl
  if (!targetUrl) return
  if (import.meta.client) {
    navigator.clipboard.writeText(targetUrl)
    toast.add({
      title: 'คัดลอกลิงก์สำเร็จ',
      description: 'คัดลอกลิงก์แบบประเมินไปยังคลิปบอร์ดแล้ว',
      color: 'success'
    })
  }
}

function finishAndCloseSendModal() {
  isSendEmailModalOpen.value = false
  sendEmailSuccessData.value = null
  bulkSendSuccessData.value = null
  isSendingEvaluationEmail.value = false
}

function handleModalBackdropClick() {
  if (isSendingEvaluationEmail.value) return
  finishAndCloseSendModal()
}
</script>

<template>
  <div class="space-y-6">
    <!-- Header Section with Action Buttons -->
    <header
      class="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between"
    >
      <div>
        <p class="mfu-eyebrow">ข้อมูลสมาชิกและขอบเขตหลักสูตร</p>
        <h1 class="mt-2 text-3xl font-bold text-highlighted">นักศึกษา</h1>
      </div>

      <div class="flex flex-wrap items-center gap-2.5">
        <UBadge
          :label="`${data?.meta.total ?? 0} รายการ`"
          size="lg"
          variant="soft"
          class="font-mono text-sm"
        />

        <!-- Action 1: Excel Import Button -->
        <UButton
          color="neutral"
          icon="i-lucide-file-spreadsheet"
          label="นำเข้าจาก Excel"
          size="md"
          variant="outline"
          @click="openExcelImportModal"
        />

        <!-- Action 2: Manual Add Button -->
        <UButton
          color="primary"
          icon="i-lucide-user-plus"
          label="เพิ่มข้อมูลด้วยตัวเอง"
          size="md"
          @click="openManualAddModal"
        />
      </div>
    </header>

    <!-- Search and Filter Card (Functional Multi-Filter) -->
    <div
      class="rounded-xl border border-default bg-default p-4 shadow-sm space-y-3"
    >
      <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <!-- 1. ตัวกรองสำนักวิชา -->
        <div class="space-y-1">
          <label
            class="text-xs font-semibold text-muted flex items-center gap-1.5"
          >
            <UIcon name="i-lucide-school" class="size-3.5 text-primary" />
            สำนักวิชา (School)
          </label>
          <select
            v-model="selectedSchool"
            class="w-full rounded-lg border border-default bg-default px-3 py-2 text-xs text-highlighted focus:outline-none focus:ring-1 focus:ring-primary truncate"
          >
            <option value="all">ทุกสำนักวิชา (All Schools)</option>
            <option
              v-for="sch in schoolsData?.items ?? []"
              :key="sch.id"
              :value="sch.id"
            >
              {{ sch.name.th }}
            </option>
          </select>
        </div>

        <!-- 2. ตัวกรองสาขาวิชา/หลักสูตร -->
        <div class="space-y-1">
          <label
            class="text-xs font-semibold text-muted flex items-center gap-1.5"
          >
            <UIcon name="i-lucide-book-open" class="size-3.5 text-primary" />
            สาขาวิชา / หลักสูตร (Program)
          </label>
          <select
            v-model="selectedProgram"
            class="w-full rounded-lg border border-default bg-default px-3 py-2 text-xs text-highlighted focus:outline-none focus:ring-1 focus:ring-primary truncate"
          >
            <option value="all">ทุกหลักสูตร (All Programs)</option>
            <option
              v-for="prog in availablePrograms"
              :key="prog.id"
              :value="prog.id"
            >
              {{ prog.name.th }}
            </option>
          </select>
        </div>

        <!-- 3. ตัวกรองสถานะการประเมิน (แบบ 3) -->
        <div class="space-y-1">
          <label
            class="text-xs font-semibold text-muted flex items-center gap-1.5"
          >
            <UIcon name="i-lucide-activity" class="size-3.5 text-primary" />
            สถานะการประเมิน (Evaluation Status)
          </label>
          <select
            v-model="selectedEvaluationStatus"
            class="w-full rounded-lg border border-default bg-default px-3 py-2 text-xs text-highlighted focus:outline-none focus:ring-1 focus:ring-primary truncate"
          >
            <option value="all">ทุกสถานะ (All Statuses)</option>
            <option value="awaiting_evaluator">⚪ รอระบุผู้ประเมิน</option>
            <option value="awaiting_response">🟡 ส่งคำขอประเมินแล้ว</option>
            <option value="submitted">🟢 ส่งผลประเมินแล้ว</option>
            <option value="email_error">
              🔴 ส่งอีเมลผิดพลาด (Email Error)
            </option>
          </select>
        </div>

        <!-- 4. ช่องค้นหาด่วน -->
        <div class="space-y-1">
          <label
            class="text-xs font-semibold text-muted flex items-center gap-1.5"
          >
            <UIcon name="i-lucide-search" class="size-3.5 text-primary" />
            ค้นหาข้อมูลนักศึกษา
          </label>
          <div class="relative">
            <input
              v-model="search"
              type="text"
              placeholder="รหัสนักศึกษา, ชื่อ, อีเมล, บริษัท..."
              class="w-full rounded-lg border border-default bg-default pl-8 pr-8 py-2 text-xs text-highlighted focus:outline-none focus:ring-1 focus:ring-primary"
            />
            <UIcon
              name="i-lucide-search"
              class="size-4 text-muted absolute left-2.5 top-2.5 pointer-events-none"
            />
            <button
              v-if="search"
              type="button"
              class="absolute right-2.5 top-2.5 text-muted hover:text-highlighted cursor-pointer"
              @click="search = ''"
            >
              <UIcon name="i-lucide-x" class="size-3.5" />
            </button>
          </div>
        </div>
      </div>

      <!-- แถบสรุปจำนวนที่พบ และปุ่มล้างตัวกรอง -->
      <div
        class="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-default/70 text-xs text-muted"
      >
        <div class="flex items-center gap-2">
          <span
            >แสดงผล <strong>{{ data?.items?.length ?? 0 }}</strong> คน
            (จากทั้งหมด {{ data?.meta?.total ?? 0 }} คนในระบบ)</span
          >
        </div>

        <button
          v-if="
            selectedSchool !== 'all' ||
            selectedProgram !== 'all' ||
            selectedEvaluationStatus !== 'all' ||
            search
          "
          type="button"
          class="text-primary hover:underline flex items-center gap-1 font-medium cursor-pointer"
          @click="resetFilters"
        >
          <UIcon name="i-lucide-rotate-ccw" class="size-3" />
          ล้างตัวกรองทั้งหมด
        </button>
      </div>
    </div>

    <UAlert
      v-if="error"
      color="error"
      icon="i-lucide-circle-alert"
      title="โหลดรายชื่อนักศึกษาไม่สำเร็จ"
      variant="soft"
    />

    <!-- Bulk Action Toolbar (appears when items are selected) -->
    <Transition
      enter-active-class="transition duration-200 ease-out"
      enter-from-class="opacity-0 -translate-y-2"
      enter-to-class="opacity-100 translate-y-0"
      leave-active-class="transition duration-150 ease-in"
      leave-from-class="opacity-100 translate-y-0"
      leave-to-class="opacity-0 -translate-y-2"
    >
      <div
        v-if="selectedStudentIds.length > 0"
        class="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-primary/30 bg-primary/10 px-4 py-3 shadow-md"
      >
        <div class="flex items-center gap-2">
          <span
            class="grid size-7 place-items-center rounded-lg bg-primary text-inverted text-xs font-bold"
          >
            {{ selectedStudentIds.length }}
          </span>
          <span class="text-xs font-semibold text-highlighted">
            เลือกอยู่ {{ selectedStudentIds.length }} รายการ
          </span>
          <button
            type="button"
            class="text-xs text-muted hover:text-highlighted underline ml-2 cursor-pointer"
            @click="clearSelection"
          >
            ยกเลิกการเลือก
          </button>
        </div>

        <div class="flex flex-wrap items-center gap-2">
          <UButton
            color="primary"
            icon="i-lucide-mail"
            label="ส่งอีเมลแบบประเมิน"
            size="xs"
            variant="subtle"
            @click="openBulkSendEmailModal"
          />
          <UButton
            color="primary"
            icon="i-lucide-download"
            label="ส่งออก Excel"
            size="xs"
            variant="outline"
            @click="handleBulkExport"
          />
          <UButton
            color="error"
            icon="i-lucide-trash-2"
            label="ลบที่เลือก"
            size="xs"
            variant="ghost"
            :loading="isBulkUpdating"
            @click="handleBulkDelete"
          />
        </div>
      </div>
    </Transition>

    <!-- Students Data Table -->
    <div
      class="rounded-xl border border-default bg-default overflow-hidden shadow-sm"
    >
      <div class="overflow-x-auto">
        <table class="w-full text-left text-xs">
          <thead
            class="border-b border-default bg-muted/40 font-semibold text-highlighted"
          >
            <tr>
              <th scope="col" class="py-3 px-4 w-10 text-center">
                <input
                  type="checkbox"
                  :checked="isAllSelected"
                  :indeterminate="isSomeSelected && !isAllSelected"
                  class="size-4 rounded border-default text-primary focus:ring-primary/20 cursor-pointer"
                  @change="toggleSelectAll"
                />
              </th>
              <th scope="col" class="py-3 px-4 min-w-[200px]">
                ข้อมูลนักศึกษา
              </th>
              <th scope="col" class="py-3 px-4 min-w-[200px]">
                สำนักวิชา / สาขาวิชา / รายวิชา
              </th>
              <th scope="col" class="py-3 px-4 min-w-[120px]">ปี / ภาคเรียน</th>
              <th scope="col" class="py-3 px-4 min-w-[210px]">
                สถานประกอบการ / ที่ตั้งบริษัท
              </th>
              <th scope="col" class="py-3 px-4 min-w-[140px]">สถานะประเมิน</th>
              <th scope="col" class="py-3 px-4 min-w-[150px] whitespace-nowrap">
                อัปเดตล่าสุด / วันที่สร้าง
              </th>
              <th scope="col" class="py-3 px-4 w-16 text-right">จัดการ</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-default">
            <tr
              v-for="student in data?.items"
              :key="student.id"
              class="hover:bg-muted/30 transition-colors group"
              :class="{
                'bg-primary/[0.04] dark:bg-primary/[0.08]':
                  selectedStudentIds.includes(student.id)
              }"
            >
              <!-- 1. Multi-select checkbox -->
              <td class="py-3 px-4 text-center" @click.stop>
                <input
                  type="checkbox"
                  :checked="selectedStudentIds.includes(student.id)"
                  class="size-4 rounded border-default text-primary focus:ring-primary/20 cursor-pointer"
                  @change="toggleSelectStudent(student.id)"
                />
              </td>

              <!-- 2. ข้อมูลนักศึกษา -->
              <td class="py-3 px-4">
                <div class="space-y-0.5">
                  <div class="flex items-center gap-1.5">
                    <span class="font-mono font-bold text-primary text-xs">
                      {{ student.studentId }}
                    </span>
                    <button
                      type="button"
                      title="คัดลอกรหัสนักศึกษา"
                      class="text-muted hover:text-primary opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer"
                      @click.stop="copyStudentId(student.studentId)"
                    >
                      <UIcon name="i-lucide-copy" class="size-3" />
                    </button>
                  </div>
                  <p class="font-semibold text-highlighted text-xs">
                    {{ student.name.th }}
                  </p>
                  <p class="text-[11px] text-muted truncate">
                    {{ student.name.en }}
                  </p>
                  <p class="text-[10px] text-muted/80 font-mono">
                    {{ student.email }}
                  </p>
                </div>
              </td>

              <!-- 3. สำนักวิชา / สาขาวิชา / รายวิชา -->
              <td class="py-3 px-4">
                <div class="space-y-1">
                  <div>
                    <p
                      class="font-medium text-highlighted text-xs leading-snug"
                    >
                      {{ getSchoolDisplay(student.schoolId) }}
                    </p>
                    <p class="text-[11px] text-muted leading-snug">
                      {{ getProgramDisplay(student.programId) }}
                    </p>
                  </div>
                  <div class="pt-0.5">
                    <UBadge
                      :color="getStudentCourseTrack(student).color"
                      size="xs"
                      variant="subtle"
                      class="text-[10px] font-medium inline-flex items-center gap-1"
                    >
                      <UIcon
                        :name="getStudentCourseTrack(student).icon"
                        class="size-3"
                      />
                      <span>{{ getStudentCourseTrack(student).display }}</span>
                    </UBadge>
                  </div>
                </div>
              </td>

              <!-- 4. ปี / ภาคเรียน -->
              <td class="py-3 px-4">
                <div class="space-y-1">
                  <UBadge
                    color="primary"
                    size="xs"
                    variant="subtle"
                    class="font-mono font-semibold"
                  >
                    ปี {{ getAcademicYearDisplay(student) }}
                  </UBadge>
                  <p class="text-[11px] text-muted">
                    {{ formatSemesterText(getSemesterDisplay(student)) }}
                  </p>
                </div>
              </td>

              <!-- 5. สถานประกอบการ / ผู้ประเมิน / ที่ตั้งบริษัท -->
              <td class="py-3 px-4">
                <div class="space-y-1">
                  <p class="font-medium text-highlighted text-xs leading-snug">
                    {{ getCompanyDisplay(student) }}
                  </p>

                  <!-- คนทำแบบประเมิน & อีเมล (อยู่ใต้สถานที่ประกอบการ และอยู่ข้างบนที่ตั้งบริษัท) -->
                  <div
                    v-if="student.evaluatorName || student.evaluatorEmail"
                    class="space-y-0.5"
                  >
                    <p
                      v-if="student.evaluatorName"
                      class="text-[11px] text-primary font-medium flex items-center gap-1 leading-tight"
                    >
                      <UIcon
                        name="i-lucide-user-check"
                        class="size-3 shrink-0"
                      />
                      <span class="truncate">{{ student.evaluatorName }}</span>
                    </p>
                    <p
                      v-if="student.evaluatorEmail"
                      class="text-[10px] text-muted font-mono flex items-center gap-1 leading-tight"
                    >
                      <UIcon
                        name="i-lucide-mail"
                        class="size-3 shrink-0 text-muted"
                      />
                      <span class="truncate">{{ student.evaluatorEmail }}</span>
                    </p>
                  </div>
                  <div
                    v-else
                    class="text-[10px] text-muted/60 italic flex items-center gap-1 leading-tight"
                  >
                    <UIcon name="i-lucide-user-x" class="size-2.5 shrink-0" />
                    <span>ยังไม่ระบุผู้ประเมิน</span>
                  </div>

                  <!-- ที่ตั้งบริษัท / สาขา / จังหวัด -->
                  <p
                    class="text-[11px] text-muted font-normal flex items-center gap-1 leading-tight"
                  >
                    <UIcon
                      name="i-lucide-map-pin"
                      class="size-3 shrink-0 text-muted/70"
                    />
                    <span class="truncate">{{
                      getCompanyAddressDisplay(student)
                    }}</span>
                  </p>
                </div>
              </td>

              <!-- 6. สถานะประเมิน -->
              <td class="py-3 px-4">
                <div class="space-y-1">
                  <UBadge
                    :color="getStudentEvaluationStatus(student).color"
                    size="xs"
                    variant="subtle"
                    class="font-semibold flex items-center gap-1 w-fit"
                    :title="getStudentEvaluationStatus(student).description"
                  >
                    <UIcon
                      :name="getStudentEvaluationStatus(student).icon"
                      class="size-3 shrink-0"
                    />
                    <span>{{ getStudentEvaluationStatus(student).label }}</span>
                  </UBadge>
                </div>
              </td>

              <!-- 7. อัปเดตล่าสุด / วันที่สร้าง -->
              <td class="py-3 px-4 text-xs whitespace-nowrap">
                <span
                  class="block font-medium text-highlighted"
                  title="อัปเดตล่าสุด"
                >
                  {{ formatDateTime(student.updatedAt) }}
                </span>
                <span
                  class="block text-[11px] text-muted mt-0.5"
                  title="วันเวลาที่สร้าง"
                >
                  สร้าง: {{ formatDateTime(student.createdAt) }}
                </span>
              </td>

              <!-- 8. จัดการ -->
              <td class="py-3 px-4 text-right" @click.stop>
                <div class="flex items-center justify-end">
                  <UDropdownMenu
                    :items="getStudentMenuItems(student)"
                    :content="{ align: 'end' }"
                  >
                    <UButton
                      aria-label="การจัดการนักศึกษา"
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

            <tr v-if="!pending && !data?.items.length">
              <td class="py-12 text-center text-muted" colspan="8">
                <div class="flex flex-col items-center justify-center gap-2">
                  <UIcon name="i-lucide-users" class="size-8 text-muted" />
                  <p class="text-sm font-semibold text-highlighted">
                    ไม่พบข้อมูลนักศึกษาตามเงื่อนไข
                  </p>
                  <p class="text-xs text-muted">
                    คลิกปุ่ม &quot;นำเข้าจาก Excel&quot; หรือ
                    &quot;เพิ่มข้อมูลด้วยตัวเอง&quot; เพื่อเพิ่มนักศึกษา
                  </p>
                </div>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <AppPagination
        v-model:page="page"
        v-model:page-size="pageSize"
        :total="data?.meta?.total ?? 0"
        items-name="คน"
      />
    </div>

    <!-- ================================================================= -->
    <!-- MODAL 1: MANUAL ADD STUDENT (เพิ่มข้อมูลด้วยตัวเอง)                -->
    <!-- ================================================================= -->
    <div
      v-if="isManualModalOpen"
      class="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"
      @click="isManualModalOpen = false"
    >
      <div
        class="w-full max-w-5xl lg:max-w-6xl xl:max-w-7xl rounded-2xl sm:rounded-3xl border border-default bg-default p-6 sm:p-8 shadow-2xl space-y-6 max-h-[92vh] overflow-y-auto"
        @click.stop
      >
        <div
          class="flex items-center justify-between border-b border-default pb-4"
        >
          <div class="flex items-center gap-3">
            <span
              class="grid size-11 place-items-center rounded-xl bg-primary/10 text-primary ring-1 ring-primary/20"
            >
              <UIcon name="i-lucide-user-plus" class="size-6" />
            </span>
            <div>
              <h2 class="text-xl font-bold text-highlighted tracking-tight">
                เพิ่มข้อมูลนักศึกษาด้วยตัวเอง
              </h2>
              <p class="text-xs sm:text-sm text-muted mt-0.5">
                กรอกข้อมูลนักศึกษา สำนักวิชา หลักสูตร
                และข้อมูลการฝึกงานเพื่อบันทึกเข้าสู่ระบบ
              </p>
            </div>
          </div>
          <UButton
            color="neutral"
            icon="i-lucide-x"
            size="sm"
            variant="ghost"
            @click="isManualModalOpen = false"
          />
        </div>

        <form class="space-y-6" @submit.prevent="handleManualAddSubmit">
          <!-- 2 Columns Grid -->
          <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <!-- คอลัมน์ที่ 1: ข้อมูลหลักสูตรและการฝึกงาน -->
            <div
              class="rounded-2xl border border-default/70 bg-muted/15 dark:bg-muted/10 p-5 sm:p-6 space-y-4 shadow-sm"
            >
              <div
                class="flex items-center gap-2.5 pb-3 border-b border-default text-xs font-bold uppercase tracking-wider text-primary"
              >
                <UIcon
                  name="i-lucide-briefcase"
                  class="size-4.5 text-primary"
                />
                <span>ข้อมูลหลักสูตรและการฝึกงาน (Internship Info)</span>
              </div>

              <!-- School Selection -->
              <div>
                <label
                  class="block text-xs font-semibold text-highlighted mb-1.5"
                >
                  สำนักวิชา (School) <span class="text-rose-500">*</span>
                </label>
                <select
                  v-model="manualForm.schoolId"
                  class="w-full h-11 rounded-xl border border-default bg-default px-3 text-sm text-highlighted focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20 transition-colors truncate"
                  required
                  @change="
                    () => {
                      const p = programsData?.items?.find(
                        (item) => item.schoolId === manualForm.schoolId
                      )
                      manualForm.programId = p?.id || ''
                    }
                  "
                >
                  <option value="" disabled>-- เลือกสำนักวิชา --</option>
                  <option
                    v-for="school in schoolsData?.items"
                    :key="school.id"
                    :value="school.id"
                  >
                    {{ school.name.th }} ({{ school.name.en }})
                  </option>
                </select>
              </div>

              <!-- Program Selection -->
              <div>
                <label
                  class="block text-xs font-semibold text-highlighted mb-1.5"
                >
                  สาขาวิชา / หลักสูตร (Program)
                  <span class="text-rose-500">*</span>
                </label>
                <select
                  v-model="manualForm.programId"
                  class="w-full h-11 rounded-xl border border-default bg-default px-3 text-sm text-highlighted focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20 transition-colors truncate"
                  required
                >
                  <option value="" disabled>-- เลือกหลักสูตร --</option>
                  <option
                    v-for="prog in availableProgramsForSchool"
                    :key="prog.id"
                    :value="prog.id"
                  >
                    {{ prog.name.th }} ({{ prog.name.en }})
                  </option>
                </select>
              </div>

              <!-- Course Selection (Full Width) -->
              <div>
                <label
                  class="block text-xs font-semibold text-highlighted mb-1.5"
                >
                  รายวิชาที่ฝึกงาน (Course)
                </label>
                <select
                  v-model="manualForm.courseId"
                  class="w-full h-11 rounded-xl border border-default bg-default px-3 text-sm text-highlighted focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20 transition-colors truncate"
                >
                  <option value="">-- ไม่ระบุรายวิชา --</option>
                  <option
                    v-for="c in coursesData?.items"
                    :key="c.id"
                    :value="c.id"
                  >
                    {{ c.courseCode ? c.courseCode + ' — ' : ''
                    }}{{ c.name.th }} ({{ c.name.en }})
                  </option>
                </select>
              </div>

              <!-- Academic Term & Province Selection (2-Column Subgrid) -->
              <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label
                    class="block text-xs font-semibold text-highlighted mb-1.5"
                  >
                    รอบ/ภาคการศึกษาฝึกงาน (Term)
                  </label>
                  <select
                    v-model="manualForm.academicTermId"
                    class="w-full h-11 rounded-xl border border-default bg-default px-3 text-sm text-highlighted focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20 transition-colors truncate"
                  >
                    <option value="">-- ยังไม่ระบุรอบฝึกงาน --</option>
                    <option
                      v-for="term in termsData?.items ?? []"
                      :key="term.id"
                      :value="term.id"
                    >
                      {{ term.code }} — {{ term.semester }}
                      {{ term.academicYear }}
                    </option>
                  </select>
                </div>

                <div>
                  <label
                    class="block text-xs font-semibold text-highlighted mb-1.5"
                  >
                    จังหวัดที่ฝึกงาน (Province)
                  </label>
                  <select
                    v-model="manualForm.province"
                    class="w-full h-11 rounded-xl border border-default bg-default px-3 text-sm text-highlighted focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20 transition-colors truncate"
                  >
                    <option value="">-- ไม่ระบุ / เลือกจังหวัด --</option>
                    <optgroup
                      v-for="reg in provinceRegions"
                      :key="reg"
                      :label="reg"
                    >
                      <option
                        v-for="prov in getProvincesByRegion(reg)"
                        :key="prov.id || prov.code"
                        :value="prov.nameTh"
                      >
                        {{ prov.nameTh }} ({{ prov.nameEn }})
                      </option>
                    </optgroup>
                    <option
                      v-for="prov in getProvincesWithoutRegion()"
                      :key="prov.id || prov.code"
                      :value="prov.nameTh"
                    >
                      {{ prov.nameTh }} ({{ prov.nameEn }})
                    </option>
                  </select>
                </div>
              </div>

              <!-- Company Selection (Full Width) -->
              <div>
                <label
                  class="block text-xs font-semibold text-highlighted mb-1.5"
                >
                  สถานประกอบการ (Company / หน่วยงานที่ฝึกงาน)
                </label>
                <UInput
                  v-model="manualForm.company"
                  placeholder="เช่น บริษัท ดิจิทัล โซลูชั่นส์ จำกัด หรือ สวทช."
                  size="lg"
                  class="w-full"
                  icon="i-lucide-building-2"
                />
              </div>
            </div>

            <!-- คอลัมน์ที่ 2: ข้อมูลส่วนตัวและสถานะ -->
            <div
              class="rounded-2xl border border-default/70 bg-muted/15 dark:bg-muted/10 p-5 sm:p-6 space-y-4 shadow-sm"
            >
              <div
                class="flex items-center gap-2.5 pb-3 border-b border-default text-xs font-bold uppercase tracking-wider text-primary"
              >
                <UIcon name="i-lucide-user" class="size-4.5 text-primary" />
                <span>ข้อมูลส่วนตัวและสถานะ (Personal Info)</span>
              </div>

              <!-- Student ID -->
              <div>
                <label
                  class="block text-xs font-semibold text-highlighted mb-1.5"
                >
                  รหัสนักศึกษา (Student ID) <span class="text-rose-500">*</span>
                </label>
                <UInput
                  v-model="manualForm.studentId"
                  placeholder="เช่น 6631503016"
                  size="lg"
                  class="w-full font-mono"
                  icon="i-lucide-id-card"
                  required
                />
              </div>

              <!-- Thai Name -->
              <div>
                <label
                  class="block text-xs font-semibold text-highlighted mb-1.5"
                >
                  ชื่อ-นามสกุล (ภาษาไทย) <span class="text-rose-500">*</span>
                </label>
                <UInput
                  v-model="manualForm.nameTh"
                  placeholder="เช่น นายกิตติศักดิ์ พัฒนา"
                  size="lg"
                  class="w-full"
                  required
                />
              </div>

              <!-- English Name -->
              <div>
                <label
                  class="block text-xs font-semibold text-highlighted mb-1.5"
                >
                  Full Name (English) <span class="text-rose-500">*</span>
                </label>
                <UInput
                  v-model="manualForm.nameEn"
                  placeholder="เช่น Mr. Kittisak Pattana"
                  size="lg"
                  class="w-full"
                  required
                />
              </div>

              <!-- Email: เมลนักศึกษาอยู่ข้างบน -->
              <div>
                <label
                  class="block text-xs font-semibold text-highlighted mb-1.5"
                >
                  อีเมลนักศึกษา (Student Email / ลำดวนเมล)
                  <span class="text-rose-500">*</span>
                </label>
                <UInput
                  v-model="manualForm.email"
                  type="email"
                  placeholder="เช่น 6631503016@lamduan.mfu.ac.th"
                  size="lg"
                  class="w-full font-mono"
                  icon="i-lucide-graduation-cap"
                  required
                />
                <p class="text-[11px] text-muted mt-1">
                  อีเมลทางการมหาวิทยาลัยแม่ฟ้าหลวง (@lamduan.mfu.ac.th)
                </p>
              </div>

              <!-- Email: เมลส่วนตัวอยู่ข้างล่าง -->
              <div>
                <label
                  class="block text-xs font-semibold text-highlighted mb-1.5"
                >
                  อีเมลส่วนตัว (Personal Email)
                </label>
                <UInput
                  v-model="manualForm.personalEmail"
                  type="email"
                  placeholder="เช่น somchai.dev@gmail.com"
                  size="lg"
                  class="w-full font-mono"
                  icon="i-lucide-mail"
                />
                <p class="text-[11px] text-muted mt-1">
                  อีเมลส่วนตัวหรืออีเมลสำรองสำหรับติดต่อ (เช่น Gmail, Outlook)
                </p>
              </div>

              <!-- Admission Year & Status -->
              <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label
                    class="block text-xs font-semibold text-highlighted mb-1.5"
                  >
                    ปีที่เข้าศึกษา (Year)
                  </label>
                  <UInput
                    v-model.number="manualForm.admissionYear"
                    type="number"
                    placeholder="2566"
                    size="lg"
                    class="w-full font-mono"
                  />
                </div>
                <div>
                  <label
                    class="block text-xs font-semibold text-highlighted mb-1.5"
                  >
                    สถานะ (Status)
                  </label>
                  <select
                    v-model="manualForm.status"
                    class="w-full h-11 rounded-xl border border-default bg-default px-3 text-sm text-highlighted focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20 transition-colors"
                  >
                    <option value="active">Active (กำลังศึกษา / ปกติ)</option>
                  </select>
                </div>
              </div>
            </div>
          </div>

          <!-- Actions -->
          <div
            class="flex items-center justify-end gap-3 pt-4 border-t border-default"
          >
            <UButton
              color="neutral"
              label="ยกเลิก"
              size="lg"
              variant="outline"
              @click="isManualModalOpen = false"
            />
            <UButton
              color="primary"
              icon="i-lucide-save"
              label="บันทึกข้อมูลนักศึกษา"
              size="lg"
              :loading="isManualSubmitting"
              type="submit"
            />
          </div>
        </form>
      </div>
    </div>

    <!-- ================================================================= -->
    <!-- MODAL 2: EXCEL IMPORT (นำเข้าข้อมูลผ่านไฟล์ Excel)                 -->
    <!-- ================================================================= -->
    <div
      v-if="isExcelModalOpen"
      class="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"
      @click="isExcelModalOpen = false"
    >
      <div
        class="w-full max-w-5xl lg:max-w-6xl xl:max-w-7xl rounded-2xl sm:rounded-3xl border border-default bg-default p-6 sm:p-8 shadow-2xl space-y-6 max-h-[92vh] overflow-y-auto"
        @click.stop
      >
        <!-- Modal Header -->
        <div
          class="flex items-center justify-between border-b border-default pb-4"
        >
          <div class="flex items-center gap-2.5">
            <span
              class="grid size-9 place-items-center rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
            >
              <UIcon name="i-lucide-file-spreadsheet" class="size-5" />
            </span>
            <div>
              <h2 class="text-lg font-bold text-highlighted">
                นำเข้าข้อมูลนักศึกษาผ่าน Excel (.xlsx / .csv)
              </h2>
              <p class="text-xs text-muted">
                อัปโหลดไฟล์สเปรดชีตเพื่อนำเข้าข้อมูลนักศึกษาจำนวนมากในคราวเดียว
              </p>
            </div>
          </div>
          <UButton
            color="neutral"
            icon="i-lucide-x"
            size="sm"
            variant="ghost"
            @click="isExcelModalOpen = false"
          />
        </div>

        <!-- Step 1: Download Template & Upload -->
        <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
          <!-- Download Template Card -->
          <div
            class="rounded-xl border border-default bg-muted/20 p-4 flex flex-col justify-between"
          >
            <div>
              <div
                class="flex items-center gap-2 text-highlighted font-bold text-sm"
              >
                <UIcon name="i-lucide-download" class="size-4 text-primary" />
                <span>1. ดาวน์โหลดเทมเพลตมาตรฐาน</span>
              </div>
              <p class="mt-1 text-xs text-muted">
                ดาวน์โหลดไฟล์ตัวอย่างที่มีหัวตารางครบถ้วน (รหัสนักศึกษา,
                ชื่อ-นามสกุลไทย/อังกฤษ, อีเมล, รหัสสำนักวิชา, รหัสหลักสูตร)
              </p>
            </div>
            <div class="mt-3">
              <UButton
                color="neutral"
                icon="i-lucide-download"
                label="ดาวน์โหลดเทมเพลต Excel (.xlsx)"
                size="sm"
                variant="outline"
                @click="downloadStudentExcelTemplate"
              />
            </div>
          </div>

          <!-- File Upload Dropzone -->
          <div
            class="rounded-xl border-2 border-dashed border-default hover:border-primary p-4 flex flex-col items-center justify-center text-center transition-colors cursor-pointer bg-muted/10 hover:bg-primary/5"
            @click="($refs.excelFileInput as HTMLInputElement)?.click()"
          >
            <input
              ref="excelFileInput"
              type="file"
              accept=".xlsx,.csv"
              class="hidden"
              @change="handleExcelFileUpload"
            />
            <UIcon name="i-lucide-file-up" class="size-8 text-primary mb-1.5" />
            <p class="text-xs font-bold text-highlighted">
              {{
                selectedFileName ||
                'คลิกเพื่อเลือกไฟล์ Excel หรือลากไฟล์มาวางที่นี่'
              }}
            </p>
            <p class="text-[11px] text-muted mt-0.5">
              รองรับไฟล์ .xlsx และ .csv (ไม่เกิน 5 MB)
            </p>
          </div>
        </div>

        <div
          v-if="importQuestionFields.length > 0"
          class="rounded-xl border border-primary/20 bg-primary/5 px-4 py-3 text-xs text-muted"
        >
          พบคอลัมน์คำถาม/คะแนน ({{ importQuestionFields.length }} คอลัมน์):
          {{ importQuestionFields.join(', ') }} — รอบนี้จะไม่นำไปสร้างผลประเมิน
          ต้องจัดการแบบประเมินแยกในระบบ
        </div>

        <!-- Preview Table -->
        <div v-if="parsedRows.length > 0" class="space-y-2">
          <div class="flex items-center justify-between">
            <span class="text-xs font-bold text-highlighted">
              รายการตรวจสอบจากไฟล์ ({{ parsedRows.length }} รายการ):
            </span>
            <span class="text-xs font-semibold text-primary">
              เลือกนำเข้า {{ selectedImportCount }} รายการ ·
              ต้องยืนยันแถวอัปเดตแยกต่างหาก
            </span>
          </div>

          <div
            class="overflow-x-auto max-h-64 border border-default rounded-xl"
          >
            <table class="w-full text-left text-xs border-collapse">
              <thead class="bg-muted/40 sticky top-0 border-b border-default">
                <tr>
                  <th class="p-2 w-10 text-center">เลือก</th>
                  <th class="p-2 w-10 text-center">#</th>
                  <th class="p-2">รหัส</th>
                  <th class="p-2">ชื่อ-นามสกุล</th>
                  <th class="p-2">อีเมล</th>
                  <th class="p-2">สำนักวิชา/หลักสูตร</th>
                  <th class="p-2">เทอม / วิชา</th>
                  <th class="p-2">สถานประกอบการ / จังหวัด</th>
                  <th class="p-2 text-center w-24">สถานะ</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-default">
                <tr
                  v-for="(row, idx) in paginatedParsedRows"
                  :key="row.id"
                  class="hover:bg-muted/10"
                  :class="
                    row.action === 'invalid'
                      ? 'bg-rose-50/40 dark:bg-rose-950/20'
                      : row.action === 'update'
                        ? 'bg-amber-50/40 dark:bg-amber-950/10'
                        : ''
                  "
                >
                  <td class="p-2 text-center">
                    <input
                      v-model="row.selected"
                      type="checkbox"
                      :disabled="
                        row.status !== 'pending' ||
                        (row.action !== 'create' && row.action !== 'update')
                      "
                      :aria-label="`ยืนยันนำเข้า ${row.student?.studentId ?? 'แถว'}`"
                    />
                  </td>
                  <td class="p-2 text-center font-mono text-muted">
                    {{
                      (excelPreviewPage - 1) * excelPreviewPageSize + idx + 1
                    }}
                  </td>
                  <td class="p-2 font-mono font-bold text-highlighted">
                    {{ row.student?.studentId || '-' }}
                  </td>
                  <td class="p-2">
                    <span class="block text-highlighted">{{
                      row.student?.name.th || '-'
                    }}</span>
                    <span class="text-[10px] text-muted">{{
                      row.student?.name.en || ''
                    }}</span>
                  </td>
                  <td class="p-2 font-mono text-muted">
                    {{ row.student?.email || '-' }}
                  </td>
                  <td class="p-2">
                    <span class="font-semibold text-highlighted">{{
                      row.student?.programReference ||
                      getProgramDisplay(row.student?.programId || '')
                    }}</span>
                    <span class="text-muted text-[10px] ml-1"
                      >({{
                        row.student?.schoolReference ||
                        getSchoolDisplay(row.student?.schoolId || '')
                      }})</span
                    >
                  </td>
                  <td class="p-2">
                    <span
                      class="font-mono text-xs font-semibold text-highlighted block"
                    >
                      {{ row.student?.semester || '-' }}
                    </span>
                    <span
                      v-if="row.student?.course"
                      class="text-[10px] text-muted block"
                    >
                      {{ row.student.course }}
                    </span>
                  </td>
                  <td class="p-2 text-xs truncate max-w-[160px]">
                    <span class="block text-highlighted font-medium truncate">
                      {{ row.student?.company || '-' }}
                    </span>
                    <span
                      v-if="row.student?.province"
                      class="text-[10px] text-muted block"
                    >
                      📍 {{ row.student.province }}
                    </span>
                  </td>
                  <td class="p-2 text-center">
                    <UBadge
                      v-if="row.status === 'committed'"
                      color="success"
                      :label="
                        row.outcome === 'created' ? 'เพิ่มแล้ว' : 'อัปเดตแล้ว'
                      "
                      size="xs"
                      variant="subtle"
                    />
                    <UBadge
                      v-else-if="row.action === 'invalid'"
                      color="error"
                      label="ข้อมูลไม่ครบ"
                      size="xs"
                      variant="subtle"
                    />
                    <UBadge
                      v-else-if="row.action === 'update'"
                      color="warning"
                      label="มีส่วนต่าง"
                      size="xs"
                      variant="subtle"
                    />
                    <UBadge
                      v-else-if="row.action === 'unchanged'"
                      color="neutral"
                      label="ไม่เปลี่ยน"
                      size="xs"
                      variant="subtle"
                    />
                    <UBadge
                      v-else
                      color="primary"
                      label="เพิ่มใหม่"
                      size="xs"
                      variant="subtle"
                    />
                  </td>
                </tr>
                <tr
                  v-for="row in paginatedParsedRows.filter(
                    (item) =>
                      item.issues.length ||
                      item.warnings.length ||
                      item.changes.length
                  )"
                  :key="`${row.id}:details`"
                  class="border-b border-default bg-muted/10"
                >
                  <td colspan="9" class="px-4 pb-3 pt-1 text-[11px] text-muted">
                    <p
                      v-for="issue in row.issues"
                      :key="issue.code"
                      class="text-error"
                    >
                      {{ issue.message }}
                    </p>
                    <p
                      v-for="warning in row.warnings"
                      :key="warning.code"
                      class="text-warning"
                    >
                      {{ warning.message }}
                    </p>
                    <p
                      v-for="change in row.changes"
                      :key="change.field"
                      class="text-highlighted"
                    >
                      {{ importFieldLabel(change.field) }}:
                      {{ importDiffValue(change.before) }} →
                      {{ importDiffValue(change.after) }}
                    </p>
                    <p v-if="row.action === 'update'">
                      ยืนยันเฉพาะแถวนี้เพื่อใช้ค่าที่แสดงด้านบนแทนข้อมูลปัจจุบัน
                    </p>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          <AppPagination
            v-model:page="excelPreviewPage"
            :total="parsedRows.length"
            :page-size="excelPreviewPageSize"
            items-name="รายการ"
          />
        </div>

        <!-- Actions -->
        <div
          class="flex items-center justify-end gap-2.5 pt-4 border-t border-default"
        >
          <UButton
            color="neutral"
            label="ปิดหน้าต่าง"
            variant="outline"
            @click="isExcelModalOpen = false"
          />
          <UButton
            v-if="parsedRows.length > 0"
            color="primary"
            icon="i-lucide-upload"
            :label="`ยืนยันนำเข้าข้อมูล (${selectedImportCount} รายการ)`"
            :loading="isExcelImporting"
            :disabled="selectedImportCount === 0"
            @click="handleExecuteExcelImport"
          />
        </div>
      </div>
    </div>

    <!-- ================================================================= -->
    <!-- MODAL 3: EDIT STUDENT (แก้ไขข้อมูลนักศึกษา)                        -->
    <!-- ================================================================= -->
    <div
      v-if="isEditModalOpen"
      class="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"
      @click="isEditModalOpen = false"
    >
      <div
        class="w-full max-w-5xl lg:max-w-6xl xl:max-w-7xl rounded-2xl sm:rounded-3xl border border-default bg-default p-6 sm:p-8 shadow-2xl space-y-6 max-h-[92vh] overflow-y-auto"
        @click.stop
      >
        <div
          class="flex items-center justify-between border-b border-default pb-4"
        >
          <div class="flex items-center gap-3">
            <span
              class="grid size-11 place-items-center rounded-xl bg-amber-500/10 text-amber-600 dark:text-amber-400 ring-1 ring-amber-500/20"
            >
              <UIcon name="i-lucide-pencil-line" class="size-6" />
            </span>
            <div>
              <h2 class="text-xl font-bold text-highlighted tracking-tight">
                แก้ไขข้อมูลนักศึกษา
                <span class="font-mono text-primary font-bold ml-1"
                  >({{ editForm.studentId }})</span
                >
              </h2>
              <p class="text-xs sm:text-sm text-muted mt-0.5">
                แก้ไขข้อมูลส่วนตัว สำนักวิชา หลักสูตร
                และข้อมูลการฝึกงานของนักศึกษา
              </p>
            </div>
          </div>
          <UButton
            color="neutral"
            icon="i-lucide-x"
            size="sm"
            variant="ghost"
            @click="isEditModalOpen = false"
          />
        </div>

        <form class="space-y-6" @submit.prevent="handleEditSubmit">
          <!-- 2 Columns Grid -->
          <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <!-- คอลัมน์ที่ 1: ข้อมูลสถานประกอบการและหลักสูตร -->
            <div
              class="rounded-2xl border border-default/70 bg-muted/15 dark:bg-muted/10 p-5 sm:p-6 space-y-4 shadow-sm"
            >
              <div
                class="flex items-center gap-2.5 pb-3 border-b border-default text-xs font-bold uppercase tracking-wider text-primary"
              >
                <UIcon
                  name="i-lucide-building-2"
                  class="size-4.5 text-primary"
                />
                <span
                  >ข้อมูลสถานประกอบการและหลักสูตร (Internship & Course
                  Info)</span
                >
              </div>

              <!-- 1. สถานประกอบการ -->
              <div>
                <label
                  class="block text-xs font-semibold text-highlighted mb-1.5"
                >
                  สถานประกอบการ (Company / หน่วยงานที่ฝึกงาน)
                </label>
                <UInput
                  v-model="editForm.company"
                  placeholder="เช่น บริษัท ดิจิทัล โซลูชั่นส์ จำกัด หรือ สวทช."
                  size="lg"
                  class="w-full"
                  icon="i-lucide-building-2"
                />
              </div>

              <!-- 2. ชื่อผู้ประเมิน / พี่เลี้ยง -->
              <div>
                <label
                  class="block text-xs font-semibold text-highlighted mb-1.5"
                >
                  ชื่อผู้ประเมิน / พี่เลี้ยง (Evaluator / Mentor Name)
                </label>
                <UInput
                  v-model="editForm.evaluatorName"
                  placeholder="เช่น นายสมบูรณ์ หัวหน้างาน หรือ พี่เลี้ยงฝึกงาน"
                  size="lg"
                  class="w-full"
                  icon="i-lucide-user-check"
                />
              </div>

              <!-- 3. อีเมลผู้ประเมิน / HR -->
              <div>
                <label
                  class="block text-xs font-semibold text-highlighted mb-1.5"
                >
                  อีเมลผู้ประเมิน / HR (Evaluator Email)
                </label>
                <UInput
                  v-model="editForm.evaluatorEmail"
                  type="email"
                  placeholder="เช่น evaluator@workplace.co.th หรือ hr@company.com"
                  size="lg"
                  class="w-full font-mono"
                  icon="i-lucide-mail"
                />
                <p class="text-[11px] text-muted mt-1">
                  อีเมลผู้ดูแลหรือฝ่ายบุคคลของสถานประกอบการสำหรับรับลิงก์ทำแบบประเมิน
                </p>
              </div>

              <!-- 4. สาขา / ที่ตั้งสถานประกอบการ -->
              <div>
                <label
                  class="block text-xs font-semibold text-highlighted mb-1.5"
                >
                  สาขา / ที่ตั้งสถานประกอบการ (Branch / Location)
                </label>
                <UInput
                  v-model="editForm.companyAddress"
                  placeholder="เช่น สำนักงานใหญ่ หรือ 99/1 ถ.พหลโยธิน"
                  size="lg"
                  class="w-full"
                  icon="i-lucide-map-pin"
                />
              </div>

              <!-- 3. จังหวัดที่ฝึกงาน -->
              <div>
                <label
                  class="block text-xs font-semibold text-highlighted mb-1.5"
                >
                  จังหวัดที่ฝึกงาน (Province)
                </label>
                <select
                  v-model="editForm.province"
                  class="w-full h-11 rounded-xl border border-default bg-default px-3 text-sm text-highlighted focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20 transition-colors truncate"
                >
                  <option value="">-- ไม่ระบุ / เลือกจังหวัด --</option>
                  <option
                    v-if="
                      editForm.province &&
                      !isProvinceInMaster(editForm.province)
                    "
                    :value="editForm.province"
                  >
                    {{ editForm.province }} (เดิม)
                  </option>
                  <optgroup
                    v-for="reg in provinceRegions"
                    :key="reg"
                    :label="reg"
                  >
                    <option
                      v-for="prov in getProvincesByRegion(reg)"
                      :key="prov.id || prov.code"
                      :value="prov.nameTh"
                    >
                      {{ prov.nameTh }} ({{ prov.nameEn }})
                    </option>
                  </optgroup>
                  <option
                    v-for="prov in getProvincesWithoutRegion()"
                    :key="prov.id || prov.code"
                    :value="prov.nameTh"
                  >
                    {{ prov.nameTh }} ({{ prov.nameEn }})
                  </option>
                </select>
              </div>

              <!-- 4. สำนักวิชา -->
              <div>
                <label
                  class="block text-xs font-semibold text-highlighted mb-1.5"
                >
                  สำนักวิชา (School) <span class="text-rose-500">*</span>
                </label>
                <select
                  v-model="editForm.schoolId"
                  class="w-full h-11 rounded-xl border border-default bg-default px-3 text-sm text-highlighted focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20 transition-colors truncate"
                  required
                >
                  <option
                    v-for="school in schoolsData?.items"
                    :key="school.id"
                    :value="school.id"
                  >
                    {{ school.name.th }} ({{ school.name.en }})
                  </option>
                </select>
              </div>

              <!-- 5. สาขาวิชา / หลักสูตร -->
              <div>
                <label
                  class="block text-xs font-semibold text-highlighted mb-1.5"
                >
                  สาขาวิชา / หลักสูตร (Program)
                  <span class="text-rose-500">*</span>
                </label>
                <select
                  v-model="editForm.programId"
                  class="w-full h-11 rounded-xl border border-default bg-default px-3 text-sm text-highlighted focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20 transition-colors truncate"
                  required
                >
                  <option
                    v-for="prog in availableProgramsForEditSchool"
                    :key="prog.id"
                    :value="prog.id"
                  >
                    {{ prog.name.th }} ({{ prog.name.en }})
                  </option>
                </select>
              </div>

              <!-- 6. รายวิชาที่ฝึกงาน -->
              <div>
                <label
                  class="block text-xs font-semibold text-highlighted mb-1.5"
                >
                  รายวิชาที่ฝึกงาน (Course)
                </label>
                <select
                  v-model="editForm.courseId"
                  class="w-full h-11 rounded-xl border border-default bg-default px-3 text-sm text-highlighted focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20 transition-colors truncate"
                >
                  <option value="">-- ไม่ระบุรายวิชา --</option>
                  <option
                    v-for="c in coursesData?.items"
                    :key="c.id"
                    :value="c.id"
                  >
                    {{ c.courseCode ? c.courseCode + ' — ' : ''
                    }}{{ c.name.th }} ({{ c.name.en }})
                  </option>
                </select>
              </div>

              <!-- 7. ภาคการศึกษา -->
              <div>
                <label
                  class="block text-xs font-semibold text-highlighted mb-1.5"
                >
                  ภาคการศึกษา (Semester)
                </label>
                <select
                  v-model="editForm.semester"
                  class="w-full h-11 rounded-xl border border-default bg-default px-3 text-sm text-highlighted focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20 transition-colors truncate"
                >
                  <option value="" disabled>-- เลือกภาคการศึกษา --</option>
                  <option
                    v-if="
                      editForm.semester &&
                      ![
                        'ภาคการศึกษาต้น',
                        'ภาคการศึกษาปลาย',
                        'ภาคการศึกษาฤดูร้อน'
                      ].includes(editForm.semester)
                    "
                    :value="editForm.semester"
                  >
                    {{ formatSemesterText(editForm.semester) }}
                  </option>
                  <option value="ภาคการศึกษาต้น">
                    ภาคการศึกษาที่ 1 (ภาคการศึกษาต้น)
                  </option>
                  <option value="ภาคการศึกษาปลาย">
                    ภาคการศึกษาที่ 2 (ภาคการศึกษาปลาย)
                  </option>
                  <option value="ภาคการศึกษาฤดูร้อน">
                    ภาคการศึกษาที่ 3 (ภาคการศึกษาฤดูร้อน)
                  </option>
                </select>
              </div>
            </div>

            <!-- คอลัมน์ที่ 2: ข้อมูลส่วนตัวและการศึกษา -->
            <div
              class="rounded-2xl border border-default/70 bg-muted/15 dark:bg-muted/10 p-5 sm:p-6 space-y-4 shadow-sm"
            >
              <div
                class="flex items-center gap-2.5 pb-3 border-b border-default text-xs font-bold uppercase tracking-wider text-primary"
              >
                <UIcon name="i-lucide-user" class="size-4.5 text-primary" />
                <span>ข้อมูลส่วนตัวและการศึกษา (Personal & Academic Info)</span>
              </div>

              <!-- 1. รหัสนักศึกษา (Readonly) -->
              <div>
                <label
                  class="block text-xs font-semibold text-highlighted mb-1.5"
                >
                  รหัสนักศึกษา (Student ID)
                </label>
                <UInput
                  v-model="editForm.studentId"
                  disabled
                  size="lg"
                  class="w-full font-mono font-bold opacity-80"
                  icon="i-lucide-id-card"
                />
              </div>

              <!-- 2. ปีการศึกษา และ ปีที่เข้าศึกษา (2-Column Subgrid) -->
              <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label
                    class="block text-xs font-semibold text-highlighted mb-1.5"
                  >
                    ปีการศึกษา (Academic Year)
                  </label>
                  <UInput
                    v-model.number="editForm.academicYear"
                    type="number"
                    placeholder="2569"
                    size="lg"
                    class="w-full font-mono"
                    icon="i-lucide-calendar"
                  />
                </div>
                <div>
                  <label
                    class="block text-xs font-semibold text-highlighted mb-1.5"
                  >
                    ปีที่เข้าศึกษา (Admission Year)
                  </label>
                  <UInput
                    v-model.number="editForm.admissionYear"
                    type="number"
                    placeholder="2565"
                    size="lg"
                    class="w-full font-mono"
                    icon="i-lucide-calendar-days"
                  />
                </div>
              </div>

              <!-- 3. ชื่อ-นามสกุล (ภาษาไทย) -->
              <div>
                <label
                  class="block text-xs font-semibold text-highlighted mb-1.5"
                >
                  ชื่อ-นามสกุล (ภาษาไทย) <span class="text-rose-500">*</span>
                </label>
                <UInput
                  v-model="editForm.nameTh"
                  placeholder="เช่น นายนิติพงษ์ สิทธิวงค์"
                  size="lg"
                  class="w-full"
                  required
                />
              </div>

              <!-- 4. Full Name (English) -->
              <div>
                <label
                  class="block text-xs font-semibold text-highlighted mb-1.5"
                >
                  Full Name (English) <span class="text-rose-500">*</span>
                </label>
                <UInput
                  v-model="editForm.nameEn"
                  placeholder="เช่น Mr. Nitipong Sittiwong"
                  size="lg"
                  class="w-full"
                  required
                />
              </div>

              <!-- 5. อีเมลนักศึกษา (Student Email) -->
              <div>
                <label
                  class="block text-xs font-semibold text-highlighted mb-1.5"
                >
                  อีเมลนักศึกษา (Student Email / ลำดวนเมล)
                  <span class="text-rose-500">*</span>
                </label>
                <UInput
                  v-model="editForm.email"
                  type="email"
                  placeholder="เช่น student@lamduan.mfu.ac.th"
                  size="lg"
                  class="w-full font-mono"
                  icon="i-lucide-graduation-cap"
                  required
                />
                <p class="text-[11px] text-muted mt-1">
                  อีเมลทางการมหาวิทยาลัยแม่ฟ้าหลวง (@lamduan.mfu.ac.th)
                </p>
              </div>

              <!-- 6. อีเมลส่วนตัว (Personal Email) -->
              <div>
                <label
                  class="block text-xs font-semibold text-highlighted mb-1.5"
                >
                  อีเมลส่วนตัว (Personal Email)
                </label>
                <UInput
                  v-model="editForm.personalEmail"
                  type="email"
                  placeholder="เช่น somchai.dev@gmail.com"
                  size="lg"
                  class="w-full font-mono"
                  icon="i-lucide-mail"
                />
                <p class="text-[11px] text-muted mt-1">
                  อีเมลส่วนตัวหรืออีเมลสำรองสำหรับติดต่อ (เช่น Gmail, Outlook)
                </p>
              </div>
            </div>
          </div>

          <!-- Actions -->
          <div
            class="flex items-center justify-end gap-3 pt-4 border-t border-default"
          >
            <UButton
              color="neutral"
              label="ยกเลิก"
              size="lg"
              variant="outline"
              @click="isEditModalOpen = false"
            />
            <UButton
              color="primary"
              icon="i-lucide-save"
              label="บันทึกการแก้ไข"
              size="lg"
              :loading="isEditSubmitting"
              type="submit"
            />
          </div>
        </form>
      </div>
    </div>

    <!-- ================================================================= -->
    <!-- MODAL 4: SEND EVALUATION EMAIL (ส่งอีเมลแบบประเมินให้นักศึกษา)     -->
    <!-- ================================================================= -->
    <div
      v-if="isSendEmailModalOpen"
      class="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm"
      @click="handleModalBackdropClick"
    >
      <div
        class="w-full rounded-2xl border border-default bg-elevated shadow-2xl overflow-hidden flex flex-col max-h-[94vh] transition-all duration-300"
        :class="[
          (isSendingEvaluationEmail && sendEmailModalMode === 'single') ||
          sendEmailSuccessData
            ? 'max-w-md sm:max-w-lg'
            : bulkSendSuccessData
              ? 'max-w-4xl'
              : 'max-w-[1440px]'
        ]"
        @click.stop
      >
        <!-- Modal Header (only visible during configuration form or bulk success) -->
        <div
          v-if="
            !sendEmailSuccessData &&
            !(isSendingEvaluationEmail && sendEmailModalMode === 'single')
          "
          class="flex items-center justify-between border-b border-default px-6 py-4 bg-muted/20 shrink-0"
        >
          <div class="flex items-center gap-3">
            <span
              class="grid size-10 place-items-center rounded-xl bg-primary/10 text-primary"
            >
              <UIcon name="i-lucide-mail" class="size-5" />
            </span>
            <div>
              <div class="flex items-center gap-2">
                <h2 class="text-base sm:text-lg font-bold text-highlighted">
                  {{
                    sendEmailModalMode === 'bulk'
                      ? 'ส่งแบบประเมินผลการฝึกงานหลายคน (Bulk Evaluation Dispatch)'
                      : 'ส่งแบบประเมินผลการฝึกงานทางอีเมล'
                  }}
                </h2>
                <UBadge
                  color="primary"
                  variant="subtle"
                  size="xs"
                  :label="
                    sendEmailModalMode === 'bulk'
                      ? `เลือกอยู่ ${bulkModalStudents.length} คน`
                      : 'Evaluation Dispatch'
                  "
                />
              </div>
              <p class="text-xs text-muted">
                <template v-if="sendEmailModalMode === 'bulk'">
                  ส่งลิงก์แบบประเมินให้แก่ผู้ดูแล /
                  สถานประกอบการของนักศึกษาที่เลือกจำนวน
                  <strong class="text-highlighted"
                    >{{ bulkModalStudents.length }} คน</strong
                  >
                  พร้อมกัน
                </template>
                <template v-else>
                  ส่งลิงก์แบบประเมินให้แก่ผู้ดูแล / สถานประกอบการสำหรับนักศึกษา
                  <strong class="text-highlighted">
                    {{ sendModalStudent?.name.th }} ({{
                      sendModalStudent?.studentId
                    }})
                  </strong>
                </template>
              </p>
            </div>
          </div>
          <UButton
            color="neutral"
            icon="i-lucide-x"
            size="sm"
            variant="ghost"
            :disabled="isSendingEvaluationEmail"
            @click="finishAndCloseSendModal"
          />
        </div>

        <!-- State 1: Sending Loading Animation Screen (Single Mode) -->
        <div
          v-if="isSendingEvaluationEmail && sendEmailModalMode === 'single'"
          class="p-8 sm:p-10 flex flex-col items-center justify-center text-center space-y-6"
        >
          <!-- Animated Spinner with Send Icon -->
          <div class="relative size-24 flex items-center justify-center">
            <div
              class="absolute inset-0 rounded-full border-4 border-primary/20"
            ></div>
            <div
              class="absolute inset-0 rounded-full border-4 border-primary border-t-transparent animate-spin"
            ></div>
            <UIcon
              name="i-lucide-send"
              class="size-10 text-primary animate-pulse"
            />
          </div>

          <div class="space-y-2">
            <h3 class="text-xl font-bold text-highlighted">
              กำลังส่งแบบประเมิน...
            </h3>
            <p class="text-sm text-muted max-w-sm mx-auto leading-relaxed">
              ระบบกำลังสร้างชุดข้อสอบและส่งลิงก์แบบประเมินไปยัง
              <span class="font-mono font-semibold text-highlighted block mt-1">
                {{ sendEmailForm.recipientEmail }}
              </span>
            </p>
          </div>

          <div
            class="inline-flex items-center gap-2 text-xs text-muted bg-muted/40 px-3.5 py-1.5 rounded-full border border-default/50"
          >
            <UIcon
              name="i-lucide-loader-2"
              class="size-3.5 animate-spin text-primary"
            />
            <span>กรุณารอสักครู่ ระบบกำลังประมวลผล...</span>
          </div>
        </div>

        <!-- State 2: Compact Animated Success Screen (Single Mode) -->
        <div
          v-else-if="sendEmailSuccessData"
          class="p-6 sm:p-8 space-y-5 text-center relative"
        >
          <!-- Top 'X' Close Button -->
          <div class="flex justify-end -mt-2 -mr-2">
            <UButton
              color="neutral"
              icon="i-lucide-x"
              size="sm"
              variant="ghost"
              @click="finishAndCloseSendModal"
            />
          </div>

          <!-- Animated Green Checkmark Badge -->
          <div
            class="relative size-20 mx-auto flex items-center justify-center"
          >
            <div
              class="absolute inset-0 rounded-full bg-emerald-500/15 animate-ping opacity-60"
            ></div>
            <div
              class="relative grid size-20 place-items-center rounded-full bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 shadow-lg shadow-emerald-500/10"
            >
              <UIcon name="i-lucide-check-circle-2" class="size-10" />
            </div>
          </div>

          <!-- Title and Description -->
          <div class="space-y-1.5">
            <h3 class="text-xl font-bold text-highlighted">
              เข้าคิวส่งคำเชิญแล้ว
            </h3>
            <p class="text-xs text-muted max-w-md mx-auto leading-relaxed">
              ระบบรับคำขอและเข้าคิวส่งลิงก์แบบประเมินสำหรับนักศึกษา
              <strong class="text-highlighted font-semibold">{{
                sendEmailSuccessData.studentName
              }}</strong>
              ไปยังอีเมล
              <strong class="text-highlighted font-mono">{{
                sendEmailSuccessData.recipientEmail
              }}</strong>
              แล้ว โดยสามารถติดตามผลจริงจากรายการ Delivery
            </p>
          </div>

          <!-- Compact Direct Link Box -->
          <div
            class="rounded-xl border border-default bg-muted/20 p-3.5 text-left space-y-2 max-w-md mx-auto shadow-2xs"
          >
            <div class="flex items-center justify-between text-xs">
              <span class="font-semibold text-highlighted"
                >ลิงก์สำหรับทำแบบประเมิน:</span
              >
              <span class="text-[11px] text-muted">คลิกเพื่อคัดลอก</span>
            </div>
            <div class="flex items-center gap-2">
              <input
                readonly
                :value="sendEmailSuccessData.invitationUrl"
                class="flex-1 h-8 rounded-lg border border-default bg-default px-3 text-xs font-mono text-highlighted focus:outline-none select-all"
              />
              <UButton
                color="primary"
                variant="subtle"
                icon="i-lucide-copy"
                label="คัดลอก"
                size="xs"
                @click="copyInvitationLink(sendEmailSuccessData.invitationUrl)"
              />
            </div>
          </div>

          <!-- Actions: Prominent 'ตกลง' (Finished) button & secondary actions -->
          <div class="space-y-2 pt-2 max-w-md mx-auto">
            <UButton
              color="primary"
              size="lg"
              block
              label="ตกลง (เสร็จสิ้น)"
              icon="i-lucide-check"
              @click="finishAndCloseSendModal"
            />
            <div class="flex items-center justify-center gap-3 pt-1">
              <UButton
                color="neutral"
                variant="ghost"
                size="xs"
                icon="i-lucide-external-link"
                label="ทดลองเปิดทำแบบประเมิน"
                target="_blank"
                :to="sendEmailSuccessData.invitationUrl"
              />
              <span class="text-muted/40">•</span>
              <UButton
                color="neutral"
                variant="ghost"
                size="xs"
                icon="i-lucide-inbox"
                label="ดูประวัติในหน้าการสื่อสาร"
                to="/app/correspondence"
                @click="finishAndCloseSendModal"
              />
            </div>
          </div>
        </div>

        <!-- If Bulk Success State: Show Sent Success Screen for Bulk -->
        <div
          v-else-if="bulkSendSuccessData"
          class="p-6 overflow-y-auto flex-1 space-y-5 max-w-4xl mx-auto w-full"
        >
          <div
            class="rounded-xl border border-emerald-500/20 bg-emerald-500/[0.04] p-6 text-center space-y-3 shadow-sm"
          >
            <div
              class="grid size-14 place-items-center rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 mx-auto"
            >
              <UIcon name="i-lucide-check-circle-2" class="size-8" />
            </div>
            <div class="space-y-1">
              <h3 class="text-xl font-bold text-highlighted">
                ส่งอีเมลแบบประเมินกลุ่มเรียบร้อยแล้ว
              </h3>
              <p class="text-xs text-muted">
                ส่งสำเร็จทั้งหมด
                <strong
                  class="text-emerald-600 dark:text-emerald-400 font-bold"
                >
                  {{ bulkSendSuccessData.totalSent }}
                </strong>
                จาก {{ bulkSendSuccessData.items.length }} รายการ
                <span
                  v-if="bulkSendSuccessData.failedCount > 0"
                  class="text-rose-500 font-semibold ml-1"
                >
                  (ผิดพลาด {{ bulkSendSuccessData.failedCount }} รายการ)
                </span>
              </p>
            </div>
          </div>

          <!-- Bulk Results Table -->
          <div
            class="rounded-xl border border-default bg-default overflow-hidden shadow-xs"
          >
            <div class="overflow-x-auto max-h-[360px]">
              <table class="w-full text-left text-xs">
                <thead
                  class="border-b border-default bg-muted/40 font-semibold text-highlighted sticky top-0 bg-default z-10"
                >
                  <tr>
                    <th class="py-2.5 px-3">นักศึกษา</th>
                    <th class="py-2.5 px-3">สถานประกอบการ</th>
                    <th class="py-2.5 px-3">ผู้รับ / อีเมล</th>
                    <th class="py-2.5 px-3 text-center">สถานะ</th>
                    <th class="py-2.5 px-3 text-right">การดำเนินการ</th>
                  </tr>
                </thead>
                <tbody class="divide-y divide-default">
                  <tr
                    v-for="item in bulkSendSuccessData.items"
                    :key="item.studentId"
                    class="hover:bg-muted/10 transition-colors"
                  >
                    <td class="py-2.5 px-3">
                      <div class="font-semibold text-highlighted">
                        {{ item.studentName }}
                      </div>
                      <div class="text-[11px] font-mono text-muted">
                        {{ item.studentCode }}
                      </div>
                    </td>
                    <td class="py-2.5 px-3 text-muted">
                      {{ item.company }}
                    </td>
                    <td class="py-2.5 px-3">
                      <div class="text-highlighted font-medium">
                        {{ item.evaluatorName }}
                      </div>
                      <div class="text-[11px] font-mono text-muted">
                        {{ item.email }}
                      </div>
                    </td>
                    <td class="py-2.5 px-3 text-center">
                      <UBadge
                        v-if="item.success"
                        color="success"
                        variant="subtle"
                        size="xs"
                        label="ส่งสำเร็จ"
                        icon="i-lucide-check"
                      />
                      <UBadge
                        v-else
                        color="error"
                        variant="subtle"
                        size="xs"
                        label="ส่งไม่สำเร็จ"
                        icon="i-lucide-alert-circle"
                        :title="item.error"
                      />
                    </td>
                    <td class="py-2.5 px-3 text-right">
                      <div
                        v-if="item.invitationUrl"
                        class="inline-flex items-center gap-1.5 justify-end"
                      >
                        <UButton
                          color="neutral"
                          variant="ghost"
                          size="xs"
                          icon="i-lucide-copy"
                          title="คัดลอกลิงก์แบบประเมิน"
                          @click="copyInvitationLink(item.invitationUrl)"
                        />
                        <UButton
                          color="primary"
                          variant="subtle"
                          size="xs"
                          icon="i-lucide-external-link"
                          label="เปิดลิงก์"
                          target="_blank"
                          :to="item.invitationUrl"
                        />
                      </div>
                      <span v-else class="text-[11px] text-rose-500 font-mono">
                        {{ item.error || 'ผิดพลาด' }}
                      </span>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          <div class="flex flex-wrap items-center justify-center gap-3 pt-2">
            <UButton
              color="neutral"
              icon="i-lucide-inbox"
              label="ดูประวัติในหน้าการสื่อสาร"
              size="md"
              variant="outline"
              to="/app/correspondence"
              @click="finishAndCloseSendModal"
            />
            <UButton
              color="primary"
              icon="i-lucide-check"
              label="ตกลง (เสร็จสิ้น)"
              size="md"
              @click="finishAndCloseSendModal"
            />
          </div>
        </div>

        <!-- Normal State: 3 Columns Grid -->
        <div
          v-else
          class="grid grid-cols-1 lg:grid-cols-12 gap-5 p-6 overflow-y-auto flex-1 items-stretch"
        >
          <!-- ============================================================ -->
          <!-- คอลัมน์ที่ 1 (3 ส่วน): 1. เลือกแบบประเมิน (FORM SELECTION)         -->
          <!-- ============================================================ -->
          <div class="lg:col-span-3 flex flex-col space-y-3">
            <div
              class="flex items-center justify-between border-b border-default pb-2 shrink-0"
            >
              <div
                class="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-primary"
              >
                <UIcon name="i-lucide-clipboard-list" class="size-4" />
                <span>1. แบบประเมิน (Form)</span>
              </div>
              <span class="text-[11px] text-muted font-medium"
                >{{ activeCompetencyForms.length }} แบบ</span
              >
            </div>

            <!-- List of Forms -->
            <div class="space-y-2.5 overflow-y-auto pr-1 flex-1 max-h-[560px]">
              <div
                v-for="form in activeCompetencyForms"
                :key="form.id"
                class="rounded-xl border p-3.5 cursor-pointer transition-all hover:border-primary/50 shadow-2xs"
                :class="
                  selectedCompetencySet?.id === form.id
                    ? 'border-primary bg-primary/[0.06] ring-2 ring-primary/25'
                    : 'border-default bg-default hover:bg-muted/15'
                "
                @click="selectCompetencyForm(form)"
              >
                <div class="flex items-start justify-between gap-2">
                  <div class="space-y-1.5 min-w-0">
                    <div class="flex items-center gap-1.5">
                      <span class="font-mono text-xs font-bold text-primary">{{
                        form.code
                      }}</span>
                      <UBadge
                        :color="
                          form.status === 'active' ? 'success' : 'neutral'
                        "
                        :label="
                          form.status === 'active' ? 'พร้อมใช้งาน' : 'ฉบับร่าง'
                        "
                        size="xs"
                        variant="subtle"
                      />
                    </div>
                    <h4
                      class="text-xs sm:text-sm font-semibold text-highlighted leading-snug break-words"
                    >
                      {{ form.name.th }}
                    </h4>
                    <p class="text-[11px] text-muted line-clamp-1">
                      {{ form.name.en }}
                    </p>
                  </div>
                  <input
                    type="radio"
                    :checked="selectedCompetencySet?.id === form.id"
                    class="mt-1 size-4 text-primary focus:ring-primary/20 cursor-pointer shrink-0"
                  />
                </div>
              </div>

              <div
                v-if="!activeCompetencyForms.length"
                class="rounded-xl border border-dashed border-default p-6 text-center text-muted text-xs space-y-2"
              >
                <UIcon
                  name="i-lucide-file-question"
                  class="size-8 mx-auto text-muted"
                />
                <p>ยังไม่มีแบบประเมินในระบบ</p>
                <NuxtLink
                  to="/app/evaluations/forms"
                  class="text-primary hover:underline block"
                >
                  คลิกเพื่อไปสร้างแบบประเมิน
                </NuxtLink>
              </div>
            </div>
          </div>

          <!-- ============================================================ -->
          <!-- คอลัมน์ที่ 2 (5 ส่วน): 2. ข้อมูลผู้รับและเกณฑ์ (RECIPIENT & CRITERIA) -->
          <!-- ============================================================ -->
          <div class="lg:col-span-5 flex flex-col space-y-3.5">
            <div
              class="flex items-center justify-between border-b border-default pb-2 shrink-0"
            >
              <div
                class="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-primary"
              >
                <UIcon name="i-lucide-user-check" class="size-4" />
                <span>
                  {{
                    sendEmailModalMode === 'bulk'
                      ? `2. ข้อมูลผู้รับ (${bulkModalStudents.length} คน)`
                      : '2. ข้อมูลผู้รับและเกณฑ์'
                  }}
                </span>
              </div>
              <span
                v-if="selectedCompetencyVersion"
                class="text-[11px] text-muted font-medium"
              >
                {{ selectedCompetencyVersion.sections?.length || 0 }} หมวดเกณฑ์
              </span>
            </div>

            <!-- SINGLE MODE: Single Recipient Card -->
            <div
              v-if="sendEmailModalMode === 'single'"
              class="rounded-xl border border-default bg-muted/10 p-4 space-y-3.5 shadow-2xs shrink-0"
            >
              <div class="space-y-1.5">
                <label class="block text-xs font-semibold text-highlighted">
                  อีเมลผู้รับ (ผู้ประเมิน / HR)
                  <span class="text-rose-500">*</span>
                </label>
                <UInput
                  v-model="sendEmailForm.recipientEmail"
                  placeholder="เช่น hr@company.com"
                  icon="i-lucide-mail"
                  size="md"
                  class="w-full"
                  required
                />
              </div>

              <div class="space-y-1.5">
                <label class="block text-xs font-semibold text-highlighted">
                  ชื่อผู้ประเมิน / พี่เลี้ยง
                </label>
                <UInput
                  v-model="sendEmailForm.evaluatorName"
                  placeholder="เช่น นายสมบูรณ์ หัวหน้างาน"
                  icon="i-lucide-user"
                  size="md"
                  class="w-full"
                />
              </div>

              <div class="grid grid-cols-2 gap-3 pt-1">
                <div class="space-y-1">
                  <label class="block text-xs font-medium text-muted">
                    กำหนดส่งภายใน
                  </label>
                  <select
                    v-model="sendEmailForm.deadlineDays"
                    class="w-full h-9 rounded-lg border border-default bg-default px-3 text-xs text-highlighted focus:border-primary focus:outline-none"
                  >
                    <option :value="7">7 วัน</option>
                    <option :value="14">14 วัน</option>
                    <option :value="30">30 วัน (1 เดือน)</option>
                    <option :value="60">60 วัน (2 เดือน)</option>
                  </select>
                </div>
                <div class="space-y-1">
                  <label class="block text-xs font-medium text-muted">
                    นักศึกษา
                  </label>
                  <div
                    class="h-9 rounded-lg border border-default bg-default/70 px-3 flex items-center text-xs text-highlighted font-medium truncate"
                    :title="`${sendModalStudent?.studentId} - ${sendModalStudent?.name.th}`"
                  >
                    {{ sendModalStudent?.name.th }}
                  </div>
                </div>
              </div>
            </div>

            <!-- BULK MODE: Global Settings + Student Batch List -->
            <div v-else class="flex flex-col space-y-3 shrink-0">
              <!-- Global Deadline & Quick Fill Card -->
              <div
                class="rounded-xl border border-default bg-muted/10 p-3.5 space-y-3 shadow-2xs"
              >
                <div class="flex items-center justify-between gap-2">
                  <span
                    class="text-xs font-bold text-highlighted flex items-center gap-1.5"
                  >
                    <UIcon
                      name="i-lucide-calendar-clock"
                      class="size-4 text-primary"
                    />
                    กำหนดส่งภายใน (ทุกคน):
                  </span>
                  <select
                    v-model="sendEmailForm.deadlineDays"
                    class="h-8 rounded-lg border border-default bg-default px-2.5 text-xs text-highlighted focus:border-primary focus:outline-none"
                  >
                    <option :value="7">7 วัน</option>
                    <option :value="14">14 วัน</option>
                    <option :value="30">30 วัน (1 เดือน)</option>
                    <option :value="60">60 วัน (2 เดือน)</option>
                  </select>
                </div>

                <!-- Quick Apply Tools -->
                <div class="pt-2 border-t border-default/60 space-y-2">
                  <span
                    class="text-[11px] font-semibold text-muted flex items-center gap-1"
                  >
                    <UIcon name="i-lucide-zap" class="size-3 text-amber-500" />
                    ตั้งค่าด่วนสำหรับทุกคน (Batch Quick Fill):
                  </span>
                  <div class="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    <div class="flex items-center gap-1.5">
                      <UInput
                        v-model="bulkCommonEmail"
                        placeholder="อีเมลผู้รับทุกคน"
                        size="xs"
                        class="flex-1"
                      />
                      <UButton
                        color="primary"
                        variant="soft"
                        size="xs"
                        label="ใช้ทุกคน"
                        @click="applyBulkEmailToAll"
                      />
                    </div>
                    <div class="flex items-center gap-1.5">
                      <UInput
                        v-model="bulkCommonEvaluator"
                        placeholder="ชื่อผู้ดูแลทุกคน"
                        size="xs"
                        class="flex-1"
                      />
                      <UButton
                        color="neutral"
                        variant="soft"
                        size="xs"
                        label="ใช้ทุกคน"
                        @click="applyBulkEvaluatorToAll"
                      />
                    </div>
                  </div>
                </div>
              </div>

              <!-- Student Rows List -->
              <div class="space-y-1.5">
                <div class="flex items-center justify-between px-1">
                  <span class="text-xs font-semibold text-highlighted">
                    รายชื่อผู้รับแต่ละคน ({{ bulkModalStudents.length }} คน):
                  </span>
                  <span class="text-[11px] text-muted">
                    กด "ดูตัวอย่าง" เพื่อดูจดหมาย
                  </span>
                </div>

                <div
                  class="space-y-2.5 overflow-y-auto pr-1 max-h-[300px] rounded-xl"
                >
                  <div
                    v-for="(st, sIdx) in bulkModalStudents"
                    :key="st.id"
                    class="rounded-xl border p-3 transition-all text-xs space-y-2"
                    :class="
                      sendModalStudent?.id === st.id
                        ? 'border-primary bg-primary/[0.04] ring-1 ring-primary/30'
                        : 'border-default bg-default hover:bg-muted/10'
                    "
                  >
                    <!-- Student Row Header -->
                    <div class="flex items-center justify-between gap-2">
                      <div class="flex items-center gap-2 min-w-0">
                        <span
                          class="grid size-5 place-items-center rounded-full bg-muted/30 text-[10px] font-bold text-muted shrink-0"
                        >
                          {{ sIdx + 1 }}
                        </span>
                        <div class="font-semibold text-highlighted truncate">
                          {{ st.name.th }}
                          <span
                            class="font-mono font-normal text-muted text-[11px]"
                          >
                            ({{ st.studentId }})
                          </span>
                        </div>
                        <UBadge
                          v-if="st.company"
                          color="neutral"
                          variant="subtle"
                          size="xs"
                          :label="st.company"
                          class="truncate max-w-[140px]"
                        />
                      </div>

                      <div class="shrink-0">
                        <UBadge
                          v-if="sendModalStudent?.id === st.id"
                          color="primary"
                          variant="solid"
                          size="xs"
                          label="กำลังดูตัวอย่าง"
                        />
                        <button
                          v-else
                          type="button"
                          class="text-[11px] text-primary hover:underline flex items-center gap-1 font-medium cursor-pointer"
                          @click="sendModalStudent = st"
                        >
                          <UIcon name="i-lucide-eye" class="size-3" />
                          ดูตัวอย่าง
                        </button>
                      </div>
                    </div>

                    <!-- Student Inputs Row -->
                    <div
                      v-if="bulkStudentEvaluators[st.id]"
                      class="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-0.5"
                    >
                      <div class="space-y-0.5">
                        <label class="text-[11px] text-muted font-medium">
                          อีเมลผู้รับ <span class="text-rose-500">*</span>
                        </label>
                        <UInput
                          v-model="bulkStudentEvaluators[st.id]!.email"
                          placeholder="เช่น hr@company.com"
                          size="xs"
                          icon="i-lucide-mail"
                          class="w-full"
                          required
                        />
                      </div>
                      <div class="space-y-0.5">
                        <label class="text-[11px] text-muted font-medium">
                          ชื่อผู้ประเมิน / พี่เลี้ยง
                        </label>
                        <UInput
                          v-model="bulkStudentEvaluators[st.id]!.name"
                          placeholder="ชื่อผู้ดูแลการฝึกงาน"
                          size="xs"
                          icon="i-lucide-user"
                          class="w-full"
                        />
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <!-- Live Form Questions Preview Card -->
            <div
              class="rounded-xl border border-default bg-default p-3.5 space-y-2.5 shadow-2xs flex-1 flex flex-col min-h-0"
            >
              <div class="flex items-center justify-between shrink-0">
                <span
                  class="text-xs font-bold text-highlighted flex items-center gap-1.5"
                >
                  <UIcon
                    name="i-lucide-list-checks"
                    class="size-3.5 text-primary"
                  />
                  เกณฑ์การประเมินในแบบฟอร์มนี้:
                </span>
                <span
                  v-if="isLoadingFormVersion"
                  class="text-[11px] text-primary animate-pulse"
                >
                  กำลังโหลด...
                </span>
              </div>

              <!-- Sections list in preview (Scrollable) -->
              <div
                v-if="selectedCompetencyVersion?.sections?.length"
                class="space-y-2 overflow-y-auto pr-1 flex-1 max-h-[160px]"
              >
                <div
                  v-for="(sec, sIdx) in selectedCompetencyVersion.sections"
                  :key="sec.id || sIdx"
                  class="rounded-lg border border-default/70 bg-muted/20 p-2 space-y-1 text-xs"
                >
                  <div class="flex items-center justify-between gap-1">
                    <div class="flex items-center gap-1.5 min-w-0">
                      <UBadge
                        :color="
                          sec.category === 'general'
                            ? 'primary'
                            : sec.category === 'suggestion'
                              ? 'warning'
                              : 'secondary'
                        "
                        :label="
                          sec.category === 'general'
                            ? 'หมวดทั่วไป'
                            : sec.category === 'suggestion'
                              ? 'หมวดคำแนะนำ'
                              : 'หมวดพิเศษ'
                        "
                        size="xs"
                        variant="subtle"
                        class="shrink-0"
                      />
                      <strong class="text-highlighted truncate">{{
                        sec.title.th
                      }}</strong>
                    </div>
                    <span class="text-[11px] text-muted shrink-0"
                      >{{ sec.questions?.length || 0 }} ข้อ</span
                    >
                  </div>
                  <ul
                    class="list-disc list-inside text-[11px] text-muted space-y-0.5"
                  >
                    <li
                      v-for="q in sec.questions?.slice(0, 2)"
                      :key="q.id"
                      class="truncate"
                    >
                      {{ q.label.th }}
                    </li>
                    <li
                      v-if="(sec.questions?.length || 0) > 2"
                      class="text-primary italic"
                    >
                      และข้ออื่นๆ อีก
                      {{ (sec.questions?.length || 0) - 2 }} ข้อ...
                    </li>
                  </ul>
                </div>
              </div>
              <div
                v-else
                class="text-xs text-muted text-center py-4 flex-1 flex items-center justify-center"
              >
                {{
                  isLoadingFormVersion
                    ? 'กำลังโหลดข้อสอบ...'
                    : 'ไม่พบรายการคำถามในแบบฟอร์มนี้'
                }}
              </div>
            </div>
          </div>

          <!-- ============================================================ -->
          <!-- คอลัมน์ที่ 3 (4 ส่วน): 3. ตัวอย่างจดหมายที่จะส่ง (LIVE PREVIEW)      -->
          <!-- ============================================================ -->
          <div class="lg:col-span-4 flex flex-col space-y-3 min-w-0">
            <div
              class="flex items-center justify-between border-b border-default pb-2 shrink-0 flex-wrap gap-2"
            >
              <div
                class="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-primary"
              >
                <UIcon name="i-lucide-mail-check" class="size-4" />
                <span>3. ตัวอย่างจดหมายที่จะส่ง</span>
              </div>

              <div class="flex items-center gap-2">
                <!-- Bulk Preview Student Switcher -->
                <div
                  v-if="
                    sendEmailModalMode === 'bulk' &&
                    bulkModalStudents.length > 1
                  "
                  class="flex items-center gap-1"
                >
                  <span class="text-[11px] text-muted">ตัวอย่าง:</span>
                  <select
                    :value="sendModalStudent?.id"
                    class="h-7 rounded-md border border-default bg-default px-2 text-[11px] text-highlighted focus:border-primary focus:outline-none max-w-[140px] truncate"
                    @change="
                      (e) => {
                        const targetId = (e.target as HTMLSelectElement).value
                        const found = bulkModalStudents.find(
                          (s) => s.id === targetId
                        )
                        if (found) sendModalStudent = found
                      }
                    "
                  >
                    <option
                      v-for="s in bulkModalStudents"
                      :key="s.id"
                      :value="s.id"
                    >
                      {{ s.name.th }}
                    </option>
                  </select>
                </div>

                <!-- Mode Switcher -->
                <div
                  class="inline-flex rounded-lg border border-default bg-default p-0.5 text-xs shadow-2xs"
                >
                  <button
                    type="button"
                    class="px-2 py-0.5 rounded-md text-[11px] font-medium transition-colors cursor-pointer"
                    :class="
                      emailPreviewTab === 'design'
                        ? 'bg-primary text-inverted shadow-2xs'
                        : 'text-muted hover:text-highlighted'
                    "
                    @click="emailPreviewTab = 'design'"
                  >
                    รูปแบบจดหมาย
                  </button>
                  <button
                    type="button"
                    class="px-2 py-0.5 rounded-md text-[11px] font-medium transition-colors cursor-pointer"
                    :class="
                      emailPreviewTab === 'text'
                        ? 'bg-primary text-inverted shadow-2xs'
                        : 'text-muted hover:text-highlighted'
                    "
                    @click="emailPreviewTab = 'text'"
                  >
                    ข้อความธรรมดา
                  </button>
                </div>

                <!-- Quick link to Settings -->
                <UButton
                  to="/app/settings/email"
                  target="_blank"
                  color="neutral"
                  variant="outline"
                  size="xs"
                  icon="i-lucide-settings-2"
                  title="ไปที่หน้าตั้งค่าจดหมาย"
                >
                  ตั้งค่า
                </UButton>
              </div>
            </div>

            <!-- Subject Header Box -->
            <div
              class="rounded-xl border border-default bg-muted/20 p-2.5 text-xs flex items-start gap-2 shadow-2xs shrink-0"
            >
              <span class="text-muted shrink-0 font-semibold">หัวข้อ:</span>
              <span
                class="text-highlighted font-bold line-clamp-2 break-words text-xs"
              >
                {{ previewSubject }}
              </span>
            </div>

            <!-- Email Container Frame (Generous full height) -->
            <div
              class="rounded-xl border border-default bg-default overflow-hidden flex flex-col flex-1 shadow-xs min-h-[380px] max-h-[520px]"
            >
              <div
                v-if="isLoadingEmailTemplate"
                class="text-center py-12 text-xs text-muted space-y-2 flex-1 flex flex-col items-center justify-center"
              >
                <UIcon
                  name="i-lucide-loader-2"
                  class="size-6 animate-spin text-primary"
                />
                <p>กำลังโหลดรูปแบบจดหมายจากระบบตั้งค่า...</p>
              </div>

              <!-- Visual HTML Preview -->
              <div
                v-else-if="emailPreviewTab === 'design' && previewHtml"
                class="bg-white text-slate-800 p-4 shadow-inner flex-1 overflow-y-auto overflow-x-hidden text-[13px]"
              >
                <iframe
                  :srcdoc="previewEmailDocument"
                  title="ตัวอย่างอีเมลคำเชิญประเมิน"
                  sandbox=""
                  referrerpolicy="no-referrer"
                  class="block min-h-[380px] w-full border-0 bg-white"
                />
              </div>

              <!-- Plain Text Preview -->
              <div
                v-else-if="emailPreviewTab === 'text' && previewText"
                class="bg-muted/15 p-4 font-mono text-[11px] text-muted flex-1 overflow-y-auto whitespace-pre-wrap"
              >
                {{ previewText }}
              </div>

              <!-- Fallback Preview -->
              <div
                v-else
                class="p-4 text-xs space-y-2 flex-1 flex flex-col justify-center"
              >
                <p class="text-muted leading-relaxed text-[11px]">
                  เรียน
                  {{
                    (sendEmailModalMode === 'bulk' && sendModalStudent
                      ? bulkStudentEvaluators[sendModalStudent.id]?.name
                      : sendEmailForm.evaluatorName) ||
                    '[ไม่ระบุชื่อผู้ประเมิน]'
                  }},<br />
                  มหาวิทยาลัยแม่ฟ้าหลวงขอความอนุเคราะห์ให้ท่านทำแบบประเมินผลการฝึกงานของ
                  <strong>{{ sendModalStudent?.name.th }}</strong> ({{
                    getProgramDisplay(sendModalStudent?.programId || '')
                  }})
                </p>
              </div>
            </div>
          </div>
        </div>

        <!-- Modal Bottom Actions (Unified Footer) -->
        <div
          v-if="
            !sendEmailSuccessData &&
            !bulkSendSuccessData &&
            !(isSendingEvaluationEmail && sendEmailModalMode === 'single')
          "
          class="flex flex-col sm:flex-row items-center justify-between gap-3 px-6 py-4 border-t border-default bg-muted/20 shrink-0"
        >
          <div class="text-xs text-muted flex items-center gap-2">
            <UIcon
              name="i-lucide-shield-check"
              class="size-4 text-emerald-600"
            />
            <span v-if="sendEmailModalMode === 'bulk'">
              ระบบจะส่งอีเมลแบบประเมินพร้อมรหัส PIN ให้ผู้รับของนักศึกษาทั้งหมด
              {{ bulkModalStudents.length }} คนแยกเป็นรายบุคคล
            </span>
            <span v-else>
              ระบบจะแนบลิงก์และรหัส PIN
              สำหรับเข้าทำแบบประเมินให้สถานประกอบการโดยอัตโนมัติ
            </span>
          </div>

          <div class="flex items-center gap-2.5 self-end sm:self-auto">
            <!-- Progress Indicator when bulk sending -->
            <div
              v-if="isSendingEvaluationEmail && sendEmailModalMode === 'bulk'"
              class="flex items-center gap-2 mr-2"
            >
              <UIcon
                name="i-lucide-loader-2"
                class="size-4 animate-spin text-primary"
              />
              <span class="text-xs font-medium text-highlighted">
                กำลังส่ง {{ bulkSendProgress.current }}/{{
                  bulkSendProgress.total
                }}:
                <span
                  class="text-primary truncate max-w-[140px] inline-block align-bottom"
                >
                  {{ bulkSendProgress.currentStudentName }}
                </span>
              </span>
            </div>

            <UButton
              color="neutral"
              label="ยกเลิก"
              variant="outline"
              size="md"
              :disabled="isSendingEvaluationEmail"
              @click="finishAndCloseSendModal"
            />

            <!-- Single Mode Submit Button -->
            <UButton
              v-if="sendEmailModalMode === 'single'"
              color="primary"
              icon="i-lucide-send"
              label="ยืนยันและส่งอีเมล (Confirm & Send)"
              size="md"
              :loading="isSendingEvaluationEmail"
              :disabled="
                !selectedCompetencySet ||
                !selectedCompetencyVersion ||
                !sendEmailForm.recipientEmail
              "
              @click="handleSendEvaluationEmailSubmit"
            />

            <!-- Bulk Mode Submit Button -->
            <UButton
              v-else
              color="primary"
              icon="i-lucide-send"
              :label="`ยืนยันและส่งทั้งหมด (${bulkModalStudents.length} คน)`"
              size="md"
              :loading="isSendingEvaluationEmail"
              :disabled="
                !selectedCompetencySet ||
                !selectedCompetencyVersion ||
                bulkModalStudents.length === 0
              "
              @click="handleBulkSendEvaluationEmailSubmit"
            />
          </div>
        </div>
      </div>
    </div>

    <!-- Datalist for Province Auto-complete -->
    <datalist id="province-suggestions">
      <option
        v-for="prov in provincesMasterData?.items"
        :key="prov.id"
        :value="prov.nameTh"
      >
        {{ prov.nameTh }} ({{ prov.nameEn }})
      </option>
    </datalist>
  </div>
</template>
