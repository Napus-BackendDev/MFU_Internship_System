<script setup lang="ts">
import * as XLSX from 'xlsx'
import { loadAllPages, type PaginatedItems } from '~/utils/load-all-pages'
import {
  buildStudentEvaluationResult,
  formatCategoryAverage,
  type EvaluationCategoryScore,
  type StudentEvaluationRecord
} from '~/utils/student-evaluation-result'
import { resolveAssignmentForCycle } from '~/utils/cycle-assignment'
import { buildStudentDirectoryExportRows } from '~/utils/student-directory-export'

interface LocalizedText {
  readonly th: string
  readonly en: string
}

export interface StudentItem {
  readonly id: string
  readonly studentId: string
  readonly name: LocalizedText
  readonly email: string
  readonly personalEmail?: string
  readonly schoolId: string
  readonly programId: string
  readonly courseId?: string
  readonly course?: string
  readonly academicTermId?: string
  readonly academicYear?: number
  readonly company?: string
  readonly companyAddress?: string
  readonly province?: string
  readonly semester?: string
  readonly admissionYear?: number
  readonly status: string
  readonly evaluationStatus?: string
  readonly advisor?: LocalizedText
  readonly directoryRelations?: {
    readonly school?: SchoolItem
    readonly program?: ProgramItem
    readonly course?: CourseItem
    readonly term?: {
      readonly id: string
      readonly semester: string
      readonly academicYear: number
    }
    readonly assignments: EvaluationAssignmentItem[]
    readonly placements: PlacementItem[]
  }
}

export interface CourseItem {
  readonly id: string
  readonly courseCode?: string
  readonly programIds?: string[]
  readonly name: LocalizedText
}

export interface OrganizationItem {
  readonly id: string
  readonly organizationCode?: string
  readonly name?: LocalizedText
  readonly address?: Readonly<Record<string, string>>
}

export interface SchoolItem {
  readonly id: string
  readonly schoolCode: string
  readonly name: LocalizedText
}

export interface ProgramItem {
  readonly id: string
  readonly schoolId: string
  readonly programCode: string
  readonly name: LocalizedText
}

export interface EvaluatorItem {
  readonly id: string
  readonly organizationId?: string
  readonly name: LocalizedText
  readonly email: string
  readonly position?: LocalizedText
}

export interface EvaluationAssignmentItem {
  readonly id: string
  readonly studentId: string
  readonly cycleId?: string
  readonly placementId?: string
  readonly evaluatorId: string
  readonly deadlineAt: string
  readonly status:
    | 'pending'
    | 'inProgress'
    | 'submitted'
    | 'expired'
    | 'reopened'
    | 'email_error'
  readonly categoryScores?: {
    readonly hardSkill: EvaluationCategoryScore
    readonly softSkill: EvaluationCategoryScore
    readonly scoringPolicyVersion: string
  }
  readonly evaluator?: EvaluatorItem
}

export interface PlacementItem {
  readonly id: string
  readonly studentId: string
  readonly organizationId: string
  readonly academicTermId?: string
  readonly academicTerm?: {
    readonly id: string
    readonly semester: string
    readonly academicYear: number
  }
  readonly positionTitle?: LocalizedText
  readonly startsAt?: string
  readonly endsAt?: string
  readonly status: string
  readonly organization?: OrganizationItem
}

export interface EvaluationCycleItem {
  readonly id: string
  readonly code: string
  readonly name: LocalizedText
  readonly academicTermId: string
  readonly academicTerm?: {
    readonly id: string
    readonly academicYear: number
    readonly semester: string
  }
  readonly status: 'draft' | 'active' | 'closed'
}

interface StudentDirectoryData {
  readonly summary: {
    readonly all: number
    readonly submitted: number
    readonly inProgress: number
    readonly emailError: number
    readonly pending: number
    readonly expired: number
    readonly assignmentAmbiguous: number
  }
  readonly facets: {
    readonly academicYears: number[]
    readonly semesters: string[]
    readonly schoolIds: string[]
    readonly schools: SchoolItem[]
    readonly statuses: string[]
  }
}

interface StudentDirectoryResponse extends PaginatedItems<StudentItem> {
  readonly directory?: StudentDirectoryData
}

const props = withDefaults(
  defineProps<{
    cycles?: EvaluationCycleItem[]
    cycleLoadError?: string
    refreshVersion?: number
  }>(),
  {
    cycles: () => [],
    cycleLoadError: '',
    refreshVersion: 0
  }
)

const emit = defineEmits<{
  (e: 'refresh'): void
  (
    e: 'openDocument',
    payload: { type: 'certification' | 'referral'; row: EnrichedStudentRow }
  ): void
}>()

const toast = useToast()
const api = useApi()
const directoryStudents = ref<StudentItem[]>([])
const directoryTotal = ref(0)
const directoryData = ref<StudentDirectoryData | null>(null)
const directoryLoading = ref(false)
const directoryError = ref('')
const exportLoading = ref(false)
let directoryRequestVersion = 0
let directoryFacetKey = ''

// Filter states
const selectedYear = ref<string>('all')
const selectedSemester = ref<string>('all')
const selectedSchool = ref<string>('all')
const selectedCycleId = ref<string>('all')
const selectedStatus = ref<string>('all')
const searchQuery = ref<string>('')
const exportMenuOpen = ref<boolean>(false)
let cycleSelectionChanged: boolean = false

function markCycleSelectionChanged(): void {
  cycleSelectionChanged = true
}

watch(
  () => props.cycles,
  (cycles) => {
    if (
      selectedCycleId.value !== 'all' &&
      !cycles.some((cycle) => cycle.id === selectedCycleId.value)
    ) {
      selectedCycleId.value = 'all'
    }
    if (!cycleSelectionChanged && selectedCycleId.value === 'all') {
      const activeCycles = cycles.filter((cycle) => cycle.status === 'active')
      if (activeCycles.length === 1 && !props.cycleLoadError) {
        selectedCycleId.value = activeCycles[0]!.id
      }
    }
  },
  { immediate: true }
)

function cycleOptionLabel(cycle: EvaluationCycleItem): string {
  const term = cycle.academicTerm
  const termLabel = term
    ? `${term.semester} ${term.academicYear}`
    : cycle.academicTermId
  const cycleName = cycle.name.th || cycle.name.en
  return `${cycle.code} — ${cycleName} · ${termLabel} (${cycle.status})`
}

// Detail modal state
const detailModalOpen = ref<boolean>(false)
const activeStudentRow = ref<EnrichedStudentRow | null>(null)
const evaluationResult = ref<ReturnType<
  typeof buildStudentEvaluationResult
> | null>(null)
const evaluationResultLoading = ref(false)
const evaluationResultError = ref('')
let evaluationRequestVersion = 0

interface EvaluationReadResponse {
  readonly evaluations?: readonly (StudentEvaluationRecord & {
    readonly id: string
    readonly supersededAt?: string
  })[]
}

export interface EnrichedStudentRow {
  student: StudentItem
  assignment?: EvaluationAssignmentItem
  evaluator?: EvaluatorItem
  school?: SchoolItem
  program?: ProgramItem
  placement?: PlacementItem
  studentId: string
  nameTh: string
  nameEn: string
  email: string
  personalEmail: string
  schoolTh: string
  schoolEn: string
  schoolCode: string
  programTh: string
  programEn: string
  programCode: string
  courseId?: string
  courseTh: string
  courseEn: string
  courseDisplay: string
  academicYear: number | string
  academicYearEn: number | string
  semester: string
  company: string
  companyAddress: string
  province: string
  advisorTh: string
  advisorEn: string
  evaluatorTh: string
  evaluatorEn: string
  evaluatorPositionTh: string
  evaluatorPositionEn: string
  evaluatorEmail: string
  status:
    | 'pending'
    | 'inProgress'
    | 'submitted'
    | 'expired'
    | 'reopened'
    | 'email_error'
    | 'cycle_unselected'
    | 'assignment_ambiguous'
    | 'assignment_load_error'
  statusTh: string
  statusEn: string
  hardSkillScore?: EvaluationCategoryScore
  softSkillScore?: EvaluationCategoryScore
  commentsTh: string
  commentsEn: string
}

