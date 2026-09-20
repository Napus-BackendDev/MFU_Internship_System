<script setup lang="ts">
definePageMeta({ layout: 'app', middleware: 'auth' })

interface LocalizedText {
  readonly th: string
  readonly en: string
}

interface Assignment {
  readonly id: string
  readonly studentId: string
  readonly evaluatorId: string
  readonly deadlineAt: string
  readonly accessPin?: string
  readonly status:
    'pending' | 'inProgress' | 'submitted' | 'expired' | 'reopened'
}

interface StudentItem {
  readonly id: string
  readonly studentId: string
  readonly name: LocalizedText
  readonly email: string
  readonly company?: string
  readonly companyAddress?: string
  readonly province?: string
  readonly schoolId?: string
  readonly programId?: string
  readonly courseId?: string
}

interface EvaluatorItem {
  readonly id: string
  readonly organizationId?: string
  readonly name: LocalizedText
  readonly email: string
  readonly position?: LocalizedText
}

interface OrganizationItem {
  readonly id: string
  readonly organizationCode?: string
  readonly name: LocalizedText
  readonly address?: Readonly<Record<string, string>>
}

interface AssignmentPage {
  readonly items: readonly Assignment[]
  readonly meta: { readonly total: number }
}

const api = useApi()
const toast = useToast()
const status = ref<string | undefined>()
const page = ref(1)
const pageSize = ref(5)

const { data, error, pending, refresh } = await useAsyncData(
  'assignments',
  () =>
    api<AssignmentPage>('/evaluation-assignments', {
      query: {
        page: page.value,
        pageSize: pageSize.value,
        status: status.value
      }
    }),
  { watch: [status, page, pageSize] }
)

watch(pageSize, () => {
  page.value = 1
})

// Fetch students to map studentId (ObjectId) to student name, email, company, and province
const { data: studentsData } = await useAsyncData('evaluations-students', () =>
  api<{ items: StudentItem[] }>('/students', {
    query: { pageSize: 500 }
  }).catch(() => ({ items: [] }))
)

// Fetch evaluators to map evaluatorId (ObjectId) to evaluator email and name
const { data: evaluatorsData } = await useAsyncData(
  'evaluations-evaluators',
  () =>
    api<{ items: EvaluatorItem[] }>('/evaluators', {
      query: { pageSize: 500 }
    }).catch(() => ({ items: [] }))
)

// Fetch organizations to map evaluator organization
const { data: organizationsData } = await useAsyncData(
  'evaluations-organizations',
  () =>
    api<{ items: OrganizationItem[] }>('/organizations', {
      query: { pageSize: 500 }
    }).catch(() => ({ items: [] }))
)

onMounted(async () => {
  if (!studentsData.value?.items?.length) {
    try {
      const res = await api<{ items: StudentItem[] }>('/students', {
        query: { pageSize: 500 }
      })
      if (res?.items?.length) {
        studentsData.value = res
      }
    } catch {
      // ignore
    }
  }
  if (!evaluatorsData.value?.items?.length) {
    try {
      const res = await api<{ items: EvaluatorItem[] }>('/evaluators', {
        query: { pageSize: 500 }
      })
      if (res?.items?.length) {
        evaluatorsData.value = res
      }
    } catch {
      // ignore
    }
  }
  if (!organizationsData.value?.items?.length) {
    try {
      const res = await api<{ items: OrganizationItem[] }>('/organizations', {
        query: { pageSize: 500 }
      })
      if (res?.items?.length) {
        organizationsData.value = res
      }
    } catch {
      // ignore
    }
  }
})

function getStudent(studentId: string): StudentItem | undefined {
  if (!studentId) return undefined
  return studentsData.value?.items.find(
    (s) =>
      s.id === studentId ||
      (s as unknown as { _id?: string })._id === studentId ||
      s.studentId === studentId
  )
}

function copyStudentId(id: string): void {
  if (import.meta.client && id && id !== '-') {
    navigator.clipboard.writeText(id)
    toast.add({
      title: 'คัดลอกรหัสนักศึกษาแล้ว',
      description: `รหัส: ${id}`,
      color: 'success',
      icon: 'i-lucide-check'
    })
  }
}

function getEvaluator(evaluatorId: string): EvaluatorItem | undefined {
  return evaluatorsData.value?.items.find((e) => e.id === evaluatorId)
}

function getOrganization(orgId?: string): OrganizationItem | undefined {
  if (!orgId) return undefined
  return organizationsData.value?.items.find((o) => o.id === orgId)
}

