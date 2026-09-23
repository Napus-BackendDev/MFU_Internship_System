<script setup lang="ts">
import type { EnrichedStudentRow } from '~/components/AdminStudentDirectory.vue'
import {
  buildStudentEvaluationResult,
  formatCategoryAverage,
  type EvaluationSectionSnapshot,
  type StudentEvaluationRecord
} from '~/utils/student-evaluation-result'

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
  readonly name: { readonly th: string; readonly en: string }
  readonly email: string
  readonly personalEmail?: string
  readonly schoolId: string
  readonly programId: string
  readonly company?: string
  readonly province?: string
  readonly semester?: string
  readonly admissionYear?: number
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

interface CourseItem {
  readonly id: string
  readonly courseCode?: string
  readonly programIds?: string[]
  readonly name: { readonly th: string; readonly en: string }
}

interface PlacementItem {
  readonly id: string
  readonly studentId: string
  readonly organizationId: string
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

interface GeneratedDocItem {
  readonly id: string
  readonly studentId: string
  readonly templateVersionId: string
  readonly status: string
  readonly objectKey?: string
  readonly createdAt: string
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

  try {
    const currentStudentId = auth.actor?.scope.studentId
    if (!currentStudentId) throw new Error('STUDENT_SCOPE_REQUIRED')

    const [
      studentsRes,
      schoolsRes,
      programsRes,
      placementsRes,
      orgsRes,
      evaluatorsRes,
      assignmentsRes,
      docsRes
    ] = await Promise.all([
      api<{ items: StudentItem[] }>('/students', {
        query: { studentId: currentStudentId, pageSize: 50 }
      }),
      api<{ items: SchoolItem[] }>('/academic/schools', {
        query: { pageSize: 100 }
      }),
      api<{ items: ProgramItem[] }>('/academic/programs', {
        query: { pageSize: 100 }
      }),
      api<{ items: PlacementItem[] }>('/placements', {
        query: { pageSize: 50 }
      }),
      api<{ items: OrganizationItem[] }>('/organizations', {
        query: { pageSize: 100 }
      }),
      api<{ items: EvaluatorItem[] }>('/evaluators', {
        query: { pageSize: 100 }
      }),
      api<{ items: EvaluationAssignmentItem[] }>('/evaluation-assignments', {
        query: { pageSize: 50 }
      }),
      api<{ items: GeneratedDocItem[] }>('/generated-documents', {
        query: { pageSize: 50 }
      })
    ])

    studentProfile.value =
      studentsRes.items.find((s) => s.studentId === currentStudentId) ?? null
    if (!studentProfile.value) throw new Error('STUDENT_NOT_FOUND')

    studentSchool.value =
      schoolsRes.items.find((s) => s.id === studentProfile.value?.schoolId) ??
      null

    studentProgram.value =
      programsRes.items.find((p) => p.id === studentProfile.value?.programId) ??
      null

    const matchingAssignments = assignmentsRes.items.filter(
      (assignment) =>
        assignment.studentId === studentProfile.value?.id ||
        assignment.studentId === studentProfile.value?.studentId
    )
    studentAssignment.value =
      matchingAssignments.find(
        (assignment) => assignment.status === 'submitted'
      ) ??
      matchingAssignments[0] ??
      null

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
const adminStudents = ref<StudentItem[]>([])
const adminSchools = ref<SchoolItem[]>([])
const adminPrograms = ref<ProgramItem[]>([])
const adminCourses = ref<CourseItem[]>([])
const adminOrganizations = ref<OrganizationItem[]>([])
const adminEvaluators = ref<EvaluatorItem[]>([])
const adminAssignments = ref<EvaluationAssignmentItem[]>([])
const adminPlacements = ref<PlacementItem[]>([])
const adminDataLoading = ref(false)

async function loadAdminDirectoryData(): Promise<void> {
  if (isStudent.value) return
  adminDataLoading.value = true
  try {
    const [
      studentsRes,
      schoolsRes,
      programsRes,
      coursesRes,
      orgsRes,
      placementsRes,
      evaluatorsRes,
      assignmentsRes
    ] = await Promise.all([
      api<{ items: StudentItem[] }>('/students', {
        query: { pageSize: 500 }
      }).catch(() => ({ items: [] })),
      api<{ items: SchoolItem[] }>('/academic/schools', {
        query: { pageSize: 500 }
      }).catch(() => ({ items: [] })),
      api<{ items: ProgramItem[] }>('/academic/programs', {
        query: { pageSize: 500 }
      }).catch(() => ({ items: [] })),
      api<{ items: CourseItem[] }>('/academic/courses', {
        query: { pageSize: 500 }
      }).catch(() => ({ items: [] })),
      api<{ items: OrganizationItem[] }>('/organizations', {
        query: { pageSize: 500 }
      }).catch(() => ({ items: [] })),
      api<{ items: PlacementItem[] }>('/placements', {
        query: { pageSize: 500 }
      }).catch(() => ({ items: [] })),
      api<{ items: EvaluatorItem[] }>('/evaluators', {
        query: { pageSize: 500 }
      }).catch(() => ({ items: [] })),
      api<{ items: EvaluationAssignmentItem[] }>('/evaluation-assignments', {
        query: { pageSize: 500 }
      }).catch(() => ({ items: [] }))
    ])

    adminStudents.value = studentsRes.items
    adminSchools.value = schoolsRes.items
    adminPrograms.value = programsRes.items
    adminCourses.value = coursesRes.items
    adminOrganizations.value = orgsRes.items
    adminPlacements.value = placementsRes.items
    adminEvaluators.value = evaluatorsRes.items
    adminAssignments.value = assignmentsRes.items
  } catch (err) {
    console.error('Failed to load admin directory data:', err)
  } finally {
    adminDataLoading.value = false
  }
}

function refreshAllAdmin(): void {
  refreshOverview()
  loadAdminDirectoryData()
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
    loadStudentData()
    checkStudentFirstTimeWizard()
  } else {
    loadAdminDirectoryData()
    if (isStaff.value) {
      checkStaffFirstTimeWizard()
    }
  }
})

watch(isStudent, (val) => {
  if (val) {
    loadStudentData()
    checkStudentFirstTimeWizard()
  } else {
    loadAdminDirectoryData()
  }
})

watch(isStaff, (val) => {
  if (val) checkStaffFirstTimeWizard()
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
  const yearTh = profile?.admissionYear ? profile.admissionYear + 4 : '-'
  const dean = getDeanForSchool(school?.schoolCode)
  const startsAt = formatThaiDate(placement?.startsAt, '-')
  const endsAt = formatThaiDate(placement?.endsAt, '-')
  return {
    studentId: sId || '-',
    nameTh: profile?.name?.th ?? '-',
    nameEn: profile?.name?.en ?? '-',
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

function openDocumentPreview(_type: 'certification' | 'referral'): void {
  notifyDocumentsUnavailable()
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
          <p style="margin: 4px 0;"><strong>ชื่อ-สกุล:</strong> ${doc.nameTh} (${doc.nameEn})</p>
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

function downloadDocument(_type: 'certification' | 'referral'): void {
  notifyDocumentsUnavailable()
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
                {{ studentProfile?.name.th ?? '-' }}
              </h1>
              <p class="text-sm text-muted">
                {{ studentProfile?.name.en ?? '-' }} ·
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
              @click="downloadModalOpen = true"
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
            :loading="overviewPending || adminDataLoading"
            variant="outline"
            @click="refreshAllAdmin"
          />
        </div>
      </header>

      <!-- ทะเบียนนักศึกษาฝึกงานและสถานะการประเมิน พร้อมตัวกรองปี/ภาคเรียน และส่งออก Excel 2 ภาษา -->
      <section aria-label="ทะเบียนนักศึกษาและผลประเมิน">
        <AdminStudentDirectory
          :students="adminStudents"
          :schools="adminSchools"
          :programs="adminPrograms"
          :courses="adminCourses"
          :organizations="adminOrganizations"
          :evaluators="adminEvaluators"
          :assignments="adminAssignments"
          :placements="adminPlacements"
          :loading="adminDataLoading"
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
        <div class="p-6 grid gap-5 md:grid-cols-2 max-h-[75vh] overflow-y-auto">
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
                  <span class="font-mono font-semibold text-muted"
                    >ยังไม่มี</span
                  >
                </div>
                <div class="flex justify-between text-muted">
                  <span>สถานะเอกสาร:</span>
                  <span
                    class="font-semibold text-warning-600 flex items-center gap-1"
                  >
                    <UIcon name="i-lucide-clock-3" class="size-3.5" />
                    ยังไม่ออกโดยระบบ
                  </span>
                </div>
              </div>

              <div class="pt-2 flex flex-wrap items-center gap-2">
                <UButton
                  color="neutral"
                  icon="i-lucide-eye"
                  label="ดูตัวอย่าง"
                  size="xs"
                  variant="outline"
                  class="flex-1 justify-center min-w-[80px]"
                  disabled
                  @click="openDocumentPreview('certification')"
                />
                <UButton
                  color="primary"
                  icon="i-lucide-printer"
                  label="พิมพ์ / PDF"
                  size="xs"
                  variant="solid"
                  class="flex-1 justify-center min-w-[90px]"
                  disabled
                  @click="downloadDocument('certification')"
                />
              </div>
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
                  <span class="font-mono font-semibold text-muted"
                    >ยังไม่มี</span
                  >
                </div>
                <div class="flex justify-between text-muted">
                  <span>สถานะเอกสาร:</span>
                  <span
                    class="font-semibold text-warning-600 flex items-center gap-1"
                  >
                    <UIcon name="i-lucide-clock-3" class="size-3.5" />
                    ยังไม่ออกโดยระบบ
                  </span>
                </div>
              </div>

              <div class="pt-2 flex flex-wrap items-center gap-2">
                <UButton
                  color="neutral"
                  icon="i-lucide-eye"
                  label="ดูตัวอย่าง"
                  size="xs"
                  variant="outline"
                  class="flex-1 justify-center min-w-[80px]"
                  disabled
                  @click="openDocumentPreview('referral')"
                />
                <UButton
                  color="primary"
                  icon="i-lucide-printer"
                  label="พิมพ์ / PDF"
                  size="xs"
                  variant="solid"
                  class="flex-1 justify-center min-w-[90px]"
                  disabled
                  @click="downloadDocument('referral')"
                />
              </div>
            </div>
          </UCard>
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
                <strong>ชื่อ-สกุล:</strong> {{ activeDocContext.nameTh }} ({{
                  activeDocContext.nameEn
                }})
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