// Enrich current server page. Excel export reloads all matching pages on demand.
function enrichStudents(
  studentsList: readonly StudentItem[]
): EnrichedStudentRow[] {
  const selectedCycle = props.cycles.find(
    (cycle) => cycle.id === selectedCycleId.value
  )
  const selectedTerm = selectedCycle?.academicTerm
  return studentsList.map((student) => {
    const school = student.directoryRelations?.school
    const program = student.directoryRelations?.program
    const course = student.directoryRelations?.course

    const studentAssignments = student.directoryRelations?.assignments ?? []
    const studentPlacements = student.directoryRelations?.placements ?? []
    const termPlacementId =
      selectedCycle?.academicTermId ?? student.academicTermId
    const termPlacement = termPlacementId
      ? studentPlacements.find((p) => p.academicTermId === termPlacementId)
      : undefined
    const assignmentResolution = resolveAssignmentForCycle(
      studentAssignments,
      selectedCycleId.value
    )
    const assignment = assignmentResolution.assignment

    // Match evaluator
    const evaluator = assignment ? assignment.evaluator : undefined

    const placement = assignment?.placementId
      ? studentPlacements.find((p) => p.id === assignment.placementId)
      : termPlacement ||
        (!selectedCycle && studentPlacements.length === 1
          ? studentPlacements[0]
          : undefined)
    const directoryTerm = student.directoryRelations?.term
    const studentTerm =
      directoryTerm?.id === student.academicTermId
        ? directoryTerm
        : placement?.academicTerm

    // ข้อมูลจริง: ถ้าไม่มี ให้แสดง '-' ตามที่ผู้ใช้กำหนด (ห้ามสร้างขึ้นมาเอง)
    const advisorTh = student.advisor?.th || '-'
    const advisorEn = student.advisor?.en || '-'

    const evaluatorTh = evaluator?.name?.th || '-'
    const evaluatorEn = evaluator?.name?.en || '-'
    const evaluatorPositionTh = evaluator?.position?.th || '-'
    const evaluatorPositionEn = evaluator?.position?.en || '-'
    const evaluatorEmail = evaluator?.email || '-'

    const org = placement ? placement.organization : undefined

    const company = selectedCycle
      ? org?.name?.th || org?.name?.en || '-'
      : student.company || org?.name?.th || org?.name?.en || '-'
    const orgAddress =
      org?.address?.street ||
      org?.address?.location ||
      org?.address?.fullAddress ||
      ''
    const companyAddress = selectedCycle
      ? orgAddress || '-'
      : student.companyAddress || orgAddress || '-'
    const province = selectedCycle
      ? org?.address?.province || '-'
      : student.province || org?.address?.province || '-'

    let yearTh: number | string = '-'
    let yearEn: number | string = '-'
    const academicYear = selectedCycle
      ? selectedTerm?.academicYear
      : (studentTerm?.academicYear ?? student.academicYear)
    if (typeof academicYear === 'number' && Number.isFinite(academicYear)) {
      yearTh = academicYear > 2400 ? academicYear : academicYear + 543
      yearEn = academicYear > 2400 ? academicYear - 543 : academicYear
    }

    const rawSem =
      (selectedCycle
        ? selectedTerm?.semester
        : (studentTerm?.semester ?? student.semester)
      )?.trim() || ''
    let semester = '-'
    if (rawSem) {
      const semLower = rawSem.toLowerCase()
      if (
        semLower === 'first' ||
        semLower === '1' ||
        semLower === 'ภาคการศึกษาต้น'
      ) {
        semester = 'ภาคการศึกษาต้น'
      } else if (
        semLower === 'second' ||
        semLower === '2' ||
        semLower === 'ภาคการศึกษาปลาย'
      ) {
        semester = 'ภาคการศึกษาปลาย'
      } else if (
        semLower === 'third' ||
        semLower === '3' ||
        semLower === 'summer' ||
        semLower.includes('ฤดูร้อน')
      ) {
        semester = 'ภาคการศึกษาฤดูร้อน'
      } else {
        semester = rawSem
      }
    }

    // Status translations
    const rawEvalStatus = assignmentResolution.requiresCycleSelection
      ? 'cycle_unselected'
      : assignmentResolution.unavailable
        ? 'assignment_load_error'
        : assignmentResolution.ambiguous
          ? 'assignment_ambiguous'
          : assignment?.status || 'awaiting_evaluator'
    let status:
      | 'pending'
      | 'inProgress'
      | 'submitted'
      | 'expired'
      | 'reopened'
      | 'email_error'
      | 'cycle_unselected'
      | 'assignment_ambiguous'
      | 'assignment_load_error' = 'pending'
    let statusTh = 'รอระบุผู้ประเมิน'
    let statusEn = 'Awaiting Evaluator'
    const commentsTh = '-'
    const commentsEn = '-'

    if (rawEvalStatus === 'cycle_unselected') {
      status = 'cycle_unselected'
      statusTh = 'เลือกรอบฝึกงานเพื่อดูสถานะ'
      statusEn = 'Select an internship cycle'
    } else if (rawEvalStatus === 'assignment_ambiguous') {
      status = 'assignment_ambiguous'
      statusTh = 'พบ assignment ซ้ำในรอบนี้'
      statusEn = 'Duplicate assignments in this cycle'
    } else if (rawEvalStatus === 'assignment_load_error') {
      status = 'assignment_load_error'
      statusTh = 'โหลดสถานะประเมินไม่สำเร็จ'
      statusEn = 'Could not load evaluation status'
    } else if (rawEvalStatus === 'submitted') {
      status = 'submitted'
      statusTh = 'ส่งผลประเมินแล้ว'
      statusEn = 'Submitted'
    } else if (rawEvalStatus === 'email_error') {
      status = 'email_error'
      statusTh = 'ส่งอีเมลผิดพลาด'
      statusEn = 'Email Error'
    } else if (rawEvalStatus === 'inProgress') {
      status = 'inProgress'
      statusTh = 'ส่งคำขอประเมินแล้ว'
      statusEn = 'Awaiting Response'
    } else if (rawEvalStatus === 'expired') {
      status = 'expired'
      statusTh = 'หมดอายุ'
      statusEn = 'Expired'
    } else {
      status = 'pending'
      statusTh = 'รอระบุผู้ประเมิน'
      statusEn = 'Awaiting Evaluator'
    }

    let courseDisplay = '-'
    let courseTh = '-'
    let courseEn = '-'
    const rawCourse = student.course?.trim() || ''
    const courseThName = course?.name?.th?.trim() || ''
    const courseEnName = course?.name?.en?.trim() || ''
    if (rawCourse) {
      if (
        rawCourse.toLowerCase().includes('coop') ||
        rawCourse.includes('สหกิจ')
      ) {
        courseDisplay = 'Cooperative Education'
        courseTh = 'สหกิจศึกษา'
        courseEn = 'Cooperative Education'
      } else if (
        rawCourse.toLowerCase().includes('intern') ||
        rawCourse.includes('ฝึกงาน')
      ) {
        courseDisplay = 'Internship'
        courseTh = 'การฝึกงาน'
        courseEn = 'Internship'
      } else {
        courseDisplay = rawCourse
        courseTh = rawCourse
        courseEn = rawCourse
      }
    } else if (courseThName || courseEnName) {
      if (
        courseEnName.toLowerCase().includes('coop') ||
        courseThName.includes('สหกิจ')
      ) {
        courseDisplay = 'Cooperative Education'
        courseTh = 'สหกิจศึกษา'
        courseEn = 'Cooperative Education'
      } else if (
        courseEnName.toLowerCase().includes('intern') ||
        courseThName.includes('ฝึกงาน')
      ) {
        courseDisplay = 'Internship'
        courseTh = courseThName || 'การฝึกงาน'
        courseEn = courseEnName || 'Internship'
      } else {
        courseDisplay = courseEnName || courseThName
        courseTh = courseThName || courseEnName
        courseEn = courseEnName || courseThName
      }
    }

    return {
      student,
      assignment,
      evaluator,
      school,
      program,
      placement,
      studentId: student.studentId,
      nameTh: student.name?.th || student.studentId,
      nameEn: student.name?.en || student.studentId,
      email: student.email,
      personalEmail: student.personalEmail || '-',
      schoolTh: school?.name?.th || '-',
      schoolEn: school?.name?.en || '-',
      schoolCode: school?.schoolCode || '-',
      programTh: program?.name?.th || '-',
      programEn: program?.name?.en || '-',
      programCode: program?.programCode || '-',
      courseId: student.courseId,
      courseTh,
      courseEn,
      courseDisplay,
      academicYear: yearTh,
      academicYearEn: yearEn,
      semester,
      company,
      companyAddress,
      province,
      advisorTh,
      advisorEn,
      evaluatorTh,
      evaluatorEn,
      evaluatorPositionTh,
      evaluatorPositionEn,
      evaluatorEmail,
      status,
      statusTh,
      statusEn,
      hardSkillScore: assignment?.categoryScores?.hardSkill,
      softSkillScore: assignment?.categoryScores?.softSkill,
      commentsTh,
      commentsEn
    }
  })
}

const enrichedRows = computed<EnrichedStudentRow[]>(() =>
  enrichStudents(directoryStudents.value)
)

// Facets come from the API's actor-scoped candidate set, not the current page.
const availableYears = computed<string[]>(() =>
  [
    ...new Set(
      (directoryData.value?.facets.academicYears ?? []).map((year) =>
        String(year > 2400 ? year : year + 543)
      )
    )
  ].sort((a, b) => Number(b) - Number(a))
)

function displaySemester(value: string): string {
  const normalized = value.trim().toLowerCase()
  if (['1', 'first', 'ภาคการศึกษาต้น'].includes(normalized)) {
    return 'ภาคการศึกษาต้น'
  }
  if (['2', 'second', 'ภาคการศึกษาปลาย'].includes(normalized)) {
    return 'ภาคการศึกษาปลาย'
  }
  if (
    ['3', 'third', 'summer'].includes(normalized) ||
    normalized.includes('ฤดูร้อน')
  ) {
    return 'ภาคการศึกษาฤดูร้อน'
  }
  return value
}

const availableSemesters = computed<string[]>(() =>
  [
    ...new Set(
      (directoryData.value?.facets.semesters ?? []).map(displaySemester)
    )
  ].sort()
)

const availableSchools = computed<
  { id: string; nameTh: string; schoolCode: string }[]
>(() => {
  return (directoryData.value?.facets.schools ?? [])
    .map((school) => ({
      id: school.id,
      nameTh: school.name.th || school.id,
      schoolCode: school.schoolCode
    }))
    .sort((a, b) => a.nameTh.localeCompare(b.nameTh, 'th'))
})

