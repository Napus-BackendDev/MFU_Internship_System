<script setup lang="ts">
import type { RoleKey } from '@internship/shared-types'

definePageMeta({ layout: 'app', middleware: 'auth' })

interface RoleAssignment {
  readonly role: RoleKey
  readonly tenant?: boolean
  readonly schoolIds?: readonly string[]
  readonly programIds?: readonly string[]
  readonly active?: boolean
}

interface UserItem {
  readonly id: string
  readonly email: string
  readonly displayName: string
  readonly status: 'active' | 'archived' | 'suspended'
  readonly roleAssignments?: readonly RoleAssignment[]
  readonly studentId?: string
  readonly avatarUrl?: string
  readonly createdAt?: string
  readonly updatedAt?: string
}

interface UserSummary {
  readonly total: number
  readonly systemAdmin: number
  readonly internshipStaff: number
  readonly coordinator: number
  readonly student: number
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

const api = useApi()
const toast = useToast()
const auth = useAuthStore()
const config = useRuntimeConfig()

const isDev = computed(
  () =>
    config.public.apiBaseUrl?.includes('localhost') ||
    config.public.apiBaseUrl?.includes('127.0.0.1')
)

// State
const loading = ref(false)
const users = ref<UserItem[]>([])
const totalUsers = ref(0)
const page = ref(1)
const pageSize = ref(10)
const search = ref('')
const selectedRole = ref<string>('all')
const selectedStatus = ref<string>('all')
const selectedSchool = ref<string>('all')

const summary = ref<UserSummary>({
  total: 0,
  systemAdmin: 0,
  internshipStaff: 0,
  coordinator: 0,
  student: 0
})

const schools = ref<SchoolItem[]>([])
const programs = ref<ProgramItem[]>([])

// Modals
const isModalOpen = ref(false)
const modalMode = ref<'create' | 'edit'>('create')
const editingUserId = ref<string | null>(null)
const submitting = ref(false)

const form = ref<{
  displayName: string
  email: string
  role: RoleKey
  studentId: string
  schoolId: string
  programId: string
  status: 'active' | 'suspended'
}>({
  displayName: '',
  email: '',
  role: 'internshipStaff',
  studentId: '',
  schoolId: '',
  programId: '',
  status: 'active'
})

// Tab items for roles
const roleTabs = [
  { label: 'ทั้งหมด', key: 'all', icon: 'i-lucide-users' },
  {
    label: 'เจ้าหน้าที่ฝึกงาน',
    key: 'internshipStaff',
    icon: 'i-lucide-briefcase'
  },
  {
    label: 'อาจารย์ที่ปรึกษา',
    key: 'coordinator',
    icon: 'i-lucide-user-check'
  },
  { label: 'นักศึกษา', key: 'student', icon: 'i-lucide-graduation-cap' },
  { label: 'ผู้ดูแลระบบ', key: 'systemAdmin', icon: 'i-lucide-shield-check' }
]

const roleBadgeMap: Record<
  RoleKey,
  {
    label: string
    color: 'error' | 'warning' | 'info' | 'success' | 'primary'
    icon: string
  }
> = {
  systemAdmin: {
    label: 'ผู้ดูแลระบบ (Admin)',
    color: 'error',
    icon: 'i-lucide-shield-check'
  },
  internshipStaff: {
    label: 'เจ้าหน้าที่ฝึกงาน (Staff)',
    color: 'warning',
    icon: 'i-lucide-briefcase'
  },
  coordinator: {
    label: 'อาจารย์ที่ปรึกษา (Advisor)',
    color: 'info',
    icon: 'i-lucide-user-check'
  },
  student: {
    label: 'นักศึกษา (Student)',
    color: 'success',
    icon: 'i-lucide-graduation-cap'
  },
  evaluator: {
    label: 'ผู้ประเมินภายนอก',
    color: 'primary',
    icon: 'i-lucide-award'
  },
  auditor: {
    label: 'ผู้ตรวจสอบ',
    color: 'primary',
    icon: 'i-lucide-file-search'
  }
}

// Helpers
function getPrimaryRole(user: UserItem): RoleKey {
  return user.roleAssignments?.[0]?.role ?? 'student'
}

function getSchoolName(schoolId?: string): string {
  if (!schoolId) return '-'
  const found = schools.value.find((s) => s.id === schoolId)
  return found?.name?.th || found?.name?.en || schoolId
}

function getProgramName(programId?: string): string {
  if (!programId) return '-'
  const found = programs.value.find((p) => p.id === programId)
  return found?.name?.th || found?.name?.en || programId
}

const filteredProgramsForForm = computed(() => {
  if (!form.value.schoolId) return programs.value
  return programs.value.filter((p) => p.schoolId === form.value.schoolId)
})

// Data Loaders
async function loadSummary(): Promise<void> {
  try {
    const res = await api<UserSummary>('/users/summary')
    summary.value = res
  } catch (err) {
    console.error('Failed to load user summary:', err)
  }
}

async function loadAcademic(): Promise<void> {
  try {
    const [schoolsRes, programsRes] = await Promise.all([
      api<{ items: SchoolItem[] }>('/academic/schools', {
        query: { pageSize: 100 }
      }),
      api<{ items: ProgramItem[] }>('/academic/programs', {
        query: { pageSize: 100 }
      })
    ])
    schools.value = schoolsRes.items || []
    programs.value = programsRes.items || []
  } catch (err) {
    console.error('Failed to load academic data:', err)
  }
}

async function loadUsers(): Promise<void> {
  loading.value = true
  try {
    const query: Record<string, string | number> = {
      page: page.value,
      pageSize: pageSize.value
    }
    if (search.value.trim()) query.search = search.value.trim()
    if (selectedRole.value !== 'all') query.role = selectedRole.value
    if (selectedStatus.value !== 'all') query.status = selectedStatus.value
    if (selectedSchool.value !== 'all') query.schoolId = selectedSchool.value

    const res = await api<{
      items: UserItem[]
      meta: {
        total: number
        page: number
        pageSize: number
        totalPages: number
      }
    }>('/users', { query })

    users.value = res.items || []
    totalUsers.value = res.meta?.total || 0
  } catch (err) {
    console.error('Failed to load users:', err)
    toast.add({
      title: 'ข้อผิดพลาด',
      description: 'ไม่สามารถโหลดรายชื่อผู้ใช้งานได้',
      color: 'error'
    })
  } finally {
    loading.value = false
  }
}

// Watchers
watch([page, pageSize, selectedRole, selectedStatus, selectedSchool], () => {
  loadUsers()
})

let searchDebounceTimer: ReturnType<typeof setTimeout> | null = null
function onSearchInput(): void {
  if (searchDebounceTimer) clearTimeout(searchDebounceTimer)
  searchDebounceTimer = setTimeout(() => {
    page.value = 1
    loadUsers()
  }, 350)
}

function selectTab(key: string): void {
  selectedRole.value = key
  page.value = 1
}

function resetFilters(): void {
  search.value = ''
  selectedRole.value = 'all'
  selectedSchool.value = 'all'
  selectedStatus.value = 'all'
  page.value = 1
  loadUsers()
}

// Modal Actions
function openCreateModal(): void {
  if (schools.value.length === 0) loadAcademic()
  modalMode.value = 'create'
  editingUserId.value = null
  form.value = {
    displayName: '',
    email: '',
    role:
      selectedRole.value !== 'all'
        ? (selectedRole.value as RoleKey)
        : 'internshipStaff',
    studentId: '',
    schoolId: '',
    programId: '',
    status: 'active'
  }
  isModalOpen.value = true
}

function openEditModal(user: UserItem): void {
  if (schools.value.length === 0) loadAcademic()
  modalMode.value = 'edit'
  editingUserId.value = user.id
  const role = getPrimaryRole(user)
  const schoolId = user.roleAssignments?.[0]?.schoolIds?.[0] || ''
  const programId = user.roleAssignments?.[0]?.programIds?.[0] || ''

  form.value = {
    displayName: user.displayName,
    email: user.email,
    role,
    studentId: user.studentId || '',
    schoolId,
    programId,
    status: user.status === 'suspended' ? 'suspended' : 'active'
  }
  isModalOpen.value = true
}

async function submitForm(): Promise<void> {
  if (!form.value.displayName.trim() || !form.value.email.trim()) {
    toast.add({
      title: 'กรุณากรอกข้อมูลให้ครบถ้วน',
      description: 'ชื่อ-นามสกุล และ อีเมล จำเป็นต้องระบุ',
      color: 'warning'
    })
    return
  }

  if (form.value.role === 'student' && !form.value.studentId.trim()) {
    toast.add({
      title: 'กรุณาระบุรหัสนักศึกษา',
      description: 'สำหรับบทบาทนักศึกษา จำเป็นต้องมีรหัสประจำตัว',
      color: 'warning'
    })
    return
  }

  submitting.value = true
  try {
    const payload: Record<string, unknown> = {
      displayName: form.value.displayName.trim(),
      email: form.value.email.trim(),
      role: form.value.role,
      status: form.value.status,
      studentId:
        form.value.role === 'student' ? form.value.studentId.trim() : undefined,
      schoolIds: form.value.schoolId ? [form.value.schoolId] : [],
      programIds: form.value.programId ? [form.value.programId] : []
    }

    if (modalMode.value === 'create') {
      await api('/users', {
        method: 'POST',
        body: payload
      })
      toast.add({
        title: 'สร้างผู้ใช้สำเร็จ',
        description: `เพิ่ม ${form.value.displayName} เข้าสู่ระบบแล้ว`,
        color: 'success'
      })
    } else if (editingUserId.value) {
      await api(`/users/${editingUserId.value}`, {
        method: 'PATCH',
        body: payload
      })
      toast.add({
        title: 'บันทึกสำเร็จ',
        description: `แก้ไขข้อมูล ${form.value.displayName} เรียบร้อยแล้ว`,
        color: 'success'
      })
    }

    isModalOpen.value = false
    await Promise.all([loadUsers(), loadSummary()])
  } catch (err: unknown) {
    const msg =
      err instanceof Error ? err.message : 'เกิดข้อผิดพลาดในการบันทึกข้อมูล'
    toast.add({
      title: 'ไม่สามารถบันทึกได้',
      description: msg,
      color: 'error'
    })
  } finally {
    submitting.value = false
  }
}

async function toggleUserStatus(user: UserItem): Promise<void> {
  const nextStatus = user.status === 'active' ? 'suspended' : 'active'
  const actionLabel = nextStatus === 'active' ? 'เปิดใช้งาน' : 'ระงับการใช้งาน'

  try {
    await api(`/users/${user.id}`, {
      method: 'PATCH',
      body: { status: nextStatus }
    })
    toast.add({
      title: `${actionLabel}สำเร็จ`,
      description: `ผู้ใช้งาน ${user.displayName} ถูก${actionLabel}แล้ว`,
      color: 'success'
    })
    await Promise.all([loadUsers(), loadSummary()])
  } catch {
    toast.add({
      title: 'ข้อผิดพลาด',
      description: `ไม่สามารถ${actionLabel}ได้`,
      color: 'error'
    })
  }
}

// Dev switch persona shortcut
async function switchPersona(user: UserItem): Promise<void> {
  const role = getPrimaryRole(user)
  try {
    await auth.devLogin(role, {
      displayName: user.displayName,
      email: user.email,
      studentId: user.studentId,
      schoolIds: user.roleAssignments?.[0]?.schoolIds as string[],
      programIds: user.roleAssignments?.[0]?.programIds as string[]
    })
    toast.add({
      title: 'สลับสวมบทบาทสำเร็จ',
      description: `เข้าใช้งานในฐานะ: ${user.displayName} (${roleBadgeMap[role]?.label || role})`,
      color: 'success'
    })
    navigateTo('/app')
  } catch (err) {
    console.error('Failed to switch persona:', err)
    toast.add({
      title: 'ไม่สามารถสลับบทบาทได้',
      description: 'ระบบรองรับการสลับบทบาทเฉพาะในสภาพแวดล้อม Development',
      color: 'error'
    })
  }
}

function getUserActions(user: UserItem) {
  const actions: Array<
    Array<{
      label: string
      icon: string
      color?: 'error' | 'primary' | 'warning' | 'neutral'
      onSelect: () => void
    }>
  > = []

  const primaryGroup: Array<{
    label: string
    icon: string
    color?: 'error' | 'primary' | 'warning' | 'neutral'
    onSelect: () => void
  }> = []

  if (isDev.value) {
    primaryGroup.push({
      label: 'สลับสวมบทบาท (Dev Persona)',
      icon: 'i-lucide-log-in',
      onSelect: () => switchPersona(user)
    })
  }

  primaryGroup.push({
    label: 'แก้ไขข้อมูลผู้ใช้งาน',
    icon: 'i-lucide-pencil',
    onSelect: () => openEditModal(user)
  })

  actions.push(primaryGroup)

  actions.push([
    {
      label:
        user.status === 'active' ? 'ระงับการใช้งานบัญชี' : 'เปิดใช้งานบัญชี',
      icon:
        user.status === 'active' ? 'i-lucide-user-x' : 'i-lucide-user-check',
      color: user.status === 'active' ? 'error' : 'neutral',
      onSelect: () => toggleUserStatus(user)
    }
  ])

  return actions
}

onMounted(() => {
  loadSummary()
  loadAcademic()
  loadUsers()
})
</script>

<template>
  <div class="space-y-6">
    <!-- Header with Action -->
    <div
      class="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between"
    >
      <div>
        <div class="flex items-center gap-2">
          <UIcon class="size-6 text-primary" name="i-lucide-users" />
          <h1
            class="font-heading text-2xl font-bold tracking-tight text-highlighted sm:text-3xl"
          >
            จัดการผู้ใช้งานระบบ (User Manager)
          </h1>
        </div>
        <p class="mt-1 text-sm text-muted">
          กำหนดสิทธิ์การเข้าใช้งาน บัญชีบุคลากร อาจารย์ที่ปรึกษา
          และนักศึกษาฝึกงาน
        </p>
      </div>