function getCompany(studentId: string, evaluatorId: string): string {
  const s = getStudent(studentId)
  if (s?.company) return s.company
  const e = getEvaluator(evaluatorId)
  if (e?.organizationId) {
    const org = getOrganization(e.organizationId)
    if (org?.name?.th) return org.name.th
    if (org?.name?.en) return org.name.en
  }
  return 'สถานประกอบการฝึกงาน'
}

function getProvince(studentId: string, evaluatorId: string): string {
  const s = getStudent(studentId)
  if (s?.province) return s.province
  const e = getEvaluator(evaluatorId)
  if (e?.organizationId) {
    const org = getOrganization(e.organizationId)
    if (org?.address?.province) return org.address.province
  }
  return 'เชียงใหม่'
}

function copyPin(pin: string): void {
  if (import.meta.client) {
    navigator.clipboard.writeText(pin)
    toast.add({
      title: 'คัดลอกรหัส PIN สำเร็จ',
      description: `PIN: ${pin} พร้อมใช้งานแล้ว`,
      color: 'success',
      icon: 'i-lucide-check'
    })
  }
}

function getPin(item: Assignment): string {
  if (item.accessPin) return item.accessPin
  const student = getStudent(item.studentId)
  if (student?.studentId) {
    return `2026${student.studentId.slice(-6).padStart(12, '0')}`
  }
  return '-'
}

const statusColor = (value: Assignment['status']) =>
  (
    ({
      pending: 'warning',
      inProgress: 'info',
      submitted: 'success',
      expired: 'error',
      reopened: 'warning'
    }) as const
  )[value]

const statusOptions = [
  { value: undefined, label: 'ทั้งหมด (All)', icon: 'i-lucide-list-filter' },
  {
    value: 'pending',
    label: 'รอการประเมิน (Pending)',
    icon: 'i-lucide-clock',
    color: 'warning'
  },
  {
    value: 'inProgress',
    label: 'กำลังทำแบบฟอร์ม (In Progress)',
    icon: 'i-lucide-loader',
    color: 'info'
  },
  {
    value: 'submitted',
    label: 'ส่งผลแล้ว (Submitted)',
    icon: 'i-lucide-check-circle',
    color: 'success'
  },
  {
    value: 'expired',
    label: 'หมดอายุ (Expired)',
    icon: 'i-lucide-alert-circle',
    color: 'error'
  }
] as const

const searchQuery = ref('')
const selectedOrg = ref('all')

const setStatus = (value?: string) => {
  status.value = value
  page.value = 1
  void refresh()
}

const filteredItems = computed(() => {
  let items = data.value?.items ?? []
  if (selectedOrg.value !== 'all') {
    items = items.filter((item) => {
      const e = getEvaluator(item.evaluatorId)
      return e?.organizationId === selectedOrg.value
    })
  }
  const q = searchQuery.value.trim().toLowerCase()
  if (q) {
    items = items.filter((item) => {
      const student = getStudent(item.studentId)
      const evaluator = getEvaluator(item.evaluatorId)
      const pin = getPin(item)
      const company = getCompany(item.studentId, item.evaluatorId)
      return (
        (student?.studentId && student.studentId.toLowerCase().includes(q)) ||
        (student?.name?.th && student.name.th.toLowerCase().includes(q)) ||
        (student?.name?.en && student.name.en.toLowerCase().includes(q)) ||
        (student?.email && student.email.toLowerCase().includes(q)) ||
        (evaluator?.name?.th && evaluator.name.th.toLowerCase().includes(q)) ||
        (evaluator?.name?.en && evaluator.name.en.toLowerCase().includes(q)) ||
        (evaluator?.email && evaluator.email.toLowerCase().includes(q)) ||
        company.toLowerCase().includes(q) ||
        pin.toLowerCase().includes(q)
      )
    })
  }
  return items
})

const runtimeConfig = useRuntimeConfig()

function resetFilters(): void {
  status.value = undefined
  searchQuery.value = ''
  selectedOrg.value = 'all'
  page.value = 1
  void refresh()
}

// ---------------------------------------------------------------------------
// SEND EMAIL MODAL (ดึงเทมเพลต 2 ประเภทตามสถานะนักศึกษา)
// ---------------------------------------------------------------------------
interface SystemEmailTemplateItem {
  id: string
  code: 'evaluation_request' | 'evaluation_reminder'
  name: string
  description: string
  subject: string
  html: string
  text: string
}

