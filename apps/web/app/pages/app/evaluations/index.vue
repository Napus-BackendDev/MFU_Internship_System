<script setup lang="ts">
import { createSandboxedEmailPreviewDocument } from '~/utils/email-preview'
import { describeInvitationActionFailure } from '~/utils/invitation-action-error'

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
  readonly status:
    | 'pending'
    | 'inProgress'
    | 'submitted'
    | 'expired'
    | 'reopened'
    | 'email_error'
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
const auth = useAuthStore()
const toast = useToast()
const canManageCycles = computed(() =>
  auth.actor?.roles.some((role) =>
    ['systemAdmin', 'internshipStaff'].includes(role)
  )
)
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
const {
  data: studentsData,
  error: studentsError,
  pending: studentsPending,
  refresh: refreshStudents
} = await useAsyncData('evaluations-students', () =>
  api<{ items: StudentItem[] }>('/students', {
    query: { pageSize: 500 }
  })
)

// Fetch evaluators to map evaluatorId (ObjectId) to evaluator email and name
const {
  data: evaluatorsData,
  error: evaluatorsError,
  pending: evaluatorsPending,
  refresh: refreshEvaluators
} = await useAsyncData('evaluations-evaluators', () =>
  api<{ items: EvaluatorItem[] }>('/evaluators', {
    query: { pageSize: 500 }
  })
)

// Fetch organizations to map evaluator organization
const {
  data: organizationsData,
  error: organizationsError,
  pending: organizationsPending,
  refresh: refreshOrganizations
} = await useAsyncData('evaluations-organizations', () =>
  api<{ items: OrganizationItem[] }>('/organizations', {
    query: { pageSize: 500 }
  })
)

const relationDataError = computed(
  () =>
    Boolean(studentsError.value) ||
    Boolean(evaluatorsError.value) ||
    Boolean(organizationsError.value)
)
const relationDataPending = computed(
  () =>
    studentsPending.value ||
    evaluatorsPending.value ||
    organizationsPending.value
)

async function retryRelationData(): Promise<void> {
  await Promise.all([
    refreshStudents(),
    refreshEvaluators(),
    refreshOrganizations()
  ])
}

function getStudent(studentId: string): StudentItem | undefined {
  if (!studentId) return undefined
  return studentsData.value?.items.find(
    (s) =>
      s.id === studentId ||
      (s as unknown as { _id?: string })._id === studentId ||
      s.studentId === studentId
  )
}

