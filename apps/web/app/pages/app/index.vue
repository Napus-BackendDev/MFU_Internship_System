<script setup lang="ts">
import type {
  EnrichedStudentRow
} from '~/components/AdminStudentDirectory.vue'
import {
  buildStudentEvaluationResult,
  formatCategoryAverage,
  type EvaluationSectionSnapshot,
  type StudentEvaluationRecord
} from '~/utils/student-evaluation-result'
import { loadAllPages, type PaginatedItems } from '~/utils/load-all-pages'
import { loadItemsOrEmpty } from '~/utils/load-items-or-empty'
import { selectCurrentStudentAssignment } from '~/utils/student-assignment'
import {
  createStudentDocumentIdempotencyKey,
  findDocumentForEvaluationSet,
  getStudentDocumentState,
  resolvePublishedDocumentVersion,
  type GeneratedDocumentStatus,
  type StudentDocumentTemplateCandidate,
  type StudentDocumentType,
  type StudentGeneratedDocument
} from '~/utils/student-documents'

definePageMeta({ layout: 'app', middleware: 'auth' })

interface Overview {
  readonly students: number
  readonly assignments: Readonly<Record<string, number>>
  readonly failedDeliveries: number
  readonly readyDocuments: number
  readonly generatedAt: string
}

interface StudentItem {
  readonly id: string
  readonly studentId: string
  readonly name: string | { readonly th: string; readonly en: string }
  readonly email: string
  readonly schoolId: string
  readonly programId: string
  readonly academicTermId?: string
  readonly company?: string
  readonly province?: string
  readonly semester?: string
  readonly academicYear?: number
  readonly admissionYear?: number
  readonly status: string
  readonly directoryRelations?: {
    readonly school?: SchoolItem
    readonly program?: ProgramItem
  }
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
  readonly academicTermId?: string
  readonly positionTitle?: { readonly th: string; readonly en: string }
  readonly startsAt?: string
  readonly endsAt?: string
  readonly status: string
}

interface OrganizationItem {
  readonly id: string
  readonly name: { readonly th: string; readonly en: string }
  readonly contactEmail?: string
}

interface EvaluatorItem {
  readonly id: string
  readonly name: { readonly th: string; readonly en: string }
  readonly email: string
  readonly position?: { readonly th: string; readonly en: string }
}

interface EvaluationAssignmentItem {
  readonly id: string
  readonly studentId: string
  readonly createdAt: string
  readonly cycleId?: string
  readonly evaluatorId: string
  readonly deadlineAt: string
  readonly status:
    | 'pending'
    | 'inProgress'
    | 'submitted'
    | 'expired'
    | 'reopened'
    | 'email_error'
  readonly questionSnapshot?: readonly EvaluationSectionSnapshot[]
  readonly placementId?: string
}

interface GeneratedDocItem extends StudentGeneratedDocument {
  readonly studentId: string
  readonly templateVersionId: string
  readonly objectKey?: string
}

interface StudentDocumentSource {
  readonly placementId: string
  readonly evaluationIds: readonly string[]
}

interface StudentDocumentTemplateItem {
  readonly id: string
  readonly documentType: StudentDocumentType
  readonly status: 'active' | 'archived'
}

interface StudentDocumentTemplateVersionItem {
  readonly id: string
  readonly templateId: string
  readonly status: 'draft' | 'published' | 'retired'
}

interface StudentDocumentTemplateAvailability {
  readonly status:
    'idle' | 'loading' | 'available' | 'unavailable' | 'ambiguous' | 'error'
  readonly versionId?: string
  readonly message?: string
}

const api = useApi()
const auth = useAuthStore()
const toast = useToast()

const isStudent = computed(() => Boolean(auth.actor?.roles.includes('student')))

// Admin Overview Data
const {
  data: overviewData,
  error: overviewError,
  pending: overviewPending,
  refresh: refreshOverview
} = await useAsyncData(
  'overview',
  () =>
    isStudent.value
      ? Promise.resolve(null)
      : api<Overview>('/reports/overview'),
  { watch: [isStudent] }
)

// Student Dynamic Data
const studentProfile = ref<StudentItem | null>(null)
const studentSchool = ref<SchoolItem | null>(null)
const studentProgram = ref<ProgramItem | null>(null)
const studentPlacement = ref<PlacementItem | null>(null)
const studentOrg = ref<OrganizationItem | null>(null)
const studentEvaluator = ref<EvaluatorItem | null>(null)
const studentAssignment = ref<EvaluationAssignmentItem | null>(null)
const studentDocs = ref<GeneratedDocItem[]>([])
const documentSource = ref<StudentDocumentSource | null>(null)
const documentSourceUnavailableReason = ref('')
const documentTemplateAvailability = ref<
  Record<StudentDocumentType, StudentDocumentTemplateAvailability>
>({
  certificate: { status: 'idle' },
  transcript: { status: 'idle' }
})
const certificateDocumentState = computed(() =>
  getStudentDocumentState(studentDocs.value, 'certificate')
)
const transcriptDocumentState = computed(() =>
  getStudentDocumentState(studentDocs.value, 'transcript')
)
const certificateSourceDocument = computed(() =>
  documentSource.value
    ? findDocumentForEvaluationSet(
        studentDocs.value,
        'certificate',
        documentSource.value.evaluationIds
      )
    : null
)
const transcriptSourceDocument = computed(() =>
  documentSource.value
    ? findDocumentForEvaluationSet(
        studentDocs.value,
        'transcript',
        documentSource.value.evaluationIds
      )
    : null
)
const activeDocumentDownload = ref<StudentDocumentType | null>(null)
const activeDocumentGeneration = ref<StudentDocumentType | null>(null)
const studentDataLoading = ref(false)
const studentDataError = ref('')
const submittedEvaluation = ref<
  (StudentEvaluationRecord & { readonly submittedAt?: string }) | null
>(null)
const studentQuestionSnapshot = ref<readonly EvaluationSectionSnapshot[]>([])

// Document Preview & Download Modal State
export interface TargetStudentDocContext {
  studentId: string
  nameTh: string
  nameEn: string
  email: string
  schoolTh: string
  schoolEn: string
  programTh: string
  programEn: string
  company: string
  province: string
  academicYear: number | string
  semester: string
  evaluatorTh: string
  evaluatorEn: string
  evaluatorPositionTh: string
  evaluatorPositionEn: string
  deanTh: string
  deanEn: string
  startsAtText: string
  endsAtText: string
  totalHours: number | null
  scoreDisplay: string
  gradeDisplay: string
  commentsTh: string
  referenceNumber: string
}

const previewModalOpen = ref(false)
const previewDocType = ref<'certification' | 'referral'>('certification')
const downloadModalOpen = ref(false)
const selectedAdminStudentRow = ref<EnrichedStudentRow | null>(null)

async function loadStudentData(): Promise<void> {
  if (!isStudent.value) return
  studentDataLoading.value = true
  studentDataError.value = ''
  studentProfile.value = null
  studentSchool.value = null
  studentProgram.value = null
  studentPlacement.value = null
  studentOrg.value = null
  studentEvaluator.value = null
  studentAssignment.value = null
  studentDocs.value = []
  submittedEvaluation.value = null
  studentQuestionSnapshot.value = []
  documentSource.value = null
  documentSourceUnavailableReason.value = ''
  documentTemplateAvailability.value = {
    certificate: { status: 'idle' },
    transcript: { status: 'idle' }
  }

  try {
    const currentStudentId = auth.actor?.scope.studentId
    if (!currentStudentId) throw new Error('STUDENT_SCOPE_REQUIRED')

    const [
      studentsRes,
      placementsRes,
      orgsRes,
      evaluatorsRes,
      assignmentsRes,
      docsRes
    ] = await Promise.all([
      api<{ items: StudentItem[] }>('/students', {
        query: {
          studentId: currentStudentId,
          pageSize: 50,
          includeDirectoryData: true
        }
      }),
      loadAllPages(
        (page, pageSize) =>
          api<PaginatedItems<PlacementItem>>('/placements', {
            query: { page, pageSize }
          }),
        100
      ),
      api<{ items: OrganizationItem[] }>('/organizations', {
        query: { pageSize: 100 }
      }),
      api<{ items: EvaluatorItem[] }>('/evaluators', {
        query: { pageSize: 100 }
      }),
      loadAllPages(
        (page, pageSize) =>
          api<PaginatedItems<EvaluationAssignmentItem>>(
            '/evaluation-assignments',
            { query: { page, pageSize } }
          ),
        100
      ),
      loadAllPages(
        (page, pageSize) =>
          api<PaginatedItems<GeneratedDocItem>>('/generated-documents', {
            query: { page, pageSize }
          }),
        100
      )
    ])

    studentProfile.value =
      studentsRes.items.find((s) => s.studentId === currentStudentId) ?? null
    if (!studentProfile.value) throw new Error('STUDENT_NOT_FOUND')

    studentSchool.value =
      studentProfile.value.directoryRelations?.school ?? null

    studentProgram.value =
      studentProfile.value.directoryRelations?.program ?? null

    const matchingAssignments = assignmentsRes.items.filter(
      (assignment) =>
        assignment.studentId === studentProfile.value?.id ||
        assignment.studentId === studentProfile.value?.studentId
    )
    studentAssignment.value = selectCurrentStudentAssignment(
      assignmentsRes.items,
      studentProfile.value.id,
      studentProfile.value.studentId
    )

    studentPlacement.value =
      placementsRes.items.find(
        (placement) =>
          (placement.studentId === studentProfile.value?.id ||
            placement.studentId === studentProfile.value?.studentId) &&
          (!studentAssignment.value?.placementId ||
            placement.id === studentAssignment.value.placementId)
      ) ?? null

    studentOrg.value =
      orgsRes.items.find(
        (o) => o.id === studentPlacement.value?.organizationId
      ) ??
      orgsRes.items.find(
        (o) =>
          o.name?.th === studentProfile.value?.company ||
          o.name?.en === studentProfile.value?.company
      ) ??
      null

    studentEvaluator.value =
      evaluatorsRes.items.find(
        (e) => e.id === studentAssignment.value?.evaluatorId
      ) ?? null

    studentDocs.value = docsRes.items

    const completedPlacementCandidates = placementsRes.items
      .filter(
        (placement) =>
          (placement.studentId === studentProfile.value?.id ||
            placement.studentId === studentProfile.value?.studentId) &&
          placement.status === 'completed'
      )
      .map((placement) => ({
        placement,
        assignments: matchingAssignments.filter(
          (assignment) =>
            assignment.status === 'submitted' &&
            assignment.placementId === placement.id
        )
      }))
      .filter(({ assignments }) => assignments.length > 0)

    if (completedPlacementCandidates.length === 1) {
      const source = completedPlacementCandidates[0]
      if (!source) throw new Error('DOCUMENT_PLACEMENT_REQUIRED')
      if (source.assignments.length > 50) {
        documentSourceUnavailableReason.value =
          'ผลประเมินในรอบนี้เกินจำนวนที่ระบบออกเอกสารได้ กรุณาติดต่อเจ้าหน้าที่ตรวจสอบ'
      } else {
        try {
          const evaluations = await Promise.all(
            source.assignments.map(async (assignment) => {
              const result = await api<{
                assignment?: { readonly evaluationVersion?: number }
                evaluations?: StudentEvaluationRecord[]
              }>(`/evaluations/${encodeURIComponent(assignment.id)}`)
              return result.evaluations?.find(
                (evaluation) =>
                  typeof evaluation.id === 'string' &&
                  evaluation.version === result.assignment?.evaluationVersion &&
                  !evaluation.supersededAt
              )
            })
          )
          if (
            evaluations.some((evaluation) => !evaluation?.id) ||
            evaluations.length !== source.assignments.length
          ) {
            throw new Error('DOCUMENT_EVALUATION_SOURCE_INCOMPLETE')
          }
          documentSource.value = {
            placementId: source.placement.id,
            evaluationIds: evaluations
              .map((evaluation) => evaluation?.id)
              .filter((id): id is string => Boolean(id))
              .sort()
          }
        } catch (err: unknown) {
          console.error('Failed to resolve document evaluation sources:', err)
          documentSourceUnavailableReason.value =
            'ตรวจสอบผลประเมินเพื่อออกเอกสารไม่สำเร็จ กรุณาโหลดข้อมูลใหม่'
        }
      }
    } else if (completedPlacementCandidates.length > 1) {
      documentSourceUnavailableReason.value =
        'พบรอบฝึกงานที่จบแล้วและมีผลประเมินหลายรอบ กรุณาติดต่อเจ้าหน้าที่ให้ตรวจสอบก่อนออกเอกสาร'
    } else {
      documentSourceUnavailableReason.value =
        'เอกสารจะออกได้เมื่อสถานประกอบการปิดรอบฝึกงานและส่งผลประเมินแล้ว'
    }

    if (
      studentAssignment.value &&
      studentAssignment.value.status === 'submitted'
    ) {
      try {
        const evalRes = await api<{
          assignment?: {
            questionSnapshot?: readonly EvaluationSectionSnapshot[]
          }
          evaluations?: Array<
            StudentEvaluationRecord & { readonly submittedAt?: string }
          >
        }>(`/evaluations/${studentAssignment.value.id}`)
        if (
          evalRes.evaluations &&
          evalRes.evaluations.length > 0 &&
          evalRes.evaluations[0]
        ) {
          submittedEvaluation.value = evalRes.evaluations[0]
        }
        studentQuestionSnapshot.value =
          submittedEvaluation.value?.questionSnapshot ??
          evalRes.assignment?.questionSnapshot ??
          studentAssignment.value.questionSnapshot ??
          []
      } catch (err: unknown) {
        console.error('Failed to load evaluation record:', err)
        studentDataError.value = 'ไม่สามารถโหลดผลประเมินได้'
      }
    }
  } catch (err: unknown) {
    console.error('loadStudentData failed:', err)
    studentDataError.value = 'ไม่สามารถโหลดข้อมูลนักศึกษาได้ กรุณาลองใหม่'
  } finally {
    studentDataLoading.value = false
  }
}

