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
  status: 'active' | 'archived'
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

interface SchoolProgramStatus {
  schoolId: string
  schoolName: string
  schoolCode: string
  totalPrograms: number
  configuredProgramsCount: number
  isAllProgramsMode: boolean
  isComplete: boolean
  isConfigured: boolean
  missingPrograms: Program[]
  assignedProgramIds: string[]
}

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

const route = useRoute()
const api = useApi()
const auth = useAuthStore()
const toast = useToast()

const _canManage = computed(() =>
  auth.actor?.roles.some((r) => ['systemAdmin', 'internshipStaff'].includes(r))
)

// Active Editor Form State
const editorForm = reactive({
  isNew: true,
  code: '',
  nameTh: '',
  nameEn: '',
  sections: [] as Section[]
})

const editorActiveTab = ref<'general' | 'special' | 'suggestion' | 'simulator'>(
  'general'
)
const selectedForm = ref<CompetencySet | null>(null)
const selectedVersion = ref<CompetencyVersion | null>(null)
const selectedSchoolHubId = ref<string>('')
const schoolSearchQuery = ref('')
const schoolStatusFilter = ref<'all' | 'configured' | 'unconfigured'>('all')
const saving = ref(false)
const publishing = ref(false)
const loadingForm = ref(false)
const previewSelectedSchoolId = ref<string>('')

// Copy Criteria Modal
const isCopyModalOpen = ref(false)
const copySourceSchoolId = ref('')

// Fetch Schools
const { data: schoolsData } = useAsyncData(
  'create-form-schools',
  () =>
    api<PageResult<School>>('/academic/schools', {
      query: { page: 1, pageSize: 100 }
    }),
  { lazy: true }
)

// Auto-select first school or match selectedSchoolHubId for Live Simulator
watch(
  () => schoolsData.value?.items,
  (items) => {
    if (items && items.length > 0 && !previewSelectedSchoolId.value) {
      const first = items[0]
      if (first) {
        previewSelectedSchoolId.value = first.id
      }
    }
  },
  { immediate: true }
)

watch(
  () => editorActiveTab.value,
  (newTab) => {
    if (newTab === 'simulator') {
      if (selectedSchoolHubId.value) {
        previewSelectedSchoolId.value = selectedSchoolHubId.value
      } else if (
        !previewSelectedSchoolId.value &&
        schoolsData.value?.items?.length
      ) {
        const first = schoolsData.value.items[0]
        if (first) {
          previewSelectedSchoolId.value = first.id
        }
      }
    }
  }
)

// Fetch Programs
const { data: programsData } = useAsyncData(
  'create-form-programs',
  () =>
    api<PageResult<Program>>('/academic/programs', {
      query: { page: 1, pageSize: 500 }
    }),
  { lazy: true }
)

// Lookup maps
const schoolMap = computed(() => {
  const map = new Map<string, School>()
  for (const s of schoolsData.value?.items ?? []) {
    map.set(s.id, s)
  }
  return map
})

const programMap = computed(() => {
  const map = new Map<string, Program>()
  for (const p of programsData.value?.items ?? []) {
    map.set(p.id, p)
  }
  return map
})

// Sections Computed
const generalSection = computed(
  () =>
    editorForm.sections.find(
      (s) => s.category === 'general' || (!s.category && !s.schoolId)
    ) as Section | undefined
)

const specialSections = computed(() =>
  editorForm.sections.filter((s) => s.category === 'special' || s.schoolId)
)

const suggestionSections = computed(() =>
  editorForm.sections.filter((s) => s.category === 'suggestion')
)

const previewSections = computed(() => {
  const list: Section[] = []
  if (generalSection.value) list.push(generalSection.value)
  if (previewSelectedSchoolId.value) {
    list.push(
      ...specialSections.value.filter(
        (s) => s.schoolId === previewSelectedSchoolId.value
      )
    )
  }
  list.push(...suggestionSections.value)
  return list
})

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