async function copyStudentId(id: string): Promise<void> {
  if (!import.meta.client || !id || id === '-') return

  try {
    await navigator.clipboard.writeText(id)
    toast.add({
      title: 'คัดลอกรหัสนักศึกษาแล้ว',
      description: `รหัส: ${id}`,
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
  return '[ไม่พบสถานประกอบการ]'
}

function getProvince(studentId: string, evaluatorId: string): string {
  const s = getStudent(studentId)
  if (s?.province) return s.province
  const e = getEvaluator(evaluatorId)
  if (e?.organizationId) {
    const org = getOrganization(e.organizationId)
    if (org?.address?.province) return org.address.province
  }
  return ''
}

const statusColor = (value: Assignment['status']) =>
  (
    ({
      pending: 'warning',
      inProgress: 'info',
      submitted: 'success',
      expired: 'error',
      reopened: 'warning',
      email_error: 'error'
    }) as const
  )[value]

function getAssignmentStatusBadge(item: Assignment) {
  if (item.status === 'email_error') {
    return {
      color: 'error' as const,
      label: 'ส่งอีเมลผิดพลาด (Email Error)',
      icon: 'i-lucide-mail-warning'
    }
  }
  if (item.status === 'submitted') {
    return {
      color: 'success' as const,
      label: 'ส่งผลแล้ว (Submitted)',
      icon: 'i-lucide-check-circle'
    }
  }
  if (item.status === 'inProgress') {
    return {
      color: 'info' as const,
      label: 'กำลังทำแบบฟอร์ม (In Progress)',
      icon: 'i-lucide-loader'
    }
  }
  if (item.status === 'expired') {
    return {
      color: 'error' as const,
      label: 'หมดอายุ (Expired)',
      icon: 'i-lucide-alert-circle'
    }
  }
  return {
    color: 'warning' as const,
    label: 'รอการประเมิน (Pending)',
    icon: 'i-lucide-clock'
  }
}

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
    value: 'email_error',
    label: 'ส่งอีเมลผิดพลาด (Email Error)',
    icon: 'i-lucide-mail-warning',
    color: 'error'
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
  if (status.value === 'email_error') {
    items = items.filter((item) => item.status === 'email_error')
  }
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
      const company = getCompany(item.studentId, item.evaluatorId)
      return (
        (student?.studentId && student.studentId.toLowerCase().includes(q)) ||
        (student?.name?.th && student.name.th.toLowerCase().includes(q)) ||
        (student?.name?.en && student.name.en.toLowerCase().includes(q)) ||
        (student?.email && student.email.toLowerCase().includes(q)) ||
        (evaluator?.name?.th && evaluator.name.th.toLowerCase().includes(q)) ||
        (evaluator?.name?.en && evaluator.name.en.toLowerCase().includes(q)) ||
        (evaluator?.email && evaluator.email.toLowerCase().includes(q)) ||
        company.toLowerCase().includes(q)
      )
    })
  }
  return items
})

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
  Record<
    'evaluation_request' | 'evaluation_reminder',
    SystemEmailTemplateItem | null
  >
>({
  evaluation_request: null,
  evaluation_reminder: null
})

async function fetchSystemEmailTemplates() {
  try {
    const res = await api<SystemEmailTemplateItem[]>('/email-templates/system')
    if (Array.isArray(res)) {
      for (const t of res) {
        if (
          t.code === 'evaluation_request' ||
          t.code === 'evaluation_reminder'
        ) {
          systemEmailTemplates.value[t.code] = t
        }
      }
    }
  } catch {
    console.error('Failed to load system email templates')
  }
}

const sendEmailModalOpen = ref(false)
const selectedAssignmentForEmail = ref<Assignment | null>(null)
const emailTargetStudent = ref<StudentItem | null>(null)
const emailTargetEvaluator = ref<EvaluatorItem | null>(null)
type EmailActionMode = 'request' | 'reminder' | 'reissue'
const emailActionMode = ref<EmailActionMode>('request')
const selectedEmailTemplateCode = ref<
  'evaluation_request' | 'evaluation_reminder'
>('evaluation_request')
const recipientEmailInput = ref('')
const evaluatorNameInput = ref('')
const invitationReissueReason = ref('')
const sendingEmail = ref(false)
const emailIdempotencyKey = ref('')

function openSendEmailModal(item: Assignment): void {
  emailIdempotencyKey.value = crypto.randomUUID()
  selectedAssignmentForEmail.value = item
  invitationReissueReason.value = ''
  const student = getStudent(item.studentId) || null
  const evaluator = getEvaluator(item.evaluatorId) || null
  emailTargetStudent.value = student
  emailTargetEvaluator.value = evaluator

  // Assignment state does not prove whether a pending invitation was already delivered.
  selectEmailAction(item.status === 'inProgress' ? 'reminder' : 'request')

  recipientEmailInput.value = evaluator?.email || ''
  evaluatorNameInput.value = evaluator?.name?.th || evaluator?.name?.en || ''

  void fetchSystemEmailTemplates()
  sendEmailModalOpen.value = true
}

function selectEmailAction(mode: EmailActionMode): void {
  emailActionMode.value = mode
  selectedEmailTemplateCode.value =
    mode === 'reminder' ? 'evaluation_reminder' : 'evaluation_request'
}

function closeSendEmailModal(): void {
  if (!sendingEmail.value) sendEmailModalOpen.value = false
}