const statusLabels: Record<string, { labelTh: string; icon: string }> = {
  pending: { labelTh: 'รอระบุผู้ประเมิน', icon: '⚪' },
  inProgress: { labelTh: 'ส่งคำขอประเมินแล้ว', icon: '🟡' },
  submitted: { labelTh: 'ส่งผลประเมินแล้ว', icon: '🟢' },
  expired: { labelTh: 'หมดอายุ', icon: '🔴' },
  email_error: { labelTh: 'ส่งอีเมลผิดพลาด', icon: '❌' },
  assignment_ambiguous: { labelTh: 'พบ assignment ซ้ำในรอบนี้', icon: '⚠️' },
  cycle_unselected: { labelTh: 'เลือกรอบฝึกงานเพื่อดูสถานะ', icon: '🗓️' }
}

const availableStatuses = computed(() =>
  (directoryData.value?.facets.statuses ?? []).flatMap((value) => {
    const label = statusLabels[value]
    return label ? [{ value, ...label }] : []
  })
)

// Auto-reset filters if current value is invalid or not in available options
watch(
  availableYears,
  (years) => {
    if (selectedYear.value !== 'all' && !years.includes(selectedYear.value)) {
      selectedYear.value = 'all'
    }
  },
  { immediate: true }
)

watch(
  availableSemesters,
  (sems) => {
    if (
      selectedSemester.value !== 'all' &&
      !sems.includes(selectedSemester.value) &&
      selectedSemester.value !== '1'
    ) {
      selectedSemester.value = 'all'
    }
  },
  { immediate: true }
)

watch(
  availableSchools,
  (schs) => {
    if (
      selectedSchool.value !== 'all' &&
      !schs.some((s) => s.id === selectedSchool.value)
    ) {
      selectedSchool.value = 'all'
    }
  },
  { immediate: true }
)

watch(
  availableStatuses,
  (statuses) => {
    if (
      selectedStatus.value !== 'all' &&
      !statuses.some((s) => s.value === selectedStatus.value)
    ) {
      selectedStatus.value = 'all'
    }
  },
  { immediate: true }
)

// API returns filtered current page and whole-filter summary.
const filteredRows = computed(() => enrichedRows.value)

// Stats counters
const stats = computed(() => {
  return (
    directoryData.value?.summary ?? {
      all: directoryTotal.value,
      submitted: 0,
      inProgress: 0,
      emailError: 0,
      pending: 0,
      expired: 0,
      assignmentAmbiguous: 0
    }
  )
})

// Pagination (Configurable: 5, 10, 15, 20 items per page)
const page = ref(1)
const pageSize = ref(5)
const paginatedRows = computed(() => filteredRows.value)

function directoryQuery(
  requestedPage: number,
  requestedPageSize: number,
  includeDirectoryData = false
): Record<string, string | number | boolean> {
  const query: Record<string, string | number | boolean> = {
    page: requestedPage,
    pageSize: requestedPageSize,
    includeDirectoryData
  }
  const search = searchQuery.value.trim().slice(0, 100)
  if (search) query.search = search
  if (selectedSchool.value !== 'all') query.schoolId = selectedSchool.value
  if (selectedCycleId.value !== 'all') query.cycleId = selectedCycleId.value
  if (
    selectedYear.value !== 'all' &&
    Number.isInteger(Number(selectedYear.value))
  ) {
    query.academicYear = Number(selectedYear.value)
  }
  if (selectedSemester.value !== 'all') {
    query.semester = selectedSemester.value
  }
  if (
    selectedCycleId.value !== 'all' &&
    selectedStatus.value !== 'all' &&
    selectedStatus.value !== 'cycle_unselected'
  ) {
    query.evaluationStatus = selectedStatus.value
  }
  return query
}

function directoryFilterKey(): string {
  const query = directoryQuery(1, pageSize.value)
  delete query.page
  delete query.pageSize
  delete query.includeDirectoryData
  return JSON.stringify(query)
}

async function loadDirectoryPage(includeData: boolean): Promise<void> {
  if (!import.meta.client) return
  const requestVersion = ++directoryRequestVersion
  const filterKey = directoryFilterKey()
  const withDirectoryData =
    includeData || !directoryData.value || directoryFacetKey !== filterKey
  directoryLoading.value = true
  directoryError.value = ''
  try {
    const result = await api<StudentDirectoryResponse>('/students', {
      query: directoryQuery(page.value, pageSize.value, withDirectoryData)
    })
    if (requestVersion !== directoryRequestVersion) return
    directoryStudents.value = result.items
    directoryTotal.value = result.meta.total
    if (result.directory) {
      directoryData.value = result.directory
      directoryFacetKey = filterKey
    }
  } catch (error) {
    if (requestVersion !== directoryRequestVersion) return
    directoryStudents.value = []
    directoryTotal.value = 0
    directoryError.value = 'ไม่สามารถโหลดทะเบียนนักศึกษาได้ กรุณาลองใหม่'
    console.error('Failed to load Student directory page:', error)
  } finally {
    if (requestVersion === directoryRequestVersion) {
      directoryLoading.value = false
    }
  }
}

let directorySearchTimer: ReturnType<typeof setTimeout> | undefined
watch(
  [
    selectedYear,
    selectedSemester,
    selectedSchool,
    selectedCycleId,
    selectedStatus,
    searchQuery
  ],
  () => {
    page.value = 1
    clearTimeout(directorySearchTimer)
    directorySearchTimer = setTimeout(() => void loadDirectoryPage(true), 250)
  }
)
watch([page, pageSize], () => void loadDirectoryPage(false))
watch(
  () => props.refreshVersion,
  (version) => {
    if (version > 0) void loadDirectoryPage(true)
  }
)
onMounted(() => void loadDirectoryPage(true))
// Reset filters
function resetFilters(): void {
  selectedYear.value = 'all'
  selectedSemester.value = 'all'
  selectedSchool.value = 'all'
  selectedCycleId.value = 'all'
  cycleSelectionChanged = true
  selectedStatus.value = 'all'
  searchQuery.value = ''
  page.value = 1
}

// Copy the Student's business identifier to the clipboard.
async function copyStudentId(studentId: string): Promise<void> {
  if (!import.meta.client) return

  try {
    await navigator.clipboard.writeText(studentId)
    toast.add({
      title: 'คัดลอกรหัสนักศึกษาสำเร็จ',
      description: `คัดลอกรหัสนักศึกษา ${studentId} แล้ว`,
      color: 'success',
      icon: 'i-lucide-check'
    })
  } catch {
    toast.add({
      title: 'ไม่สามารถคัดลอกรหัสนักศึกษาได้',
      description: 'โปรดลองคัดลอกรหัสนักศึกษาด้วยตนเอง',
      color: 'error'
    })
  }
}

// Open the record first, then load the persisted final result for this assignment.
function openDetail(row: EnrichedStudentRow): void {
  evaluationRequestVersion += 1
  evaluationResult.value = null
  evaluationResultLoading.value = false
  evaluationResultError.value = ''
  activeStudentRow.value = row
  detailModalOpen.value = true
  if (row.status === 'submitted') void loadEvaluationResult(row)
}

async function loadEvaluationResult(row: EnrichedStudentRow): Promise<void> {
  const requestVersion = ++evaluationRequestVersion
  evaluationResult.value = null
  evaluationResultError.value = ''
  if (!row.assignment?.id) {
    evaluationResultError.value = 'ไม่พบ assignment ของผลประเมินนี้'
    return
  }

  evaluationResultLoading.value = true
  try {
    const response = await api<EvaluationReadResponse>(
      `/evaluations/${encodeURIComponent(row.assignment.id)}`
    )
    if (requestVersion !== evaluationRequestVersion) return
    const final = response.evaluations?.find((item) => !item.supersededAt)
    if (!final) {
      evaluationResultError.value =
        'สถานะระบุว่าส่งผลแล้ว แต่ยังไม่พบผลประเมินฉบับสมบูรณ์'
      return
    }
    evaluationResult.value = buildStudentEvaluationResult(final)
  } catch {
    if (requestVersion === evaluationRequestVersion) {
      evaluationResultError.value = 'โหลดผลประเมินไม่สำเร็จ กรุณาลองใหม่'
    }
  } finally {
    if (requestVersion === evaluationRequestVersion) {
      evaluationResultLoading.value = false
    }
  }
}

function openDoc(
  type: 'certification' | 'referral',
  row: EnrichedStudentRow
): void {
  emit('openDocument', { type, row })
}

// =============================================================================
// EDIT & DELETE STUDENT ACTIONS
// =============================================================================
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
  academicYear: '' as number | string,
  admissionYear: '' as number | string
})

function setEditSchool(value: string): void {
  if (editForm.value.schoolId !== value) {
    editForm.value.programId = ''
    editForm.value.courseId = ''
  }
  editForm.value.schoolId = value
}

function openEditModal(row: EnrichedStudentRow): void {
  const s = row.student
  editingStudentId.value = s.id
  editForm.value = {
    studentId: s.studentId,
    nameTh: s.name?.th || '',
    nameEn: s.name?.en || '',
    email: s.email || '',
    personalEmail: s.personalEmail || '',
    schoolId: s.schoolId || '',
    programId: s.programId || '',
    courseId: s.courseId || '',
    semester: s.semester || '',
    company: s.company || '',
    companyAddress:
      (s as unknown as { companyAddress?: string }).companyAddress ||
      row.companyAddress ||
      '',
    province: s.province || '',
    academicYear: s.academicYear ?? '',
    admissionYear: s.admissionYear ?? ''
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
        academicYear: optionalYear(editForm.value.academicYear),
        admissionYear: optionalYear(editForm.value.admissionYear)
      }
    })

    toast.add({
      title: 'อัปเดตข้อมูลนักศึกษาสำเร็จ',
      description: `อัปเดตข้อมูล ${editForm.value.nameTh} (${editForm.value.studentId}) เรียบร้อยแล้ว`,
      color: 'success'
    })

    isEditModalOpen.value = false
    void loadDirectoryPage(true)
    emit('refresh')
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