// Admin Data for Student Directory Table
const adminDirectoryRefreshVersion = ref(0)

function loadAdminDirectoryData(): void {
  adminDirectoryRefreshVersion.value += 1
}

function refreshAllAdmin(): void {
  void refreshOverview()
  adminDirectoryRefreshVersion.value += 1
  void loadAdminDirectoryData()
}

const isStaff = computed(() =>
  Boolean(auth.actor?.roles.includes('internshipStaff'))
)
const staffWizardOpen = ref(false)
const studentWizardOpen = ref(false)

function checkStaffFirstTimeWizard(): void {
  // Staff setup wizard disabled per user request
}

function checkStudentFirstTimeWizard(): void {
  if (import.meta.client && isStudent.value && auth.actor?.id) {
    const key = `student_wizard_${auth.actor.id}`
    const hasCompleted = localStorage.getItem(key)
    if (!hasCompleted) {
      studentWizardOpen.value = true
    }
  }
}

function onStaffWizardCompleted(): void {
  refreshAllAdmin()
}

onMounted(() => {
  if (isStudent.value) {
    void loadStudentData()
    checkStudentFirstTimeWizard()
  } else {
    void loadAdminDirectoryData()
    if (isStaff.value) {
      checkStaffFirstTimeWizard()
    }
  }
})

watch(isStudent, (val) => {
  if (val) {
    void loadStudentData()
    checkStudentFirstTimeWizard()
  } else {
    void loadAdminDirectoryData()
  }
})

watch(isStaff, (val) => {
  if (val) checkStaffFirstTimeWizard()
})

watch([downloadModalOpen, documentSource], ([isOpen, source]) => {
  if (isOpen && source) void loadDocumentTemplateAvailability()
})

const studentEvaluationView = computed(() =>
  buildStudentEvaluationResult(
    submittedEvaluation.value
      ? {
          ...submittedEvaluation.value,
          questionSnapshot:
            submittedEvaluation.value.questionSnapshot ??
            studentQuestionSnapshot.value
        }
      : null
  )
)

const submittedScores = computed(() => {
  if (!submittedEvaluation.value) return null
  const result = studentEvaluationView.value
  const comments = result.suggestions
    .map((suggestion) => suggestion.value)
    .filter((value): value is string => value !== null)
    .join(' | ')

  return {
    hardSkill: formatCategoryAverage(result.hardSkillScore),
    softSkill: formatCategoryAverage(result.softSkillScore),
    comment: comments || '—'
  }
})

interface SkillSubSection {
  id: string
  title: string
  titleEn: string
  score: number | null
  maxScore: number | null
  icon: string
}

interface SuggestionDetailItem {
  id: string
  title: string
  titleEn: string
  value: string
  icon: string
}

function getSoftSkillIcon(id: string): string {
  const lower = id.toLowerCase()
  if (
    lower.includes('punctual') ||
    lower.includes('time') ||
    lower.includes('rule')
  )
    return 'i-lucide-clock'
  if (
    lower.includes('team') ||
    lower.includes('comm') ||
    lower.includes('human')
  )
    return 'i-lucide-users'
  if (
    lower.includes('responsib') ||
    lower.includes('duty') ||
    lower.includes('learn')
  )
    return 'i-lucide-award'
  if (
    lower.includes('problem') ||
    lower.includes('think') ||
    lower.includes('creat')
  )
    return 'i-lucide-lightbulb'
  if (lower.includes('ethic') || lower.includes('integrity'))
    return 'i-lucide-shield-check'
  return 'i-lucide-smile'
}

function getHardSkillIcon(id: string): string {
  const lower = id.toLowerCase()
  if (
    lower.includes('tech') ||
    lower.includes('dev') ||
    lower.includes('code') ||
    lower.includes('knowl')
  )
    return 'i-lucide-code-xml'
  if (
    lower.includes('problem') ||
    lower.includes('solv') ||
    lower.includes('anal')
  )
    return 'i-lucide-cpu'
  if (lower.includes('data') || lower.includes('db')) return 'i-lucide-database'
  if (lower.includes('qa') || lower.includes('test'))
    return 'i-lucide-shield-check'
  return 'i-lucide-layers'
}

// Soft Skill rows are sourced only from the immutable evaluation snapshot.
const softSkillSubSections = computed<SkillSubSection[]>(() => {
  return studentEvaluationView.value.softSkillQuestions.map((question) => {
    return {
      id: question.id,
      title: question.label.th,
      titleEn: question.label.en,
      score: question.score,
      maxScore: question.scaleMax,
      icon: getSoftSkillIcon(question.id)
    }
  })
})

// Hard Skill rows are sourced only from the immutable evaluation snapshot.
const hardSkillSubSections = computed<SkillSubSection[]>(() => {
  return studentEvaluationView.value.hardSkillQuestions.map((question) => {
    return {
      id: question.id,
      title: question.label.th,
      titleEn: question.label.en,
      score: question.score,
      maxScore: question.scaleMax,
      icon: getHardSkillIcon(question.id)
    }
  })
})

// หมวด 3: Suggestions & Feedback (ไดนามิกตามโครงสร้างฟอร์มจริง)
const dynamicSuggestions = computed<SuggestionDetailItem[]>(() => {
  return studentEvaluationView.value.suggestions.map((suggestion) => ({
    id: suggestion.id,
    title: suggestion.label.th,
    titleEn: suggestion.label.en,
    value: suggestion.value ?? '—',
    icon: suggestion.id.toLowerCase().includes('strength')
      ? 'i-lucide-sparkles'
      : 'i-lucide-message-square-quote'
  }))
})

// คำนวณคะแนนเฉลี่ยแยกแต่ละหมวด
const softSkillsAverage = computed(() =>
  formatCategoryAverage(studentEvaluationView.value.softSkillScore)
)

const hardSkillsAverage = computed(() =>
  formatCategoryAverage(studentEvaluationView.value.hardSkillScore)
)

function getDeanForSchool(schoolCode?: string): { th: string; en: string } {
  switch (schoolCode) {
    case 'IT':
      return {
        th: 'รองศาสตราจารย์ ดร. คณบดีสำนักวิชาเทคโนโลยีดิจิทัลประยุกต์',
        en: 'Assoc. Prof. Dr. Dean, School of Applied Digital Technology'
      }
    case 'LAW':
      return {
        th: 'ผู้ช่วยศาสตราจารย์ ดร. คณบดีสำนักวิชานิติศาสตร์',
        en: 'Asst. Prof. Dr. Dean, School of Law'
      }
    case 'MGT':
      return {
        th: 'รองศาสตราจารย์ ดร. คณบดีสำนักวิชาการจัดการ',
        en: 'Assoc. Prof. Dr. Dean, School of Management'
      }
    case 'NUR':
      return {
        th: 'ศาสตราจารย์ ดร. คณบดีสำนักวิชาพยาบาลศาสตร์',
        en: 'Prof. Dr. Dean, School of Nursing'
      }
    case 'SCI':
      return {
        th: 'ศาสตราจารย์ ดร. คณบดีสำนักวิชาวิทยาศาสตร์',
        en: 'Prof. Dr. Dean, School of Science'
      }
    default:
      return {
        th: 'ศาสตราจารย์ ดร. คณบดีสำนักวิชา มหาวิทยาลัยแม่ฟ้าหลวง',
        en: 'Prof. Dr. Dean, Mae Fah Luang University'
      }
  }
}