const emailActionDisabled = computed(() => {
  if (sendingEmail.value) return true
  if (emailActionMode.value === 'reissue') {
    const reasonLength = invitationReissueReason.value.trim().length
    return (
      reasonLength < 5 ||
      reasonLength > 500 ||
      !systemEmailTemplates.value.evaluation_request
    )
  }
  return (
    !recipientEmailInput.value.trim() ||
    !systemEmailTemplates.value[selectedEmailTemplateCode.value]
  )
})

const previewEmailSubject = computed(() => {
  const t = systemEmailTemplates.value[selectedEmailTemplateCode.value]
  const sub = t?.subject || '[เทมเพลตอีเมลยังโหลดไม่สำเร็จ]'

  const sName =
    emailTargetStudent.value?.name?.th ||
    emailTargetStudent.value?.name?.en ||
    'นักศึกษา'
  return sub.replaceAll('{{student_name}}', sName)
})

const previewEmailHtml = computed(() => {
  const t = systemEmailTemplates.value[selectedEmailTemplateCode.value]
  const body = t?.html || '<p>[เทมเพลตอีเมลยังโหลดไม่สำเร็จ]</p>'

  const sName =
    emailTargetStudent.value?.name?.th ||
    emailTargetStudent.value?.name?.en ||
    'นักศึกษา'
  const sId = emailTargetStudent.value?.studentId || '[ไม่พบรหัสนักศึกษา]'
  const cName = getCompany(
    selectedAssignmentForEmail.value?.studentId || '',
    selectedAssignmentForEmail.value?.evaluatorId || ''
  )
  const eName = evaluatorNameInput.value || '[ไม่พบชื่อผู้ประเมิน]'
  const pin = '[PIN ส่งผ่านอีเมลคำเชิญและไม่แสดงซ้ำที่นี่]'
  const deadline = selectedAssignmentForEmail.value?.deadlineAt
    ? new Date(selectedAssignmentForEmail.value.deadlineAt).toLocaleDateString(
        'th-TH',
        { year: 'numeric', month: 'long', day: 'numeric' }
      )
    : '-'
  const url = '[ลิงก์คำเชิญสร้างโดยระบบเมื่อเข้าคิวส่ง]'

  return body
    .replaceAll('{{student_name}}', sName)
    .replaceAll('{{student_id}}', sId)
    .replaceAll('{{company_name}}', cName)
    .replaceAll('{{evaluator_name}}', eName)
    .replaceAll('{{pin}}', pin)
    .replaceAll('{{deadline}}', deadline)
    .replaceAll('{{invitation_url}}', url)
})

const previewEmailDocument = computed(() =>
  createSandboxedEmailPreviewDocument(previewEmailHtml.value)
)

