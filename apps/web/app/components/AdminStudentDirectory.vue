<script setup lang="ts">
import * as XLSX from 'xlsx'

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
  readonly company?: string
  readonly companyAddress?: string
  readonly province?: string
  readonly semester?: string
  readonly admissionYear?: number
  readonly status: string
  readonly evaluationStatus?: string
  readonly advisor?: LocalizedText
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
  readonly evaluatorId: string
  readonly deadlineAt: string
  readonly status:
    'pending' | 'inProgress' | 'submitted' | 'expired' | 'reopened'
  readonly accessPin?: string
}

export interface PlacementItem {
  readonly id: string
  readonly studentId: string
  readonly organizationId: string
  readonly positionTitle?: LocalizedText
  readonly startsAt?: string
  readonly endsAt?: string
  readonly status: string
}

const props = withDefaults(
  defineProps<{
    students?: StudentItem[]
    schools?: SchoolItem[]
    programs?: ProgramItem[]
    courses?: CourseItem[]
    organizations?: OrganizationItem[]
    evaluators?: EvaluatorItem[]
    assignments?: EvaluationAssignmentItem[]
    placements?: PlacementItem[]
    loading?: boolean
  }>(),
  {
    students: () => [],
    schools: () => [],
    programs: () => [],
    courses: () => [],
    organizations: () => [],
    evaluators: () => [],
    assignments: () => [],
    placements: () => [],
    loading: false
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

// Filter states
const selectedYear = ref<string>('all')
const selectedSemester = ref<string>('all')
const selectedSchool = ref<string>('all')
const selectedStatus = ref<string>('all')
const searchQuery = ref<string>('')
const exportMenuOpen = ref<boolean>(false)

// Detail modal state
const detailModalOpen = ref<boolean>(false)
const activeStudentRow = ref<EnrichedStudentRow | null>(null)

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
  accessPin: string
  status: 'pending' | 'inProgress' | 'submitted' | 'expired' | 'reopened'
  statusTh: string
  statusEn: string
  scoreDisplay: string
  gradeDisplay: string
  gradeDisplayEn: string
  commentsTh: string
  commentsEn: string
}

// Enriched rows computed from props (อิงข้อมูลจริงจากฐานข้อมูลเท่านั้น ไม่แต่งหรือสุ่มข้อมูลขึ้นมาเอง)
const enrichedRows = computed<EnrichedStudentRow[]>(() => {
  const studentsList = props.students || []
  const schoolsList = props.schools || []
  const programsList = props.programs || []
  const coursesList = props.courses || []
  const organizationsList = props.organizations || []
  const assignmentsList = props.assignments || []
  const evaluatorsList = props.evaluators || []
  const placementsList = props.placements || []

  return studentsList.map((student) => {
    const school = schoolsList.find((s) => s.id === student.schoolId)
    const program = programsList.find((p) => p.id === student.programId)
    const course = coursesList.find(
      (c) => c.id === student.courseId || c.courseCode === student.courseId
    )

    // Match assignment
    const assignment = assignmentsList.find(
      (a) =>
        a.studentId === student.id ||
        a.studentId === student.studentId
    )

    // Match evaluator
    const evaluator = assignment
      ? evaluatorsList.find((e) => e.id === assignment.evaluatorId)
      : undefined

    // Match placement
    const placement = placementsList.find(
      (p) => p.studentId === student.id || p.studentId === student.studentId
    )

    // ข้อมูลจริง: ถ้าไม่มี ให้แสดง '-' ตามที่ผู้ใช้กำหนด (ห้ามสร้างขึ้นมาเอง)
    const advisorTh = student.advisor?.th || '-'
    const advisorEn = student.advisor?.en || '-'

    const evaluatorTh = evaluator?.name?.th || '-'
    const evaluatorEn = evaluator?.name?.en || '-'
    const evaluatorPositionTh = evaluator?.position?.th || '-'
    const evaluatorPositionEn = evaluator?.position?.en || '-'
    const evaluatorEmail = evaluator?.email || '-'

    const org = placement
      ? organizationsList.find((o) => o.id === placement.organizationId)
      : undefined

    const pin = assignment?.accessPin || '-'
    const company =
      student.company ||
      org?.name?.th ||
      org?.name?.en ||
      placement?.positionTitle?.th ||
      '-'
    const orgAddress =
      org?.address?.street ||
      org?.address?.location ||
      org?.address?.fullAddress ||
      ''
    const companyAddress = student.companyAddress || orgAddress || '-'
    const province = student.province || org?.address?.province || '-'

    // คำนวณปีการศึกษาจากปีที่เข้าศึกษา (admissionYear) หรือเลข 2 ตัวหน้ารหัสนักศึกษา (เช่น 62 -> 2562)
    let yearTh: number | string = '-'
    let yearEn: number | string = '-'
    const admitBE =
      student.admissionYear ||
      (student.studentId && /^\d{2}/.test(student.studentId)
        ? 2500 + parseInt(student.studentId.slice(0, 2), 10)
        : undefined)
    if (admitBE) {
      yearTh = admitBE + 4
      yearEn = admitBE + 4 - 543
    }

    const rawSem = student.semester?.trim() || ''
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
    const rawEvalStatus =
      student.evaluationStatus || assignment?.status || 'awaiting_evaluator'
    let status:
      'pending' | 'inProgress' | 'submitted' | 'expired' | 'reopened' =
      'pending'
    let statusTh = 'รอระบุผู้ประเมิน'
    let statusEn = 'Awaiting Evaluator'
    const scoreDisplay = '-'
    const gradeDisplay = '-'
    const gradeDisplayEn = '-'
    const commentsTh = '-'
    const commentsEn = '-'

    if (rawEvalStatus === 'submitted' || assignment?.status === 'submitted') {
      status = 'submitted'
      statusTh = 'ส่งผลประเมินแล้ว'
      statusEn = 'Submitted'
    } else if (
      rawEvalStatus === 'awaiting_response' ||
      rawEvalStatus === 'inProgress' ||
      assignment?.status === 'inProgress'
    ) {
      status = 'inProgress'
      statusTh = 'ส่งคำขอประเมินแล้ว'
      statusEn = 'Awaiting Response'
    } else if (assignment?.status === 'expired') {
      status = 'expired'
      statusTh = 'หมดอายุ'
      statusEn = 'Expired'
    } else {
      status = 'pending'
      statusTh = 'รอระบุผู้ประเมิน'
      statusEn = 'Awaiting Evaluator'
    }

    // Course track (2 main tracks: 'Cooperative Education' & 'Internship')
    let courseDisplay = 'Cooperative Education'
    let courseTh = 'สหกิจศึกษา'
    let courseEn = 'Cooperative Education'

    const rawCourse = student.course || ''
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
    } else if (course) {
      const en = course.name?.en || ''
      const th = course.name?.th || ''
      if (en.toLowerCase().includes('coop') || th.includes('สหกิจ')) {
        courseDisplay = 'Cooperative Education'
        courseTh = 'สหกิจศึกษา'
        courseEn = 'Cooperative Education'
      } else {
        courseDisplay = 'Internship'
        courseTh = th || 'การฝึกงาน'
        courseEn = en || 'Internship'
      }
    } else {
      courseDisplay = 'Cooperative Education'
      courseTh = 'สหกิจศึกษา'
      courseEn = 'Cooperative Education'
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
      accessPin: pin,
      status,
      statusTh,
      statusEn,
      scoreDisplay,
      gradeDisplay,
      gradeDisplayEn,
      commentsTh,
      commentsEn
    }
  })
})