const systemEmailTemplates = ref<
  Record<'evaluation_request' | 'evaluation_reminder', SystemEmailTemplateItem | null>
>({
  evaluation_request: null,
  evaluation_reminder: null
})

async function fetchSystemEmailTemplates() {
  try {
    const res = await api<SystemEmailTemplateItem[]>('/email-templates/system')
    if (Array.isArray(res)) {
      for (const t of res) {
        if (t.code === 'evaluation_request' || t.code === 'evaluation_reminder') {
          systemEmailTemplates.value[t.code] = t
        }
      }
    }
  } catch (err) {
    console.error('Failed to load system email templates:', err)
  }
}

const sendEmailModalOpen = ref(false)
const selectedAssignmentForEmail = ref<Assignment | null>(null)
const emailTargetStudent = ref<StudentItem | null>(null)
const emailTargetEvaluator = ref<EvaluatorItem | null>(null)
const selectedEmailTemplateCode = ref<'evaluation_request' | 'evaluation_reminder'>('evaluation_request')
const recipientEmailInput = ref('')
const evaluatorNameInput = ref('')
const sendingEmail = ref(false)

function openSendEmailModal(item: Assignment): void {
  selectedAssignmentForEmail.value = item
  const student = getStudent(item.studentId) || null
  const evaluator = getEvaluator(item.evaluatorId) || null
  emailTargetStudent.value = student
  emailTargetEvaluator.value = evaluator

  // Rule based on student status:
  // If item.status === 'inProgress' || student?.evaluationStatus === 'awaiting_response' -> Reminder
  // If item.status === 'pending' || student?.evaluationStatus === 'awaiting_evaluator' -> Request
  const isAlreadySent =
    item.status === 'inProgress' ||
    (student as unknown as { evaluationStatus?: string })?.evaluationStatus === 'awaiting_response'
  selectedEmailTemplateCode.value = isAlreadySent ? 'evaluation_reminder' : 'evaluation_request'

  recipientEmailInput.value = evaluator?.email || 'evaluator@workplace.co.th'
  evaluatorNameInput.value =
    evaluator?.name?.th || evaluator?.name?.en || student?.company || 'ผู้ดูแลการฝึกงาน'

  void fetchSystemEmailTemplates()
  sendEmailModalOpen.value = true
}

const previewEmailSubject = computed(() => {
  const t = systemEmailTemplates.value[selectedEmailTemplateCode.value]
  let sub =
    t?.subject ||
    (selectedEmailTemplateCode.value === 'evaluation_reminder'
      ? '[แจ้งเตือน] ขอความอนุเคราะห์กรอกแบบประเมินการฝึกงานของนักศึกษา ({{student_name}})'
      : '[มหาวิทยาลัยแม่ฟ้าหลวง] ขอความอนุเคราะห์ประเมินผลการฝึกงานของนักศึกษา ({{student_name}})')

  const sName =
    emailTargetStudent.value?.name?.th ||
    emailTargetStudent.value?.name?.en ||
    'นักศึกษา'
  return sub.replaceAll('{{student_name}}', sName)
})

const previewEmailHtml = computed(() => {
  const t = systemEmailTemplates.value[selectedEmailTemplateCode.value]
  let body = t?.html || '<p>ระบบประเมินผลการฝึกงาน มหาวิทยาลัยแม่ฟ้าหลวง</p>'

  const sName =
    emailTargetStudent.value?.name?.th ||
    emailTargetStudent.value?.name?.en ||
    'นักศึกษา'
  const sId = emailTargetStudent.value?.studentId || '-'
  const cName = getCompany(
    selectedAssignmentForEmail.value?.studentId || '',
    selectedAssignmentForEmail.value?.evaluatorId || ''
  )
  const eName = evaluatorNameInput.value || 'ผู้ดูแลการฝึกงาน'
  const pin = selectedAssignmentForEmail.value
    ? getPin(selectedAssignmentForEmail.value)
    : '-'
  const deadline = selectedAssignmentForEmail.value?.deadlineAt
    ? new Date(selectedAssignmentForEmail.value.deadlineAt).toLocaleDateString(
        'th-TH',
        { year: 'numeric', month: 'long', day: 'numeric' }
      )
    : '-'
  const url = `${
    (runtimeConfig.public as unknown as { webUrl?: string })?.webUrl ||
    'http://localhost:8180'
  }/evaluate?assignment=${selectedAssignmentForEmail.value?.id || ''}`

  return body
    .replaceAll('{{student_name}}', sName)
    .replaceAll('{{student_id}}', sId)
    .replaceAll('{{company_name}}', cName)
    .replaceAll('{{evaluator_name}}', eName)
    .replaceAll('{{pin}}', pin)
    .replaceAll('{{deadline}}', deadline)
    .replaceAll('{{invitation_url}}', url)
})

