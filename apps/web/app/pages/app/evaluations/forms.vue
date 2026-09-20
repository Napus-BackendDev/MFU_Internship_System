<script setup lang="ts">
import { z } from 'zod'

definePageMeta({ layout: 'app', middleware: 'auth' })

interface LocalizedText {
  th: string
  en: string
}

interface School {
  id: string
  schoolCode: string
  name: LocalizedText
  status: 'active'
}

interface Program {
  id: string
  schoolId: string
  programCode: string
  name: LocalizedText
  status: 'active'
}

interface Question {
  id: string
  label: LocalizedText
  type: 'rating' | 'text' | 'boolean'
  required: boolean
  weight?: number
  scaleMin?: number
  scaleMax?: number
}

interface Section {
  id: string
  title: LocalizedText
  category: 'general' | 'special' | 'suggestion'
  schoolId?: string
  programId?: string
  questions: Question[]
}

interface CompetencySet {
  id: string
  code: string
  name: LocalizedText
  status: 'active'
  createdAt?: string
  updatedAt?: string
}

interface CompetencyVersion {
  id: string
  competencySetId: string
  versionNumber: number
  status: 'draft' | 'published' | 'retired'
  sections: Section[]
  publishedAt?: string
  createdAt?: string
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

// Main list state
const searchQuery = ref('')
const statusFilter = ref<'all' | 'active'>('all')
const selectedForm = ref<CompetencySet | null>(null)
const selectedVersion = ref<CompetencyVersion | null>(null)
const isEditorOpen = ref(false)
const isPreviewOpen = ref(false)
const saving = ref(false)
const publishing = ref(false)

// Fetch Competency Sets (Forms)
const {
  data: formsData,
  error: formsError,
  pending: formsPending,
  refresh: refreshForms
} = await useAsyncData('competency-sets-list', () =>
  api<PageResult<CompetencySet>>('/competency-sets', {
    query: { page: 1, pageSize: 50 }
  })
)

// Fetch Schools for Special Category targeting
const { data: schoolsData, error: _schoolsError } = await useAsyncData(
  'form-schools',
  () =>
    api<PageResult<School>>('/academic/schools', {
      query: { page: 1, pageSize: 100 }
    })
)

// Fetch Programs for Special Category targeting
const { data: programsData, error: _programsError } = await useAsyncData(
  'form-programs',
  () =>
    api<PageResult<Program>>('/academic/programs', {
      query: { page: 1, pageSize: 100 }
    })
)

// School lookup map
const schoolMap = computed(() => {
  const map = new Map<string, School>()
  for (const s of schoolsData.value?.items ?? []) {
    map.set(s.id, s)
  }
  return map
})

// Program lookup map
const programMap = computed(() => {
  const map = new Map<string, Program>()
  for (const p of programsData.value?.items ?? []) {
    map.set(p.id, p)
  }
  return map
})

// Filtered forms
const filteredForms = computed(() => {
  let list = formsData.value?.items ?? []
  if (statusFilter.value !== 'all') {
    list = list.filter((f) => f.status === statusFilter.value)
  }
  const q = searchQuery.value.trim().toLowerCase()
  if (q) {
    list = list.filter(
      (f) =>
        f.code.toLowerCase().includes(q) ||
        f.name.th.toLowerCase().includes(q) ||
        f.name.en.toLowerCase().includes(q)
    )
  }
  return list
})

const hasActiveFilters = computed(
  () => !!searchQuery.value.trim() || statusFilter.value !== 'all'
)

function resetFilters() {
  searchQuery.value = ''
  statusFilter.value = 'all'
  page.value = 1
}

// Pagination (Configurable: 5, 10, 15, 20 items per page)
const page = ref(1)
const pageSize = ref(5)
const paginatedForms = computed(() => {
  const start = (page.value - 1) * pageSize.value
  return filteredForms.value.slice(start, start + pageSize.value)
})

watch([searchQuery, statusFilter, pageSize], () => {
  page.value = 1
})

// Active Editor Form State
const editorForm = reactive({
  isNew: true,
  code: '',
  nameTh: '',
  nameEn: '',
  sections: [] as Section[]
})

// Preview simulator filter
const previewSelectedSchoolId = ref<string>('all')

// Validation schema for Form info
const formInfoSchema = z.object({
  code: z
    .string()
    .trim()
    .min(1, 'กรุณาระบุรหัสแบบฟอร์ม')
    .max(40, 'รหัสต้องไม่เกิน 40 ตัวอักษร'),
  nameTh: z.string().trim().min(1, 'กรุณาระบุชื่อแบบฟอร์มภาษาไทย'),
  nameEn: z.string().trim().min(1, 'กรุณาระบุชื่อแบบฟอร์มภาษาอังกฤษ')
})

// Open Create Form Modal / View
function openCreateForm() {
  editorForm.isNew = true
  editorForm.code = `EVAL-${new Date().getFullYear()}-${Math.floor(100 + Math.random() * 900)}`
  editorForm.nameTh = ''
  editorForm.nameEn = ''
  // Default with 1 General section and 1 Special section
  editorForm.sections = [
    {
      id: `sec_gen_${Date.now()}`,
      title: {
        th: 'หมวดทั่วไป: ทักษะและความประพฤติ (Soft Skills)',
        en: 'General Section: Soft Skills & Conduct'
      },
      category: 'general',
      questions: [
        {
          id: `q_gen_1`,
          label: {
            th: 'ความตรงต่อเวลาและการปฏิบัติตามกฎระเบียบ',
            en: 'Punctuality and Compliance with Regulations'
          },
          type: 'rating',
          required: true,
          weight: 1,
          scaleMin: 1,
          scaleMax: 5
        },
        {
          id: `q_gen_2`,
          label: {
            th: 'การทำงานร่วมกับผู้อื่นและการสื่อสาร',
            en: 'Teamwork and Communication'
          },
          type: 'rating',
          required: true,
          weight: 1,
          scaleMin: 1,
          scaleMax: 5
        }
      ]
    },
    {
      id: `sec_spec_${Date.now() + 1}`,
      title: {
        th: 'หมวดพิเศษ: ทักษะทางวิชาชีพเฉพาะทาง (Hard Skills)',
        en: 'Special Section: Professional Competencies'
      },
      category: 'special',
      schoolId: schoolsData.value?.items[0]?.id ?? '',
      questions: [
        {
          id: `q_spec_1`,
          label: {
            th: 'ความรู้ความสามารถทางวิชาการและทักษะเทคนิคในสายงาน',
            en: 'Technical and Academic Knowledge in Field'
          },
          type: 'rating',
          required: true,
          weight: 2,
          scaleMin: 1,
          scaleMax: 5
        }
      ]
    }
  ]
  selectedForm.value = null
  selectedVersion.value = null
  editorActiveTab.value = 'general'
  selectedSchoolHubId.value = schoolsData.value?.items[0]?.id ?? ''
  isEditorOpen.value = true
}

// Open Edit Form
async function openEditForm(form: CompetencySet) {
  editorForm.isNew = false
  editorForm.code = form.code
  editorForm.nameTh = form.name.th
  editorForm.nameEn = form.name.en
  selectedForm.value = form
  editorActiveTab.value = 'general'
  selectedSchoolHubId.value = schoolsData.value?.items[0]?.id ?? ''

  // Fetch latest version
  try {
    const versions = await api<CompetencyVersion[]>(
      `/competency-sets/${form.id}/versions`
    )
    const latest = versions?.[0]
    if (latest) {
      selectedVersion.value = latest
      editorForm.sections = JSON.parse(JSON.stringify(latest.sections || []))
    } else {
      selectedVersion.value = null
      editorForm.sections = []
    }
    ensureGeneralSection()
  } catch {
    selectedVersion.value = null
    editorForm.sections = []
    ensureGeneralSection()
  }

  isEditorOpen.value = true
}

function ensureGeneralSection() {
  if (
    !editorForm.sections.some(
      (s) => s.category === 'general' || (!s.category && !s.schoolId)
    )
  ) {
    editorForm.sections.unshift({
      id: `sec_gen_${Date.now()}`,
      title: {
        th: 'หมวดทั่วไป: ทักษะและความประพฤติ (Soft Skills)',
        en: 'General Section: Soft Skills & Conduct'
      },
      category: 'general',
      questions: [
        {
          id: `q_gen_1`,
          label: {
            th: 'ความตรงต่อเวลาและการปฏิบัติตามกฎระเบียบ',
            en: 'Punctuality and Compliance with Regulations'
          },
          type: 'rating',
          required: true,
          weight: 1,
          scaleMin: 1,
          scaleMax: 5
        },
        {
          id: `q_gen_2`,
          label: {
            th: 'การทำงานร่วมกับผู้อื่นและการสื่อสาร',
            en: 'Teamwork and Communication'
          },
          type: 'rating',
          required: true,
          weight: 1,
          scaleMin: 1,
          scaleMax: 5
        }
      ]
    })
  }
}

// Open Preview Modal
function openPreview(form?: CompetencySet, version?: CompetencyVersion) {
  if (form && version) {
    selectedForm.value = form
    selectedVersion.value = version
    editorForm.code = form.code
    editorForm.nameTh = form.name.th
    editorForm.nameEn = form.name.en
    editorForm.sections = JSON.parse(JSON.stringify(version.sections || []))
  }
  previewSelectedSchoolId.value = 'all'
  isPreviewOpen.value = true
}

// Section Management (Only for specialized and suggestion sections)
function addSection(category: 'special' | 'suggestion') {
  if (category === 'suggestion') {
    const newSec: Section = {
      id: `sec_${Date.now()}_${Math.floor(Math.random() * 1000)}`,
      title: {
        th: 'หมวดคำแนะนำและข้อเสนอแนะ (Suggestion)',
        en: 'Suggestions & Recommendations'
      },
      category: 'suggestion',
      questions: [
        {
          id: `q_${Date.now()}_1`,
          label: {
            th: 'จุดเด่นของนักศึกษา (Strengths)',
            en: 'Student Strengths'
          },
          type: 'text',
          required: false,
          weight: 0
        },
        {
          id: `q_${Date.now()}_2`,
          label: {
            th: 'สิ่งที่ควรพัฒนาหรือปรับปรุง (Areas for Improvement)',
            en: 'Areas for Improvement'
          },
          type: 'text',
          required: false,
          weight: 0
        },
        {
          id: `q_${Date.now()}_3`,
          label: {
            th: 'ข้อคิดเห็นและคำแนะนำเพิ่มเติมสำหรับนักศึกษา (Additional Comments & Suggestions)',
            en: 'Additional Comments & Suggestions'
          },
          type: 'text',
          required: false,
          weight: 0
        }
      ]
    }
    editorForm.sections.push(newSec)
    return
  }

  const newSec: Section = {
    id: `sec_${Date.now()}_${Math.floor(Math.random() * 1000)}`,
    title: {
      th: 'หมวดพิเศษเฉพาะสำนักวิชา',
      en: 'Special Section (Specific School)'
    },
    category: 'special',
    schoolId: schoolsData.value?.items[0]?.id ?? '',
    questions: [
      {
        id: `q_${Date.now()}_1`,
        label: {
          th: 'หัวข้อประเมินข้อที่ 1',
          en: 'Evaluation Criteria 1'
        },
        type: 'rating',
        required: true,
        weight: 1,
        scaleMin: 1,
        scaleMax: 5
      }
    ]
  }
  editorForm.sections.push(newSec)
}

function _removeSection(index: number) {
  editorForm.sections.splice(index, 1)
}

function _moveSection(index: number, direction: 'up' | 'down') {
  const target = direction === 'up' ? index - 1 : index + 1
  if (target < 0 || target >= editorForm.sections.length) return
  const currentItem = editorForm.sections[index]
  const targetItem = editorForm.sections[target]
  if (!currentItem || !targetItem) return
  editorForm.sections[index] = targetItem
  editorForm.sections[target] = currentItem
}

// Question Management
function addQuestion(section: Section) {
  const newQ: Question = {
    id: `q_${Date.now()}_${Math.floor(Math.random() * 1000)}`,
    label: {
      th: 'ระบุคำถามหรือเกณฑ์การประเมิน...',
      en: 'Enter evaluation criteria...'
    },
    type: 'rating',
    required: true,
    weight: 1,
    scaleMin: 1,
    scaleMax: 5
  }
  section.questions.push(newQ)
}

function removeQuestion(section: Section, index: number) {
  section.questions.splice(index, 1)
}

// Save Form (CompetencySet + CompetencyVersion)
async function handleSaveForm() {
  // Validate basic info
  const infoValidation = formInfoSchema.safeParse({
    code: editorForm.code,
    nameTh: editorForm.nameTh,
    nameEn: editorForm.nameEn
  })

  if (!infoValidation.success) {
    toast.add({
      title: 'ข้อมูลไม่ถูกต้อง',
      description: infoValidation.error.issues[0]?.message ?? 'กรุณากรอกข้อมูล',
      color: 'error'
    })
    return
  }

  // Validate sections
  if (editorForm.sections.length === 0) {
    toast.add({
      title: 'กรุณาเพิ่มหมวดคำถาม',
      description: 'แบบฟอร์มต้องมีหมวดคำถามอย่างน้อย 1 หมวด',
      color: 'error'
    })
    return
  }

  if (hasIncompleteSchools.value) {
    const first = incompleteSchools.value[0]
    if (first) {
      editorActiveTab.value = 'special'
      selectedSchoolHubId.value = first.schoolId
    }
    const missingDetails = incompleteSchools.value
      .map(
        (s) =>
          `• ${s.schoolName} (ขาด: ${s.missingPrograms.map((p) => `[${p.programCode}] ${p.name.th}`).join(', ')})`
      )
      .join('\n')
    toast.add({
      title: 'ไม่สามารถบันทึกได้: ยังกำหนดหลักสูตรไม่ครบ',
      description: `กรุณากำหนดให้ครบทุกหลักสูตร หรือเลือกเป็น "ทุกหลักสูตรในสำนักวิชา":\n${missingDetails}`,
      color: 'error'
    })
    return
  }

  for (const [i, sec] of editorForm.sections.entries()) {
    if (!sec.title.th.trim()) {
      toast.add({
        title: 'ชื่อหมวดคำถามไม่ถูกต้อง',
        description: `กรุณากรอกชื่อภาษาไทยสำหรับหมวดที่ ${i + 1}`,
        color: 'error'
      })
      return
    }
    if (sec.category === 'special' && !sec.schoolId) {
      toast.add({
        title: 'หมวดพิเศษต้องเลือกสำนักวิชา',
        description: `กรุณาเลือกสำนักวิชาสังกัดสำหรับหมวด "${sec.title.th}"`,
        color: 'error'
      })
      return
    }
    if (sec.questions.length === 0) {
      toast.add({
        title: 'หมวดคำถามว่างเปล่า',
        description: `หมวด "${sec.title.th}" ต้องมีข้อคำถามอย่างน้อย 1 ข้อ`,
        color: 'error'
      })
      return
    }
  }

  saving.value = true
  try {
    let formId = selectedForm.value?.id

    // 1. Create or ensure CompetencySet
    if (editorForm.isNew || !formId) {
      const createdSet = await api<CompetencySet>('/competency-sets', {
        method: 'POST',
        body: {
          code: editorForm.code.toUpperCase(),
          name: { th: editorForm.nameTh, en: editorForm.nameEn },
          status: 'active'
        }
      })
      formId = createdSet.id
    }

    // 2. Format sections payload
    const sectionsPayload = editorForm.sections.map((sec, sIdx) => ({
      id: sec.id || `sec_${sIdx + 1}`,
      title: { th: sec.title.th.trim(), en: sec.title.en.trim() },
      category: sec.category,
      schoolId: sec.category === 'special' ? sec.schoolId : undefined,
      programId: sec.category === 'special' ? sec.programId : undefined,
      questions: sec.questions.map((q, qIdx) => ({
        id: q.id || `q_${sIdx + 1}_${qIdx + 1}`,
        label: { th: q.label.th.trim(), en: q.label.en.trim() },
        type: q.type,
        required: q.required,
        weight: q.weight ?? 1,
        scaleMin: q.type === 'rating' ? (q.scaleMin ?? 1) : undefined,
        scaleMax: q.type === 'rating' ? (q.scaleMax ?? 5) : undefined
      }))
    }))

    // 3. Save Version
    if (selectedVersion.value && selectedVersion.value.status === 'draft') {
      // Update existing draft
      await api(`/competency-set-versions/${selectedVersion.value.id}`, {
        method: 'PATCH',
        body: { sections: sectionsPayload }
      })
    } else {
      // Create new draft version
      await api(`/competency-sets/${formId}/versions`, {
        method: 'POST',
        body: { sections: sectionsPayload }
      })
    }

    toast.add({
      title: 'บันทึกแบบฟอร์มสำเร็จ',
      description: `แบบฟอร์ม ${editorForm.nameTh} ถูกบันทึกเรียบร้อยแล้ว`,
      color: 'success'
    })

    isEditorOpen.value = false
    await refreshForms()
  } catch (err: unknown) {
    const errorMsg =
      err && typeof err === 'object' && 'message' in err
        ? String(err.message)
        : 'เกิดข้อผิดพลาดในการบันทึกแบบฟอร์ม'
    toast.add({
      title: 'บันทึกไม่สำเร็จ',
      description: errorMsg,
      color: 'error'
    })
  } finally {
    saving.value = false
  }
}

// Publish version
async function handlePublishVersion(versionId: string) {
  publishing.value = true
  try {
    await api(`/competency-set-versions/${versionId}/publish`, {
      method: 'POST'
    })
    toast.add({
      title: 'เผยแพร่แบบฟอร์มสำเร็จ',
      description: 'แบบฟอร์มนี้พร้อมใช้งานในรอบการประเมินแล้ว',
      color: 'success'
    })
    await refreshForms()
  } catch (err: unknown) {
    const errorMsg =
      err && typeof err === 'object' && 'message' in err
        ? String(err.message)
        : 'ไม่สามารถเผยแพร่แบบฟอร์มได้'
    toast.add({
      title: 'เผยแพร่ไม่สำเร็จ',
      description: errorMsg,
      color: 'error'
    })
  } finally {
    publishing.value = false
  }
}

// Filtered sections for preview based on selected school
const previewSections = computed(() => {
  return editorForm.sections.filter((sec) => {
    // General and suggestion sections are ALWAYS visible for everyone!
    if (sec.category === 'general' || sec.category === 'suggestion') return true

    // Special section is visible if 'all' is chosen OR if it matches the selected school
    if (previewSelectedSchoolId.value === 'all') return true
    return sec.schoolId === previewSelectedSchoolId.value
  })
})

// =========================================================================
// STEPPED TAB & SCHOOL HUB ARCHITECTURE (สำหรับหมวด 2 และการจัดการแบบเข้าใจง่าย)
// =========================================================================
const editorActiveTab = ref<'general' | 'special' | 'suggestion' | 'simulator'>(
  'general'
)
const selectedSchoolHubId = ref<string>('')
const schoolSearchQuery = ref<string>('')
const schoolStatusFilter = ref<'all' | 'configured' | 'unconfigured'>('all')

const isCopyModalOpen = ref(false)
const copySourceSchoolId = ref<string>('')

// Computed lists of sections separated by category
const generalSections = computed(() =>
  editorForm.sections.filter(
    (s) => s.category === 'general' || (!s.category && !s.schoolId)
  )
)

const generalSection = computed(() => generalSections.value[0])

const specialSections = computed(() =>
  editorForm.sections.filter((s) => s.category === 'special' || s.schoolId)
)

const suggestionSections = computed(() =>
  editorForm.sections.filter((s) => s.category === 'suggestion')
)

function getSchoolSection(schoolId: string): Section | undefined {
  return editorForm.sections.find(
    (s) => (s.category === 'special' || s.schoolId) && s.schoolId === schoolId
  )
}

function getSchoolSections(schoolId: string): Section[] {
  return editorForm.sections.filter(
    (s) => (s.category === 'special' || s.schoolId) && s.schoolId === schoolId
  )
}

function getSchoolPrograms(schoolId: string): Program[] {
  return (programsData.value?.items || []).filter(
    (p) => p.schoolId === schoolId
  )
}

function isSchoolAllProgramsMode(schoolId: string): boolean {
  const sections = getSchoolSections(schoolId)
  if (sections.length === 0) return false
  return sections.some((s) => !s.programId)
}

function getAssignedProgramIds(schoolId: string): Set<string> {
  const sections = getSchoolSections(schoolId)
  const ids = new Set<string>()
  for (const s of sections) {
    if (s.programId) {
      ids.add(s.programId)
    }
  }
  return ids
}

function getUnassignedPrograms(schoolId: string): Program[] {
  const allProgs = getSchoolPrograms(schoolId)
  const assigned = getAssignedProgramIds(schoolId)
  return allProgs.filter((p) => !assigned.has(p.id))
}

function canAddProgramToSchool(schoolId: string): boolean {
  const sections = getSchoolSections(schoolId)
  if (sections.length === 0) return false
  // "ถ้าเลือก ทุกหลักสูตรก็จะไม่สามารถ เพิ่ม หลักสูตร ได้"
  if (isSchoolAllProgramsMode(schoolId)) return false
  return getUnassignedPrograms(schoolId).length > 0
}

function isProgramAssignedToAnotherSection(
  programId: string,
  currentSectionId: string
): boolean {
  if (!currentHubSchool.value) return false
  const sections = getSchoolSections(currentHubSchool.value.id)
  return sections.some(
    (s) => s.id !== currentSectionId && s.programId === programId
  )
}

interface SchoolProgramStatus {
  schoolId: string
  schoolCode: string
  schoolName: string
  totalPrograms: number
  configuredProgramsCount: number
  isConfigured: boolean
  isAllProgramsMode: boolean
  isComplete: boolean
  missingPrograms: Program[]
}

function getSchoolProgramStatus(schoolId: string): SchoolProgramStatus {
  const school = schoolMap.value.get(schoolId)
  const programs = getSchoolPrograms(schoolId)
  const sections = getSchoolSections(schoolId)
  const isConfigured = getSchoolQuestionsCount(schoolId) > 0

  if (!isConfigured) {
    return {
      schoolId,
      schoolCode: school?.schoolCode || '',
      schoolName: school?.name.th || '',
      totalPrograms: programs.length,
      configuredProgramsCount: 0,
      isConfigured: false,
      isAllProgramsMode: false,
      isComplete: true,
      missingPrograms: []
    }
  }

  if (isSchoolAllProgramsMode(schoolId)) {
    return {
      schoolId,
      schoolCode: school?.schoolCode || '',
      schoolName: school?.name.th || '',
      totalPrograms: programs.length,
      configuredProgramsCount: programs.length,
      isConfigured: true,
      isAllProgramsMode: true,
      isComplete: true,
      missingPrograms: []
    }
  }

  const validAssigned = new Set(
    sections
      .filter((s) => s.programId && (s.questions?.length || 0) > 0)
      .map((s) => s.programId)
  )
  const missingPrograms = programs.filter((p) => !validAssigned.has(p.id))
  const isComplete = programs.length === 0 ? true : missingPrograms.length === 0

  return {
    schoolId,
    schoolCode: school?.schoolCode || '',
    schoolName: school?.name.th || '',
    totalPrograms: programs.length,
    configuredProgramsCount: validAssigned.size,
    isConfigured: true,
    isAllProgramsMode: false,
    isComplete,
    missingPrograms
  }
}

function getSchoolQuestionsCount(schoolId: string): number {
  return getSchoolSections(schoolId).reduce(
    (total, sec) => total + (sec.questions?.length || 0),
    0
  )
}

function isSchoolConfigured(schoolId: string): boolean {
  return getSchoolQuestionsCount(schoolId) > 0
}

const incompleteSchools = computed(() => {
  const list: SchoolProgramStatus[] = []
  for (const school of schoolsData.value?.items || []) {
    const status = getSchoolProgramStatus(school.id)
    if (!status.isComplete) {
      list.push(status)
    }
  }
  return list
})

const hasIncompleteSchools = computed(() => incompleteSchools.value.length > 0)

const currentHubSchoolStatus = computed(() => {
  if (!currentHubSchool.value) return null
  return getSchoolProgramStatus(currentHubSchool.value.id)
})

const unassignedProgramsForCurrentSchool = computed(() => {
  if (!currentHubSchool.value) return []
  return getUnassignedPrograms(currentHubSchool.value.id)
})

const configuredSchoolsCount = computed(() => {
  const configuredIds = new Set(
    editorForm.sections
      .filter(
        (s) =>
          (s.category === 'special' || s.schoolId) &&
          s.schoolId &&
          (s.questions?.length || 0) > 0
      )
      .map((s) => s.schoolId)
  )
  return configuredIds.size
})

const filteredSchools = computed(() => {
  let list = schoolsData.value?.items || []
  const q = schoolSearchQuery.value.trim().toLowerCase()
  if (q) {
    list = list.filter(
      (sc) =>
        sc.schoolCode.toLowerCase().includes(q) ||
        sc.name.th.toLowerCase().includes(q) ||
        sc.name.en.toLowerCase().includes(q)
    )
  }
  if (schoolStatusFilter.value === 'configured') {
    list = list.filter((sc) => isSchoolConfigured(sc.id))
  } else if (schoolStatusFilter.value === 'unconfigured') {
    list = list.filter((sc) => !isSchoolConfigured(sc.id))
  }
  return list
})

const currentHubSchool = computed(() =>
  (schoolsData.value?.items || []).find(
    (sc) => sc.id === selectedSchoolHubId.value
  )
)

const schoolsWithCriteria = computed(() =>
  (schoolsData.value?.items || []).filter(
    (sc) => isSchoolConfigured(sc.id) && sc.id !== selectedSchoolHubId.value
  )
)

// Presets by school code
interface PresetCriteria {
  readonly titleTh: string
  readonly titleEn: string
  readonly questions: Array<{
    readonly labelTh: string
    readonly labelEn: string
    readonly type: 'rating' | 'text' | 'boolean'
    readonly weight: number
  }>
}

const SCHOOL_PRESETS: Record<string, PresetCriteria> = {
  IT: {
    titleTh: 'ทักษะเฉพาะทางด้านเทคโนโลยีสารสนเทศและการพัฒนาซอฟต์แวร์',
    titleEn: 'IT & Software Engineering Competencies',
    questions: [
      {
        labelTh:
          'ทักษะการพัฒนาซอฟต์แวร์ การเขียนโปรแกรม และการออกแบบตรรกะระบบ (Software Development)',
        labelEn: 'Software Development, Coding & Logic Design Skills',
        type: 'rating',
        weight: 2
      },
      {
        labelTh:
          'การออกแบบ จัดการ และสืบค้นฐานข้อมูล (Database Management & Querying)',
        labelEn: 'Database Design, Management & Querying',
        type: 'rating',
        weight: 2
      },
      {
        labelTh:
          'การวิเคราะห์ปัญหา การค้นหาข้อผิดพลาด และการทดสอบระบบ (Debugging & Testing)',
        labelEn: 'System Analysis, Debugging & Testing',
        type: 'rating',
        weight: 1
      },
      {
        labelTh:
          'การปฏิบัติตามมาตรฐานความปลอดภัยของข้อมูลและระบบสารสนเทศ (Security Standards)',
        labelEn: 'Information Security Standards Compliance',
        type: 'rating',
        weight: 1
      }
    ]
  },
  LAW: {
    titleTh: 'ทักษะเฉพาะทางด้านนิติศาสตร์และการปฏิบัติงานทางกฎหมาย',
    titleEn: 'Legal Practice & Law Competencies',
    questions: [
      {
        labelTh:
          'การค้นคว้า รวบรวมข้อเท็จจริง และสืบค้นตัวบทกฎหมายและคำพิพากษา (Legal Research)',
        labelEn: 'Legal Research & Case Law Fact-Finding',
        type: 'rating',
        weight: 2
      },
      {
        labelTh:
          'ทักษะการร่างเอกสารทางกฎหมาย นิติกรรม และสัญญา (Legal Drafting)',
        labelEn: 'Legal Drafting, Contracts & Instruments',
        type: 'rating',
        weight: 2
      },
      {
        labelTh:
          'การคิดวิเคราะห์ ตีความ และปรับบทกฎหมายเข้ากับข้อเท็จจริง (Legal Reasoning)',
        labelEn: 'Legal Reasoning & Interpretation',
        type: 'rating',
        weight: 2
      },
      {
        labelTh:
          'การยึดมั่นในจรรยาบรรณวิชาชีพกฎหมายและความซื่อสัตย์สุจริต (Legal Ethics)',
        labelEn: 'Legal Professional Ethics & Integrity',
        type: 'rating',
        weight: 1
      }
    ]
  },
  MGT: {
    titleTh: 'ทักษะเฉพาะทางด้านการบริหารธุรกิจและการจัดการ',
    titleEn: 'Business Administration & Management Competencies',
    questions: [
      {
        labelTh:
          'การวิเคราะห์ข้อมูลทางธุรกิจ การเงิน และการวางแผนกลยุทธ์ (Business Analysis)',
        labelEn: 'Business & Financial Analysis, Strategic Planning',
        type: 'rating',
        weight: 2
      },
      {
        labelTh:
          'การสื่อสารทางธุรกิจ การนำเสนอผลงาน และการเจรจาต่อรอง (Business Communication)',
        labelEn: 'Business Communication, Presentation & Negotiation',
        type: 'rating',
        weight: 2
      },
      {
        labelTh:
          'ความเข้าใจในกระบวนการทำงาน การจัดการโครงการ และการแก้ปัญหาเฉพาะหน้า (Project Management)',
        labelEn: 'Process & Project Management, Problem Solving',
        type: 'rating',
        weight: 1
      },
      {
        labelTh:
          'การประยุกต์ใช้เทคโนโลยีดิจิทัลและซอฟต์แวร์ในการทำงานธุรกิจ (Digital Tools)',
        labelEn: 'Digital Business Tools Application',
        type: 'rating',
        weight: 1
      }
    ]
  },
  NS: {
    titleTh: 'ทักษะเฉพาะทางด้านการพยาบาลและการบริบาลผู้ป่วย',
    titleEn: 'Clinical Nursing & Patient Care Competencies',
    questions: [
      {
        labelTh:
          'ทักษะการประเมินสภาพผู้ป่วยและการวินิจฉัยทางการพยาบาล (Nursing Assessment)',
        labelEn: 'Patient Assessment & Nursing Diagnosis',
        type: 'rating',
        weight: 2
      },
      {
        labelTh:
          'การปฏิบัติการพยาบาลตามมาตรฐานความปลอดภัยและการควบคุมการติดเชื้อ (Patient Safety)',
        labelEn: 'Nursing Practice, Safety & Infection Control',
        type: 'rating',
        weight: 2
      },
      {
        labelTh:
          'การสื่อสารเพื่อการบำบัดและการสร้างสัมพันธภาพกับผู้ป่วยและญาติ (Therapeutic Communication)',
        labelEn: 'Therapeutic Communication with Patients & Families',
        type: 'rating',
        weight: 2
      },
      {
        labelTh:
          'จรรยาบรรณวิชาชีพการพยาบาลและการเคารพสิทธิผู้ป่วย (Nursing Ethics)',
        labelEn: 'Professional Nursing Ethics & Patient Rights',
        type: 'rating',
        weight: 1
      }
    ]
  },
  AI: {
    titleTh: 'ทักษะเฉพาะทางด้านอุตสาหกรรมเกษตรและเทคโนโลยีอาหาร',
    titleEn: 'Agro-Industry & Food Science Competencies',
    questions: [
      {
        labelTh:
          'การควบคุมคุณภาพและความปลอดภัยของอาหารตามมาตรฐานสากล (GMP / HACCP / ISO)',
        labelEn: 'Food Safety & Quality Assurance Standards',
        type: 'rating',
        weight: 2
      },
      {
        labelTh:
          'ทักษะการวิเคราะห์และทดสอบในห้องปฏิบัติการทางวิทยาศาสตร์อาหาร (Laboratory Skills)',
        labelEn: 'Laboratory Testing & Food Analysis Skills',
        type: 'rating',
        weight: 2
      },
      {
        labelTh:
          'ความเข้าใจในกระบวนการแปรรูปและสายการผลิตอุตสาหกรรมเกษตร (Food Processing)',
        labelEn: 'Food Processing & Agro-Industrial Production Line',
        type: 'rating',
        weight: 1
      }
    ]
  },
  COS: {
    titleTh: 'ทักษะเฉพาะทางด้านวิทยาศาสตร์เครื่องสำอาง',
    titleEn: 'Cosmetic Science Competencies',
    questions: [
      {
        labelTh:
          'การพัฒนาและตั้งตำรับผลิตภัณฑ์เครื่องสำอาง (Cosmetic Formulation)',
        labelEn: 'Cosmetic Formulation & Product Development',
        type: 'rating',
        weight: 2
      },
      {
        labelTh:
          'การทดสอบความคงตัว ความปลอดภัย และประสิทธิภาพของผลิตภัณฑ์ (Safety & Efficacy)',
        labelEn: 'Stability, Safety & Efficacy Testing',
        type: 'rating',
        weight: 2
      },
      {
        labelTh:
          'การควบคุมคุณภาพและการปฏิบัติตามกฎหมายเครื่องสำอางสากล (Quality Control)',
        labelEn: 'Quality Control & Regulatory Compliance',
        type: 'rating',
        weight: 1
      }
    ]
  },
  HS: {
    titleTh: 'ทักษะเฉพาะทางด้านวิทยาศาสตร์สุขภาพและสาธารณสุข',
    titleEn: 'Health Science & Public Health Competencies',
    questions: [
      {
        labelTh:
          'การประเมินความเสี่ยงด้านสุขภาพ อาชีวอนามัย และสิ่งแวดล้อม (Risk Assessment)',
        labelEn: 'Health Risk, Occupational & Environmental Assessment',
        type: 'rating',
        weight: 2
      },
      {
        labelTh:
          'การวางแผนและการจัดทำโครงการส่งเสริมสุขภาพในสถานประกอบการ/ชุมชน (Health Promotion)',
        labelEn: 'Health Promotion Project Planning',
        type: 'rating',
        weight: 2
      },
      {
        labelTh:
          'การปฏิบัติตามกฎหมายและมาตรฐานความปลอดภัยในการทำงาน (Safety Standards)',
        labelEn: 'Safety Standards & Regulatory Compliance',
        type: 'rating',
        weight: 1
      }
    ]
  }
}

function applySchoolPreset(school: School) {
  const preset = SCHOOL_PRESETS[school.schoolCode] || {
    titleTh: `ทักษะวิชาชีพเฉพาะทางสำหรับสำนักวิชา${school.name.th}`,
    titleEn: `Specialized Professional Competencies for ${school.name.en}`,
    questions: [
      {
        labelTh: 'ความรู้ความสามารถทางวิชาการและทักษะเทคนิคในสายงาน',
        labelEn: 'Technical and Academic Knowledge in Field',
        type: 'rating',
        weight: 2
      },
      {
        labelTh: 'การประยุกต์ใช้ความรู้และทฤษฎีสู่การปฏิบัติงานจริงในองค์กร',
        labelEn: 'Application of Theoretical Knowledge to Practical Work',
        type: 'rating',
        weight: 2
      },
      {
        labelTh: 'การวิเคราะห์และแก้ไขปัญหาเฉพาะด้านในสายวิชาชีพ',
        labelEn: 'Professional Problem Analysis & Solution Implementation',
        type: 'rating',
        weight: 1
      },
      {
        labelTh: 'การใฝ่รู้และพัฒนาทักษะเฉพาะทางอย่างต่อเนื่อง',
        labelEn: 'Continuous Learning and Professional Skill Development',
        type: 'rating',
        weight: 1
      }
    ]
  }

  let sec = getSchoolSection(school.id)
  if (!sec) {
    sec = {
      id: `sec_spec_${school.id}_${Date.now()}`,
      title: { th: preset.titleTh, en: preset.titleEn },
      category: 'special',
      schoolId: school.id,
      questions: []
    }
    editorForm.sections.push(sec)
  } else {
    sec.title.th = preset.titleTh
    sec.title.en = preset.titleEn
  }

  sec.questions = preset.questions.map((q, idx) => ({
    id: `q_${school.schoolCode.toLowerCase()}_${Date.now()}_${idx + 1}`,
    label: { th: q.labelTh, en: q.labelEn },
    type: q.type,
    required: true,
    weight: q.weight,
    scaleMin: 1,
    scaleMax: 5
  }))

  toast.add({
    title: 'โหลดแม่แบบสำเร็จ',
    description: `เพิ่มเกณฑ์มาตรฐานสำหรับ ${school.name.th} เรียบร้อยแล้ว`,
    color: 'success'
  })
}

function addSpecialSectionForSchool(schoolId: string) {
  const school = (schoolsData.value?.items || []).find((s) => s.id === schoolId)
  const schoolName = school ? school.name.th : 'สำนักวิชา'
  const newSec: Section = {
    id: `sec_spec_${schoolId}_${Date.now()}`,
    title: {
      th: `ทักษะเฉพาะทางสำหรับสำนักวิชา${schoolName}`,
      en: `Specialized Competencies for ${school?.name.en || 'School'}`
    },
    category: 'special',
    schoolId,
    questions: [
      {
        id: `q_${Date.now()}_1`,
        label: {
          th: 'ระบุหัวข้อประเมินเฉพาะทาง...',
          en: 'Enter specialized criteria...'
        },
        type: 'rating',
        required: true,
        weight: 1,
        scaleMin: 1,
        scaleMax: 5
      }
    ]
  }
  editorForm.sections.push(newSec)
}

function _removeSchoolCriteria(schoolId: string) {
  const school = (schoolsData.value?.items || []).find((s) => s.id === schoolId)
  if (
    !confirm(
      `คุณต้องการลบเกณฑ์เฉพาะทางของ "${school?.name.th || 'สำนักวิชานี้'}" ทั้งหมดหรือไม่?`
    )
  ) {
    return
  }
  editorForm.sections = editorForm.sections.filter(
    (s) => !(s.category === 'special' && s.schoolId === schoolId)
  )
  toast.add({
    title: 'ลบเกณฑ์สำเร็จ',
    description: `ลบเกณฑ์เฉพาะของ ${school?.name.th} เรียบร้อยแล้ว`,
    color: 'success'
  })
}

function addProgramSectionForSchool(schoolId: string, programId?: string) {
  const school = schoolMap.value.get(schoolId)
  const unassigned = getUnassignedPrograms(schoolId)
  const targetProg = programId ? programMap.value.get(programId) : unassigned[0]
  const targetProgId = targetProg?.id || ''

  const progLabelTh = targetProg
    ? `สาขาวิชา${targetProg.name.th}`
    : `สำนักวิชา${school?.name.th || ''}`
  const progLabelEn = targetProg
    ? targetProg.name.en
    : school?.name.en || 'School'

  const newSec: Section = {
    id: `sec_spec_${schoolId}_${targetProgId || 'all'}_${Date.now()}`,
    title: {
      th: `ทักษะเฉพาะทาง: ${progLabelTh}`,
      en: `Specialized Skills: ${progLabelEn}`
    },
    category: 'special',
    schoolId,
    programId: targetProgId,
    questions: [
      {
        id: `q_${Date.now()}_1`,
        label: {
          th: targetProg
            ? `ทักษะและความรู้ความสามารถเฉพาะทางสาขาวิชา ${targetProg.name.th}`
            : 'ระบุหัวข้อประเมินเฉพาะทางตามหลักสูตร...',
          en: targetProg
            ? `Specialized competencies for ${targetProg.name.en}`
            : 'Enter specialized criteria for program...'
        },
        type: 'rating',
        required: true,
        weight: 1,
        scaleMin: 1,
        scaleMax: 5
      }
    ]
  }
  editorForm.sections.push(newSec)

  toast.add({
    title: 'เพิ่มหลักสูตรสำเร็จ',
    description: targetProg
      ? `เพิ่มเกณฑ์สำหรับหลักสูตร [${targetProg.programCode}] ${targetProg.name.th} เรียบร้อยแล้ว`
      : 'เพิ่มหมวดเฉพาะทางใหม่เรียบร้อยแล้ว',
    color: 'success'
  })
}

function removeSectionFromSchool(section: Section) {
  const schoolId = section.schoolId
  const remainingInSchool = getSchoolSections(schoolId || '').length
  const prog = section.programId
    ? programMap.value.get(section.programId)
    : null
  const label = prog
    ? `หลักสูตร [${prog.programCode}] ${prog.name.th}`
    : 'หมวดนี้'

  if (remainingInSchool <= 1) {
    if (
      !confirm(
        `คุณต้องการลบเกณฑ์เฉพาะทางของ "${label}" ทั้งหมดหรือไม่? หากลบออก สำนักวิชานี้จะกลับไปเป็นสถานะยังไม่กำหนดเกณฑ์`
      )
    ) {
      return
    }
  }

  const idx = editorForm.sections.indexOf(section)
  if (idx !== -1) {
    editorForm.sections.splice(idx, 1)
  }

  toast.add({
    title: 'ลบหมวดแล้ว',
    description: `ลบเกณฑ์ของ ${label} เรียบร้อยแล้ว`,
    color: 'neutral'
  })
}

function onSectionProgramChange(section: Section) {
  if (section.programId) {
    const prog = programMap.value.get(section.programId)
    if (prog) {
      if (
        !section.title.th ||
        section.title.th.startsWith('ทักษะเฉพาะทาง') ||
        section.title.th === 'หมวดพิเศษเฉพาะสำนักวิชา'
      ) {
        section.title.th = `ทักษะเฉพาะทาง: สาขาวิชา${prog.name.th}`
        section.title.en = `Specialized Skills: ${prog.name.en}`
      }
    }
  } else {
    const school = section.schoolId
      ? schoolMap.value.get(section.schoolId)
      : null
    if (!section.title.th || section.title.th.startsWith('ทักษะเฉพาะทาง')) {
      section.title.th = `ทักษะเฉพาะทางสำหรับสำนักวิชา${school?.name.th || ''}`
      section.title.en = `Specialized Skills for ${school?.name.en || 'School'}`
    }
  }
}

function handleNextFromSpecial() {
  if (hasIncompleteSchools.value) {
    const first = incompleteSchools.value[0]
    if (first) {
      selectedSchoolHubId.value = first.schoolId
    }
    const missingDetails = incompleteSchools.value
      .map(
        (s) =>
          `• ${s.schoolName} (ขาด: ${s.missingPrograms.map((p) => `[${p.programCode}] ${p.name.th}`).join(', ')})`
      )
      .join('\n')
    toast.add({
      title: '⚠️ ไม่สามารถไปต่อได้: ยังกำหนดหลักสูตรไม่ครบ',
      description: `กรุณากำหนดให้ครบทุกหลักสูตร หรือเลือกเป็น "ทุกหลักสูตรในสำนักวิชา":\n${missingDetails}`,
      color: 'error'
    })
    return
  }
  editorActiveTab.value = 'suggestion'
}

function openCopyCriteriaModal() {
  copySourceSchoolId.value = schoolsWithCriteria.value[0]?.id || ''
  isCopyModalOpen.value = true
}

function handleExecuteCopyCriteria() {
  if (!copySourceSchoolId.value || !selectedSchoolHubId.value) return
  const sourceSec = getSchoolSection(copySourceSchoolId.value)
  if (!sourceSec || !sourceSec.questions.length) {
    toast.add({
      title: 'ไม่มีเกณฑ์ต้นฉบับ',
      description: 'สำนักวิชาต้นทางยังไม่มีข้อคำถามให้คัดลอก',
      color: 'warning'
    })
    return
  }

  const targetSchool = currentHubSchool.value
  if (!targetSchool) return

  let targetSec = getSchoolSection(targetSchool.id)
  if (!targetSec) {
    targetSec = {
      id: `sec_spec_${targetSchool.id}_${Date.now()}`,
      title: {
        th: `ทักษะเฉพาะทางสำหรับสำนักวิชา${targetSchool.name.th}`,
        en: `Specialized Competencies for ${targetSchool.name.en}`
      },
      category: 'special',
      schoolId: targetSchool.id,
      questions: []
    }
    editorForm.sections.push(targetSec)
  }

  targetSec.questions = sourceSec.questions.map((q, idx) => ({
    ...JSON.parse(JSON.stringify(q)),
    id: `q_copy_${Date.now()}_${idx + 1}`
  }))

  isCopyModalOpen.value = false
  toast.add({
    title: 'คัดลอกเกณฑ์สำเร็จ!',
    description: `คัดลอก ${sourceSec.questions.length} ข้อคำถามมายัง ${targetSchool.name.th} เรียบร้อยแล้ว`,
    color: 'success'
  })
}
</script>

<template>
  <div class="space-y-6">
    <!-- Header -->
    <header class="flex flex-wrap items-end justify-between gap-4">
      <div>
        <p class="mfu-eyebrow">ระบบประเมินสมรรถนะการฝึกงาน</p>
        <h1 class="mt-2 text-3xl font-bold text-highlighted">
          แบบฟอร์มการประเมิน (Evaluation Forms)
        </h1>
        <p class="mt-1 text-sm text-muted">
          สร้างและจัดการเกณฑ์ประเมิน รองรับทั้ง
          <strong class="text-primary font-semibold">หมวดทั่วไป (Core)</strong>
          ที่ทุกคนทำร่วมกัน,
          <strong class="text-secondary font-semibold">หมวดพิเศษ</strong>
          เฉพาะตามสำนักวิชา/คณะ และ
          <strong class="text-amber-600 dark:text-amber-400 font-semibold"
            >หมวดคำแนะนำ (Suggestion)</strong
          >
          สำหรับข้อเสนอแนะและจุดพัฒนา
        </p>
      </div>