// =============================================================================
// Dynamic Filter Options - ดึงเฉพาะข้อมูลที่มีจริงในตารางเท่านั้น (ห้ามเพิ่มข้อมูลที่ไม่จำเป็น)
// =============================================================================
const availableYears = computed<string[]>(() => {
  const yearsSet = new Set<string>()
  enrichedRows.value.forEach((r) => {
    if (r.academicYear && r.academicYear !== '-') {
      yearsSet.add(String(r.academicYear))
    }
  })
  return Array.from(yearsSet).sort((a, b) => Number(b) - Number(a))
})

const availableSemesters = computed<string[]>(() => {
  const semsSet = new Set<string>()
  enrichedRows.value.forEach((r) => {
    if (r.semester && r.semester !== '-') {
      semsSet.add(String(r.semester))
    }
  })
  return Array.from(semsSet).sort()
})

const availableSchools = computed<{ id: string; nameTh: string; schoolCode: string }[]>(() => {
  const schoolMap = new Map<string, { id: string; nameTh: string; schoolCode: string }>()
  enrichedRows.value.forEach((r) => {
    const sId = r.student.schoolId || r.school?.id
    if (sId && !schoolMap.has(sId)) {
      schoolMap.set(sId, {
        id: sId,
        nameTh: r.schoolTh !== '-' ? r.schoolTh : (r.school?.name?.th || sId),
        schoolCode: r.schoolCode !== '-' ? r.schoolCode : (r.school?.schoolCode || '')
      })
    }
  })
  return Array.from(schoolMap.values()).sort((a, b) => a.nameTh.localeCompare(b.nameTh, 'th'))
})

const availableStatuses = computed<{ value: string; labelTh: string; icon: string }[]>(() => {
  const statusMap = new Map<string, { value: string; labelTh: string; icon: string }>()
  enrichedRows.value.forEach((r) => {
    if (!statusMap.has(r.status)) {
      let icon = '⚪'
      if (r.status === 'submitted') icon = '🟢'
      else if (r.status === 'inProgress') icon = '🟡'
      else if (r.status === 'expired') icon = '🔴'

      statusMap.set(r.status, {
        value: r.status,
        labelTh: r.statusTh,
        icon
      })
    }
  })
  return Array.from(statusMap.values())
})