async function confirmSendEmail(): Promise<void> {
  if (!selectedAssignmentForEmail.value) return
  sendingEmail.value = true
  try {
    await api('/campaigns/send-targeted', {
      method: 'POST',
      body: {
        studentId: selectedAssignmentForEmail.value.studentId,
        templateCode: selectedEmailTemplateCode.value,
        recipientEmail: recipientEmailInput.value,
        evaluatorName: evaluatorNameInput.value
      }
    })

    toast.add({
      title: 'ส่งอีเมลสำเร็จ',
      description: `ส่งอีเมล (${
        selectedEmailTemplateCode.value === 'evaluation_reminder'
          ? 'แจ้งเตือนการประเมิน'
          : 'ขอความอนุเคราะห์ประเมิน'
      }) ไปยัง ${recipientEmailInput.value} เรียบร้อยแล้ว`,
      color: 'success',
      icon: 'i-lucide-check-circle'
    })

    sendEmailModalOpen.value = false
    await refresh()
  } catch (err: unknown) {
    console.error('Failed to send targeted email:', err)
    toast.add({
      title: 'ส่งอีเมลไม่สำเร็จ',
      description: 'เกิดข้อผิดพลาดในการส่ง กรุณาลองใหม่อีกครั้ง',
      color: 'error'
    })
  } finally {
    sendingEmail.value = false
  }
}
</script>