      <div class="flex items-center gap-3">
        <UButton
          color="neutral"
          icon="i-lucide-arrow-down"
          label="รายการประเมิน"
          to="/app/evaluations"
          variant="outline"
        />
        <UButton
          color="neutral"
          icon="i-lucide-refresh-cw"
          label="รีเฟรช"
          :loading="formsPending"
          variant="outline"
          @click="() => refreshForms()"
        />
        <UButton
          v-if="canManage"
          color="primary"
          icon="i-lucide-plus"
          label="สร้างแบบฟอร์มใหม่"
          @click="openCreateForm"
        />
      </div>
    </header>

    <!-- Info Banner Explain General vs Special vs Suggestion -->
    <div class="grid grid-cols-1 gap-4 md:grid-cols-3">
      <div
        class="flex items-start gap-3.5 rounded-xl border border-default bg-muted/20 p-4"
      >
        <span
          class="grid size-9 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary"
        >
          <UIcon name="i-lucide-layers" class="size-5" />
        </span>
        <div>
          <h3 class="text-sm font-bold text-highlighted">
            หมวดทั่วไป (General Core)
          </h3>
          <p class="mt-1 text-xs text-muted leading-relaxed">
            ทุกคนในทุกสำนักวิชาจะได้รับโจทย์และเกณฑ์การประเมินในหมวดนี้เหมือนกันทั้งหมด
            เช่น ทักษะทางสังคม (Soft Skills), ความตรงต่อเวลา, การสื่อสาร
            และการทำงานเป็นทีม
          </p>
        </div>
      </div>