// Auto-reset filters if current value is invalid or not in available options
watch(availableYears, (years) => {
  if (selectedYear.value !== 'all' && !years.includes(selectedYear.value)) {
    selectedYear.value = 'all'
  }
}, { immediate: true })

watch(availableSemesters, (sems) => {
  if (
    selectedSemester.value !== 'all' &&
    !sems.includes(selectedSemester.value) &&
    selectedSemester.value !== '1'
  ) {
    selectedSemester.value = 'all'
  }
}, { immediate: true })

watch(availableSchools, (schs) => {
  if (
    selectedSchool.value !== 'all' &&
    !schs.some((s) => s.id === selectedSchool.value)
  ) {
    selectedSchool.value = 'all'
  }
}, { immediate: true })

watch(availableStatuses, (statuses) => {
  if (
    selectedStatus.value !== 'all' &&
    !statuses.some((s) => s.value === selectedStatus.value)
  ) {
    selectedStatus.value = 'all'
  }
}, { immediate: true })

// Filtered rows
const filteredRows = computed(() => {
  return enrichedRows.value.filter((row) => {
    // Year filter
    if (
      selectedYear.value !== 'all' &&
      availableYears.value.includes(selectedYear.value) &&
      String(row.academicYear) !== selectedYear.value
    ) {
      return false
    }
    // Semester filter
    if (selectedSemester.value !== 'all') {
      const semFilter = selectedSemester.value
      const isSem1 =
        semFilter === '1' ||
        semFilter === 'ภาคการศึกษาต้น' ||
        semFilter.toLowerCase() === 'first'
      const isSem2 =
        semFilter === '2' ||
        semFilter === 'ภาคการศึกษาปลาย' ||
        semFilter.toLowerCase() === 'second'
      const isSem3 =
        semFilter === '3' ||
        semFilter === 'ภาคการศึกษาฤดูร้อน' ||
        semFilter.toLowerCase().includes('summer')

      const isRowSem1 =
        row.semester === 'ภาคการศึกษาต้น' ||
        row.semester === '1' ||
        row.semester.toLowerCase() === 'first'
      const isRowSem2 =
        row.semester === 'ภาคการศึกษาปลาย' ||
        row.semester === '2' ||
        row.semester.toLowerCase() === 'second'
      const isRowSem3 =
        row.semester === 'ภาคการศึกษาฤดูร้อน' ||
        row.semester === '3' ||
        row.semester.toLowerCase().includes('summer')

      if (isSem1 && !isRowSem1) return false
      if (isSem2 && !isRowSem2) return false
      if (isSem3 && !isRowSem3) return false
      if (!isSem1 && !isSem2 && !isSem3 && String(row.semester) !== semFilter) {
        return false
      }
    }
    // School filter
    if (
      selectedSchool.value !== 'all' &&
      availableSchools.value.some((s) => s.id === selectedSchool.value) &&
      row.student.schoolId !== selectedSchool.value &&
      row.school?.id !== selectedSchool.value
    ) {
      return false
    }
    // Status filter
    if (
      selectedStatus.value !== 'all' &&
      availableStatuses.value.some((s) => s.value === selectedStatus.value) &&
      row.status !== selectedStatus.value
    ) {
      return false
    }
    // Search query
    if (searchQuery.value.trim()) {
      const q = searchQuery.value.trim().toLowerCase()
      const matchId = row.studentId.toLowerCase().includes(q)
      const matchNameTh = row.nameTh.toLowerCase().includes(q)
      const matchNameEn = row.nameEn.toLowerCase().includes(q)
      const matchCompany = row.company.toLowerCase().includes(q)
      const matchCompanyAddress = row.companyAddress.toLowerCase().includes(q)
      const matchEvalTh = row.evaluatorTh.toLowerCase().includes(q)
      const matchEvalEn = row.evaluatorEn.toLowerCase().includes(q)
      const matchPin = row.accessPin.toLowerCase().includes(q)
      const matchAdvisor = row.advisorTh.toLowerCase().includes(q)
      const matchCourse =
        row.courseDisplay.toLowerCase().includes(q) ||
        row.courseTh.toLowerCase().includes(q) ||
        row.courseEn.toLowerCase().includes(q)
      if (
        !matchId &&
        !matchNameTh &&
        !matchNameEn &&
        !matchCompany &&
        !matchCompanyAddress &&
        !matchCourse &&
        !matchEvalTh &&
        !matchEvalEn &&
        !matchPin &&
        !matchAdvisor
      ) {
        return false
      }
    }
    return true
  })
})

// Stats counters
const stats = computed(() => {
  const all = filteredRows.value.length
  const submitted = filteredRows.value.filter(
    (r) => r.status === 'submitted'
  ).length
  const inProgress = filteredRows.value.filter(
    (r) => r.status === 'inProgress'
  ).length
  const pending = filteredRows.value.filter(
    (r) => r.status === 'pending'
  ).length
  return { all, submitted, inProgress, pending }
})

