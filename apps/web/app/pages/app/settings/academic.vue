<script setup lang="ts">
import { z } from 'zod'

definePageMeta({ layout: 'app', middleware: 'auth' })

interface LocalizedName {
  th: string
  en: string
}

interface School {
  id: string
  schoolCode: string
  name: LocalizedName
  status: 'active'
  createdAt?: string
  updatedAt?: string
}

interface Program {
  id: string
  schoolId: string
  programCode: string
  name: LocalizedName
  status: 'active'
  createdAt?: string
  updatedAt?: string
}

interface Course {
  id: string
  courseCode: string
  name: LocalizedName
  credits?: number
  programIds: string[]
  status: 'active'
  createdAt?: string
  updatedAt?: string
}

interface AcademicTerm {
  id: string
  code: string
  academicYear: number
  semester: string
  startsAt: string
  endsAt: string
  timezone?: string
  status: 'planned' | 'open' | 'closed'
  createdAt?: string
  updatedAt?: string
}

interface PageResult<T> {
  items: T[]
  meta: {
    total: number
    page: number
    pageSize: number
  }
}

const api = useApi()
const auth = useAuthStore()
const toast = useToast()

const canManage = computed(() =>
  auth.actor?.roles.some((r) => ['systemAdmin', 'internshipStaff'].includes(r))
)

// Active Tab: 'schools' | 'programs' | 'courses' | 'terms'
const activeTab = ref<'schools' | 'programs' | 'courses' | 'terms'>('schools')

// Schools state
const schoolSearch = ref('')
const schoolStatusFilter = ref<'all' | 'active'>('all')
const schoolPage = ref(1)
const schoolPageSize = ref(5)

// Programs state
const programSearch = ref('')
const programSchoolFilter = ref<string>('all')
const programStatusFilter = ref<'all' | 'active'>('all')
const programPage = ref(1)
const programPageSize = ref(5)

// Courses state
const courseSearch = ref('')
const courseStatusFilter = ref<'all' | 'active'>('all')
const coursePage = ref(1)
const coursePageSize = ref(5)

// Terms state
const termPage = ref(1)

// Fetch Schools
const {
  data: schoolsData,
  error: schoolsError,
  pending: schoolsPending,
  refresh: refreshSchools
} = await useAsyncData('settings-schools', () =>
  api<PageResult<School>>('/academic/schools', {
    query: {
      page: 1,
      pageSize: 100
    }
  })
)

// Fetch Programs
const {
  data: programsData,
  error: programsError,
  pending: programsPending,
  refresh: refreshPrograms
} = await useAsyncData(
  'settings-programs',
  () =>
    api<PageResult<Program>>('/academic/programs', {
      query: {
        page: 1,
        pageSize: 100,
        schoolId:
          programSchoolFilter.value !== 'all'
            ? programSchoolFilter.value
            : undefined
      }
    }),
  { watch: [programSchoolFilter] }
)

// Fetch Courses
const {
  data: coursesData,
  error: _coursesError,
  pending: coursesPending,
  refresh: refreshCourses
} = await useAsyncData('settings-courses', () =>
  api<PageResult<Course>>('/academic/courses', {
    query: {
      page: 1,
      pageSize: 100
    }
  })
)

// Fetch Terms
const {
  data: termsData,
  error: termsError,
  pending: termsPending,
  refresh: refreshTerms
} = await useAsyncData(
  'settings-terms',
  () =>
    api<PageResult<AcademicTerm>>('/academic/terms', {
      query: {
        page: termPage.value,
        pageSize: 50
      }
    }),
  { watch: [termPage] }
)

// School lookup map
const schoolMap = computed(() => {
  const map = new Map<string, School>()
  for (const s of schoolsData.value?.items ?? []) {
    map.set(s.id, s)
  }
  return map
})

// Filtered Schools
const filteredSchools = computed(() => {
  let list = schoolsData.value?.items ?? []
  if (schoolStatusFilter.value !== 'all') {
    list = list.filter((s) => s.status === schoolStatusFilter.value)
  }
  const q = schoolSearch.value.trim().toLowerCase()
  if (q) {
    list = list.filter(
      (s) =>
        s.schoolCode.toLowerCase().includes(q) ||
        s.name.th.toLowerCase().includes(q) ||
        s.name.en.toLowerCase().includes(q)
    )
  }
  return list
})

// Filtered Programs
const filteredPrograms = computed(() => {
  let list = programsData.value?.items ?? []
  if (programSchoolFilter.value !== 'all') {
    list = list.filter((p) => p.schoolId === programSchoolFilter.value)
  }
  if (programStatusFilter.value !== 'all') {
    list = list.filter((p) => p.status === programStatusFilter.value)
  }
  const q = programSearch.value.trim().toLowerCase()
  if (q) {
    list = list.filter(
      (p) =>
        p.programCode.toLowerCase().includes(q) ||
        p.name.th.toLowerCase().includes(q) ||
        p.name.en.toLowerCase().includes(q)
    )
  }
  return list
})

// Filtered Courses
const filteredCourses = computed(() => {
  let list = coursesData.value?.items ?? []
  if (courseStatusFilter.value !== 'all') {
    list = list.filter((c) => c.status === courseStatusFilter.value)
  }
  const q = courseSearch.value.trim().toLowerCase()
  if (q) {
    list = list.filter(
      (c) =>
        c.courseCode.toLowerCase().includes(q) ||
        c.name.th.toLowerCase().includes(q) ||
        c.name.en.toLowerCase().includes(q)
    )
  }
  return list
})

// Active filters and reset helpers
const hasActiveSchoolFilters = computed(
  () => !!schoolSearch.value.trim() || schoolStatusFilter.value !== 'all'
)
function resetSchoolFilters() {
  schoolSearch.value = ''
  schoolStatusFilter.value = 'all'
  schoolPage.value = 1
}

const hasActiveProgramFilters = computed(
  () =>
    !!programSearch.value.trim() ||
    programSchoolFilter.value !== 'all' ||
    programStatusFilter.value !== 'all'
)
function resetProgramFilters() {
  programSearch.value = ''
  programSchoolFilter.value = 'all'
  programStatusFilter.value = 'all'
  programPage.value = 1
}

const hasActiveCourseFilters = computed(
  () => !!courseSearch.value.trim() || courseStatusFilter.value !== 'all'
)
function resetCourseFilters() {
  courseSearch.value = ''
  courseStatusFilter.value = 'all'
  coursePage.value = 1
}

// Pagination for Schools (Configurable: 5, 10, 15, 20 items per page)
const paginatedSchools = computed(() => {
  const start = (schoolPage.value - 1) * schoolPageSize.value
  return filteredSchools.value.slice(start, start + schoolPageSize.value)
})
watch([schoolStatusFilter, schoolSearch, schoolPageSize], () => {
  schoolPage.value = 1
})

// Pagination for Programs (Configurable: 5, 10, 15, 20 items per page)
const paginatedPrograms = computed(() => {
  const start = (programPage.value - 1) * programPageSize.value
  return filteredPrograms.value.slice(start, start + programPageSize.value)
})
watch(
  [programStatusFilter, programSearch, programSchoolFilter, programPageSize],
  () => {
    programPage.value = 1
  }
)

// Pagination for Courses (Configurable: 5, 10, 15, 20 items per page)
const paginatedCourses = computed(() => {
  const start = (coursePage.value - 1) * coursePageSize.value
  return filteredCourses.value.slice(start, start + coursePageSize.value)
})
watch([courseStatusFilter, courseSearch, coursePageSize], () => {
  coursePage.value = 1
})

// Modal states
const isSchoolModalOpen = ref(false)
const isProgramModalOpen = ref(false)
const modalSaving = ref(false)
const editingSchoolId = ref<string | null>(null)
const editingProgramId = ref<string | null>(null)

// Validation schemas
const schoolFormSchema = z.object({
  schoolCode: z
    .string()
    .trim()
    .min(1, 'กรุณาระบุรหัสสำนักวิชา')
    .max(20, 'รหัสต้องไม่เกิน 20 ตัวอักษร'),
  nameTh: z.string().trim().min(1, 'กรุณาระบุชื่อสำนักวิชา (ภาษาไทย)'),
  nameEn: z.string().trim().min(1, 'กรุณาระบุชื่อสำนักวิชา (ภาษาอังกฤษ)'),
  status: z.enum(['active'])
})

const programFormSchema = z.object({
  schoolId: z.string().min(1, 'กรุณาเลือกสำนักวิชาสังกัด'),
  programCode: z
    .string()
    .trim()
    .min(1, 'กรุณาระบุรหัสหลักสูตร')
    .max(20, 'รหัสต้องไม่เกิน 20 ตัวอักษร'),
  nameTh: z.string().trim().min(1, 'กรุณาระบุชื่อหลักสูตร (ภาษาไทย)'),
  nameEn: z.string().trim().min(1, 'กรุณาระบุชื่อหลักสูตร (ภาษาอังกฤษ)'),
  status: z.enum(['active'])
})

// Form data
const schoolForm = reactive({
  schoolCode: '',
  nameTh: '',
  nameEn: '',
  status: 'active' as const
})

const programForm = reactive({
  schoolId: '',
  programCode: '',
  nameTh: '',
  nameEn: '',
  status: 'active' as const
})

const schoolFormErrors = ref<Record<string, string>>({})
const programFormErrors = ref<Record<string, string>>({})

// Open School Modal
function openCreateSchoolModal() {
  editingSchoolId.value = null
  schoolForm.schoolCode = ''
  schoolForm.nameTh = ''
  schoolForm.nameEn = ''
  schoolForm.status = 'active'
  schoolFormErrors.value = {}
  isSchoolModalOpen.value = true
}

function openEditSchoolModal(school: School) {
  editingSchoolId.value = school.id
  schoolForm.schoolCode = school.schoolCode
  schoolForm.nameTh = school.name.th
  schoolForm.nameEn = school.name.en
  schoolForm.status = school.status
  schoolFormErrors.value = {}
  isSchoolModalOpen.value = true
}

// Open Program Modal
function openCreateProgramModal() {
  editingProgramId.value = null
  programForm.schoolId =
    programSchoolFilter.value !== 'all'
      ? programSchoolFilter.value
      : (schoolsData.value?.items[0]?.id ?? '')
  programForm.programCode = ''
  programForm.nameTh = ''
  programForm.nameEn = ''
  programForm.status = 'active'
  programFormErrors.value = {}
  isProgramModalOpen.value = true
}

function openEditProgramModal(program: Program) {
  editingProgramId.value = program.id
  programForm.schoolId = program.schoolId
  programForm.programCode = program.programCode
  programForm.nameTh = program.name.th
  programForm.nameEn = program.name.en
  programForm.status = program.status
  programFormErrors.value = {}
  isProgramModalOpen.value = true
}