      <div
        class="flex items-start gap-3.5 rounded-xl border border-default bg-muted/20 p-4"
      >
        <span
          class="grid size-9 shrink-0 place-items-center rounded-lg bg-secondary/10 text-secondary"
        >
          <UIcon name="i-lucide-sparkles" class="size-5" />
        </span>
        <div>
          <h3 class="text-sm font-bold text-highlighted">
            หมวดพิเศษเฉพาะสำนักวิชา (Specialized)
          </h3>
          <p class="mt-1 text-xs text-muted leading-relaxed">
            ข้อคำถามและเกณฑ์ประเมินจะแสดงผลเฉพาะนักศึกษาที่สังกัดสำนักวิชาหรือสาขาวิชานั้นๆ
            เช่น ทักษะการเขียนโปรแกรม (IT), ทักษะการพยาบาล (NUR), ทักษะกฎหมาย
            (LAW)
          </p>
        </div>
      </div>

      <div
        class="flex items-start gap-3.5 rounded-xl border border-default bg-muted/20 p-4"
      >
        <span
          class="grid size-9 shrink-0 place-items-center rounded-lg bg-amber-500/10 text-amber-600 dark:text-amber-400"
        >
          <UIcon name="i-lucide-message-square" class="size-5" />
        </span>
        <div>
          <h3 class="text-sm font-bold text-highlighted">
            หมวดคำแนะนำ (Suggestion)
          </h3>
          <p class="mt-1 text-xs text-muted leading-relaxed">
            ข้อคำถามและแบบประเมินสำหรับให้ผู้ประเมินบันทึกข้อเสนอแนะ จุดเด่น
            สิ่งที่ควรพัฒนา และคำแนะนำเพิ่มเติมแก่นักศึกษาฝึกงาน
          </p>
        </div>
      </div>
    </div>