function optionalYear(value: number | string): number | undefined {
  if (value === '' || (typeof value === 'string' && value.trim() === '')) {
    return undefined
  }
  const year = Number(value)
  return Number.isInteger(year) ? year : undefined
}

async function handleDeleteStudent(row: EnrichedStudentRow) {
  if (
    !confirm(
      `คุณต้องการลบข้อมูลนักศึกษา "${row.nameTh}" (${row.studentId}) หรือไม่?`
    )
  ) {
    return
  }
  try {
    await api(`/students/${row.student.id}`, {
      method: 'DELETE'
    })
    toast.add({
      title: 'ลบข้อมูลสำเร็จ',
      description: `ลบข้อมูลนักศึกษา ${row.nameTh} เรียบร้อยแล้ว`,
      color: 'success'
    })
    void loadDirectoryPage(true)
    emit('refresh')
  } catch {
    toast.add({
      title: 'ดำเนินการไม่สำเร็จ',
      description: 'ไม่สามารถลบข้อมูลนักศึกษาได้',
      color: 'error'
    })
  }
}

// Dropdown Action Menu for each student row (3 dots icon)
function getRowActions(row: EnrichedStudentRow) {
  return [
    [
      {
        label: 'ดูสรุปผลและสมรรถนะ',
        icon: 'i-lucide-eye',
        onSelect: () => openDetail(row)
      }
    ],
    [
      {
        label: 'แก้ไขข้อมูล',
        icon: 'i-lucide-pencil',
        onSelect: () => openEditModal(row)
      }
    ],
    [
      {
        label: 'Certificate (ยังไม่พร้อมออกเอกสาร)',
        icon: 'i-lucide-award',
        disabled: true,
        onSelect: () => openDoc('certification', row)
      },
      {
        label: 'Transcript (ยังไม่พร้อมออกเอกสาร)',
        icon: 'i-lucide-file-text',
        disabled: true,
        onSelect: () => openDoc('referral', row)
      }
    ],
    [
      {
        label: 'ลบข้อมูล',
        icon: 'i-lucide-trash-2',
        color: 'error' as const,
        onSelect: () => handleDeleteStudent(row)
      }
    ]
  ]
}

// =============================================================================
// BILINGUAL EXCEL EXPORT (ภาษาไทย & ภาษาอังกฤษ) อิงตามข้อมูลจริงในฐานข้อมูล
// =============================================================================
async function exportToExcel(locale: 'th' | 'en'): Promise<void> {
  if (!import.meta.client) return

  exportLoading.value = true
  const firstQuery = directoryQuery(1, 500)
  const stableFilters = { ...firstQuery }
  delete stableFilters.page
  delete stableFilters.pageSize
  try {
    const exportResult = await loadAllPages(
      (requestedPage, requestedPageSize) =>
        api<PaginatedItems<StudentItem>>('/students', {
          query: {
            ...stableFilters,
            page: requestedPage,
            pageSize: requestedPageSize,
            includeDirectoryData: false
          }
        })
    )
    const rowsToExport = enrichStudents(exportResult.items)
    if (rowsToExport.length === 0) {
      exportLoading.value = false
      toast.add({
        title: 'ไม่มีข้อมูลสำหรับส่งออก',
        description: 'กรุณาปรับเปลี่ยนตัวกรองเพื่อเลือกข้อมูลนักศึกษา',
        color: 'warning',
        icon: 'i-lucide-alert-triangle'
      })
      return
    }

    const timestamp = new Date().toISOString().slice(0, 10).replace(/-/g, '')

    if (locale === 'th') {
      // 1. Export ภาษาไทย
      const excelData = buildStudentDirectoryExportRows(rowsToExport, 'th')

      const ws = XLSX.utils.json_to_sheet(excelData)

      // Set column widths
      ws['!cols'] = [
        { wch: 6 }, // ลำดับ
        { wch: 14 }, // รหัสนักศึกษา
        { wch: 26 }, // ชื่อ-นามสกุล (ไทย)
        { wch: 26 }, // ชื่อ-นามสกุล (อังกฤษ)
        { wch: 30 }, // อีเมลนักศึกษา
        { wch: 24 }, // อีเมลส่วนตัว
        { wch: 32 }, // สำนักวิชา
        { wch: 28 }, // สาขาวิชา
        { wch: 24 }, // รายวิชา
        { wch: 12 }, // ปีการศึกษา
        { wch: 16 }, // ภาคการศึกษา
        { wch: 35 }, // สถานประกอบการ
        { wch: 28 }, // ที่ตั้งบริษัท
        { wch: 16 }, // จังหวัด
        { wch: 30 }, // อาจารย์ที่ปรึกษา
        { wch: 30 }, // ผู้ประเมิน
        { wch: 28 }, // ตำแหน่งผู้ประเมิน
        { wch: 28 }, // อีเมลผู้ประเมิน
        { wch: 20 }, // สถานะ
        { wch: 24 }, // คะแนน Hard Skill
        { wch: 24 } // คะแนน Soft Skill
      ]

      const wb = XLSX.utils.book_new()
      XLSX.utils.book_append_sheet(wb, ws, 'รายงานนักศึกษาฝึกงาน_TH')
      const filename = `MFU_Internship_Report_TH_${timestamp}.xlsx`
      XLSX.writeFile(wb, filename)

      toast.add({
        title: 'ส่งออกรายงาน Excel (ภาษาไทย) สำเร็จ',
        description: `ดาวน์โหลด ${filename} จำนวน ${rowsToExport.length} รายการ เรียบร้อยแล้ว`,
        color: 'success',
        icon: 'i-lucide-file-spreadsheet'
      })
    } else {
      // 2. Export English (ภาษาอังกฤษ)
      const excelData = buildStudentDirectoryExportRows(rowsToExport, 'en')

      const ws = XLSX.utils.json_to_sheet(excelData)

      // Set column widths
      ws['!cols'] = [
        { wch: 6 }, // No.
        { wch: 14 }, // Student ID
        { wch: 28 }, // Full Name (English)
        { wch: 26 }, // Full Name (Thai)
        { wch: 30 }, // Student Email
        { wch: 24 }, // Personal Email
        { wch: 34 }, // School
        { wch: 30 }, // Program / Major
        { wch: 24 }, // Course
        { wch: 14 }, // Academic Year
        { wch: 16 }, // Semester
        { wch: 35 }, // Company / Placement
        { wch: 28 }, // Company Location
        { wch: 16 }, // Province
        { wch: 30 }, // Academic Advisor
        { wch: 30 }, // Workplace Evaluator
        { wch: 28 }, // Evaluator Position
        { wch: 28 }, // Evaluator Email
        { wch: 20 }, // Evaluation Status
        { wch: 24 }, // Hard Skill Average
        { wch: 24 } // Soft Skill Average
      ]

      const wb = XLSX.utils.book_new()
      XLSX.utils.book_append_sheet(wb, ws, 'Internship_Report_EN')
      const filename = `MFU_Internship_Report_EN_${timestamp}.xlsx`
      XLSX.writeFile(wb, filename)

      toast.add({
        title: 'Excel Report Exported (English)',
        description: `Successfully downloaded ${filename} with ${rowsToExport.length} student records`,
        color: 'success',
        icon: 'i-lucide-file-spreadsheet'
      })
    }

    exportMenuOpen.value = false
  } catch (error) {
    console.error('Failed to export Student directory:', error)
    toast.add({
      title: 'ส่งออกข้อมูลไม่สำเร็จ',
      description: 'โหลดข้อมูลครบทุกหน้าไม่ได้ กรุณาลองใหม่',
      color: 'error',
      icon: 'i-lucide-circle-alert'
    })
  } finally {
    exportLoading.value = false
  }
}
</script>