      <div class="flex items-center gap-2.5">
        <UButton
          color="neutral"
          icon="i-lucide-refresh-cw"
          size="sm"
          variant="outline"
          :loading="loading"
          @click="
            () => {
              loadUsers()
              loadSummary()
            }
          "
        >
          รีเฟรช
        </UButton>
        <UButton
          color="primary"
          icon="i-lucide-user-plus"
          size="sm"
          @click="openCreateModal"
        >
          เพิ่มผู้ใช้งานใหม่
        </UButton>
      </div>
    </div>

    <!-- Metric Stat Cards -->
    <div class="grid grid-cols-2 gap-3 sm:grid-cols-4">
      <div
        class="mfu-surface flex cursor-pointer items-center justify-between rounded-xl border p-4 transition-all hover:border-primary"
        :class="{ 'ring-2 ring-primary': selectedRole === 'all' }"
        @click="selectTab('all')"
      >
        <div>
          <p class="text-xs font-medium text-muted">ผู้ใช้งานทั้งหมด</p>
          <p class="font-heading mt-1 text-2xl font-bold text-highlighted">
            {{ summary.total }}
          </p>
        </div>
        <div
          class="flex size-10 items-center justify-center rounded-lg bg-primary/10 text-primary"
        >
          <UIcon class="size-5" name="i-lucide-users" />
        </div>
      </div>