// Format Thai Date string from ISO
function formatThaiDate(isoString?: string, fallback: string = '-'): string {
  if (!isoString) return fallback
  try {
    const d = new Date(isoString)
    if (isNaN(d.getTime())) return fallback
    return d.toLocaleDateString('th-TH', {
      day: 'numeric',
      month: 'long',
      year: 'numeric'
    })
  } catch {
    return fallback
  }
}

// Unified dynamic student context for official documents
const activeDocContext = computed<TargetStudentDocContext>(() => {
  // If an admin selected a specific student row
  if (selectedAdminStudentRow.value) {
    const row = selectedAdminStudentRow.value
    const dean = getDeanForSchool(row.schoolCode)
    const startsAt = formatThaiDate(row.placement?.startsAt, '-')
    const endsAt = formatThaiDate(row.placement?.endsAt, '-')
    const totalHours = null

    return {
      studentId: row.studentId,
      nameTh: row.nameTh,
      nameEn: row.nameEn,
      email: row.email,
      schoolTh: row.schoolTh,
      schoolEn: row.schoolEn,
      programTh: row.programTh,
      programEn: row.programEn,
      company: row.company,
      province: row.province,
      academicYear: row.academicYear,
      semester: row.semester,
      evaluatorTh: row.evaluatorTh,
      evaluatorEn: row.evaluatorEn,
      evaluatorPositionTh: row.evaluatorPositionTh,
      evaluatorPositionEn: row.evaluatorPositionEn,
      deanTh: dean.th,
      deanEn: dean.en,
      startsAtText: startsAt,
      endsAtText: endsAt,
      totalHours,
      scoreDisplay: '-',
      gradeDisplay: '-',
      commentsTh: row.commentsTh,
      referenceNumber: '—'
    }
  }

  // Otherwise, default to logged-in student's real profile
  const profile = studentProfile.value
  const school = studentSchool.value
  const program = studentProgram.value
  const placement = studentPlacement.value
  const evaluator = studentEvaluator.value
  const sId = profile?.studentId ?? ''
  const explicitAcademicYear = Number(profile?.academicYear)
  const yearTh =
    Number.isFinite(explicitAcademicYear) && explicitAcademicYear > 0
      ? String(
          explicitAcademicYear > 2400
            ? explicitAcademicYear
            : explicitAcademicYear + 543
        )
      : '-'
  const dean = getDeanForSchool(school?.schoolCode)
  const startsAt = formatThaiDate(placement?.startsAt, '-')
  const endsAt = formatThaiDate(placement?.endsAt, '-')
  return {
    studentId: sId || '-',
    nameTh:
      typeof profile?.name === 'string'
        ? profile.name
        : profile?.name?.th ?? profile?.name?.en ?? '-',
    nameEn:
      typeof profile?.name === 'string'
        ? profile.name
        : profile?.name?.en ?? profile?.name?.th ?? '-',
    email: profile?.email ?? '-',
    schoolTh: school?.name?.th ?? '-',
    schoolEn: school?.name?.en ?? '-',
    programTh: program?.name?.th ?? '-',
    programEn: program?.name?.en ?? '-',
    company: profile?.company ?? '-',
    province: profile?.province ?? '-',
    academicYear: yearTh,
    semester: profile?.semester ?? '-',
    evaluatorTh: evaluator?.name?.th ?? '-',
    evaluatorEn: evaluator?.name?.en ?? '-',
    evaluatorPositionTh: evaluator?.position?.th ?? '-',
    evaluatorPositionEn: evaluator?.position?.en ?? '-',
    deanTh: dean?.th ?? '-',
    deanEn: dean?.en ?? '-',
    startsAtText: startsAt,
    endsAtText: endsAt,
    totalHours: null,
    scoreDisplay: '-',
    gradeDisplay: '-',
    commentsTh: submittedScores.value?.comment ?? '-',
    referenceNumber: '—'
  }
})

// Official documents are not issued by a browser-side mock/template.
function notifyDocumentsUnavailable(): void {
  toast.add({
    title: 'ระบบออกเอกสารยังไม่พร้อม',
    description:
      'เอกสารจะดาวน์โหลดได้เมื่อมีแม่แบบที่อนุมัติและไฟล์ที่ออกจากระบบจริง',
    color: 'warning',
    icon: 'i-lucide-info'
  })
}

function handleAdminOpenDocument(payload: {
  type: 'certification' | 'referral'
  row: EnrichedStudentRow
}): void {
  void payload
  notifyDocumentsUnavailable()
}

function triggerPrint(): void {
  notifyDocumentsUnavailable()
}

function _downloadDocumentAsDoc(type: 'certification' | 'referral'): void {
  if (!import.meta.client) return

  const doc = activeDocContext.value
  const today = new Date().toLocaleDateString('th-TH', {
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  })

  let title = ''
  let filename = ''
  let docBody = ''

  if (type === 'certification') {
    title =
      'ใบประกาศนียบัตรรับรองการฝึกงาน (Certificate of Internship Completion)'
    filename = `Certification-${doc.studentId}.doc`
    docBody = `
      <div style="border: 4px double #d97706; padding: 40px; text-align: center; font-family: 'TH Sarabun New', 'Sarabun', Tahoma, sans-serif;">
        <h1 style="color: #92400e; font-size: 24pt; margin-bottom: 4px;">มหาวิทยาลัยแม่ฟ้าหลวง</h1>
        <h2 style="color: #78350f; font-size: 16pt; margin-top: 0;">MAE FAH LUANG UNIVERSITY</h2>
        <hr style="border: 1px solid #d97706; margin: 20px 0;" />
        <h3 style="font-size: 20pt; color: #1e293b; margin-top: 20px;">ใบประกาศนียบัตรรับรองการฝึกงาน</h3>
        <p style="font-style: italic; color: #475569; font-size: 12pt;">Certificate of Internship Completion</p>
        <p style="font-size: 14pt; margin-top: 30px;">ใบประกาศนียบัตรนี้ออกให้เพื่อแสดงว่า</p>
        <h2 style="font-size: 22pt; color: #78350f; margin: 15px 0;">${doc.nameTh} (${doc.nameEn})</h2>
        <p style="font-size: 14pt;">รหัสนักศึกษา: <strong>${doc.studentId}</strong></p>
        <p style="font-size: 14pt; line-height: 1.8; margin-top: 20px;">
          ได้ผ่านการฝึกปฏิบัติงานวิชาชีพตามเกณฑ์มาตรฐานการศึกษาระดับปริญญาตรี<br/>
          <strong>${doc.schoolTh} · ${doc.programTh}</strong><br/>
          ณ สถานประกอบการ: <strong>${doc.company}</strong> (จังหวัด ${doc.province})<br/>
          ระยะเวลา: ${doc.startsAtText} ถึง ${doc.endsAtText} (รวมทั้งสิ้น ${doc.totalHours} ชั่วโมง)<br/>
          <strong style="color: #059669;">ผลการประเมิน: ${doc.gradeDisplay} (คะแนนเฉลี่ย ${doc.scoreDisplay})</strong>
        </p>
        <table style="width: 100%; margin-top: 50px; text-align: center;">
          <tr>
            <td style="width: 50%;">
              <br/><br/>
              ____________________________<br/>
              (${doc.deanTh})<br/>
              คณบดีสำนักวิชา มหาวิทยาลัยแม่ฟ้าหลวง
            </td>
            <td style="width: 50%;">
              <br/><br/>
              ____________________________<br/>
              (${doc.evaluatorTh})<br/>
              ผู้ประเมินสถานประกอบการ (${doc.company})
            </td>
          </tr>
        </table>
        <p style="font-size: 10pt; color: #94a3b8; margin-top: 40px;">
          เลขที่รับรอง: CERT-${doc.academicYear}-${doc.studentId} | วันที่ออกเอกสาร: ${today}
        </p>
      </div>
    `
  } else {
    title = 'หนังสือส่งตัวนักศึกษาฝึกงาน (Official Referral Letter)'
    filename = `Referral-Letter-${doc.studentId}.doc`
    docBody = `
      <div style="padding: 40px; font-family: 'TH Sarabun New', 'Sarabun', Tahoma, sans-serif; font-size: 14pt; line-height: 1.6;">
        <div style="text-align: center; margin-bottom: 20px;">
          <h2 style="font-size: 18pt; margin: 0;">มหาวิทยาลัยแม่ฟ้าหลวง</h2>
          <p style="font-size: 12pt; margin: 0; color: #475569;">333 หมู่ 1 ต.ท่าสุด อ.เมือง จ.เชียงราย 57100</p>
        </div>
        <table style="width: 100%; margin-bottom: 20px;">
          <tr>
            <td>ที่ อว 7300/${doc.studentId.slice(-4)}</td>
            <td style="text-align: right;">ฝ่ายส่งเสริมและพัฒนาการฝึกงานวิชาชีพ</td>
          </tr>
          <tr>
            <td>เรื่อง: ขอส่งตัวนักศึกษาเข้าฝึกปฏิบัติงานวิชาชีพ</td>
            <td style="text-align: right;">วันที่ ${today}</td>
          </tr>
        </table>
        <p style="margin-top: 20px;"><strong>เรียน ผู้จัดการฝ่ายทรัพยากรบุคคล / ผู้บริหารสถานประกอบการ</strong><br/>${doc.company}</p>
        <p style="text-indent: 40px; margin-top: 20px;">
          ตามที่สถานประกอบการของท่านได้ให้ความอนุเคราะห์ตอบรับนักศึกษาของมหาวิทยาลัยแม่ฟ้าหลวง เข้าฝึกปฏิบัติงานวิชาชีพ เพื่อให้นักศึกษาได้นำความรู้ภาคทฤษฎีไปประยุกต์ใช้ในการปฏิบัติงานจริง ตลอดจนเสริมสร้างประสบการณ์และทักษะวิชาชีพนั้น
        </p>
        <p style="text-indent: 40px;">
          มหาวิทยาลัยแม่ฟ้าหลวง ใคร่ขอส่งตัวนักศึกษาต่อไปนี้ เข้าฝึกปฏิบัติงานวิชาชีพ ณ สถานประกอบการของท่าน:
        </p>
        <div style="background-color: #f8fafc; border: 1px solid #e2e8f0; padding: 15px; margin: 20px 40px;">
          <p style="margin: 4px 0;"><strong>ชื่อ-สกุล:</strong> ${doc.nameTh || doc.nameEn}</p>
          <p style="margin: 4px 0;"><strong>รหัสนักศึกษา:</strong> ${doc.studentId}</p>
          <p style="margin: 4px 0;"><strong>สำนักวิชา / หลักสูตร:</strong> ${doc.schoolTh} (${doc.programTh})</p>
          <p style="margin: 4px 0;"><strong>ช่วงเวลาฝึกปฏิบัติงาน:</strong> ${doc.startsAtText} ถึง ${doc.endsAtText} (รวมทั้งสิ้น ${doc.totalHours} ชั่วโมง)</p>
        </div>
        <p style="text-indent: 40px;">
          มหาวิทยาลัยฯ ขอขอบพระคุณในความอนุเคราะห์ของท่านเป็นอย่างยิ่ง และหวังเป็นอย่างยิ่งว่านักศึกษาจะได้รับความรู้และประสบการณ์อันเป็นประโยชน์สูงสุด
        </p>
        <div style="text-align: right; margin-top: 40px; margin-right: 40px;">
          <p>ขอแสดงความนับถืออย่างยิ่ง</p>
          <br/><br/>
          <p>(ผู้ดูแลระบบ / หัวหน้าฝ่ายสหกิจศึกษาและฝึกงาน)</p>
          <p>มหาวิทยาลัยแม่ฟ้าหลวง</p>
        </div>
        <div style="margin-top: 40px; border-top: 1px solid #cbd5e1; padding-top: 10px; font-size: 10pt; color: #64748b;">
          <p>ฝ่ายส่งเสริมและพัฒนาการฝึกงานวิชาชีพ มหาวิทยาลัยแม่ฟ้าหลวง โทรศัพท์ 0-5391-6000 | Reference: ${doc.referenceNumber}</p>
        </div>
      </div>
    `
  }

  const html = `
    <html xmlns:o='urn:schemas-microsoft-com:office:office' xmlns:w='urn:schemas-microsoft-com:office:word' xmlns='http://www.w3.org/TR/REC-html40'>
    <head>
      <meta charset='utf-8'>
      <title>${title}</title>
    </head>
    <body>
      ${docBody}
    </body>
    </html>
  `

  const blob = new Blob(['\ufeff', html], {
    type: 'application/msword;charset=utf-8'
  })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)

  toast.add({
    title: 'ดาวน์โหลดไฟล์เอกสารสำเร็จ',
    description: `ดาวน์โหลด ${filename} เรียบร้อยแล้ว สามารถเปิดด้วย Microsoft Word ได้ทันที`,
    color: 'success',
    icon: 'i-lucide-file-down'
  })
}