// Save School
async function handleSaveSchool() {
  schoolFormErrors.value = {}
  const result = schoolFormSchema.safeParse(schoolForm)
  if (!result.success) {
    for (const issue of result.error.issues) {
      const field = issue.path[0] as string
      schoolFormErrors.value[field] = issue.message
    }
    return
  }

  modalSaving.value = true
  try {
    const payload = {
      schoolCode: result.data.schoolCode.toUpperCase(),
      name: {
        th: result.data.nameTh,
        en: result.data.nameEn
      },
      status: result.data.status
    }

    if (editingSchoolId.value) {
      await api(`/academic/schools/${editingSchoolId.value}`, {
        method: 'PATCH',
        body: payload
      })
      toast.add({
        title: 'แก้ไขสำนักวิชาสำเร็จ',
        description: `อัปเดตข้อมูล ${payload.name.th} เรียบร้อยแล้ว`,
        color: 'success'
      })
    } else {
      await api('/academic/schools', {
        method: 'POST',
        body: payload
      })
      toast.add({
        title: 'เพิ่มสำนักวิชาสำเร็จ',
        description: `เพิ่มสำนักวิชา ${payload.name.th} เรียบร้อยแล้ว`,
        color: 'success'
      })
    }
    isSchoolModalOpen.value = false
    await refreshSchools()
  } catch (err: unknown) {
    const errorMsg =
      err && typeof err === 'object' && 'message' in err
        ? String(err.message)
        : 'ไม่สามารถบันทึกข้อมูลได้ กรุณาตรวจสอบรหัสซ้ำ'
    toast.add({
      title: 'บันทึกไม่สำเร็จ',
      description: errorMsg,
      color: 'error'
    })
  } finally {
    modalSaving.value = false
  }
}

// Save Program
async function handleSaveProgram() {
  programFormErrors.value = {}
  const result = programFormSchema.safeParse(programForm)
  if (!result.success) {
    for (const issue of result.error.issues) {
      const field = issue.path[0] as string
      programFormErrors.value[field] = issue.message
    }
    return
  }

  modalSaving.value = true
  try {
    const payload = {
      schoolId: result.data.schoolId,
      programCode: result.data.programCode.toUpperCase(),
      name: {
        th: result.data.nameTh,
        en: result.data.nameEn
      },
      status: result.data.status
    }

    if (editingProgramId.value) {
      await api(`/academic/programs/${editingProgramId.value}`, {
        method: 'PATCH',
        body: payload
      })
      toast.add({
        title: 'แก้ไขหลักสูตรสำเร็จ',
        description: `อัปเดตข้อมูล ${payload.name.th} เรียบร้อยแล้ว`,
        color: 'success'
      })
    } else {
      await api('/academic/programs', {
        method: 'POST',
        body: payload
      })
      toast.add({
        title: 'เพิ่มหลักสูตรสำเร็จ',
        description: `เพิ่มหลักสูตร ${payload.name.th} เรียบร้อยแล้ว`,
        color: 'success'
      })
    }
    isProgramModalOpen.value = false
    await refreshPrograms()
  } catch (err: unknown) {
    const errorMsg =
      err && typeof err === 'object' && 'message' in err
        ? String(err.message)
        : 'ไม่สามารถบันทึกข้อมูลได้ กรุณาตรวจสอบรหัสซ้ำ'
    toast.add({
      title: 'บันทึกไม่สำเร็จ',
      description: errorMsg,
      color: 'error'
    })
  } finally {
    modalSaving.value = false
  }
}

// =========================================================================
// COURSE MODAL & ACTIONS
// =========================================================================
const isCourseModalOpen = ref(false)
const editingCourseId = ref<string | null>(null)

const courseFormSchema = z.object({
  nameTh: z.string().trim().min(1, 'กรุณาระบุชื่อวิชา (ภาษาไทย)'),
  nameEn: z.string().trim().min(1, 'กรุณาระบุชื่อวิชา (ภาษาอังกฤษ)'),
  status: z.enum(['active'])
})

const courseForm = reactive({
  nameTh: '',
  nameEn: '',
  status: 'active' as const
})

const courseFormErrors = ref<Record<string, string>>({})

function openCreateCourseModal() {
  editingCourseId.value = null
  courseForm.nameTh = ''
  courseForm.nameEn = ''
  courseForm.status = 'active'
  courseFormErrors.value = {}
  isCourseModalOpen.value = true
}

function openEditCourseModal(course: Course) {
  editingCourseId.value = course.id
  courseForm.nameTh = course.name.th
  courseForm.nameEn = course.name.en
  courseForm.status = course.status
  courseFormErrors.value = {}
  isCourseModalOpen.value = true
}

async function handleSaveCourse() {
  courseFormErrors.value = {}
  const result = courseFormSchema.safeParse(courseForm)
  if (!result.success) {
    for (const issue of result.error.issues) {
      const field = issue.path[0] as string
      courseFormErrors.value[field] = issue.message
    }
    return
  }

  modalSaving.value = true
  try {
    const payload: {
      name: { th: string; en: string }
      status: 'active'
      courseCode?: string
    } = {
      name: {
        th: result.data.nameTh,
        en: result.data.nameEn
      },
      status: result.data.status
    }

    if (editingCourseId.value) {
      await api(`/academic/courses/${editingCourseId.value}`, {
        method: 'PATCH',
        body: payload
      })
      toast.add({
        title: 'แก้ไขรายวิชาสำเร็จ',
        description: `อัปเดตข้อมูล ${payload.name.th} เรียบร้อยแล้ว`,
        color: 'success'
      })
    } else {
      payload.courseCode = `CRS-${Date.now().toString(36).toUpperCase()}`
      await api('/academic/courses', {
        method: 'POST',
        body: payload
      })
      toast.add({
        title: 'เพิ่มรายวิชาสำเร็จ',
        description: `เพิ่มรายวิชา ${payload.name.th} เรียบร้อยแล้ว`,
        color: 'success'
      })
    }
    isCourseModalOpen.value = false
    await refreshCourses()
  } catch (err: unknown) {
    const errorMsg =
      err && typeof err === 'object' && 'message' in err
        ? String(err.message)
        : 'ไม่สามารถบันทึกข้อมูลรายวิชาได้'
    toast.add({
      title: 'บันทึกไม่สำเร็จ',
      description: errorMsg,
      color: 'error'
    })
  } finally {
    modalSaving.value = false
  }
}

// =========================================================================

// =========================================================================
// MASTER TERM STRUCTURE (โครงสร้างรอบภาคการศึกษาประจำปี)
// =========================================================================
export interface MasterTermSlot {
  id: string
  termNumber: number
  nameTh: string
  nameEn: string
  codeSuffix: string
  monthsRangeTh: string
  startMonth: number
  startDay: number
  endMonth: number
  endDay: number
  type: 'regular' | 'summer' | 'special'
  isActive: boolean
  description: string
}

const DEFAULT_MASTER_TERMS: MasterTermSlot[] = [
  {
    id: 'term-slot-1',
    termNumber: 1,
    nameTh: 'ภาคการศึกษาที่ 1 (เทอมหนึ่ง)',
    nameEn: 'First Semester',
    codeSuffix: '1',
    monthsRangeTh: 'สิงหาคม – ธันวาคม',
    startMonth: 8,
    startDay: 1,
    endMonth: 12,
    endDay: 31,
    type: 'regular',
    isActive: true,
    description: 'ภาคการศึกษาต้น สำหรับการเรียนและการฝึกงานตามแผนการศึกษา'
  },
  {
    id: 'term-slot-2',
    termNumber: 2,
    nameTh: 'ภาคการศึกษาที่ 2 (เทอมสอง)',
    nameEn: 'Second Semester',
    codeSuffix: '2',
    monthsRangeTh: 'มกราคม – พฤษภาคม',
    startMonth: 1,
    startDay: 1,
    endMonth: 5,
    endDay: 31,
    type: 'regular',
    isActive: true,
    description: 'ภาคการศึกษาปลาย สำหรับการเรียนและการฝึกงานตามแผนการศึกษา'
  },
  {
    id: 'term-slot-3',
    termNumber: 3,
    nameTh: 'ภาคการศึกษาที่ 3 (ภาคฤดูร้อน)',
    nameEn: 'Summer Semester',
    codeSuffix: '3',
    monthsRangeTh: 'มิถุนายน – กรกฎาคม',
    startMonth: 6,
    startDay: 1,
    endMonth: 7,
    endDay: 31,
    type: 'summer',
    isActive: true,
    description: 'ภาคการศึกษาฤดูร้อน สำหรับการฝึกงานภาคบังคับหรือสหกิจศึกษา'
  }
]

const masterTermStructure = ref<MasterTermSlot[]>([...DEFAULT_MASTER_TERMS])

onMounted(() => {
  if (import.meta.client) {
    try {
      const saved = localStorage.getItem('mfu_academic_term_structure')
      if (saved) {
        const parsed = JSON.parse(saved)
        if (Array.isArray(parsed) && parsed.length > 0) {
          masterTermStructure.value = parsed
        }
      }
    } catch {
      // Ignore
    }
  }
})

function saveMasterTermStructure() {
  if (import.meta.client) {
    localStorage.setItem(
      'mfu_academic_term_structure',
      JSON.stringify(masterTermStructure.value)
    )
  }
}

// Master Term Slot Modal
const isSlotModalOpen = ref(false)
const editingSlotId = ref<string | null>(null)

const slotForm = reactive({
  termNumber: 4,
  nameTh: '',
  nameEn: '',
  codeSuffix: '',
  monthsRangeTh: '',
  type: 'special' as 'regular' | 'summer' | 'special',
  isActive: true,
  description: ''
})

function openCreateSlotModal() {
  editingSlotId.value = null
  const nextNum = masterTermStructure.value.length + 1
  slotForm.termNumber = nextNum
  slotForm.nameTh = `ภาคการศึกษาที่ ${nextNum} (เทอม${nextNum === 4 ? 'สี่' : nextNum === 5 ? 'ห้า' : nextNum})`
  slotForm.nameEn = `Semester ${nextNum}`
  slotForm.codeSuffix = String(nextNum)
  slotForm.monthsRangeTh = 'กรกฎาคม – สิงหาคม'
  slotForm.type = 'special'
  slotForm.isActive = true
  slotForm.description = 'ภาคการศึกษาพิเศษเพิ่มเติมตามเงื่อนไขของหลักสูตร'
  isSlotModalOpen.value = true
}

