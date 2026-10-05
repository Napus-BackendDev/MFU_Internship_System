import type {
  StudentDirectoryExportLocale,
  StudentDirectoryExportValues
} from '@internship/shared-types'

interface LocalizedText {
  readonly th?: string
  readonly en?: string
}

interface CategoryScore {
  readonly average: number | null
  readonly answeredCount: number
  readonly scaleMin: number | null
  readonly scaleMax: number | null
}

export interface StudentDirectoryExportSource {
  readonly schoolId?: string
  readonly programId?: string
  readonly studentId: string
  readonly name?: string | LocalizedText
  readonly email?: string
  readonly academicTermId?: string
  readonly academicYear?: number
  readonly semester?: string
  readonly company?: string
  readonly companyAddress?: string
  readonly province?: string
  readonly course?: string
  readonly advisor?: LocalizedText
  readonly directoryRelations?: {
    readonly school?: { readonly name?: LocalizedText }
    readonly program?: { readonly name?: LocalizedText }
    readonly course?: { readonly name?: LocalizedText }
    readonly term?: {
      readonly id: string
      readonly semester: string
      readonly academicYear: number
    }
    readonly assignments?: readonly {
      readonly cycleId?: string
      readonly placementId?: string
      readonly status?: string
      readonly categoryScores?: {
        readonly hardSkill: CategoryScore
        readonly softSkill: CategoryScore
      }
      readonly evaluator?: {
        readonly organizationId?: string
        readonly name?: LocalizedText
        readonly email?: string
        readonly position?: LocalizedText
      }
    }[]
    readonly placements?: readonly {
      readonly id: string
      readonly academicTermId?: string
      readonly academicTerm?: {
        readonly id: string
        readonly semester: string
        readonly academicYear: number
      }
      readonly organization?: {
        readonly name?: LocalizedText
        readonly address?: Readonly<Record<string, string>>
      }
    }[]
  }
}

function text(value: string | undefined): string {
  return value?.trim() || '-'
}

function formatScore(
  score: CategoryScore | undefined,
  locale: StudentDirectoryExportLocale
): string {
  if (typeof score?.average !== 'number' || !Number.isFinite(score.average)) {
    return '-'
  }
  const scale =
    typeof score.scaleMin === 'number' &&
    typeof score.scaleMax === 'number' &&
    Number.isFinite(score.scaleMin) &&
    Number.isFinite(score.scaleMax)
      ? ` / ${score.scaleMin}–${score.scaleMax}`
      : ''
  const count =
    Number.isInteger(score.answeredCount) && score.answeredCount > 0
      ? locale === 'th'
        ? ` (${score.answeredCount} ข้อ)`
        : ` (${score.answeredCount} items)`
      : ''
  return `${score.average.toFixed(1)}${scale}${count}`
}

function courseValues(
  rawCourse: string | undefined,
  courseName: LocalizedText | undefined
): {
  readonly display: string
  readonly thai: string
  readonly english: string
} {
  const raw = rawCourse?.trim() || ''
  const thai = courseName?.th?.trim() || ''
  const english = courseName?.en?.trim() || ''
  if (!raw && !thai && !english) {
    return { display: '-', thai: '-', english: '-' }
  }
  if (
    raw.toLowerCase().includes('coop') ||
    raw.includes('สหกิจ') ||
    (!raw && (english.toLowerCase().includes('coop') || thai.includes('สหกิจ')))
  ) {
    return {
      display: 'Cooperative Education',
      thai: 'สหกิจศึกษา',
      english: 'Cooperative Education'
    }
  }
  if (
    raw.toLowerCase().includes('intern') ||
    raw.includes('ฝึกงาน') ||
    (!raw &&
      (english.toLowerCase().includes('intern') || thai.includes('ฝึกงาน')))
  ) {
    return {
      display: raw ? 'Internship' : english || thai || 'Internship',
      thai: thai || 'การฝึกงาน',
      english: english || 'Internship'
    }
  }
  if (raw) return { display: raw, thai: raw, english: raw }
  return {
    display: english || thai,
    thai: thai || english,
    english: english || thai
  }
}

function semesterLabel(rawValue: string | undefined): string {
  const raw = rawValue?.trim() || ''
  const normalized = raw.toLowerCase()
  if (
    normalized === 'first' ||
    normalized === '1' ||
    normalized === 'ภาคการศึกษาต้น'
  ) {
    return 'ภาคการศึกษาต้น'
  }
  if (
    normalized === 'second' ||
    normalized === '2' ||
    normalized === 'ภาคการศึกษาปลาย'
  ) {
    return 'ภาคการศึกษาปลาย'
  }
  if (
    normalized === 'third' ||
    normalized === '3' ||
    normalized === 'summer' ||
    normalized.includes('ฤดูร้อน')
  ) {
    return 'ภาคการศึกษาฤดูร้อน'
  }
  return raw || '-'
}

function semesterEnglishLabel(rawValue: string | undefined): string {
  const raw = rawValue?.trim() || ''
  const normalized = raw.toLowerCase()
  if (
    normalized === 'first' ||
    normalized === '1' ||
    normalized === 'ภาคการศึกษาต้น'
  ) {
    return 'Semester 1'
  }
  if (
    normalized === 'second' ||
    normalized === '2' ||
    normalized === 'ภาคการศึกษาปลาย'
  ) {
    return 'Semester 2'
  }
  if (
    normalized === 'third' ||
    normalized === '3' ||
    normalized === 'summer' ||
    normalized.includes('ฤดูร้อน')
  ) {
    return 'Summer Session'
  }
  return raw || '-'
}