      <div
        class="mfu-surface flex cursor-pointer items-center justify-between rounded-xl border p-4 transition-all hover:border-warning"
        :class="{ 'ring-2 ring-warning': selectedRole === 'internshipStaff' }"
        @click="selectTab('internshipStaff')"
      >
        <div>
          <p class="text-xs font-medium text-muted">เจ้าหน้าที่ฝึกงาน</p>
          <p
            class="font-heading mt-1 text-2xl font-bold text-warning-600 dark:text-warning-400"
          >
            {{ summary.internshipStaff }}
          </p>
        </div>
        <div
          class="flex size-10 items-center justify-center rounded-lg bg-warning/10 text-warning-600 dark:text-warning-400"
        >
          <UIcon class="size-5" name="i-lucide-briefcase" />
        </div>
      </div>

      <div
        class="mfu-surface flex cursor-pointer items-center justify-between rounded-xl border p-4 transition-all hover:border-info"
        :class="{ 'ring-2 ring-info': selectedRole === 'coordinator' }"
        @click="selectTab('coordinator')"
      >
        <div>
          <p class="text-xs font-medium text-muted">อาจารย์ที่ปรึกษา</p>
          <p
            class="font-heading mt-1 text-2xl font-bold text-info-600 dark:text-info-400"
          >
            {{ summary.coordinator }}
          </p>
        </div>
        <div
          class="flex size-10 items-center justify-center rounded-lg bg-info/10 text-info-600 dark:text-info-400"
        >
          <UIcon class="size-5" name="i-lucide-user-check" />
        </div>
      </div>