function openEditSlotModal(slot: MasterTermSlot) {
  editingSlotId.value = slot.id
  slotForm.termNumber = slot.termNumber
  slotForm.nameTh = slot.nameTh
  slotForm.nameEn = slot.nameEn
  slotForm.codeSuffix = slot.codeSuffix
  slotForm.monthsRangeTh = slot.monthsRangeTh
  slotForm.type = slot.type
  slotForm.isActive = slot.isActive
  slotForm.description = slot.description
  isSlotModalOpen.value = true
}

function handleSaveSlot() {
  if (!slotForm.nameTh.trim()) {
    toast.add({ title: 'กรุณาระบุชื่อภาคการศึกษา', color: 'error' })
    return
  }
  if (editingSlotId.value) {
    const idx = masterTermStructure.value.findIndex(
      (s) => s.id === editingSlotId.value
    )
    if (idx !== -1) {
      masterTermStructure.value[idx] = {
        ...masterTermStructure.value[idx]!,
        nameTh: slotForm.nameTh,
        nameEn: slotForm.nameEn || slotForm.nameTh,
        codeSuffix: slotForm.codeSuffix || String(slotForm.termNumber),
        monthsRangeTh: slotForm.monthsRangeTh,
        type: slotForm.type,
        isActive: slotForm.isActive,
        description: slotForm.description
      }
    }
  } else {
    masterTermStructure.value.push({
      id: `term-slot-${Date.now()}`,
      termNumber: slotForm.termNumber,
      nameTh: slotForm.nameTh,
      nameEn: slotForm.nameEn || slotForm.nameTh,
      codeSuffix: slotForm.codeSuffix || String(slotForm.termNumber),
      monthsRangeTh: slotForm.monthsRangeTh,
      startMonth: 7,
      startDay: 1,
      endMonth: 8,
      endDay: 31,
      type: slotForm.type,
      isActive: slotForm.isActive,
      description: slotForm.description
    })
  }
  saveMasterTermStructure()
  isSlotModalOpen.value = false
  toast.add({ title: 'บันทึกโครงสร้างภาคการศึกษาสำเร็จ', color: 'success' })
}

function handleDeleteSlot(slotId: string) {
  if (masterTermStructure.value.length <= 1) {
    toast.add({ title: 'ต้องมีอย่างน้อย 1 ภาคการศึกษา', color: 'warning' })
    return
  }
  masterTermStructure.value = masterTermStructure.value.filter(
    (s) => s.id !== slotId
  )
  masterTermStructure.value.forEach((s, idx) => {
    s.termNumber = idx + 1
  })
  saveMasterTermStructure()
  toast.add({ title: 'ลบภาคการศึกษาออกจากโครงสร้างสำเร็จ', color: 'success' })
}

function handleResetSlotsToDefault() {
  masterTermStructure.value = JSON.parse(JSON.stringify(DEFAULT_MASTER_TERMS))
  saveMasterTermStructure()
  toast.add({
    title: 'รีเซ็ตเป็นมาตรฐาน 3 ภาคการศึกษาเรียบร้อย',
    color: 'success'
  })
}

// Academic Term Modal & Actions
const isTermModalOpen = ref(false)
const editingTermId = ref<string | null>(null)

const termForm = reactive({
  code: '',
  academicYear: new Date().getFullYear(),
  semester: '1',
  startsAt: '',
  endsAt: '',
  status: 'planned' as 'planned' | 'open' | 'closed'
})

const termFormErrors = ref<Record<string, string>>({})

function openCreateTermModal(prefillYear?: number, prefillSemester?: string) {
  editingTermId.value = null
  const currentYear = prefillYear ?? new Date().getFullYear()
  const sem = prefillSemester ?? '1'

  termForm.academicYear = currentYear
  termForm.semester = sem
  termForm.code = `${currentYear}-${sem}`

  if (sem === '1') {
    termForm.startsAt = `${currentYear}-08-01`
    termForm.endsAt = `${currentYear}-12-31`
    termForm.status = 'open'
  } else if (sem === '2') {
    termForm.startsAt = `${currentYear + 1}-01-01`
    termForm.endsAt = `${currentYear + 1}-05-31`
    termForm.status = 'planned'
  } else {
    termForm.code = `${currentYear}-S`
    termForm.startsAt = `${currentYear + 1}-06-01`
    termForm.endsAt = `${currentYear + 1}-07-31`
    termForm.status = 'planned'
  }

  termFormErrors.value = {}
  isTermModalOpen.value = true
}

function openEditTermModal(term: AcademicTerm) {
  editingTermId.value = term.id
  termForm.code = term.code
  termForm.academicYear = term.academicYear
  termForm.semester = term.semester
  termForm.startsAt = term.startsAt ? term.startsAt.split('T')[0]! : ''
  termForm.endsAt = term.endsAt ? term.endsAt.split('T')[0]! : ''
  termForm.status = term.status
  termFormErrors.value = {}
  isTermModalOpen.value = true
}

async function handleSaveTerm() {
  termFormErrors.value = {}
  if (!termForm.code.trim()) {
    termFormErrors.value.code = 'กรุณาระบุรหัสภาคการศึกษา'
    return
  }
  if (!termForm.startsAt || !termForm.endsAt) {
    termFormErrors.value.dates = 'กรุณาระบุช่วงวันที่เริ่มต้นและสิ้นสุด'
    return
  }
  if (new Date(termForm.endsAt) <= new Date(termForm.startsAt)) {
    termFormErrors.value.dates = 'วันสิ้นสุดต้องอยู่หลังจากวันเริ่มต้น'
    return
  }

  modalSaving.value = true
  try {
    const payload = {
      code: termForm.code.trim(),
      academicYear: Number(termForm.academicYear),
      semester: termForm.semester,
      startsAt: new Date(termForm.startsAt).toISOString(),
      endsAt: new Date(termForm.endsAt).toISOString(),
      status: termForm.status
    }

    if (editingTermId.value) {
      await api(`/academic/terms/${editingTermId.value}`, {
        method: 'PATCH',
        body: payload
      })
      toast.add({
        title: 'แก้ไขภาคการศึกษาสำเร็จ',
        description: `อัปเดตข้อมูลภาคการศึกษา ${payload.code} เรียบร้อยแล้ว`,
        color: 'success'
      })
    } else {
      await api('/academic/terms', {
        method: 'POST',
        body: payload
      })
      toast.add({
        title: 'เพิ่มภาคการศึกษาสำเร็จ',
        description: `เพิ่มภาคการศึกษา ${payload.code} เรียบร้อยแล้ว`,
        color: 'success'
      })
    }
    isTermModalOpen.value = false
    await refreshTerms()
  } catch (err: unknown) {
    const errorMsg =
      err && typeof err === 'object' && 'message' in err
        ? String(err.message)
        : 'ไม่สามารถบันทึกภาคการศึกษาได้'
    toast.add({
      title: 'บันทึกไม่สำเร็จ',
      description: errorMsg,
      color: 'error'
    })
  } finally {
    modalSaving.value = false
  }
}

async function handleToggleTermStatus(term: AcademicTerm) {
  const nextStatus = term.status === 'open' ? 'closed' : 'open'
  const actionText = nextStatus === 'open' ? 'เปิดรับลงทะเบียน' : 'ปิดรับ'
  try {
    await api(`/academic/terms/${term.id}`, {
      method: 'PATCH',
      body: { status: nextStatus }
    })
    toast.add({
      title: `${actionText}ภาคการศึกษาสำเร็จ`,
      description: `${term.code} เปลี่ยนสถานะเป็น ${actionText} แล้ว`,
      color: 'success'
    })
    await refreshTerms()
  } catch {
    toast.add({
      title: 'ดำเนินการไม่สำเร็จ',
      description: 'ไม่สามารถเปลี่ยนสถานะภาคการศึกษาได้',
      color: 'error'
    })
  }
}
</script>