function statusLabels(
  assignmentCount: number,
  assignmentStatus: string | undefined,
  cycleSelected: boolean
): { readonly thai: string; readonly english: string } {
  if (!cycleSelected) {
    return {
      thai: 'เลือกรอบฝึกงานเพื่อดูสถานะ',
      english: 'Select an internship cycle'
    }
  }
  if (assignmentCount > 1) {
    return {
      thai: 'พบ assignment ซ้ำในรอบนี้',
      english: 'Duplicate assignments in this cycle'
    }
  }
  switch (assignmentStatus) {
    case 'submitted':
      return { thai: 'ส่งผลประเมินแล้ว', english: 'Submitted' }
    case 'email_error':
      return { thai: 'ส่งอีเมลผิดพลาด', english: 'Email Error' }
    case 'inProgress':
      return { thai: 'ส่งคำขอประเมินแล้ว', english: 'Awaiting Response' }
    case 'expired':
      return { thai: 'หมดอายุ', english: 'Expired' }
    default:
      return { thai: 'รอระบุผู้ประเมิน', english: 'Awaiting Evaluator' }
  }
}

function academicYears(year: number | undefined): {
  readonly thai: string | number
  readonly english: string | number
} {
  if (typeof year !== 'number' || !Number.isFinite(year)) {
    return { thai: '-', english: '-' }
  }
  return year > 2400
    ? { thai: year, english: year - 543 }
    : { thai: year + 543, english: year }
}

export function toStudentDirectoryExportValues(
  student: StudentDirectoryExportSource,
  cycleId: string | undefined,
  locale: StudentDirectoryExportLocale
): StudentDirectoryExportValues {
  const assignments = student.directoryRelations?.assignments ?? []
  const cycleAssignments = cycleId
    ? assignments.filter((assignment) => assignment.cycleId === cycleId)
    : []
  const assignment =
    cycleAssignments.length === 1 ? cycleAssignments[0] : undefined
  const placements = student.directoryRelations?.placements ?? []
  const selectedPlacement = assignment?.placementId
    ? placements.find((placement) => placement.id === assignment.placementId)
    : cycleId
      ? placements.find(
          (placement) => placement.academicTermId === student.academicTermId
        )
      : student.academicTermId
        ? placements.find(
            (placement) => placement.academicTermId === student.academicTermId
          )
        : placements.length === 1
          ? placements[0]
          : undefined
  const directoryTerm = student.directoryRelations?.term
  const term = cycleId
    ? (selectedPlacement?.academicTerm ?? directoryTerm)
    : directoryTerm?.id === student.academicTermId
      ? directoryTerm
      : selectedPlacement?.academicTerm
  const year = academicYears(
    cycleId ? term?.academicYear : (term?.academicYear ?? student.academicYear)
  )
  const evaluator = assignment?.evaluator
  const organization = selectedPlacement?.organization
  const address = organization?.address
  const organizationAddress =
    address?.street || address?.location || address?.fullAddress || ''
  const cycleSelected = Boolean(cycleId)
  const status = statusLabels(
    cycleAssignments.length,
    assignment?.status,
    cycleSelected
  )
  const course = courseValues(
    student.course,
    student.directoryRelations?.course?.name
  )
  const rawSemester = cycleId
    ? term?.semester
    : (term?.semester ?? student.semester)
  const semester = semesterLabel(rawSemester)
  const semesterEn = semesterEnglishLabel(rawSemester)
  const scores = assignment?.categoryScores

  const resolvedStudentName =
    typeof student.name === 'string'
      ? student.name
      : student.name?.th || student.name?.en || student.studentId

  return {
    studentId: student.studentId,
    nameTh: text(
      typeof student.name === 'object' && student.name !== null
        ? student.name.th || student.name.en || student.studentId
        : resolvedStudentName
    ),
    nameEn: text(
      typeof student.name === 'object' && student.name !== null
        ? student.name.en || student.name.th || student.studentId
        : resolvedStudentName
    ),
    email: text(student.email),
    schoolTh: text(student.directoryRelations?.school?.name?.th),
    schoolEn: text(student.directoryRelations?.school?.name?.en),
    programTh: text(student.directoryRelations?.program?.name?.th),
    programEn: text(student.directoryRelations?.program?.name?.en),
    courseDisplay: course.display,
    academicYear: year.thai,
    academicYearEn: year.english,
    semester,
    semesterEn,
    company: cycleSelected
      ? text(organization?.name?.th || organization?.name?.en)
      : text(
          student.company || organization?.name?.th || organization?.name?.en
        ),
    companyAddress: cycleSelected
      ? text(organizationAddress)
      : text(student.companyAddress || organizationAddress),
    province: cycleSelected
      ? text(address?.province)
      : text(student.province || address?.province),
    advisorTh: text(student.advisor?.th),
    advisorEn: text(student.advisor?.en),
    evaluatorTh: text(evaluator?.name?.th),
    evaluatorEn: text(evaluator?.name?.en),
    evaluatorPositionTh: text(evaluator?.position?.th),
    evaluatorPositionEn: text(evaluator?.position?.en),
    evaluatorEmail: text(evaluator?.email),
    statusTh: status.thai,
    statusEn: status.english,
    hardSkillScore: formatScore(scores?.hardSkill, locale),
    softSkillScore: formatScore(scores?.softSkill, locale)
  }
}