// Pagination (Configurable: 5, 10, 15, 20 items per page)
const page = ref(1)
const pageSize = ref(5)
const paginatedRows = computed(() => {
  const start = (page.value - 1) * pageSize.value
  return filteredRows.value.slice(start, start + pageSize.value)
})

watch(
  [
    selectedYear,
    selectedSemester,
    selectedSchool,
    selectedStatus,
    searchQuery,
    pageSize
  ],
  () => {
    page.value = 1
  }
)

// Reset filters
function resetFilters(): void {
  selectedYear.value = 'all'
  selectedSemester.value = 'all'
  selectedSchool.value = 'all'
  selectedStatus.value = 'all'
  searchQuery.value = ''
  page.value = 1
}

// Copy PIN to clipboard
function copyPin(pin: string): void {
  if (import.meta.client) {
    navigator.clipboard.writeText(pin)
    toast.add({
      title: 'คัดลอกรหัส PIN สำเร็จ',
      description: `คัดลอก PIN: ${pin} ไปยังคลิปบอร์ดแล้ว`,
      color: 'success',
      icon: 'i-lucide-check'
    })
  }
}

// Copy direct evaluate link
function copyEvaluateLink(pin: string): void {
  if (import.meta.client) {
    const url = `${window.location.origin}/evaluate?pin=${pin}`
    navigator.clipboard.writeText(url)
    toast.add({
      title: 'คัดลอกลิงก์แบบประเมินสำเร็จ',
      description:
        'สามารถส่งลิงก์นี้ให้ผู้ประเมินสถานประกอบการเข้าทำแบบฟอร์มได้ทันที',
      color: 'success',
      icon: 'i-lucide-link'
    })
  }
}

// Open Detail Modal
function openDetail(row: EnrichedStudentRow): void {
  activeStudentRow.value = row
  detailModalOpen.value = true
}

function openDoc(
  type: 'certification' | 'referral',
  row: EnrichedStudentRow
): void {
  emit('openDocument', { type, row })
}

// Dropdown Action Menu for each student row (3 dots icon)
function getRowActions(row: EnrichedStudentRow) {
  const hasPin = row.accessPin && row.accessPin !== '-'
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
        label: 'พิมพ์ใบประกาศนียบัตร',
        icon: 'i-lucide-award',
        onSelect: () => openDoc('certification', row)
      },
      {
        label: 'พิมพ์หนังสือส่งตัว',
        icon: 'i-lucide-file-text',
        onSelect: () => openDoc('referral', row)
      }
    ],
    [
      ...(hasPin
        ? [
            {
              label: 'คัดลอกรหัส PIN (16 หลัก)',
              icon: 'i-lucide-copy',
              onSelect: () => copyPin(row.accessPin)
            },
            {
              label: 'คัดลอกลิงก์แบบประเมิน',
              icon: 'i-lucide-link',
              onSelect: () => copyEvaluateLink(row.accessPin)
            },
            {
              label: 'ไปยังหน้าทำแบบประเมิน (/evaluate)',
              icon: 'i-lucide-external-link',
              onSelect: () => {
                if (import.meta.client) {
                  window.open(`/evaluate?pin=${row.accessPin}`, '_blank')
                }
              }
            }
          ]
        : [
            {
              label: 'ยังไม่มีรหัส PIN (รอการส่งคำขอประเมิน)',
              icon: 'i-lucide-key-round',
              disabled: true
            }
          ])
    ]
  ]
}