<template>
  <div class="space-y-5">
    <!-- ========================================================================= -->
    <!-- 1. ส่วนหัวทะเบียนนักศึกษาและปุ่มส่งออก Excel                              -->
    <!-- ========================================================================= -->
    <div
      class="flex flex-col lg:flex-row lg:items-center justify-between gap-4 bg-default rounded-2xl border border-default p-5 shadow-sm"
    >
      <div class="space-y-1">
        <div class="flex items-center gap-2">
          <span
            class="grid size-9 place-items-center rounded-lg bg-primary/10 text-primary ring-1 ring-primary/20"
          >
            <UIcon name="i-lucide-users" class="size-5" />
          </span>
          <h2 class="text-xl font-bold text-highlighted">
            ทะเบียนนักศึกษาฝึกงานและสถานะการประเมิน
          </h2>
          <UBadge color="primary" size="xs" variant="subtle">
            All Students Directory
          </UBadge>
        </div>
        <p class="text-xs text-muted">
          ตรวจสอบข้อมูลนักศึกษาทุกคนในระบบ แยกตามปีการศึกษา ภาคเรียน
          สถานประกอบการ และสถานะประเมิน
        </p>
      </div>

      <!-- ปุ่มส่งออกข้อมูล (Export Buttons) -->
      <div class="flex flex-wrap items-center gap-2.5 shrink-0">
        <!-- ส่งออกภาษาไทย -->
        <UButton
          color="success"
          icon="i-lucide-file-spreadsheet"
          label="ส่งออก Excel (ภาษาไทย)"
          :loading="exportLoading"
          size="sm"
          variant="solid"
          class="font-medium shadow-sm hover:shadow"
          @click="exportToExcel('th')"
        />

        <!-- Export English -->
        <UButton
          color="primary"
          icon="i-lucide-download"
          label="Export Excel (English)"
          :loading="exportLoading"
          size="sm"
          variant="outline"
          class="font-medium"
          @click="exportToExcel('en')"
        />
      </div>
    </div>

    <!-- ========================================================================= -->
    <!-- 2. แถบสรุปตัวเลข (Quick Statistics Counter Badges)                       -->
    <!-- ========================================================================= -->
    <div class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
      <div
        class="rounded-xl border border-default bg-default p-3.5 flex items-center gap-3 cursor-pointer transition-all hover:border-primary/40"
        :class="{ 'ring-2 ring-primary/50': selectedStatus === 'all' }"
        @click="selectedStatus = 'all'"
      >
        <span
          class="grid size-10 place-items-center rounded-lg bg-neutral-100 dark:bg-neutral-800 text-neutral-600 dark:text-neutral-300"
        >
          <UIcon name="i-lucide-graduation-cap" class="size-5" />
        </span>
        <div>
          <p class="text-xs text-muted">นักศึกษาทั้งหมด</p>
          <p class="text-xl font-bold text-highlighted">{{ stats.all }} คน</p>
        </div>
      </div>

      <div
        class="rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-3.5 flex items-center gap-3 cursor-pointer transition-all hover:border-emerald-500/40"
        :class="{
          'ring-2 ring-emerald-500/50': selectedStatus === 'submitted'
        }"
        @click="
          selectedStatus = selectedStatus === 'submitted' ? 'all' : 'submitted'
        "
      >
        <span
          class="grid size-10 place-items-center rounded-lg bg-emerald-500/15 text-emerald-600"
        >
          <UIcon name="i-lucide-check-circle-2" class="size-5" />
        </span>
        <div>
          <p class="text-xs text-emerald-700 dark:text-emerald-400">
            ส่งผลประเมินแล้ว
          </p>
          <p class="text-xl font-bold text-emerald-700 dark:text-emerald-300">
            {{ stats.submitted }} คน
          </p>
        </div>
      </div>

      <div
        class="rounded-xl border border-amber-500/20 bg-amber-500/5 p-3.5 flex items-center gap-3 cursor-pointer transition-all hover:border-amber-500/40"
        :class="{ 'ring-2 ring-amber-500/50': selectedStatus === 'inProgress' }"
        @click="
          selectedStatus =
            selectedStatus === 'inProgress' ? 'all' : 'inProgress'
        "
      >
        <span
          class="grid size-10 place-items-center rounded-lg bg-amber-500/15 text-amber-600"
        >
          <UIcon name="i-lucide-mail-check" class="size-5" />
        </span>
        <div>
          <p class="text-xs text-amber-700 dark:text-amber-400">
            ส่งคำขอประเมินแล้ว
          </p>
          <p class="text-xl font-bold text-amber-700 dark:text-amber-300">
            {{ stats.inProgress }} คน
          </p>
        </div>
      </div>

      <div
        class="rounded-xl border border-rose-500/20 bg-rose-500/5 p-3.5 flex items-center gap-3 cursor-pointer transition-all hover:border-rose-500/40"
        :class="{ 'ring-2 ring-rose-500/50': selectedStatus === 'email_error' }"
        @click="
          selectedStatus =
            selectedStatus === 'email_error' ? 'all' : 'email_error'
        "
      >
        <span
          class="grid size-10 place-items-center rounded-lg bg-rose-500/15 text-rose-600"
        >
          <UIcon name="i-lucide-alert-triangle" class="size-5" />
        </span>
        <div>
          <p class="text-xs text-rose-700 dark:text-rose-400">
            ส่งอีเมลผิดพลาด
          </p>
          <p class="text-xl font-bold text-rose-700 dark:text-rose-300">
            {{ stats.emailError }} คน
          </p>
        </div>
      </div>

      <div
        class="rounded-xl border border-neutral-500/20 bg-neutral-500/5 p-3.5 flex items-center gap-3 cursor-pointer transition-all hover:border-neutral-500/40"
        :class="{ 'ring-2 ring-neutral-500/50': selectedStatus === 'pending' }"
        @click="
          selectedStatus = selectedStatus === 'pending' ? 'all' : 'pending'
        "
      >
        <span
          class="grid size-10 place-items-center rounded-lg bg-neutral-500/15 text-neutral-600 dark:text-neutral-300"
        >
          <UIcon name="i-lucide-user-x" class="size-5" />
        </span>
        <div>
          <p class="text-xs text-neutral-600 dark:text-neutral-400">
            รอระบุผู้ประเมิน
          </p>
          <p class="text-xl font-bold text-neutral-700 dark:text-neutral-200">
            {{ stats.pending }} คน
          </p>
        </div>
      </div>
    </div>

    <!-- ========================================================================= -->
    <!-- 3. แถบตัวกรอง (Multi-dimensional Filter Bar)                             -->
    <!-- ========================================================================= -->
    <div
      class="rounded-xl border border-default bg-default p-4 shadow-sm space-y-3"
    >
      <p
        v-if="props.cycleLoadError"
        role="alert"
        class="rounded-lg border border-error/30 bg-error/5 px-3 py-2 text-xs text-error"
      >
        โหลดรอบฝึกงานไม่สำเร็จ จึงยังเลือกบริบทการประเมินไม่ได้
        กรุณารีเฟรชหรือติดต่อผู้ดูแลระบบ
      </p>
      <div
        class="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-3"
      >
        <div class="space-y-1">
          <label
            class="text-xs font-semibold text-muted flex items-center gap-1.5"
          >
            <UIcon
              name="i-lucide-calendar-days"
              class="size-3.5 text-primary"
            />
            รอบฝึกงาน (Internship Cycle)
          </label>
          <select
            v-model="selectedCycleId"
            :disabled="!props.cycles.length"
            class="w-full rounded-lg border border-default bg-default px-3 py-2 text-xs text-highlighted focus:outline-none focus:ring-1 focus:ring-primary"
            @change="markCycleSelectionChanged"
          >
            <option value="all">เลือกรอบเพื่อดูสถานะประเมิน</option>
            <option
              v-for="cycle in props.cycles"
              :key="cycle.id"
              :value="cycle.id"
            >
              {{ cycleOptionLabel(cycle) }}
            </option>
          </select>
        </div>

        <!-- 3.1 ตัวกรองปีการศึกษา -->
        <div class="space-y-1">
          <label
            class="text-xs font-semibold text-muted flex items-center gap-1.5"
          >
            <UIcon name="i-lucide-calendar" class="size-3.5 text-primary" />
            ปีการศึกษา (Academic Year)
          </label>
          <select
            v-model="selectedYear"
            class="w-full rounded-lg border border-default bg-default px-3 py-2 text-xs text-highlighted focus:outline-none focus:ring-1 focus:ring-primary"
          >
            <option value="all">ทุกปีการศึกษา (All Years)</option>
            <option v-for="yr in availableYears" :key="yr" :value="yr">
              ปีการศึกษา {{ yr }} ({{ Number(yr) - 543 }})
            </option>
          </select>
        </div>

        <!-- 3.2 ตัวกรองภาคเรียน -->
        <div class="space-y-1">
          <label
            class="text-xs font-semibold text-muted flex items-center gap-1.5"
          >
            <UIcon name="i-lucide-layers" class="size-3.5 text-primary" />
            ภาคการศึกษา (Semester)
          </label>
          <select
            v-model="selectedSemester"
            class="w-full rounded-lg border border-default bg-default px-3 py-2 text-xs text-highlighted focus:outline-none focus:ring-1 focus:ring-primary"
          >
            <option value="all">ทุกภาคการศึกษา (All Semesters)</option>
            <option v-for="sem in availableSemesters" :key="sem" :value="sem">
              {{ sem }}
            </option>
          </select>
        </div>

        <!-- 3.3 ตัวกรองสำนักวิชา -->
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
              v-for="sch in availableSchools"
              :key="sch.id"
              :value="sch.id"
            >
              {{ sch.nameTh }} {{ sch.schoolCode ? `(${sch.schoolCode})` : '' }}
            </option>
          </select>
        </div>

        <!-- 3.4 ตัวกรองสถานะแบบประเมิน -->
        <div class="space-y-1">
          <label
            class="text-xs font-semibold text-muted flex items-center gap-1.5"
          >
            <UIcon name="i-lucide-activity" class="size-3.5 text-primary" />
            สถานะแบบประเมิน (Status)
          </label>
          <select
            v-model="selectedStatus"
            class="w-full rounded-lg border border-default bg-default px-3 py-2 text-xs text-highlighted focus:outline-none focus:ring-1 focus:ring-primary"
          >
            <option value="all">ทุกสถานะ (All Statuses)</option>
            <option
              v-for="st in availableStatuses"
              :key="st.value"
              :value="st.value"
            >
              {{ st.icon }} {{ st.labelTh }}
            </option>
          </select>
        </div>

        <!-- 3.5 ช่องค้นหา -->
        <div class="space-y-1 sm:col-span-2 md:col-span-4 lg:col-span-1">
          <label
            class="text-xs font-semibold text-muted flex items-center gap-1.5"
          >
            <UIcon name="i-lucide-search" class="size-3.5 text-primary" />
            ค้นหาข้อมูลทันใจ
          </label>
          <div class="relative">
            <input
              v-model="searchQuery"
              maxlength="100"
              type="text"
              placeholder="รหัสนักศึกษา, ชื่อ, สถานประกอบการ..."
              class="w-full rounded-lg border border-default bg-default pl-8 pr-8 py-2 text-xs text-highlighted focus:outline-none focus:ring-1 focus:ring-primary"
            />
            <UIcon
              name="i-lucide-search"
              class="size-4 text-muted absolute left-2.5 top-2.5 pointer-events-none"
            />
            <button
              v-if="searchQuery"
              type="button"
              class="absolute right-2.5 top-2.5 text-muted hover:text-highlighted"
              @click="searchQuery = ''"
            >
              <UIcon name="i-lucide-x" class="size-3.5" />
            </button>
          </div>
        </div>
      </div>

      <!-- ปุ่มล้างตัวกรองเมื่อมีการกรองข้อมูล -->
      <div
        v-if="
          selectedYear !== 'all' ||
          selectedSemester !== 'all' ||
          selectedSchool !== 'all' ||
          selectedCycleId !== 'all' ||
          selectedStatus !== 'all' ||
          searchQuery
        "
        class="flex items-center justify-end pt-2 border-t border-default/70 text-xs text-muted"
      >
        <button
          type="button"
          class="text-primary hover:underline flex items-center gap-1 font-medium cursor-pointer"
          @click="resetFilters"
        >
          <UIcon name="i-lucide-rotate-ccw" class="size-3" />
          ล้างตัวกรองทั้งหมด
        </button>
      </div>
    </div>

    <!-- ========================================================================= -->
    <!-- 4. ตารางทะเบียนนักศึกษา (Comprehensive Interactive Table)                 -->
    <!-- ========================================================================= -->
    <div
      class="rounded-xl border border-default bg-default overflow-hidden shadow-sm"
    >
      <div class="overflow-x-auto">
        <table class="w-full text-left text-xs">
          <thead
            class="border-b border-default bg-muted/40 font-semibold text-highlighted"
          >
            <tr>
              <th scope="col" class="py-3 px-4 w-12 text-center">#</th>
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
              <th scope="col" class="py-3 px-4 w-16 text-right">จัดการ</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-default">
            <tr
              v-if="directoryLoading && filteredRows.length === 0"
              class="text-center py-12 text-muted"
            >
              <td colspan="7" class="py-12">
                <div class="flex items-center justify-center gap-2">
                  <UIcon
                    name="i-lucide-loader-circle"
                    class="size-4 animate-spin"
                  />
                  กำลังโหลดรายชื่อนักศึกษา...
                </div>
              </td>
            </tr>
            <tr
              v-else-if="directoryError"
              class="text-center py-12 text-error"
              role="alert"
            >
              <td colspan="7" class="py-12">
                {{ directoryError }}
                <UButton
                  class="ml-2"
                  color="neutral"
                  label="ลองใหม่"
                  size="xs"
                  variant="outline"
                  @click="loadDirectoryPage(true)"
                />
              </td>
            </tr>
            <tr
              v-else-if="filteredRows.length === 0"
              class="text-center py-12 text-muted"
            >
              <td colspan="7" class="py-12">
                <div class="flex flex-col items-center justify-center gap-2">
                  <UIcon name="i-lucide-search-x" class="size-8 text-muted" />
                  <p class="text-sm font-semibold text-highlighted">
                    ไม่พบข้อมูลนักศึกษาตรงตามเงื่อนไข
                  </p>
                  <p class="text-xs text-muted">
                    ลองปรับเปลี่ยนปีการศึกษา ภาคเรียน หรือคำค้นหาใหม่
                  </p>
                  <UButton
                    color="neutral"
                    label="ล้างตัวกรองทั้งหมด"
                    size="xs"
                    variant="subtle"
                    class="mt-2"
                    @click="resetFilters"
                  />
                </div>
              </td>
            </tr>

            <tr
              v-for="(row, idx) in paginatedRows"
              :key="row.studentId"
              class="hover:bg-muted/30 transition-colors group"
            >
              <!-- 1. ลำดับ -->
              <td class="py-3 px-4 text-center font-mono text-muted">
                {{ (page - 1) * pageSize + idx + 1 }}
              </td>

              <!-- 2. ข้อมูลนักศึกษา -->
              <td class="py-3 px-4">
                <div class="space-y-0.5">
                  <div class="flex items-center gap-1.5">
                    <span class="font-mono font-bold text-primary text-xs">
                      {{ row.studentId }}
                    </span>
                    <button
                      type="button"
                      title="คัดลอกรหัสนักศึกษา"
                      class="text-muted hover:text-primary opacity-0 group-hover:opacity-100 transition-opacity"
                      @click="copyStudentId(row.studentId)"
                    >
                      <UIcon name="i-lucide-copy" class="size-3" />
                    </button>
                  </div>
                  <p class="font-semibold text-highlighted text-xs">
                    {{ row.nameTh }}
                  </p>
                  <p class="text-[11px] text-muted truncate">
                    {{ row.nameEn }}
                  </p>
                  <p class="text-[10px] text-muted/80 font-mono">
                    {{ row.email }}
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
                      {{ row.schoolTh }}
                    </p>
                    <p class="text-[11px] text-muted leading-snug">
                      {{ row.programTh }}
                    </p>
                  </div>
                  <div class="pt-0.5">
                    <UBadge
                      :color="
                        row.courseDisplay === 'Cooperative Education'
                          ? 'primary'
                          : 'neutral'
                      "
                      size="xs"
                      variant="subtle"
                      class="text-[10px] font-medium inline-flex items-center gap-1"
                    >
                      <UIcon
                        :name="
                          row.courseDisplay === 'Cooperative Education'
                            ? 'i-lucide-briefcase'
                            : 'i-lucide-graduation-cap'
                        "
                        class="size-3"
                      />
                      <span>{{ row.courseDisplay }}</span>
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
                    ปี {{ row.academicYear }}
                  </UBadge>
                  <p class="text-[11px] text-muted">
                    {{
                      row.semester.includes('ภาค')
                        ? row.semester
                        : `ภาคการศึกษาที่ ${row.semester}`
                    }}
                  </p>
                </div>
              </td>

              <!-- 5. สถานประกอบการ / ที่ตั้งบริษัท -->
              <td class="py-3 px-4">
                <div class="space-y-0.5">
                  <p class="font-medium text-highlighted text-xs leading-snug">
                    {{ row.company }}
                  </p>
                  <p class="text-[11px] text-muted font-normal">
                    {{ row.companyAddress || '-' }}
                  </p>
                </div>
              </td>

              <!-- 6. สถานะและคะแนน -->
              <td class="py-3 px-4">
                <div class="space-y-1">
                  <UBadge
                    v-if="row.status === 'submitted'"
                    color="success"
                    size="xs"
                    variant="subtle"
                    class="font-semibold flex items-center gap-1 w-fit"
                  >
                    <UIcon name="i-lucide-check-circle-2" class="size-3" />
                    ส่งผลประเมินแล้ว
                  </UBadge>
                  <UBadge
                    v-else-if="row.status === 'email_error'"
                    color="error"
                    size="xs"
                    variant="subtle"
                    class="font-semibold flex items-center gap-1 w-fit"
                  >
                    <UIcon name="i-lucide-alert-triangle" class="size-3" />
                    ส่งอีเมลผิดพลาด
                  </UBadge>
                  <UBadge
                    v-else-if="row.status === 'inProgress'"
                    color="warning"
                    size="xs"
                    variant="subtle"
                    class="font-semibold flex items-center gap-1 w-fit"
                  >
                    <UIcon name="i-lucide-mail-check" class="size-3" />
                    ส่งคำขอประเมินแล้ว
                  </UBadge>
                  <UBadge
                    v-else-if="row.status === 'cycle_unselected'"
                    color="warning"
                    size="xs"
                    variant="subtle"
                    class="font-semibold flex items-center gap-1 w-fit"
                  >
                    <UIcon name="i-lucide-calendar-days" class="size-3" />
                    เลือกรอบเพื่อดูสถานะ
                  </UBadge>
                  <UBadge
                    v-else-if="row.status === 'assignment_ambiguous'"
                    color="error"
                    size="xs"
                    variant="subtle"
                    class="font-semibold flex items-center gap-1 w-fit"
                  >
                    <UIcon name="i-lucide-triangle-alert" class="size-3" />
                    พบ assignment ซ้ำ
                  </UBadge>
                  <UBadge
                    v-else-if="row.status === 'assignment_load_error'"
                    color="error"
                    size="xs"
                    variant="subtle"
                    class="font-semibold flex items-center gap-1 w-fit"
                  >
                    <UIcon name="i-lucide-circle-alert" class="size-3" />
                    โหลดสถานะไม่สำเร็จ
                  </UBadge>
                  <UBadge
                    v-else
                    color="neutral"
                    size="xs"
                    variant="subtle"
                    class="font-semibold flex items-center gap-1 w-fit"
                  >
                    <UIcon name="i-lucide-user-x" class="size-3" />
                    รอระบุผู้ประเมิน
                  </UBadge>

                  <!-- แสดงคะแนนถ้ามีผลประเมินจริง -->
                  <div
                    v-if="
                      row.status === 'submitted' && row.scoreDisplay !== '-'
                    "
                    class="text-[11px] text-emerald-700 dark:text-emerald-400 font-bold"
                  >
                    คะแนน: {{ row.scoreDisplay }} / 5.0
                    <span v-if="row.gradeDisplay !== '-'">
                      (เกรด {{ row.gradeDisplay }})</span
                    >
                  </div>
                </div>
              </td>

              <!-- 9. จัดการ (3 dots dropdown menu) -->
              <td class="py-3 px-4 text-right" @click.stop>
                <div class="flex items-center justify-end">
                  <UDropdownMenu
                    :items="getRowActions(row)"
                    :content="{ align: 'end' }"
                  >
                    <UButton
                      aria-label="การจัดการข้อมูลนักศึกษา"
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
        :total="directoryTotal"
        items-name="คน"
      />
    </div>

    <!-- ========================================================================= -->
    <!-- 5. MODAL ดูรายละเอียดนักศึกษา ผลคะแนน และข้อมูลฟอร์มเชิงลึก                -->
    <!-- ========================================================================= -->
    <UModal
      v-model:open="detailModalOpen"
      :ui="{
        content:
          'sm:max-w-5xl lg:max-w-6xl xl:max-w-7xl w-[96vw] max-h-[92vh] flex flex-col p-0 overflow-hidden'
      }"
    >
      <template #content>
        <div v-if="activeStudentRow" class="flex flex-col h-full max-h-[92vh]">
          <!-- ส่วนหัว Modal (Fixed Header) -->
          <div
            class="flex items-center justify-between gap-4 border-b border-default bg-muted/20 px-6 py-4 shrink-0"
          >
            <div class="flex items-center gap-3">
              <span
                class="grid size-12 place-items-center rounded-xl bg-primary/10 text-primary ring-1 ring-primary/20"
              >
                <UIcon name="i-lucide-user" class="size-6" />
              </span>
              <div>
                <div class="flex items-center gap-2">
                  <h3 class="text-lg font-bold text-highlighted">
                    {{ activeStudentRow.nameTh }}
                  </h3>
                  <UBadge
                    color="primary"
                    size="xs"
                    variant="soft"
                    class="font-mono"
                  >
                    {{ activeStudentRow.studentId }}
                  </UBadge>
                </div>
                <p class="text-xs text-muted">
                  {{ activeStudentRow.nameEn }} · {{ activeStudentRow.email }}
                </p>
              </div>
            </div>

            <UButton
              color="neutral"
              icon="i-lucide-x"
              size="sm"
              variant="ghost"
              @click="detailModalOpen = false"
            />
          </div>

          <!-- เนื้อหาแบ่งเป็น 2 ฝั่ง (Scrollable 2-Column Body) -->
          <div class="flex-1 overflow-y-auto p-6">
            <div class="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
              <!-- ============================================================= -->
              <!-- ฝั่งซ้าย: ข้อมูลนักศึกษา, สถานที่ฝึกงาน และสรุปผลประเมิน (5 cols) -->
              <!-- ============================================================= -->
              <div class="lg:col-span-5 space-y-4 text-xs">
                <!-- 1. ข้อมูลการศึกษาและหลักสูตร -->
                <div
                  class="space-y-2.5 rounded-xl border border-default bg-muted/20 p-4"
                >
                  <h4
                    class="font-bold text-highlighted flex items-center gap-1.5 text-xs"
                  >
                    <UIcon
                      name="i-lucide-graduation-cap"
                      class="size-4 text-primary"
                    />
                    ข้อมูลการศึกษาและหลักสูตร
                  </h4>
                  <div class="space-y-2 pt-1 text-muted">
                    <div>
                      <span class="text-muted/80">สำนักวิชา:</span>
                      <p class="font-semibold text-highlighted text-xs">
                        {{ activeStudentRow.schoolTh }}
                      </p>
                      <p class="text-[11px] text-muted">
                        {{ activeStudentRow.schoolEn }}
                      </p>
                    </div>
                    <div>
                      <span class="text-muted/80">สาขาวิชา:</span>
                      <p class="font-semibold text-highlighted text-xs">
                        {{ activeStudentRow.programTh }}
                      </p>
                      <p class="text-[11px] text-muted">
                        {{ activeStudentRow.programEn }}
                      </p>
                    </div>
                    <div>
                      <span class="text-muted/80">รายวิชา (Course):</span>
                      <div class="pt-0.5 flex items-center gap-1.5">
                        <UBadge
                          :color="
                            activeStudentRow.courseDisplay ===
                            'Cooperative Education'
                              ? 'primary'
                              : 'neutral'
                          "
                          size="xs"
                          variant="subtle"
                          class="text-xs font-medium inline-flex items-center gap-1"
                        >
                          <UIcon
                            :name="
                              activeStudentRow.courseDisplay ===
                              'Cooperative Education'
                                ? 'i-lucide-briefcase'
                                : 'i-lucide-graduation-cap'
                            "
                            class="size-3.5"
                          />
                          <span>{{ activeStudentRow.courseDisplay }}</span>
                        </UBadge>
                        <span class="text-muted text-[11px]"
                          >({{ activeStudentRow.courseTh }})</span
                        >
                      </div>
                    </div>
                    <div
                      class="flex justify-between items-center pt-1 border-t border-default/70"
                    >
                      <span
                        >ปีการศึกษา:
                        <strong class="text-highlighted"
                          >{{ activeStudentRow.academicYear }} ({{
                            activeStudentRow.academicYearEn
                          }})</strong
                        >
                      </span>
                      <span
                        >ภาคเรียน:
                        <strong class="text-highlighted">{{
                          activeStudentRow.semester?.startsWith('ภาคการศึกษา')
                            ? activeStudentRow.semester
                            : `ภาคการศึกษาที่ ${activeStudentRow.semester}`
                        }}</strong>
                      </span>
                    </div>
                    <div class="border-t border-default/70 pt-1.5">
                      <span class="text-muted/80">อาจารย์ที่ปรึกษา:</span>
                      <p class="font-semibold text-highlighted text-xs">
                        {{
                          activeStudentRow.advisorTh !== '-'
                            ? activeStudentRow.advisorTh
                            : 'ยังไม่ได้ระบุอาจารย์ที่ปรึกษา'
                        }}
                      </p>
                      <p
                        v-if="activeStudentRow.advisorEn !== '-'"
                        class="text-[11px] text-muted"
                      >
                        {{ activeStudentRow.advisorEn }}
                      </p>
                    </div>
                  </div>
                </div>

                <!-- 2. สถานที่ตั้งบริษัทและคนทำแบบฟอร์ม -->
                <div
                  class="space-y-2.5 rounded-xl border border-default bg-muted/20 p-4"
                >
                  <h4
                    class="font-bold text-highlighted flex items-center gap-1.5 text-xs"
                  >
                    <UIcon
                      name="i-lucide-building-2"
                      class="size-4 text-primary"
                    />
                    สถานที่ตั้งบริษัทและคนทำฟอร์ม
                  </h4>
                  <div class="space-y-2 pt-1 text-muted">
                    <div>
                      <span class="text-muted/80">สถานประกอบการ (บริษัท):</span>
                      <p class="font-semibold text-highlighted text-xs">
                        {{ activeStudentRow.company }}
                      </p>
                    </div>
                    <div>
                      <span class="text-muted/80">สถานที่ตั้งบริษัท:</span>
                      <p class="font-semibold text-highlighted text-xs">
                        {{ activeStudentRow.companyAddress || '-' }}
                      </p>
                    </div>
                    <div class="border-t border-default/70 pt-1.5">
                      <span class="text-muted/80"
                        >คนทำแบบฟอร์ม (ผู้ประเมิน):</span
                      >
                      <p class="font-semibold text-highlighted text-xs">
                        {{
                          activeStudentRow.evaluatorTh !== '-'
                            ? activeStudentRow.evaluatorTh
                            : 'ยังไม่ได้ระบุผู้ประเมิน'
                        }}
                      </p>
                      <p
                        v-if="
                          activeStudentRow.evaluatorPositionTh !== '-' ||
                          activeStudentRow.evaluatorEmail !== '-'
                        "
                        class="text-[11px] text-muted"
                      >
                        {{
                          activeStudentRow.evaluatorPositionTh !== '-'
                            ? activeStudentRow.evaluatorPositionTh
                            : ''
                        }}
                        {{
                          activeStudentRow.evaluatorEmail !== '-'
                            ? `(${activeStudentRow.evaluatorEmail})`
                            : ''
                        }}
                      </p>
                    </div>

                    <div
                      class="mt-2 rounded-lg border border-default bg-muted/30 p-2.5 text-[11px] text-muted"
                    >
                      ระบบส่งข้อมูลเข้าประเมินผ่านคำเชิญทางอีเมล
                      รหัสลับไม่แสดงและไม่ส่งออกจากทะเบียนนักศึกษา
                    </div>
                  </div>
                </div>

                <!-- 3. สรุปผลการประเมินสมรรถนะเบื้องต้น -->
                <div
                  class="rounded-xl border border-default bg-default p-4 space-y-3"
                >
                  <div class="flex items-center justify-between">
                    <h4
                      class="font-bold text-highlighted text-xs flex items-center gap-1.5"
                    >
                      <UIcon name="i-lucide-star" class="size-4 text-warning" />
                      สรุปคะแนนประเมิน
                    </h4>
                    <UBadge
                      :color="
                        activeStudentRow.status === 'submitted'
                          ? 'success'
                          : activeStudentRow.status === 'email_error'
                            ? 'error'
                            : activeStudentRow.status === 'inProgress'
                              ? 'warning'
                              : 'neutral'
                      "
                      size="xs"
                      variant="soft"
                    >
                      {{ activeStudentRow.statusTh }}
                    </UBadge>
                  </div>

                  <div
                    v-if="
                      activeStudentRow.status === 'submitted' &&
                      evaluationResult
                    "
                    class="grid grid-cols-2 gap-2 text-center"
                  >
                    <div
                      class="rounded-lg border border-blue-500/20 bg-blue-500/5 p-2"
                    >
                      <p class="text-[10px] text-blue-700 dark:text-blue-300">
                        Hard Skills
                      </p>
                      <p class="mt-0.5 font-bold text-sm text-highlighted">
                        {{
                          formatCategoryAverage(evaluationResult.hardSkillScore)
                        }}
                        <span v-if="evaluationResult.hardSkillScore?.scaleMax">
                          / {{ evaluationResult.hardSkillScore.scaleMax }}
                        </span>
                      </p>
                    </div>
                    <div
                      class="rounded-lg border border-purple-500/20 bg-purple-500/5 p-2"
                    >
                      <p
                        class="text-[10px] text-purple-700 dark:text-purple-300"
                      >
                        Soft Skills
                      </p>
                      <p class="mt-0.5 font-bold text-sm text-highlighted">
                        {{
                          formatCategoryAverage(evaluationResult.softSkillScore)
                        }}
                        <span v-if="evaluationResult.softSkillScore?.scaleMax">
                          / {{ evaluationResult.softSkillScore.scaleMax }}
                        </span>
                      </p>
                    </div>
                  </div>

                  <div
                    v-else-if="
                      activeStudentRow.status === 'submitted' &&
                      evaluationResultLoading
                    "
                    class="flex items-center justify-center gap-2 py-4 text-xs text-muted"
                  >
                    <UIcon
                      name="i-lucide-loader-circle"
                      class="size-4 animate-spin"
                    />
                    กำลังโหลดผลประเมินฉบับสมบูรณ์
                  </div>

                  <div
                    v-else-if="activeStudentRow.status === 'email_error'"
                    class="p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-700 dark:text-red-400 text-xs space-y-1"
                  >
                    <p class="font-bold flex items-center gap-1.5">
                      <UIcon
                        name="i-lucide-alert-triangle"
                        class="size-4 text-error"
                      />
                      ส่งอีเมลแบบประเมินไม่สำเร็จ
                    </p>
                    <p class="text-muted leading-relaxed">
                      ระบบส่งอีเมลไม่สำเร็จเนื่องจากที่อยู่อีเมลไม่ถูกต้อง
                      หรือเซิร์ฟเวอร์ปลายทางปฏิเสธ
                      โปรดตรวจสอบอีเมลผู้ประเมินและส่งใหม่อีกครั้ง
                    </p>
                  </div>

                  <div
                    v-else-if="activeStudentRow.status !== 'submitted'"
                    class="text-center py-4 text-muted text-xs"
                  >
                    <p>ผู้ประเมินยังไม่ได้ส่งผลการประเมินฉบับสมบูรณ์</p>
                    <p class="text-[11px] text-muted/70 mt-0.5">
                      ตรวจสอบคำเชิญและสถานะการส่งจากระบบ Correspondence
                    </p>
                  </div>
                </div>
              </div>

              <!-- ============================================================= -->
              <!-- ฝั่งขวา: การวิเคราะห์สมรรถนะ & Benchmark (7 cols)               -->
              <!-- ============================================================= -->
              <div class="lg:col-span-7">
                <div
                  v-if="
                    activeStudentRow.status === 'submitted' && evaluationResult
                  "
                >
                  <StudentEvaluationResult
                    :hard-skill-score="evaluationResult.hardSkillScore"
                    :soft-skill-score="evaluationResult.softSkillScore"
                    :hard-skill-questions="evaluationResult.hardSkillQuestions"
                    :soft-skill-questions="evaluationResult.softSkillQuestions"
                    :suggestions="evaluationResult.suggestions"
                  />
                </div>
                <div
                  v-else-if="
                    activeStudentRow.status === 'submitted' &&
                    evaluationResultLoading
                  "
                  class="min-h-[360px] rounded-xl border border-default bg-muted/10 p-8 flex items-center justify-center gap-2 text-sm text-muted"
                >
                  <UIcon
                    name="i-lucide-loader-circle"
                    class="size-5 animate-spin"
                  />
                  กำลังโหลดผลประเมินจากระบบ
                </div>
                <div
                  v-else-if="activeStudentRow.status === 'submitted'"
                  class="min-h-[360px] rounded-xl border border-error/30 bg-error/5 p-8 flex flex-col items-center justify-center gap-3 text-center"
                >
                  <UIcon
                    name="i-lucide-triangle-alert"
                    class="size-7 text-error"
                  />
                  <p class="text-sm font-semibold text-highlighted">
                    {{ evaluationResultError || 'ยังโหลดผลประเมินไม่ได้' }}
                  </p>
                  <UButton
                    color="primary"
                    icon="i-lucide-refresh-cw"
                    label="ลองโหลดอีกครั้ง"
                    size="sm"
                    variant="soft"
                    @click="loadEvaluationResult(activeStudentRow)"
                  />
                </div>
                <div
                  v-else
                  class="rounded-xl border border-default bg-muted/10 p-8 text-center space-y-3 flex flex-col items-center justify-center min-h-[360px]"
                >
                  <div
                    class="size-14 rounded-full bg-amber-500/10 text-amber-600 flex items-center justify-center ring-1 ring-amber-500/20"
                  >
                    <UIcon name="i-lucide-clock-3" class="size-7" />
                  </div>
                  <div>
                    <h4 class="font-bold text-sm text-highlighted">
                      ยังไม่มีข้อมูลการประเมินสมรรถนะ
                    </h4>
                    <p class="text-xs text-muted mt-1 max-w-md">
                      เมื่อผู้ประเมินเปิดลิงก์คำเชิญและส่งผลฉบับสมบูรณ์
                      ระบบจะแสดงคะแนนแยกตาม Hard Skills และ Soft Skills
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <!-- ท้าย Modal (Fixed Footer) -->
          <div
            class="flex flex-wrap items-center justify-between gap-3 border-t border-default bg-muted/20 px-6 py-3.5 shrink-0"
          >
            <div class="flex items-center gap-2">
              <UButton
                color="warning"
                icon="i-lucide-award"
                label="Certificate ยังไม่พร้อม"
                size="sm"
                variant="subtle"
                disabled
                @click="openDoc('certification', activeStudentRow)"
              />
              <UButton
                color="info"
                icon="i-lucide-file-text"
                label="Transcript ยังไม่พร้อม"
                size="sm"
                variant="subtle"
                disabled
                @click="openDoc('referral', activeStudentRow)"
              />
            </div>
            <div class="flex items-center gap-2">
              <UButton
                color="neutral"
                label="ปิด"
                size="sm"
                variant="outline"
                @click="detailModalOpen = false"
              />
            </div>
          </div>
        </div>
      </template>
    </UModal>

    <!-- ========================================================================= -->
    <!-- 6. MODAL EDIT STUDENT (แก้ไขข้อมูลนักศึกษา)                                 -->
    <!-- ========================================================================= -->
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

              <!-- 2. สาขา / ที่ตั้งสถานประกอบการ -->
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
                <input
                  v-model="editForm.province"
                  placeholder="เช่น เชียงราย, กรุงเทพมหานคร"
                  class="w-full h-11 rounded-xl border border-default bg-default px-3 text-sm text-highlighted focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20 transition-colors"
                />
              </div>

              <!-- 4. สำนักวิชา -->
              <div>
                <label
                  class="block text-xs font-semibold text-highlighted mb-1.5"
                >
                  สำนักวิชา (School) <span class="text-rose-500">*</span>
                </label>
                <PaginatedLookupSelect
                  :model-value="editForm.schoolId"
                  api-path="/academic/schools"
                  id-query-param="schoolIds"
                  label="สำนักวิชา"
                  required
                  control-class="h-11 rounded-xl text-sm focus:border-primary focus:ring-2 focus:ring-primary/20"
                  @update:model-value="setEditSchool"
                />
              </div>

              <!-- 5. สาขาวิชา / หลักสูตร -->
              <div>
                <label
                  class="block text-xs font-semibold text-highlighted mb-1.5"
                >
                  สาขาวิชา / หลักสูตร (Program)
                  <span class="text-rose-500">*</span>
                </label>
                <PaginatedLookupSelect
                  v-model="editForm.programId"
                  api-path="/academic/programs"
                  id-query-param="programIds"
                  label="สาขาวิชา / หลักสูตร"
                  :query="
                    editForm.schoolId ? { schoolId: editForm.schoolId } : {}
                  "
                  required
                  control-class="h-11 rounded-xl text-sm focus:border-primary focus:ring-2 focus:ring-primary/20"
                />
              </div>

              <!-- 6. รายวิชาที่ฝึกงาน -->
              <div>
                <label
                  class="block text-xs font-semibold text-highlighted mb-1.5"
                >
                  รายวิชาที่ฝึกงาน (Course)
                </label>
                <PaginatedLookupSelect
                  v-model="editForm.courseId"
                  api-path="/academic/courses"
                  id-query-param="courseIds"
                  label="รายวิชาที่ฝึกงาน"
                  empty-label="-- ไม่ระบุรายวิชา --"
                  :query="
                    editForm.programId ? { programId: editForm.programId } : {}
                  "
                  control-class="h-11 rounded-xl text-sm focus:border-primary focus:ring-2 focus:ring-primary/20"
                />
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
                    {{ editForm.semester }}
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

              <!-- 3. Thai Name -->
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

              <!-- 4. English Name -->
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

              <!-- 5. Email: เมลนักศึกษา -->
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

              <!-- 6. Email: เมลส่วนตัว -->
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

          <!-- Bottom Actions -->
          <div
            class="flex items-center justify-end gap-3 pt-4 border-t border-default"
          >
            <UButton
              color="neutral"
              label="ยกเลิก"
              variant="outline"
              size="lg"
              @click="isEditModalOpen = false"
            />
            <UButton
              color="primary"
              icon="i-lucide-check"
              label="บันทึกการแก้ไข"
              type="submit"
              size="lg"
              :loading="isEditSubmitting"
            />
          </div>
        </form>
      </div>
    </div>
  </div>
</template>