function getSchoolSection(schoolId: string): Section | undefined {
  return editorForm.sections.find(
    (s) =>
      (s.category === 'special' || s.schoolId) &&
      s.schoolId === schoolId &&
      !s.programId
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
  return sections.length === 1 && !sections[0]?.programId
}

function getAssignedProgramIds(schoolId: string): Set<string> {
  const assigned = new Set<string>()
  for (const sec of getSchoolSections(schoolId)) {
    if (sec.programId) {
      assigned.add(sec.programId)
    }
  }
  return assigned
}

function getUnassignedPrograms(schoolId: string): Program[] {
  const assigned = getAssignedProgramIds(schoolId)
  return getSchoolPrograms(schoolId).filter((p) => !assigned.has(p.id))
}

function canAddProgramToSchool(schoolId: string): boolean {
  if (isSchoolAllProgramsMode(schoolId)) return false
  return getUnassignedPrograms(schoolId).length > 0
}

function isProgramAssignedToAnotherSection(
  programId: string,
  currentSectionId: string
): boolean {
  return editorForm.sections.some(
    (s) =>
      s.id !== currentSectionId &&
      s.programId === programId &&
      s.category === 'special'
  )
}

function getSchoolProgramStatus(schoolId: string): SchoolProgramStatus {
  const school = schoolMap.value.get(schoolId)
  const schoolName = school?.name.th || 'ไม่ทราบสำนักวิชา'
  const schoolCode = school?.schoolCode || ''
  const programs = getSchoolPrograms(schoolId)
  const sections = getSchoolSections(schoolId)
  const configured = sections.some((s) => (s.questions?.length || 0) > 0)

  if (!configured || sections.length === 0) {
    return {
      schoolId,
      schoolName,
      schoolCode,
      totalPrograms: programs.length,
      configuredProgramsCount: 0,
      isAllProgramsMode: false,
      isComplete: false,
      isConfigured: false,
      missingPrograms: programs,
      assignedProgramIds: []
    }
  }

  if (isSchoolAllProgramsMode(schoolId)) {
    return {
      schoolId,
      schoolName,
      schoolCode,
      totalPrograms: programs.length,
      configuredProgramsCount: programs.length,
      isAllProgramsMode: true,
      isComplete: true,
      isConfigured: true,
      missingPrograms: [],
      assignedProgramIds: []
    }
  }

  const assigned = getAssignedProgramIds(schoolId)
  const missing = programs.filter((p) => !assigned.has(p.id))

  return {
    schoolId,
    schoolName,
    schoolCode,
    totalPrograms: programs.length,
    configuredProgramsCount: assigned.size,
    isAllProgramsMode: false,
    isComplete: missing.length === 0,
    isConfigured: true,
    missingPrograms: missing,
    assignedProgramIds: Array.from(assigned)
  }
}

function getSchoolQuestionsCount(schoolId: string): number {
  return getSchoolSections(schoolId).reduce(
    (acc, sec) => acc + (sec.questions?.length || 0),
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

const currentHubSchool = computed(() =>
  (schoolsData.value?.items || []).find(
    (sc) => sc.id === selectedSchoolHubId.value
  )
)

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

const schoolsWithCriteria = computed(() =>
  (schoolsData.value?.items || []).filter(
    (sc) => isSchoolConfigured(sc.id) && sc.id !== selectedSchoolHubId.value
  )
)

const SCHOOL_PRESETS: Record<string, PresetCriteria> = {
  LA: {
    titleTh: 'ทักษะวิชาชีพ: สำนักวิชาศิลปศาสตร์ (Liberal Arts)',
    titleEn: 'Professional Competencies: School of Liberal Arts',
    questions: [
      {
        labelTh: 'ทักษะการสื่อสารภาษาต่างประเทศและการใช้ภาษาเชิงวิชาชีพ',
        labelEn: 'Foreign Language Communication & Professional Usage',
        type: 'rating',
        weight: 2
      },
      {
        labelTh: 'ความเข้าใจบริบททางสังคม ข้ามวัฒนธรรม และมารยาทสากล',
        labelEn: 'Cross-cultural Understanding & International Etiquette',
        type: 'rating',
        weight: 2
      },
      {
        labelTh:
          'การเรียบเรียง การจับใจความ และการถ่ายทอดสารอย่างมีประสิทธิภาพ',
        labelEn: 'Information Synthesis, Writing & Effective Articulation',
        type: 'rating',
        weight: 1
      }
    ]
  },
  SC: {
    titleTh: 'ทักษะวิชาชีพ: สำนักวิชาวิทยาศาสตร์ (Science)',
    titleEn: 'Professional Competencies: School of Science',
    questions: [
      {
        labelTh:
          'ความเข้าใจระเบียบวิธีวิจัย การวิเคราะห์ข้อมูล และเครื่องมือวิทยาศาสตร์',
        labelEn: 'Research Methodology, Scientific Tools & Data Analysis',
        type: 'rating',
        weight: 2
      },
      {
        labelTh:
          'การปฏิบัติตามมาตรฐานความปลอดภัยในห้องปฏิบัติการและพื้นที่ปฏิบัติงาน',
        labelEn: 'Compliance with Laboratory & Workplace Safety Standards',
        type: 'rating',
        weight: 2
      },
      {
        labelTh: 'การบันทึกผลอย่างแม่นยำและการรายงานผลเชิงวิทยาศาสตร์',
        labelEn: 'Accurate Data Recording & Scientific Reporting',
        type: 'rating',
        weight: 1
      }
    ]
  },
  MN: {
    titleTh: 'ทักษะวิชาชีพ: สำนักวิชาการจัดการ (Management)',
    titleEn: 'Professional Competencies: School of Management',
    questions: [
      {
        labelTh: 'การวางแผน การบริหารเวลา และการดำเนินงานตามเป้าหมายธุรกิจ',
        labelEn: 'Project Planning, Time Management & Goal Execution',
        type: 'rating',
        weight: 2
      },
      {
        labelTh: 'การคิดเชิงพาณิชย์ ความเข้าใจความต้องการของลูกค้าและการบริการ',
        labelEn: 'Commercial Acumen, Customer Understanding & Service Quality',
        type: 'rating',
        weight: 2
      },
      {
        labelTh: 'การประสานงานระหว่างหน่วยงานและการแก้ปัญหาเฉพาะหน้าทางธุรกิจ',
        labelEn: 'Cross-functional Coordination & Business Problem-Solving',
        type: 'rating',
        weight: 1
      }
    ]
  },
  IT: {
    titleTh:
      'ทักษะวิชาชีพ: สำนักวิชาเทคโนโลยีสารสนเทศ (Information Technology)',
    titleEn: 'Professional Competencies: School of Information Technology',
    questions: [
      {
        labelTh: 'ทักษะการวิเคราะห์ ออกแบบ และเขียนโปรแกรม/พัฒนาระบบซอฟต์แวร์',
        labelEn: 'Software Engineering, Programming & Systems Design Skills',
        type: 'rating',
        weight: 2
      },
      {
        labelTh:
          'การปฏิบัติตามมาตรฐานการควบคุมเวอร์ชันโค้ด (Git) และความปลอดภัยไซเบอร์',
        labelEn:
          'Compliance with Version Control (Git) & Cyber Security Best Practices',
        type: 'rating',
        weight: 2
      },
      {
        labelTh: 'การค้นคว้าเทคโนโลยีใหม่และการแก้ปัญหาทางเทคนิคด้วยตนเอง',
        labelEn:
          'Self-directed Technical Troubleshooting & Technology Adoption',
        type: 'rating',
        weight: 1
      }
    ]
  },
  AI: {
    titleTh: 'ทักษะวิชาชีพ: สำนักวิชาอุตสาหกรรมเกษตร (Agro-Industry)',
    titleEn: 'Professional Competencies: School of Agro-Industry',
    questions: [
      {
        labelTh:
          'ความเข้าใจมาตรฐานความปลอดภัยอาหารและการควบคุมคุณภาพ (GMP/HACCP)',
        labelEn: 'Food Safety Standards & Quality Control (GMP/HACCP)',
        type: 'rating',
        weight: 2
      },
      {
        labelTh: 'กระบวนการแปรรูป การวิเคราะห์ผลิตภัณฑ์ และสุขาภิบาลโรงงาน',
        labelEn: 'Processing Technologies, Product Analysis & Plant Sanitation',
        type: 'rating',
        weight: 2
      },
      {
        labelTh: 'การตรวจสอบทางประสาทสัมผัสและห้องปฏิบัติการทางเคมี/ชีวภาพ',
        labelEn: 'Sensory Evaluation & Chemical/Biological Lab Testing',
        type: 'rating',
        weight: 1
      }
    ]
  },
  HS: {
    titleTh: 'ทักษะวิชาชีพ: สำนักวิชาวิทยาศาสตร์สุขภาพ (Health Science)',
    titleEn: 'Professional Competencies: School of Health Science',
    questions: [
      {
        labelTh: 'ความรู้ทางวิทยาศาสตร์สุขภาพและการปฏิบัติตามมาตรฐานสุขอนามัย',
        labelEn: 'Health Science Knowledge & Hygiene Standards Practice',
        type: 'rating',
        weight: 2
      },
      {
        labelTh: 'การสื่อสารและการให้ข้อมูลทางสุขภาพอย่างถูกต้องและเหมาะสม',
        labelEn: 'Appropriate & Accurate Health Communication and Education',
        type: 'rating',
        weight: 2
      },
      {
        labelTh: 'จรรยาบรรณวิชาชีพด้านสุขภาพและการรักษาความลับของผู้รับบริการ',
        labelEn:
          'Healthcare Ethics, Professional Demeanor & Patient Confidentiality',
        type: 'rating',
        weight: 1
      }
    ]
  },
  NU: {
    titleTh: 'ทักษะวิชาชีพ: สำนักวิชาพยาบาลศาสตร์ (Nursing)',
    titleEn: 'Professional Competencies: School of Nursing',
    questions: [
      {
        labelTh: 'ทักษะการปฏิบัติการพยาบาลและการดูแลผู้รับบริการตามหลักวิชาการ',
        labelEn: 'Clinical Nursing Skills & Evidence-Based Patient Care',
        type: 'rating',
        weight: 2
      },
      {
        labelTh: 'ความปลอดภัยของผู้ป่วย การควบคุมการติดเชื้อ และการบริหารยา',
        labelEn:
          'Patient Safety, Infection Control & Medication Administration',
        type: 'rating',
        weight: 2
      },
      {
        labelTh:
          'จรรยาบรรณ การเคารพสิทธิผู้ป่วย และการทำงานร่วมกับทีมสหวิชาชีพ',
        labelEn:
          'Professional Ethics, Patient Rights & Interprofessional Teamwork',
        type: 'rating',
        weight: 1
      }
    ]
  },
  MD: {
    titleTh: 'ทักษะวิชาชีพ: สำนักวิชาแพทยศาสตร์ (Medicine)',
    titleEn: 'Professional Competencies: School of Medicine',
    questions: [
      {
        labelTh: 'ทักษะการซักประวัติ ตรวจร่างกาย และวิเคราะห์ปัญหาทางคลินิก',
        labelEn:
          'Clinical History Taking, Physical Examination & Problem Analysis',
        type: 'rating',
        weight: 2
      },
      {
        labelTh:
          'การตัดสินใจทางคลินิกบนพื้นฐานความปลอดภัยและการแพทย์เชิงประจักษ์',
        labelEn: 'Evidence-Based Clinical Decision Making & Patient Safety',
        type: 'rating',
        weight: 2
      },
      {
        labelTh:
          'จรรยาบรรณแพทย์ ความเห็นอกเห็นใจ และการสื่อสารกับผู้ป่วยและญาติ',
        labelEn:
          'Medical Ethics, Compassion & Communication with Patients/Families',
        type: 'rating',
        weight: 1
      }
    ]
  },
  DS: {
    titleTh: 'ทักษะวิชาชีพ: สำนักวิชาทันตแพทยศาสตร์ (Dentistry)',
    titleEn: 'Professional Competencies: School of Dentistry',
    questions: [
      {
        labelTh:
          'ทักษะหัตถการทางทันตกรรมและการจัดการพื้นที่คลินิกอย่างถูกสุขลักษณะ',
        labelEn: 'Dental Operative Skills & Clinical Sterilization Standards',
        type: 'rating',
        weight: 2
      },
      {
        labelTh: 'การประเมินสภาวะช่องปาก การวางแผนการรักษา และการดูแลผู้ป่วย',
        labelEn: 'Oral Assessment, Treatment Planning & Patient Management',
        type: 'rating',
        weight: 2
      },
      {
        labelTh: 'การทำงานร่วมกับผู้ช่วยทันตแพทย์และจรรยาบรรณทางทันตวิชาชีพ',
        labelEn: 'Collaboration with Dental Team & Dental Professional Ethics',
        type: 'rating',
        weight: 1
      }
    ]
  },
  AC: {
    titleTh: 'ทักษะวิชาชีพ: สำนักวิชาการแพทย์บูรณาการ (Integrative Medicine)',
    titleEn: 'Professional Competencies: School of Integrative Medicine',
    questions: [
      {
        labelTh: 'ทักษะการตรวจวินิจฉัยและการประยุกต์ศาสตร์การแพทย์บูรณาการ',
        labelEn:
          'Integrative Medical Assessment & Therapeutic Technique Application',
        type: 'rating',
        weight: 2
      },
      {
        labelTh: 'ความปลอดภัยในการใช้สมุนไพรและหัตถการเฉพาะทาง',
        labelEn:
          'Safety Standards in Herbal Medicine & Specialized Therapeutics',
        type: 'rating',
        weight: 2
      },
      {
        labelTh: 'การสื่อสารองค์ความรู้ด้านสุขภาพแบบองค์รวมแก่ผู้รับบริการ',
        labelEn: 'Holistic Health Consultation & Clear Patient Communication',
        type: 'rating',
        weight: 1
      }
    ]
  },
  AS: {
    titleTh:
      'ทักษะวิชาชีพ: สำนักวิชาเวชศาสตร์ชะลอวัยและฟื้นฟูสุขภาพ (Anti-Aging)',
    titleEn:
      'Professional Competencies: School of Anti-Aging & Regenerative Medicine',
    questions: [
      {
        labelTh: 'ความเข้าใจเวชศาสตร์ชะลอวัย สารอาหารบำบัด และการปรับวิถีชีวิต',
        labelEn:
          'Principles of Anti-Aging, Nutraceuticals & Lifestyle Medicine',
        type: 'rating',
        weight: 2
      },
      {
        labelTh:
          'การวิเคราะห์ผลตรวจทางห้องปฏิบัติการเฉพาะทางและการวางโปรแกรมสุขภาพ',
        labelEn:
          'Specialized Biomarker Interpretation & Wellness Program Design',
        type: 'rating',
        weight: 2
      },
      {
        labelTh:
          'การให้คำปรึกษาด้านสุขภาพและการรักษาความลับข้อมูลสุขภาพส่วนบุคคล',
        labelEn: 'Wellness Coaching Ethics & Personal Health Data Privacy',
        type: 'rating',
        weight: 1
      }
    ]
  },
  LAWS: {
    titleTh: 'ทักษะวิชาชีพ: สำนักวิชานิติศาสตร์ (Law)',
    titleEn: 'Professional Competencies: School of Law',
    questions: [
      {
        labelTh: 'การค้นคว้า ปรับใช้ และตีความข้อกฎหมาย ระเบียบ และคำพิพากษา',
        labelEn: 'Legal Research, Statutory Interpretation & Case Analysis',
        type: 'rating',
        weight: 2
      },
      {
        labelTh: 'ทักษะการร่างสัญญา นิติกรรม และหนังสือราชการ/เอกสารทางกฎหมาย',
        labelEn: 'Legal Drafting, Contracts & Official Documentation Skills',
        type: 'rating',
        weight: 2
      },
      {
        labelTh:
          'จรรยาบรรณนักกฎหมาย ความซื่อสัตย์สุจริต และการรักษาความลับของลูกความ',
        labelEn:
          'Legal Professional Ethics, Integrity & Client Confidentiality',
        type: 'rating',
        weight: 1
      }
    ]
  },
  CO: {
    titleTh: 'ทักษะวิชาชีพ: สำนักวิชาจีนวิทยา (Sinology)',
    titleEn: 'Professional Competencies: School of Sinology',
    questions: [
      {
        labelTh: 'ความเชี่ยวชาญการใช้ภาษาจีนเชิงธุรกิจและวิชาชีพชั้นสูง',
        labelEn: 'Advanced Professional & Business Chinese Proficiency',
        type: 'rating',
        weight: 2
      },
      {
        labelTh:
          'ความเข้าใจวัฒนธรรม ธรรมเนียมปฏิบัติ และการเจรจาต่อรองในบริบทจีน',
        labelEn: 'Chinese Business Culture, Etiquette & Negotiation Dynamics',
        type: 'rating',
        weight: 2
      },
      {
        labelTh: 'การแปลเอกสาร การล่าม และการสื่อสารข้ามวัฒนธรรมอย่างแม่นยำ',
        labelEn:
          'Accurate Translation, Interpretation & Cross-Cultural Delivery',
        type: 'rating',
        weight: 1
      }
    ]
  },
  IS: {
    titleTh: 'ทักษะวิชาชีพ: สำนักวิชานวัตกรรมสังคม (Social Innovation)',
    titleEn: 'Professional Competencies: School of Social Innovation',
    questions: [
      {
        labelTh: 'การคิดเชิงออกแบบ การวิเคราะห์ปัญหาชุมชน และนวัตกรรมทางสังคม',
        labelEn:
          'Design Thinking, Community Needs Analysis & Social Innovation',
        type: 'rating',
        weight: 2
      },
      {
        labelTh:
          'การมีส่วนร่วมกับชุมชน การประสานงานภาคีเครือข่าย และการลงพื้นที่',
        labelEn:
          'Community Engagement, Multi-Stakeholder Facilitation & Fieldwork',
        type: 'rating',
        weight: 2
      },
      {
        labelTh: 'การประเมินผลกระทบทางสังคมและการสื่อสารสร้างการเปลี่ยนแปลง',
        labelEn: 'Social Impact Assessment & Change-Making Communication',
        type: 'rating',
        weight: 1
      }
    ]
  }
}

function initNewForm() {
  editorForm.isNew = true
  editorForm.code = `EVAL-${new Date().getFullYear()}-${Math.floor(100 + Math.random() * 900)}`
  editorForm.nameTh = ''
  editorForm.nameEn = ''

  const baseNow = Date.now()
  const initialSections: Section[] = [
    {
      id: `sec_gen_${baseNow}`,
      title: {
        th: 'หมวด 1: ทักษะทั่วไปและความประพฤติ (Soft Skills)',
        en: 'Section 1: General Skills & Professional Conduct'
      },
      category: 'general',
      questions: [
        {
          id: `q_gen_1`,
          label: {
            th: 'ความตรงต่อเวลาและการปฏิบัติตามกฎระเบียบขององค์กร',
            en: 'Punctuality and Compliance with Workplace Regulations'
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
            th: 'การทำงานร่วมกับผู้อื่นและการสื่อสารในทีม',
            en: 'Teamwork and Workplace Communication'
          },
          type: 'rating',
          required: true,
          weight: 1,
          scaleMin: 1,
          scaleMax: 5
        },
        {
          id: `q_gen_3`,
          label: {
            th: 'ความรับผิดชอบต่องานและความกระตือรือร้นในการเรียนรู้',
            en: 'Task Responsibility and Learning Enthusiasm'
          },
          type: 'rating',
          required: true,
          weight: 1,
          scaleMin: 1,
          scaleMax: 5
        },
        {
          id: `q_gen_4`,
          label: {
            th: 'การปรับตัวและการแก้ปัญหาเฉพาะหน้าในการทำงาน',
            en: 'Adaptability and Practical Problem Solving'
          },
          type: 'rating',
          required: true,
          weight: 1,
          scaleMin: 1,
          scaleMax: 5
        }
      ]
    }
  ]

  // Pre-populate all schools with standard presets
  const schools = schoolsData.value?.items || []
  for (const [idx, school] of schools.entries()) {
    const preset = SCHOOL_PRESETS[school.schoolCode] || {
      titleTh: `ทักษะเฉพาะทาง: สำนักวิชา${school.name.th}`,
      titleEn: `Specialized Skills: ${school.name.en}`,
      questions: [
        {
          labelTh: 'ความรู้ความสามารถทางวิชาการและทักษะเทคนิคในสายงาน',
          labelEn: 'Technical and Academic Knowledge in Field',
          type: 'rating' as const,
          weight: 1
        },
        {
          labelTh: 'การคิดวิเคราะห์ การแก้ปัญหา และการประยุกต์ใช้งานจริง',
          labelEn:
            'Analytical Thinking, Problem Solving & Practical Application',
          type: 'rating' as const,
          weight: 1
        }
      ]
    }
    initialSections.push({
      id: `sec_spec_${school.id}_${baseNow + idx + 1}`,
      title: { th: preset.titleTh, en: preset.titleEn },
      category: 'special',
      schoolId: school.id,
      programId: '',
      questions: preset.questions.map((q, qIdx) => ({
        id: `q_${school.schoolCode.toLowerCase()}_${baseNow + idx + 1}_${qIdx + 1}`,
        label: { th: q.labelTh, en: q.labelEn },
        type: q.type,
        required: true,
        weight: q.weight,
        scaleMin: 1,
        scaleMax: 5
      }))
    })
  }

  // Suggestion section
  initialSections.push({
    id: `sec_sug_${baseNow + 200}`,
    title: {
      th: 'หมวด 3: ข้อคิดเห็นและข้อเสนอแนะเพิ่มเติมสำหรับนักศึกษา',
      en: 'Section 3: Feedback, Strengths & Recommendations'
    },
    category: 'suggestion',
    questions: [
      {
        id: `q_sug_1`,
        label: {
          th: 'จุดเด่นและข้อดีของนักศึกษาที่น่าชื่นชม (Strengths)',
          en: 'Student Strengths and Commendable Professional Qualities'
        },
        type: 'text',
        required: false,
        weight: 0
      },
      {
        id: `q_sug_2`,
        label: {
          th: 'จุดที่ควรพัฒนาและข้อเสนอแนะสำหรับการทำงานในอนาคต (Areas for Improvement)',
          en: 'Areas for Improvement and Guidance for Future Career Growth'
        },
        type: 'text',
        required: false,
        weight: 0
      }
    ]
  })

  editorForm.sections = initialSections
  selectedForm.value = null
  selectedVersion.value = null
  editorActiveTab.value = 'general'
  selectedSchoolHubId.value = schools[0]?.id ?? ''
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
      questions: []
    })
  }
}