// =============================================================================
// BILINGUAL EXCEL EXPORT (ภาษาไทย & ภาษาอังกฤษ) อิงตามข้อมูลจริงในฐานข้อมูล
// =============================================================================
function exportToExcel(locale: 'th' | 'en'): void {
  if (!import.meta.client) return

  const rowsToExport = filteredRows.value
  if (rowsToExport.length === 0) {
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
    const excelData = rowsToExport.map((row, index) => ({
      ลำดับ: index + 1,
      รหัสนักศึกษา: row.studentId,
      'ชื่อ-นามสกุล (ไทย)': row.nameTh,
      'ชื่อ-นามสกุล (อังกฤษ)': row.nameEn,
      อีเมลนักศึกษา: row.email,
      'อีเมลส่วนตัว (Personal Email)': row.personalEmail,
      สำนักวิชา: row.schoolTh,
      'สาขาวิชา / หลักสูตร': row.programTh,
      'รายวิชา (Course)': row.courseDisplay,
      ปีการศึกษา: row.academicYear,
      ภาคการศึกษา: `ภาคการศึกษาที่ ${row.semester}`,
      สถานประกอบการ: row.company,
      ที่ตั้งบริษัท: row.companyAddress,
      จังหวัด: row.province,
      อาจารย์ที่ปรึกษา: row.advisorTh,
      'ผู้ประเมินสถานประกอบการ (คนทำฟอร์ม)': row.evaluatorTh,
      ตำแหน่งผู้ประเมิน: row.evaluatorPositionTh,
      อีเมลผู้ประเมิน: row.evaluatorEmail,
      'รหัส PIN เข้าทำฟอร์ม': row.accessPin,
      สถานะการประเมิน: row.statusTh,
      'คะแนนเฉลี่ย (เต็ม 5.0)': row.scoreDisplay,
      ผลการประเมิน: row.gradeDisplay
    }))

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
      { wch: 22 }, // รหัส PIN
      { wch: 20 }, // สถานะ
      { wch: 20 }, // คะแนนเฉลี่ย
      { wch: 22 } // ผลการประเมิน
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
    const excelData = rowsToExport.map((row, index) => ({
      'No.': index + 1,
      'Student ID': row.studentId,
      'Full Name (English)': row.nameEn,
      'Full Name (Thai)': row.nameTh,
      'Student Email': row.email,
      'Personal Email': row.personalEmail,
      School: row.schoolEn,
      'Program / Major': row.programEn,
      Course: row.courseDisplay,
      'Academic Year': row.academicYearEn,
      Semester:
        row.semester === '3' ? 'Summer Session' : `Semester ${row.semester}`,
      'Company / Placement': row.company,
      'Company Location': row.companyAddress,
      Province: row.province,
      'Academic Advisor': row.advisorEn,
      'Workplace Evaluator (Form Maker)': row.evaluatorEn,
      'Evaluator Position': row.evaluatorPositionEn,
      'Evaluator Email': row.evaluatorEmail,
      'Access PIN Code': row.accessPin,
      'Evaluation Status': row.statusEn,
      'Average Score (out of 5.0)': row.scoreDisplay,
      'Grade / Evaluation Result': row.gradeDisplayEn
    }))

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
      { wch: 22 }, // Access PIN Code
      { wch: 20 }, // Evaluation Status
      { wch: 24 }, // Average Score
      { wch: 24 } // Grade
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
}

// =============================================================================
// POWER BI DATASET EXPORT (CSV UTF-8 with BOM & Excel Flat Table)
// =============================================================================
function exportToPowerBI(format: 'csv' | 'xlsx' = 'csv'): void {
  if (!import.meta.client) return

  const rowsToExport = filteredRows.value
  if (rowsToExport.length === 0) {
    toast.add({
      title: 'ไม่มีข้อมูลสำหรับส่งออก',
      description: 'กรุณาปรับเปลี่ยนตัวกรองเพื่อเลือกข้อมูลนักศึกษา',
      color: 'warning',
      icon: 'i-lucide-alert-triangle'
    })
    return
  }

  const timestamp = new Date().toISOString().slice(0, 10).replace(/-/g, '')

  // Structured flat dimensional dataset designed specifically for Power BI Desktop ingestion
  const biRows = rowsToExport.map((row, index) => {
    const isCompleted = row.status === 'submitted' ? 1 : 0
    const numScore =
      row.status === 'submitted' && row.scoreDisplay !== '-'
        ? parseFloat(row.scoreDisplay)
        : null
    const yearBe =
      typeof row.academicYear === 'number'
        ? row.academicYear
        : parseInt(String(row.academicYear), 10) || 2569
    const yearAd =
      typeof row.academicYearEn === 'number' ? row.academicYearEn : yearBe - 543
    const semesterNum = parseInt(String(row.semester), 10) || 1

    return {
      Row_Index: index + 1,
      Student_ID: String(row.studentId),
      Student_Name_TH: row.nameTh,
      Student_Name_EN: row.nameEn,
      Student_Email: row.email,
      Personal_Email: row.personalEmail !== '-' ? row.personalEmail : '',
      School_Code: row.schoolCode,
      School_Name_TH: row.schoolTh,
      School_Name_EN: row.schoolEn,
      Program_Code: row.programCode,
      Program_Name_TH: row.programTh,
      Program_Name_EN: row.programEn,
      Academic_Year_BE: yearBe,
      Academic_Year_AD: yearAd,
      Semester: semesterNum,
      Semester_Label: `ภาคการศึกษาที่ ${row.semester}`,
      Company_Name: row.company,
      Company_Province: row.province,
      Advisor_Name: row.advisorTh,
      Evaluator_Name: row.evaluatorTh,
      Evaluator_Position: row.evaluatorPositionTh,
      Evaluator_Email: row.evaluatorEmail,
      Access_PIN: String(row.accessPin),
      Evaluation_Status_Code: row.status,
      Evaluation_Status_TH: row.statusTh,
      Evaluation_Status_EN: row.statusEn,
      Is_Completed: isCompleted,
      Evaluation_Score: numScore,
      Grade:
        row.status === 'submitted' && row.gradeDisplay !== '-'
          ? row.gradeDisplay
          : '',
      Evaluation_Comments:
        row.commentsTh !== '-' ? row.commentsTh : ''
    }
  })

  if (format === 'csv') {
    // Generate CSV with UTF-8 BOM so Power BI reads Thai characters properly without manual encoding setup
    const headers = Object.keys(biRows[0] || {})
    const csvLines = [headers.join(',')]

    for (const row of biRows) {
      const lineValues = headers.map((header) => {
        const val = (row as Record<string, unknown>)[header]
        if (val === null || val === undefined) return ''
        const strVal = String(val).replace(/"/g, '""')
        return strVal.includes(',') ||
          strVal.includes('"') ||
          strVal.includes('\n')
          ? `"${strVal}"`
          : strVal
      })
      csvLines.push(lineValues.join(','))
    }

    const csvContent = '\ufeff' + csvLines.join('\r\n')
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
    const filename = `PowerBI_Internship_Dataset_${timestamp}.csv`
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)

    toast.add({
      title: 'ส่งออกไฟล์ Power BI (CSV) สำเร็จ',
      description: `ดาวน์โหลด ${filename} (${rowsToExport.length} แถว) พร้อมนำเข้า Power BI Desktop ได้ทันที`,
      color: 'success',
      icon: 'i-lucide-bar-chart-3'
    })
  } else {
    // Generate Excel XLSX formatted table
    const ws = XLSX.utils.json_to_sheet(biRows)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'PowerBI_Fact_Internship')
    const filename = `PowerBI_Internship_Model_${timestamp}.xlsx`
    XLSX.writeFile(wb, filename)

    toast.add({
      title: 'ส่งออกไฟล์ Power BI (Excel) สำเร็จ',
      description: `ดาวน์โหลด ${filename} (${rowsToExport.length} แถว) พร้อมนำเข้า Power BI Desktop ได้ทันที`,
      color: 'success',
      icon: 'i-lucide-bar-chart-3'
    })
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
          ตรวจสอบข้อมูลนักศึกษาทุกคนในระบบ แยกตามปีการศึกษา ภาคเรียน สถานประกอบการ และสถานะประเมิน
        </p>
      </div>

      <!-- ปุ่มส่งออกข้อมูล (Export Buttons) -->
      <div class="flex flex-wrap items-center gap-2.5 shrink-0">
        <UButton
          color="neutral"
          icon="i-lucide-refresh-cw"
          label="รีเฟรชข้อมูล"
          :loading="loading"
          size="sm"
          variant="outline"
          @click="emit('refresh')"
        />

        <!-- ส่งออกภาษาไทย -->
        <UButton
          color="success"
          icon="i-lucide-file-spreadsheet"
          label="ส่งออก Excel (ภาษาไทย)"
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
    <div class="grid grid-cols-2 sm:grid-cols-4 gap-3">
      <div
        class="rounded-xl border border-default bg-default p-3.5 flex items-center gap-3"
      >
        <span
          class="grid size-10 place-items-center rounded-lg bg-neutral-100 dark:bg-neutral-800 text-neutral-600 dark:text-neutral-300"
        >
          <UIcon name="i-lucide-graduation-cap" class="size-5" />
        </span>
        <div>
          <p class="text-xs text-muted">นักศึกษาตรงตามตัวกรอง</p>
          <p class="text-xl font-bold text-highlighted">{{ stats.all }} คน</p>
        </div>
      </div>

      <div
        class="rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-3.5 flex items-center gap-3"
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
        class="rounded-xl border border-amber-500/20 bg-amber-500/5 p-3.5 flex items-center gap-3"
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
        class="rounded-xl border border-neutral-500/20 bg-neutral-500/5 p-3.5 flex items-center gap-3"
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
      <div
        class="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-3"
      >
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
            <option v-for="sch in availableSchools" :key="sch.id" :value="sch.id">
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
            <option v-for="st in availableStatuses" :key="st.value" :value="st.value">
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
              type="text"
              placeholder="รหัส, ชื่อ, สถานที่ตั้งบริษัท, PIN..."
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
              v-if="filteredRows.length === 0"
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
                      @click="copyPin(row.studentId)"
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
                    <p class="font-medium text-highlighted text-xs leading-snug">
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
                    v-if="row.status === 'submitted' && row.scoreDisplay !== '-'"
                    class="text-[11px] text-emerald-700 dark:text-emerald-400 font-bold"
                  >
                    คะแนน: {{ row.scoreDisplay }} / 5.0
                    <span v-if="row.gradeDisplay !== '-'"> (เกรด {{ row.gradeDisplay }})</span>
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
                      class="cursor-pointer"
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
        :total="filteredRows.length"
        items-name="คน"
      />
    </div>

    <!-- ========================================================================= -->
    <!-- 5. MODAL ดูรายละเอียดนักศึกษา ผลคะแนน และข้อมูลฟอร์มเชิงลึก                -->
    <!-- ========================================================================= -->
    <UModal
      v-model:open="detailModalOpen"
      :ui="{
        content: 'sm:max-w-5xl lg:max-w-6xl xl:max-w-7xl w-[96vw] max-h-[92vh] flex flex-col p-0 overflow-hidden'
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
                            activeStudentRow.courseDisplay === 'Cooperative Education'
                              ? 'primary'
                              : 'neutral'
                          "
                          size="xs"
                          variant="subtle"
                          class="text-xs font-medium inline-flex items-center gap-1"
                        >
                          <UIcon
                            :name="
                              activeStudentRow.courseDisplay === 'Cooperative Education'
                                ? 'i-lucide-briefcase'
                                : 'i-lucide-graduation-cap'
                            "
                            class="size-3.5"
                          />
                          <span>{{ activeStudentRow.courseDisplay }}</span>
                        </UBadge>
                        <span class="text-muted text-[11px]">({{ activeStudentRow.courseTh }})</span>
                      </div>
                    </div>
                    <div class="flex justify-between items-center pt-1 border-t border-default/70">
                      <span>ปีการศึกษา:
                        <strong class="text-highlighted">{{ activeStudentRow.academicYear }} ({{ activeStudentRow.academicYearEn }})</strong>
                      </span>
                      <span>ภาคเรียน:
                        <strong class="text-highlighted">{{ activeStudentRow.semester?.startsWith('ภาคการศึกษา') ? activeStudentRow.semester : `ภาคการศึกษาที่ ${activeStudentRow.semester}` }}</strong>
                      </span>
                    </div>
                    <div class="border-t border-default/70 pt-1.5">
                      <span class="text-muted/80">อาจารย์ที่ปรึกษา:</span>
                      <p class="font-semibold text-highlighted text-xs">
                        {{ activeStudentRow.advisorTh !== '-' ? activeStudentRow.advisorTh : 'ยังไม่ได้ระบุอาจารย์ที่ปรึกษา' }}
                      </p>
                      <p v-if="activeStudentRow.advisorEn !== '-'" class="text-[11px] text-muted">
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
                    <UIcon name="i-lucide-building-2" class="size-4 text-primary" />
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
                      <span class="text-muted/80">คนทำแบบฟอร์ม (ผู้ประเมิน):</span>
                      <p class="font-semibold text-highlighted text-xs">
                        {{ activeStudentRow.evaluatorTh !== '-' ? activeStudentRow.evaluatorTh : 'ยังไม่ได้ระบุผู้ประเมิน' }}
                      </p>
                      <p
                        v-if="activeStudentRow.evaluatorPositionTh !== '-' || activeStudentRow.evaluatorEmail !== '-'"
                        class="text-[11px] text-muted"
                      >
                        {{ activeStudentRow.evaluatorPositionTh !== '-' ? activeStudentRow.evaluatorPositionTh : '' }}
                        {{ activeStudentRow.evaluatorEmail !== '-' ? `(${activeStudentRow.evaluatorEmail})` : '' }}
                      </p>
                    </div>

                    <!-- กล่องแสดง PIN สำคัญ -->
                    <div
                      v-if="activeStudentRow.accessPin !== '-'"
                      class="mt-2 p-2.5 rounded-lg border border-amber-500/30 bg-amber-500/10 space-y-1"
                    >
                      <div class="flex items-center justify-between">
                        <span
                          class="text-[11px] font-bold text-amber-800 dark:text-amber-300 flex items-center gap-1"
                        >
                          <UIcon name="i-lucide-key-round" class="size-3.5" />
                          รหัส PIN เข้าทำฟอร์ม (16 หลัก)
                        </span>
                        <UButton
                          color="warning"
                          icon="i-lucide-copy"
                          label="คัดลอก"
                          size="xs"
                          variant="subtle"
                          @click="copyPin(activeStudentRow.accessPin)"
                        />
                      </div>
                      <p
                        class="font-mono text-sm font-bold text-amber-900 dark:text-amber-200 tracking-wider"
                      >
                        {{ activeStudentRow.accessPin }}
                      </p>
                    </div>
                    <div
                      v-else
                      class="mt-2 p-2.5 rounded-lg border border-default bg-muted/30 text-xs text-muted space-y-1"
                    >
                      <p class="font-medium text-highlighted flex items-center gap-1">
                        <UIcon name="i-lucide-info" class="size-3.5 text-muted" />
                        ยังไม่มีรหัส PIN
                      </p>
                      <p class="text-[11px]">รอการระบุผู้ประเมินและส่งคำขอประเมิน</p>
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
                          : 'neutral'
                      "
                      size="xs"
                      variant="soft"
                    >
                      {{ activeStudentRow.statusTh }}
                    </UBadge>
                  </div>

                  <div
                    v-if="activeStudentRow.status === 'submitted' && activeStudentRow.scoreDisplay !== '-'"
                    class="space-y-3"
                  >
                    <div class="grid grid-cols-2 gap-2 text-center">
                      <div class="p-2 rounded-lg bg-emerald-500/10 border border-emerald-500/20 col-span-2">
                        <p class="text-[10px] text-emerald-700 dark:text-emerald-400">คะแนนรวมเฉลี่ย</p>
                        <p class="font-bold text-sm text-emerald-600 dark:text-emerald-400 mt-0.5">
                          {{ activeStudentRow.scoreDisplay }} / 5.0
                        </p>
                      </div>
                      <div
                        v-if="activeStudentRow.gradeDisplay !== '-'"
                        class="p-2 rounded-lg bg-primary/10 border border-primary/20 col-span-2"
                      >
                        <p class="text-[10px] text-primary">ระดับผลการประเมิน</p>
                        <p class="font-bold text-sm text-primary mt-0.5">
                          {{ activeStudentRow.gradeDisplay }}
                        </p>
                      </div>
                    </div>

                    <div
                      v-if="activeStudentRow.commentsTh !== '-'"
                      class="p-3 rounded-lg bg-muted/30 border border-default text-xs space-y-1"
                    >
                      <p class="font-semibold text-highlighted">
                        ข้อเสนอแนะจากคนทำแบบฟอร์ม:
                      </p>
                      <p class="text-muted leading-relaxed italic">
                        "{{ activeStudentRow.commentsTh }}"
                      </p>
                    </div>
                  </div>

                  <div v-else class="text-center py-4 text-muted text-xs">
                    <p>{{ activeStudentRow.status === 'submitted' ? 'ยังไม่มีข้อมูลคะแนนประเมิน' : 'ผู้ประเมินยังไม่ได้ส่งผลการประเมินฉบับสมบูรณ์' }}</p>
                    <p v-if="activeStudentRow.accessPin !== '-'" class="text-[11px] text-muted/70 mt-0.5">
                      สามารถส่งรหัส PIN หรือลิงก์ไปยังผู้ประเมินเพื่อดำเนินการ
                    </p>
                  </div>
                </div>
              </div>

              <!-- ============================================================= -->
              <!-- ฝั่งขวา: การวิเคราะห์สมรรถนะ & Benchmark (7 cols)               -->
              <!-- ============================================================= -->
              <div class="lg:col-span-7">
                <div v-if="activeStudentRow.status === 'submitted' && activeStudentRow.scoreDisplay !== '-'">
                  <StudentSkillBenchmarkChart
                    :student-score="activeStudentRow.scoreDisplay"
                    :academic-year="activeStudentRow.academicYear"
                    :student-name="activeStudentRow.nameTh"
                  />
                </div>
                <div
                  v-else
                  class="rounded-xl border border-default bg-muted/10 p-8 text-center space-y-3 flex flex-col items-center justify-center min-h-[360px]"
                >
                  <div class="size-14 rounded-full bg-amber-500/10 text-amber-600 flex items-center justify-center ring-1 ring-amber-500/20">
                    <UIcon name="i-lucide-clock-3" class="size-7" />
                  </div>
                  <div>
                    <h4 class="font-bold text-sm text-highlighted">
                      ยังไม่มีข้อมูลการประเมินสมรรถนะ
                    </h4>
                    <p class="text-xs text-muted mt-1 max-w-md">
                      เมื่อผู้ประเมินจากสถานประกอบการเข้าทำแบบฟอร์มด้วยรหัส PIN และส่งผลการประเมิน ระบบจะวิเคราะห์และประมวลผลเรดาร์สมรรถนะเทียบกับเพื่อนร่วมรุ่นปี {{ activeStudentRow.academicYear }} ให้ทันที
                    </p>
                  </div>
                  <div v-if="activeStudentRow.accessPin !== '-'" class="pt-2">
                    <UButton
                      color="primary"
                      icon="i-lucide-share-2"
                      label="คัดลอกลิงก์พร้อม PIN ส่งให้ผู้ประเมิน"
                      size="xs"
                      variant="soft"
                      @click="copyEvaluateLink(activeStudentRow.accessPin)"
                    />
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
                v-if="activeStudentRow.accessPin !== '-'"
                color="neutral"
                icon="i-lucide-link"
                label="คัดลอกลิงก์ประเมิน"
                size="sm"
                variant="outline"
                @click="copyEvaluateLink(activeStudentRow.accessPin)"
              />
              <UButton
                color="warning"
                icon="i-lucide-award"
                label="พิมพ์ใบประกาศ"
                size="sm"
                variant="subtle"
                @click="openDoc('certification', activeStudentRow)"
              />
              <UButton
                color="info"
                icon="i-lucide-file-text"
                label="พิมพ์หนังสือส่งตัว"
                size="sm"
                variant="subtle"
                @click="openDoc('referral', activeStudentRow)"
              />
            </div>
            <div class="flex items-center gap-2">
              <NuxtLink
                v-if="activeStudentRow.accessPin !== '-'"
                :to="`/evaluate?pin=${activeStudentRow.accessPin}`"
                target="_blank"
                class="inline-flex items-center gap-1.5 text-xs font-semibold text-primary hover:underline px-3 py-1.5 rounded-lg border border-primary/20 hover:bg-primary/5 transition-colors"
              >
                <span>เปิดหน้าทำแบบฟอร์มจริง</span>
                <UIcon name="i-lucide-external-link" class="size-3.5" />
              </NuxtLink>
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
  </div>
</template>