function documentStatusIcon(status?: GeneratedDocumentStatus): string {
  return {
    queued: 'i-lucide-clock-3',
    processing: 'i-lucide-loader-circle',
    ready: 'i-lucide-circle-check',
    failed: 'i-lucide-circle-alert'
  }[status ?? 'queued']
}

function documentSourceRecord(
  type: StudentDocumentType
): GeneratedDocItem | null {
  return type === 'certificate'
    ? certificateSourceDocument.value
    : transcriptSourceDocument.value
}

function hasUnverifiableDocumentSource(type: StudentDocumentType): boolean {
  return studentDocs.value.some(
    (item) =>
      item.documentType === type &&
      (!item.evaluationIds || item.evaluationIds.length === 0)
  )
}

function canRequestDocument(type: StudentDocumentType): boolean {
  return Boolean(
    isStudent.value &&
    documentSource.value &&
    documentTemplateAvailability.value[type].status === 'available' &&
    !documentSourceRecord(type) &&
    !hasUnverifiableDocumentSource(type) &&
    !activeDocumentGeneration.value
  )
}

function documentRequestLabel(type: StudentDocumentType): string {
  if (activeDocumentGeneration.value === type) return 'กำลังส่งคำขอ'
  const existing = documentSourceRecord(type)
  if (existing) {
    return {
      queued: 'รอจัดทำ PDF',
      processing: 'กำลังจัดทำ PDF',
      ready: 'ออกเอกสารแล้ว',
      failed: 'รอตรวจสอบเอกสาร'
    }[existing.status]
  }
  if (hasUnverifiableDocumentSource(type)) return 'ตรวจสอบเอกสารเดิม'
  if (!documentSource.value) return 'ยังออกไม่ได้'
  const templateState = documentTemplateAvailability.value[type]
  if (templateState.status === 'loading' || templateState.status === 'idle') {
    return 'กำลังตรวจแม่แบบ'
  }
  if (templateState.status !== 'available') return 'แม่แบบยังไม่พร้อม'
  return documentSource.value ? 'ขอออก PDF' : 'ยังออกไม่ได้'
}

function templateAvailabilityFailure(
  error: unknown
): StudentDocumentTemplateAvailability {
  const failure = error as {
    readonly message?: string
    readonly status?: number
    readonly statusCode?: number
  }
  if (failure.message === 'DOCUMENT_TEMPLATE_UNAVAILABLE') {
    return {
      status: 'unavailable',
      message: 'ยังไม่มีแม่แบบที่เผยแพร่และพร้อมใช้งานสำหรับเอกสารชนิดนี้'
    }
  }
  if (failure.message === 'DOCUMENT_TEMPLATE_AMBIGUOUS') {
    return {
      status: 'ambiguous',
      message:
        'พบแม่แบบที่เผยแพร่หลายแบบ กรุณาติดต่อเจ้าหน้าที่ให้กำหนดแม่แบบหลัก'
    }
  }
  if (failure.status === 403 || failure.statusCode === 403) {
    return {
      status: 'error',
      message: 'บัญชีนี้ไม่มีสิทธิ์ตรวจสอบแม่แบบเอกสาร'
    }
  }
  return {
    status: 'error',
    message: 'ตรวจสอบแม่แบบเอกสารไม่สำเร็จ กรุณาลองใหม่หรือติดต่อเจ้าหน้าที่'
  }
}

function scheduleDocumentStatusRefresh(
  id: string,
  type: StudentDocumentType,
  evaluationIds: readonly string[],
  attempt = 0
): void {
  if (!import.meta.client || attempt >= 6) return
  window.setTimeout(() => {
    void (async () => {
      try {
        const result = await api<GeneratedDocItem>(
          `/generated-documents/${encodeURIComponent(id)}`
        )
        const refreshed: GeneratedDocItem = {
          ...result,
          documentType: type,
          evaluationIds: [...evaluationIds]
        }
        studentDocs.value = [
          refreshed,
          ...studentDocs.value.filter((item) => item.id !== refreshed.id)
        ]
        if (result.status === 'queued' || result.status === 'processing') {
          scheduleDocumentStatusRefresh(id, type, evaluationIds, attempt + 1)
        }
      } catch (err: unknown) {
        console.error('Failed to refresh generated-document status:', err)
        scheduleDocumentStatusRefresh(id, type, evaluationIds, attempt + 1)
      }
    })()
  }, 5_000)
}

async function getPublishedTemplateVersion(
  type: StudentDocumentType
): Promise<string> {
  const templates = await loadAllPages(
    (page, pageSize) =>
      api<PaginatedItems<StudentDocumentTemplateItem>>('/document-templates', {
        query: { status: 'active', documentType: type, page, pageSize }
      }),
    100
  )
  const candidates: StudentDocumentTemplateCandidate[] = await Promise.all(
    templates.items.map(async (template) => {
      const versions = await api<
        PaginatedItems<StudentDocumentTemplateVersionItem>
      >(`/document-templates/${encodeURIComponent(template.id)}/versions`, {
        query: { status: 'published', page: 1, pageSize: 1 }
      })
      const version = versions.items[0]
      return {
        templateId: template.id,
        documentType: template.documentType,
        templateStatus: template.status,
        publishedVersionId:
          version?.templateId === template.id && version.status === 'published'
            ? version.id
            : null
      }
    })
  )
  const resolution = resolvePublishedDocumentVersion(candidates, type)
  if (resolution.status !== 'available') {
    throw new Error(`DOCUMENT_TEMPLATE_${resolution.status.toUpperCase()}`)
  }
  return resolution.versionId
}

async function loadDocumentTemplateAvailability(): Promise<void> {
  if (!documentSource.value) return
  const states = Object.values(documentTemplateAvailability.value)
  if (states.some((state) => state.status === 'loading')) return
  if (
    states.every(
      (state) =>
        state.status !== 'idle' &&
        state.status !== 'error' &&
        state.status !== 'loading'
    )
  ) {
    return
  }

  const types: readonly StudentDocumentType[] = ['certificate', 'transcript']
  for (const type of types) {
    documentTemplateAvailability.value[type] = { status: 'loading' }
  }
  await Promise.all(
    types.map(async (type) => {
      try {
        const versionId = await getPublishedTemplateVersion(type)
        documentTemplateAvailability.value[type] = {
          status: 'available',
          versionId
        }
      } catch (error: unknown) {
        documentTemplateAvailability.value[type] =
          templateAvailabilityFailure(error)
      }
    })
  )
}

function openStudentDocumentModal(): void {
  downloadModalOpen.value = true
  void loadDocumentTemplateAvailability()
}

async function requestStudentDocument(
  type: StudentDocumentType
): Promise<void> {
  if (!import.meta.client || !canRequestDocument(type)) return
  const source = documentSource.value
  const student = studentProfile.value
  if (!source || !student) return

  activeDocumentGeneration.value = type
  let templateWasResolved = false
  try {
    const templateVersionId = await getPublishedTemplateVersion(type)
    templateWasResolved = true
    const idempotencyKey = await createStudentDocumentIdempotencyKey({
      studentId: student.id,
      documentType: type,
      templateVersionId,
      evaluationIds: source.evaluationIds
    })
    const document = await api<GeneratedDocItem>('/generated-documents', {
      method: 'POST',
      headers: { 'idempotency-key': idempotencyKey },
      body: {
        studentId: student.studentId,
        templateVersionId,
        evaluationIds: source.evaluationIds
      }
    })
    const acceptedDocument: GeneratedDocItem = {
      ...document,
      documentType: type,
      evaluationIds: [...source.evaluationIds]
    }
    studentDocs.value = [
      acceptedDocument,
      ...studentDocs.value.filter((item) => item.id !== document.id)
    ]
    toast.add({
      title: 'รับคำขอจัดทำเอกสารแล้ว',
      description: 'งานเข้าคิวแล้ว สถานะจะเปลี่ยนเมื่อ PDF จัดทำเสร็จ',
      color: 'success',
      icon: 'i-lucide-clock-3'
    })
    scheduleDocumentStatusRefresh(document.id, type, source.evaluationIds)
  } catch (err: unknown) {
    if (!templateWasResolved) {
      documentTemplateAvailability.value[type] =
        templateAvailabilityFailure(err)
    }
    const failure = err as {
      readonly status?: number
      readonly statusCode?: number
      readonly data?: { readonly code?: string }
    }
    const status = failure.statusCode ?? failure.status
    const code = failure.data?.code
    const description =
      code === 'DOCUMENT_TEMPLATE_UNAVAILABLE'
        ? 'ยังไม่มีแม่แบบที่เผยแพร่และพร้อมใช้งานสำหรับเอกสารชนิดนี้'
        : code === 'DOCUMENT_TEMPLATE_AMBIGUOUS'
          ? 'พบแม่แบบที่เผยแพร่หลายแบบ กรุณาติดต่อเจ้าหน้าที่ให้กำหนดแม่แบบหลัก'
          : code === 'DOCUMENT_COMPLETED_PLACEMENT_REQUIRED'
            ? 'สถานะรอบฝึกงานยังไม่สมบูรณ์ จึงยังออกเอกสารไม่ได้'
            : code === 'DOCUMENT_SOURCE_DATA_INCOMPLETE'
              ? 'ข้อมูลนักศึกษา หลักสูตร สถานประกอบการ หรือภาคเรียนยังไม่ครบ'
              : status === 429
                ? 'ส่งคำขอบ่อยเกินไป กรุณารอสักครู่แล้วลองใหม่'
                : 'ตรวจสอบเงื่อนไขการออกเอกสารไม่ผ่าน กรุณาโหลดข้อมูลใหม่หรือติดต่อเจ้าหน้าที่'
    toast.add({
      title: 'ขอออกเอกสารไม่สำเร็จ',
      description,
      color: 'error',
      icon: 'i-lucide-circle-alert'
    })
  } finally {
    activeDocumentGeneration.value = null
  }
}