function addSection(category: 'special' | 'suggestion') {
  const newSection: Section = {
    id: `sec_${category}_${Date.now()}`,
    title: {
      th:
        category === 'special'
          ? 'หมวดพิเศษ: ทักษะเฉพาะด้าน'
          : 'หมวดคำแนะนำและข้อเสนอแนะ',
      en:
        category === 'special'
          ? 'Special Section: Domain Skills'
          : 'Suggestions & Recommendations'
    },
    category,
    questions: []
  }
  editorForm.sections.push(newSection)
}

function addQuestion(section: Section) {
  section.questions.push({
    id: `q_${Date.now()}`,
    label: { th: '', en: '' },
    type: section.category === 'suggestion' ? 'text' : 'rating',
    required: section.category !== 'suggestion',
    weight: section.category === 'suggestion' ? 0 : 1,
    scaleMin: 1,
    scaleMax: 5
  })
}

function removeQuestion(section: Section, index: number) {
  section.questions.splice(index, 1)
}

function applySchoolPreset(school: School, silent = false) {
  const preset = SCHOOL_PRESETS[school.schoolCode] || {
    titleTh: `ทักษะวิชาชีพเฉพาะทางสำหรับสำนักวิชา${school.name.th}`,
    titleEn: `Specialized Professional Competencies for ${school.name.en}`,
    questions: [
      {
        labelTh: 'ความรู้ความสามารถทางวิชาการและทักษะเทคนิคในสายงาน',
        labelEn: 'Technical and Academic Knowledge in Field',
        type: 'rating',
        weight: 1
      },
      {
        labelTh: 'การประยุกต์ใช้ความรู้และทฤษฎีสู่การปฏิบัติงานจริงในองค์กร',
        labelEn: 'Application of Theoretical Knowledge to Practical Work',
        type: 'rating',
        weight: 1
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
      programId: '',
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

  if (!silent) {
    toast.add({
      title: 'โหลดแม่แบบสำเร็จ',
      description: `เพิ่มเกณฑ์มาตรฐานสำหรับ ${school.name.th} เรียบร้อยแล้ว`,
      color: 'success'
    })
  }
}

function applyAllSchoolPresets() {
  const schools = schoolsData.value?.items || []
  let appliedCount = 0
  for (const school of schools) {
    applySchoolPreset(school, true)
    appliedCount++
  }
  toast.add({
    title: 'โหลดแม่แบบครบทุกสำนักวิชาแล้ว',
    description: `อัปเดตเกณฑ์มาตรฐานครบ ${appliedCount} สำนักวิชาเรียบร้อยแล้ว`,
    color: 'success'
  })
}

function addSpecialSectionForSchool(schoolId: string) {
  const school = schoolMap.value.get(schoolId)
  const newSec: Section = {
    id: `sec_spec_${schoolId}_${Date.now()}`,
    title: {
      th: `ทักษะเฉพาะทางสำหรับสำนักวิชา${school?.name.th || ''}`,
      en: `Specialized Skills for ${school?.name.en || 'School'}`
    },
    category: 'special',
    schoolId,
    programId: '',
    questions: [
      {
        id: `q_${Date.now()}`,
        label: { th: '', en: '' },
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

function addProgramSectionForSchool(schoolId: string, programId?: string) {
  const school = schoolMap.value.get(schoolId)
  const unassigned = getUnassignedPrograms(schoolId)
  const targetProgramId = programId || unassigned[0]?.id || ''
  const program = programMap.value.get(targetProgramId)

  const existingSingle = getSchoolSections(schoolId)
  if (existingSingle.length === 1 && !existingSingle[0]?.programId) {
    const firstAssigned = unassigned[0]?.id || ''
    const firstProg = programMap.value.get(firstAssigned)
    existingSingle[0]!.programId = firstAssigned
    if (firstProg) {
      existingSingle[0]!.title.th = `ทักษะเฉพาะทาง: สาขาวิชา${firstProg.name.th}`
      existingSingle[0]!.title.en = `Specialized Skills: ${firstProg.name.en}`
    }
    if (targetProgramId && targetProgramId !== firstAssigned) {
      const nextProg = programMap.value.get(targetProgramId)
      const newSec: Section = {
        id: `sec_prog_${targetProgramId}_${Date.now()}`,
        title: {
          th: `ทักษะเฉพาะทาง: สาขาวิชา${nextProg?.name.th || ''}`,
          en: `Specialized Skills: ${nextProg?.name.en || 'Program'}`
        },
        category: 'special',
        schoolId,
        programId: targetProgramId,
        questions: [
          {
            id: `q_${Date.now()}`,
            label: { th: '', en: '' },
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
    return
  }

  const newSec: Section = {
    id: `sec_prog_${targetProgramId || Date.now()}_${Date.now()}`,
    title: {
      th: program
        ? `ทักษะเฉพาะทาง: สาขาวิชา${program.name.th}`
        : `ทักษะเฉพาะทางสำหรับสำนักวิชา${school?.name.th || ''}`,
      en: program
        ? `Specialized Skills: ${program.name.en}`
        : `Specialized Skills for ${school?.name.en || 'School'}`
    },
    category: 'special',
    schoolId,
    programId: targetProgramId || undefined,
    questions: [
      {
        id: `q_${Date.now()}`,
        label: { th: '', en: '' },
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

function removeSectionFromSchool(section: Section) {
  const idx = editorForm.sections.findIndex((s) => s.id === section.id)
  if (idx !== -1) {
    editorForm.sections.splice(idx, 1)
  }
}

function onSectionProgramSelect(section: Section, event: Event): void {
  section.programId = (event.target as HTMLSelectElement).value
  onSectionProgramChange(section)
}

function onSectionProgramChange(section: Section) {
  if (section.programId) {
    const prog = programMap.value.get(section.programId)
    if (prog) {
      section.title.th = `ทักษะเฉพาะทาง: สาขาวิชา${prog.name.th}`
      section.title.en = `Specialized Skills: ${prog.name.en}`
    }
  } else {
    const school = section.schoolId
      ? schoolMap.value.get(section.schoolId)
      : null
    section.title.th = `ทักษะเฉพาะทางสำหรับสำนักวิชา${school?.name.th || ''}`
    section.title.en = `Specialized Skills for ${school?.name.en || 'School'}`
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

// Save Form
async function handleSaveForm() {
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
    for (const q of sec.questions) {
      if (q.type === 'rating' && q.weight !== undefined && q.weight > 2) {
        toast.add({
          title: 'ค่าน้ำหนักไม่ถูกต้อง',
          description: `ข้อคำถาม "${q.label.th || q.label.en}" มีค่าน้ำหนักมากกว่า 2 (ระบบกำหนดน้ำหนักต้องไม่เกิน 2)`,
          color: 'error'
        })
        return
      }
    }
  }

  saving.value = true
  try {
    let formId = selectedForm.value?.id

    if (editorForm.isNew || !formId) {
      const createdSet = await api<CompetencySet>('/competency-sets', {
        method: 'POST',
        body: {
          code: editorForm.code.toUpperCase(),
          name: { th: editorForm.nameTh.trim(), en: editorForm.nameEn.trim() },
          status: 'active'
        }
      })
      formId = createdSet.id
    } else {
      await api(`/competency-sets/${formId}`, {
        method: 'PATCH',
        body: {
          name: { th: editorForm.nameTh.trim(), en: editorForm.nameEn.trim() }
        }
      })
    }

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
        weight: q.type === 'rating' ? (q.weight ?? 1) : undefined,
        scaleMin: q.type === 'rating' ? (q.scaleMin ?? 1) : undefined,
        scaleMax: q.type === 'rating' ? (q.scaleMax ?? 5) : undefined
      }))
    }))

    if (selectedVersion.value && selectedVersion.value.status === 'draft') {
      await api(`/competency-set-versions/${selectedVersion.value.id}`, {
        method: 'PATCH',
        body: { sections: sectionsPayload }
      })
    } else {
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

    await navigateTo('/app/evaluations/forms')
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

async function handlePublishVersion(versionId: string) {
  publishing.value = true
  try {
    await api(`/competency-set-versions/${versionId}/publish`, {
      method: 'POST'
    })
    toast.add({
      title: 'เผยแพร่แบบฟอร์มสำเร็จ',
      description: 'แบบฟอร์มนี้เปิดใช้งานสำหรับรอบประเมินแล้ว',
      color: 'success'
    })
    await navigateTo('/app/evaluations/forms')
  } catch (err: unknown) {
    const errorMsg =
      err && typeof err === 'object' && 'message' in err
        ? String(err.message)
        : 'เกิดข้อผิดพลาดในการเผยแพร่แบบฟอร์ม'
    toast.add({
      title: 'เผยแพร่ไม่สำเร็จ',
      description: errorMsg,
      color: 'error'
    })
  } finally {
    publishing.value = false
  }
}

// Lifecycle
onMounted(async () => {
  const formId = (route.query.id as string) || ''
  const isPreview = route.query.preview === 'true'

  if (formId) {
    loadingForm.value = true
    try {
      const form = await api<CompetencySet>(`/competency-sets/${formId}`)
      selectedForm.value = form
      editorForm.isNew = false
      editorForm.code = form.code
      editorForm.nameTh = form.name.th
      editorForm.nameEn = form.name.en

      const versions = await api<CompetencyVersion[]>(
        `/competency-sets/${formId}/versions`
      )
      const latest = versions?.[0]
      if (latest) {
        selectedVersion.value = latest
        const loadedSections = JSON.parse(
          JSON.stringify(latest.sections || [])
        ) as Section[]
        editorForm.sections = loadedSections.map((sec) => ({
          ...sec,
          programId: sec.programId || ''
        }))
      } else {
        selectedVersion.value = null
        editorForm.sections = []
      }
      ensureGeneralSection()

      if (isPreview) {
        editorActiveTab.value = 'simulator'
      }
    } catch {
      toast.add({
        title: 'โหลดแบบฟอร์มไม่สำเร็จ',
        description: 'ไม่พบข้อมูลแบบฟอร์มที่ระบุ',
        color: 'error'
      })
      initNewForm()
    } finally {
      loadingForm.value = false
    }
  } else {
    initNewForm()
  }
})
</script>

<template>
  <div class="space-y-6">
    <!-- Top Action / Back Header -->
    <div
      class="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between"
    >
      <div class="flex items-center gap-3 min-w-0">
        <UButton
          to="/app/evaluations/forms"
          icon="i-lucide-arrow-left"
          variant="outline"
          color="neutral"
          size="sm"
          class="shrink-0"
          aria-label="กลับไปหน้ารายการแบบฟอร์ม"
          title="กลับไปหน้ารายการแบบฟอร์ม"
        />
        <div class="min-w-0">
          <div class="flex items-center gap-2 flex-wrap">
            <span
              class="grid size-8 shrink-0 place-items-center rounded-lg bg-primary text-inverted"
            >
              <UIcon name="i-lucide-sliders" class="size-4" />
            </span>
            <h1 class="text-xl sm:text-2xl font-bold text-highlighted truncate">
              {{
                editorForm.isNew
                  ? 'สร้างแบบฟอร์มการประเมินใหม่'
                  : `แก้ไขแบบฟอร์ม: ${editorForm.code}`
              }}
            </h1>
            <UBadge
              :color="editorForm.isNew ? 'primary' : 'neutral'"
              :label="editorForm.isNew ? 'แบบร่างใหม่' : editorForm.code"
              size="xs"
              variant="subtle"
            />
          </div>
          <p class="mt-1 text-xs sm:text-sm text-muted">
            กำหนดเกณฑ์ประเมินสมรรถนะ หมวดทั่วไป (Core), หมวดเฉพาะสำนักวิชา
            (School Hub) และหมวดคำแนะนำ (Suggestion)
          </p>
        </div>
      </div>

      <div class="flex flex-wrap items-center gap-2">
        <UButton
          color="neutral"
          icon="i-lucide-eye"
          label="จำลองมุมมองจริง (Live Simulator)"
          size="sm"
          variant="outline"
          @click="editorActiveTab = 'simulator'"
        />
        <UButton
          color="primary"
          icon="i-lucide-save"
          :label="editorForm.isNew ? 'บันทึกแบบฟอร์ม' : 'บันทึกการแก้ไข'"
          :loading="saving"
          size="sm"
          @click="handleSaveForm"
        />
      </div>
    </div>

    <!-- Stepped Tabs Navigation Header (Sticky on scroll) -->
    <div
      class="sticky top-2 z-10 rounded-xl border border-default bg-default/95 backdrop-blur-md px-3 sm:px-4 py-2 shadow-xs"
    >
      <div
        class="flex flex-col items-stretch sm:flex-row sm:items-center justify-between gap-3"
      >
        <div
          class="flex min-w-0 flex-1 items-center gap-2 overflow-x-auto whitespace-nowrap scrollbar-none"
        >
          <!-- Tab 1: ข้อมูลทั่วไป & หมวดกลาง -->
          <button
            type="button"
            class="flex items-center gap-2 rounded-lg px-3.5 py-1.5 text-xs font-semibold transition-all cursor-pointer shrink-0"
            :class="
              editorActiveTab === 'general'
                ? 'bg-primary/10 text-primary ring-1 ring-primary/40 font-bold'
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
                ? 'bg-secondary/10 text-secondary ring-1 ring-secondary/40 font-bold'
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
              :label="`${configuredSchoolsCount}/${schoolsData?.items.length || 14} สำนักวิชา (${specialSections.length} หมวด)`"
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
                ? 'bg-amber-500/10 text-amber-600 dark:text-amber-400 ring-1 ring-amber-500/40 font-bold'
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

        <!-- Tab 4: Live Simulator Shortcut -->
        <button
          type="button"
          class="flex items-center gap-1.5 rounded-lg border border-default px-3 py-1.5 text-xs font-semibold transition-all cursor-pointer shrink-0"
          :class="
            editorActiveTab === 'simulator'
              ? 'bg-primary text-inverted border-primary shadow-xs font-bold'
              : 'bg-default text-highlighted hover:bg-muted/30'
          "
          @click="editorActiveTab = 'simulator'"
        >
          <UIcon name="i-lucide-eye" class="size-3.5" />
          <span>จำลองมุมมองจริง (Live Simulator)</span>
        </button>
      </div>
    </div>

    <!-- Main Workspace Container -->
    <div
      class="rounded-2xl border border-default bg-default p-4 sm:p-6 shadow-xs min-h-[500px]"
    >
      <div v-if="loadingForm" class="py-16 text-center text-muted">
        <UIcon
          name="i-lucide-loader"
          class="size-8 animate-spin mx-auto mb-3"
        />
        <p class="font-medium">กำลังโหลดข้อมูลแบบฟอร์ม...</p>
      </div>

      <!-- ================================================================= -->
      <!-- PANEL 1: ข้อมูลทั่วไป & หมวดทั่วไป (Core) -->
      <!-- ================================================================= -->
      <div v-else-if="editorActiveTab === 'general'" class="space-y-6">
        <!-- Form Settings Bar -->
        <div class="rounded-xl border border-default bg-muted/10 p-4 space-y-3">
          <div class="flex items-center justify-between">
            <h3
              class="text-xs font-bold text-highlighted flex items-center gap-2"
            >
              <UIcon name="i-lucide-info" class="size-4 text-primary" />
              <span>ข้อมูลทั่วไปของแบบฟอร์ม (Form Information)</span>
            </h3>
            <span class="text-[11px] text-muted">
              ทุกคนในทุกสำนักวิชาจะได้รับเกณฑ์ในหมวดนี้เหมือนกันทั้งหมด (General
              Core Competencies)
            </span>
          </div>

          <div class="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div>
              <label
                for="form-code-input"
                class="block text-xs font-semibold text-highlighted"
              >
                รหัสแบบฟอร์ม <span class="text-error">*</span>
              </label>
              <input
                id="form-code-input"
                v-model="editorForm.code"
                type="text"
                aria-label="รหัสแบบฟอร์ม"
                :disabled="!editorForm.isNew"
                placeholder="เช่น EVAL-2026-ALL"
                class="mt-1 h-9 w-full rounded-lg border border-default bg-default px-3 font-mono text-xs uppercase text-highlighted focus:border-primary focus:outline-none disabled:opacity-60 disabled:cursor-not-allowed"
              />
            </div>
            <div>
              <label
                for="form-name-th-input"
                class="block text-xs font-semibold text-highlighted"
              >
                ชื่อแบบฟอร์มภาษาไทย <span class="text-error">*</span>
              </label>
              <input
                id="form-name-th-input"
                v-model="editorForm.nameTh"
                type="text"
                aria-label="ชื่อแบบฟอร์มภาษาไทย"
                placeholder="เช่น แบบประเมินการฝึกงานประจำปี 2026"
                class="mt-1 h-9 w-full rounded-lg border border-default bg-default px-3 text-xs text-highlighted focus:border-primary focus:outline-none"
              />
            </div>
            <div>
              <label
                for="form-name-en-input"
                class="block text-xs font-semibold text-highlighted"
              >
                ชื่อแบบฟอร์มภาษาอังกฤษ <span class="text-error">*</span>
              </label>
              <input
                id="form-name-en-input"
                v-model="editorForm.nameEn"
                type="text"
                aria-label="ชื่อแบบฟอร์มภาษาอังกฤษ"
                placeholder="เช่น Internship Evaluation Form 2026"
                class="mt-1 h-9 w-full rounded-lg border border-default bg-default px-3 text-xs text-highlighted focus:border-primary focus:outline-none"
              />
            </div>
          </div>
        </div>

        <!-- General Section Content -->
        <div v-if="generalSection" class="space-y-4">
          <div
            class="rounded-xl border border-primary/25 bg-primary/[0.01] p-4 sm:p-5 space-y-4"
          >
            <!-- Section Header Row -->
            <div
              class="flex flex-wrap items-center justify-between gap-3 border-b border-primary/15 pb-3"
            >
              <div class="flex-1 grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <label class="block text-[11px] font-semibold text-primary">
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

              <div class="flex items-center gap-2">
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

            <!-- Questions List -->
            <div class="space-y-2.5">
              <div
                v-for="(q, qIndex) in generalSection.questions"
                :key="q.id"
                class="rounded-lg border border-default bg-default p-3 space-y-2.5 shadow-2xs hover:border-primary/40 transition-colors"
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

                <!-- Row 2: Config Toolbar -->
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
                        <option value="text">📝 ความเห็นปลายเปิด (Text)</option>
                        <option value="boolean">☑️ ใช่/ไม่ใช่ (Yes/No)</option>
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
                        min="0.5"
                        max="2"
                        step="0.5"
                        title="ค่าน้ำหนักต้องไม่เกิน 2"
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
      <div v-else-if="editorActiveTab === 'special'" class="space-y-4">
        <!-- Subtitle & Stats Bar -->
        <div
          class="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-secondary/20 bg-secondary/[0.04] px-4 py-2.5 text-xs"
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
          <div class="flex flex-wrap items-center gap-2 min-w-0">
            <UButton
              color="secondary"
              size="xs"
              variant="soft"
              icon="i-lucide-sparkles"
              label="⚡ โหลดแม่แบบมาตรฐานครบทุกสำนักวิชา (14 สำนัก)"
              @click="applyAllSchoolPresets"
            />
            <UBadge
              :color="configuredSchoolsCount > 0 ? 'success' : 'neutral'"
              :label="`กำหนดแล้ว ${configuredSchoolsCount} สำนักวิชา`"
              size="xs"
              variant="subtle"
            />
            <UBadge
              v-if="
                (schoolsData?.items.length || 14) - configuredSchoolsCount > 0
              "
              color="neutral"
              :label="`ยังว่าง ${(schoolsData?.items.length || 14) - configuredSchoolsCount} สำนักวิชา`"
              size="xs"
              variant="subtle"
            />
          </div>
        </div>

        <!-- Master-Detail 2-Column Layout -->
        <div class="grid grid-cols-12 gap-4">
          <!-- LEFT COLUMN: SCHOOL DIRECTORY -->
          <div
            class="col-span-12 md:col-span-4 lg:col-span-4 xl:col-span-3 flex flex-col rounded-2xl border border-default bg-default p-3 shadow-xs space-y-2.5 max-h-[700px]"
          >
            <div class="shrink-0 space-y-2">
              <UInput
                v-model="schoolSearchQuery"
                icon="i-lucide-search"
                placeholder="ค้นหาสำนักวิชา..."
                size="xs"
              />
              <div class="flex items-center gap-1 text-[11px]">
                <button
                  type="button"
                  class="rounded-md px-2 py-0.5 transition-all cursor-pointer"
                  :class="
                    schoolStatusFilter === 'all'
                      ? 'bg-secondary text-inverted font-bold'
                      : 'bg-muted/20 text-muted hover:text-highlighted'
                  "
                  @click="schoolStatusFilter = 'all'"
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
                  @click="schoolStatusFilter = 'configured'"
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
                  @click="schoolStatusFilter = 'unconfigured'"
                >
                  ยังไม่ตั้ง ({{
                    (schoolsData?.items.length || 0) - configuredSchoolsCount
                  }})
                </button>
              </div>
            </div>

            <!-- School List -->
            <div class="flex-1 overflow-y-auto space-y-1 pr-1">
              <button
                v-for="school in filteredSchools"
                :key="school.id"
                type="button"
                class="group flex w-full items-center justify-between gap-2 rounded-xl border px-3 py-2 text-left transition-all cursor-pointer"
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
              </button>
            </div>
          </div>

          <!-- RIGHT COLUMN: ACTIVE SCHOOL WORKSTATION -->
          <div
            class="col-span-12 md:col-span-8 lg:col-span-8 xl:col-span-9 flex flex-col rounded-2xl border border-default bg-muted/[0.02] p-4 shadow-xs space-y-3 min-h-[600px]"
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

              <!-- Quick Action Buttons -->
              <div class="flex flex-wrap items-center gap-2">
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
                      ? addQuestion(getSchoolSections(currentHubSchool.id)[0]!)
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
                  เกณฑ์นี้มีผลครอบคลุม<strong>ทุกหลักสูตรในสำนักวิชา</strong>
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
                <UIcon name="i-lucide-check-circle" class="size-4 shrink-0" />
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
              class="flex flex-col items-center justify-center rounded-xl border-2 border-dashed border-default/70 p-8 text-center space-y-3 my-auto"
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

            <!-- Configured Questions -->
            <div
              v-else-if="
                currentHubSchool && isSchoolConfigured(currentHubSchool.id)
              "
              class="space-y-4"
            >
              <div
                v-for="section in currentHubSchool
                  ? getSchoolSections(currentHubSchool.id)
                  : []"
                :key="section.id"
                class="rounded-xl border border-secondary/30 bg-secondary/[0.02] p-4 space-y-3"
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
                          [{{ programMap.get(section.programId)?.programCode }}]
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
                        :value="section.programId || ''"
                        class="mt-0.5 h-8 w-full rounded-md border border-default bg-default px-2 text-xs text-highlighted focus:border-secondary focus:outline-none"
                        @change="onSectionProgramSelect(section, $event)"
                      >
                        <option value="">
                          🌐 ทุกหลักสูตรในสำนักวิชา (ใช้เกณฑ์ร่วมกัน)
                        </option>
                        <option
                          v-for="prog in getSchoolPrograms(currentHubSchool.id)"
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

                <!-- Questions List -->
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
                      <div class="flex-1 grid grid-cols-1 gap-2 sm:grid-cols-2">
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

                    <!-- Row 2: Config Toolbar -->
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
                            min="0.5"
                            max="2"
                            step="0.5"
                            title="ค่าน้ำหนักต้องไม่เกิน 2"
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
        </div>
      </div>

      <!-- ================================================================= -->
      <!-- PANEL 3: หมวดคำแนะนำ (SUGGESTION) -->
      <!-- ================================================================= -->
      <div v-else-if="editorActiveTab === 'suggestion'" class="space-y-4">
        <!-- Info Callout -->
        <div
          class="flex items-center justify-between gap-3 rounded-xl border border-amber-500/20 bg-amber-500/[0.04] px-4 py-2.5 text-xs"
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
              >— คำถามปลายเปิดสำหรับให้ผู้ประเมินบันทึกจุดเด่น สิ่งที่ควรพัฒนา
              หรือคำแนะนำแก่นักศึกษา</span
            >
          </div>
        </div>

        <!-- Suggestion Sections List -->
        <div class="space-y-4">
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
            class="rounded-xl border border-amber-500/30 bg-amber-500/[0.02] p-4 sm:p-5 space-y-4"
          >
            <!-- Header -->
            <div
              class="flex flex-wrap items-center justify-between gap-3 border-b border-amber-500/20 pb-3"
            >
              <div class="flex-1 grid grid-cols-1 gap-3 sm:grid-cols-2">
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
                    class="mt-0.5 h-8 w-full rounded-md border border-default bg-default px-2.5 text-xs text-highlighted focus:border-amber-500 focus:outline-none"
                  />
                </div>
              </div>

              <div class="flex items-center gap-2">
                <UButton
                  color="warning"
                  icon="i-lucide-plus"
                  label="เพิ่มข้อความเห็น"
                  size="xs"
                  variant="subtle"
                  @click="addQuestion(section)"
                />
              </div>
            </div>

            <!-- Questions -->
            <div class="space-y-2.5">
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
                  <div class="flex-1 grid grid-cols-1 gap-2 sm:grid-cols-2">
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

      <!-- ================================================================= -->
      <!-- PANEL 4: LIVE SIMULATOR (จำลองมุมมองจริง) -->
      <!-- ================================================================= -->
      <div
        v-else-if="editorActiveTab === 'simulator'"
        data-testid="form-simulator-scroll"
        class="space-y-6"
      >
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
                class="rounded-lg border border-default bg-default px-3 py-1.5 text-xs font-bold text-primary focus:outline-none"
              >
                <option
                  v-for="sc in schoolsData?.items || []"
                  :key="sc.id"
                  :value="sc.id"
                >
                  [{{ sc.schoolCode }}] {{ sc.name.th }}
                  {{
                    isSchoolConfigured(sc.id)
                      ? `(${getSchoolQuestionsCount(sc.id)} ข้อ)`
                      : '(ไม่มีเกณฑ์)'
                  }}
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
                  previewSections.reduce((t, s) => t + s.questions.length, 0)
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

        <!-- Rendered Sections Simulator View -->
        <div class="space-y-6 max-w-4xl mx-auto">
          <div
            v-for="sec in previewSections"
            :key="sec.id"
            class="rounded-xl border border-default bg-default p-5 shadow-xs space-y-4"
          >
            <div class="border-b border-default pb-3">
              <div class="flex items-center gap-2">
                <UBadge
                  :color="
                    sec.category === 'general'
                      ? 'primary'
                      : sec.category === 'special'
                        ? 'secondary'
                        : 'warning'
                  "
                  :label="
                    sec.category === 'general'
                      ? 'หมวดทั่วไป'
                      : sec.category === 'special'
                        ? `เฉพาะทาง: ${schoolMap.get(sec.schoolId || '')?.schoolCode || 'School'}`
                        : 'ข้อเสนอแนะ'
                  "
                  size="xs"
                />
                <h5 class="text-sm font-bold text-highlighted">
                  {{ sec.title.th }}
                </h5>
              </div>
              <p v-if="sec.title.en" class="text-xs text-muted mt-0.5">
                {{ sec.title.en }}
              </p>
            </div>

            <div class="space-y-4">
              <div
                v-for="(q, qIdx) in sec.questions"
                :key="q.id"
                class="rounded-lg border border-default/70 p-4 space-y-2 bg-muted/[0.02]"
              >
                <div class="flex items-start justify-between gap-3">
                  <div class="flex items-start gap-2.5">
                    <span
                      class="grid size-6 shrink-0 place-items-center rounded-md bg-muted/30 text-xs font-bold text-highlighted"
                    >
                      {{ qIdx + 1 }}
                    </span>
                    <div>
                      <p class="text-xs font-bold text-highlighted">
                        {{ q.label.th || '(ยังไม่ได้ระบุคำถามภาษาไทย)' }}
                        <span v-if="q.required" class="text-error">*</span>
                      </p>
                      <p v-if="q.label.en" class="text-[11px] text-muted">
                        {{ q.label.en }}
                      </p>
                    </div>
                  </div>
                </div>

                <!-- Rating Simulator -->
                <div v-if="q.type === 'rating'" class="pt-2">
                  <div class="flex items-center gap-3">
                    <div
                      v-for="val in (q.scaleMax || 5) - (q.scaleMin || 1) + 1"
                      :key="val"
                      class="flex flex-col items-center gap-1"
                    >
                      <span
                        class="size-8 rounded-lg border border-default grid place-items-center text-xs font-bold text-muted hover:border-primary hover:text-primary cursor-pointer"
                      >
                        {{ (q.scaleMin || 1) + val - 1 }}
                      </span>
                    </div>
                    <span class="text-[11px] text-muted ml-2">
                      (คะแนน {{ q.scaleMin || 1 }} - {{ q.scaleMax || 5 }})
                    </span>
                  </div>
                </div>

                <!-- Textarea Simulator -->
                <div v-else-if="q.type === 'text'" class="pt-2">
                  <textarea
                    rows="3"
                    disabled
                    placeholder="พิมพ์ความคิดเห็นหรือข้อเสนอแนะที่นี่..."
                    class="w-full rounded-lg border border-default bg-muted/20 p-2.5 text-xs text-muted"
                  />
                </div>

                <!-- Boolean Simulator -->
                <div
                  v-else-if="q.type === 'boolean'"
                  class="pt-2 flex items-center gap-4"
                >
                  <label
                    class="flex items-center gap-1.5 text-xs cursor-pointer"
                  >
                    <input type="radio" disabled name="demo" /> ใช่ / ผ่าน
                  </label>
                  <label
                    class="flex items-center gap-1.5 text-xs cursor-pointer"
                  >
                    <input type="radio" disabled name="demo" /> ไม่ใช่ / ไม่ผ่าน
                  </label>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Pinned Bottom Action Bar -->
    <div
      class="sticky bottom-3 z-10 rounded-xl border border-default bg-default/95 backdrop-blur-md px-4 sm:px-6 py-3.5 shadow-lg flex flex-wrap items-center justify-between gap-3"
    >
      <div class="flex items-center gap-2">
        <UButton
          v-if="editorActiveTab === 'general'"
          color="neutral"
          label="ยกเลิก"
          variant="outline"
          to="/app/evaluations/forms"
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
        <!-- Quick Save -->
        <UButton
          v-if="editorActiveTab !== 'simulator'"
          color="neutral"
          variant="ghost"
          icon="i-lucide-save"
          :label="editorForm.isNew ? 'บันทึกทันที' : 'บันทึกการแก้ไข'"
          :loading="saving"
          @click="handleSaveForm"
        />

        <!-- Next / Final Buttons -->
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

    <!-- COPY CRITERIA MODAL -->
    <AppModal
      v-if="isCopyModalOpen"
      :open="true"
      title="คัดลอกเกณฑ์ประเมินจากสำนักวิชาอื่น"
      :ui="{ content: 'w-full max-w-lg' }"
      @update:open="
        ($event) => {
          if (!$event) isCopyModalOpen = false
        }
      "
    >
      <div class="space-y-4 p-5">
        <div class="space-y-1">
          <p class="text-xs text-muted">
            เลือกสำนักวิชาต้นแบบที่มีการกำหนดเกณฑ์เรียบร้อยแล้ว
            เพื่อนำเข้าข้อคำถามมายัง
            <strong class="text-secondary">{{
              currentHubSchool?.name.th
            }}</strong>
          </p>
        </div>

        <div>
          <label class="block text-xs font-semibold text-highlighted mb-1">
            สำนักวิชาต้นทาง
          </label>
          <select
            v-model="copySourceSchoolId"
            class="w-full rounded-lg border border-default bg-default p-2 text-xs text-highlighted focus:border-secondary focus:outline-none"
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

        <div
          class="flex items-center justify-end gap-2 pt-2 border-t border-default"
        >
          <UButton
            color="neutral"
            label="ยกเลิก"
            size="xs"
            variant="ghost"
            @click="isCopyModalOpen = false"
          />
          <UButton
            color="secondary"
            icon="i-lucide-copy"
            label="คัดลอกข้อคำถามมายังสำนักวิชานี้"
            size="xs"
            @click="handleExecuteCopyCriteria"
          />
        </div>
      </div>
    </AppModal>
  </div>
</template>
