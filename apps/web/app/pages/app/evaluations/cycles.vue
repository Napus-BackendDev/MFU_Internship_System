<script setup lang="ts">
import {
  bangkokDateTimeInputToIso,
  formatBangkokDateTimeInput
} from '~/utils/cycle-datetime'
import { onScopeDispose, watch, type Ref } from 'vue'

definePageMeta({ layout: 'app', middleware: 'auth' })

interface LocalizedText {
  readonly th: string
  readonly en: string
}

interface PageResult<T> {
  readonly items: T[]
  readonly meta: {
    readonly total: number
    readonly page: number
    readonly pageSize: number
    readonly totalPages: number
  }
}

interface EvaluationCycle {
  readonly id: string
  readonly code: string
  readonly name: LocalizedText
  readonly academicTermId: string
  readonly competencySetVersionId: string
  readonly schoolId?: string
  readonly programId?: string
  readonly opensAt: string
  readonly closesAt: string
  readonly status: 'draft' | 'active' | 'closed'
}

interface AcademicTerm {
  readonly id: string
  readonly code: string
  readonly academicYear: number
  readonly semester: string
  readonly status: string
}

interface School {
  readonly id: string
  readonly schoolCode: string
  readonly name: LocalizedText
}

interface Program {
  readonly id: string
  readonly schoolId: string
  readonly programCode: string
  readonly name: LocalizedText
}

interface CompetencySet {
  readonly id: string
  readonly code: string
  readonly name: LocalizedText
}

interface CompetencyVersion {
  readonly id: string
  readonly versionNumber: number
  readonly status: 'draft' | 'published' | 'retired'
}

interface CyclePreview {
  readonly cycleId: string
  readonly valid: boolean
  readonly issues: readonly { readonly code: string }[]
  readonly readiness: {
    readonly candidateStudentCount: number
    readonly eligibleStudentCount: number
    readonly missingStudentDataCount: number
    readonly missingPlacementCount: number
    readonly missingEvaluatorCount: number
  }
}

const api = useApi()
const auth = useAuthStore()
const toast = useToast()
const page = ref(1)
const pageSize = 25
const cycleSearch = ref('')
const cycleSearchQuery = ref('')
const cycleStatus = ref('')
const referencePageSize = 25
const termPage = ref(1)
const termSearch = ref('')
const termSearchQuery = ref('')
const schoolPage = ref(1)
const schoolSearch = ref('')
const schoolSearchQuery = ref('')
const competencySetPage = ref(1)
const competencySetSearch = ref('')
const competencySetSearchQuery = ref('')
const operationCycleId = ref('')
const previews = reactive<Record<string, CyclePreview | undefined>>({})
const versions = ref<readonly CompetencyVersion[]>([])
const versionsError = ref(false)
const submitting = ref(false)

function bindDebouncedSearch(
  input: Ref<string>,
  query: Ref<string>,
  pageNumber: Ref<number>
): void {
  let timer: ReturnType<typeof setTimeout> | undefined
  watch(input, (value, _previous, onCleanup) => {
    if (timer) clearTimeout(timer)
    timer = setTimeout(() => {
      pageNumber.value = 1
      query.value = value.trim()
    }, 250)
    onCleanup(() => {
      if (timer) clearTimeout(timer)
    })
  })
  onScopeDispose(() => {
    if (timer) clearTimeout(timer)
  })
}

bindDebouncedSearch(termSearch, termSearchQuery, termPage)
bindDebouncedSearch(schoolSearch, schoolSearchQuery, schoolPage)
bindDebouncedSearch(
  competencySetSearch,
  competencySetSearchQuery,
  competencySetPage
)
bindDebouncedSearch(cycleSearch, cycleSearchQuery, page)
watch(cycleStatus, () => {
  page.value = 1
})

const cycleScopes = computed(() => {
  const actor = auth.actor
  if (!actor) return []
  return (
    actor.roleScopes?.filter(
      (scope) =>
        scope.role === 'internshipStaff' && actor.roles.includes(scope.role)
    ) ?? (actor.roles.includes('internshipStaff') ? [actor.scope] : [])
  )
})
const canManageCycles = computed(() =>
  auth.actor?.roles.some((role) =>
    ['systemAdmin', 'internshipStaff'].includes(role)
  )
)
const canCreateTenantCycle = computed(
  () =>
    Boolean(auth.actor?.roles.includes('systemAdmin')) ||
    cycleScopes.value.some((scope) => scope.tenant)
)
const requiresProgram = computed(
  () =>
    cycleScopes.value.length > 0 &&
    cycleScopes.value.every(
      (scope) =>
        !scope.tenant &&
        scope.schoolIds.length === 0 &&
        scope.programIds.length > 0
    )
)