async function confirmSendEmail(): Promise<void> {
  if (!selectedAssignmentForEmail.value) return
  const reissue = emailActionMode.value === 'reissue'
  const reason = invitationReissueReason.value.trim()
  if (reissue && (reason.length < 5 || reason.length > 500)) {
    toast.add({
      title: 'ระบุเหตุผลก่อนออกคำเชิญใหม่',
      description: 'เหตุผลต้องมี 5–500 ตัวอักษร',
      color: 'warning'
    })
    return
  }
  if (
    !systemEmailTemplates.value[
      reissue ? 'evaluation_request' : selectedEmailTemplateCode.value
    ] ||
    (!reissue && !recipientEmailInput.value.trim())
  ) {
    toast.add({
      title: 'ยังส่งคำเชิญไม่ได้',
      description:
        'ต้องมีอีเมลผู้ประเมินและเทมเพลตที่โหลดจากระบบก่อน จึงจะเข้าคิวส่งได้',
      color: 'warning'
    })
    return
  }
  sendingEmail.value = true
  try {
    if (reissue) {
      const result = await api<{ readonly recipientEmail: string }>(
        `/evaluation-assignments/${encodeURIComponent(selectedAssignmentForEmail.value.id)}/invitation/reissue`,
        {
          method: 'POST',
          headers: { 'idempotency-key': emailIdempotencyKey.value },
          body: { reason }
        }
      )
      toast.add({
        title: 'เข้าคิวออกคำเชิญใหม่แล้ว',
        description: `PIN/session เดิมถูกเพิกถอน และเข้าคิวส่งไปยัง ${result.recipientEmail}; deadline เดิมไม่เปลี่ยน ตรวจผลจาก Delivery`,
        color: 'info',
        icon: 'i-lucide-check-circle'
      })
      sendEmailModalOpen.value = false
      if (!(await refreshAfterEmailAction())) {
        toast.add({
          title: 'เข้าคิวแล้ว แต่โหลดรายการไม่สำเร็จ',
          description: 'รีเฟรชหน้าเพื่อดูสถานะล่าสุด; ไม่ต้องส่งคำสั่งซ้ำ',
          color: 'warning'
        })
      }
      return
    }

    await api('/campaigns/send-targeted', {
      method: 'POST',
      headers: { 'idempotency-key': emailIdempotencyKey.value },
      body: {
        assignmentId: selectedAssignmentForEmail.value.id,
        studentId: selectedAssignmentForEmail.value.studentId,
        templateCode: selectedEmailTemplateCode.value,
        recipientEmail: recipientEmailInput.value,
        evaluatorName: evaluatorNameInput.value
      }
    })

    toast.add({
      title: 'คิวส่งอีเมลแล้ว',
      description: `เข้าคิวอีเมล (${
        selectedEmailTemplateCode.value === 'evaluation_reminder'
          ? 'แจ้งเตือนการประเมิน'
          : 'ขอความอนุเคราะห์ประเมิน'
      }) ไปยัง ${recipientEmailInput.value} แล้ว ติดตามผลจากสถานะ Delivery`,
      color: 'info',
      icon: 'i-lucide-check-circle'
    })

    sendEmailModalOpen.value = false
    if (!(await refreshAfterEmailAction())) {
      toast.add({
        title: 'เข้าคิวแล้ว แต่โหลดรายการไม่สำเร็จ',
        description: 'รีเฟรชหน้าเพื่อดูสถานะล่าสุด; ไม่ต้องส่งคำสั่งซ้ำ',
        color: 'warning'
      })
    }
  } catch (error: unknown) {
    console.error('Failed to queue evaluation email')
    const failure = describeInvitationActionFailure(error)
    toast.add({
      title: failure.title,
      description: failure.description,
      color: 'error'
    })
    await refreshAfterEmailAction()
  } finally {
    sendingEmail.value = false
  }
}