      <div
        class="mfu-surface flex cursor-pointer items-center justify-between rounded-xl border p-4 transition-all hover:border-success"
        :class="{ 'ring-2 ring-success': selectedRole === 'student' }"
        @click="selectTab('student')"
      >
        <div>
          <p class="text-xs font-medium text-muted">นักศึกษา</p>
          <p
            class="font-heading mt-1 text-2xl font-bold text-success-600 dark:text-success-400"
          >
            {{ summary.student }}
          </p>
        </div>
        <div
          class="flex size-10 items-center justify-center rounded-lg bg-success/10 text-success-600 dark:text-success-400"
        >
          <UIcon class="size-5" name="i-lucide-graduation-cap" />
        </div>
      </div>
    </div>

    <!-- 2. แถบตัวกรอง (Multi-dimensional Filter Bar) -->
    <div
      class="rounded-xl border border-default bg-default p-4 shadow-sm space-y-3"
    >
      <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
        <!-- 2.1 ค้นหาผู้ใช้งาน -->
        <div class="space-y-1">
          <label
            class="text-xs font-semibold text-muted flex items-center gap-1.5"
          >
            <UIcon name="i-lucide-search" class="size-3.5 text-primary" />
            ค้นหาผู้ใช้งาน (Search)
          </label>
          <div class="relative">
            <input
              v-model="search"
              type="text"
              placeholder="ชื่อ, อีเมล, รหัสนักศึกษา..."
              class="w-full rounded-lg border border-default bg-default pl-8 pr-8 py-2 text-xs text-highlighted focus:outline-none focus:ring-1 focus:ring-primary placeholder:text-muted/70"
              @input="onSearchInput"
            />
            <UIcon
              name="i-lucide-search"
              class="absolute left-2.5 top-2.5 size-3.5 text-muted pointer-events-none"
            />
            <button
              v-if="search"
              type="button"
              class="absolute right-2 top-2 text-muted hover:text-highlighted cursor-pointer"
              @click="
                () => {
                  search = ''
                  loadUsers()
                }
              "
            >
              <UIcon name="i-lucide-x" class="size-3.5" />
            </button>
          </div>
        </div>