const {
  data: cyclesData,
  error: cyclesError,
  pending: cyclesPending,
  refresh: refreshCycles
} = await useAsyncData(
  'evaluation-cycle-management',
  () =>
    api<PageResult<EvaluationCycle>>('/evaluation-cycles', {
      query: {
        page: page.value,
        pageSize,
        search: cycleSearchQuery.value || undefined,
        status: cycleStatus.value || undefined
      }
    }),
  { watch: [page, cycleSearchQuery, cycleStatus] }
)

const cycleProgramIds = computed(() =>
  Array.from(
    new Set(
      (cyclesData.value?.items ?? [])
        .map((cycle) => cycle.programId)
        .filter((programId): programId is string => Boolean(programId))
    )
  )
    .sort()
    .join(',')
)

const {
  data: cyclePrograms,
  error: cycleProgramsError,
  refresh: refreshCyclePrograms
} = await useAsyncData(
  'evaluation-cycle-programs',
  async () => {
    const programIds = cycleProgramIds.value
    if (!programIds) return []
    const ids = programIds.split(',')
    const result = await api<PageResult<Program>>('/academic/programs', {
      query: { page: 1, pageSize: ids.length, programIds }
    })
    return result.items
  },
  { watch: [cycleProgramIds] }
)

const [termsResult, schoolsResult, competencySetsResult] = await Promise.all([
  useAsyncData(
    'evaluation-cycle-term-options',
    () =>
      api<PageResult<AcademicTerm>>('/academic/terms', {
        query: {
          page: termPage.value,
          pageSize: referencePageSize,
          search: termSearchQuery.value || undefined,
          archived: false
        }
      }),
    { watch: [termPage, termSearchQuery] }
  ),
  useAsyncData(
    'evaluation-cycle-school-options',
    () =>
      api<PageResult<School>>('/academic/schools', {
        query: {
          page: schoolPage.value,
          pageSize: referencePageSize,
          search: schoolSearchQuery.value || undefined,
          archived: false
        }
      }),
    { watch: [schoolPage, schoolSearchQuery] }
  ),
  useAsyncData(
    'evaluation-cycle-competency-set-options',
    () =>
      api<PageResult<CompetencySet>>('/competency-sets', {
        query: {
          page: competencySetPage.value,
          pageSize: referencePageSize,
          search: competencySetSearchQuery.value || undefined,
          archived: false
        }
      }),
    { watch: [competencySetPage, competencySetSearchQuery] }
  )
])
const termsData = termsResult.data
const termsError = termsResult.error
const termsPending = termsResult.pending
const refreshTerms = termsResult.refresh
const schoolsData = schoolsResult.data
const schoolsError = schoolsResult.error
const schoolsPending = schoolsResult.pending
const refreshSchools = schoolsResult.refresh
const competencySetsData = competencySetsResult.data
const competencySetsError = competencySetsResult.error
const competencySetsPending = competencySetsResult.pending
const refreshCompetencySets = competencySetsResult.refresh
const referencesPending = computed(
  () =>
    termsPending.value || schoolsPending.value || competencySetsPending.value
)
const referenceError = computed(
  () =>
    Boolean(termsError.value) ||
    Boolean(schoolsError.value) ||
    Boolean(competencySetsError.value)
)

const cycleTermIds = computed(() =>
  Array.from(
    new Set(
      (cyclesData.value?.items ?? []).map((cycle) => cycle.academicTermId)
    )
  )
    .sort()
    .join(',')
)
const { data: cycleTerms } = await useAsyncData(
  'evaluation-cycle-term-labels',
  async () => {
    const ids = cycleTermIds.value
    if (!ids) return []
    const termIds = ids.split(',')
    const result = await api<PageResult<AcademicTerm>>('/academic/terms', {
      query: {
        page: 1,
        pageSize: termIds.length,
        termIds: ids,
        archived: true
      }
    })
    return result.items
  },
  { watch: [cycleTermIds] }
)
const cycleSchoolIds = computed(() =>
  Array.from(
    new Set(
      (cyclesData.value?.items ?? [])
        .map((cycle) => cycle.schoolId)
        .filter((schoolId): schoolId is string => Boolean(schoolId))
    )
  )
    .sort()
    .join(',')
)
const { data: cycleSchools } = await useAsyncData(
  'evaluation-cycle-school-labels',
  async () => {
    const ids = cycleSchoolIds.value
    if (!ids) return []
    const schoolIds = ids.split(',')
    const result = await api<PageResult<School>>('/academic/schools', {
      query: {
        page: 1,
        pageSize: schoolIds.length,
        schoolIds: ids,
        archived: true
      }
    })
    return result.items
  },
  { watch: [cycleSchoolIds] }
)

const draft = reactive({
  code: '',
  nameTh: '',
  nameEn: '',
  academicTermId: '',
  competencySetId: '',
  competencySetVersionId: '',
  schoolId: '',
  programId: '',
  opensAt: formatBangkokDateTimeInput(new Date()),
  closesAt: formatBangkokDateTimeInput(
    new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
  )
})
const selectedTerm = ref<AcademicTerm | null>(null)
const selectedSchool = ref<School | null>(null)
const selectedCompetencySet = ref<CompetencySet | null>(null)