async function downloadDocument(type: StudentDocumentType): Promise<void> {
  if (!import.meta.client) return
  const documentState =
    type === 'certificate'
      ? certificateDocumentState.value
      : transcriptDocumentState.value
  const issuedDocument = documentState.downloadable
  if (!issuedDocument) {
    toast.add({
      title: documentState.label,
      description: 'ระบบจะแสดงปุ่มดาวน์โหลดเมื่อมีไฟล์ PDF ที่ออกสำเร็จ',
      color: documentState.latest?.status === 'failed' ? 'error' : 'warning',
      icon:
        documentState.latest?.status === 'failed'
          ? 'i-lucide-circle-alert'
          : 'i-lucide-info'
    })
    return
  }

  activeDocumentDownload.value = type
  try {
    const response = await api<{ url: string; expiresIn: number }>(
      `/generated-documents/${encodeURIComponent(issuedDocument.id)}/download-url`
    )
    const signedUrl = new URL(response.url)
    const secureProtocol =
      signedUrl.protocol === 'https:' ||
      (!import.meta.env.PROD && signedUrl.protocol === 'http:')
    if (
      !secureProtocol ||
      signedUrl.username ||
      signedUrl.password ||
      !Number.isInteger(response.expiresIn) ||
      response.expiresIn < 1 ||
      response.expiresIn > 300
    ) {
      throw new Error('DOCUMENT_DOWNLOAD_URL_INVALID')
    }

    const link = document.createElement('a')
    link.href = signedUrl.href
    link.rel = 'noopener noreferrer'
    link.referrerPolicy = 'no-referrer'
    document.body.appendChild(link)
    link.click()
    link.remove()
    toast.add({
      title: 'เริ่มดาวน์โหลดเอกสาร',
      description: 'กำลังดาวน์โหลด PDF จากไฟล์ที่ระบบออกไว้',
      color: 'success',
      icon: 'i-lucide-file-down'
    })
  } catch {
    toast.add({
      title: 'ดาวน์โหลดเอกสารไม่สำเร็จ',
      description: 'กรุณารีเฟรชสถานะแล้วลองใหม่อีกครั้ง',
      color: 'error',
      icon: 'i-lucide-circle-alert'
    })
  } finally {
    activeDocumentDownload.value = null
  }
}

// Admin Overview Cards
const _adminCards = computed(() => [
  {
    label: 'นักศึกษาทั้งหมด',
    value: overviewData.value?.students ?? 0,
    icon: 'i-lucide-graduation-cap',
    color: 'primary' as const
  },
  {
    label: 'รอประเมิน',
    value: overviewData.value?.assignments.pending ?? 0,
    icon: 'i-lucide-clock-3',
    color: 'warning' as const
  },
  {
    label: 'ส่งแล้ว',
    value: overviewData.value?.assignments.submitted ?? 0,
    icon: 'i-lucide-circle-check',
    color: 'success' as const
  },
  {
    label: 'อีเมลผิดพลาด',
    value: overviewData.value?.failedDeliveries ?? 0,
    icon: 'i-lucide-mail-warning',
    color: 'error' as const
  }
])
</script>