        <!-- 2.2 บทบาทผู้ใช้งาน -->
        <div class="space-y-1">
          <label
            class="text-xs font-semibold text-muted flex items-center gap-1.5"
          >
            <UIcon name="i-lucide-shield" class="size-3.5 text-primary" />
            บทบาทผู้ใช้งาน (Role)
          </label>
          <select
            v-model="selectedRole"
            class="w-full rounded-lg border border-default bg-default px-3 py-2 text-xs text-highlighted focus:outline-none focus:ring-1 focus:ring-primary cursor-pointer"
          >
            <option value="all">ทุกบทบาท (All Roles)</option>
            <option value="internshipStaff">
              💼 เจ้าหน้าที่ฝึกงาน (Internship Staff)
            </option>
            <option value="coordinator">🧑‍🏫 อาจารย์ที่ปรึกษา (Advisor)</option>
            <option value="student">🎓 นักศึกษา (Student)</option>
            <option value="systemAdmin">🛡️ ผู้ดูแลระบบ (System Admin)</option>
          </select>
        </div>

        <!-- 2.3 สำนักวิชา -->
        <div class="space-y-1">
          <label
            class="text-xs font-semibold text-muted flex items-center gap-1.5"
          >
            <UIcon name="i-lucide-school" class="size-3.5 text-primary" />
            สำนักวิชาที่สังกัด (School)
          </label>
          <select
            v-model="selectedSchool"
            class="w-full rounded-lg border border-default bg-default px-3 py-2 text-xs text-highlighted focus:outline-none focus:ring-1 focus:ring-primary truncate cursor-pointer"
          >
            <option value="all">ทุกสำนักวิชา (All Schools)</option>
            <option v-for="s in schools" :key="s.id" :value="s.id">
              {{ s.name.th || s.name.en }}
              {{ s.schoolCode ? `(${s.schoolCode})` : '' }}
            </option>
          </select>
        </div>

        <!-- 2.4 สถานะบัญชี -->
        <div class="space-y-1">
          <label
            class="text-xs font-semibold text-muted flex items-center gap-1.5"
          >
            <UIcon name="i-lucide-activity" class="size-3.5 text-primary" />
            สถานะบัญชี (Status)
          </label>
          <select
            v-model="selectedStatus"
            class="w-full rounded-lg border border-default bg-default px-3 py-2 text-xs text-highlighted focus:outline-none focus:ring-1 focus:ring-primary cursor-pointer"
          >
            <option value="all">ทุกสถานะ (All Statuses)</option>
            <option value="active">🟢 ใช้งานปกติ (Active)</option>
            <option value="suspended">🔴 ระงับการใช้งาน (Suspended)</option>
          </select>
        </div>
      </div>

      <!-- สรุปตัวกรองและปุ่มล้างตัวกรอง -->
      <div
        v-if="
          search ||
          selectedRole !== 'all' ||
          selectedSchool !== 'all' ||
          selectedStatus !== 'all'
        "
        class="flex flex-wrap items-center justify-between border-t border-default/60 pt-2.5 text-xs gap-2"
      >
        <div class="flex items-center gap-2 text-muted">
          <UIcon name="i-lucide-filter" class="size-3.5 text-primary" />
          <span
            >ผลการกรอง: พบ
            <strong class="text-highlighted">{{ totalUsers }}</strong> คน</span
          >
        </div>
        <button
          type="button"
          class="flex items-center gap-1 text-xs text-primary hover:underline font-medium cursor-pointer"
          @click="resetFilters"
        >
          <UIcon name="i-lucide-rotate-ccw" class="size-3" />
          ล้างตัวกรองทั้งหมด
        </button>
      </div>
    </div>