watch(
  () => draft.academicTermId,
  (id) => {
    if (!id) selectedTerm.value = null
    else {
      const term = termsData.value?.items.find((item) => item.id === id)
      if (term) selectedTerm.value = term
    }
  }
)
watch(
  () => draft.schoolId,
  (id) => {
    if (!id) selectedSchool.value = null
    else {
      const school = schoolsData.value?.items.find((item) => item.id === id)
      if (school) selectedSchool.value = school
    }
  }
)
watch(
  () => draft.competencySetId,
  (id) => {
    if (!id) selectedCompetencySet.value = null
    else {
      const competencySet = competencySetsData.value?.items.find(
        (item) => item.id === id
      )
      if (competencySet) selectedCompetencySet.value = competencySet
    }
  }
)

const termOptions = computed(() => {
  const items = termsData.value?.items ?? []
  const selected = selectedTerm.value
  return selected && !items.some((item) => item.id === selected.id)
    ? [selected, ...items]
    : items
})
const schoolOptions = computed(() => {
  const items = schoolsData.value?.items ?? []
  const selected = selectedSchool.value
  return selected && !items.some((item) => item.id === selected.id)
    ? [selected, ...items]
    : items
})
const competencySetOptions = computed(() => {
  const items = competencySetsData.value?.items ?? []
  const selected = selectedCompetencySet.value
  return selected && !items.some((item) => item.id === selected.id)
    ? [selected, ...items]
    : items
})

async function loadVersions(competencySetId: string): Promise<void> {
  draft.competencySetVersionId = ''
  versionsError.value = false
  if (!competencySetId) {
    versions.value = []
    return
  }
  try {
    const result = await api<readonly CompetencyVersion[]>(
      `/competency-sets/${encodeURIComponent(competencySetId)}/versions`
    )
    versions.value = result.filter((version) => version.status === 'published')
  } catch {
    versions.value = []
    versionsError.value = true
  }
}

async function onCompetencySetChange(event: Event): Promise<void> {
  const competencySetId = (event.target as HTMLSelectElement).value
  draft.competencySetId = competencySetId
  await loadVersions(competencySetId)
}

watch(
  () => draft.schoolId,
  () => {
    draft.programId = ''
  }
)

watch(
  [schoolsData, canCreateTenantCycle],
  ([loadedSchools, hasTenantScope]) => {
    if (!loadedSchools || hasTenantScope || draft.schoolId) return
    draft.schoolId = loadedSchools.items[0]?.id ?? ''
  },
  { immediate: true }
)

const visibleCycles = computed(() => cyclesData.value?.items ?? [])
const totalCycles = computed(() => cyclesData.value?.meta.total ?? 0)

function termLabel(termId: string): string {
  const term = cycleTerms.value?.find(({ id }) => id === termId)
  return term
    ? `${term.code} · ${term.semester}/${term.academicYear}`
    : 'ไม่พบภาคเรียน'
}

function scopeLabel(cycle: EvaluationCycle): string {
  if (!cycle.schoolId) return 'ทุกสำนักวิชา'
  const school = cycleSchools.value?.find(({ id }) => id === cycle.schoolId)
  const program = cyclePrograms.value?.find(({ id }) => id === cycle.programId)
  return [
    school?.name.th ?? 'สำนักวิชา',
    ...(cycle.programId ? [program?.name.th ?? 'หลักสูตร'] : [])
  ].join(' · ')
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat('th-TH', {
    timeZone: 'Asia/Bangkok',
    dateStyle: 'medium',
    timeStyle: 'short'
  }).format(new Date(value))
}

async function createCycle(): Promise<void> {
  if (submitting.value) return
  const opensAt = bangkokDateTimeInputToIso(draft.opensAt)
  const closesAt = bangkokDateTimeInputToIso(draft.closesAt)
  if (
    !draft.code.trim() ||
    !draft.nameTh.trim() ||
    !draft.nameEn.trim() ||
    !draft.academicTermId ||
    !draft.competencySetVersionId ||
    !opensAt ||
    !closesAt ||
    closesAt <= opensAt ||
    (!canCreateTenantCycle.value && !draft.schoolId) ||
    (requiresProgram.value && !draft.programId) ||
    referencesPending.value ||
    referenceError.value
  ) {
    toast.add({
      title: 'ข้อมูลรอบประเมินไม่ครบหรือไม่ถูกต้อง',
      description:
        'ตรวจรหัส ชื่อ ภาคเรียน แบบประเมิน ขอบเขต และช่วงเวลาอีกครั้ง',
      color: 'error',
      icon: 'i-lucide-circle-alert'
    })
    return
  }

  submitting.value = true
  try {
    await api('/evaluation-cycles', {
      method: 'POST',
      body: {
        code: draft.code.trim(),
        name: { th: draft.nameTh.trim(), en: draft.nameEn.trim() },
        academicTermId: draft.academicTermId,
        competencySetVersionId: draft.competencySetVersionId,
        ...(draft.schoolId ? { schoolId: draft.schoolId } : {}),
        ...(draft.programId ? { programId: draft.programId } : {}),
        opensAt,
        closesAt,
        status: 'draft'
      }
    })
    toast.add({
      title: 'สร้างรอบฉบับร่างแล้ว',
      description: 'ตรวจความพร้อมก่อนเปิดใช้งานรอบ',
      color: 'success',
      icon: 'i-lucide-check'
    })
    draft.code = ''
    draft.nameTh = ''
    draft.nameEn = ''
    page.value = 1
    await refreshCycles()
  } catch (error) {
    toast.add({
      title: 'สร้างรอบไม่สำเร็จ',
      description: error instanceof Error ? error.message : 'กรุณาลองใหม่',
      color: 'error',
      icon: 'i-lucide-circle-alert'
    })
  } finally {
    submitting.value = false
  }
}