<template>
  <div class="space-y-6">
    <header class="flex flex-wrap items-end justify-between gap-4">
      <div>
        <p class="mfu-eyebrow">ติดตาม Snapshot, Draft และผลส่งสุดท้าย</p>
        <h1 class="mt-2 text-3xl font-bold text-highlighted">การประเมิน</h1>
      </div>
      <div class="flex items-center gap-2">
        <UButton
          color="neutral"
          icon="i-lucide-mail-cog"
          label="ตั้งค่าแม่แบบอีเมล"
          to="/app/settings/email"
          variant="outline"
        />
        <UButton
          color="primary"
          icon="i-lucide-sliders"
          label="จัดการแบบฟอร์มประเมิน"
          to="/app/evaluations/forms"
        />
      </div>
    </header>

    <!-- Functional Filter Bar -->
    <div
      class="rounded-xl border border-default bg-default p-4 shadow-sm space-y-3"
    >
      <!-- 1. แถบตัวเลือกสถานะการประเมินแบบ Segmented Tabs -->
      <div
        class="flex flex-wrap items-center gap-1.5 p-1 rounded-lg bg-muted/40 border border-default/60"
      >
        <button
          v-for="opt in statusOptions"
          :key="String(opt.value)"
          type="button"
          :class="[
            'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all cursor-pointer',
            status === opt.value
              ? 'bg-primary text-inverted font-bold shadow-xs'
              : 'text-muted hover:text-highlighted hover:bg-default/80'
          ]"
          @click="setStatus(opt.value)"
        >
          <UIcon :name="opt.icon" class="size-3.5" />
          <span>{{ opt.label }}</span>
        </button>
      </div>

      <!-- 2. ตัวกรองสถานประกอบการ และ ช่องค้นหา -->
      <div class="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
        <!-- ตัวกรองสถานประกอบการ -->
        <div class="space-y-1">
          <label
            class="text-xs font-semibold text-muted flex items-center gap-1.5"
          >
            <UIcon name="i-lucide-building-2" class="size-3.5 text-primary" />
            สถานประกอบการ (Company)
          </label>
          <select
            v-model="selectedOrg"
            class="w-full rounded-lg border border-default bg-default px-3 py-2 text-xs text-highlighted focus:outline-none focus:ring-1 focus:ring-primary truncate"
          >
            <option value="all">ทุกสถานประกอบการ (All Companies)</option>
            <option
              v-for="org in organizationsData?.items ?? []"
              :key="org.id"
              :value="org.id"
            >
              {{ org.name.th }}
            </option>
          </select>
        </div>

        <!-- ช่องค้นหาด่วน -->
        <div class="space-y-1">
          <label
            class="text-xs font-semibold text-muted flex items-center gap-1.5"
          >
            <UIcon name="i-lucide-search" class="size-3.5 text-primary" />
            ค้นหาแบบประเมิน (รหัส, ชื่อ, ผู้ประเมิน, PIN)
          </label>
          <div class="relative">
            <input
              v-model="searchQuery"
              type="text"
              placeholder="รหัสนักศึกษา, ชื่อ, ผู้ประเมิน, บริษัท, PIN..."
              class="w-full rounded-lg border border-default bg-default pl-8 pr-8 py-2 text-xs text-highlighted focus:outline-none focus:ring-1 focus:ring-primary"
            />
            <UIcon
              name="i-lucide-search"
              class="size-4 text-muted absolute left-2.5 top-2.5 pointer-events-none"
            />
            <button
              v-if="searchQuery"
              type="button"
              class="absolute right-2.5 top-2.5 text-muted hover:text-highlighted cursor-pointer"
              @click="searchQuery = ''"
            >
              <UIcon name="i-lucide-x" class="size-3.5" />
            </button>
          </div>
        </div>
      </div>

      <!-- 3. แถบแจ้งสรุปผลและปุ่มล้างตัวกรอง -->
      <div
        class="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-default/70 text-xs text-muted"
      >
        <div>
          แสดงผล <strong>{{ filteredItems.length }}</strong> รายการ (จากทั้งหมด
          {{ data?.meta?.total ?? 0 }} รายการในระบบ)
        </div>

        <button
          v-if="status || selectedOrg !== 'all' || searchQuery"
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
      title="โหลด Assignment ไม่สำเร็จ"
      variant="soft"
    />

    <UCard :ui="{ body: 'p-0 sm:p-0' }">
      <div class="overflow-x-auto">
        <table class="data-table">
          <thead>
            <tr>
              <th class="min-w-[200px] whitespace-nowrap">ข้อมูลนักศึกษา</th>
              <th class="min-w-[280px]">ผู้ประเมิน & สถานประกอบการ</th>
              <th class="min-w-[170px]">รหัส PIN</th>
              <th class="min-w-[140px]">กำหนดส่ง</th>
              <th class="min-w-[110px]">สถานะ</th>
              <th class="w-24 text-right">การจัดการ</th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="item in filteredItems"
              :key="item.id"
              class="hover:bg-muted/30 transition-colors group"
            >
              <!-- 1. คอลัมน์ข้อมูลนักศึกษา (รูปแบบเดียวกับตาราง Dashboard) -->
              <td class="py-3 px-4">
                <div v-if="getStudent(item.studentId)" class="space-y-0.5">
                  <div class="flex items-center gap-1.5">
                    <span class="font-mono font-bold text-primary text-xs">
                      {{ getStudent(item.studentId)!.studentId }}
                    </span>
                    <button
                      type="button"
                      title="คัดลอกรหัสนักศึกษา"
                      class="text-muted hover:text-primary opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer"
                      @click.stop="copyStudentId(getStudent(item.studentId)!.studentId)"
                    >
                      <UIcon name="i-lucide-copy" class="size-3" />
                    </button>
                  </div>
                  <p class="font-semibold text-highlighted text-xs">
                    {{ getStudent(item.studentId)!.name.th }}
                  </p>
                  <p class="text-[11px] text-muted truncate">
                    {{ getStudent(item.studentId)!.name.en }}
                  </p>
                  <p class="text-[10px] text-muted/80 font-mono">
                    {{ getStudent(item.studentId)!.email }}
                  </p>
                </div>
                <div v-else class="space-y-0.5">
                  <div class="flex items-center gap-1.5">
                    <span class="font-mono font-bold text-primary text-xs">
                      {{ item.studentId }}
                    </span>
                    <button
                      type="button"
                      title="คัดลอกรหัส"
                      class="text-muted hover:text-primary opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer"
                      @click.stop="copyStudentId(item.studentId)"
                    >
                      <UIcon name="i-lucide-copy" class="size-3" />
                    </button>
                  </div>
                  <p class="text-xs text-muted">-</p>
                </div>
              </td>

              <!-- 2. คอลัมน์ผู้ประเมิน & สถานประกอบการ: email อยู่ข้างบน และ บริษัทไว้ข้างล่างพอ -->
              <td class="py-3 px-4">
                <div class="space-y-1.5">
                  <!-- ส่วนบน: อีเมลผู้ประเมิน -->
                  <div class="flex items-center gap-1.5 text-xs">
                    <UIcon
                      name="i-lucide-mail"
                      class="size-3.5 text-primary shrink-0"
                    />
                    <span class="font-mono font-semibold text-primary">
                      {{
                        getEvaluator(item.evaluatorId)?.email ||
                        'evaluator@workplace.co.th'
                      }}
                    </span>
                  </div>

                  <!-- ส่วนล่าง: บริษัท และ ที่ตั้งจังหวัด -->
                  <div class="flex items-center gap-1.5 text-xs text-muted">
                    <UIcon
                      name="i-lucide-building-2"
                      class="size-3.5 text-muted/80 shrink-0"
                    />
                    <span class="font-medium text-highlighted">
                      {{ getCompany(item.studentId, item.evaluatorId) }}
                    </span>
                    <span
                      v-if="
                        getProvince(item.studentId, item.evaluatorId) &&
                        getProvince(item.studentId, item.evaluatorId) !== '-'
                      "
                      class="text-muted/60"
                      >·</span
                    >
                    <span
                      v-if="
                        getProvince(item.studentId, item.evaluatorId) &&
                        getProvince(item.studentId, item.evaluatorId) !== '-'
                      "
                      class="inline-flex items-center gap-0.5 text-[11px] text-muted"
                    >
                      <UIcon
                        name="i-lucide-map-pin"
                        class="size-3 text-muted/80 shrink-0"
                      />
                      {{ getProvince(item.studentId, item.evaluatorId) }}
                    </span>
                  </div>
                </div>
              </td>

              <!-- 3. คอลัมน์รหัส PIN: เพิ่มแถว/คอลัมน์ PIN แล้ววาง PIN เอาไว้ -->
              <td class="py-3 px-4">
                <div
                  v-if="getPin(item) !== '-'"
                  class="inline-flex items-center gap-1.5 px-2 py-1 rounded bg-muted font-mono text-xs font-bold text-amber-700 dark:text-amber-300 border border-default"
                >
                  <UIcon
                    name="i-lucide-key-round"
                    class="size-3.5 text-amber-600 dark:text-amber-400 shrink-0"
                  />
                  <span>{{ getPin(item) }}</span>
                  <button
                    type="button"
                    title="คัดลอกรหัส PIN"
                    class="text-muted hover:text-primary transition-colors p-0.5 ml-0.5 rounded hover:bg-default"
                    @click="copyPin(getPin(item))"
                  >
                    <UIcon name="i-lucide-copy" class="size-3.5" />
                  </button>
                </div>
                <span v-else class="text-xs text-muted font-mono">-</span>
              </td>

              <!-- 4. กำหนดส่ง -->
              <td class="py-3 px-4 text-xs">
                {{ new Date(item.deadlineAt).toLocaleString('th-TH') }}
              </td>

              <!-- 5. สถานะ -->
              <td class="py-3 px-4">
                <UBadge
                  :color="statusColor(item.status)"
                  :label="item.status"
                  size="xs"
                  variant="soft"
                />
              </td>

              <!-- 6. การจัดการ -->
              <td class="py-3 px-4 text-right">
                <div class="flex items-center justify-end">
                  <UButton
                    aria-label="ส่งอีเมลการประเมิน"
                    color="primary"
                    icon="i-lucide-mail"
                    size="xs"
                    variant="subtle"
                    class="rounded-full mr-1 cursor-pointer"
                    :title="
                      item.status === 'inProgress'
                        ? 'ส่งอีเมลแจ้งเตือน (Reminder)'
                        : 'ส่งอีเมลขอความอนุเคราะห์ (Request)'
                    "
                    @click="openSendEmailModal(item)"
                  />
                  <UDropdownMenu
                    :items="[
                      [
                        {
                          label:
                            item.status === 'inProgress'
                              ? 'ส่งอีเมลแจ้งเตือน (Reminder)'
                              : 'ส่งอีเมลขอความอนุเคราะห์ (Request)',
                          icon: 'i-lucide-mail',
                          onSelect: () => openSendEmailModal(item)
                        },
                        {
                          label: 'ตรวจสอบการประเมิน',
                          icon: 'i-lucide-eye',
                          to:
                            getPin(item) !== '-'
                              ? `/evaluate?pin=${getPin(item)}`
                              : `/evaluate?assignment=${item.id}`
                        },
                        ...(getPin(item) !== '-'
                          ? [
                              {
                                label: 'คัดลอกรหัส PIN',
                                icon: 'i-lucide-copy',
                                onSelect: () => copyPin(getPin(item))
                              }
                            ]
                          : [])
                      ]
                    ]"
                    :content="{ align: 'end' }"
                  >
                    <UButton
                      aria-label="การจัดการการประเมิน"
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
              <td class="py-12 text-center text-muted" colspan="6">
                ยังไม่มี Assignment
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <AppPagination
        v-model:page="page"
        v-model:page-size="pageSize"
        :total="data?.meta?.total ?? 0"
        items-name="รายการ"
      />
    </UCard>

    <!-- ================================================================= -->
    <!-- MODAL: SEND TARGETED EVALUATION EMAIL                              -->
    <!-- ================================================================= -->
    <div
      v-if="sendEmailModalOpen"
      class="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"
      @click="sendEmailModalOpen = false"
    >
      <div
        class="w-full max-w-2xl rounded-2xl border border-default bg-default p-6 shadow-2xl space-y-5 max-h-[90vh] overflow-y-auto"
        @click.stop
      >
        <!-- Modal Header -->
        <div
          class="flex items-center justify-between border-b border-default pb-3"
        >
          <div class="flex items-center gap-2.5">
            <div class="p-2 rounded-xl bg-primary/10 text-primary">
              <UIcon name="i-lucide-mail" class="size-5" />
            </div>
            <div>
              <h3 class="font-bold text-highlighted text-base">
                ส่งอีเมลการประเมิน
              </h3>
              <p class="text-xs text-muted">
                ระบบจะเลือกแม่แบบอีเมลตามสถานะของนักศึกษาโดยอัตโนมัติ
              </p>
            </div>
          </div>
          <button
            type="button"
            class="rounded-lg p-1 text-muted hover:text-highlighted hover:bg-muted/40 transition-colors"
            @click="sendEmailModalOpen = false"
          >
            <UIcon name="i-lucide-x" class="size-5" />
          </button>
        </div>

        <!-- Student Info Card -->
        <div
          class="rounded-xl border border-default bg-muted/20 p-4 space-y-2 text-xs"
        >
          <div class="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <div>
              <span class="text-muted block">นักศึกษา:</span>
              <span class="font-bold text-highlighted">
                {{ emailTargetStudent?.name?.th || '-' }} ({{
                  emailTargetStudent?.studentId
                }})
              </span>
            </div>
            <div>
              <span class="text-muted block">สถานประกอบการ:</span>
              <span class="font-bold text-highlighted">
                {{
                  getCompany(
                    selectedAssignmentForEmail?.studentId || '',
                    selectedAssignmentForEmail?.evaluatorId || ''
                  )
                }}
              </span>
            </div>
            <div>
              <span class="text-muted block">สถานะปัจจุบัน:</span>
              <UBadge
                :color="
                  statusColor(
                    selectedAssignmentForEmail?.status || 'pending'
                  )
                "
                :label="selectedAssignmentForEmail?.status || 'pending'"
                size="xs"
                variant="subtle"
              />
            </div>
            <div>
              <span class="text-muted block">รหัส PIN:</span>
              <span class="font-mono font-bold text-amber-600">
                {{
                  selectedAssignmentForEmail
                    ? getPin(selectedAssignmentForEmail)
                    : '-'
                }}
              </span>
            </div>
          </div>
        </div>

        <!-- Email Type Selector (2 Types) -->
        <div class="space-y-2">
          <label
            class="text-xs font-semibold text-highlighted flex items-center justify-between"
          >
            <span>เลือกประเภทของอีเมล:</span>
            <span class="text-[11px] text-primary font-normal">
              * คัดเลือกอัตโนมัติตามสถานะนักศึกษา
            </span>
          </label>
          <div class="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <!-- Type 1 -->
            <button
              type="button"
              :class="[
                'p-3 rounded-xl border text-left transition-all cursor-pointer space-y-1',
                selectedEmailTemplateCode === 'evaluation_request'
                  ? 'border-emerald-500 bg-emerald-500/10 ring-2 ring-emerald-500/20'
                  : 'border-default bg-default hover:border-default/80 hover:bg-muted/30'
              ]"
              @click="selectedEmailTemplateCode = 'evaluation_request'"
            >
              <div class="flex items-center justify-between">
                <span
                  class="font-bold text-xs text-highlighted flex items-center gap-1.5"
                >
                  <UIcon name="i-lucide-send" class="size-4 text-emerald-600" />
                  1. ขอความอนุเคราะห์ประเมิน
                </span>
                <span
                  v-if="selectedAssignmentForEmail?.status === 'pending'"
                  class="rounded-full bg-emerald-500/20 text-emerald-600 text-[10px] px-2 py-0.2 font-semibold"
                >
                  แนะนำ
                </span>
              </div>
              <p class="text-[11px] text-muted leading-tight">
                สำหรับนักศึกษาที่ยังไม่ได้ส่งแบบประเมิน หรือเริ่มต้นขอให้ระบุผู้ประเมิน
              </p>
            </button>

            <!-- Type 2 -->
            <button
              type="button"
              :class="[
                'p-3 rounded-xl border text-left transition-all cursor-pointer space-y-1',
                selectedEmailTemplateCode === 'evaluation_reminder'
                  ? 'border-amber-500 bg-amber-500/10 ring-2 ring-amber-500/20'
                  : 'border-default bg-default hover:border-default/80 hover:bg-muted/30'
              ]"
              @click="selectedEmailTemplateCode = 'evaluation_reminder'"
            >
              <div class="flex items-center justify-between">
                <span
                  class="font-bold text-xs text-highlighted flex items-center gap-1.5"
                >
                  <UIcon
                    name="i-lucide-bell-ring"
                    class="size-4 text-amber-600"
                  />
                  2. แจ้งเตือนการประเมิน
                </span>
                <span
                  v-if="selectedAssignmentForEmail?.status === 'inProgress'"
                  class="rounded-full bg-amber-500/20 text-amber-600 text-[10px] px-2 py-0.2 font-semibold"
                >
                  แนะนำ
                </span>
              </div>
              <p class="text-[11px] text-muted leading-tight">
                สำหรับกรณีส่งไปแล้วแต่ผู้ประเมินยังไม่ได้ตอบหรือยังไม่เสร็จสิ้น
              </p>
            </button>
          </div>
        </div>

        <!-- Recipient Fields -->
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div class="space-y-1">
            <label class="text-xs font-semibold text-highlighted"
              >อีเมลผู้รับ:</label
            >
            <input
              v-model="recipientEmailInput"
              type="email"
              class="w-full rounded-lg border border-default bg-default px-3 py-2 text-xs font-mono text-highlighted focus:outline-none focus:ring-1 focus:ring-primary"
              placeholder="evaluator@company.co.th"
            />
          </div>
          <div class="space-y-1">
            <label class="text-xs font-semibold text-highlighted"
              >ชื่อผู้รับ / ผู้ประเมิน:</label
            >
            <input
              v-model="evaluatorNameInput"
              type="text"
              class="w-full rounded-lg border border-default bg-default px-3 py-2 text-xs text-highlighted focus:outline-none focus:ring-1 focus:ring-primary"
              placeholder="คุณสมชาย ใจดี"
            />
          </div>
        </div>

        <!-- Live Preview of Email to be Sent -->
        <div class="space-y-1.5">
          <label
            class="text-xs font-semibold text-highlighted flex items-center gap-1.5"
          >
            <UIcon name="i-lucide-eye" class="size-3.5 text-primary" />
            ตัวอย่างอีเมลจริงที่จะถูกส่งออก (ดึงจากแม่แบบที่ตั้งค่าไว้):
          </label>
          <div
            class="rounded-xl border border-default bg-default overflow-hidden text-xs"
          >
            <div class="bg-muted/30 border-b border-default p-3 space-y-1">
              <p>
                <strong class="text-muted">เรื่อง:</strong>
                <span class="font-semibold text-highlighted">{{
                  previewEmailSubject
                }}</span>
              </p>
              <p>
                <strong class="text-muted">ถึง:</strong>
                {{ recipientEmailInput }}
              </p>
            </div>
            <div
              class="p-4 bg-white dark:bg-neutral-900 max-h-48 overflow-y-auto"
            >
              <div v-html="previewEmailHtml"></div>
            </div>
          </div>
        </div>

        <!-- Modal Actions -->
        <div
          class="flex items-center justify-end gap-2 pt-2 border-t border-default"
        >
          <UButton
            color="neutral"
            label="ยกเลิก"
            size="sm"
            variant="ghost"
            @click="sendEmailModalOpen = false"
          />
          <UButton
            color="primary"
            icon="i-lucide-send"
            :label="
              selectedEmailTemplateCode === 'evaluation_reminder'
                ? 'ส่งอีเมลแจ้งเตือน'
                : 'ส่งอีเมลขอความอนุเคราะห์'
            "
            size="sm"
            :loading="sendingEmail"
            @click="confirmSendEmail"
          />
        </div>
      </div>
    </div>
  </div>
</template>