    <!-- Error Alert -->
    <UAlert
      v-if="formsError"
      color="error"
      icon="i-lucide-circle-alert"
      title="โหลดแบบฟอร์มการประเมินไม่สำเร็จ"
      description="กรุณาตรวจสอบการเชื่อมต่อ API หรือสิทธิ์การใช้งาน (competencies.read)"
      variant="soft"
    />

    <!-- Filter & Search Bar -->
    <div
      class="rounded-xl border border-default bg-default p-4 shadow-sm space-y-3"
    >
      <div class="flex flex-col gap-3 md:flex-row md:items-center">
        <!-- Live Search with Clear Button -->
        <div class="relative flex-1">
          <UInput
            v-model="searchQuery"
            class="w-full"
            icon="i-lucide-search"
            placeholder="ค้นหาชื่อหรือรหัสแบบฟอร์มประเมิน (ไทย / English)..."
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

        <!-- Status Filter Dropdown -->
        <div class="flex items-center gap-2">
          <label
            for="form-status-filter"
            class="text-xs font-semibold text-muted whitespace-nowrap"
            >สถานะ:</label
          >
          <select
            id="form-status-filter"
            v-model="statusFilter"
            class="rounded-lg border border-default bg-default px-3 py-2 text-xs text-highlighted focus:outline-none focus:ring-1 focus:ring-primary font-medium"
          >
            <option value="all">ทุกสถานะ</option>
            <option value="active">เปิดใช้งาน (Active)</option>
          </select>
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
              filteredForms.length
            }}</span>
            แบบฟอร์ม
          </span>
          <span
            v-if="(formsData?.items.length ?? 0) > filteredForms.length"
            class="text-muted"
          >
            (จากทั้งหมด {{ formsData?.items.length ?? 0 }} แบบฟอร์ม)
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
    </div>

    <!-- Forms List Table -->
    <UCard :ui="{ body: 'p-0 sm:p-0' }">
      <div class="overflow-x-auto">
        <table class="data-table">
          <thead>
            <tr>
              <th class="w-36">รหัสแบบฟอร์ม</th>
              <th>ชื่อแบบฟอร์ม (ภาษาไทย)</th>
              <th>ชื่อภาษาอังกฤษ</th>
              <th class="w-28 text-center">สถานะ</th>
              <th class="w-24 text-right">การจัดการ</th>
            </tr>
          </thead>
          <tbody>
            <tr v-if="filteredForms.length === 0">
              <td colspan="5" class="py-12 text-center text-muted">
                <UIcon
                  name="i-lucide-clipboard-check"
                  class="mx-auto mb-2 size-8 text-muted"
                />
                <p class="font-medium">ยังไม่มีแบบฟอร์มการประเมินในระบบ</p>
                <p class="text-xs">
                  คลิกปุ่ม &quot;สร้างแบบฟอร์มใหม่&quot;
                  เพื่อเริ่มต้นออกแบบเกณฑ์ประเมิน
                </p>
              </td>
            </tr>
            <tr v-for="form in paginatedForms" :key="form.id">
              <td class="font-mono font-bold text-highlighted">
                {{ form.code }}
              </td>
              <td class="font-medium text-highlighted">
                {{ form.name.th }}
              </td>
              <td class="text-muted">
                {{ form.name.en }}
              </td>
              <td class="text-center">
                <UBadge
                  :color="form.status === 'active' ? 'success' : 'neutral'"
                  :label="form.status === 'active' ? 'ใช้งาน' : 'เก็บถาวร'"
                  size="sm"
                  variant="subtle"
                />
              </td>
              <td class="text-right">
                <div class="flex items-center justify-end">
                  <UDropdownMenu
                    :items="[
                      [
                        {
                          label: 'แก้ไข / ออกแบบฟอร์ม',
                          icon: 'i-lucide-pencil',
                          onSelect: () => openEditForm(form)
                        },
                        {
                          label: 'ทดสอบดูตัวอย่างแบบฟอร์ม',
                          icon: 'i-lucide-eye',
                          onSelect: () =>
                            openEditForm(form).then(() => openPreview())
                        }
                      ]
                    ]"
                    :content="{ align: 'end' }"
                  >
                    <UButton
                      aria-label="การจัดการแบบฟอร์ม"
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
        :total="filteredForms.length"
        items-name="แบบฟอร์ม"
      />
    </UCard>

    <!-- FORM BUILDER MODAL / DRAWER -->
    <div
      v-if="isEditorOpen"
      class="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
    >
      <div
        class="flex h-[94vh] w-[97vw] max-w-[1600px] flex-col rounded-2xl border border-default bg-default shadow-2xl overflow-hidden"
      >
        <!-- Builder Header (Fixed at top) -->
        <div
          class="shrink-0 flex items-center justify-between border-b border-default px-6 py-3.5 bg-default"
        >
          <div>
            <div class="flex items-center gap-2">
              <span
                class="grid size-7 place-items-center rounded-md bg-primary text-inverted"
              >
                <UIcon name="i-lucide-sliders" class="size-4" />
              </span>
              <h2 class="text-base sm:text-lg font-bold text-highlighted">
                {{
                  editorForm.isNew
                    ? 'สร้างแบบฟอร์มการประเมินใหม่'
                    : `แก้ไขแบบฟอร์ม: ${editorForm.code}`
                }}
              </h2>
            </div>
          </div>

          <div class="flex items-center gap-2">
            <UButton
              color="neutral"
              icon="i-lucide-x"
              size="xs"
              variant="ghost"
              @click="isEditorOpen = false"
            />
          </div>
        </div>

        <!-- Stepped Tabs Navigation Header (Fixed in 1 single horizontal row!) -->
        <div
          class="shrink-0 flex items-center justify-between border-b border-default bg-muted/25 px-6 py-2 gap-3"
        >
          <div
            class="flex items-center gap-2 overflow-x-auto whitespace-nowrap scrollbar-none"
          >
            <!-- Tab 1: ข้อมูลทั่วไป & หมวดกลาง -->
            <button
              type="button"
              class="flex items-center gap-2 rounded-lg px-3.5 py-1.5 text-xs font-semibold transition-all cursor-pointer shrink-0"
              :class="
                editorActiveTab === 'general'
                  ? 'bg-default text-primary shadow-xs ring-1 ring-default'
                  : 'text-muted hover:text-highlighted hover:bg-muted/40'
              "
              @click="editorActiveTab = 'general'"
            >
              <span
                class="grid size-5 place-items-center rounded-full text-[11px] font-bold"
                :class="
                  editorActiveTab === 'general'
                    ? 'bg-primary text-inverted'
                    : 'bg-muted/50 text-muted'
                "
                >1</span
              >
              <UIcon name="i-lucide-layers" class="size-4 text-primary" />
              <span>ข้อมูลแบบฟอร์ม & หมวดทั่วไป (Core)</span>
              <UBadge
                :label="`${generalSection?.questions.length || 0} ข้อ`"
                size="xs"
                variant="subtle"
              />
            </button>

            <!-- Tab 2: หมวดเฉพาะสำนักวิชา (School Hub) -->
            <button
              type="button"
              class="flex items-center gap-2 rounded-lg px-3.5 py-1.5 text-xs font-semibold transition-all cursor-pointer relative shrink-0"
              :class="
                editorActiveTab === 'special'
                  ? 'bg-default text-secondary shadow-xs ring-1 ring-default'
                  : 'text-muted hover:text-highlighted hover:bg-muted/40'
              "
              @click="editorActiveTab = 'special'"
            >
              <span
                class="grid size-5 place-items-center rounded-full text-[11px] font-bold"
                :class="
                  editorActiveTab === 'special'
                    ? 'bg-secondary text-inverted'
                    : 'bg-muted/50 text-muted'
                "
                >2</span
              >
              <UIcon name="i-lucide-sparkles" class="size-4 text-secondary" />
              <span>หมวดเฉพาะสำนักวิชา (School Hub)</span>
              <UBadge
                :color="configuredSchoolsCount > 0 ? 'secondary' : 'neutral'"
                :label="`${configuredSchoolsCount}/${schoolsData?.items.length || 15} สำนักวิชา (${specialSections.length} หมวด)`"
                size="xs"
                variant="subtle"
              />
            </button>

            <!-- Tab 3: หมวดคำแนะนำ -->
            <button
              type="button"
              class="flex items-center gap-2 rounded-lg px-3.5 py-1.5 text-xs font-semibold transition-all cursor-pointer shrink-0"
              :class="
                editorActiveTab === 'suggestion'
                  ? 'bg-default text-amber-600 dark:text-amber-400 shadow-xs ring-1 ring-default'
                  : 'text-muted hover:text-highlighted hover:bg-muted/40'
              "
              @click="editorActiveTab = 'suggestion'"
            >
              <span
                class="grid size-5 place-items-center rounded-full text-[11px] font-bold"
                :class="
                  editorActiveTab === 'suggestion'
                    ? 'bg-amber-500 text-inverted'
                    : 'bg-muted/50 text-muted'
                "
                >3</span
              >
              <UIcon
                name="i-lucide-message-square"
                class="size-4 text-amber-500"
              />
              <span>หมวดคำแนะนำ (Suggestion)</span>
              <UBadge
                :label="`${suggestionSections.length} หมวด`"
                size="xs"
                color="warning"
                variant="subtle"
              />
            </button>
          </div>

          <!-- Tab 4: Live Simulator Shortcut (Pinned at right) -->
          <button
            type="button"
            class="flex items-center gap-1.5 rounded-lg border border-default px-3 py-1.5 text-xs font-semibold transition-all cursor-pointer shrink-0"
            :class="
              editorActiveTab === 'simulator'
                ? 'bg-primary text-inverted border-primary shadow-xs'
                : 'bg-default text-highlighted hover:bg-muted/30'
            "
            @click="editorActiveTab = 'simulator'"
          >
            <UIcon name="i-lucide-eye" class="size-3.5" />
            <span>จำลองมุมมองจริง (Live Simulator)</span>
          </button>
        </div>

        <!-- Builder Body (Non-overflowing workspace - each tab manages its scroll independently!) -->
        <div class="flex-1 min-h-0 overflow-hidden flex flex-col p-4 sm:p-5">
          <!-- ================================================================= -->
          <!-- PANEL 1: ข้อมูลทั่วไป & หมวดทั่วไป (Core) -->
          <!-- ================================================================= -->
          <div
            v-if="editorActiveTab === 'general'"
            class="flex-1 min-h-0 flex flex-col space-y-3.5"
          >
            <!-- Form Settings Bar (Compact & Sleek) -->
            <div
              class="shrink-0 rounded-xl border border-default bg-muted/10 p-3.5 space-y-2.5"
            >
              <div class="flex items-center justify-between">
                <h3
                  class="text-xs font-bold text-highlighted flex items-center gap-2"
                >
                  <UIcon name="i-lucide-info" class="size-4 text-primary" />
                  <span>ข้อมูลทั่วไปของแบบฟอร์ม (Form Information)</span>
                </h3>
                <span class="text-[11px] text-muted">
                  ทุกคนในทุกสำนักวิชาจะได้รับเกณฑ์ในหมวดนี้เหมือนกันทั้งหมด
                  (General Core Competencies)
                </span>
              </div>

              <div class="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <div>
                  <label class="block text-xs font-semibold text-highlighted">
                    รหัสแบบฟอร์ม <span class="text-error">*</span>
                  </label>
                  <input
                    v-model="editorForm.code"
                    type="text"
                    placeholder="เช่น EVAL-2026-ALL"
                    class="mt-1 h-9 w-full rounded-lg border border-default bg-default px-3 font-mono text-xs uppercase text-highlighted focus:border-primary focus:outline-none"
                  />
                </div>
                <div>
                  <label class="block text-xs font-semibold text-highlighted">
                    ชื่อแบบฟอร์มภาษาไทย <span class="text-error">*</span>
                  </label>
                  <input
                    v-model="editorForm.nameTh"
                    type="text"
                    placeholder="เช่น แบบประเมินการฝึกงานประจำปี 2026"
                    class="mt-1 h-9 w-full rounded-lg border border-default bg-default px-3 text-xs text-highlighted focus:border-primary focus:outline-none"
                  />
                </div>
                <div>
                  <label class="block text-xs font-semibold text-highlighted">
                    ชื่อแบบฟอร์มภาษาอังกฤษ <span class="text-error">*</span>
                  </label>
                  <input
                    v-model="editorForm.nameEn"
                    type="text"
                    placeholder="เช่น Internship Evaluation Form 2026"
                    class="mt-1 h-9 w-full rounded-lg border border-default bg-default px-3 text-xs text-highlighted focus:border-primary focus:outline-none"
                  />
                </div>
              </div>
            </div>

            <!-- General Section Content (Scrolls independently!) -->
            <div
              v-if="generalSection"
              class="flex-1 min-h-0 overflow-y-auto space-y-3.5 pr-1.5"
            >
              <div
                class="rounded-xl border border-primary/25 bg-primary/[0.01] p-4 space-y-3"
              >
                <!-- Section Header Row -->
                <div
                  class="flex flex-wrap items-center justify-between gap-3 border-b border-primary/15 pb-2.5"
                >
                  <div class="flex-1 grid grid-cols-1 gap-2.5 sm:grid-cols-2">
                    <div>
                      <label
                        class="block text-[11px] font-semibold text-primary"
                      >
                        ชื่อหมวดทั่วไป (ภาษาไทย)
                      </label>
                      <input
                        v-model="generalSection.title.th"
                        type="text"
                        placeholder="เช่น ทักษะทางสังคมและการสื่อสาร (Soft Skills)"
                        class="mt-0.5 h-8 w-full rounded-md border border-default bg-default px-2.5 text-xs text-highlighted focus:border-primary focus:outline-none"
                      />
                    </div>
                    <div>
                      <label class="block text-[11px] font-semibold text-muted">
                        ชื่อหมวด (ภาษาอังกฤษ)
                      </label>
                      <input
                        v-model="generalSection.title.en"
                        type="text"
                        placeholder="e.g. Soft Skills and Communication"
                        class="mt-0.5 h-8 w-full rounded-md border border-default bg-default px-2.5 text-xs text-highlighted focus:border-primary focus:outline-none"
                      />
                    </div>
                  </div>

                  <div class="flex items-center gap-2 shrink-0">
                    <UButton
                      color="primary"
                      icon="i-lucide-plus"
                      label="เพิ่มข้อคำถาม"
                      size="xs"
                      variant="subtle"
                      @click="addQuestion(generalSection)"
                    />
                  </div>
                </div>

                <!-- Questions List in Compact Dual-Row Cards -->
                <div class="space-y-2">
                  <div
                    v-for="(q, qIndex) in generalSection.questions"
                    :key="q.id"
                    class="rounded-lg border border-default bg-default p-2.5 space-y-2 shadow-2xs hover:border-primary/40 transition-colors"
                  >
                    <!-- Row 1: Number + Inputs + Delete -->
                    <div class="flex items-center gap-2.5">
                      <span
                        class="grid size-6 shrink-0 place-items-center rounded-md bg-primary/15 text-xs font-bold text-primary"
                      >
                        {{ qIndex + 1 }}
                      </span>
                      <div class="flex-1 grid grid-cols-1 gap-2 sm:grid-cols-2">
                        <input
                          v-model="q.label.th"
                          type="text"
                          placeholder="คำถามภาษาไทย เช่น ความตรงต่อเวลาในการเข้างาน..."
                          class="h-8 rounded-md border border-default bg-default px-2.5 text-xs text-highlighted focus:border-primary focus:outline-none"
                        />
                        <input
                          v-model="q.label.en"
                          type="text"
                          placeholder="Question in English e.g. Punctuality and attendance..."
                          class="h-8 rounded-md border border-default bg-default px-2.5 text-xs text-highlighted focus:border-primary focus:outline-none"
                        />
                      </div>
                      <UButton
                        color="error"
                        icon="i-lucide-trash-2"
                        size="xs"
                        variant="ghost"
                        title="ลบข้อนี้"
                        @click="removeQuestion(generalSection, qIndex)"
                      />
                    </div>

                    <!-- Row 2: Config Toolbar (Inline & Clean) -->
                    <div
                      class="flex flex-wrap items-center justify-between gap-3 rounded-md bg-muted/15 px-2.5 py-1 text-[11px]"
                    >
                      <div class="flex items-center gap-3">
                        <div class="flex items-center gap-1.5">
                          <span class="font-medium text-muted">รูปแบบ:</span>
                          <select
                            v-model="q.type"
                            class="h-6 rounded border border-default bg-default px-1.5 text-[11px] text-highlighted"
                          >
                            <option value="rating">
                              ⭐️ มาตราส่วนคะแนน (Rating)
                            </option>
                            <option value="text">
                              📝 ความเห็นปลายเปิด (Text)
                            </option>
                            <option value="boolean">
                              ☑️ ใช่/ไม่ใช่ (Yes/No)
                            </option>
                          </select>
                        </div>

                        <div
                          v-if="q.type === 'rating'"
                          class="flex items-center gap-1"
                        >
                          <span class="font-medium text-muted">คะแนน:</span>
                          <input
                            v-model.number="q.scaleMin"
                            type="number"
                            class="h-6 w-10 rounded border border-default bg-default px-1 text-center text-[11px]"
                          />
                          <span>ถึง</span>
                          <input
                            v-model.number="q.scaleMax"
                            type="number"
                            class="h-6 w-10 rounded border border-default bg-default px-1 text-center text-[11px]"
                          />
                        </div>

                        <div class="flex items-center gap-1">
                          <span class="font-medium text-muted">น้ำหนัก:</span>
                          <input
                            v-model.number="q.weight"
                            type="number"
                            min="0"
                            step="0.5"
                            class="h-6 w-12 rounded border border-default bg-default px-1 text-center text-[11px]"
                          />
                        </div>
                      </div>

                      <label class="flex items-center gap-1.5 cursor-pointer">
                        <input
                          v-model="q.required"
                          type="checkbox"
                          class="size-3.5 rounded border-default text-primary"
                        />
                        <span class="font-medium text-highlighted"
                          >จำเป็นต้องตอบ</span
                        >
                      </label>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <!-- ================================================================= -->
          <!-- PANEL 2: หมวดเฉพาะสำนักวิชา (SCHOOL HUB) -->
          <!-- ================================================================= -->
          <div
            v-else-if="editorActiveTab === 'special'"
            class="flex-1 min-h-0 flex flex-col space-y-3"
          >
            <!-- Compact Subtitle & Stats Bar -->
            <div
              class="shrink-0 flex items-center justify-between gap-4 rounded-xl border border-secondary/20 bg-secondary/[0.04] px-4 py-2 text-xs"
            >
              <div class="flex items-center gap-2 min-w-0">
                <UIcon
                  name="i-lucide-sparkles"
                  class="size-4 shrink-0 text-secondary"
                />
                <span class="font-bold text-highlighted shrink-0"
                  >หมวดพิเศษเฉพาะสำนักวิชา (School Hub)</span
                >
                <span class="text-muted truncate hidden sm:inline"
                  >— ข้อคำถามจะแสดงผลเฉพาะนักศึกษาที่สังกัดสำนักวิชานั้นๆ
                  ผู้ประเมินจะเห็นเฉพาะข้อสอบตรงสาย</span
                >
              </div>
              <div class="flex items-center gap-2 shrink-0">
                <UBadge
                  :color="configuredSchoolsCount > 0 ? 'success' : 'neutral'"
                  :label="`กำหนดแล้ว ${configuredSchoolsCount} สำนักวิชา`"
                  size="xs"
                  variant="subtle"
                />
                <UBadge
                  color="neutral"
                  :label="`ยังว่าง ${(schoolsData?.items.length || 15) - configuredSchoolsCount} สำนักวิชา`"
                  size="xs"
                  variant="subtle"
                />
              </div>
            </div>

            <!-- Master-Detail 2-Column Layout (Fills remaining height 100%!) -->
            <div class="flex-1 min-h-0 grid grid-cols-12 gap-4">
              <!-- LEFT COLUMN: SCHOOL DIRECTORY (3.5 cols on xl, 4 cols on lg) -->
              <div
                class="col-span-12 md:col-span-4 lg:col-span-4 xl:col-span-3 flex flex-col min-h-0 rounded-2xl border border-default bg-default p-3 shadow-xs space-y-2.5"
              >
                <div class="shrink-0 space-y-2">
                  <UInput
                    v-model="schoolSearchQuery"
                    icon="i-lucide-search"
                    placeholder="ค้นหาสำนักวิชา..."
                    size="xs"
                  />
                  <!-- Status Filter Pills -->
                  <div class="flex items-center gap-1 text-[11px]">
                    <button
                      type="button"
                      class="rounded-md px-2 py-0.5 transition-all cursor-pointer"
                      :class="
                        schoolStatusFilter === 'all'
                          ? 'bg-secondary text-inverted font-bold'
                          : 'bg-muted/20 text-muted hover:text-highlighted'
                      "
                      @click="schoolStatusFilter === 'all'"
                    >
                      ทั้งหมด ({{ schoolsData?.items.length || 0 }})
                    </button>
                    <button
                      type="button"
                      class="rounded-md px-2 py-0.5 transition-all cursor-pointer"
                      :class="
                        schoolStatusFilter === 'configured'
                          ? 'bg-emerald-600 text-inverted font-bold'
                          : 'bg-muted/20 text-muted hover:text-highlighted'
                      "
                      @click="schoolStatusFilter === 'configured'"
                    >
                      มีเกณฑ์ ({{ configuredSchoolsCount }})
                    </button>
                    <button
                      type="button"
                      class="rounded-md px-2 py-0.5 transition-all cursor-pointer"
                      :class="
                        schoolStatusFilter === 'unconfigured'
                          ? 'bg-neutral-600 text-inverted font-bold'
                          : 'bg-muted/20 text-muted hover:text-highlighted'
                      "
                      @click="schoolStatusFilter === 'unconfigured'"
                    >
                      ยังไม่ตั้ง ({{
                        (schoolsData?.items.length || 0) -
                        configuredSchoolsCount
                      }})
                    </button>
                  </div>
                </div>

                <!-- School List (Scrolls effortlessly with full height - nearly all 15 schools fit without scrolling!) -->
                <div class="flex-1 min-h-0 overflow-y-auto space-y-1 pr-1">
                  <div
                    v-for="school in filteredSchools"
                    :key="school.id"
                    class="group flex items-center justify-between gap-2 rounded-xl border px-3 py-2 text-left transition-all cursor-pointer"
                    :class="
                      selectedSchoolHubId === school.id
                        ? 'border-secondary bg-secondary/10 shadow-xs ring-1 ring-secondary'
                        : 'border-default bg-default hover:border-secondary/40 hover:bg-muted/10'
                    "
                    @click="selectedSchoolHubId = school.id"
                  >
                    <div class="flex items-center gap-2 min-w-0">
                      <span
                        class="grid size-7 shrink-0 place-items-center rounded-lg font-mono text-[11px] font-bold transition-all"
                        :class="
                          selectedSchoolHubId === school.id
                            ? 'bg-secondary text-inverted shadow-xs'
                            : 'bg-muted/20 text-highlighted group-hover:bg-secondary/20'
                        "
                      >
                        {{ school.schoolCode }}
                      </span>
                      <div class="min-w-0">
                        <p
                          class="truncate text-xs font-bold leading-tight"
                          :class="
                            selectedSchoolHubId === school.id
                              ? 'text-secondary'
                              : 'text-highlighted'
                          "
                        >
                          {{ school.name.th }}
                        </p>
                      </div>
                    </div>

                    <div class="shrink-0 text-right">
                      <UBadge
                        v-if="
                          isSchoolConfigured(school.id) &&
                          !getSchoolProgramStatus(school.id).isComplete
                        "
                        color="error"
                        :label="`⚠️ ขาด ${getSchoolProgramStatus(school.id).missingPrograms.length} สาขา`"
                        size="xs"
                        variant="subtle"
                      />
                      <UBadge
                        v-else-if="
                          isSchoolConfigured(school.id) &&
                          getSchoolProgramStatus(school.id).isAllProgramsMode
                        "
                        color="success"
                        :label="`ทุกหลักสูตร (${getSchoolQuestionsCount(school.id)})`"
                        size="xs"
                        variant="subtle"
                      />
                      <UBadge
                        v-else-if="isSchoolConfigured(school.id)"
                        color="success"
                        :label="`ครบ ${getSchoolProgramStatus(school.id).configuredProgramsCount}/${getSchoolProgramStatus(school.id).totalPrograms} (${getSchoolQuestionsCount(school.id)})`"
                        size="xs"
                        variant="subtle"
                      />
                      <span v-else class="text-[10px] text-muted">ว่าง</span>
                    </div>
                  </div>
                </div>
              </div>

              <!-- RIGHT COLUMN: ACTIVE SCHOOL WORKSTATION (8.5 cols on xl, 8 cols on lg) -->
              <div
                class="col-span-12 md:col-span-8 lg:col-span-8 xl:col-span-9 flex flex-col min-h-0 rounded-2xl border border-default bg-muted/[0.02] p-4 shadow-xs space-y-3"
              >
                <!-- Header pinned at top -->
                <div
                  v-if="currentHubSchool"
                  class="shrink-0 flex flex-wrap items-center justify-between gap-3 border-b border-default pb-3"
                >
                  <div class="flex items-center gap-2.5">
                    <span
                      class="grid size-8 place-items-center rounded-lg bg-secondary text-inverted font-mono text-xs font-bold shadow-xs"
                    >
                      {{ currentHubSchool.schoolCode }}
                    </span>
                    <div>
                      <h4
                        class="text-sm font-bold text-highlighted flex items-center gap-2"
                      >
                        <span>สำนักวิชา{{ currentHubSchool.name.th }}</span>
                        <UBadge
                          :color="
                            isSchoolConfigured(currentHubSchool.id)
                              ? 'success'
                              : 'neutral'
                          "
                          :label="
                            isSchoolConfigured(currentHubSchool.id)
                              ? `กำหนดแล้ว ${getSchoolQuestionsCount(currentHubSchool.id)} ข้อ`
                              : 'ยังไม่กำหนดเกณฑ์'
                          "
                          size="xs"
                          variant="soft"
                        />
                      </h4>
                      <p class="text-[11px] text-muted">
                        {{ currentHubSchool.name.en }}
                      </p>
                    </div>
                  </div>

                  <!-- Quick Action Buttons in ONE line -->
                  <div class="flex items-center gap-2">
                    <UButton
                      color="secondary"
                      icon="i-lucide-sparkles"
                      label="โหลดแม่แบบมาตรฐาน"
                      size="xs"
                      variant="subtle"
                      title="เติมข้อคำถามมาตรฐานสำหรับสำนักวิชานี้อัตโนมัติ"
                      @click="
                        currentHubSchool && applySchoolPreset(currentHubSchool)
                      "
                    />
                    <UButton
                      v-if="schoolsWithCriteria.length > 0"
                      color="neutral"
                      icon="i-lucide-copy"
                      label="คัดลอกจากสำนักวิชาอื่น..."
                      size="xs"
                      variant="outline"
                      @click="openCopyCriteriaModal"
                    />
                    <!-- Add Program button: Visible only if NOT all-programs mode and unassigned programs exist -->
                    <UButton
                      v-if="
                        currentHubSchool &&
                        canAddProgramToSchool(currentHubSchool.id)
                      "
                      color="warning"
                      icon="i-lucide-plus"
                      :label="`เพิ่มหลักสูตร (${unassignedProgramsForCurrentSchool.length} ที่เหลือ)`"
                      size="xs"
                      variant="subtle"
                      title="เพิ่มหมวดเกณฑ์สำหรับหลักสูตรอื่นในสำนักวิชานี้"
                      @click="addProgramSectionForSchool(currentHubSchool.id)"
                    />
                    <UButton
                      color="primary"
                      icon="i-lucide-plus"
                      label="เพิ่มคำถาม"
                      size="xs"
                      @click="
                        currentHubSchool &&
                        (getSchoolSections(currentHubSchool.id)[0]
                          ? addQuestion(
                              getSchoolSections(currentHubSchool.id)[0]!
                            )
                          : addSpecialSectionForSchool(currentHubSchool.id))
                      "
                    />
                  </div>
                </div>

                <!-- Status Banner for Current School -->
                <div
                  v-if="
                    currentHubSchool &&
                    currentHubSchoolStatus &&
                    !currentHubSchoolStatus.isComplete
                  "
                  class="shrink-0 rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 flex items-center justify-between gap-3 text-xs"
                >
                  <div class="flex items-center gap-2.5 min-w-0">
                    <UIcon
                      name="i-lucide-alert-triangle"
                      class="size-4 shrink-0 text-amber-600 dark:text-amber-400"
                    />
                    <div class="min-w-0">
                      <p class="font-bold text-highlighted">
                        สำนักวิชานี้ยังกำหนดหลักสูตรไม่ครบ (กำหนดแล้ว
                        {{ currentHubSchoolStatus.configuredProgramsCount }}/{{
                          currentHubSchoolStatus.totalPrograms
                        }}
                        หลักสูตร) —
                        <span class="text-error font-semibold"
                          >ถ้าไม่ครบจะไม่สามารถไปต่อได้</span
                        >
                      </p>
                      <p class="text-muted text-[11px] truncate">
                        ยังขาดหลักสูตร:
                        <strong
                          class="text-amber-600 dark:text-amber-400 font-semibold"
                        >
                          {{
                            currentHubSchoolStatus.missingPrograms
                              .map((p) => `[${p.programCode}] ${p.name.th}`)
                              .join(', ')
                          }}
                        </strong>
                      </p>
                    </div>
                  </div>
                  <UButton
                    v-if="canAddProgramToSchool(currentHubSchool.id)"
                    color="warning"
                    icon="i-lucide-plus"
                    size="xs"
                    :label="`เพิ่ม: [${currentHubSchoolStatus.missingPrograms[0]?.programCode}] ${currentHubSchoolStatus.missingPrograms[0]?.name.th}`"
                    @click="
                      addProgramSectionForSchool(
                        currentHubSchool.id,
                        currentHubSchoolStatus.missingPrograms[0]?.id
                      )
                    "
                  />
                </div>

                <div
                  v-else-if="
                    currentHubSchool &&
                    currentHubSchoolStatus &&
                    currentHubSchoolStatus.isConfigured &&
                    currentHubSchoolStatus.isAllProgramsMode
                  "
                  class="shrink-0 rounded-xl border border-primary/20 bg-primary/[0.03] px-3.5 py-2 flex items-center justify-between gap-2 text-xs"
                >
                  <div class="flex items-center gap-2 text-muted">
                    <UIcon
                      name="i-lucide-globe"
                      class="size-4 text-primary shrink-0"
                    />
                    <span>
                      เกณฑ์นี้มีผลครอบคลุม<strong
                        >ทุกหลักสูตรในสำนักวิชา</strong
                      >
                      ({{ currentHubSchoolStatus.totalPrograms }} หลักสูตร)
                      <em>
                        — หากต้องการแยกข้อสอบเฉพาะสาขา
                        ให้เปลี่ยนตัวเลือกหลักสูตรด้านล่าง
                      </em>
                    </span>
                  </div>
                </div>

                <div
                  v-else-if="
                    currentHubSchool &&
                    currentHubSchoolStatus &&
                    currentHubSchoolStatus.isConfigured &&
                    !currentHubSchoolStatus.isAllProgramsMode &&
                    currentHubSchoolStatus.isComplete
                  "
                  class="shrink-0 rounded-xl border border-emerald-500/20 bg-emerald-500/[0.04] px-3.5 py-2 flex items-center justify-between gap-2 text-xs"
                >
                  <div
                    class="flex items-center gap-2 text-emerald-600 dark:text-emerald-400 font-semibold"
                  >
                    <UIcon
                      name="i-lucide-check-circle"
                      class="size-4 shrink-0"
                    />
                    <span>
                      กำหนดเกณฑ์ครบถ้วนทุกหลักสูตรของสำนักวิชาแล้ว ({{
                        currentHubSchoolStatus.totalPrograms
                      }}/{{ currentHubSchoolStatus.totalPrograms }} หลักสูตร)
                    </span>
                  </div>
                </div>

                <!-- Empty State -->
                <div
                  v-if="
                    currentHubSchool && !isSchoolConfigured(currentHubSchool.id)
                  "
                  class="flex-1 min-h-0 flex flex-col items-center justify-center rounded-xl border-2 border-dashed border-default/70 p-8 text-center space-y-3"
                >
                  <span
                    class="grid size-12 place-items-center rounded-xl bg-secondary/10 text-secondary"
                  >
                    <UIcon name="i-lucide-sparkles" class="size-6" />
                  </span>
                  <div class="max-w-md space-y-1">
                    <h5 class="text-sm font-bold text-highlighted">
                      ยังไม่ได้กำหนดเกณฑ์เฉพาะทางสำหรับสำนักวิชา{{
                        currentHubSchool.name.th
                      }}
                    </h5>
                    <p class="text-xs text-muted leading-relaxed">
                      นักศึกษาสำนักวิชานี้จะได้รับการประเมินเฉพาะในหมวดทั่วไปและหมวดคำแนะนำ
                      หรือคุณสามารถเพิ่มเกณฑ์เฉพาะทางวิชาชีพได้ทันที:
                    </p>
                  </div>
                  <div
                    class="flex flex-wrap items-center justify-center gap-2.5 pt-1"
                  >
                    <UButton
                      color="secondary"
                      icon="i-lucide-sparkles"
                      :label="`⚡ โหลดแม่แบบมาตรฐานสำหรับ ${currentHubSchool?.schoolCode || ''}`"
                      size="xs"
                      @click="
                        currentHubSchool && applySchoolPreset(currentHubSchool)
                      "
                    />
                    <UButton
                      color="primary"
                      icon="i-lucide-plus"
                      label="เพิ่มข้อคำถามแรกด้วยตนเอง"
                      size="xs"
                      variant="outline"
                      @click="
                        currentHubSchool &&
                        addSpecialSectionForSchool(currentHubSchool.id)
                      "
                    />
                    <UButton
                      v-if="schoolsWithCriteria.length > 0"
                      color="neutral"
                      icon="i-lucide-copy"
                      label="คัดลอกจากสำนักวิชาอื่น..."
                      size="xs"
                      variant="ghost"
                      @click="openCopyCriteriaModal"
                    />
                  </div>
                </div>

                <!-- Configured Questions (Scrolls independently!) -->
                <div
                  v-else-if="
                    currentHubSchool && isSchoolConfigured(currentHubSchool.id)
                  "
                  class="flex-1 min-h-0 overflow-y-auto space-y-3.5 pr-1.5"
                >
                  <div
                    v-for="section in currentHubSchool
                      ? getSchoolSections(currentHubSchool.id)
                      : []"
                    :key="section.id"
                    class="rounded-xl border border-secondary/30 bg-secondary/[0.02] p-3.5 space-y-3"
                  >
                    <!-- Section Title & Target Program -->
                    <div
                      class="flex flex-wrap items-center justify-between gap-3 border-b border-secondary/15 pb-2.5"
                    >
                      <div class="flex-1 grid grid-cols-1 gap-3 sm:grid-cols-2">
                        <div>
                          <label
                            class="block text-[11px] font-semibold text-secondary flex items-center justify-between"
                          >
                            <span>ชื่อหมวดเฉพาะทาง (ภาษาไทย)</span>
                            <span
                              v-if="section.programId"
                              class="text-[10px] font-mono font-bold text-secondary"
                            >
                              [{{
                                programMap.get(section.programId)?.programCode
                              }}]
                            </span>
                          </label>
                          <input
                            v-model="section.title.th"
                            type="text"
                            placeholder="เช่น ทักษะเฉพาะทางด้านซอฟต์แวร์"
                            class="mt-0.5 h-8 w-full rounded-md border border-default bg-default px-2.5 text-xs text-highlighted focus:border-secondary focus:outline-none"
                          />
                        </div>
                        <div>
                          <label
                            class="block text-[11px] font-semibold text-muted flex items-center justify-between"
                          >
                            <span>หลักสูตรที่ใช้เกณฑ์นี้</span>
                            <span
                              v-if="!section.programId"
                              class="text-[10px] text-success font-medium"
                              >ทุกหลักสูตร</span
                            >
                          </label>
                          <select
                            v-model="section.programId"
                            class="mt-0.5 h-8 w-full rounded-md border border-default bg-default px-2 text-xs text-highlighted focus:border-secondary focus:outline-none"
                            @change="onSectionProgramChange(section)"
                          >
                            <option
                              v-if="
                                getSchoolSections(currentHubSchool.id)
                                  .length === 1
                              "
                              value=""
                            >
                              🌐 ทุกหลักสูตรในสำนักวิชา (ใช้เกณฑ์ร่วมกัน)
                            </option>
                            <option
                              v-for="prog in getSchoolPrograms(
                                currentHubSchool.id
                              )"
                              :key="prog.id"
                              :value="prog.id"
                              :disabled="
                                isProgramAssignedToAnotherSection(
                                  prog.id,
                                  section.id
                                )
                              "
                            >
                              [{{ prog.programCode }}] {{ prog.name.th }}
                              {{
                                isProgramAssignedToAnotherSection(
                                  prog.id,
                                  section.id
                                )
                                  ? ' (เลือกในหมวดอื่นแล้ว)'
                                  : ''
                              }}
                            </option>
                          </select>
                        </div>
                      </div>

                      <div class="flex items-center gap-2">
                        <UButton
                          color="secondary"
                          icon="i-lucide-plus"
                          label="เพิ่มคำถาม"
                          size="xs"
                          variant="subtle"
                          @click="addQuestion(section)"
                        />
                        <UButton
                          color="error"
                          icon="i-lucide-trash-2"
                          :title="
                            getSchoolSections(currentHubSchool.id).length > 1
                              ? 'ลบหมวดหลักสูตรนี้'
                              : 'ล้างเกณฑ์สำนักวิชานี้'
                          "
                          size="xs"
                          variant="ghost"
                          @click="removeSectionFromSchool(section)"
                        />
                      </div>
                    </div>

                    <!-- Questions List (Compact Dual-Row Cards) -->
                    <div class="space-y-2">
                      <div
                        v-for="(q, qIndex) in section.questions"
                        :key="q.id"
                        class="rounded-lg border border-default bg-default p-2.5 space-y-2 shadow-2xs hover:border-secondary/40 transition-colors"
                      >
                        <!-- Row 1: Number + Inputs + Delete -->
                        <div class="flex items-center gap-2.5">
                          <span
                            class="grid size-6 shrink-0 place-items-center rounded-md bg-secondary/15 text-xs font-bold text-secondary"
                          >
                            {{ qIndex + 1 }}
                          </span>
                          <div
                            class="flex-1 grid grid-cols-1 gap-2 sm:grid-cols-2"
                          >
                            <input
                              v-model="q.label.th"
                              type="text"
                              placeholder="ระบุข้อคำถามหรือเกณฑ์ประเมินภาษาไทย..."
                              class="h-8 rounded-md border border-default bg-default px-2.5 text-xs text-highlighted focus:border-secondary focus:outline-none"
                            />
                            <input
                              v-model="q.label.en"
                              type="text"
                              placeholder="Question label in English..."
                              class="h-8 rounded-md border border-default bg-default px-2.5 text-xs text-highlighted focus:border-secondary focus:outline-none"
                            />
                          </div>
                          <UButton
                            color="error"
                            icon="i-lucide-trash-2"
                            size="xs"
                            variant="ghost"
                            title="ลบข้อนี้"
                            @click="removeQuestion(section, qIndex)"
                          />
                        </div>

                        <!-- Row 2: Config Toolbar (Inline & Clean) -->
                        <div
                          class="flex flex-wrap items-center justify-between gap-3 rounded-md bg-muted/15 px-2.5 py-1 text-[11px]"
                        >
                          <div class="flex items-center gap-3">
                            <div class="flex items-center gap-1.5">
                              <span class="font-medium text-muted"
                                >รูปแบบ:</span
                              >
                              <select
                                v-model="q.type"
                                class="h-6 rounded border border-default bg-default px-1.5 text-[11px] text-highlighted"
                              >
                                <option value="rating">
                                  ⭐️ มาตราส่วนคะแนน (Rating)
                                </option>
                                <option value="text">
                                  📝 ความเห็นปลายเปิด (Text)
                                </option>
                                <option value="boolean">
                                  ☑️ ใช่/ไม่ใช่ (Yes/No)
                                </option>
                              </select>
                            </div>

                            <div
                              v-if="q.type === 'rating'"
                              class="flex items-center gap-1"
                            >
                              <span class="font-medium text-muted">คะแนน:</span>
                              <input
                                v-model.number="q.scaleMin"
                                type="number"
                                class="h-6 w-10 rounded border border-default bg-default px-1 text-center text-[11px]"
                              />
                              <span>ถึง</span>
                              <input
                                v-model.number="q.scaleMax"
                                type="number"
                                class="h-6 w-10 rounded border border-default bg-default px-1 text-center text-[11px]"
                              />
                            </div>

                            <div class="flex items-center gap-1">
                              <span class="font-medium text-muted"
                                >น้ำหนัก:</span
                              >
                              <input
                                v-model.number="q.weight"
                                type="number"
                                min="0"
                                step="0.5"
                                class="h-6 w-12 rounded border border-default bg-default px-1 text-center text-[11px]"
                              />
                            </div>
                          </div>

                          <label
                            class="flex items-center gap-1.5 cursor-pointer"
                          >
                            <input
                              v-model="q.required"
                              type="checkbox"
                              class="size-3.5 rounded border-default text-primary"
                            />
                            <span class="font-medium text-highlighted"
                              >จำเป็นต้องตอบ</span
                            >
                          </label>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <!-- ================================================================= -->
          <!-- PANEL 3: หมวดคำแนะนำ (SUGGESTION) -->
          <!-- ================================================================= -->
          <div
            v-else-if="editorActiveTab === 'suggestion'"
            class="flex-1 min-h-0 flex flex-col space-y-3.5"
          >
            <!-- Info Callout -->
            <div
              class="shrink-0 flex items-center justify-between gap-3 rounded-xl border border-amber-500/20 bg-amber-500/[0.04] px-4 py-2.5 text-xs"
            >
              <div class="flex items-center gap-2.5">
                <UIcon
                  name="i-lucide-message-square"
                  class="size-4 shrink-0 text-amber-500"
                />
                <span class="font-bold text-highlighted"
                  >หมวดคำแนะนำและข้อเสนอแนะ (Suggestion & Recommendations)</span
                >
                <span class="text-muted hidden sm:inline"
                  >— คำถามปลายเปิดสำหรับให้ผู้ประเมินบันทึกจุดเด่น
                  สิ่งที่ควรพัฒนา หรือคำแนะนำแก่นักศึกษา</span
                >
              </div>
            </div>

            <!-- Suggestion Sections List (Scrolls independently!) -->
            <div class="flex-1 min-h-0 overflow-y-auto space-y-3.5 pr-1.5">
              <div
                v-if="suggestionSections.length === 0"
                class="rounded-xl border border-dashed border-default p-8 text-center"
              >
                <UIcon
                  name="i-lucide-message-square"
                  class="mx-auto size-8 text-muted"
                />
                <p class="mt-2 text-sm font-semibold text-highlighted">
                  ยังไม่มีหมวดคำแนะนำในแบบฟอร์มนี้
                </p>
                <UButton
                  color="warning"
                  icon="i-lucide-plus"
                  label="เพิ่มหมวดคำแนะนำ"
                  size="sm"
                  class="mt-3"
                  @click="addSection('suggestion')"
                />
              </div>

              <div
                v-for="section in suggestionSections"
                :key="section.id"
                class="rounded-xl border border-amber-500/30 bg-amber-500/[0.02] p-4 space-y-3"
              >
                <!-- Header -->
                <div
                  class="flex flex-wrap items-center justify-between gap-3 border-b border-amber-500/20 pb-2.5"
                >
                  <div class="flex-1 grid grid-cols-1 gap-2.5 sm:grid-cols-2">
                    <div>
                      <label
                        class="block text-[11px] font-semibold text-amber-600 dark:text-amber-400"
                      >
                        ชื่อหมวดภาษาไทย
                      </label>
                      <input
                        v-model="section.title.th"
                        type="text"
                        placeholder="เช่น หมวดคำแนะนำและข้อเสนอแนะ"
                        class="mt-0.5 h-8 w-full rounded-md border border-default bg-default px-2.5 text-xs text-highlighted focus:border-amber-500 focus:outline-none"
                      />
                    </div>
                    <div>
                      <label class="block text-[11px] font-semibold text-muted">
                        ชื่อหมวดภาษาอังกฤษ
                      </label>
                      <input
                        v-model="section.title.en"
                        type="text"
                        placeholder="เช่น Suggestions & Recommendations"
                        color="warning"
                        icon="i-lucide-plus"
                        label="เพิ่มข้อความเห็น"
                        size="xs"
                        variant="subtle"
                        @click="addQuestion(section)"
                      />
                    </div>

                    <div
                      v-for="(q, qIndex) in section.questions"
                      :key="q.id"
                      class="rounded-lg border border-default bg-default p-3.5 space-y-2 shadow-xs"
                    >
                      <div class="flex items-start justify-between gap-3">
                        <span
                          class="grid size-6 shrink-0 place-items-center rounded-full bg-amber-500/15 text-xs font-bold text-amber-600 dark:text-amber-400"
                        >
                          {{ qIndex + 1 }}
                        </span>
                        <div
                          class="flex-1 grid grid-cols-1 gap-2 sm:grid-cols-2"
                        >
                          <input
                            v-model="q.label.th"
                            type="text"
                            placeholder="เช่น จุดเด่นของนักศึกษา หรือ สิ่งที่ควรพัฒนา..."
                            class="h-9 rounded-md border border-default bg-default px-2.5 text-xs text-highlighted focus:border-amber-500 focus:outline-none"
                          />
                          <input
                            v-model="q.label.en"
                            type="text"
                            placeholder="Question label in English..."
                            class="h-9 rounded-md border border-default bg-default px-2.5 text-xs text-highlighted focus:border-amber-500 focus:outline-none"
                          />
                        </div>
                        <UButton
                          color="error"
                          icon="i-lucide-trash-2"
                          size="xs"
                          variant="ghost"
                          title="ลบข้อนี้"
                          @click="removeQuestion(section, qIndex)"
                        />
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <!-- ================================================================= -->
          <!-- PANEL 4: LIVE SIMULATOR (จำลองมุมมองจริง) -->
          <!-- ================================================================= -->
          <div v-else-if="editorActiveTab === 'simulator'" class="space-y-6">
            <!-- Simulator Controls Header -->
            <div
              class="rounded-xl border border-primary/20 bg-primary/[0.04] p-5 space-y-3"
            >
              <div
                class="flex flex-wrap items-center justify-between gap-3 border-b border-default pb-3"
              >
                <div>
                  <h4
                    class="text-sm font-bold text-highlighted flex items-center gap-2"
                  >
                    <UIcon name="i-lucide-eye" class="size-4 text-primary" />
                    <span>จำลองมุมมองแบบประเมินจริง (Live Simulator)</span>
                  </h4>
                  <p class="text-xs text-muted">
                    สลับดูว่าผู้ประเมินของนักศึกษาในแต่ละสำนักวิชาจะเห็นข้อสอบชุดใดบ้าง
                  </p>
                </div>

                <div class="flex items-center gap-2">
                  <span class="text-xs font-semibold text-highlighted"
                    >สลับมุมมองสำนักวิชา:</span
                  >
                  <select
                    v-model="previewSelectedSchoolId"
                    class="h-9 rounded-lg border border-default bg-default px-3 text-xs font-semibold text-highlighted focus:border-primary focus:outline-none"
                  >
                    <option value="all">🌐 ดูทุกสำนักวิชาพร้อมกัน (All)</option>
                    <option
                      v-for="sc in schoolsData?.items"
                      :key="sc.id"
                      :value="sc.id"
                    >
                      [{{ sc.schoolCode }}] {{ sc.name.th }}
                    </option>
                  </select>
                </div>
              </div>

              <!-- Quick Stats -->
              <div class="flex flex-wrap items-center gap-4 text-xs text-muted">
                <span>
                  รวมทั้งหมด:
                  <strong class="text-highlighted">
                    {{
                      previewSections.reduce(
                        (t, s) => t + s.questions.length,
                        0
                      )
                    }}
                    ข้อ
                  </strong>
                </span>
                <span>•</span>
                <span>
                  หมวดทั่วไป:
                  <strong class="text-primary">
                    {{
                      previewSections
                        .filter((s) => s.category === 'general')
                        .reduce((t, s) => t + s.questions.length, 0)
                    }}
                    ข้อ
                  </strong>
                </span>
                <span>•</span>
                <span>
                  หมวดเฉพาะสำนักวิชา:
                  <strong class="text-secondary">
                    {{
                      previewSections
                        .filter((s) => s.category === 'special')
                        .reduce((t, s) => t + s.questions.length, 0)
                    }}
                    ข้อ
                  </strong>
                </span>
                <span>•</span>
                <span>
                  หมวดคำแนะนำ:
                  <strong class="text-amber-500">
                    {{
                      previewSections
                        .filter((s) => s.category === 'suggestion')
                        .reduce((t, s) => t + s.questions.length, 0)
                    }}
                    ข้อ
                  </strong>
                </span>
              </div>
            </div>

            <!-- Simulated Form Sections -->
            <div class="space-y-6">
              <div
                v-for="(section, secIdx) in previewSections"
                :key="section.id"
                class="rounded-xl border border-default bg-default shadow-xs overflow-hidden"
              >
                <div
                  class="flex items-center justify-between border-b px-5 py-3"
                  :class="
                    section.category === 'general'
                      ? 'border-primary/20 bg-primary/[0.04]'
                      : section.category === 'suggestion'
                        ? 'border-amber-500/20 bg-amber-500/[0.04]'
                        : 'border-secondary/20 bg-secondary/[0.04]'
                  "
                >
                  <div class="flex items-center gap-3">
                    <span
                      class="grid size-6 place-items-center rounded-full text-xs font-bold"
                      :class="
                        section.category === 'general'
                          ? 'bg-primary text-inverted'
                          : section.category === 'suggestion'
                            ? 'bg-amber-500 text-inverted'
                            : 'bg-secondary text-inverted'
                      "
                    >
                      {{ secIdx + 1 }}
                    </span>
                    <h5 class="text-sm font-bold text-highlighted">
                      {{ section.title.th }}
                    </h5>
                  </div>
                  <UBadge
                    :color="
                      section.category === 'general'
                        ? 'primary'
                        : section.category === 'suggestion'
                          ? 'warning'
                          : 'secondary'
                    "
                    :label="
                      section.category === 'general'
                        ? 'หมวดทั่วไป'
                        : section.category === 'suggestion'
                          ? 'หมวดคำแนะนำ'
                          : 'หมวดเฉพาะสำนักวิชา'
                    "
                    size="xs"
                    variant="subtle"
                  />
                </div>

                <div class="p-5 divide-y divide-default/40">
                  <div
                    v-for="(q, qIdx) in section.questions"
                    :key="q.id"
                    class="py-3.5 first:pt-0 last:pb-0 space-y-2"
                  >
                    <div class="flex items-start justify-between gap-3">
                      <p class="text-xs font-bold text-highlighted">
                        {{ secIdx + 1 }}.{{ qIdx + 1 }} {{ q.label.th }}
                        <span v-if="q.required" class="text-error">*</span>
                      </p>
                      <span class="text-[11px] text-muted shrink-0"
                        >น้ำหนัก: {{ q.weight ?? 1 }}</span
                      >
                    </div>

                    <!-- Simulated Rating Control -->
                    <div
                      v-if="q.type === 'rating'"
                      class="flex flex-wrap items-center gap-2 pt-1"
                    >
                      <div
                        v-for="score in (q.scaleMax ?? 5) -
                        (q.scaleMin ?? 1) +
                        1"
                        :key="score"
                        class="grid size-8 place-items-center rounded-lg border border-default bg-muted/10 text-xs font-semibold text-muted hover:border-primary hover:text-primary cursor-pointer transition-all"
                      >
                        {{ (q.scaleMin ?? 1) + score - 1 }}
                      </div>
                      <span class="ml-2 text-[11px] text-muted">
                        (1 = ควรปรับปรุง, {{ q.scaleMax ?? 5 }} = ดีเยี่ยม)
                      </span>
                    </div>

                    <!-- Simulated Text Control -->
                    <div v-else-if="q.type === 'text'" class="pt-1">
                      <textarea
                        rows="2"
                        placeholder="พิมพ์ข้อคิดเห็นหรือข้อเสนอแนะที่นี่..."
                        class="w-full rounded-lg border border-default bg-default p-2 text-xs text-highlighted focus:outline-none"
                      ></textarea>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- Builder Footer -->
        <div
          class="flex items-center justify-between border-t border-default px-6 py-3.5"
        >
          <div class="flex items-center gap-2">
            <!-- Previous Button (or Cancel on first tab) -->
            <UButton
              v-if="editorActiveTab === 'general'"
              color="neutral"
              label="ยกเลิก"
              variant="outline"
              @click="isEditorOpen = false"
            />
            <UButton
              v-else
              color="neutral"
              icon="i-lucide-arrow-left"
              :label="
                editorActiveTab === 'special'
                  ? 'ย้อนกลับ: หมวดทั่วไป (Core)'
                  : editorActiveTab === 'suggestion'
                    ? 'ย้อนกลับ: หมวดเฉพาะสำนักวิชา'
                    : 'ย้อนกลับ: หมวดคำแนะนำ'
              "
              variant="outline"
              @click="
                editorActiveTab =
                  editorActiveTab === 'special'
                    ? 'general'
                    : editorActiveTab === 'suggestion'
                      ? 'special'
                      : 'suggestion'
              "
            />

            <UButton
              v-if="selectedVersion && selectedVersion.status === 'draft'"
              color="success"
              icon="i-lucide-circle-check"
              label="เผยแพร่แบบฟอร์มนี้ (Publish)"
              :loading="publishing"
              variant="subtle"
              @click="handlePublishVersion(selectedVersion.id)"
            />
          </div>

          <div class="flex items-center gap-2">
            <!-- Quick Save on any intermediate step -->
            <UButton
              v-if="editorActiveTab !== 'simulator'"
              color="neutral"
              variant="ghost"
              icon="i-lucide-save"
              :label="editorForm.isNew ? 'บันทึกทันที' : 'บันทึกการแก้ไข'"
              :loading="saving"
              @click="handleSaveForm"
            />

            <!-- Next Step Buttons / Final Create Button -->
            <UButton
              v-if="editorActiveTab === 'general'"
              color="secondary"
              trailing-icon="i-lucide-arrow-right"
              label="ถัดไป: หมวดเฉพาะสำนักวิชา (School Hub)"
              @click="editorActiveTab = 'special'"
            />
            <UButton
              v-else-if="editorActiveTab === 'special'"
              :color="hasIncompleteSchools ? 'neutral' : 'warning'"
              trailing-icon="i-lucide-arrow-right"
              :label="
                hasIncompleteSchools
                  ? `ยังไปต่อไม่ได้: หลักสูตรไม่ครบ (${incompleteSchools.length} สำนักวิชา)`
                  : 'ถัดไป: หมวดคำแนะนำ (Suggestion)'
              "
              :class="hasIncompleteSchools ? 'opacity-70' : ''"
              @click="handleNextFromSpecial"
            />
            <UButton
              v-else-if="editorActiveTab === 'suggestion'"
              color="primary"
              trailing-icon="i-lucide-arrow-right"
              label="ถัดไป: จำลองมุมมองจริง (Live Simulator)"
              @click="editorActiveTab = 'simulator'"
            />
            <UButton
              v-else-if="editorActiveTab === 'simulator'"
              color="primary"
              icon="i-lucide-check-circle"
              :label="editorForm.isNew ? 'สร้างแบบฟอร์ม' : 'บันทึกการแก้ไข'"
              :loading="saving"
              @click="handleSaveForm"
            />
          </div>
        </div>
      </div>
    </div>

    <!-- LIVE PREVIEW MODAL -->
    <div
      v-if="isPreviewOpen"
      class="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
    >
      <div
        class="flex max-h-[92vh] w-full max-w-4xl flex-col rounded-2xl border border-default bg-default shadow-2xl"
      >
        <!-- Preview Header -->
        <div
          class="flex items-center justify-between border-b border-default px-6 py-4"
        >
          <div>
            <div class="flex items-center gap-2">
              <span
                class="grid size-7 place-items-center rounded-md bg-secondary text-inverted"
              >
                <UIcon name="i-lucide-eye" class="size-4" />
              </span>
              <h2 class="text-lg font-bold text-highlighted">
                ตัวอย่างแบบฟอร์มการประเมินจริง (Live Simulator)
              </h2>
            </div>
            <p class="mt-0.5 text-xs text-muted">
              ทดสอบเลือกสำนักวิชาเพื่อดูว่าโจทย์หมวดทั่วไปและหมวดพิเศษจะแสดงผลอย่างไร
            </p>
          </div>

          <UButton
            color="neutral"
            icon="i-lucide-x"
            size="sm"
            variant="ghost"
            @click="isPreviewOpen = false"
          />
        </div>

        <!-- Simulator Switcher Bar -->
        <div
          class="flex items-center gap-3 border-b border-default bg-muted/20 px-6 py-3"
        >
          <span class="text-xs font-semibold text-highlighted"
            >จำลองมุมมองสำนักวิชา:</span
          >
          <select
            v-model="previewSelectedSchoolId"
            class="h-9 rounded-lg border border-default bg-default px-3 text-xs text-highlighted focus:border-primary focus:outline-none"
          >
            <option value="all">-- แสดงทุกหมวด (All Sections) --</option>
            <option
              v-for="sc in schoolsData?.items"
              :key="sc.id"
              :value="sc.id"
            >
              [{{ sc.schoolCode }}] {{ sc.name.th }}
            </option>
          </select>
          <span class="text-xs text-muted">
            (หมวดทั่วไปและหมวดคำแนะนำจะแสดงผลเสมอ +
            หมวดพิเศษจะแสดงเฉพาะสำนักวิชาที่เลือก)
          </span>
        </div>

        <!-- Preview Form Body (Scrollable) -->
        <div class="flex-1 overflow-y-auto p-6 space-y-6">
          <div class="border-b border-default pb-4">
            <h1 class="text-2xl font-bold text-highlighted">
              {{ editorForm.nameTh }}
            </h1>
            <p class="text-sm text-muted">
              {{ editorForm.nameEn }} ({{ editorForm.code }})
            </p>
          </div>

          <div
            v-for="(sec, sIdx) in previewSections"
            :key="sec.id"
            class="rounded-xl border border-default bg-default p-5 shadow-sm space-y-4"
          >
            <div
              class="flex items-center justify-between border-b border-default pb-3"
            >
              <div class="flex items-center gap-2">
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
                  size="sm"
                />
                <h3 class="text-base font-bold text-highlighted">
                  หมวดที่ {{ sIdx + 1 }}: {{ sec.title.th }}
                </h3>
              </div>

              <span
                v-if="
                  sec.category === 'special' &&
                  schoolMap.get(sec.schoolId || '')
                "
                class="text-xs font-semibold text-secondary"
              >
                สำหรับ: {{ schoolMap.get(sec.schoolId || '')?.name.th }}
                <span v-if="sec.programId && programMap.get(sec.programId)">
                  / {{ programMap.get(sec.programId)?.name.th }}
                </span>
              </span>
            </div>

            <!-- Questions in Section -->
            <div class="space-y-4">
              <div
                v-for="(q, qIdx) in sec.questions"
                :key="q.id"
                class="space-y-2 rounded-lg bg-muted/10 p-3.5"
              >
                <div class="flex items-start justify-between">
                  <p class="text-sm font-medium text-highlighted">
                    {{ qIdx + 1 }}. {{ q.label.th }}
                    <span v-if="q.required" class="text-error font-bold"
                      >*</span
                    >
                  </p>
                  <span class="text-xs text-muted"
                    >น้ำหนัก {{ q.weight ?? 1 }} คะแนน</span
                  >
                </div>
                <p class="text-xs text-muted">{{ q.label.en }}</p>

                <!-- Rating Type Simulator -->
                <div
                  v-if="q.type === 'rating'"
                  class="flex items-center gap-2 pt-2"
                >
                  <button
                    v-for="score in (q.scaleMax ?? 5) - (q.scaleMin ?? 1) + 1"
                    :key="score"
                    type="button"
                    class="flex size-9 items-center justify-center rounded-lg border border-default bg-default text-xs font-semibold hover:border-primary hover:bg-primary/5 focus:bg-primary focus:text-inverted transition-colors"
                  >
                    {{ (q.scaleMin ?? 1) + score - 1 }}
                  </button>
                </div>

                <!-- Text Type Simulator -->
                <div v-else-if="q.type === 'text'" class="pt-1">
                  <textarea
                    rows="2"
                    placeholder="กรอกข้อเสนอแนะหรือความคิดเห็น..."
                    class="w-full rounded-lg border border-default bg-default p-2.5 text-xs text-highlighted"
                  ></textarea>
                </div>

                <!-- Boolean Type Simulator -->
                <div
                  v-else-if="q.type === 'boolean'"
                  class="flex items-center gap-4 pt-1"
                >
                  <label
                    class="flex items-center gap-1.5 text-xs text-highlighted"
                  >
                    <input type="radio" :name="q.id" class="text-primary" />
                    ผ่าน (Yes)
                  </label>
                  <label
                    class="flex items-center gap-1.5 text-xs text-highlighted"
                  >
                    <input type="radio" :name="q.id" class="text-primary" />
                    ไม่ผ่าน (No)
                  </label>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div class="flex justify-end border-t border-default px-6 py-4">
          <UButton
            color="primary"
            label="ปิดหน้าตัวอย่าง"
            @click="isPreviewOpen = false"
          />
        </div>
      </div>
    </div>

    <!-- COPY CRITERIA MODAL -->
    <div
      v-if="isCopyModalOpen"
      class="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
    >
      <div
        class="w-full max-w-md rounded-2xl border border-default bg-default p-6 space-y-4 shadow-2xl"
      >
        <div
          class="flex items-center justify-between border-b border-default pb-3"
        >
          <div class="flex items-center gap-2">
            <span
              class="grid size-7 place-items-center rounded-lg bg-secondary/15 text-secondary"
            >
              <UIcon name="i-lucide-copy" class="size-4" />
            </span>
            <h3 class="text-sm font-bold text-highlighted">
              คัดลอกเกณฑ์การประเมิน
            </h3>
          </div>
          <UButton
            color="neutral"
            icon="i-lucide-x"
            size="xs"
            variant="ghost"
            @click="isCopyModalOpen = false"
          />
        </div>

        <div class="space-y-3 text-xs">
          <p class="text-muted leading-relaxed">
            คัดลอกข้อคำถามจากสำนักวิชาอื่นมายัง
            <strong class="text-secondary font-bold">
              [{{ currentHubSchool?.schoolCode }}]
              {{ currentHubSchool?.name.th }}
            </strong>
          </p>

          <div>
            <label class="block font-semibold text-highlighted mb-1">
              เลือกสำนักวิชาต้นทางที่มีเกณฑ์แล้ว:
            </label>
            <select
              v-model="copySourceSchoolId"
              class="h-10 w-full rounded-lg border border-default bg-default px-3 text-xs text-highlighted focus:border-secondary focus:outline-none"
            >
              <option
                v-for="sc in schoolsWithCriteria"
                :key="sc.id"
                :value="sc.id"
              >
                [{{ sc.schoolCode }}] {{ sc.name.th }} ({{
                  getSchoolQuestionsCount(sc.id)
                }}
                ข้อ)
              </option>
            </select>
          </div>
        </div>

        <div
          class="flex items-center justify-end gap-2 border-t border-default pt-3"
        >
          <UButton
            color="neutral"
            label="ยกเลิก"
            size="sm"
            variant="outline"
            @click="isCopyModalOpen = false"
          />
          <UButton
            color="secondary"
            icon="i-lucide-copy"
            label="ยืนยันการคัดลอก"
            size="sm"
            :disabled="!copySourceSchoolId"
            @click="handleExecuteCopyCriteria"
          />
        </div>
      </div>
    </div>
  </div>
</template>