async function refreshAfterEmailAction(): Promise<boolean> {
  try {
    await refresh()
    return true
  } catch {
    return false
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
          v-if="canManageCycles"
          color="neutral"
          icon="i-lucide-calendar-range"
          label="จัดการรอบประเมิน"
          to="/app/evaluations/cycles"
          variant="outline"
        />
        <UButton
          color="neutral"
          icon="i-lucide-mails"
          label="ตั้งค่าแม่แบบจดหมาย"
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
            ค้นหาแบบประเมิน (รหัส, ชื่อ, ผู้ประเมิน)
          </label>
          <div class="relative">
            <input
              v-model="searchQuery"
              type="text"
              placeholder="รหัสนักศึกษา, ชื่อ, ผู้ประเมิน, บริษัท..."
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

    <div
      v-if="relationDataError"
      class="flex flex-col gap-2 sm:flex-row sm:items-center"
    >
      <UAlert
        class="flex-1"
        color="warning"
        icon="i-lucide-circle-alert"
        title="โหลดข้อมูลประกอบไม่ครบ"
        description="รายละเอียดนักศึกษา ผู้ประเมิน หรือสถานประกอบการอาจไม่ครบ โปรดลองโหลดข้อมูลใหม่ก่อนดำเนินการ"
        variant="soft"
      />
      <UButton
        color="neutral"
        icon="i-lucide-refresh-cw"
        label="ลองโหลดข้อมูลประกอบใหม่"
        :loading="relationDataPending"
        :disabled="relationDataPending"
        @click="retryRelationData"
      />
    </div>

    <UCard :ui="{ body: 'p-0 sm:p-0' }">
      <div class="overflow-x-auto">
        <table class="data-table">
          <thead>
            <tr>
              <th class="min-w-[200px] whitespace-nowrap">ข้อมูลนักศึกษา</th>
              <th class="min-w-[280px]">ผู้ประเมิน & สถานประกอบการ</th>
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
                      @click.stop="
                        copyStudentId(getStudent(item.studentId)!.studentId)
                      "
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
                        '[ไม่พบอีเมลผู้ประเมิน]'
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

              <!-- 4. กำหนดส่ง -->
              <td class="py-3 px-4 text-xs">
                {{ new Date(item.deadlineAt).toLocaleString('th-TH') }}
              </td>

              <!-- 5. สถานะ -->
              <td class="py-3 px-4">
                <UBadge
                  :color="getAssignmentStatusBadge(item).color"
                  :label="getAssignmentStatusBadge(item).label"
                  size="xs"
                  variant="subtle"
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
                    class="!rounded-full size-8 p-0 flex items-center justify-center mr-1.5 cursor-pointer"
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
                        }
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
                      class="!rounded-full size-8 p-0 flex items-center justify-center cursor-pointer hover:bg-muted/60"
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
      class="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 sm:p-6 backdrop-blur-sm"
      @click="closeSendEmailModal"
    >
      <div
        class="w-full max-w-5xl xl:max-w-6xl rounded-2xl border border-default bg-elevated shadow-2xl overflow-hidden flex flex-col max-h-[92vh]"
        @click.stop
      >
        <!-- Modal Header -->
        <div
          class="flex items-center justify-between border-b border-default px-6 py-4 bg-muted/20 shrink-0"
        >
          <div class="flex items-center gap-3">
            <div class="p-2.5 rounded-xl bg-primary/10 text-primary">
              <UIcon name="i-lucide-mail" class="size-5" />
            </div>
            <div>
              <div class="flex items-center gap-2">
                <h3 class="font-bold text-highlighted text-base sm:text-lg">
                  ส่งอีเมลการประเมิน
                </h3>
                <UBadge
                  color="primary"
                  variant="subtle"
                  size="xs"
                  label="Targeted Email"
                />
              </div>
              <p class="text-xs text-muted">
                ระบบจะเลือกแม่แบบอีเมลตามสถานะของนักศึกษาโดยอัตโนมัติ
                พร้อมแสดงตัวอย่างจริงแบบเรียลไทม์
              </p>
            </div>
          </div>
          <button
            type="button"
            class="rounded-lg p-1.5 text-muted hover:text-highlighted hover:bg-muted/40 transition-colors"
            :disabled="sendingEmail"
            @click="closeSendEmailModal"
          >
            <UIcon name="i-lucide-x" class="size-5" />
          </button>
        </div>

        <!-- Modal Body: 2 Columns Grid -->
        <div
          class="grid grid-cols-1 lg:grid-cols-12 gap-6 p-6 overflow-y-auto flex-1 items-stretch"
        >
          <!-- LEFT COLUMN: Information & Configuration (5 cols on lg) -->
          <div class="lg:col-span-5 flex flex-col space-y-4">
            <!-- Student Info Card -->
            <div
              class="rounded-xl border border-default bg-muted/20 p-4 space-y-2.5 text-xs shadow-xs"
            >
              <div
                class="flex items-center justify-between border-b border-default/60 pb-2"
              >
                <span
                  class="font-semibold text-highlighted flex items-center gap-1.5"
                >
                  <UIcon name="i-lucide-user" class="size-3.5 text-primary" />
                  ข้อมูลนักศึกษา
                </span>
                <UBadge
                  :color="
                    statusColor(selectedAssignmentForEmail?.status || 'pending')
                  "
                  :label="selectedAssignmentForEmail?.status || 'pending'"
                  size="xs"
                  variant="subtle"
                />
              </div>

              <div class="space-y-2">
                <div>
                  <span class="text-muted text-[11px] block"
                    >ชื่อ-นามสกุล / รหัสนักศึกษา:</span
                  >
                  <span class="font-bold text-highlighted text-xs">
                    {{ emailTargetStudent?.name?.th || '-' }}
                    <span class="text-muted font-normal"
                      >({{ emailTargetStudent?.studentId }})</span
                    >
                  </span>
                </div>
                <div>
                  <span class="text-muted text-[11px] block"
                    >สถานประกอบการ:</span
                  >
                  <span class="font-medium text-highlighted text-xs">
                    {{
                      getCompany(
                        selectedAssignmentForEmail?.studentId || '',
                        selectedAssignmentForEmail?.evaluatorId || ''
                      )
                    }}
                  </span>
                </div>
                <div
                  class="pt-1.5 border-t border-default/40 text-[11px] text-muted"
                >
                  PIN จะถูกสร้างและส่งโดยระบบเมื่อออกคำเชิญ
                  ไม่สามารถดูหรือคัดลอกจากหน้าจัดการได้
                </div>
              </div>
            </div>

            <!-- Email Type Selector -->
            <div class="space-y-2">
              <label
                class="text-xs font-semibold text-highlighted flex items-center justify-between"
              >
                <span>เลือกการดำเนินการ:</span>
                <span class="text-[11px] text-primary font-normal">
                  เลือกตาม invitation และสถานะ Delivery; pending
                  อย่างเดียวบอกไม่ได้ว่าส่งแล้วหรือยัง
                </span>
              </label>
              <div class="grid grid-cols-1 gap-2">
                <!-- Type 1 -->
                <button
                  type="button"
                  :disabled="sendingEmail"
                  :class="[
                    'p-3 rounded-xl border text-left transition-all cursor-pointer space-y-1',
                    emailActionMode === 'request'
                      ? 'border-emerald-500 bg-emerald-500/10 ring-2 ring-emerald-500/20 shadow-xs'
                      : 'border-default bg-default hover:border-default/80 hover:bg-muted/30'
                  ]"
                  @click="selectEmailAction('request')"
                >
                  <div class="flex items-center justify-between">
                    <span
                      class="font-bold text-xs text-highlighted flex items-center gap-1.5"
                    >
                      <UIcon
                        name="i-lucide-send"
                        class="size-4 text-emerald-600"
                      />
                      1. ขอความอนุเคราะห์ประเมิน
                    </span>
                  </div>
                  <p class="text-[11px] text-muted leading-tight">
                    ส่ง invitation ครั้งแรก เมื่อ assignment ยังไม่มีคำเชิญเดิม
                  </p>
                </button>

                <!-- Type 2 -->
                <button
                  type="button"
                  :disabled="sendingEmail"
                  :class="[
                    'p-3 rounded-xl border text-left transition-all cursor-pointer space-y-1',
                    emailActionMode === 'reminder'
                      ? 'border-amber-500 bg-amber-500/10 ring-2 ring-amber-500/20 shadow-xs'
                      : 'border-default bg-default hover:border-default/80 hover:bg-muted/30'
                  ]"
                  @click="selectEmailAction('reminder')"
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
                      class="rounded-full bg-amber-500/20 text-amber-600 text-[10px] px-2 py-0.5 font-semibold"
                    >
                      แนะนำ
                    </span>
                  </div>
                  <p class="text-[11px] text-muted leading-tight">
                    ใช้ invitation เดิมที่ยัง active; ไม่เปลี่ยน PIN หรือ
                    deadline
                  </p>
                </button>

                <button
                  v-if="
                    selectedAssignmentForEmail?.status === 'pending' ||
                    selectedAssignmentForEmail?.status === 'inProgress'
                  "
                  type="button"
                  :disabled="sendingEmail"
                  :class="[
                    'p-3 rounded-xl border text-left transition-all cursor-pointer space-y-1',
                    emailActionMode === 'reissue'
                      ? 'border-primary bg-primary/10 ring-2 ring-primary/20 shadow-xs'
                      : 'border-default bg-default hover:border-default/80 hover:bg-muted/30'
                  ]"
                  @click="selectEmailAction('reissue')"
                >
                  <span
                    class="font-bold text-xs text-highlighted flex items-center gap-1.5"
                  >
                    <UIcon
                      name="i-lucide-key-round"
                      class="size-4 text-primary"
                    />
                    3. ออกคำเชิญ/PIN ใหม่
                  </span>
                  <p class="text-[11px] text-muted leading-tight">
                    เพิกถอนลิงก์เดิมและไม่ต่อกำหนดส่ง
                  </p>
                </button>
              </div>
            </div>

            <!-- Recipient Fields Card -->
            <div
              v-if="emailActionMode !== 'reissue'"
              class="rounded-xl border border-default bg-muted/10 p-3.5 space-y-3 shadow-xs"
            >
              <span
                class="font-semibold text-highlighted text-xs flex items-center gap-1.5"
              >
                <UIcon name="i-lucide-at-sign" class="size-3.5 text-primary" />
                ข้อมูลผู้รับอีเมล
              </span>

              <div class="space-y-1">
                <label class="text-[11px] font-medium text-muted"
                  >อีเมลผู้รับ *</label
                >
                <input
                  v-model="recipientEmailInput"
                  :disabled="sendingEmail"
                  type="email"
                  class="w-full rounded-lg border border-default bg-default px-3 py-2 text-xs font-mono text-highlighted focus:outline-none focus:ring-2 focus:ring-primary/40 transition-all"
                  placeholder="evaluator@company.co.th"
                  required
                />
              </div>

              <div class="space-y-1">
                <label class="text-[11px] font-medium text-muted"
                  >ชื่อผู้รับ / ผู้ประเมิน</label
                >
                <input
                  v-model="evaluatorNameInput"
                  :disabled="sendingEmail"
                  type="text"
                  class="w-full rounded-lg border border-default bg-default px-3 py-2 text-xs text-highlighted focus:outline-none focus:ring-2 focus:ring-primary/40 transition-all"
                  placeholder="คุณสมชาย ใจดี"
                />
              </div>
            </div>

            <div
              v-else
              class="rounded-xl border border-primary/30 bg-primary/5 p-3.5 space-y-3 shadow-xs"
            >
              <div class="space-y-1">
                <span
                  class="font-semibold text-highlighted text-xs flex items-center gap-1.5"
                >
                  <UIcon
                    name="i-lucide-at-sign"
                    class="size-3.5 text-primary"
                  />
                  อีเมลในทะเบียนผู้ประเมิน
                </span>
                <p class="font-mono text-xs text-highlighted">
                  {{ emailTargetEvaluator?.email || '-' }}
                </p>
              </div>
              <div class="space-y-1">
                <label class="text-[11px] font-medium text-muted">
                  เหตุผลที่ออกคำเชิญใหม่ * (5–500 ตัวอักษร)
                </label>
                <textarea
                  v-model="invitationReissueReason"
                  :disabled="sendingEmail"
                  maxlength="500"
                  rows="3"
                  class="w-full rounded-lg border border-default bg-default px-3 py-2 text-xs text-highlighted focus:outline-none focus:ring-2 focus:ring-primary/40 transition-all"
                  placeholder="เช่น ผู้ประเมินแจ้งว่าลิงก์เดิมใช้งานไม่ได้"
                ></textarea>
              </div>
              <p class="text-[11px] text-muted leading-relaxed">
                PIN และ session เดิมจะใช้ไม่ได้ทันที
                ระบบส่งคำเชิญใหม่ไปยังอีเมลข้างต้น และคง deadline เดิม
              </p>
            </div>
          </div>

          <!-- RIGHT COLUMN: Live Email Preview (7 cols on lg) -->
          <div class="lg:col-span-7 flex flex-col h-full space-y-2 min-w-0">
            <div class="flex items-center justify-between">
              <label
                class="text-xs font-semibold text-highlighted flex items-center gap-1.5"
              >
                <UIcon name="i-lucide-eye" class="size-4 text-primary" />
                ตัวอย่างจากแม่แบบอีเมล
              </label>
              <UBadge
                color="neutral"
                variant="subtle"
                size="xs"
                label="แสดงตัวอย่าง placeholder"
                icon="i-lucide-layers"
              />
            </div>

            <!-- Email Container Frame -->
            <div
              class="rounded-xl border border-default bg-default overflow-hidden flex flex-col flex-1 shadow-sm min-h-[420px] max-h-[580px]"
            >
              <!-- Email Meta Header -->
              <div
                class="bg-muted/30 border-b border-default p-3.5 space-y-1.5 shrink-0 text-xs"
              >
                <div class="flex items-start gap-2">
                  <span class="text-muted font-medium shrink-0">เรื่อง:</span>
                  <span class="font-bold text-highlighted break-words">{{
                    previewEmailSubject
                  }}</span>
                </div>
                <div class="flex items-center gap-2 text-muted">
                  <span class="font-medium shrink-0">ถึง:</span>
                  <span
                    class="font-mono text-highlighted bg-muted/40 px-2 py-0.5 rounded text-[11px]"
                  >
                    {{
                      emailActionMode === 'reissue'
                        ? emailTargetEvaluator?.email || '-'
                        : recipientEmailInput || '-'
                    }}
                  </span>
                </div>
              </div>

              <!-- Email HTML Body Canvas -->
              <div
                class="p-5 bg-white dark:bg-neutral-900 flex-1 overflow-y-auto"
              >
                <iframe
                  :srcdoc="previewEmailDocument"
                  title="ตัวอย่างอีเมลคำเชิญประเมิน"
                  sandbox=""
                  referrerpolicy="no-referrer"
                  class="block min-h-[360px] w-full border-0 bg-white"
                />
              </div>
            </div>
          </div>
        </div>

        <!-- Modal Footer -->
        <div
          class="flex flex-col sm:flex-row items-center justify-between gap-3 border-t border-default px-6 py-4 bg-muted/20 shrink-0"
        >
          <div class="text-xs text-muted flex items-center gap-1.5">
            <UIcon
              name="i-lucide-shield-check"
              class="size-4 text-emerald-600"
            />
            <span v-if="emailActionMode === 'reissue'">
              ระบบเพิกถอน PIN/session เดิมทันทีและคง deadline เดิม
            </span>
            <span v-else-if="emailActionMode === 'reminder'">
              Reminder ใช้ลิงก์และ PIN เดิม ไม่หมุน PIN และไม่ต่อ deadline
            </span>
            <span v-else>
              ระบบแนบลิงก์และ PIN ให้ผู้ประเมินโดยอัตโนมัติเมื่อเข้าคิวส่ง
            </span>
          </div>

          <div class="flex items-center gap-2 self-end sm:self-auto">
            <UButton
              color="neutral"
              label="ยกเลิก"
              size="md"
              variant="ghost"
              :disabled="sendingEmail"
              @click="closeSendEmailModal"
            />
            <UButton
              color="primary"
              icon="i-lucide-send"
              :label="
                emailActionMode === 'reissue'
                  ? 'ออกคำเชิญใหม่'
                  : emailActionMode === 'reminder'
                    ? 'ส่งอีเมลแจ้งเตือน'
                    : 'ส่งอีเมลขอความอนุเคราะห์'
              "
              size="md"
              :loading="sendingEmail"
              :disabled="emailActionDisabled"
              @click="confirmSendEmail"
            />
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