    <!-- 3. Main Content Panel (Table) -->
    <div
      class="rounded-xl border border-default bg-default overflow-hidden shadow-sm"
    >
      <!-- Role Filter Tabs Header -->
      <div
        class="flex flex-wrap items-center justify-between gap-2 border-b border-default px-4 py-2.5 sm:px-6 bg-muted/20"
      >
        <div class="flex flex-wrap items-center gap-1.5">
          <button
            v-for="tab in roleTabs"
            :key="tab.key"
            type="button"
            class="flex items-center gap-2 rounded-lg px-3 py-1.5 text-xs font-medium transition-all cursor-pointer"
            :class="[
              selectedRole === tab.key
                ? 'bg-primary text-inverted shadow-xs font-semibold'
                : 'text-muted hover:bg-muted/60 hover:text-highlighted'
            ]"
            @click="selectTab(tab.key)"
          >
            <UIcon class="size-3.5" :name="tab.icon" />
            <span>{{ tab.label }}</span>
            <span
              v-if="tab.key !== 'all'"
              class="rounded-full px-1.5 py-0.2 text-[10px] font-mono"
              :class="
                selectedRole === tab.key
                  ? 'bg-inverted/20 text-inverted'
                  : 'bg-muted text-muted-foreground'
              "
            >
              {{ summary[tab.key as keyof UserSummary] || 0 }}
            </span>
          </button>
        </div>

        <span class="text-xs text-muted hidden sm:inline">
          แสดง
          <strong class="text-highlighted font-semibold">{{
            users.length
          }}</strong>
          จาก {{ totalUsers }} คน
        </span>
      </div>

      <!-- Data Table -->
      <div class="overflow-x-auto">
        <table class="w-full text-left text-xs">
          <thead
            class="border-b border-default bg-muted/40 font-semibold text-highlighted"
          >
            <tr>
              <th scope="col" class="py-3 px-4 w-12 text-center">#</th>
              <th scope="col" class="py-3 px-4 min-w-[220px]">ผู้ใช้งาน</th>
              <th scope="col" class="py-3 px-4 min-w-[160px]">บทบาท</th>
              <th scope="col" class="py-3 px-4 min-w-[200px]">
                สังกัด / สำนักวิชา
              </th>
              <th scope="col" class="py-3 px-4 min-w-[120px] text-center">
                สถานะ
              </th>
              <th scope="col" class="py-3 px-4 w-20 text-right">จัดการ</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-default">
            <tr v-if="loading" class="animate-pulse">
              <td class="py-12 text-center text-muted" colspan="6">
                <UIcon
                  class="size-6 animate-spin text-primary mx-auto"
                  name="i-lucide-loader-2"
                />
                <p class="mt-2 text-xs">กำลังโหลดข้อมูลผู้ใช้งาน...</p>
              </td>
            </tr>

            <tr
              v-else-if="users.length === 0"
              class="text-center py-12 text-muted"
            >
              <td colspan="6" class="py-12">
                <div class="flex flex-col items-center justify-center gap-2">
                  <UIcon name="i-lucide-search-x" class="size-8 text-muted" />
                  <p class="text-sm font-semibold text-highlighted">
                    ไม่พบผู้ใช้งานที่ตรงตามเงื่อนไข
                  </p>
                  <p class="text-xs text-muted">
                    ลองปรับเปลี่ยนคำค้นหา หรือตัวกรองบทบาท
                  </p>
                  <div class="flex items-center gap-2 mt-2">
                    <UButton
                      color="neutral"
                      label="ล้างตัวกรองทั้งหมด"
                      size="xs"
                      variant="subtle"
                      @click="resetFilters"
                    />
                    <UButton
                      color="primary"
                      label="เพิ่มผู้ใช้งานใหม่"
                      size="xs"
                      variant="solid"
                      icon="i-lucide-plus"
                      @click="openCreateModal"
                    />
                  </div>
                </div>
              </td>
            </tr>

            <tr
              v-for="(user, index) in users"
              v-else
              :key="user.id"
              class="hover:bg-muted/30 transition-colors group"
            >
              <!-- 1. ลำดับ -->
              <td class="py-3 px-4 text-center font-mono text-xs text-muted">
                {{ (page - 1) * pageSize + index + 1 }}
              </td>

              <!-- 2. ข้อมูลผู้ใช้งาน -->
              <td class="py-3 px-4">
                <div class="flex items-center gap-3">
                  <div
                    class="flex size-9 shrink-0 items-center justify-center rounded-full font-bold text-white shadow-2xs text-xs ring-1 ring-default/20"
                    :class="[
                      getPrimaryRole(user) === 'systemAdmin'
                        ? 'bg-rose-600 dark:bg-rose-500'
                        : getPrimaryRole(user) === 'internshipStaff'
                          ? 'bg-amber-600 dark:bg-amber-500'
                          : getPrimaryRole(user) === 'coordinator'
                            ? 'bg-sky-600 dark:bg-sky-500'
                            : 'bg-emerald-600 dark:bg-emerald-500'
                    ]"
                  >
                    {{ user.displayName.slice(0, 1).toUpperCase() }}
                  </div>
                  <div class="space-y-0.5 min-w-0">
                    <div class="flex items-center gap-1.5 flex-wrap">
                      <span class="font-semibold text-highlighted text-xs">{{
                        user.displayName
                      }}</span>
                      <UBadge
                        v-if="user.studentId"
                        class="font-mono text-[10px]"
                        color="neutral"
                        size="xs"
                        variant="subtle"
                      >
                        {{ user.studentId }}
                      </UBadge>
                    </div>
                    <p
                      class="text-[11px] text-muted font-mono truncate max-w-[240px]"
                    >
                      {{ user.email }}
                    </p>
                  </div>
                </div>
              </td>

              <!-- 3. บทบาท -->
              <td class="py-3 px-4">
                <UBadge
                  class="gap-1.5 px-2.5 py-1 text-xs font-medium inline-flex items-center"
                  :color="
                    roleBadgeMap[getPrimaryRole(user)]?.color || 'neutral'
                  "
                  size="xs"
                  variant="subtle"
                >
                  <UIcon
                    class="size-3.5"
                    :name="
                      roleBadgeMap[getPrimaryRole(user)]?.icon ||
                      'i-lucide-user'
                    "
                  />
                  <span>{{
                    roleBadgeMap[getPrimaryRole(user)]?.label ||
                    getPrimaryRole(user)
                  }}</span>
                </UBadge>
              </td>

              <!-- 4. สังกัด / สำนักวิชา -->
              <td class="py-3 px-4">
                <div v-if="user.roleAssignments?.[0]?.tenant" class="text-xs">
                  <UBadge
                    color="neutral"
                    size="xs"
                    variant="subtle"
                    class="inline-flex items-center gap-1 text-[11px]"
                  >
                    <UIcon
                      class="size-3 text-secondary"
                      name="i-lucide-globe"
                    />
                    ทั้งมหาวิทยาลัย (All Campus)
                  </UBadge>
                </div>
                <div
                  v-else-if="user.roleAssignments?.[0]?.schoolIds?.[0]"
                  class="space-y-0.5"
                >
                  <p class="text-xs font-medium text-highlighted leading-snug">
                    {{
                      getSchoolName(user.roleAssignments?.[0]?.schoolIds?.[0])
                    }}
                  </p>
                  <p
                    v-if="user.roleAssignments?.[0]?.programIds?.[0]"
                    class="text-[11px] text-muted leading-snug"
                  >
                    {{
                      getProgramName(user.roleAssignments?.[0]?.programIds?.[0])
                    }}
                  </p>
                </div>
                <span v-else class="text-xs text-muted">-</span>
              </td>

              <!-- 5. สถานะ -->
              <td class="py-3 px-4 text-center">
                <UBadge
                  class="cursor-pointer text-[11px] font-medium inline-flex items-center gap-1.5 hover:opacity-80 transition-opacity"
                  :color="user.status === 'active' ? 'success' : 'error'"
                  size="xs"
                  variant="subtle"
                  title="คลิกเพื่อสลับสถานะการใช้งาน"
                  @click="toggleUserStatus(user)"
                >
                  <span
                    class="size-1.5 rounded-full"
                    :class="
                      user.status === 'active' ? 'bg-success' : 'bg-error'
                    "
                  />
                  <span>{{
                    user.status === 'active' ? 'ใช้งานปกติ' : 'ระงับการใช้งาน'
                  }}</span>
                </UBadge>
              </td>

              <!-- 6. จัดการ -->
              <td class="py-3 px-4 text-right" @click.stop>
                <div class="flex items-center justify-end gap-1">
                  <!-- Quick Switch Persona for Dev mode -->
                  <UButton
                    v-if="isDev"
                    color="neutral"
                    icon="i-lucide-log-in"
                    size="xs"
                    title="สลับสวมบทบาท (Dev Persona)"
                    variant="ghost"
                    class="hidden sm:inline-flex cursor-pointer"
                    @click="switchPersona(user)"
                  />

                  <!-- Quick Edit -->
                  <UButton
                    color="neutral"
                    icon="i-lucide-pencil"
                    size="xs"
                    title="แก้ไขข้อมูล"
                    variant="ghost"
                    class="hidden sm:inline-flex cursor-pointer"
                    @click="openEditModal(user)"
                  />

                  <!-- 3 dots dropdown menu -->
                  <UDropdownMenu
                    :items="getUserActions(user)"
                    :content="{ align: 'end' }"
                  >
                    <UButton
                      aria-label="การจัดการผู้ใช้งาน"
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

      <!-- Pagination -->
      <AppPagination
        v-if="totalUsers > 0"
        v-model:page="page"
        v-model:page-size="pageSize"
        items-name="คน"
        :page-size-options="[5, 10, 20, 50]"
        :total="totalUsers"
      />
    </div>

    <!-- Create / Edit User Modal -->
    <UModal
      v-model:open="isModalOpen"
      :title="
        modalMode === 'create'
          ? 'เพิ่มผู้ใช้งานระบบใหม่'
          : 'แก้ไขข้อมูลผู้ใช้งาน'
      "
      :ui="{ content: 'sm:max-w-xl md:max-w-2xl w-full' }"
    >
      <template #body>
        <form class="space-y-4" @submit.prevent="submitForm">
          <!-- Role Selector -->
          <div>
            <label class="mb-1.5 block text-xs font-semibold text-highlighted"
              >บทบาทผู้ใช้งาน (Role) *</label
            >
            <div class="grid grid-cols-2 gap-2 sm:grid-cols-4">
              <button
                v-for="r in [
                  'internshipStaff',
                  'coordinator',
                  'student',
                  'systemAdmin'
                ] as const"
                :key="r"
                type="button"
                class="flex flex-col items-center gap-1.5 rounded-lg border p-2.5 text-center text-xs transition-all"
                :class="[
                  form.role === r
                    ? 'border-primary bg-primary/5 font-semibold text-primary ring-1 ring-primary'
                    : 'border-neutral-200 text-muted hover:border-neutral-300 dark:border-neutral-700'
                ]"
                @click="form.role = r"
              >
                <UIcon class="size-5" :name="roleBadgeMap[r].icon" />
                <span class="text-[11px]">{{
                  roleBadgeMap[r].label.split(' ')[0]
                }}</span>
              </button>
            </div>
          </div>

          <!-- Display Name -->
          <div>
            <label class="mb-1 block text-xs font-semibold text-highlighted"
              >ชื่อ-นามสกุล *</label
            >
            <UInput
              v-model="form.displayName"
              class="w-full"
              placeholder="เช่น เจ้าหน้าที่ฝึกงาน (Internship Staff) หรือ ดร.สมชาย"
              size="md"
            />
          </div>

          <!-- Email -->
          <div>
            <label class="mb-1 block text-xs font-semibold text-highlighted"
              >อีเมลสถาบัน (Email) *</label
            >
            <UInput
              v-model="form.email"
              class="w-full"
              placeholder="เช่น staff@mfu.ac.th หรือ student@lamduan.mfu.ac.th"
              size="md"
              type="email"
            />
          </div>

          <!-- Student ID (shown only for student role) -->
          <div v-if="form.role === 'student'">
            <label class="mb-1 block text-xs font-semibold text-highlighted"
              >รหัสนักศึกษา (Student ID) *</label
            >
            <UInput
              v-model="form.studentId"
              class="w-full"
              maxlength="15"
              placeholder="เช่น 6531501009"
              size="md"
            />
          </div>

          <!-- School Selection -->
          <div v-if="form.role !== 'systemAdmin'">
            <label class="mb-1.5 block text-xs font-semibold text-highlighted"
              >สำนักวิชาที่สังกัด</label
            >
            <select
              v-model="form.schoolId"
              class="w-full rounded-lg border border-neutral-300 bg-white px-3.5 py-2.5 text-xs text-highlighted shadow-sm transition-colors focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary dark:border-neutral-700 dark:bg-neutral-900 sm:text-sm"
            >
              <option value="">-- ไม่ระบุ หรือ ทั่วทั้งระบบ --</option>
              <option v-for="s in schools" :key="s.id" :value="s.id">
                {{ s.name.th || s.name.en }} ({{ s.schoolCode }})
              </option>
            </select>
          </div>

          <!-- Program Selection -->
          <div v-if="form.role !== 'systemAdmin' && form.schoolId">
            <label class="mb-1.5 block text-xs font-semibold text-highlighted"
              >สาขาวิชา / หลักสูตร</label
            >
            <select
              v-model="form.programId"
              class="w-full rounded-lg border border-neutral-300 bg-white px-3.5 py-2.5 text-xs text-highlighted shadow-sm transition-colors focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary dark:border-neutral-700 dark:bg-neutral-900 sm:text-sm"
            >
              <option value="">-- ทุกสาขาวิชาในสำนัก --</option>
              <option
                v-for="p in filteredProgramsForForm"
                :key="p.id"
                :value="p.id"
              >
                {{ p.name.th || p.name.en }} ({{ p.programCode }})
              </option>
            </select>
          </div>

          <!-- Status Selection -->
          <div>
            <label class="mb-1 block text-xs font-semibold text-highlighted"
              >สถานะบัญชี</label
            >
            <div class="flex gap-4">
              <label class="flex cursor-pointer items-center gap-2 text-xs">
                <input v-model="form.status" type="radio" value="active" />
                <span class="text-success-600 dark:text-success-400"
                  >ใช้งานปกติ (Active)</span
                >
              </label>
              <label class="flex cursor-pointer items-center gap-2 text-xs">
                <input v-model="form.status" type="radio" value="suspended" />
                <span class="text-error-600 dark:text-error-400"
                  >ระงับชั่วคราว (Suspended)</span
                >
              </label>
            </div>
          </div>
        </form>
      </template>

      <template #footer>
        <div class="flex justify-end gap-2">
          <UButton
            color="neutral"
            size="sm"
            variant="outline"
            @click="isModalOpen = false"
          >
            ยกเลิก
          </UButton>
          <UButton
            color="primary"
            :loading="submitting"
            size="sm"
            @click="submitForm"
          >
            {{ modalMode === 'create' ? 'เพิ่มผู้ใช้งาน' : 'บันทึกการแก้ไข' }}
          </UButton>
        </div>
      </template>
    </UModal>
  </div>
</template>