async function previewCycle(
  cycle: EvaluationCycle
): Promise<CyclePreview | undefined> {
  operationCycleId.value = cycle.id
  try {
    const preview = await api<CyclePreview>(
      `/evaluation-cycles/${encodeURIComponent(cycle.id)}/preview`
    )
    previews[cycle.id] = preview
    return preview
  } catch (error) {
    toast.add({
      title: 'ตรวจความพร้อมไม่สำเร็จ',
      description: error instanceof Error ? error.message : 'กรุณาลองใหม่',
      color: 'error',
      icon: 'i-lucide-circle-alert'
    })
    return undefined
  } finally {
    operationCycleId.value = ''
  }
}

async function activateCycle(cycle: EvaluationCycle): Promise<void> {
  let preview = previews[cycle.id]
  if (!preview) preview = await previewCycle(cycle)
  if (!preview?.valid) return
  if (
    !window.confirm(
      `ยืนยันเปิดรอบ ${cycle.code}? การเปิดรอบจะสร้างขอบเขตงานสำหรับรอบนี้`
    )
  )
    return

  operationCycleId.value = cycle.id
  try {
    await api(`/evaluation-cycles/${encodeURIComponent(cycle.id)}/activate`, {
      method: 'POST'
    })
    previews[cycle.id] = undefined
    await refreshCycles()
    toast.add({
      title: 'เปิดรอบประเมินแล้ว',
      color: 'success',
      icon: 'i-lucide-check'
    })
  } catch (error) {
    toast.add({
      title: 'เปิดรอบไม่สำเร็จ',
      description:
        error instanceof Error
          ? error.message
          : 'ข้อมูลอ้างอิงอาจเปลี่ยน กรุณาตรวจความพร้อมใหม่',
      color: 'error',
      icon: 'i-lucide-circle-alert'
    })
    previews[cycle.id] = undefined
  } finally {
    operationCycleId.value = ''
  }
}

async function closeCycle(cycle: EvaluationCycle): Promise<void> {
  if (
    !window.confirm(
      `ปิดรอบ ${cycle.code} ใช่ไหม? งานที่ยังไม่ส่งจะหมดอายุทันที และไม่สามารถเปิดรอบนี้กลับได้`
    )
  ) {
    return
  }
  operationCycleId.value = cycle.id
  try {
    await api(`/evaluation-cycles/${encodeURIComponent(cycle.id)}/close`, {
      method: 'POST'
    })
    previews[cycle.id] = undefined
    await refreshCycles()
    toast.add({
      title: 'ปิดรอบประเมินแล้ว',
      color: 'success',
      icon: 'i-lucide-check'
    })
  } catch (error) {
    toast.add({
      title: 'ปิดรอบไม่สำเร็จ',
      description:
        error instanceof Error ? error.message : 'กรุณาตรวจสถานะรอบแล้วลองใหม่',
      color: 'error',
      icon: 'i-lucide-circle-alert'
    })
  } finally {
    operationCycleId.value = ''
  }
}
</script>