<template>
  <div class="space-y-6">
    <!-- Page Header -->
    <header class="flex flex-wrap items-end justify-between gap-4">
      <div>
        <p class="mfu-eyebrow">โครงสร้างองค์กรและการศึกษา</p>
        <h1 class="mt-2 text-3xl font-bold text-highlighted">
          สำนักวิชาและหลักสูตร
        </h1>
        <p class="mt-1 text-sm text-muted">
          จัดการข้อมูลสำนักวิชา (Schools/Faculties) และสาขาวิชา/หลักสูตร
          (Programs) สำหรับระบบฝึกงาน
        </p>
      </div>

      <div class="flex items-center gap-3">
        <UButton
          color="neutral"
          icon="i-lucide-refresh-cw"
          label="รีเฟรช"
          :loading="
            schoolsPending || programsPending || coursesPending || termsPending
          "
          variant="outline"
          @click="
            () => {
              refreshSchools()
              refreshPrograms()
              refreshCourses()
              refreshTerms()
            }
          "
        />
        <UButton
          v-if="canManage && activeTab === 'schools'"
          color="primary"
          icon="i-lucide-plus"
          label="เพิ่มสำนักวิชา"
          @click="openCreateSchoolModal"
        />
        <UButton
          v-if="canManage && activeTab === 'programs'"
          color="primary"
          icon="i-lucide-plus"
          label="เพิ่มหลักสูตร"
          @click="openCreateProgramModal"
        />
        <UButton
          v-if="canManage && activeTab === 'courses'"
          color="primary"
          icon="i-lucide-plus"
          label="เพิ่มรายวิชา"
          @click="openCreateCourseModal"
        />
        <UButton
          v-if="canManage && activeTab === 'terms'"
          color="primary"
          icon="i-lucide-plus"
          label="เพิ่มภาคการศึกษา"
          size="md"
          @click="openCreateTermModal()"
        />
      </div>
    </header>

    <!-- Navigation Tabs -->
    <div class="flex border-b border-default">
      <button
        type="button"
        class="flex items-center gap-2 border-b-2 px-5 py-3 text-sm font-semibold transition-colors"
        :class="
          activeTab === 'schools'
            ? 'border-primary text-primary'
            : 'border-transparent text-muted hover:text-highlighted'
        "
        @click="activeTab = 'schools'"
      >
        <UIcon name="i-lucide-building-2" class="size-4" />
        <span>สำนักวิชา (Schools)</span>
        <UBadge
          :color="activeTab === 'schools' ? 'primary' : 'neutral'"
          :label="`${schoolsData?.items.length ?? 0}`"
          size="sm"
          variant="subtle"
        />
      </button>

      <button
        type="button"
        class="flex items-center gap-2 border-b-2 px-5 py-3 text-sm font-semibold transition-colors"
        :class="
          activeTab === 'programs'
            ? 'border-primary text-primary'
            : 'border-transparent text-muted hover:text-highlighted'
        "
        @click="activeTab = 'programs'"
      >
        <UIcon name="i-lucide-school" class="size-4" />
        <span>สาขาวิชา / หลักสูตร (Programs)</span>
        <UBadge
          :color="activeTab === 'programs' ? 'primary' : 'neutral'"
          :label="`${programsData?.items.length ?? 0}`"
          size="sm"
          variant="subtle"
        />
      </button>

      <button
        type="button"
        class="flex items-center gap-2 border-b-2 px-5 py-3 text-sm font-semibold transition-colors"
        :class="
          activeTab === 'courses'
            ? 'border-primary text-primary'
            : 'border-transparent text-muted hover:text-highlighted'
        "
        @click="activeTab = 'courses'"
      >
        <UIcon name="i-lucide-book-open" class="size-4" />
        <span>รายวิชา (Courses)</span>
        <UBadge
          :color="activeTab === 'courses' ? 'primary' : 'neutral'"
          :label="`${coursesData?.items.length ?? 0}`"
          size="sm"
          variant="subtle"
        />
      </button>

      <button
        type="button"
        class="flex items-center gap-2 border-b-2 px-5 py-3 text-sm font-semibold transition-colors"
        :class="
          activeTab === 'terms'
            ? 'border-primary text-primary'
            : 'border-transparent text-muted hover:text-highlighted'
        "
        @click="activeTab = 'terms'"
      >
        <UIcon name="i-lucide-calendar-range" class="size-4" />
        <span>โครงสร้างภาคการศึกษา (Academic Terms)</span>
        <UBadge
          :color="activeTab === 'terms' ? 'primary' : 'neutral'"
          :label="`${termsData?.meta.total ?? 0} ภาคการศึกษา`"
          size="sm"
          variant="subtle"
        />
      </button>
    </div>

    <!-- TAB 1: สำนักวิชา (Schools) -->
    <div v-if="activeTab === 'schools'" class="space-y-4">
      <!-- Standardized Modern Multi-Filter Card: Schools -->
      <div
        class="rounded-xl border border-default bg-default p-4 shadow-sm space-y-3"
      >
        <div class="flex flex-col gap-3 md:flex-row md:items-center">
          <div class="relative flex-1">
            <UInput
              v-model="schoolSearch"
              class="w-full"
              icon="i-lucide-search"
              placeholder="ค้นหารหัส หรือชื่อสำนักวิชา (ไทย / English)..."
              size="md"
            >
              <template #trailing>
                <button
                  v-if="schoolSearch"
                  type="button"
                  class="text-muted hover:text-highlighted cursor-pointer p-0.5"
                  title="ล้างคำค้นหา"
                  @click="schoolSearch = ''"
                >
                  <UIcon name="i-lucide-x" class="size-4" />
                </button>
              </template>
            </UInput>
          </div>

          <div class="flex items-center gap-2">
            <label
              for="school-status-filter"
              class="text-xs font-semibold text-muted whitespace-nowrap"
              >สถานะ:</label
            >
            <select
              id="school-status-filter"
              v-model="schoolStatusFilter"
              class="rounded-lg border border-default bg-default px-3 py-2 text-xs text-highlighted focus:outline-none focus:ring-1 focus:ring-primary font-medium"
            >
              <option value="all">ทุกสถานะ</option>
              <option value="active">ใช้งานอยู่ (Active)</option>
            </select>
          </div>
        </div>

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
                filteredSchools.length
              }}</span>
              สำนักวิชา
            </span>
            <span
              v-if="(schoolsData?.items.length ?? 0) > filteredSchools.length"
              class="text-muted"
            >
              (จากทั้งหมด {{ schoolsData?.items.length ?? 0 }} สำนักวิชา)
            </span>
          </div>

          <button
            v-if="hasActiveSchoolFilters"
            type="button"
            class="inline-flex items-center gap-1 font-medium text-primary hover:underline cursor-pointer"
            @click="resetSchoolFilters"
          >
            <UIcon name="i-lucide-rotate-ccw" class="size-3.5" />
            <span>ล้างตัวกรองทั้งหมด</span>
          </button>
        </div>
      </div>

      <UAlert
        v-if="schoolsError"
        color="error"
        icon="i-lucide-circle-alert"
        title="โหลดข้อมูลสำนักวิชาไม่สำเร็จ"
        description="กรุณาตรวจสอบการเชื่อมต่อ API หรือสิทธิ์การใช้งาน"
        variant="soft"
      />

      <!-- Schools Table -->
      <UCard :ui="{ body: 'p-0 sm:p-0' }">
        <div class="overflow-x-auto">
          <table class="data-table">
            <thead>
              <tr>
                <th class="w-32">รหัสสำนักวิชา</th>
                <th>ชื่อภาษาไทย</th>
                <th>ชื่อภาษาอังกฤษ</th>
                <th class="w-32">หลักสูตรในสังกัด</th>
                <th class="w-28 text-center">สถานะ</th>
                <th v-if="canManage" class="w-24 text-right">การจัดการ</th>
              </tr>
            </thead>
            <tbody>
              <tr v-if="filteredSchools.length === 0">
                <td
                  :colspan="canManage ? 6 : 5"
                  class="py-12 text-center text-muted"
                >
                  <UIcon
                    name="i-lucide-building-2"
                    class="mx-auto mb-2 size-8 text-muted"
                  />
                  <p class="font-medium">ไม่พบข้อมูลสำนักวิชา</p>
                  <p class="text-xs">
                    คลิกปุ่ม &quot;เพิ่มสำนักวิชา&quot;
                    ด้านบนเพื่อเริ่มต้นสร้างข้อมูล
                  </p>
                </td>
              </tr>
              <tr v-for="school in paginatedSchools" :key="school.id">
                <td class="font-mono font-bold text-highlighted">
                  {{ school.schoolCode }}
                </td>
                <td class="font-medium text-highlighted">
                  {{ school.name.th }}
                </td>
                <td class="text-muted">
                  {{ school.name.en }}
                </td>
                <td>
                  <UBadge
                    color="neutral"
                    :label="`${programsData?.items.filter((p) => p.schoolId === school.id).length ?? 0} หลักสูตร`"
                    size="sm"
                    variant="subtle"
                  />
                </td>
                <td class="text-center">
                  <UBadge
                    :color="school.status === 'active' ? 'success' : 'neutral'"
                    :label="school.status === 'active' ? 'ใช้งาน' : 'เก็บถาวร'"
                    size="sm"
                    variant="subtle"
                  />
                </td>
                <td v-if="canManage" class="text-right">
                  <div class="flex items-center justify-end">
                    <UDropdownMenu
                      :items="[
                        [
                          {
                            label: 'แก้ไขสำนักวิชา',
                            icon: 'i-lucide-pencil',
                            onSelect: () => openEditSchoolModal(school)
                          }
                        ]
                      ]"
                      :content="{ align: 'end' }"
                    >
                      <UButton
                        aria-label="การจัดการสำนักวิชา"
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
          v-model:page="schoolPage"
          v-model:page-size="schoolPageSize"
          :total="filteredSchools.length"
          items-name="สำนักวิชา"
        />
      </UCard>
    </div>

    <!-- TAB 2: หลักสูตร / สาขาวิชา (Programs) -->
    <div v-if="activeTab === 'programs'" class="space-y-4">
      <!-- Standardized Modern Multi-Filter Card: Programs -->
      <div
        class="rounded-xl border border-default bg-default p-4 shadow-sm space-y-3"
      >
        <div class="flex flex-col gap-3 md:flex-row md:items-center">
          <div class="flex items-center gap-2 sm:w-72">
            <label
              for="prog-school-filter"
              class="shrink-0 text-xs font-semibold text-muted"
              >สำนักวิชา:</label
            >
            <select
              id="prog-school-filter"
              v-model="programSchoolFilter"
              class="h-9 w-full rounded-lg border border-default bg-default px-3 text-xs text-highlighted focus:outline-none focus:ring-1 focus:ring-primary font-medium"
            >
              <option value="all">-- สำนักวิชาทั้งหมด --</option>
              <option
                v-for="school in schoolsData?.items"
                :key="school.id"
                :value="school.id"
              >
                [{{ school.schoolCode }}] {{ school.name.th }}
              </option>
            </select>
          </div>

          <div class="relative flex-1">
            <UInput
              v-model="programSearch"
              class="w-full"
              icon="i-lucide-search"
              placeholder="ค้นหารหัส หรือชื่อหลักสูตร (ไทย / English)..."
              size="md"
            >
              <template #trailing>
                <button
                  v-if="programSearch"
                  type="button"
                  class="text-muted hover:text-highlighted cursor-pointer p-0.5"
                  title="ล้างคำค้นหา"
                  @click="programSearch = ''"
                >
                  <UIcon name="i-lucide-x" class="size-4" />
                </button>
              </template>
            </UInput>
          </div>

          <div class="flex items-center gap-2">
            <label
              for="prog-status-filter"
              class="text-xs font-semibold text-muted whitespace-nowrap"
              >สถานะ:</label
            >
            <select
              id="prog-status-filter"
              v-model="programStatusFilter"
              class="rounded-lg border border-default bg-default px-3 py-2 text-xs text-highlighted focus:outline-none focus:ring-1 focus:ring-primary font-medium"
            >
              <option value="all">ทุกสถานะ</option>
              <option value="active">ใช้งานอยู่ (Active)</option>
            </select>
          </div>
        </div>

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
                filteredPrograms.length
              }}</span>
              หลักสูตร
            </span>
            <span
              v-if="(programsData?.items.length ?? 0) > filteredPrograms.length"
              class="text-muted"
            >
              (จากทั้งหมด {{ programsData?.items.length ?? 0 }} หลักสูตร)
            </span>
          </div>

          <button
            v-if="hasActiveProgramFilters"
            type="button"
            class="inline-flex items-center gap-1 font-medium text-primary hover:underline cursor-pointer"
            @click="resetProgramFilters"
          >
            <UIcon name="i-lucide-rotate-ccw" class="size-3.5" />
            <span>ล้างตัวกรองทั้งหมด</span>
          </button>
        </div>
      </div>

      <UAlert
        v-if="programsError"
        color="error"
        icon="i-lucide-circle-alert"
        title="โหลดข้อมูลหลักสูตรไม่สำเร็จ"
        description="กรุณาตรวจสอบการเชื่อมต่อ API หรือสิทธิ์การใช้งาน"
        variant="soft"
      />

      <!-- Programs Table -->
      <UCard :ui="{ body: 'p-0 sm:p-0' }">
        <div class="overflow-x-auto">
          <table class="data-table">
            <thead>
              <tr>
                <th class="w-28">รหัสหลักสูตร</th>
                <th>ชื่อหลักสูตร (ภาษาไทย)</th>
                <th>ชื่อภาษาอังกฤษ</th>
                <th class="w-48">สำนักวิชาสังกัด</th>
                <th class="w-28 text-center">สถานะ</th>
                <th v-if="canManage" class="w-24 text-right">การจัดการ</th>
              </tr>
            </thead>
            <tbody>
              <tr v-if="filteredPrograms.length === 0">
                <td
                  :colspan="canManage ? 6 : 5"
                  class="py-12 text-center text-muted"
                >
                  <UIcon
                    name="i-lucide-school"
                    class="mx-auto mb-2 size-8 text-muted"
                  />
                  <p class="font-medium">ไม่พบข้อมูลหลักสูตร/สาขาวิชา</p>
                  <p class="text-xs">
                    คลิกปุ่ม &quot;เพิ่มหลักสูตร&quot;
                    ด้านบนเพื่อสร้างข้อมูลหลักสูตรใหม่
                  </p>
                </td>
              </tr>
              <tr v-for="prog in paginatedPrograms" :key="prog.id">
                <td class="font-mono font-bold text-highlighted">
                  {{ prog.programCode }}
                </td>
                <td class="font-medium text-highlighted">
                  {{ prog.name.th }}
                </td>
                <td class="text-muted">
                  {{ prog.name.en }}
                </td>
                <td>
                  <span
                    v-if="schoolMap.get(prog.schoolId)"
                    class="inline-flex items-center gap-1.5 text-sm text-highlighted"
                  >
                    <span class="font-mono text-xs font-semibold text-primary">
                      [{{ schoolMap.get(prog.schoolId)?.schoolCode }}]
                    </span>
                    <span class="truncate">{{
                      schoolMap.get(prog.schoolId)?.name.th
                    }}</span>
                  </span>
                  <span v-else class="text-xs text-muted">
                    {{ prog.schoolId }}
                  </span>
                </td>
                <td class="text-center">
                  <UBadge
                    :color="prog.status === 'active' ? 'success' : 'neutral'"
                    :label="prog.status === 'active' ? 'ใช้งาน' : 'เก็บถาวร'"
                    size="sm"
                    variant="subtle"
                  />
                </td>
                <td v-if="canManage" class="text-right">
                  <div class="flex items-center justify-end">
                    <UDropdownMenu
                      :items="[
                        [
                          {
                            label: 'แก้ไขหลักสูตร',
                            icon: 'i-lucide-pencil',
                            onSelect: () => openEditProgramModal(prog)
                          }
                        ]
                      ]"
                      :content="{ align: 'end' }"
                    >
                      <UButton
                        aria-label="การจัดการหลักสูตร"
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
          v-model:page="programPage"
          v-model:page-size="programPageSize"
          :total="filteredPrograms.length"
          items-name="หลักสูตร"
        />
      </UCard>
    </div>

    <!-- ================================================================= -->
    <!-- TAB 3: รายวิชา (Courses)                                          -->
    <!-- ================================================================= -->
    <div v-if="activeTab === 'courses'" class="space-y-4">
      <!-- Standardized Modern Multi-Filter Card: Courses -->
      <div
        class="rounded-xl border border-default bg-default p-4 shadow-sm space-y-3"
      >
        <div class="flex flex-col gap-3 md:flex-row md:items-center">
          <div class="relative flex-1">
            <UInput
              v-model="courseSearch"
              class="w-full"
              icon="i-lucide-search"
              placeholder="ค้นหารหัส หรือชื่อรายวิชา (ไทย / English)..."
              size="md"
            >
              <template #trailing>
                <button
                  v-if="courseSearch"
                  type="button"
                  class="text-muted hover:text-highlighted cursor-pointer p-0.5"
                  title="ล้างคำค้นหา"
                  @click="courseSearch = ''"
                >
                  <UIcon name="i-lucide-x" class="size-4" />
                </button>
              </template>
            </UInput>
          </div>

          <div class="flex items-center gap-2">
            <label
              for="course-status-filter"
              class="text-xs font-semibold text-muted whitespace-nowrap"
              >สถานะ:</label
            >
            <select
              id="course-status-filter"
              v-model="courseStatusFilter"
              class="rounded-lg border border-default bg-default px-3 py-2 text-xs text-highlighted focus:outline-none focus:ring-1 focus:ring-primary font-medium"
            >
              <option value="all">ทุกสถานะ</option>
              <option value="active">ใช้งาน (Active)</option>
            </select>
          </div>
        </div>

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
                filteredCourses.length
              }}</span>
              รายวิชา
            </span>
            <span
              v-if="(coursesData?.items.length ?? 0) > filteredCourses.length"
              class="text-muted"
            >
              (จากทั้งหมด {{ coursesData?.items.length ?? 0 }} รายวิชา)
            </span>
          </div>

          <button
            v-if="hasActiveCourseFilters"
            type="button"
            class="inline-flex items-center gap-1 font-medium text-primary hover:underline cursor-pointer"
            @click="resetCourseFilters"
          >
            <UIcon name="i-lucide-rotate-ccw" class="size-3.5" />
            <span>ล้างตัวกรองทั้งหมด</span>
          </button>
        </div>
      </div>

      <!-- Courses Table -->
      <UCard :ui="{ body: 'p-0' }">
        <div class="overflow-x-auto">
          <table class="data-table">
            <thead>
              <tr>
                <th>ชื่อวิชา (ภาษาไทย)</th>
                <th>ชื่อวิชา (ภาษาอังกฤษ)</th>
                <th class="w-28 text-center">สถานะ</th>
                <th v-if="canManage" class="w-20 text-right">การจัดการ</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="course in paginatedCourses" :key="course.id">
                <td class="font-medium text-highlighted">
                  {{ course.name.th }}
                </td>
                <td class="text-sm text-muted">
                  {{ course.name.en }}
                </td>
                <td class="text-center">
                  <UBadge
                    :color="course.status === 'active' ? 'success' : 'neutral'"
                    :label="course.status === 'active' ? 'ใช้งาน' : 'เก็บถาวร'"
                    size="sm"
                    variant="subtle"
                  />
                </td>
                <td v-if="canManage" class="text-right">
                  <div class="flex items-center justify-end">
                    <UDropdownMenu
                      :items="[
                        [
                          {
                            label: 'แก้ไขรายวิชา',
                            icon: 'i-lucide-pencil',
                            onSelect: () => openEditCourseModal(course)
                          }
                        ]
                      ]"
                      :content="{ align: 'end' }"
                    >
                      <UButton
                        aria-label="การจัดการรายวิชา"
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

              <tr v-if="!coursesPending && !filteredCourses.length">
                <td
                  class="py-12 text-center text-muted"
                  :colspan="canManage ? 4 : 3"
                >
                  <UIcon
                    name="i-lucide-book-open"
                    class="mx-auto mb-2 size-8 text-muted"
                  />
                  <p class="font-medium">ไม่พบข้อมูลรายวิชา</p>
                  <p class="text-xs text-muted">
                    คลิกปุ่ม &quot;เพิ่มรายวิชา&quot;
                    ด้านบนเพื่อเพิ่มรายวิชาใหม่
                  </p>
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        <AppPagination
          v-model:page="coursePage"
          v-model:page-size="coursePageSize"
          :total="filteredCourses.length"
          items-name="รายวิชา"
        />
      </UCard>
    </div>

    <!-- ================================================================= -->
    <!-- TAB 4: โครงสร้างรอบภาคการศึกษา (Academic Term Structure)             -->
    <!-- ================================================================= -->
    <div v-if="activeTab === 'terms'" class="space-y-8">
      <!-- SECTION 1: โครงสร้างรอบภาคการศึกษาประจำปี (Master Term Structure) -->
      <div class="space-y-4">
        <!-- Header Card with quick actions -->
        <div
          class="rounded-2xl border border-primary/25 bg-gradient-to-br from-primary/5 via-transparent to-primary/10 p-6 shadow-sm"
        >
          <div
            class="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4"
          >
            <div class="flex items-start gap-3.5">
              <span
                class="grid size-12 place-items-center rounded-2xl bg-primary/15 text-primary shrink-0 ring-1 ring-primary/25"
              >
                <UIcon name="i-lucide-calendar-range" class="size-6" />
              </span>
              <div>
                <div class="flex items-center gap-2 flex-wrap">
                  <h2 class="text-xl font-bold text-highlighted tracking-tight">
                    โครงสร้างรอบภาคการศึกษาประจำปี (Academic Term Structure)
                  </h2>
                  <UBadge
                    color="primary"
                    :label="`ตั้งค่าไว้ ${masterTermStructure.length} ภาคการศึกษา`"
                    size="sm"
                    variant="subtle"
                  />
                </div>
                <p class="mt-1 text-sm text-muted max-w-3xl leading-relaxed">
                  กำหนดรอบภาคการศึกษามาตรฐานที่ใช้ในทุกปีการศึกษา (ค่าเริ่มต้น:
                  เทอม 1, เทอม 2 และเทอม 3 ภาคฤดูร้อน)
                  โดยไม่ต้องสร้างข้อมูลปีการศึกษาซ้ำซ้อนในแต่ละปี
                  และสามารถเพิ่มรอบภาคเรียนที่ 4 หรือ 5
                  ได้ตามเงื่อนไขของหลักสูตร
                </p>
                <p
                  class="mt-2 text-xs font-medium text-warning-700 dark:text-warning-300"
                >
                  การ์ดด้านล่างเป็นแม่แบบแสดงผลที่เก็บเฉพาะในเบราว์เซอร์นี้
                  ไม่ได้สร้างหรือแก้ภาคการศึกษาจริงในระบบ
                  ให้จัดการข้อมูลที่ใช้กับนักศึกษาในรายการภาคการศึกษาจริงด้านล่าง
                </p>
              </div>
            </div>

            <div
              v-if="canManage"
              class="flex items-center gap-2.5 shrink-0 self-end lg:self-center"
            >
              <UButton
                v-if="masterTermStructure.length !== 3"
                color="neutral"
                icon="i-lucide-rotate-ccw"
                label="รีเซ็ตเป็น 3 เทอมมาตรฐาน"
                size="sm"
                variant="outline"
                @click="handleResetSlotsToDefault"
              />
              <UButton
                color="primary"
                icon="i-lucide-plus"
                label="เพิ่มรอบภาคการศึกษา"
                size="md"
                @click="openCreateSlotModal"
              />
            </div>
          </div>
        </div>

        <!-- Master Term Cards Grid -->
        <div class="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
          <div
            v-for="slot in masterTermStructure"
            :key="slot.id"
            class="rounded-2xl border p-5 transition-all relative flex flex-col justify-between shadow-sm hover:shadow-md"
            :class="[
              slot.type === 'summer'
                ? 'border-amber-500/30 bg-amber-500/[0.03] dark:bg-amber-500/[0.06]'
                : slot.type === 'special'
                  ? 'border-purple-500/30 bg-purple-500/[0.03] dark:bg-purple-500/[0.06]'
                  : slot.termNumber === 1
                    ? 'border-sky-500/30 bg-sky-500/[0.03] dark:bg-sky-500/[0.06]'
                    : 'border-emerald-500/30 bg-emerald-500/[0.03] dark:bg-emerald-500/[0.06]'
            ]"
          >
            <div>
              <!-- Top Row: Slot Number Badge & Type Badge -->
              <div
                class="flex items-center justify-between gap-2 pb-3 border-b border-default"
              >
                <span
                  class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-bold font-mono tracking-wide"
                  :class="[
                    slot.type === 'summer'
                      ? 'bg-amber-500/20 text-amber-700 dark:text-amber-300'
                      : slot.type === 'special'
                        ? 'bg-purple-500/20 text-purple-700 dark:text-purple-300'
                        : slot.termNumber === 1
                          ? 'bg-sky-500/20 text-sky-700 dark:text-sky-300'
                          : 'bg-emerald-500/20 text-emerald-700 dark:text-emerald-300'
                  ]"
                >
                  <UIcon name="i-lucide-clock-4" class="size-3.5" />
                  <span>รอบที่ {{ slot.termNumber }}</span>
                </span>

                <UBadge
                  :color="
                    slot.type === 'summer'
                      ? 'warning'
                      : slot.type === 'special'
                        ? 'neutral'
                        : 'primary'
                  "
                  :label="
                    slot.type === 'summer'
                      ? 'ภาคฤดูร้อน (Summer)'
                      : slot.type === 'special'
                        ? 'ภาคพิเศษ (Special)'
                        : 'ภาคปกติ (Regular)'
                  "
                  size="xs"
                  variant="subtle"
                />
              </div>

              <!-- Term Title & Details -->
              <div class="mt-3.5 space-y-2">
                <h3
                  class="text-base font-bold text-highlighted flex items-center gap-2"
                >
                  <span>{{ slot.nameTh }}</span>
                </h3>
                <p class="text-xs text-muted font-medium">
                  {{ slot.nameEn }}
                </p>

                <div
                  class="mt-3 pt-3 border-t border-default/60 space-y-2 text-xs"
                >
                  <div class="flex items-center gap-2 text-muted">
                    <UIcon
                      name="i-lucide-calendar"
                      class="size-4 text-primary shrink-0"
                    />
                    <span
                      >ช่วงเวลามาตรฐาน:
                      <strong class="text-highlighted">{{
                        slot.monthsRangeTh
                      }}</strong></span
                    >
                  </div>

                  <div class="flex items-center gap-2 text-muted">
                    <UIcon
                      name="i-lucide-tag"
                      class="size-4 text-primary shrink-0"
                    />
                    <span
                      >รหัสต่อท้าย:
                      <code
                        class="px-1.5 py-0.5 rounded bg-muted/30 font-mono text-highlighted"
                        >-{{ slot.codeSuffix }}</code
                      >
                      (เช่น ปี-{{ slot.codeSuffix }})</span
                    >
                  </div>

                  <div class="flex items-start gap-2 text-muted mt-1">
                    <UIcon
                      name="i-lucide-info"
                      class="size-4 text-muted shrink-0 mt-0.5"
                    />
                    <span class="leading-relaxed">{{ slot.description }}</span>
                  </div>
                </div>
              </div>
            </div>

            <!-- Footer: Status & Actions -->
            <div
              class="mt-5 pt-3.5 border-t border-default flex items-center justify-between gap-2"
            >
              <span
                class="inline-flex items-center gap-1.5 text-xs font-semibold"
                :class="
                  slot.isActive
                    ? 'text-emerald-600 dark:text-emerald-400'
                    : 'text-muted'
                "
              >
                <span
                  class="size-2 rounded-full"
                  :class="
                    slot.isActive ? 'bg-emerald-500 animate-pulse' : 'bg-muted'
                  "
                />
                {{
                  slot.isActive ? 'เปิดใช้งานในโครงสร้าง' : 'ปิดใช้งานชั่วคราว'
                }}
              </span>

              <div v-if="canManage" class="flex items-center gap-1">
                <UButton
                  color="neutral"
                  icon="i-lucide-pencil"
                  size="xs"
                  variant="ghost"
                  title="แก้ไขรายละเอียดรอบภาคการศึกษานี้"
                  @click="openEditSlotModal(slot)"
                />
                <UButton
                  v-if="masterTermStructure.length > 3"
                  color="error"
                  icon="i-lucide-trash-2"
                  size="xs"
                  variant="ghost"
                  title="ลบรอบภาคการศึกษานี้"
                  @click="handleDeleteSlot(slot.id)"
                />
              </div>
            </div>
          </div>
        </div>

        <section
          class="rounded-2xl border border-default bg-default p-5 shadow-sm"
        >
          <div class="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 class="text-lg font-bold text-highlighted">
                ภาคการศึกษาที่ใช้งานจริง
              </h2>
              <p class="mt-1 text-sm text-muted">
                ข้อมูลจากระบบ ใช้ผูกนักศึกษา รอบฝึกงาน และรายงาน
              </p>
            </div>
          </div>

          <div
            v-if="termsPending"
            class="py-8 text-center text-sm text-muted"
            role="status"
          >
            กำลังโหลดข้อมูลภาคการศึกษา…
          </div>
          <div
            v-else-if="termsError"
            class="mt-4 rounded-xl border border-error/30 bg-error/5 p-4 text-sm text-error"
            role="alert"
          >
            โหลดข้อมูลภาคการศึกษาไม่สำเร็จ
            <UButton
              color="error"
              label="ลองอีกครั้ง"
              size="xs"
              variant="ghost"
              @click="refreshTerms()"
            />
          </div>
          <div v-else-if="termsData?.items.length" class="mt-4 overflow-x-auto">
            <table class="w-full min-w-[720px] text-left text-sm">
              <thead class="border-b border-default text-xs text-muted">
                <tr>
                  <th class="px-3 py-2 font-medium">รหัส / ปีการศึกษา</th>
                  <th class="px-3 py-2 font-medium">ภาคเรียน</th>
                  <th class="px-3 py-2 font-medium">ช่วงวันที่</th>
                  <th class="px-3 py-2 font-medium">สถานะ</th>
                  <th class="px-3 py-2 text-right font-medium">จัดการ</th>
                </tr>
              </thead>
              <tbody>
                <tr
                  v-for="term in termsData.items"
                  :key="term.id"
                  class="border-b border-default/70 last:border-0"
                >
                  <td class="px-3 py-3">
                    <div class="font-mono font-semibold text-highlighted">
                      {{ term.code }}
                    </div>
                    <div class="text-xs text-muted">
                      ปี {{ term.academicYear }}
                    </div>
                  </td>
                  <td class="px-3 py-3">ภาค {{ term.semester }}</td>
                  <td class="px-3 py-3 text-muted">
                    {{ new Date(term.startsAt).toLocaleDateString('th-TH') }}
                    –
                    {{ new Date(term.endsAt).toLocaleDateString('th-TH') }}
                  </td>
                  <td class="px-3 py-3">
                    <UBadge
                      :color="
                        term.status === 'open'
                          ? 'success'
                          : term.status === 'planned'
                            ? 'warning'
                            : 'neutral'
                      "
                      :label="
                        term.status === 'open'
                          ? 'เปิด'
                          : term.status === 'planned'
                            ? 'ตามแผน'
                            : 'ปิด'
                      "
                      variant="subtle"
                    />
                  </td>
                  <td class="px-3 py-3">
                    <div v-if="canManage" class="flex justify-end gap-1">
                      <UButton
                        color="neutral"
                        icon="i-lucide-pencil"
                        size="xs"
                        title="แก้ไขภาคการศึกษา"
                        variant="ghost"
                        @click="openEditTermModal(term)"
                      />
                      <UButton
                        :color="term.status === 'open' ? 'warning' : 'success'"
                        :icon="
                          term.status === 'open'
                            ? 'i-lucide-lock-keyhole'
                            : 'i-lucide-lock-keyhole-open'
                        "
                        :label="term.status === 'open' ? 'ปิด' : 'เปิด'"
                        size="xs"
                        variant="ghost"
                        @click="handleToggleTermStatus(term)"
                      />
                    </div>
                  </td>
                </tr>
              </tbody>
            </table>
            <div
              class="mt-3 flex items-center justify-between text-xs text-muted"
            >
              <span>{{ termsData.meta.total }} ภาคการศึกษา</span>
              <div class="flex items-center gap-2">
                <UButton
                  color="neutral"
                  label="ก่อนหน้า"
                  size="xs"
                  variant="outline"
                  :disabled="termPage <= 1"
                  @click="termPage -= 1"
                />
                <span>หน้า {{ termPage }}</span>
                <UButton
                  color="neutral"
                  label="ถัดไป"
                  size="xs"
                  variant="outline"
                  :disabled="termPage * 50 >= termsData.meta.total"
                  @click="termPage += 1"
                />
              </div>
            </div>
          </div>
          <p v-else class="py-8 text-center text-sm text-muted">
            ยังไม่มีภาคการศึกษาที่บันทึกในระบบ
          </p>
        </section>
      </div>
    </div>

    <!-- MODAL: สร้าง/แก้ไข สำนักวิชา -->
    <div
      v-if="isSchoolModalOpen"
      class="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
    >
      <div
        class="w-full max-w-lg rounded-xl border border-default bg-default p-6 shadow-xl"
      >
        <div
          class="flex items-center justify-between border-b border-default pb-4"
        >
          <h2 class="text-lg font-bold text-highlighted">
            {{
              editingSchoolId ? 'แก้ไขข้อมูลสำนักวิชา' : 'เพิ่มสำนักวิชาใหม่'
            }}
          </h2>
          <UButton
            color="neutral"
            icon="i-lucide-x"
            size="xs"
            variant="ghost"
            @click="isSchoolModalOpen = false"
          />
        </div>

        <form class="mt-4 space-y-4" @submit.prevent="handleSaveSchool">
          <div>
            <label class="block text-sm font-medium text-highlighted">
              รหัสสำนักวิชา (School Code) <span class="text-error">*</span>
            </label>
            <input
              v-model="schoolForm.schoolCode"
              type="text"
              placeholder="เช่น IT, LIB, NUR, MGT"
              class="mt-1.5 h-11 w-full rounded-lg border border-default bg-default px-3.5 font-mono text-sm uppercase text-highlighted focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/10"
              :class="{ 'border-error': schoolFormErrors.schoolCode }"
            />
            <p
              v-if="schoolFormErrors.schoolCode"
              class="mt-1 text-xs text-error"
            >
              {{ schoolFormErrors.schoolCode }}
            </p>
          </div>

          <div>
            <label class="block text-sm font-medium text-highlighted">
              ชื่อสำนักวิชาภาษาไทย <span class="text-error">*</span>
            </label>
            <input
              v-model="schoolForm.nameTh"
              type="text"
              placeholder="เช่น สำนักวิชาเทคโนโลยีสารสนเทศ"
              class="mt-1.5 h-11 w-full rounded-lg border border-default bg-default px-3.5 text-sm text-highlighted focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/10"
              :class="{ 'border-error': schoolFormErrors.nameTh }"
            />
            <p v-if="schoolFormErrors.nameTh" class="mt-1 text-xs text-error">
              {{ schoolFormErrors.nameTh }}
            </p>
          </div>

          <div>
            <label class="block text-sm font-medium text-highlighted">
              ชื่อสำนักวิชาภาษาอังกฤษ <span class="text-error">*</span>
            </label>
            <input
              v-model="schoolForm.nameEn"
              type="text"
              placeholder="เช่น School of Information Technology"
              class="mt-1.5 h-11 w-full rounded-lg border border-default bg-default px-3.5 text-sm text-highlighted focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/10"
              :class="{ 'border-error': schoolFormErrors.nameEn }"
            />
            <p v-if="schoolFormErrors.nameEn" class="mt-1 text-xs text-error">
              {{ schoolFormErrors.nameEn }}
            </p>
          </div>

          <div>
            <label class="block text-sm font-medium text-highlighted"
              >สถานะ</label
            >
            <select
              v-model="schoolForm.status"
              class="mt-1.5 h-11 w-full rounded-lg border border-default bg-default px-3.5 text-sm text-highlighted focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/10"
            >
              <option value="active">เปิดใช้งาน (Active)</option>
            </select>
          </div>

          <div class="flex justify-end gap-2 border-t border-default pt-4">
            <UButton
              color="neutral"
              label="ยกเลิก"
              variant="outline"
              @click="isSchoolModalOpen = false"
            />
            <UButton
              color="primary"
              :label="editingSchoolId ? 'บันทึกการแก้ไข' : 'สร้างสำนักวิชา'"
              :loading="modalSaving"
              type="submit"
            />
          </div>
        </form>
      </div>
    </div>

    <!-- MODAL: สร้าง/แก้ไข หลักสูตร -->
    <div
      v-if="isProgramModalOpen"
      class="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
    >
      <div
        class="w-full max-w-lg rounded-xl border border-default bg-default p-6 shadow-xl"
      >
        <div
          class="flex items-center justify-between border-b border-default pb-4"
        >
          <h2 class="text-lg font-bold text-highlighted">
            {{ editingProgramId ? 'แก้ไขข้อมูลหลักสูตร' : 'เพิ่มหลักสูตรใหม่' }}
          </h2>
          <UButton
            color="neutral"
            icon="i-lucide-x"
            size="xs"
            variant="ghost"
            @click="isProgramModalOpen = false"
          />
        </div>

        <form class="mt-4 space-y-4" @submit.prevent="handleSaveProgram">
          <div>
            <label class="block text-sm font-medium text-highlighted">
              สำนักวิชาสังกัด <span class="text-error">*</span>
            </label>
            <select
              v-model="programForm.schoolId"
              class="mt-1.5 h-11 w-full rounded-lg border border-default bg-default px-3.5 text-sm text-highlighted focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/10"
              :class="{ 'border-error': programFormErrors.schoolId }"
            >
              <option value="" disabled>-- เลือกสำนักวิชา --</option>
              <option
                v-for="school in schoolsData?.items"
                :key="school.id"
                :value="school.id"
              >
                [{{ school.schoolCode }}] {{ school.name.th }}
              </option>
            </select>
            <p
              v-if="programFormErrors.schoolId"
              class="mt-1 text-xs text-error"
            >
              {{ programFormErrors.schoolId }}
            </p>
          </div>

          <div>
            <label class="block text-sm font-medium text-highlighted">
              รหัสหลักสูตร (Program Code) <span class="text-error">*</span>
            </label>
            <input
              v-model="programForm.programCode"
              type="text"
              placeholder="เช่น SE, CS, IT, LAW"
              class="mt-1.5 h-11 w-full rounded-lg border border-default bg-default px-3.5 font-mono text-sm uppercase text-highlighted focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/10"
              :class="{ 'border-error': programFormErrors.programCode }"
            />
            <p
              v-if="programFormErrors.programCode"
              class="mt-1 text-xs text-error"
            >
              {{ programFormErrors.programCode }}
            </p>
          </div>

          <div>
            <label class="block text-sm font-medium text-highlighted">
              ชื่อหลักสูตรภาษาไทย <span class="text-error">*</span>
            </label>
            <input
              v-model="programForm.nameTh"
              type="text"
              placeholder="เช่น วิศวกรรมซอฟต์แวร์"
              class="mt-1.5 h-11 w-full rounded-lg border border-default bg-default px-3.5 text-sm text-highlighted focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/10"
              :class="{ 'border-error': programFormErrors.nameTh }"
            />
            <p v-if="programFormErrors.nameTh" class="mt-1 text-xs text-error">
              {{ programFormErrors.nameTh }}
            </p>
          </div>

          <div>
            <label class="block text-sm font-medium text-highlighted">
              ชื่อหลักสูตรภาษาอังกฤษ <span class="text-error">*</span>
            </label>
            <input
              v-model="programForm.nameEn"
              type="text"
              placeholder="เช่น Software Engineering"
              class="mt-1.5 h-11 w-full rounded-lg border border-default bg-default px-3.5 text-sm text-highlighted focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/10"
              :class="{ 'border-error': programFormErrors.nameEn }"
            />
            <p v-if="programFormErrors.nameEn" class="mt-1 text-xs text-error">
              {{ programFormErrors.nameEn }}
            </p>
          </div>

          <div>
            <label class="block text-sm font-medium text-highlighted"
              >สถานะ</label
            >
            <select
              v-model="programForm.status"
              class="mt-1.5 h-11 w-full rounded-lg border border-default bg-default px-3.5 text-sm text-highlighted focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/10"
            >
              <option value="active">เปิดใช้งาน (Active)</option>
            </select>
          </div>

          <div class="flex justify-end gap-2 border-t border-default pt-4">
            <UButton
              color="neutral"
              label="ยกเลิก"
              variant="outline"
              @click="isProgramModalOpen = false"
            />
            <UButton
              color="primary"
              :label="editingProgramId ? 'บันทึกการแก้ไข' : 'สร้างหลักสูตร'"
              :loading="modalSaving"
              type="submit"
            />
          </div>
        </form>
      </div>
    </div>

    <!-- MODAL: สร้าง/แก้ไข รายวิชา -->
    <div
      v-if="isCourseModalOpen"
      class="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
    >
      <div
        class="w-full max-w-lg rounded-xl border border-default bg-default p-6 shadow-xl"
      >
        <div
          class="flex items-center justify-between border-b border-default pb-4"
        >
          <h2 class="text-lg font-bold text-highlighted">
            {{ editingCourseId ? 'แก้ไขข้อมูลรายวิชา' : 'เพิ่มรายวิชาใหม่' }}
          </h2>
          <UButton
            color="neutral"
            icon="i-lucide-x"
            size="xs"
            variant="ghost"
            @click="isCourseModalOpen = false"
          />
        </div>

        <form class="mt-4 space-y-4" @submit.prevent="handleSaveCourse">
          <div>
            <label class="block text-sm font-medium text-highlighted">
              ชื่อวิชาภาษาไทย <span class="text-error">*</span>
            </label>
            <input
              v-model="courseForm.nameTh"
              type="text"
              placeholder="เช่น ประสบการณ์วิชาชีพ, การฝึกงานวิชาชีพวิศวกรรมซอฟต์แวร์"
              class="mt-1.5 h-11 w-full rounded-lg border border-default bg-default px-3.5 text-sm text-highlighted focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/10"
              :class="{ 'border-error': courseFormErrors.nameTh }"
            />
            <p v-if="courseFormErrors.nameTh" class="mt-1 text-xs text-error">
              {{ courseFormErrors.nameTh }}
            </p>
          </div>

          <div>
            <label class="block text-sm font-medium text-highlighted">
              ชื่อวิชาภาษาอังกฤษ <span class="text-error">*</span>
            </label>
            <input
              v-model="courseForm.nameEn"
              type="text"
              placeholder="เช่น Professional Experience, Software Engineering Internship"
              class="mt-1.5 h-11 w-full rounded-lg border border-default bg-default px-3.5 text-sm text-highlighted focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/10"
              :class="{ 'border-error': courseFormErrors.nameEn }"
            />
            <p v-if="courseFormErrors.nameEn" class="mt-1 text-xs text-error">
              {{ courseFormErrors.nameEn }}
            </p>
          </div>

          <div>
            <label class="block text-sm font-medium text-highlighted">
              สถานะ
            </label>
            <select
              v-model="courseForm.status"
              class="mt-1.5 h-11 w-full rounded-lg border border-default bg-default px-3.5 text-sm text-highlighted focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/10"
            >
              <option value="active">เปิดใช้งาน (Active)</option>
            </select>
          </div>

          <div class="flex justify-end gap-2 border-t border-default pt-4">
            <UButton
              color="neutral"
              label="ยกเลิก"
              variant="outline"
              @click="isCourseModalOpen = false"
            />
            <UButton
              color="primary"
              :label="editingCourseId ? 'บันทึกการแก้ไข' : 'สร้างรายวิชา'"
              :loading="modalSaving"
              type="submit"
            />
          </div>
        </form>
      </div>
    </div>

    <!-- MODAL: สร้าง/แก้ไข ภาคการศึกษา -->
    <div
      v-if="isTermModalOpen"
      class="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
    >
      <div
        class="w-full max-w-lg rounded-xl border border-default bg-default p-6 shadow-xl"
      >
        <div
          class="flex items-center justify-between border-b border-default pb-4"
        >
          <h2 class="text-lg font-bold text-highlighted">
            {{
              editingTermId ? 'แก้ไขข้อมูลภาคการศึกษา' : 'เพิ่มภาคการศึกษาใหม่'
            }}
          </h2>
          <UButton
            color="neutral"
            icon="i-lucide-x"
            size="xs"
            variant="ghost"
            @click="isTermModalOpen = false"
          />
        </div>

        <form class="mt-4 space-y-4" @submit.prevent="handleSaveTerm">
          <div class="grid grid-cols-2 gap-4">
            <div>
              <label class="block text-sm font-medium text-highlighted">
                ปีการศึกษา (Academic Year) <span class="text-error">*</span>
              </label>
              <input
                v-model.number="termForm.academicYear"
                type="number"
                min="2000"
                class="mt-1.5 h-11 w-full rounded-lg border border-default bg-default px-3.5 font-mono text-sm text-highlighted focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/10"
                required
                @change="
                  () => {
                    if (!editingTermId) {
                      termForm.code = `${termForm.academicYear}-${termForm.semester === '3' ? 'S' : termForm.semester}`
                    }
                  }
                "
              />
            </div>

            <div>
              <label class="block text-sm font-medium text-highlighted">
                ภาคการศึกษา (เทอม) <span class="text-error">*</span>
              </label>
              <select
                v-model="termForm.semester"
                class="mt-1.5 h-11 w-full rounded-lg border border-default bg-default px-3.5 text-sm text-highlighted focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/10"
                @change="
                  () => {
                    if (!editingTermId) {
                      termForm.code = `${termForm.academicYear}-${termForm.semester === '3' ? 'S' : termForm.semester}`
                      if (termForm.semester === '1') {
                        termForm.startsAt = `${termForm.academicYear}-08-01`
                        termForm.endsAt = `${termForm.academicYear}-12-31`
                      } else if (termForm.semester === '2') {
                        termForm.startsAt = `${termForm.academicYear + 1}-01-01`
                        termForm.endsAt = `${termForm.academicYear + 1}-05-31`
                      } else {
                        termForm.startsAt = `${termForm.academicYear + 1}-06-01`
                        termForm.endsAt = `${termForm.academicYear + 1}-07-31`
                      }
                    }
                  }
                "
              >
                <option value="1">ภาคการศึกษาที่ 1 (เทอมหนึ่ง)</option>
                <option value="2">ภาคการศึกษาที่ 2 (เทอมสอง)</option>
                <option value="3">ภาคการศึกษาที่ 3 (เทอมสาม / ฤดูร้อน)</option>
              </select>
            </div>
          </div>

          <div>
            <label class="block text-sm font-medium text-highlighted">
              รหัสภาคการศึกษา (Term Code) <span class="text-error">*</span>
            </label>
            <input
              v-model="termForm.code"
              type="text"
              placeholder="เช่น 2026-1, 2026-2, 2026-S, 1/2566"
              class="mt-1.5 h-11 w-full rounded-lg border border-default bg-default px-3.5 font-mono text-sm text-highlighted focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/10"
              :class="{ 'border-error': termFormErrors.code }"
              required
            />
            <p v-if="termFormErrors.code" class="mt-1 text-xs text-error">
              {{ termFormErrors.code }}
            </p>
          </div>

          <div class="grid grid-cols-2 gap-4">
            <div>
              <label class="block text-sm font-medium text-highlighted">
                วันที่เริ่มต้น <span class="text-error">*</span>
              </label>
              <input
                v-model="termForm.startsAt"
                type="date"
                class="mt-1.5 h-11 w-full rounded-lg border border-default bg-default px-3 text-sm text-highlighted focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/10"
                required
              />
            </div>
            <div>
              <label class="block text-sm font-medium text-highlighted">
                วันที่สิ้นสุด <span class="text-error">*</span>
              </label>
              <input
                v-model="termForm.endsAt"
                type="date"
                class="mt-1.5 h-11 w-full rounded-lg border border-default bg-default px-3 text-sm text-highlighted focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/10"
                required
              />
            </div>
          </div>
          <p v-if="termFormErrors.dates" class="text-xs text-error">
            {{ termFormErrors.dates }}
          </p>

          <div>
            <label class="block text-sm font-medium text-highlighted">
              สถานะ
            </label>
            <select
              v-model="termForm.status"
              class="mt-1.5 h-11 w-full rounded-lg border border-default bg-default px-3.5 text-sm text-highlighted focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/10"
            >
              <option value="open">เปิดรับลงทะเบียน (Open)</option>
              <option value="planned">ตามแผนงาน (Planned)</option>
              <option value="closed">ปิดรับแล้ว (Closed)</option>
            </select>
          </div>

          <div class="flex justify-end gap-2 border-t border-default pt-4">
            <UButton
              color="neutral"
              label="ยกเลิก"
              variant="outline"
              @click="isTermModalOpen = false"
            />
            <UButton
              color="primary"
              :label="editingTermId ? 'บันทึกการแก้ไข' : 'สร้างภาคการศึกษา'"
              :loading="modalSaving"
              type="submit"
            />
          </div>
        </form>
      </div>
    </div>

    <!-- ================================================================= -->
    <!-- MODAL: เพิ่ม/แก้ไขรอบภาคการศึกษา (Master Term Slot)                 -->
    <!-- ================================================================= -->
    <div
      v-if="isSlotModalOpen"
      class="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"
      @click="isSlotModalOpen = false"
    >
      <div
        class="w-full max-w-lg rounded-2xl border border-default bg-default p-6 shadow-2xl space-y-5"
        @click.stop
      >
        <div
          class="flex items-center justify-between border-b border-default pb-4"
        >
          <div class="flex items-center gap-2.5">
            <span
              class="grid size-9 place-items-center rounded-lg bg-primary/10 text-primary"
            >
              <UIcon name="i-lucide-calendar-plus" class="size-5" />
            </span>
            <div>
              <h2 class="text-lg font-bold text-highlighted">
                {{
                  editingSlotId
                    ? 'แก้ไขรอบภาคการศึกษา'
                    : 'เพิ่มรอบภาคการศึกษาในรอบปี'
                }}
              </h2>
              <p class="text-xs text-muted">
                กำหนดรอบภาคการศึกษาที่ใช้เป็นมาตรฐานในทุกปีการศึกษา
              </p>
            </div>
          </div>
          <UButton
            color="neutral"
            icon="i-lucide-x"
            size="sm"
            variant="ghost"
            @click="isSlotModalOpen = false"
          />
        </div>

        <form class="space-y-4" @submit.prevent="handleSaveSlot">
          <div class="grid grid-cols-2 gap-4">
            <div>
              <label class="block text-xs font-semibold text-highlighted mb-1">
                ลำดับรอบที่ (Term Number) <span class="text-rose-500">*</span>
              </label>
              <input
                v-model.number="slotForm.termNumber"
                type="number"
                min="1"
                class="h-10 w-full rounded-lg border border-default bg-default px-3 font-mono text-sm text-highlighted focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
                required
              />
            </div>

            <div>
              <label class="block text-xs font-semibold text-highlighted mb-1">
                ประเภทภาคการศึกษา <span class="text-rose-500">*</span>
              </label>
              <select
                v-model="slotForm.type"
                class="h-10 w-full rounded-lg border border-default bg-default px-3 text-sm text-highlighted focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
              >
                <option value="regular">ภาคปกติ (Regular)</option>
                <option value="summer">ภาคฤดูร้อน (Summer)</option>
                <option value="special">ภาคพิเศษ / สหกิจ (Special)</option>
              </select>
            </div>
          </div>

          <div>
            <label class="block text-xs font-semibold text-highlighted mb-1">
              ชื่อภาคการศึกษา (ภาษาไทย) <span class="text-rose-500">*</span>
            </label>
            <input
              v-model="slotForm.nameTh"
              type="text"
              placeholder="เช่น ภาคการศึกษาที่ 4 (สหกิจศึกษา)"
              class="h-10 w-full rounded-lg border border-default bg-default px-3 text-sm text-highlighted focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
              required
            />
          </div>

          <div>
            <label class="block text-xs font-semibold text-highlighted mb-1">
              ชื่อภาคการศึกษา (ภาษาอังกฤษ)
            </label>
            <input
              v-model="slotForm.nameEn"
              type="text"
              placeholder="เช่น Fourth Semester (Co-operative Education)"
              class="h-10 w-full rounded-lg border border-default bg-default px-3 text-sm text-highlighted focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
            />
          </div>

          <div class="grid grid-cols-2 gap-4">
            <div>
              <label class="block text-xs font-semibold text-highlighted mb-1">
                รหัสย่อต่อท้าย (Code Suffix)
                <span class="text-rose-500">*</span>
              </label>
              <input
                v-model="slotForm.codeSuffix"
                type="text"
                placeholder="เช่น 4, S, SP"
                class="h-10 w-full rounded-lg border border-default bg-default px-3 font-mono text-sm uppercase text-highlighted focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
                required
              />
            </div>

            <div>
              <label class="block text-xs font-semibold text-highlighted mb-1">
                ช่วงเดือนมาตรฐาน
              </label>
              <input
                v-model="slotForm.monthsRangeTh"
                type="text"
                placeholder="เช่น กรกฎาคม – สิงหาคม"
                class="h-10 w-full rounded-lg border border-default bg-default px-3 text-sm text-highlighted focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
              />
            </div>
          </div>

          <div>
            <label class="block text-xs font-semibold text-highlighted mb-1">
              คำอธิบาย / เงื่อนไข
            </label>
            <textarea
              v-model="slotForm.description"
              rows="2"
              placeholder="เช่น สำหรับโครงการสหกิจศึกษาภาคปฏิบัติการพิเศษ"
              class="w-full rounded-lg border border-default bg-default p-2.5 text-xs text-highlighted focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
            />
          </div>

          <div class="flex items-center gap-2 pt-1">
            <input
              id="slot-is-active"
              v-model="slotForm.isActive"
              type="checkbox"
              class="size-4 rounded border-default text-primary focus:ring-primary"
            />
            <label
              for="slot-is-active"
              class="text-xs font-medium text-highlighted cursor-pointer"
            >
              เปิดใช้งานรอบนี้ในโครงสร้างหลัก
            </label>
          </div>

          <div class="flex justify-end gap-2 border-t border-default pt-4">
            <UButton
              color="neutral"
              label="ยกเลิก"
              variant="outline"
              @click="isSlotModalOpen = false"
            />
            <UButton
              color="primary"
              :label="editingSlotId ? 'บันทึกการแก้ไข' : 'เพิ่มรอบภาคการศึกษา'"
              type="submit"
            />
          </div>
        </form>
      </div>
    </div>
  </div>
</template>