<template>
  <div>
    <!-- ========================================================================= -->
    <!-- A. โหมดนักศึกษา: STUDENT DASHBOARD & DOCUMENT DOWNLOADS                   -->
    <!-- ========================================================================= -->
    <div v-if="isStudent" class="space-y-8">
      <UAlert
        v-if="studentDataError"
        color="error"
        icon="i-lucide-circle-alert"
        :title="studentDataError"
        variant="soft"
      />
      <!-- 1. ส่วนหัวทักทายและข้อมูลนักศึกษา (Student Profile Header) -->
      <header
        class="rounded-2xl border border-default bg-default p-6 sm:p-8 shadow-sm"
      >
        <div
          class="flex flex-col md:flex-row md:items-center justify-between gap-6"
        >
          <div class="flex items-start gap-4">
            <span
              class="grid size-14 sm:size-16 shrink-0 place-items-center rounded-2xl bg-primary/10 text-primary ring-1 ring-primary/20"
            >
              <UIcon class="size-8 sm:size-9" name="i-lucide-graduation-cap" />
            </span>
            <div class="space-y-1">
              <div class="flex flex-wrap items-center gap-2">
                <UBadge
                  color="success"
                  label="กำลังศึกษา / ฝึกงานวิชาชีพ"
                  variant="soft"
                />
                <span class="font-mono text-xs text-muted">
                  รหัสนักศึกษา: {{ studentProfile?.studentId ?? '-' }}
                </span>
              </div>
              <h1 class="text-2xl sm:text-3xl font-bold text-highlighted">
                {{
                  typeof studentProfile?.name === 'string'
                    ? studentProfile?.name
                    : studentProfile?.name?.th ??
                      studentProfile?.name?.en ??
                      '-'
                }}
              </h1>
              <p class="text-sm text-muted">
                {{ studentProfile?.email ?? '-' }}
              </p>
            </div>
          </div>

          <div
            class="flex flex-wrap items-center gap-3 border-t border-default/70 pt-4 md:border-t-0 md:pt-0"
          >
            <UButton
              color="secondary"
              icon="i-lucide-sparkles"
              label="คู่มือแนะนำ (Guide)"
              size="sm"
              variant="subtle"
              @click="studentWizardOpen = true"
            />
            <UButton
              color="neutral"
              icon="i-lucide-refresh-cw"
              label="รีเฟรชข้อมูล"
              :loading="studentDataLoading"
              size="sm"
              variant="outline"
              @click="loadStudentData"
            />
            <UButton
              color="primary"
              icon="i-lucide-download"
              label="สถานะเอกสาร"
              size="sm"
              @click="openStudentDocumentModal"
            />
          </div>
        </div>

        <!-- กริดรายละเอียดข้อมูลหลักสูตรและสถานประกอบการ -->
        <div
          class="mt-6 grid gap-4 border-t border-default/80 pt-6 sm:grid-cols-2 lg:grid-cols-3"
        >
          <div class="space-y-1">
            <p class="text-xs text-muted font-medium">สำนักวิชา (School)</p>
            <p class="text-sm font-semibold text-highlighted">
              {{ studentSchool?.name.th ?? '-' }}
            </p>
            <p class="text-[11px] text-muted truncate">
              {{ studentSchool?.name.en ?? '-' }}
            </p>
          </div>

          <div class="space-y-1">
            <p class="text-xs text-muted font-medium">
              สาขาวิชา / หลักสูตร (Program)
            </p>
            <p class="text-sm font-semibold text-highlighted">
              {{ studentProgram?.name.th ?? '-' }}
            </p>
            <p class="text-[11px] text-muted truncate">
              {{ studentProgram?.name.en ?? '-' }}
            </p>
          </div>

          <div class="space-y-1">
            <p class="text-xs text-muted font-medium">
              สถานประกอบการ (Company)
            </p>
            <p class="text-sm font-semibold text-highlighted truncate">
              {{
                studentPlacement?.positionTitle?.th ??
                studentProfile?.company ??
                '-'
              }}
            </p>
            <p class="text-[11px] text-muted truncate">
              {{ studentOrg?.name.th ?? '-' }}
            </p>
          </div>
        </div>
      </header>

      <!-- 2. Dashboard แสดงสถานะ ซึ่งได้มาจากตัวของผู้ทำฟอร์มคนทำฟอร์ม (Form Respondent Status) -->
      <section class="space-y-4" aria-label="สถานะการประเมินจากผู้ทำฟอร์ม">
        <div class="flex items-center justify-between">
          <div>
            <h2
              class="text-xl font-bold text-highlighted flex items-center gap-2"
            >
              <UIcon name="i-lucide-activity" class="size-5 text-primary" />
              สถานะการฝึกงานและผลจากผู้ทำแบบฟอร์ม
            </h2>
            <p class="text-xs text-muted">
              สถานะความก้าวหน้าและการประเมินสมรรถนะ ซึ่งบันทึกโดยผู้ทำฟอร์ม
              (ผู้ประเมินสถานประกอบการ)
            </p>
          </div>

          <UBadge
            :color="
              studentAssignment?.status === 'submitted'
                ? 'success'
                : studentAssignment?.status === 'inProgress'
                  ? 'info'
                  : 'warning'
            "
            size="md"
            variant="solid"
          >
            <UIcon
              :name="
                studentAssignment?.status === 'submitted'
                  ? 'i-lucide-check-circle-2'
                  : studentAssignment?.status === 'inProgress'
                    ? 'i-lucide-loader-2'
                    : 'i-lucide-clock'
              "
              :class="[
                'size-4 mr-1',
                studentAssignment?.status === 'inProgress' ? 'animate-spin' : ''
              ]"
            />
            {{
              studentAssignment?.status === 'submitted'
                ? 'ผู้ทำฟอร์มประเมินผลเรียบร้อยแล้ว'
                : studentAssignment?.status === 'inProgress'
                  ? 'ผู้ทำฟอร์มกำลังประเมิน'
                  : 'รอผู้ทำฟอร์มประเมิน'
            }}
          </UBadge>
        </div>

        <!-- แสดงผลจาก final evaluation และ snapshot จริงเท่านั้น -->
        <div
          v-if="studentAssignment?.status === 'submitted'"
          class="rounded-xl border border-default bg-default p-5 shadow-sm space-y-6"
        >
          <div
            class="flex flex-wrap items-center gap-2 pb-3 border-b border-default/60"
          >
            <UIcon
              name="i-lucide-check-check"
              class="size-5 text-emerald-600"
            />
            <h3 class="text-base font-bold text-highlighted">
              ผลประเมินที่ส่งแล้ว
            </h3>
          </div>

          <UAlert
            v-if="!studentEvaluationView.hasQuestionSnapshot"
            color="warning"
            icon="i-lucide-circle-alert"
            title="ไม่พบ snapshot ของแบบประเมินสำหรับแสดงรายละเอียด"
            description="ระบบจะแสดงเฉพาะคะแนนหมวดที่บันทึกไว้จากผลประเมิน ไม่สร้างคำถามหรือคะแนนทดแทน"
            variant="soft"
          />

          <section class="space-y-3">
            <div class="flex flex-wrap items-center justify-between gap-2">
              <div class="flex items-center gap-2">
                <UIcon name="i-lucide-smile" class="size-4 text-emerald-600" />
                <h4 class="text-xs font-bold text-highlighted">
                  ทักษะทั่วไปและความประพฤติ (Soft Skills)
                </h4>
              </div>
              <span class="text-[11px] text-muted">
                เฉลี่ย {{ softSkillsAverage
                }}<template
                  v-if="
                    studentEvaluationView.softSkillScore?.scaleMax !== null &&
                    studentEvaluationView.softSkillScore?.scaleMax !== undefined
                  "
                >
                  /
                  {{
                    studentEvaluationView.softSkillScore.scaleMax.toFixed(1)
                  }}</template
                >
                · ตอบ
                {{ studentEvaluationView.softSkillScore?.answeredCount ?? 0 }}
                ข้อ
              </span>
            </div>
            <div
              v-if="softSkillSubSections.length"
              class="grid gap-3.5 sm:grid-cols-2"
            >
              <div
                v-for="question in softSkillSubSections"
                :key="question.id"
                class="rounded-lg border border-default/70 bg-default/60 p-3.5 flex items-start justify-between gap-3"
              >
                <div class="flex items-start gap-2 min-w-0">
                  <UIcon
                    :name="question.icon"
                    class="size-4 text-emerald-600 shrink-0 mt-0.5"
                  />
                  <div class="min-w-0">
                    <p class="text-xs font-semibold text-highlighted">
                      {{ question.title }}
                    </p>
                    <p class="text-[10px] text-muted">{{ question.titleEn }}</p>
                  </div>
                </div>
                <span
                  v-if="question.score !== null"
                  class="text-xs font-bold text-emerald-600 shrink-0"
                >
                  {{ question.score.toFixed(1)
                  }}<template v-if="question.maxScore !== null">
                    / {{ question.maxScore.toFixed(1) }}</template
                  >
                </span>
                <span v-else class="text-[11px] text-muted shrink-0"
                  >ไม่มีคะแนน</span
                >
              </div>
            </div>
            <p v-else class="text-xs text-muted">
              ไม่มีรายการ Soft Skill ใน snapshot แบบประเมิน
            </p>
          </section>

          <section class="space-y-3 border-t border-default/60 pt-4">
            <div class="flex flex-wrap items-center justify-between gap-2">
              <div class="flex items-center gap-2">
                <UIcon name="i-lucide-layers" class="size-4 text-primary" />
                <h4 class="text-xs font-bold text-highlighted">
                  ทักษะวิชาชีพเฉพาะด้าน (Hard Skills)
                </h4>
              </div>
              <span class="text-[11px] text-muted">
                เฉลี่ย {{ hardSkillsAverage
                }}<template
                  v-if="
                    studentEvaluationView.hardSkillScore?.scaleMax !== null &&
                    studentEvaluationView.hardSkillScore?.scaleMax !== undefined
                  "
                >
                  /
                  {{
                    studentEvaluationView.hardSkillScore.scaleMax.toFixed(1)
                  }}</template
                >
                · ตอบ
                {{ studentEvaluationView.hardSkillScore?.answeredCount ?? 0 }}
                ข้อ
              </span>
            </div>
            <div
              v-if="hardSkillSubSections.length"
              class="grid gap-3.5 sm:grid-cols-2"
            >
              <div
                v-for="question in hardSkillSubSections"
                :key="question.id"
                class="rounded-lg border border-default/70 bg-default/60 p-3.5 flex items-start justify-between gap-3"
              >
                <div class="flex items-start gap-2 min-w-0">
                  <UIcon
                    :name="question.icon"
                    class="size-4 text-primary shrink-0 mt-0.5"
                  />
                  <div class="min-w-0">
                    <p class="text-xs font-semibold text-highlighted">
                      {{ question.title }}
                    </p>
                    <p class="text-[10px] text-muted">{{ question.titleEn }}</p>
                  </div>
                </div>
                <span
                  v-if="question.score !== null"
                  class="text-xs font-bold text-primary shrink-0"
                >
                  {{ question.score.toFixed(1)
                  }}<template v-if="question.maxScore !== null">
                    / {{ question.maxScore.toFixed(1) }}</template
                  >
                </span>
                <span v-else class="text-[11px] text-muted shrink-0"
                  >ไม่มีคะแนน</span
                >
              </div>
            </div>
            <p v-else class="text-xs text-muted">
              ไม่มีรายการ Hard Skill ใน snapshot แบบประเมิน
            </p>
          </section>

          <section class="space-y-3 border-t border-default/60 pt-4">
            <div class="flex items-center gap-2">
              <UIcon
                name="i-lucide-message-square-quote"
                class="size-4 text-amber-500"
              />
              <h4 class="text-xs font-bold text-highlighted">
                ข้อเสนอแนะจากสถานประกอบการ
              </h4>
            </div>
            <div
              v-if="dynamicSuggestions.length"
              class="grid gap-3.5 sm:grid-cols-2"
            >
              <div
                v-for="suggestion in dynamicSuggestions"
                :key="suggestion.id"
                class="rounded-lg border border-default/70 bg-default/60 p-4 space-y-2"
              >
                <div class="flex items-start gap-2">
                  <UIcon
                    :name="suggestion.icon"
                    class="size-4 text-amber-600 shrink-0 mt-0.5"
                  />
                  <div>
                    <p class="text-xs font-semibold text-highlighted">
                      {{ suggestion.title }}
                    </p>
                    <p class="text-[10px] text-muted">
                      {{ suggestion.titleEn }}
                    </p>
                  </div>
                </div>
                <p
                  class="rounded-lg bg-muted/20 p-3 text-xs leading-relaxed text-highlighted whitespace-pre-wrap"
                >
                  {{ suggestion.value }}
                </p>
              </div>
            </div>
            <p v-else class="text-xs text-muted">
              ไม่มีข้อความข้อเสนอแนะใน snapshot แบบประเมิน
            </p>
          </section>

          <UAlert
            color="neutral"
            icon="i-lucide-info"
            title="ยังไม่มีข้อมูลเปรียบเทียบค่าเฉลี่ยรุ่นที่ตรวจสอบได้"
            description="ผลนี้แสดงคะแนนรายหมวดจากแบบประเมินเท่านั้น ไม่มีคะแนนรวมข้ามหมวดหรือค่าเฉลี่ยตัวอย่าง"
            variant="soft"
          />
        </div>
      </section>
    </div>

    <!-- ========================================================================= -->
    <!-- B. โหมดผู้ดูแลระบบ/เจ้าหน้าที่: ADMIN OVERVIEW DASHBOARD                  -->
    <!-- ========================================================================= -->
    <div v-else class="space-y-6">
      <UAlert
        v-if="overviewError"
        color="error"
        icon="i-lucide-circle-alert"
        title="ไม่สามารถโหลดข้อมูลภาพรวมได้"
        variant="soft"
      />
      <header class="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p class="mfu-eyebrow">ยินดีต้อนรับ {{ auth.actor?.displayName }}</p>
          <h1 class="mt-2 text-3xl font-bold text-highlighted">ภาพรวมระบบ</h1>
        </div>
        <div class="flex items-center gap-2">
          <UButton
            color="neutral"
            icon="i-lucide-refresh-cw"
            label="รีเฟรช"
            :loading="overviewPending"
            variant="outline"
            @click="refreshAllAdmin"
          />
        </div>
      </header>

      <!-- ทะเบียนนักศึกษาฝึกงานและสถานะการประเมิน พร้อมตัวกรองปี/ภาคเรียน และส่งออก Excel 2 ภาษา -->
      <section aria-label="ทะเบียนนักศึกษาและผลประเมิน">
        <AdminStudentDirectory
          :refresh-version="adminDirectoryRefreshVersion"
          @refresh="loadAdminDirectoryData"
          @open-document="handleAdminOpenDocument"
        />
      </section>
    </div>

    <!-- ========================================================================= -->
    <!-- C. MODAL ดาวน์โหลดแบบฟอร์มและเอกสารรับรอง 2 ฉบับ                           -->
    <!-- ========================================================================= -->
    <UModal
      v-model:open="downloadModalOpen"
      :ui="{ content: 'max-w-3xl p-0 overflow-hidden' }"
    >
      <template #content>
        <!-- Modal Header -->
        <div
          class="flex items-center justify-between border-b border-default bg-muted/30 px-6 py-4"
        >
          <div class="flex items-center gap-3">
            <span
              class="grid size-10 place-items-center rounded-xl bg-primary/10 text-primary"
            >
              <UIcon name="i-lucide-download" class="size-5" />
            </span>
            <div>
              <h2 class="text-base sm:text-lg font-bold text-highlighted">
                เอกสารสำหรับนักศึกษา
              </h2>
              <p class="text-xs text-muted">
                เอกสารจะพร้อมดาวน์โหลดเมื่อมีแม่แบบที่อนุมัติและระบบออก PDF
                บันทึกไฟล์จริงแล้ว
              </p>
            </div>
          </div>
          <UButton
            color="neutral"
            icon="i-lucide-x"
            size="sm"
            variant="ghost"
            @click="downloadModalOpen = false"
          />
        </div>

        <!-- Modal Body: 2 Documents -->
        <div class="p-6 max-h-[75vh] overflow-y-auto">
          <p
            v-if="documentSourceUnavailableReason"
            class="mb-4 rounded-lg border border-warning-500/30 bg-warning-500/5 px-3 py-2 text-xs text-warning-700 dark:text-warning-300"
            role="status"
          >
            {{ documentSourceUnavailableReason }}
          </p>
          <div class="grid gap-5 md:grid-cols-2">
            <!-- ฉบับที่ 1: Certification (ใบประกาศนียบัตรรับรองการฝึกงาน) -->
            <UCard
              class="group relative border-2 border-amber-500/30 hover:border-amber-500/60 bg-gradient-to-br from-default to-amber-500/5 transition-all duration-300 shadow-sm hover:shadow-md"
            >
              <div class="space-y-4">
                <div class="flex items-start justify-between gap-3">
                  <span
                    class="grid size-11 place-items-center rounded-xl bg-amber-500/10 text-amber-600 ring-1 ring-amber-500/20 group-hover:scale-105 transition-transform"
                  >
                    <UIcon name="i-lucide-award" class="size-6" />
                  </span>
                  <UBadge
                    color="warning"
                    label="Certification"
                    size="xs"
                    variant="subtle"
                  />
                </div>

                <div>
                  <div
                    class="flex items-center gap-1.5 text-xs text-amber-700 dark:text-amber-400 font-semibold"
                  >
                    <UIcon name="i-lucide-sparkles" class="size-3.5" />
                    เอกสารฉบับที่ 1: เกียรติบัตรรับรอง
                  </div>
                  <h3
                    class="text-base font-bold text-highlighted mt-1 group-hover:text-primary transition-colors"
                  >
                    ใบประกาศนียบัตรรับรองการฝึกงาน
                  </h3>
                  <p class="text-[11px] text-muted font-mono">
                    Certificate of Internship Completion
                  </p>
                  <p class="text-xs text-muted mt-2 leading-relaxed">
                    ใบรับรองจะยังไม่ถือเป็นเอกสารทางการจนกว่าจะออกจากระบบด้วยแม่แบบและผู้ลงนามที่ได้รับอนุมัติ
                  </p>
                </div>

                <div class="border-t border-default/70 pt-3 space-y-1 text-xs">
                  <div class="flex justify-between text-muted">
                    <span>เลขที่เอกสาร:</span>
                    <span class="font-mono font-semibold text-muted">{{
                      certificateDocumentState.downloadable?.documentNumber ??
                      'ยังไม่มี'
                    }}</span>
                  </div>
                  <div class="flex justify-between text-muted">
                    <span>สถานะเอกสาร:</span>
                    <span
                      class="font-semibold text-warning-600 flex items-center gap-1"
                      role="status"
                    >
                      <UIcon
                        :name="
                          documentStatusIcon(
                            certificateDocumentState.latest?.status
                          )
                        "
                        class="size-3.5"
                      />
                      {{ certificateDocumentState.label }}
                    </span>
                  </div>
                </div>

                <div class="pt-2 flex flex-wrap items-center gap-2">
                  <UButton
                    color="primary"
                    icon="i-lucide-file-plus-2"
                    :label="documentRequestLabel('certificate')"
                    :loading="activeDocumentGeneration === 'certificate'"
                    :disabled="!canRequestDocument('certificate')"
                    size="xs"
                    variant="outline"
                    class="flex-1 justify-center min-w-[80px]"
                    @click="requestStudentDocument('certificate')"
                  />
                  <UButton
                    color="primary"
                    icon="i-lucide-printer"
                    :label="
                      activeDocumentDownload === 'certificate'
                        ? 'กำลังเตรียมไฟล์'
                        : certificateDocumentState.downloadable
                          ? 'ดาวน์โหลด PDF'
                          : 'ไฟล์ยังไม่พร้อม'
                    "
                    :loading="activeDocumentDownload === 'certificate'"
                    :disabled="!certificateDocumentState.downloadable"
                    size="xs"
                    variant="solid"
                    class="flex-1 justify-center min-w-[90px]"
                    @click="downloadDocument('certificate')"
                  />
                </div>
                <p
                  v-if="
                    documentSource &&
                    !certificateSourceDocument &&
                    !hasUnverifiableDocumentSource('certificate') &&
                    documentTemplateAvailability.certificate.status !==
                      'available'
                  "
                  class="text-[11px] text-muted"
                  role="status"
                >
                  {{
                    documentTemplateAvailability.certificate.message ??
                    'กำลังตรวจสอบแม่แบบที่เผยแพร่'
                  }}
                </p>
              </div>
            </UCard>

            <!-- ฉบับที่ 2: Transcript -->
            <UCard
              class="group relative border-2 border-sky-500/30 hover:border-sky-500/60 bg-gradient-to-br from-default to-sky-500/5 transition-all duration-300 shadow-sm hover:shadow-md"
            >
              <div class="space-y-4">
                <div class="flex items-start justify-between gap-3">
                  <span
                    class="grid size-11 place-items-center rounded-xl bg-sky-500/10 text-sky-600 ring-1 ring-sky-500/20 group-hover:scale-105 transition-transform"
                  >
                    <UIcon name="i-lucide-file-text" class="size-6" />
                  </span>
                  <UBadge
                    color="info"
                    label="Transcript"
                    size="xs"
                    variant="subtle"
                  />
                </div>

                <div>
                  <div
                    class="flex items-center gap-1.5 text-xs text-sky-700 dark:text-sky-400 font-semibold"
                  >
                    <UIcon name="i-lucide-shield-check" class="size-3.5" />
                    เอกสารฉบับที่ 2: Transcript
                  </div>
                  <h3
                    class="text-base font-bold text-highlighted mt-1 group-hover:text-primary transition-colors"
                  >
                    ใบบันทึกผลการฝึกงาน
                  </h3>
                  <p class="text-[11px] text-muted font-mono">
                    Internship Transcript
                  </p>
                  <p class="text-xs text-muted mt-2 leading-relaxed">
                    Transcript จะแสดงผลประเมินจากข้อมูลจริงหลังแม่แบบและ PDF
                    renderer ผ่านการอนุมัติ
                  </p>
                </div>

                <div class="border-t border-default/70 pt-3 space-y-1 text-xs">
                  <div class="flex justify-between text-muted">
                    <span>เลขที่เอกสาร:</span>
                    <span class="font-mono font-semibold text-muted">{{
                      transcriptDocumentState.downloadable?.documentNumber ??
                      'ยังไม่มี'
                    }}</span>
                  </div>
                  <div class="flex justify-between text-muted">
                    <span>สถานะเอกสาร:</span>
                    <span
                      class="font-semibold text-warning-600 flex items-center gap-1"
                      role="status"
                    >
                      <UIcon
                        :name="
                          documentStatusIcon(
                            transcriptDocumentState.latest?.status
                          )
                        "
                        class="size-3.5"
                      />
                      {{ transcriptDocumentState.label }}
                    </span>
                  </div>
                </div>

                <div class="pt-2 flex flex-wrap items-center gap-2">
                  <UButton
                    color="primary"
                    icon="i-lucide-file-plus-2"
                    :label="documentRequestLabel('transcript')"
                    :loading="activeDocumentGeneration === 'transcript'"
                    :disabled="!canRequestDocument('transcript')"
                    size="xs"
                    variant="outline"
                    class="flex-1 justify-center min-w-[80px]"
                    @click="requestStudentDocument('transcript')"
                  />
                  <UButton
                    color="primary"
                    icon="i-lucide-printer"
                    :label="
                      activeDocumentDownload === 'transcript'
                        ? 'กำลังเตรียมไฟล์'
                        : transcriptDocumentState.downloadable
                          ? 'ดาวน์โหลด PDF'
                          : 'ไฟล์ยังไม่พร้อม'
                    "
                    :loading="activeDocumentDownload === 'transcript'"
                    :disabled="!transcriptDocumentState.downloadable"
                    size="xs"
                    variant="solid"
                    class="flex-1 justify-center min-w-[90px]"
                    @click="downloadDocument('transcript')"
                  />
                </div>
                <p
                  v-if="
                    documentSource &&
                    !transcriptSourceDocument &&
                    !hasUnverifiableDocumentSource('transcript') &&
                    documentTemplateAvailability.transcript.status !==
                      'available'
                  "
                  class="text-[11px] text-muted"
                  role="status"
                >
                  {{
                    documentTemplateAvailability.transcript.message ??
                    'กำลังตรวจสอบแม่แบบที่เผยแพร่'
                  }}
                </p>
              </div>
            </UCard>
          </div>
        </div>

        <!-- Modal Footer -->
        <div
          class="flex items-center justify-end border-t border-default bg-muted/20 px-6 py-3"
        >
          <UButton
            color="neutral"
            label="ปิดหน้าต่าง"
            size="sm"
            variant="outline"
            @click="downloadModalOpen = false"
          />
        </div>
      </template>
    </UModal>

    <!-- ========================================================================= -->
    <!-- D. MODAL ดูตัวอย่างเอกสารความละเอียดสูง (Document Preview Modal)           -->
    <!-- ========================================================================= -->
    <UModal
      v-model:open="previewModalOpen"
      :ui="{ content: 'max-w-4xl p-0 overflow-hidden' }"
    >
      <template #content>
        <!-- แถบเครื่องมือ Modal -->
        <div
          class="flex flex-wrap items-center justify-between gap-3 border-b border-default bg-muted/40 px-5 py-3"
        >
          <div class="flex items-center gap-2">
            <UIcon
              :name="
                previewDocType === 'certification'
                  ? 'i-lucide-award'
                  : 'i-lucide-file-text'
              "
              class="size-5 text-primary"
            />
            <div>
              <span class="text-sm font-bold text-highlighted block">
                {{
                  previewDocType === 'certification'
                    ? 'ใบประกาศนียบัตรรับรองการฝึกงาน (Certification)'
                    : 'หนังสือส่งตัวนักศึกษาฝึกงาน (Official Referral Letter)'
                }}
              </span>
              <span class="text-[11px] text-muted">
                {{ activeDocContext.nameTh }} ({{ activeDocContext.studentId }})
                · {{ activeDocContext.company }}
              </span>
            </div>
          </div>

          <div class="flex items-center gap-2">
            <UButton
              color="primary"
              icon="i-lucide-printer"
              label="พิมพ์ / บันทึก PDF"
              size="xs"
              @click="triggerPrint"
            />
            <UButton
              color="neutral"
              icon="i-lucide-x"
              size="xs"
              variant="ghost"
              @click="previewModalOpen = false"
            />
          </div>
        </div>

        <!-- ตัวเอกสารจำลอง A4 สำหรับดูตัวอย่างและสั่งพิมพ์ -->
        <div
          class="p-6 sm:p-8 bg-neutral-100 dark:bg-neutral-900 overflow-y-auto max-h-[80vh]"
        >
          <!-- 1. ใบประกาศนียบัตร (Certification Landscape/Portrait A4 Preview) -->
          <div
            v-if="previewDocType === 'certification'"
            id="printable-student-cert"
            class="printable-a4-doc mx-auto max-w-[720px] bg-white text-slate-900 p-8 sm:p-12 shadow-2xl rounded-sm border-8 border-double border-amber-600/60 relative text-center space-y-5"
          >
            <div
              class="absolute inset-2 border border-amber-500/30 pointer-events-none"
            />

            <!-- ตราสัญลักษณ์ -->
            <div class="flex justify-center">
              <span
                class="grid size-16 place-items-center rounded-full bg-amber-500/10 text-amber-700 ring-2 ring-amber-600/30"
              >
                <UIcon name="i-lucide-award" class="size-9" />
              </span>
            </div>

            <div>
              <p
                class="font-serif text-sm font-semibold tracking-widest text-amber-800 uppercase"
              >
                มหาวิทยาลัยแม่ฟ้าหลวง · MAE FAH LUANG UNIVERSITY
              </p>
              <h2
                class="font-heading text-2xl sm:text-3xl font-black text-slate-900 mt-2"
              >
                ใบประกาศนียบัตรรับรองการฝึกงาน
              </h2>
              <p
                class="text-xs font-semibold tracking-widest text-slate-500 mt-0.5"
              >
                CERTIFICATE OF INTERNSHIP COMPLETION
              </p>
            </div>

            <p class="text-xs text-slate-600 italic">
              ใบประกาศนียบัตรนี้ออกให้เพื่อแสดงว่า / This is to certify that
            </p>

            <div class="py-1">
              <p class="text-2xl sm:text-3xl font-bold text-amber-900">
                {{ activeDocContext.nameTh }}
              </p>
              <p class="text-sm font-medium text-slate-600 mt-0.5">
                ({{ activeDocContext.nameEn }})
              </p>
              <p class="text-xs text-slate-500 font-mono mt-1">
                รหัสนักศึกษา (Student ID): {{ activeDocContext.studentId }}
              </p>
            </div>

            <div
              class="text-xs text-slate-700 leading-relaxed max-w-lg mx-auto space-y-1"
            >
              <p>
                ได้ผ่านการฝึกปฏิบัติงานวิชาชีพตามเกณฑ์มาตรฐานการศึกษา
                ระดับปริญญาตรี
              </p>
              <p class="font-semibold text-slate-900">
                {{ activeDocContext.schoolTh }} ·
                {{ activeDocContext.programTh }}
              </p>
              <p>
                ณ สถานประกอบการ:
                <strong class="text-slate-900">{{
                  activeDocContext.company
                }}</strong>
                (จังหวัด {{ activeDocContext.province }})
              </p>
              <p class="text-slate-600">
                ระยะเวลา: {{ activeDocContext.startsAtText }} ถึง
                {{ activeDocContext.endsAtText }} (รวมทั้งสิ้น
                {{ activeDocContext.totalHours }} ชั่วโมง)
              </p>
              <p class="text-sm font-bold text-emerald-700 pt-1">
                ด้วยผลการประเมิน:
                {{ activeDocContext.gradeDisplay }} (คะแนนเฉลี่ย
                {{ activeDocContext.scoreDisplay }})
              </p>
            </div>

            <!-- ส่วนลายมือชื่อ 2 ฝ่าย -->
            <div
              class="pt-8 grid grid-cols-2 gap-6 text-xs border-t border-amber-900/20 max-w-lg mx-auto"
            >
              <div class="space-y-1">
                <div
                  class="h-10 flex items-end justify-center font-serif text-amber-900 italic font-bold text-sm"
                >
                  ({{ activeDocContext.deanTh }})
                </div>
                <div class="border-b border-slate-400 w-36 mx-auto" />
                <p class="font-semibold text-slate-800">คณบดีสำนักวิชา</p>
                <p class="text-[10px] text-slate-500">มหาวิทยาลัยแม่ฟ้าหลวง</p>
              </div>

              <div class="space-y-1">
                <div
                  class="h-10 flex items-end justify-center font-serif text-amber-900 italic font-bold text-sm"
                >
                  ({{ activeDocContext.evaluatorTh }})
                </div>
                <div class="border-b border-slate-400 w-36 mx-auto" />
                <p class="font-semibold text-slate-800">
                  ผู้ประเมินสถานประกอบการ
                </p>
                <p class="text-[10px] text-slate-500">
                  {{ activeDocContext.company }}
                </p>
              </div>
            </div>

            <p class="text-[10px] text-slate-400 pt-3">
              เลขที่รับรอง: CERT-{{ activeDocContext.academicYear }}-{{
                activeDocContext.studentId
              }}
              | ออกให้ ณ วันที่: {{ new Date().toLocaleDateString('th-TH') }} |
              มหาวิทยาลัยแม่ฟ้าหลวง
            </p>
          </div>

          <!-- 2. หนังสือส่งตัวนักศึกษาฝึกงาน (Official Referral Letter A4 Preview) -->
          <div
            v-else
            id="printable-student-referral"
            class="printable-a4-doc mx-auto max-w-[720px] bg-white text-slate-900 p-8 sm:p-12 shadow-2xl rounded-sm border border-slate-300 relative text-left space-y-6 text-sm"
          >
            <!-- ตราครุฑ / ตรามหาวิทยาลัยแม่ฟ้าหลวง -->
            <div class="text-center pb-2">
              <span
                class="inline-grid size-14 place-items-center rounded-lg bg-slate-100 text-slate-800"
              >
                <UIcon name="i-lucide-building-2" class="size-8" />
              </span>
              <h3 class="font-bold text-base text-slate-900 mt-2">
                มหาวิทยาลัยแม่ฟ้าหลวง
              </h3>
              <p class="text-xs text-slate-600">
                333 หมู่ 1 ต.ท่าสุด อ.เมือง จ.เชียงราย 57100
              </p>
            </div>

            <div
              class="flex justify-between text-xs text-slate-600 border-b border-slate-200 pb-3"
            >
              <div>
                <p>ที่ อว 7300/{{ activeDocContext.studentId.slice(-4) }}</p>
                <p class="mt-1">
                  เรื่อง: ขอส่งตัวนักศึกษาเข้าฝึกปฏิบัติงานวิชาชีพ
                </p>
              </div>
              <div class="text-right">
                <p>ฝ่ายส่งเสริมและพัฒนาการฝึกงานวิชาชีพ</p>
                <p class="mt-1">
                  {{
                    new Date().toLocaleDateString('th-TH', {
                      year: 'numeric',
                      month: 'long',
                      day: 'numeric'
                    })
                  }}
                </p>
              </div>
            </div>

            <div>
              <p class="font-bold text-slate-900">
                เรียน ผู้จัดการฝ่ายทรัพยากรบุคคล / ผู้บริหารสถานประกอบการ
              </p>
              <p class="text-xs text-slate-700 mt-0.5">
                {{ activeDocContext.company }}
              </p>
            </div>

            <div
              class="text-xs text-slate-700 leading-relaxed space-y-3 indent-6"
            >
              <p>
                ตามที่สถานประกอบการของท่านได้ให้ความอนุเคราะห์ตอบรับนักศึกษาของมหาวิทยาลัยแม่ฟ้าหลวง
                เข้าฝึกปฏิบัติงานวิชาชีพ
                เพื่อให้นักศึกษาได้นำความรู้ภาคทฤษฎีไปประยุกต์ใช้ในการปฏิบัติงานจริง
                ตลอดจนเสริมสร้างประสบการณ์และทักษะวิชาชีพนั้น
              </p>
              <p>
                มหาวิทยาลัยแม่ฟ้าหลวง ใคร่ขอส่งตัวนักศึกษาต่อไปนี้
                เข้าฝึกปฏิบัติงานวิชาชีพ ณ สถานประกอบการของท่าน:
              </p>
            </div>

            <div
              class="p-4 rounded-lg bg-slate-50 border border-slate-200 text-xs space-y-1.5 ml-6"
            >
              <p>
                <strong>ชื่อ-สกุล:</strong> {{ activeDocContext.nameTh || activeDocContext.nameEn }}
              </p>
              <p>
                <strong>รหัสนักศึกษา:</strong> {{ activeDocContext.studentId }}
              </p>
              <p>
                <strong>สำนักวิชา / หลักสูตร:</strong>
                {{ activeDocContext.schoolTh }} ({{
                  activeDocContext.programTh
                }})
              </p>
              <p>
                <strong>ช่วงเวลาฝึกปฏิบัติงาน:</strong>
                {{ activeDocContext.startsAtText }} ถึง
                {{ activeDocContext.endsAtText }} (รวมทั้งสิ้น
                {{ activeDocContext.totalHours }} ชั่วโมง)
              </p>
            </div>

            <p class="text-xs text-slate-700 indent-6 leading-relaxed">
              มหาวิทยาลัยฯ ขอขอบพระคุณในความอนุเคราะห์ของท่านเป็นอย่างยิ่ง
              และหวังเป็นอย่างยิ่งว่านักศึกษาจะได้รับความรู้และประสบการณ์อันเป็นประโยชน์สูงสุด
            </p>

            <div class="pt-6 text-right text-xs space-y-1 pr-6">
              <p>ขอแสดงความนับถืออย่างยิ่ง</p>
              <div class="h-10" />
              <p class="font-bold">(ผู้ดูแลระบบ / หัวหน้าฝ่ายสหกิจศึกษา)</p>
              <p class="text-slate-500">มหาวิทยาลัยแม่ฟ้าหลวง</p>
            </div>

            <div
              class="pt-4 border-t border-slate-200 text-[11px] text-slate-500"
            >
              <p>
                ฝ่ายส่งเสริมและพัฒนาการฝึกงานวิชาชีพ มหาวิทยาลัยแม่ฟ้าหลวง
                โทรศัพท์ 0-5391-6000
              </p>
              <p class="font-mono text-[10px] text-slate-400 mt-0.5">
                Reference: {{ activeDocContext.referenceNumber }}
              </p>
            </div>
          </div>
        </div>
      </template>
    </UModal>

    <!-- สำหรับเจ้าหน้าที่ฝึกงาน: คอมโพเนนต์ Wizard สำหรับผู้เข้าใช้งานครั้งแรก -->
    <StaffOnboardingWizard
      v-if="isStaff"
      v-model="staffWizardOpen"
      @completed="onStaffWizardCompleted"
    />

    <!-- สำหรับนักศึกษา: คอมโพเนนต์ Wizard 3 ขั้นตอน สำหรับผู้เข้าใช้งานครั้งแรก -->
    <StudentOnboardingWizard v-if="isStudent" v-model="studentWizardOpen" />
  </div>
</template>

<style>
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
  [data-slot='navbar'],
  [data-slot='header'],
  button {
    display: none !important;
  }
  #printable-student-cert,
  #printable-student-referral {
    position: fixed !important;
    left: 0 !important;
    top: 0 !important;
    width: 100% !important;
    max-width: 100% !important;
    margin: 0 !important;
    padding: 15mm !important;
    border: none !important;
    box-shadow: none !important;
    background: white !important;
    transform: none !important;
    z-index: 9999999 !important;
    -webkit-print-color-adjust: exact !important;
    print-color-adjust: exact !important;
  }
  @page {
    size: A4 portrait;
    margin: 0;
  }
}
</style>