<template>
  <div class="space-y-6">
    <header class="flex flex-wrap items-end justify-between gap-4">
      <div>
        <p class="mfu-eyebrow">ภาคเรียน · แบบประเมิน · ช่วงเวลา · ขอบเขต</p>
        <h1 class="mt-2 text-3xl font-bold text-highlighted">รอบประเมิน</h1>
        <p class="mt-2 max-w-2xl text-sm text-muted">
          สร้างรอบจากแบบประเมินที่เผยแพร่ ตรวจความพร้อมก่อนเปิด
          และปิดรอบเมื่อสิ้นสุดการรับผล
        </p>
      </div>
      <UButton
        color="neutral"
        icon="i-lucide-arrow-left"
        label="กลับไปหน้าการประเมิน"
        :to="$localePath('/app/evaluations')"
        variant="outline"
      />
    </header>

    <UAlert
      v-if="referenceError"
      color="error"
      icon="i-lucide-circle-alert"
      title="โหลดข้อมูลอ้างอิงไม่สำเร็จ"
      description="ยังสร้างรอบไม่ได้ กรุณาลองโหลดหน้าใหม่"
      variant="soft"
    />
    <div v-if="cycleProgramsError && cycleProgramIds" class="space-y-2">
      <UAlert
        color="warning"
        icon="i-lucide-triangle-alert"
        title="โหลดชื่อหลักสูตรของรอบไม่สำเร็จ"
        description="ระบบแสดงชื่อทั่วไปแทนข้อมูลที่โหลดไม่ครบ"
        variant="soft"
      />
      <UButton
        color="neutral"
        icon="i-lucide-refresh-cw"
        label="ลองโหลดชื่อหลักสูตรอีกครั้ง"
        variant="outline"
        @click="refreshCyclePrograms()"
      />
    </div>

    <UCard v-if="canManageCycles" class="border-primary/20">
      <template #header>
        <div class="flex items-center gap-3">
          <span
            class="grid size-10 place-items-center rounded-xl bg-primary/10 text-primary"
          >
            <UIcon name="i-lucide-calendar-plus" class="size-5" />
          </span>
          <div>
            <h2 class="font-semibold text-highlighted">สร้างรอบประเมิน</h2>
            <p class="text-xs text-muted">
              ระบบบันทึกเป็นฉบับร่าง ต้องตรวจและเปิดใช้งานแยกขั้นตอน
            </p>
          </div>
        </div>
      </template>

      <form
        class="grid gap-4 md:grid-cols-2 xl:grid-cols-3"
        @submit.prevent="createCycle"
      >
        <label class="space-y-1 text-sm">
          <span class="font-medium">รหัสรอบ</span>
          <input
            v-model="draft.code"
            required
            maxlength="80"
            class="w-full rounded-lg border border-default bg-default px-3 py-2"
            placeholder="เช่น 2026-S1-INTERNSHIP"
          />
        </label>
        <label class="space-y-1 text-sm">
          <span class="font-medium">ชื่อภาษาไทย</span>
          <input
            v-model="draft.nameTh"
            required
            class="w-full rounded-lg border border-default bg-default px-3 py-2"
          />
        </label>
        <label class="space-y-1 text-sm">
          <span class="font-medium">ชื่อภาษาอังกฤษ</span>
          <input
            v-model="draft.nameEn"
            required
            class="w-full rounded-lg border border-default bg-default px-3 py-2"
          />
        </label>
        <div class="space-y-2 text-sm">
          <label for="cycle-term-select" class="font-medium">ภาคเรียน</label>
          <input
            id="cycle-term-search"
            v-model="termSearch"
            type="search"
            aria-label="ค้นหารหัสภาคเรียน"
            placeholder="ค้นหารหัสภาคเรียน"
            class="w-full rounded-lg border border-default bg-default px-3 py-2"
          />
          <select
            id="cycle-term-select"
            v-model="draft.academicTermId"
            required
            :disabled="termsPending || Boolean(termsError)"
            class="w-full rounded-lg border border-default bg-default px-3 py-2"
          >
            <option value="" disabled>เลือกภาคเรียน</option>
            <option v-for="term in termOptions" :key="term.id" :value="term.id">
              {{ term.code }} · {{ term.semester }}/{{ term.academicYear }}
            </option>
          </select>
          <div class="flex flex-wrap items-center justify-between gap-2">
            <span class="text-xs text-muted" aria-live="polite">
              หน้า {{ termsData?.meta.page ?? termPage }} /
              {{ Math.max(1, termsData?.meta.totalPages ?? 0) }} ·
              {{ termsData?.meta.total ?? 0 }} รายการ
            </span>
            <div class="flex gap-2">
              <UButton
                type="button"
                color="neutral"
                label="ก่อนหน้า"
                size="xs"
                variant="outline"
                aria-label="หน้าก่อนของภาคเรียน"
                :disabled="termPage <= 1 || termsPending"
                @click="termPage = Math.max(1, termPage - 1)"
              />
              <UButton
                type="button"
                color="neutral"
                label="ถัดไป"
                size="xs"
                variant="outline"
                aria-label="หน้าถัดไปของภาคเรียน"
                :disabled="
                  termPage >= (termsData?.meta.totalPages ?? 0) || termsPending
                "
                @click="termPage += 1"
              />
            </div>
          </div>
          <div v-if="termsError" class="flex items-center gap-2" role="alert">
            <span class="text-xs text-error">โหลดภาคเรียนไม่สำเร็จ</span>
            <UButton
              type="button"
              color="neutral"
              label="ลองอีกครั้ง"
              size="xs"
              variant="outline"
              @click="refreshTerms()"
            />
          </div>
        </div>
        <div class="space-y-2 text-sm">
          <label for="cycle-competency-set-select" class="font-medium">
            ชุดแบบประเมิน
          </label>
          <input
            id="cycle-competency-set-search"
            v-model="competencySetSearch"
            type="search"
            aria-label="ค้นหารหัสชุดแบบประเมิน"
            placeholder="ค้นหารหัสชุดแบบประเมิน"
            class="w-full rounded-lg border border-default bg-default px-3 py-2"
          />
          <select
            id="cycle-competency-set-select"
            :value="draft.competencySetId"
            required
            :disabled="competencySetsPending || Boolean(competencySetsError)"
            class="w-full rounded-lg border border-default bg-default px-3 py-2"
            @change="onCompetencySetChange"
          >
            <option value="" disabled>เลือกชุดแบบประเมิน</option>
            <option
              v-for="set in competencySetOptions"
              :key="set.id"
              :value="set.id"
            >
              {{ set.code }} · {{ set.name.th }}
            </option>
          </select>
          <div class="flex flex-wrap items-center justify-between gap-2">
            <span class="text-xs text-muted" aria-live="polite">
              หน้า {{ competencySetsData?.meta.page ?? competencySetPage }} /
              {{ Math.max(1, competencySetsData?.meta.totalPages ?? 0) }} ·
              {{ competencySetsData?.meta.total ?? 0 }} รายการ
            </span>
            <div class="flex gap-2">
              <UButton
                type="button"
                color="neutral"
                label="ก่อนหน้า"
                size="xs"
                variant="outline"
                aria-label="หน้าก่อนของชุดแบบประเมิน"
                :disabled="competencySetPage <= 1 || competencySetsPending"
                @click="competencySetPage = Math.max(1, competencySetPage - 1)"
              />
              <UButton
                type="button"
                color="neutral"
                label="ถัดไป"
                size="xs"
                variant="outline"
                aria-label="หน้าถัดไปของชุดแบบประเมิน"
                :disabled="
                  competencySetPage >=
                    (competencySetsData?.meta.totalPages ?? 0) ||
                  competencySetsPending
                "
                @click="competencySetPage += 1"
              />
            </div>
          </div>
          <div
            v-if="competencySetsError"
            class="flex items-center gap-2"
            role="alert"
          >
            <span class="text-xs text-error">โหลดชุดแบบประเมินไม่สำเร็จ</span>
            <UButton
              type="button"
              color="neutral"
              label="ลองอีกครั้ง"
              size="xs"
              variant="outline"
              @click="refreshCompetencySets()"
            />
          </div>
        </div>
        <label class="space-y-1 text-sm">
          <span class="font-medium">ฉบับที่เผยแพร่แล้ว</span>
          <select
            v-model="draft.competencySetVersionId"
            required
            :disabled="!draft.competencySetId || versionsError"
            class="w-full rounded-lg border border-default bg-default px-3 py-2 disabled:opacity-60"
          >
            <option value="" disabled>
              {{ versionsError ? 'โหลดฉบับไม่สำเร็จ' : 'เลือกฉบับเผยแพร่' }}
            </option>
            <option
              v-for="version in versions"
              :key="version.id"
              :value="version.id"
            >
              ฉบับที่ {{ version.versionNumber }}
            </option>
          </select>
          <span v-if="versionsError" class="text-xs text-error"
            >โหลดฉบับไม่สำเร็จ กรุณาเลือกชุดใหม่</span
          >
        </label>
        <template
          v-if="!canCreateTenantCycle || (schoolsData?.meta.total ?? 0) > 0"
        >
          <div class="space-y-2 text-sm">
            <label for="cycle-school-select" class="font-medium"
              >สำนักวิชา{{ canCreateTenantCycle ? ' (ไม่บังคับ)' : '' }}</label
            >
            <input
              id="cycle-school-search"
              v-model="schoolSearch"
              type="search"
              aria-label="ค้นหารหัสสำนักวิชา"
              placeholder="ค้นหารหัสสำนักวิชา"
              class="w-full rounded-lg border border-default bg-default px-3 py-2"
            />
            <select
              id="cycle-school-select"
              v-model="draft.schoolId"
              :required="!canCreateTenantCycle"
              :disabled="schoolsPending || Boolean(schoolsError)"
              class="w-full rounded-lg border border-default bg-default px-3 py-2"
            >
              <option v-if="canCreateTenantCycle" value="">ทุกสำนักวิชา</option>
              <option value="" disabled>เลือกสำนักวิชา</option>
              <option
                v-for="school in schoolOptions"
                :key="school.id"
                :value="school.id"
              >
                {{ school.schoolCode }} · {{ school.name.th }}
              </option>
            </select>
            <div class="flex flex-wrap items-center justify-between gap-2">
              <span class="text-xs text-muted" aria-live="polite">
                หน้า {{ schoolsData?.meta.page ?? schoolPage }} /
                {{ Math.max(1, schoolsData?.meta.totalPages ?? 0) }} ·
                {{ schoolsData?.meta.total ?? 0 }} รายการ
              </span>
              <div class="flex gap-2">
                <UButton
                  type="button"
                  color="neutral"
                  label="ก่อนหน้า"
                  size="xs"
                  variant="outline"
                  aria-label="หน้าก่อนของสำนักวิชา"
                  :disabled="schoolPage <= 1 || schoolsPending"
                  @click="schoolPage = Math.max(1, schoolPage - 1)"
                />
                <UButton
                  type="button"
                  color="neutral"
                  label="ถัดไป"
                  size="xs"
                  variant="outline"
                  aria-label="หน้าถัดไปของสำนักวิชา"
                  :disabled="
                    schoolPage >= (schoolsData?.meta.totalPages ?? 0) ||
                    schoolsPending
                  "
                  @click="schoolPage += 1"
                />
              </div>
            </div>
            <div
              v-if="schoolsError"
              class="flex items-center gap-2"
              role="alert"
            >
              <span class="text-xs text-error">โหลดสำนักวิชาไม่สำเร็จ</span>
              <UButton
                type="button"
                color="neutral"
                label="ลองอีกครั้ง"
                size="xs"
                variant="outline"
                @click="refreshSchools()"
              />
            </div>
          </div>
          <label v-if="draft.schoolId" class="space-y-1 text-sm">
            <span class="font-medium"
              >หลักสูตร{{ requiresProgram ? '' : ' (ไม่บังคับ)' }}</span
            >
            <PaginatedLookupSelect
              v-model="draft.programId"
              api-path="/academic/programs"
              id-query-param="programIds"
              :query="{ schoolId: draft.schoolId, archived: 'false' }"
              :empty-label="'ทุกหลักสูตรในสำนักวิชา'"
              :required="requiresProgram"
              label="หลักสูตร"
              control-class="!text-sm !py-2"
            />
          </label>
        </template>
        <label class="space-y-1 text-sm">
          <span class="font-medium">เปิดรับผล (เวลาไทย)</span>
          <input
            v-model="draft.opensAt"
            type="datetime-local"
            required
            class="w-full rounded-lg border border-default bg-default px-3 py-2"
          />
        </label>
        <label class="space-y-1 text-sm">
          <span class="font-medium">ปิดรับผล (เวลาไทย)</span>
          <input
            v-model="draft.closesAt"
            type="datetime-local"
            required
            class="w-full rounded-lg border border-default bg-default px-3 py-2"
          />
        </label>
        <div class="flex items-end md:col-span-2 xl:col-span-3">
          <UButton
            type="submit"
            color="primary"
            icon="i-lucide-plus"
            label="บันทึกรอบฉบับร่าง"
            :loading="submitting"
            :disabled="referencesPending || Boolean(referenceError)"
          />
        </div>
      </form>
    </UCard>

    <UAlert
      v-if="cyclesError"
      color="error"
      icon="i-lucide-circle-alert"
      title="โหลดรอบประเมินไม่สำเร็จ"
      description="ระบบไม่แสดงข้อมูลทดแทน กรุณาลองใหม่"
      variant="soft"
    />

    <UCard :ui="{ body: 'p-0 sm:p-0' }">
      <div
        class="flex flex-wrap items-center justify-between gap-3 border-b border-default px-4 py-3"
      >
        <div>
          <h2 class="font-semibold text-highlighted">รอบที่มีอยู่</h2>
          <p class="text-xs text-muted">
            {{ totalCycles }} รอบ · แสดงหน้า {{ page }}
          </p>
          <div class="mt-3 flex flex-wrap gap-2">
            <UInput
              v-model="cycleSearch"
              aria-label="ค้นหารอบประเมิน"
              class="w-full sm:w-64"
              icon="i-lucide-search"
              placeholder="ค้นหารหัสหรือชื่อรอบ"
            />
            <select
              v-model="cycleStatus"
              aria-label="กรองสถานะรอบ"
              class="rounded-lg border border-default bg-default px-3 py-2 text-sm"
            >
              <option value="">ทุกสถานะ</option>
              <option value="draft">ฉบับร่าง</option>
              <option value="active">เปิดรับผล</option>
              <option value="closed">ปิดแล้ว</option>
            </select>
          </div>
        </div>
        <UButton
          color="neutral"
          icon="i-lucide-refresh-cw"
          label="โหลดใหม่"
          variant="outline"
          :loading="cyclesPending"
          @click="refreshCycles()"
        />
      </div>
      <div
        v-if="cyclesPending && !cyclesData"
        class="p-8 text-center text-sm text-muted"
      >
        กำลังโหลดรอบ...
      </div>
      <div
        v-else-if="!cyclesError && visibleCycles.length === 0"
        class="p-8 text-center text-sm text-muted"
      >
        {{
          cycleSearchQuery || cycleStatus
            ? 'ไม่พบรอบประเมินตามตัวกรอง'
            : 'ยังไม่มีรอบประเมินในขอบเขตของคุณ'
        }}
      </div>
      <div v-else class="divide-y divide-default">
        <article
          v-for="cycle in visibleCycles"
          :key="cycle.id"
          class="space-y-3 p-4 sm:p-5"
        >
          <div class="flex flex-wrap items-start justify-between gap-3">
            <div class="min-w-0 space-y-1">
              <div class="flex flex-wrap items-center gap-2">
                <h3 class="font-semibold text-highlighted">
                  {{ cycle.name.th }}
                </h3>
                <UBadge
                  :color="
                    cycle.status === 'active'
                      ? 'success'
                      : cycle.status === 'closed'
                        ? 'neutral'
                        : 'warning'
                  "
                  variant="subtle"
                >
                  {{
                    cycle.status === 'active'
                      ? 'เปิดรับผล'
                      : cycle.status === 'closed'
                        ? 'ปิดแล้ว'
                        : 'ฉบับร่าง'
                  }}
                </UBadge>
              </div>
              <p class="font-mono text-xs text-muted">
                {{ cycle.code }} · {{ cycle.name.en }}
              </p>
              <p class="text-xs text-muted">
                {{ termLabel(cycle.academicTermId) }} · {{ scopeLabel(cycle) }}
              </p>
              <p class="text-xs text-muted">
                {{ formatDate(cycle.opensAt) }} –
                {{ formatDate(cycle.closesAt) }}
              </p>
            </div>
            <div
              v-if="canManageCycles"
              class="flex flex-wrap items-center gap-2"
            >
              <UButton
                v-if="cycle.status === 'draft'"
                color="neutral"
                icon="i-lucide-shield-check"
                label="ตรวจความพร้อม"
                size="sm"
                variant="outline"
                :loading="operationCycleId === cycle.id"
                @click="previewCycle(cycle)"
              />
              <UButton
                v-if="cycle.status === 'draft'"
                color="primary"
                icon="i-lucide-play"
                label="เปิดรอบ"
                size="sm"
                :disabled="!previews[cycle.id]?.valid"
                :loading="operationCycleId === cycle.id"
                @click="activateCycle(cycle)"
              />
              <UButton
                v-if="cycle.status === 'active'"
                color="error"
                icon="i-lucide-lock-keyhole"
                label="ปิดรอบ"
                size="sm"
                variant="outline"
                :loading="operationCycleId === cycle.id"
                @click="closeCycle(cycle)"
              />
            </div>
          </div>
          <UAlert
            v-if="previews[cycle.id]"
            :color="previews[cycle.id]?.valid ? 'success' : 'warning'"
            :icon="
              previews[cycle.id]?.valid
                ? 'i-lucide-circle-check'
                : 'i-lucide-triangle-alert'
            "
            :title="
              previews[cycle.id]?.valid
                ? 'รอบพร้อมเปิดใช้งาน'
                : 'ยังเปิดรอบไม่ได้'
            "
            :description="
              previews[cycle.id]?.valid
                ? 'ระบบตรวจพบแบบประเมินและภาคเรียนที่ใช้ได้'
                : previews[cycle.id]?.issues
                    .map((issue) => issue.code)
                    .join(' · ')
            "
            variant="soft"
          />
          <p v-if="previews[cycle.id]?.readiness" class="text-xs text-muted">
            ผู้เรียน {{ previews[cycle.id]?.readiness.candidateStudentCount }} ·
            พร้อม {{ previews[cycle.id]?.readiness.eligibleStudentCount }} · ขาด
            placement
            {{ previews[cycle.id]?.readiness.missingPlacementCount }} ·
            ขาดผู้ประเมิน
            {{ previews[cycle.id]?.readiness.missingEvaluatorCount }} ·
            ข้อมูลอ้างอิงไม่ครบ
            {{ previews[cycle.id]?.readiness.missingStudentDataCount }}
            (ข้อมูลประกอบ ไม่ขัดขวางการเปิดรอบ)
          </p>
        </article>
      </div>
      <div
        v-if="totalCycles > pageSize"
        class="flex items-center justify-between border-t border-default px-4 py-3"
      >
        <UButton
          color="neutral"
          icon="i-lucide-chevron-left"
          label="ก่อนหน้า"
          variant="outline"
          :disabled="page <= 1 || cyclesPending"
          @click="page--"
        />
        <span class="text-xs text-muted"
          >{{ page }} / {{ Math.ceil(totalCycles / pageSize) }}</span
        >
        <UButton
          color="neutral"
          icon="i-lucide-chevron-right"
          label="ถัดไป"
          trailing
          variant="outline"
          :disabled="page >= Math.ceil(totalCycles / pageSize) || cyclesPending"
          @click="page++"
        />
      </div>
    </UCard>
  </div>
</template>
