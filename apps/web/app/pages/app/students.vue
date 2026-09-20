<script setup lang="ts">
import * as XLSX from 'xlsx'

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
  readonly province?: string
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
  studentId: string
  nameTh: string
  nameEn: string
  email: string
  personalEmail?: string
  schoolCode: string
  programCode: string
  courseCode?: string
  semester?: string
  company?: string
  province?: string
  admissionYear?: number
  schoolId?: string
  programId?: string
  courseId?: string
  academicTermId?: string
  status: 'valid' | 'invalid'
  errorMessage?: string
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
  province: '',
  admissionYear: 2566,
  status: 'active' as 'active'
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
    semester:
      student.semester || (termsData.value?.items?.[0]?.code ?? '1/2566'),
    company: student.company || '',
    province: student.province || '',
    admissionYear: student.admissionYear || 2566,
    status: 'active'
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
        province: editForm.value.province.trim() || undefined,
        admissionYear: Number(editForm.value.admissionYear),
        status: editForm.value.status
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

const manualForm = ref({
  studentId: '',
  nameTh: '',
  nameEn: '',
  email: '',
  personalEmail: '',
  schoolId: '',
  programId: '',
  courseId: '',
  semester: '1/2566',
  company: '',
  province: '',
  admissionYear: 2566,
  status: 'active' as 'active'
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
  // Reset form
  const firstSchool = schoolsData.value?.items?.[0]
  const firstProgram = programsData.value?.items?.find(
    (p) => p.schoolId === firstSchool?.id
  )
  const firstCourse = coursesData.value?.items?.[0]
  const firstTerm = termsData.value?.items?.[0]

  manualForm.value = {
    studentId: '',
    nameTh: '',
    nameEn: '',
    email: '',
    personalEmail: '',
    schoolId: firstSchool?.id || '',
    programId: firstProgram?.id || '',
    courseId: firstCourse?.id || '',
    semester: firstTerm?.code || '1/2566',
    company: '',
    province: '',
    admissionYear: 2566,
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
        semester: manualForm.value.semester || undefined,
        company: manualForm.value.company.trim() || undefined,
        province: manualForm.value.province.trim() || undefined,
        admissionYear: Number(manualForm.value.admissionYear),
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
const defaultSchoolId = ref<string>('')
const defaultProgramId = ref<string>('')
const excelPreviewPage = ref(1)
const excelPreviewPageSize = 5
const paginatedParsedRows = computed(() => {
  const start = (excelPreviewPage.value - 1) * excelPreviewPageSize
  return parsedRows.value.slice(start, start + excelPreviewPageSize)
})

function openExcelImportModal() {
  parsedRows.value = []
  selectedFileName.value = ''
  excelPreviewPage.value = 1
  defaultSchoolId.value = schoolsData.value?.items?.[0]?.id || ''
  const matchedP = programsData.value?.items?.find(
    (p) => p.schoolId === defaultSchoolId.value
  )
  defaultProgramId.value = matchedP?.id || ''
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

// Parse Excel File on Selection
function handleExcelFileUpload(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  if (!file) return

  selectedFileName.value = file.name
  const reader = new FileReader()

  reader.onload = (e) => {
    try {
      const buffer = e.target?.result
      const wb = XLSX.read(buffer, { type: 'array' })
      const firstSheetName = wb.SheetNames[0]
      if (!firstSheetName) {
        throw new Error('ไม่พบข้อมูลชีทในไฟล์ Excel')
      }
      const sheet = wb.Sheets[firstSheetName]
      const rawData = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet!)

      if (rawData.length === 0) {
        toast.add({
          title: 'ไฟล์ว่างเปล่า',
          description: 'ไม่พบแถวข้อมูลนักศึกษาในไฟล์ Excel ที่อัปโหลด',
          color: 'warning'
        })
        parsedRows.value = []
        return
      }

      // Map raw data columns to ParsedStudentRow
      const rows: ParsedStudentRow[] = rawData.map((row, idx) => {
        // Extract fields using flexible Thai/English key lookup
        const sId = String(
          row['studentId'] ||
            row['รหัสนักศึกษา'] ||
            row['รหัสนักศึกษา (studentId)'] ||
            row['Student ID'] ||
            row['ID'] ||
            ''
        ).trim()

        const nTh = String(
          row['nameTh'] ||
            row['ชื่อ-นามสกุลไทย'] ||
            row['ชื่อ-นามสกุลไทย (nameTh)'] ||
            row['ชื่อไทย'] ||
            row['ชื่อ'] ||
            ''
        ).trim()

        const nEn = String(
          row['nameEn'] ||
            row['ชื่อ-นามสกุลอังกฤษ'] ||
            row['ชื่อ-นามสกุลอังกฤษ (nameEn)'] ||
            row['ชื่ออังกฤษ'] ||
            row['Name EN'] ||
            ''
        ).trim()

        const mail = String(
          row['email'] ||
            row['อีเมล'] ||
            row['อีเมล (email)'] ||
            row['อีเมลนักศึกษา'] ||
            row['อีเมลนักศึกษา (email)'] ||
            row['Email'] ||
            ''
        ).trim()

        const persMail = String(
          row['personalEmail'] ||
            row['อีเมลส่วนตัว'] ||
            row['อีเมลส่วนตัว (personalEmail)'] ||
            row['Personal Email'] ||
            ''
        ).trim()

        const scCode = String(
          row['schoolCode'] ||
            row['รหัสสำนักวิชา'] ||
            row['รหัสสำนักวิชา (schoolCode)'] ||
            row['สำนักวิชา'] ||
            row['School'] ||
            ''
        ).trim()

        const prCode = String(
          row['programCode'] ||
            row['รหัสหลักสูตร'] ||
            row['รหัสหลักสูตร (programCode)'] ||
            row['หลักสูตร'] ||
            row['Program'] ||
            ''
        ).trim()

        const crCode = String(
          row['courseCode'] ||
            row['รหัสวิชา'] ||
            row['รหัสวิชา (courseCode)'] ||
            row['วิชา'] ||
            row['Course'] ||
            ''
        ).trim()

        const sem = String(
          row['semester'] ||
            row['ภาคการศึกษา'] ||
            row['ภาคการศึกษา (semester)'] ||
            row['เทอม'] ||
            row['Semester'] ||
            ''
        ).trim()

        const comp = String(
          row['company'] ||
            row['สถานประกอบการ'] ||
            row['สถานประกอบการ (company)'] ||
            row['บริษัท'] ||
            row['Company'] ||
            ''
        ).trim()

        const prov = String(
          row['province'] ||
            row['จังหวัด'] ||
            row['จังหวัด (province)'] ||
            row['Province'] ||
            ''
        ).trim()

        const admYear = Number(
          row['admissionYear'] ||
            row['ปีการศึกษา'] ||
            row['ปีการศึกษา (admissionYear)'] ||
            row['ปี'] ||
            2566
        )

        // Find matching schoolId & programId
        const matchedSchool = schoolsData.value?.items?.find(
          (s) =>
            s.schoolCode.toLowerCase() === scCode.toLowerCase() ||
            s.name.th.includes(scCode) ||
            s.name.en.toLowerCase().includes(scCode.toLowerCase())
        )
        const finalSchoolId = matchedSchool?.id || defaultSchoolId.value

        const matchedProgram = programsData.value?.items?.find(
          (p) =>
            p.programCode.toLowerCase() === prCode.toLowerCase() ||
            p.name.th.includes(prCode) ||
            p.name.en.toLowerCase().includes(prCode.toLowerCase())
        )
        const finalProgramId = matchedProgram?.id || defaultProgramId.value

        const matchedCourse = coursesData.value?.items?.find(
          (c) =>
            c.courseCode.toLowerCase() === crCode.toLowerCase() ||
            c.name.th.includes(crCode) ||
            c.name.en.toLowerCase().includes(crCode.toLowerCase())
        )
        const finalCourseId =
          matchedCourse?.id || coursesData.value?.items?.[0]?.id
        let finalSemester = sem || termsData.value?.items?.[0]?.code || '1/2566'
        const semLower = finalSemester.toLowerCase().trim()
        if (
          semLower === 'first' ||
          semLower === '1' ||
          semLower === 'ต้น' ||
          semLower === 'ภาคการศึกษาต้น'
        ) {
          finalSemester = 'ภาคการศึกษาต้น'
        } else if (
          semLower === 'second' ||
          semLower === '2' ||
          semLower === 'ปลาย' ||
          semLower === 'ภาคการศึกษาปลาย'
        ) {
          finalSemester = 'ภาคการศึกษาปลาย'
        } else if (
          semLower === 'third' ||
          semLower === '3' ||
          semLower === 'summer' ||
          semLower.includes('ฤดูร้อน')
        ) {
          finalSemester = 'ภาคการศึกษาฤดูร้อน'
        }

        let status: 'valid' | 'invalid' = 'valid'
        let errorMessage = ''

        if (!sId) {
          status = 'invalid'
          errorMessage = `แถวที่ ${idx + 1}: ไม่ระบุรหัสนักศึกษา`
        } else if (!nTh && !nEn) {
          status = 'invalid'
          errorMessage = `แถวที่ ${idx + 1}: ไม่ระบุชื่อ-นามสกุล`
        } else if (!mail || !mail.includes('@')) {
          status = 'invalid'
          errorMessage = `แถวที่ ${idx + 1}: รูปแบบอีเมลไม่ถูกต้อง`
        } else if (!finalSchoolId || !finalProgramId) {
          status = 'invalid'
          errorMessage = `แถวที่ ${idx + 1}: ไม่สามารถระบุสำนักวิชาหรือหลักสูตรได้`
        }

        return {
          studentId: sId,
          nameTh: nTh || nEn,
          nameEn: nEn || nTh,
          email: mail.toLowerCase(),
          personalEmail: persMail ? persMail.toLowerCase() : undefined,
          schoolCode: scCode || (matchedSchool?.schoolCode ?? ''),
          programCode: prCode || (matchedProgram?.programCode ?? ''),
          courseCode: crCode || (matchedCourse?.courseCode ?? 'SWE491'),
          semester: finalSemester,
          company: comp || undefined,
          province: prov || undefined,
          admissionYear: admYear || 2566,
          schoolId: finalSchoolId,
          programId: finalProgramId,
          courseId: finalCourseId,
          status,
          errorMessage
        }
      })

      parsedRows.value = rows
      toast.add({
        title: 'อ่านไฟล์ Excel สำเร็จ',
        description: `พบข้อมูลนักศึกษาทั้งหมด ${rows.length} รายการ (พร้อมนำเข้า ${rows.filter((r) => r.status === 'valid').length} รายการ)`,
        color: 'success'
      })
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'อ่านไฟล์ Excel ล้มเหลว'
      toast.add({
        title: 'ไม่สามารถอ่านไฟล์ได้',
        description: msg,
        color: 'error'
      })
    }
  }

  reader.readAsArrayBuffer(file)
}

// Execute Import of Valid Rows
async function handleExecuteExcelImport() {
  const validRows = parsedRows.value.filter((r) => r.status === 'valid')
  if (validRows.length === 0) {
    toast.add({
      title: 'ไม่มีข้อมูลที่พร้อมนำเข้า',
      description: 'กรุณาตรวจสอบข้อผิดพลาดในตาราง หรืออัปโหลดไฟล์ใหม่',
      color: 'warning'
    })
    return
  }

  isExcelImporting.value = true
  let successCount = 0
  let failCount = 0

  for (const row of validRows) {
    try {
      await api('/students', {
        method: 'POST',
        body: {
          studentId: row.studentId,
          name: { th: row.nameTh, en: row.nameEn },
          email: row.email,
          personalEmail: row.personalEmail,
          schoolId: row.schoolId || defaultSchoolId.value,
          programId: row.programId || defaultProgramId.value,
          courseId: row.courseId,
          semester: row.semester,
          company: row.company,
          province: row.province,
          admissionYear: row.admissionYear || 2566,
          status: 'active'
        }
      })
      successCount++
    } catch {
      failCount++
    }
  }

  isExcelImporting.value = false
  isExcelModalOpen.value = false

  if (successCount > 0) {
    toast.add({
      title: 'นำเข้าข้อมูลนักศึกษาสำเร็จ',
      description: `นำเข้าข้อมูลเรียบร้อยแล้ว ${successCount} รายการ${failCount > 0 ? ` (ล้มเหลว/ซ้ำ ${failCount} รายการ)` : ''}`,
      color: 'success'
    })
    await refresh()
  } else {
    toast.add({
      title: 'นำเข้าข้อมูลไม่สำเร็จ',
      description: 'อาจมีรหัสนักศึกษาหรืออีเมลซ้ำกับที่มีอยู่ในระบบแล้ว',
      color: 'error'
    })
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

async function handleBulkSetStatus(newStatus: 'active') {
  if (selectedStudentIds.value.length === 0) return
  isBulkUpdating.value = true
  try {
    await Promise.all(
      selectedStudentIds.value.map((id) =>
        api(`/students/${id}`, {
          method: 'PATCH',
          body: { status: newStatus }
        })
      )
    )
    toast.add({
      title: 'เปลี่ยนสถานะสำเร็จ',
      description: `อัปเดตสถานะเป็น ACTIVE แล้ว ${selectedStudentIds.value.length} รายการ`,
      color: 'success'
    })
    clearSelection()
    await refresh()
  } catch {
    toast.add({
      title: 'เกิดข้อผิดพลาด',
      description: 'ไม่สามารถอัปเดตสถานะนักศึกษาบางรายการได้',
      color: 'error'
    })
  } finally {
    isBulkUpdating.value = false
  }
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
        label: 'แก้ไขข้อมูลนักศึกษา',
        icon: 'i-lucide-pencil',
        onSelect: () => openEditStudentModal(student)
      }
    ],
    [
      {
        label: 'ลบข้อมูลนักศึกษา',
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
  assignmentId: string
  invitationId: string
  invitationUrl: string
  recipientEmail: string
  studentName: string
  deadlineAt: string
} | null>(null)

async function openSendEmailModal(student: Student) {
  sendModalStudent.value = student
  sendEmailSuccessData.value = null
  isSendingEvaluationEmail.value = false
  sendInvitationIdempotencyKey.value = crypto.randomUUID()

  sendEmailForm.value = {
    recipientEmail: 'evaluator@localhost',
    evaluatorName: student.company
      ? `ผู้ดูแล (${student.company})`
      : 'ผู้ดูแลการฝึกงาน',
    deadlineDays: 30,
    notes: ''
  }

  const firstForm = evaluationFormsData.value?.items?.[0]
  if (firstForm) {
    await selectCompetencyForm(firstForm)
  } else {
    selectedCompetencySet.value = null
    selectedCompetencyVersion.value = null
  }

  isSendEmailModalOpen.value = true
}

function openBulkSendEmailModal() {
  const firstSelected = data.value?.items?.find((s) =>
    selectedStudentIds.value.includes(s.id)
  )
  if (firstSelected) {
    openSendEmailModal(firstSelected)
  }
}

async function selectCompetencyForm(form: CompetencySetItem) {
  selectedCompetencySet.value = form
  isLoadingFormVersion.value = true
  try {
    const res = await api<{ items: CompetencyVersionItem[] }>(
      `/competency-sets/${form.id}/versions`
    )
    const published =
      res.items.find((v) => v.status === 'published') || res.items[0]
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
      title: 'กรุณาระบุอีเมลผู้รับ',
      description: 'โปรดกรอกอีเมลผู้ประเมินหรือสถานประกอบการ',
      color: 'warning'
    })
    return
  }

  isSendingEvaluationEmail.value = true
  try {
    const result = await api<{
      success: boolean
      assignmentId: string
      invitationId: string
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

    sendEmailSuccessData.value = result
    toast.add({
      title: 'ส่งอีเมลแบบประเมินสำเร็จ!',
      description: `ระบบได้ส่งลิงก์แบบประเมินไปยัง ${result.recipientEmail} เรียบร้อยแล้ว`,
      color: 'success'
    })
  } catch (err: unknown) {
    const msg =
      err instanceof Error ? err.message : 'ไม่สามารถส่งอีเมลแบบประเมินได้'
    toast.add({
      title: 'ส่งอีเมลไม่สำเร็จ',
      description: msg,
      color: 'error'
    })
  } finally {
    isSendingEvaluationEmail.value = false
  }
}

function copyInvitationLink() {
  if (!sendEmailSuccessData.value?.invitationUrl) return
  navigator.clipboard.writeText(sendEmailSuccessData.value.invitationUrl)
  toast.add({
    title: 'คัดลอกลิงก์สำเร็จ',
    description: 'คัดลอกลิงก์แบบประเมินไปยังคลิปบอร์ดแล้ว',
    color: 'success'
  })
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
            color="success"
            icon="i-lucide-check-circle"
            label="ตั้งเป็น ACTIVE"
            size="xs"
            variant="subtle"
            :loading="isBulkUpdating"
            @click="handleBulkSetStatus('active')"
          />
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
    <UCard :ui="{ body: 'p-0 sm:p-0' }">
      <div class="overflow-x-auto">
        <table class="data-table">
          <thead>
            <tr>
              <th class="w-10 text-center">
                <input
                  type="checkbox"
                  :checked="isAllSelected"
                  :indeterminate="isSomeSelected && !isAllSelected"
                  class="size-4 rounded border-default text-primary focus:ring-primary/20 cursor-pointer"
                  @change="toggleSelectAll"
                />
              </th>
              <th class="min-w-[200px] whitespace-nowrap">ข้อมูลนักศึกษา</th>
              <th class="whitespace-nowrap">สำนักวิชา / หลักสูตร</th>
              <th class="w-48 whitespace-nowrap">
                ปีการศึกษา / ภาคการศึกษา / รายวิชา
              </th>
              <th class="w-60 whitespace-nowrap">สถานประกอบการ / จังหวัด</th>
              <th class="w-24 text-center whitespace-nowrap">สถานะ</th>
              <th class="w-44 whitespace-nowrap">อัปเดตล่าสุด / วันที่สร้าง</th>
              <th class="w-16 text-right whitespace-nowrap">การจัดการ</th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="student in data?.items"
              :key="student.id"
              class="group hover:bg-muted/30 transition-colors"
              :class="{
                'bg-primary/[0.04] dark:bg-primary/[0.08]':
                  selectedStudentIds.includes(student.id)
              }"
            >
              <!-- Multi-select checkbox -->
              <td class="text-center" @click.stop>
                <input
                  type="checkbox"
                  :checked="selectedStudentIds.includes(student.id)"
                  class="size-4 rounded border-default text-primary focus:ring-primary/20 cursor-pointer"
                  @change="toggleSelectStudent(student.id)"
                />
              </td>

              <!-- ข้อมูลนักศึกษา (รวบ รหัส, ชื่อ-นามสกุล, อีเมล เหมือน Dashboard) -->
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

              <!-- Column 4: สำนักวิชา & หลักสูตร -->
              <td class="whitespace-nowrap">
                <span class="block text-xs font-semibold text-highlighted">
                  {{ getProgramDisplay(student.programId) }}
                </span>
                <span class="block text-[11px] text-muted">
                  {{ getSchoolDisplay(student.schoolId) }}
                </span>
              </td>

              <!-- Column 5: ปีการศึกษา / ภาคการศึกษา & รายวิชา (ปีการศึกษาอยู่บนสุด ถัดมาเป็นภาคการศึกษา และรายวิชา) -->
              <td class="whitespace-nowrap">
                <span class="block text-xs font-semibold text-highlighted">
                  ปีการศึกษา {{ getAcademicYearDisplay(student) }}
                </span>
                <div class="mt-1">
                  <UBadge
                    v-if="getSemesterDisplay(student) !== '-'"
                    color="info"
                    :label="formatSemesterText(getSemesterDisplay(student))"
                    size="sm"
                    variant="subtle"
                    class="font-mono font-medium"
                  />
                  <span v-else class="text-xs text-muted"> - </span>
                </div>
                <span
                  v-if="getCourseDisplay(student) !== '-'"
                  class="block text-xs text-muted truncate max-w-[220px] mt-1"
                  :title="getCourseDisplay(student)"
                >
                  {{ getCourseDisplay(student) }}
                </span>
                <span v-else class="block text-xs text-muted mt-1"> - </span>
              </td>

              <!-- Column 6: สถานประกอบการ & จังหวัด (สถานประกอบการอยู่บน จังหวัดอยู่ล่าง) -->
              <td class="whitespace-nowrap">
                <span
                  class="block text-xs font-medium text-highlighted truncate max-w-[220px]"
                  :title="getCompanyDisplay(student)"
                >
                  {{ getCompanyDisplay(student) }}
                </span>
                <span
                  v-if="getProvinceDisplay(student) !== '-'"
                  class="inline-flex items-center gap-1 text-[11px] text-muted mt-1"
                >
                  <UIcon
                    name="i-lucide-map-pin"
                    class="size-3 text-primary shrink-0"
                  />
                  <span>{{ getProvinceDisplay(student) }}</span>
                </span>
                <span v-else class="block text-[11px] text-muted mt-1">
                  -
                </span>
              </td>

              <!-- Column 7: สถานะการประเมิน (แบบ 3) -->
              <td class="text-center whitespace-nowrap">
                <UBadge
                  :color="getStudentEvaluationStatus(student).color"
                  size="sm"
                  variant="subtle"
                  class="font-medium inline-flex items-center gap-1.5 px-2.5 py-1"
                  :title="getStudentEvaluationStatus(student).description"
                >
                  <UIcon
                    :name="getStudentEvaluationStatus(student).icon"
                    class="size-3.5 shrink-0"
                  />
                  <span>{{ getStudentEvaluationStatus(student).label }}</span>
                </UBadge>
              </td>

              <!-- Column 8: อัปเดตล่าสุด & วันเวลาที่สร้าง -->
              <td class="text-xs whitespace-nowrap">
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

              <!-- Column 9: การจัดการ (3 dots dropdown menu ตามภาพที่ 1) -->
              <td class="text-right" @click.stop>
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
                    />
                  </UDropdownMenu>
                </div>
              </td>
            </tr>

            <tr v-if="!pending && !data?.items.length">
              <td class="py-12 text-center text-muted" colspan="8">
                <UIcon
                  name="i-lucide-users"
                  class="mx-auto mb-2 size-8 text-muted"
                />
                <p class="font-medium">ไม่พบข้อมูลนักศึกษาตามเงื่อนไข</p>
                <p class="text-xs text-muted">
                  คลิกปุ่ม &quot;นำเข้าจาก Excel&quot; หรือ
                  &quot;เพิ่มข้อมูลด้วยตัวเอง&quot; เพื่อเพิ่มนักศึกษา
                </p>
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
    </UCard>

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

              <!-- Semester & Province Selection (2-Column Subgrid) -->
              <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label
                    class="block text-xs font-semibold text-highlighted mb-1.5"
                  >
                    ภาคการศึกษา (Semester)
                  </label>
                  <select
                    v-model="manualForm.semester"
                    class="w-full h-11 rounded-xl border border-default bg-default px-3 text-sm text-highlighted focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20 transition-colors"
                  >
                    <option
                      v-for="t in termsData?.items"
                      :key="t.id"
                      :value="t.code"
                    >
                      {{ formatSemesterText(t.code) }}
                    </option>
                    <option value="1/2566">ภาคการศึกษาที่ 1/2566</option>
                    <option value="2/2566">ภาคการศึกษาที่ 2/2566</option>
                    <option value="3/2566">
                      ภาคการศึกษาที่ 3/2566 (ภาคฤดูร้อน)
                    </option>
                    <option value="1/2567">ภาคการศึกษาที่ 1/2567</option>
                    <option value="2/2567">ภาคการศึกษาที่ 2/2567</option>
                    <option value="3/2567">
                      ภาคการศึกษาที่ 3/2567 (ภาคฤดูร้อน)
                    </option>
                    <option value="1/2568">ภาคการศึกษาที่ 1/2568</option>
                    <option value="2/2568">ภาคการศึกษาที่ 2/2568</option>
                    <option value="3/2568">
                      ภาคการศึกษาที่ 3/2568 (ภาคฤดูร้อน)
                    </option>
                    <option value="1/2569">ภาคการศึกษาที่ 1/2569</option>
                    <option value="2/2569">ภาคการศึกษาที่ 2/2569</option>
                    <option value="3/2569">
                      ภาคการศึกษาที่ 3/2569 (ภาคฤดูร้อน)
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
              accept=".xlsx, .xls, .csv"
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
              รองรับไฟล์ .xlsx, .xls และ .csv
            </p>
          </div>
        </div>

        <!-- Fallback Defaults if Excel missing school/program -->
        <div
          v-if="parsedRows.length > 0"
          class="rounded-xl border border-default bg-muted/10 p-3 text-xs flex flex-wrap items-center gap-3"
        >
          <span class="font-semibold text-highlighted"
            >สำนักวิชาและหลักสูตรเริ่มต้น (กรณีแถวใดไม่ระบุ):</span
          >
          <div class="flex items-center gap-2">
            <select
              v-model="defaultSchoolId"
              class="h-8 rounded border border-default bg-default px-2 text-xs text-highlighted focus:outline-none"
            >
              <option v-for="s in schoolsData?.items" :key="s.id" :value="s.id">
                {{ s.name.th }}
              </option>
            </select>
            <select
              v-model="defaultProgramId"
              class="h-8 rounded border border-default bg-default px-2 text-xs text-highlighted focus:outline-none"
            >
              <option
                v-for="p in programsData?.items"
                :key="p.id"
                :value="p.id"
              >
                {{ p.name.th }}
              </option>
            </select>
          </div>
        </div>

        <!-- Preview Table -->
        <div v-if="parsedRows.length > 0" class="space-y-2">
          <div class="flex items-center justify-between">
            <span class="text-xs font-bold text-highlighted">
              รายการที่อ่านได้จากไฟล์ ({{ parsedRows.length }} รายการ):
            </span>
            <span
              class="text-xs font-semibold text-emerald-600 dark:text-emerald-400"
            >
              พร้อมนำเข้า:
              {{ parsedRows.filter((r) => r.status === 'valid').length }} /
              {{ parsedRows.length }} รายการ
            </span>
          </div>

          <div
            class="overflow-x-auto max-h-64 border border-default rounded-xl"
          >
            <table class="w-full text-left text-xs border-collapse">
              <thead class="bg-muted/40 sticky top-0 border-b border-default">
                <tr>
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
                  :key="idx"
                  class="hover:bg-muted/10"
                  :class="
                    row.status === 'invalid'
                      ? 'bg-rose-50/40 dark:bg-rose-950/20'
                      : ''
                  "
                >
                  <td class="p-2 text-center font-mono text-muted">
                    {{
                      (excelPreviewPage - 1) * excelPreviewPageSize + idx + 1
                    }}
                  </td>
                  <td class="p-2 font-mono font-bold text-highlighted">
                    {{ row.studentId }}
                  </td>
                  <td class="p-2">
                    <span class="block text-highlighted">{{ row.nameTh }}</span>
                    <span class="text-[10px] text-muted">{{ row.nameEn }}</span>
                  </td>
                  <td class="p-2 font-mono text-muted">{{ row.email }}</td>
                  <td class="p-2">
                    <span class="font-semibold text-highlighted">{{
                      row.programCode || 'Default'
                    }}</span>
                    <span class="text-muted text-[10px] ml-1"
                      >({{ row.schoolCode || 'Default' }})</span
                    >
                  </td>
                  <td class="p-2">
                    <span
                      class="font-mono text-xs font-semibold text-highlighted block"
                    >
                      {{ row.semester || '-' }}
                    </span>
                    <span
                      v-if="row.courseCode"
                      class="text-[10px] text-muted block"
                    >
                      {{ row.courseCode }}
                    </span>
                  </td>
                  <td class="p-2 text-xs truncate max-w-[160px]">
                    <span class="block text-highlighted font-medium truncate">
                      {{ row.company || '-' }}
                    </span>
                    <span
                      v-if="row.province"
                      class="text-[10px] text-muted block"
                    >
                      📍 {{ row.province }}
                    </span>
                  </td>
                  <td class="p-2 text-center">
                    <UBadge
                      v-if="row.status === 'valid'"
                      color="success"
                      label="พร้อมนำเข้า"
                      size="xs"
                      variant="subtle"
                    />
                    <UBadge
                      v-else
                      color="error"
                      :label="row.errorMessage || 'ข้อผิดพลาด'"
                      size="xs"
                      variant="subtle"
                      :title="row.errorMessage"
                    />
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
            :label="`ยืนยันนำเข้าข้อมูล (${parsedRows.filter((r) => r.status === 'valid').length} รายการ)`"
            :loading="isExcelImporting"
            :disabled="
              parsedRows.filter((r) => r.status === 'valid').length === 0
            "
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

              <!-- Program Selection -->
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

              <!-- Course Selection (Full Width) -->
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

              <!-- Semester & Province Selection (2-Column Subgrid) -->
              <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label
                    class="block text-xs font-semibold text-highlighted mb-1.5"
                  >
                    ภาคการศึกษา (Semester)
                  </label>
                  <select
                    v-model="editForm.semester"
                    class="w-full h-11 rounded-xl border border-default bg-default px-3 text-sm text-highlighted focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20 transition-colors"
                  >
                    <option
                      v-for="t in termsData?.items"
                      :key="t.id"
                      :value="t.code"
                    >
                      {{ formatSemesterText(t.code) }}
                    </option>
                    <option value="1/2566">ภาคการศึกษาที่ 1/2566</option>
                    <option value="2/2566">ภาคการศึกษาที่ 2/2566</option>
                    <option value="3/2566">
                      ภาคการศึกษาที่ 3/2566 (ภาคฤดูร้อน)
                    </option>
                    <option value="1/2567">ภาคการศึกษาที่ 1/2567</option>
                    <option value="2/2567">ภาคการศึกษาที่ 2/2567</option>
                    <option value="3/2567">
                      ภาคการศึกษาที่ 3/2567 (ภาคฤดูร้อน)
                    </option>
                    <option value="1/2568">ภาคการศึกษาที่ 1/2568</option>
                    <option value="2/2568">ภาคการศึกษาที่ 2/2568</option>
                    <option value="3/2568">
                      ภาคการศึกษาที่ 3/2568 (ภาคฤดูร้อน)
                    </option>
                    <option value="1/2569">ภาคการศึกษาที่ 1/2569</option>
                    <option value="2/2569">ภาคการศึกษาที่ 2/2569</option>
                    <option value="3/2569">
                      ภาคการศึกษาที่ 3/2569 (ภาคฤดูร้อน)
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
              </div>

              <!-- Company Selection (Full Width) -->
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

              <!-- Student ID (Readonly) -->
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

              <!-- Thai Name -->
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

              <!-- English Name -->
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

              <!-- Email: เมลนักศึกษาอยู่ข้างบน -->
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

              <!-- Email: เมลส่วนตัวอยู่ข้างล่าง -->
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

              <!-- Admission Year & Status -->
              <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label
                    class="block text-xs font-semibold text-highlighted mb-1.5"
                  >
                    ปีที่เข้าศึกษา (Year)
                  </label>
                  <UInput
                    v-model.number="editForm.admissionYear"
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
                    v-model="editForm.status"
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
      @click="isSendEmailModalOpen = false"
    >
      <div
        class="w-full max-w-5xl rounded-2xl border border-default bg-default p-6 shadow-2xl space-y-5 max-h-[92vh] overflow-y-auto"
        @click.stop
      >
        <!-- Modal Header -->
        <div
          class="flex items-center justify-between border-b border-default pb-4"
        >
          <div class="flex items-center gap-3">
            <span
              class="grid size-10 place-items-center rounded-xl bg-primary/10 text-primary"
            >
              <UIcon name="i-lucide-mail" class="size-5" />
            </span>
            <div>
              <h2 class="text-lg font-bold text-highlighted">
                ส่งแบบประเมินผลการฝึกงานทางอีเมล
              </h2>
              <p class="text-xs text-muted">
                ส่งลิงก์แบบประเมินให้แก่ผู้ดูแล / สถานประกอบการสำหรับนักศึกษา
                <strong class="text-highlighted">
                  {{ sendModalStudent?.name.th }} ({{
                    sendModalStudent?.studentId
                  }})
                </strong>
              </p>
            </div>
          </div>
          <UButton
            color="neutral"
            icon="i-lucide-x"
            size="sm"
            variant="ghost"
            @click="isSendEmailModalOpen = false"
          />
        </div>

        <!-- If Success State: Show Sent Success Screen -->
        <div
          v-if="sendEmailSuccessData"
          class="rounded-xl border border-emerald-500/20 bg-emerald-500/[0.04] p-6 space-y-5 text-center"
        >
          <div
            class="grid size-14 place-items-center rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 mx-auto"
          >
            <UIcon name="i-lucide-check-circle-2" class="size-8" />
          </div>
          <div class="space-y-1">
            <h3 class="text-xl font-bold text-highlighted">
              ส่งอีเมลแบบประเมินสำเร็จ!
            </h3>
            <p class="text-sm text-muted">
              ระบบได้ส่งลิงก์แบบประเมินสำหรับนักศึกษา
              <strong class="text-highlighted">{{
                sendEmailSuccessData.studentName
              }}</strong>
              ไปยังอีเมล
              <strong class="text-highlighted">{{
                sendEmailSuccessData.recipientEmail
              }}</strong>
              เรียบร้อยแล้ว
            </p>
          </div>

          <!-- Direct Link Box -->
          <div
            class="rounded-xl border border-default bg-default p-4 text-left space-y-2 max-w-2xl mx-auto shadow-sm"
          >
            <div class="flex items-center justify-between">
              <span class="text-xs font-semibold text-highlighted"
                >ลิงก์สำหรับทำแบบประเมิน (Secure Evaluation URL):</span
              >
              <span class="text-[11px] text-muted"
                >ใช้เปิดทำแบบประเมินได้ทันที</span
              >
            </div>
            <div class="flex items-center gap-2">
              <input
                readonly
                :value="sendEmailSuccessData.invitationUrl"
                class="flex-1 h-9 rounded-lg border border-default bg-muted/20 px-3 text-xs font-mono text-highlighted focus:outline-none"
              />
              <UButton
                color="primary"
                icon="i-lucide-copy"
                label="คัดลอกลิงก์"
                size="sm"
                @click="copyInvitationLink"
              />
            </div>
          </div>

          <div class="flex flex-wrap items-center justify-center gap-3 pt-2">
            <UButton
              color="primary"
              icon="i-lucide-external-link"
              label="ทดลองเปิดทำแบบประเมิน"
              size="md"
              target="_blank"
              :to="sendEmailSuccessData.invitationUrl"
            />
            <UButton
              color="neutral"
              icon="i-lucide-inbox"
              label="ดูประวัติในหน้าการสื่อสาร"
              size="md"
              variant="outline"
              to="/app/correspondence"
              @click="isSendEmailModalOpen = false"
            />
            <UButton
              color="neutral"
              label="ปิดหน้าต่าง"
              size="md"
              variant="ghost"
              @click="isSendEmailModalOpen = false"
            />
          </div>
        </div>

        <!-- Normal State: 2 Panels Form & Live Preview -->
        <div v-else class="grid grid-cols-1 lg:grid-cols-12 gap-5">
          <!-- ฝั่งซ้าย (5 คอลัมน์): 1. ตารางเลือกแบบทดสอบ (Select Evaluation Form) -->
          <div class="lg:col-span-5 space-y-3.5">
            <div
              class="flex items-center justify-between border-b border-default pb-2"
            >
              <div
                class="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-primary"
              >
                <UIcon name="i-lucide-clipboard-list" class="size-4" />
                <span>1. เลือกแบบประเมิน (Form)</span>
              </div>
              <span class="text-xs text-muted"
                >{{ evaluationFormsData?.items?.length || 0 }} แบบ</span
              >
            </div>

            <!-- List of Forms -->
            <div class="space-y-2.5 max-h-[500px] overflow-y-auto pr-1">
              <div
                v-for="form in evaluationFormsData?.items"
                :key="form.id"
                class="rounded-xl border p-3.5 cursor-pointer transition-all hover:border-primary/50"
                :class="
                  selectedCompetencySet?.id === form.id
                    ? 'border-primary bg-primary/[0.05] ring-2 ring-primary/20'
                    : 'border-default bg-default hover:bg-muted/10'
                "
                @click="selectCompetencyForm(form)"
              >
                <div class="flex items-start justify-between gap-2">
                  <div class="space-y-1">
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
                      class="text-sm font-semibold text-highlighted leading-snug"
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
                    class="mt-1 size-4 text-primary focus:ring-primary/20 cursor-pointer"
                  />
                </div>
              </div>

              <div
                v-if="!evaluationFormsData?.items?.length"
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

          <!-- ฝั่งขวา (7 คอลัมน์): 2. ตัวอย่างข้อมูลและข้อสอบ (Preview & Confirm) -->
          <div class="lg:col-span-7 space-y-4">
            <div
              class="flex items-center justify-between border-b border-default pb-2"
            >
              <div
                class="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-primary"
              >
                <UIcon name="i-lucide-eye" class="size-4" />
                <span>2. ตัวอย่างข้อมูลและข้อสอบ (Preview)</span>
              </div>
              <span v-if="selectedCompetencyVersion" class="text-xs text-muted">
                {{ selectedCompetencyVersion.sections?.length || 0 }} หมวด
              </span>
            </div>

            <!-- Recipient Form Inputs -->
            <div
              class="rounded-xl border border-default bg-muted/10 p-4 space-y-3"
            >
              <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label
                    class="block text-xs font-semibold text-highlighted mb-1"
                  >
                    อีเมลผู้รับ (ผู้ประเมิน / HR)
                    <span class="text-rose-500">*</span>
                  </label>
                  <UInput
                    v-model="sendEmailForm.recipientEmail"
                    placeholder="เช่น hr@company.com"
                    icon="i-lucide-mail"
                    size="sm"
                    required
                  />
                </div>
                <div>
                  <label
                    class="block text-xs font-semibold text-highlighted mb-1"
                  >
                    ชื่อผู้ประเมิน / พี่เลี้ยง
                  </label>
                  <UInput
                    v-model="sendEmailForm.evaluatorName"
                    placeholder="เช่น นายสมบูรณ์ หัวหน้างาน"
                    icon="i-lucide-user"
                    size="sm"
                  />
                </div>
              </div>

              <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label
                    class="block text-xs font-semibold text-highlighted mb-1"
                  >
                    กำหนดส่งภายใน
                  </label>
                  <select
                    v-model="sendEmailForm.deadlineDays"
                    class="w-full h-9 rounded-lg border border-default bg-default px-3 text-xs text-highlighted focus:border-primary focus:outline-none"
                  >
                    <option :value="7">7 วัน (เร่งด่วน)</option>
                    <option :value="14">14 วัน (2 สัปดาห์)</option>
                    <option :value="30">30 วัน (1 เดือน)</option>
                    <option :value="60">60 วัน (2 เดือน)</option>
                  </select>
                </div>
                <div>
                  <label
                    class="block text-xs font-semibold text-highlighted mb-1"
                  >
                    นักศึกษาที่จะประเมิน
                  </label>
                  <div
                    class="h-9 rounded-lg border border-default bg-default/60 px-3 flex items-center text-xs text-highlighted font-medium truncate"
                  >
                    {{ sendModalStudent?.studentId }} -
                    {{ sendModalStudent?.name.th }}
                  </div>
                </div>
              </div>
            </div>

            <!-- Live Form Questions Preview -->
            <div
              class="rounded-xl border border-default bg-default p-4 space-y-3"
            >
              <div class="flex items-center justify-between">
                <span class="text-xs font-bold text-highlighted">
                  ตัวอย่างเกณฑ์การประเมินในแบบฟอร์มนี้:
                </span>
                <span
                  v-if="isLoadingFormVersion"
                  class="text-xs text-primary animate-pulse"
                >
                  กำลังโหลดข้อมูลข้อสอบ...
                </span>
              </div>

              <!-- Sections list in preview -->
              <div
                v-if="selectedCompetencyVersion?.sections?.length"
                class="space-y-2 max-h-[160px] overflow-y-auto pr-1"
              >
                <div
                  v-for="(sec, sIdx) in selectedCompetencyVersion.sections"
                  :key="sec.id || sIdx"
                  class="rounded-lg border border-default/70 bg-muted/20 p-2.5 space-y-1.5 text-xs"
                >
                  <div class="flex items-center justify-between">
                    <div class="flex items-center gap-1.5">
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
                      />
                      <strong class="text-highlighted">{{
                        sec.title.th
                      }}</strong>
                    </div>
                    <span class="text-[11px] text-muted"
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
                      และคำถามอื่นๆ อีก
                      {{ (sec.questions?.length || 0) - 2 }} ข้อ...
                    </li>
                  </ul>
                </div>
              </div>
              <div v-else class="text-xs text-muted text-center py-3">
                {{
                  isLoadingFormVersion
                    ? 'กำลังโหลดข้อสอบ...'
                    : 'ไม่พบรายการคำถามในแบบฟอร์มนี้'
                }}
              </div>
            </div>

            <!-- Email Invitation Card Preview -->
            <div
              class="rounded-xl border border-primary/20 bg-primary/[0.02] p-3.5 space-y-2"
            >
              <div
                class="flex items-center gap-2 text-xs font-semibold text-primary"
              >
                <UIcon name="i-lucide-mail-check" class="size-4" />
                <span>ตัวอย่างอีเมลที่จะส่งไปยังผู้ประเมิน:</span>
              </div>
              <div
                class="rounded-lg border border-default bg-default p-3 text-xs space-y-2 shadow-xs"
              >
                <div class="border-b border-default pb-1.5">
                  <span class="text-muted">หัวข้อ: </span>
                  <strong class="text-highlighted">
                    [มหาวิทยาลัยแม่ฟ้าหลวง]
                    ขอความอนุเคราะห์ประเมินผลการฝึกงานของ
                    {{ sendModalStudent?.name.th }}
                  </strong>
                </div>
                <p class="text-muted leading-relaxed text-[11px]">
                  เรียน
                  {{ sendEmailForm.evaluatorName || 'ผู้ดูแลการฝึกงาน' }},<br />
                  มหาวิทยาลัยแม่ฟ้าหลวงขอความอนุเคราะห์ให้ท่านทำแบบประเมินผลการฝึกงานของ
                  <strong>{{ sendModalStudent?.name.th }}</strong>
                  ({{ getProgramDisplay(sendModalStudent?.programId || '') }})
                  โดยท่านสามารถคลิกลิงก์ด้านล่างเพื่อเข้าทำแบบประเมินได้ทันที:
                </p>
                <div class="py-1">
                  <span
                    class="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-medium text-inverted shadow-xs"
                  >
                    <UIcon name="i-lucide-external-link" class="size-3.5" />
                    คลิกเพื่อเริ่มทำแบบประเมินผลการฝึกงาน
                  </span>
                </div>
                <div class="text-[10px] text-muted">
                  ลิงก์:
                  http://localhost:8180/evaluate?token=...&amp;assignment=...
                </div>
              </div>
            </div>

            <!-- Modal Bottom Actions -->
            <div
              class="flex items-center justify-end gap-2.5 pt-3 border-t border-default"
            >
              <UButton
                color="neutral"
                label="ยกเลิก"
                variant="outline"
                @click="isSendEmailModalOpen = false"
              />
              <UButton
                color="primary"
                icon="i-lucide-send"
                label="ยืนยันและส่งอีเมล (Confirm & Send)"
                :loading="isSendingEvaluationEmail"
                :disabled="
                  !selectedCompetencySet || !sendEmailForm.recipientEmail
                "
                @click="handleSendEvaluationEmailSubmit"
              />
            </div>
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
