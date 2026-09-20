<script setup lang="ts">
definePageMeta({ layout: 'app', middleware: 'auth' })

interface Province {
  id: string
  code: string
  nameTh: string
  nameEn: string
  region: string
  status: 'active' | 'inactive'
  isCustom?: boolean
  createdAt?: string
  updatedAt?: string
}

interface GeneralConfig {
  institutionNameTh: string
  institutionNameEn: string
  departmentName: string
  defaultInternshipHours: number
  currentAcademicYear: number
  currentSemester: string
  contactEmail: string
  contactPhone: string
  companyTypes: string[]
}

const api = useApi()
const toast = useToast()

// Tabs
const activeTab = ref<'provinces' | 'companyTypes'>('provinces')

// Filters for Provinces
const search = ref('')
const selectedRegion = ref('all')
const selectedStatus = ref('all')

const REGIONS = [
  'ภาคเหนือ',
  'ภาคกลาง',
  'ภาคตะวันออกเฉียงเหนือ',
  'ภาคใต้',
  'ภาคตะวันออก',
  'ภาคตะวันตก'
] as const

interface ProvinceResponse {
  items: Province[]
  total: number
  stats?: {
    total: number
    active: number
    inactive: number
  }
}

// Fetch provinces
const {
  data: provincesData,
  pending: provincesPending,
  refresh: refreshProvinces
} = await useAsyncData(
  'settings-provinces',
  () =>
    api<ProvinceResponse>('/system-settings/provinces', {
      query: {
        search: search.value || undefined,
        region:
          selectedRegion.value !== 'all' ? selectedRegion.value : undefined,
        status:
          selectedStatus.value !== 'all' ? selectedStatus.value : undefined
      }
    }).catch((): ProvinceResponse => ({ items: [], total: 0 })),
  { watch: [selectedRegion, selectedStatus] }
)

// Fetch general config
const { data: configData, refresh: refreshConfig } = await useAsyncData(
  'settings-general-config',
  () => api<GeneralConfig>('/system-settings/general').catch(() => null)
)

// Province stats computed
const totalProvinces = computed(
  () =>
    provincesData.value?.stats?.total ?? provincesData.value?.items?.length ?? 0
)
const activeProvincesCount = computed(
  () =>
    provincesData.value?.stats?.active ??
    provincesData.value?.items?.filter((p) => p.status === 'active').length ??
    0
)
const inactiveProvincesCount = computed(
  () =>
    provincesData.value?.stats?.inactive ??
    provincesData.value?.items?.filter((p) => p.status === 'inactive').length ??
    0
)

// Pagination (Configurable: 5, 10, 15, 20 items per page)
const page = ref(1)
const pageSize = ref(5)
const paginatedProvinces = computed(() => {
  const items = provincesData.value?.items ?? []
  const start = (page.value - 1) * pageSize.value
  return items.slice(start, start + pageSize.value)
})

watch([selectedRegion, selectedStatus, search, pageSize], () => {
  page.value = 1
})

function getRegionBadgeColor(
  region: string
):
  | 'primary'
  | 'secondary'
  | 'success'
  | 'info'
  | 'warning'
  | 'error'
  | 'neutral' {
  switch (region) {
    case 'ภาคเหนือ':
      return 'info'
    case 'ภาคกลาง':
      return 'primary'
    case 'ภาคตะวันออกเฉียงเหนือ':
      return 'warning'
    case 'ภาคใต้':
      return 'success'
    case 'ภาคตะวันออก':
      return 'secondary'
    case 'ภาคตะวันตก':
      return 'neutral'
    default:
      return 'neutral'
  }
}

// Modal: Create / Edit Province
const isProvinceModalOpen = ref(false)
const isSubmittingProvince = ref(false)
const editingProvinceId = ref<string | null>(null)

const provinceForm = ref({
  code: '',
  nameTh: '',
  nameEn: '',
  region: 'ภาคเหนือ',
  status: 'active' as 'active' | 'inactive'
})

function openCreateProvinceModal() {
  editingProvinceId.value = null
  provinceForm.value = {
    code: '',
    nameTh: '',
    nameEn: '',
    region: 'ภาคเหนือ',
    status: 'active'
  }
  isProvinceModalOpen.value = true
}

function openEditProvinceModal(p: Province) {
  editingProvinceId.value = p.id
  provinceForm.value = {
    code: p.code,
    nameTh: p.nameTh,
    nameEn: p.nameEn,
    region: p.region,
    status: p.status
  }
  isProvinceModalOpen.value = true
}

async function handleSaveProvince() {
  if (
    !provinceForm.value.code.trim() ||
    !provinceForm.value.nameTh.trim() ||
    !provinceForm.value.nameEn.trim()
  ) {
    toast.add({
      title: 'กรุณากรอกข้อมูลให้ครบถ้วน',
      description: 'โปรดระบุรหัสจังหวัด, ชื่อภาษาไทย และชื่อภาษาอังกฤษ',
      color: 'error'
    })
    return
  }

  isSubmittingProvince.value = true
  try {
    if (editingProvinceId.value) {
      await api(`/system-settings/provinces/${editingProvinceId.value}`, {
        method: 'PATCH',
        body: provinceForm.value
      })
      toast.add({
        title: 'แก้ไขข้อมูลสำเร็จ',
        description: `อัปเดตข้อมูลจังหวัด ${provinceForm.value.nameTh} เรียบร้อยแล้ว`,
        color: 'success'
      })
    } else {
      await api('/system-settings/provinces', {
        method: 'POST',
        body: provinceForm.value
      })
      toast.add({
        title: 'เพิ่มจังหวัดสำเร็จ',
        description: `เพิ่มจังหวัด ${provinceForm.value.nameTh} เข้าสู่ระบบแล้ว`,
        color: 'success'
      })
    }

    isProvinceModalOpen.value = false
    await refreshProvinces()
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'เกิดข้อผิดพลาดในการบันทึก'
    toast.add({
      title: 'บันทึกไม่สำเร็จ',
      description: msg,
      color: 'error'
    })
  } finally {
    isSubmittingProvince.value = false
  }
}

async function toggleProvinceStatus(province: Province) {
  const newStatus = province.status === 'active' ? 'inactive' : 'active'
  try {
    await api(`/system-settings/provinces/${province.id}`, {
      method: 'PATCH',
      body: { status: newStatus }
    })
    toast.add({
      title: 'เปลี่ยนสถานะสำเร็จ',
      description: `จังหวัด ${province.nameTh} เปลี่ยนเป็น ${newStatus === 'active' ? 'เปิดใช้งาน' : 'ระงับการใช้งาน'}`,
      color: 'success'
    })
    await refreshProvinces()
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'ไม่สามารถเปลี่ยนสถานะได้'
    toast.add({
      title: 'เกิดข้อผิดพลาด',
      description: msg,
      color: 'error'
    })
  }
}

async function handleDeleteProvince(province: Province) {
  if (
    !confirm(
      `คุณต้องการลบข้อมูลจังหวัด "${province.nameTh}" ออกจากระบบใช่หรือไม่?`
    )
  ) {
    return
  }

  try {
    await api(`/system-settings/provinces/${province.id}`, {
      method: 'DELETE'
    })
    toast.add({
      title: 'ลบข้อมูลสำเร็จ',
      description: `ลบจังหวัด ${province.nameTh} เรียบร้อยแล้ว`,
      color: 'success'
    })
    await refreshProvinces()
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'ไม่สามารถลบข้อมูลได้'
    toast.add({
      title: 'ลบไม่สำเร็จ',
      description: msg,
      color: 'error'
    })
  }
}

// Reset 77 Provinces
const isResetting = ref(false)
async function handleResetProvinces() {
  if (
    !confirm(
      'คุณต้องการรีเซ็ตข้อมูลจังหวัดทั้งหมดกลับเป็น 77 จังหวัดมาตรฐานของประเทศไทยใช่หรือไม่?'
    )
  ) {
    return
  }

  isResetting.value = true
  try {
    await api('/system-settings/provinces/reset', { method: 'POST' })
    toast.add({
      title: 'รีเซ็ตข้อมูลสำเร็จ',
      description: 'กู้คืนข้อมูล 77 จังหวัดมาตรฐานของประเทศไทยเรียบร้อยแล้ว',
      color: 'success'
    })
    await refreshProvinces()
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'ไม่สามารถรีเซ็ตได้'
    toast.add({
      title: 'รีเซ็ตไม่สำเร็จ',
      description: msg,
      color: 'error'
    })
  } finally {
    isResetting.value = false
  }
}

// Company Types State
const newCompanyType = ref('')
const companyTypesList = ref<string[]>([])

watchEffect(() => {
  if (configData.value?.companyTypes) {
    companyTypesList.value = [...configData.value.companyTypes]
  }
})

function addCompanyType() {
  const val = newCompanyType.value.trim()
  if (!val) return
  if (companyTypesList.value.includes(val)) {
    toast.add({
      title: 'มีรายการนี้อยู่แล้ว',
      description: `"${val}" มีอยู่ในรายการแล้ว`,
      color: 'warning'
    })
    return
  }
  companyTypesList.value.push(val)
  newCompanyType.value = ''
}

function removeCompanyType(idx: number) {
  companyTypesList.value.splice(idx, 1)
}

const isSavingCompanyTypes = ref(false)
async function handleSaveCompanyTypes() {
  isSavingCompanyTypes.value = true
  try {
    await api('/system-settings/general', {
      method: 'PUT',
      body: {
        companyTypes: companyTypesList.value
      }
    })
    toast.add({
      title: 'บันทึกประเภทสถานประกอบการสำเร็จ',
      description: 'อัปเดตรายการประเภทสถานประกอบการเรียบร้อยแล้ว',
      color: 'success'
    })
    await refreshConfig()
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'เกิดข้อผิดพลาดในการบันทึก'
    toast.add({
      title: 'บันทึกไม่สำเร็จ',
      description: msg,
      color: 'error'
    })
  } finally {
    isSavingCompanyTypes.value = false
  }
}
</script>

<template>
  <div class="space-y-6">
    <!-- Header Section -->
    <header
      class="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between"
    >
      <div>
        <p class="mfu-eyebrow">การกำหนดค่าระบบและข้อมูลพื้นฐาน (Master Data)</p>
        <h1 class="mt-2 text-3xl font-bold text-highlighted">ตั้งค่าระบบ</h1>
        <p class="mt-1 text-xs text-muted">
          จัดการข้อมูลจังหวัด (Provinces) และประเภทสถานประกอบการ (Company Types)
        </p>
      </div>

      <div class="flex items-center gap-2">
        <UButton
          v-if="activeTab === 'provinces'"
          color="neutral"
          icon="i-lucide-rotate-ccw"
          label="รีเซ็ต 77 จังหวัด"
          size="md"
          variant="outline"
          :loading="isResetting"
          @click="handleResetProvinces"
        />
        <UButton
          v-if="activeTab === 'provinces'"
          color="primary"
          icon="i-lucide-plus"
          label="เพิ่มจังหวัดใหม่"
          size="md"
          @click="openCreateProvinceModal"
        />
        <UButton
          v-if="activeTab === 'companyTypes'"
          color="primary"
          icon="i-lucide-save"
          label="บันทึกประเภทสถานประกอบการ"
          size="md"
          :loading="isSavingCompanyTypes"
          @click="handleSaveCompanyTypes"
        />
      </div>
    </header>

    <!-- Navigation Tabs -->
    <div class="flex border-b border-default">
      <button
        class="flex items-center gap-2 px-5 py-3 text-sm font-semibold transition-colors border-b-2"
        :class="
          activeTab === 'provinces'
            ? 'border-primary text-primary bg-primary/5'
            : 'border-transparent text-muted hover:text-highlighted'
        "
        @click="activeTab = 'provinces'"
      >
        <UIcon name="i-lucide-map-pin" class="size-4" />
        <span>จังหวัด (Provinces)</span>
        <UBadge :label="String(totalProvinces)" size="xs" variant="subtle" />
      </button>

      <button
        class="flex items-center gap-2 px-5 py-3 text-sm font-semibold transition-colors border-b-2"
        :class="
          activeTab === 'companyTypes'
            ? 'border-primary text-primary bg-primary/5'
            : 'border-transparent text-muted hover:text-highlighted'
        "
        @click="activeTab = 'companyTypes'"
      >
        <UIcon name="i-lucide-tag" class="size-4" />
        <span>ประเภทสถานประกอบการ (Company Types)</span>
        <UBadge
          :label="String(companyTypesList.length)"
          size="xs"
          variant="subtle"
        />
      </button>
    </div>

    <!-- ================================================================= -->
    <!-- TAB 1: PROVINCES (จังหวัด)                                       -->
    <!-- ================================================================= -->
    <div v-if="activeTab === 'provinces'" class="space-y-6">
      <!-- Stats Overview Cards -->
      <div class="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <UCard class="border-l-4 border-l-primary">
          <div class="flex items-center justify-between">
            <div>
              <p class="text-xs text-muted">จังหวัดทั้งหมด</p>
              <p class="text-2xl font-bold font-mono text-highlighted mt-1">
                {{ totalProvinces }}
              </p>
            </div>
            <UIcon name="i-lucide-map" class="size-8 text-primary/30" />
          </div>
        </UCard>

        <UCard class="border-l-4 border-l-emerald-500">
          <div class="flex items-center justify-between">
            <div>
              <p class="text-xs text-muted">เปิดใช้งาน</p>
              <p
                class="text-2xl font-bold font-mono text-emerald-600 dark:text-emerald-400 mt-1"
              >
                {{ activeProvincesCount }}
              </p>
            </div>
            <UIcon
              name="i-lucide-circle-check"
              class="size-8 text-emerald-500/30"
            />
          </div>
        </UCard>

        <UCard class="border-l-4 border-l-rose-500">
          <div class="flex items-center justify-between">
            <div>
              <p class="text-xs text-muted">ระงับใช้งาน</p>
              <p
                class="text-2xl font-bold font-mono text-rose-600 dark:text-rose-400 mt-1"
              >
                {{ inactiveProvincesCount }}
              </p>
            </div>
            <UIcon name="i-lucide-circle-x" class="size-8 text-rose-500/30" />
          </div>
        </UCard>

        <UCard class="border-l-4 border-l-blue-500">
          <div class="flex items-center justify-between">
            <div>
              <p class="text-xs text-muted">ครอบคลุมภูมิภาค</p>
              <p
                class="text-2xl font-bold font-mono text-blue-600 dark:text-blue-400 mt-1"
              >
                6 ภาค
              </p>
            </div>
            <UIcon name="i-lucide-globe" class="size-8 text-blue-500/30" />
          </div>
        </UCard>
      </div>

      <!-- Search & Filters -->
      <UCard>
        <div class="flex flex-col gap-3 sm:flex-row sm:items-center">
          <UInput
            v-model="search"
            class="flex-1"
            icon="i-lucide-search"
            placeholder="ค้นหาชื่อจังหวัด (ไทย, English) หรือรหัส..."
            size="md"
            @keyup.enter="() => refreshProvinces()"
          />

          <div class="flex items-center gap-2">
            <select
              v-model="selectedRegion"
              class="h-9 rounded-lg border border-default bg-default px-3 text-xs text-highlighted focus:border-primary focus:outline-none"
            >
              <option value="all">ทุกภูมิภาค (All Regions)</option>
              <option v-for="r in REGIONS" :key="r" :value="r">
                {{ r }}
              </option>
            </select>

            <select
              v-model="selectedStatus"
              class="h-9 rounded-lg border border-default bg-default px-3 text-xs text-highlighted focus:border-primary focus:outline-none"
            >
              <option value="all">ทุกสถานะ (All Statuses)</option>
              <option value="active">เปิดใช้งาน (Active)</option>
              <option value="inactive">ระงับใช้งาน (Inactive)</option>
            </select>

            <UButton
              color="primary"
              icon="i-lucide-search"
              label="ค้นหา"
              size="md"
              :loading="provincesPending"
              @click="() => refreshProvinces()"
            />
          </div>
        </div>
      </UCard>

      <!-- Provinces Table -->
      <UCard :ui="{ body: 'p-0 sm:p-0' }">
        <div class="overflow-x-auto">
          <table class="data-table">
            <thead>
              <tr>
                <th class="w-12 text-center">#</th>
                <th class="w-24">รหัส</th>
                <th>ชื่อจังหวัด (ภาษาไทย)</th>
                <th>Province Name (English)</th>
                <th class="w-44">ภูมิภาค</th>
                <th class="w-28 text-center">สถานะ</th>
                <th class="w-28 text-right">การจัดการ</th>
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="(province, idx) in paginatedProvinces"
                :key="province.id"
                class="hover:bg-muted/10 transition-colors"
              >
                <td class="text-center font-mono text-xs text-muted">
                  {{ (page - 1) * pageSize + idx + 1 }}
                </td>

                <td class="font-mono text-xs font-bold text-highlighted">
                  {{ province.code }}
                </td>

                <td>
                  <div class="flex items-center gap-2">
                    <UIcon
                      name="i-lucide-map-pin"
                      class="size-4 text-primary shrink-0"
                    />
                    <span class="font-semibold text-highlighted">
                      {{ province.nameTh }}
                    </span>
                    <UBadge
                      v-if="province.isCustom"
                      color="secondary"
                      label="Custom"
                      size="xs"
                      variant="subtle"
                    />
                  </div>
                </td>

                <td class="text-muted text-sm font-medium">
                  {{ province.nameEn }}
                </td>

                <td>
                  <UBadge
                    :color="getRegionBadgeColor(province.region)"
                    :label="province.region"
                    size="sm"
                    variant="subtle"
                  />
                </td>

                <td class="text-center">
                  <button
                    class="cursor-pointer transition-opacity hover:opacity-80"
                    title="คลิกเพื่อสลับสถานะ"
                    @click="toggleProvinceStatus(province)"
                  >
                    <UBadge
                      :color="
                        province.status === 'active' ? 'success' : 'neutral'
                      "
                      :label="province.status === 'active' ? 'ใช้งาน' : 'ระงับ'"
                      size="sm"
                      variant="subtle"
                    />
                  </button>
                </td>

                <td class="text-right">
                  <div class="flex items-center justify-end gap-1">
                    <UButton
                      color="neutral"
                      icon="i-lucide-pencil"
                      size="xs"
                      variant="ghost"
                      title="แก้ไขจังหวัด"
                      class="!rounded-full size-7 p-0 flex items-center justify-center cursor-pointer hover:bg-muted/60"
                      @click="openEditProvinceModal(province)"
                    />
                    <UButton
                      v-if="province.isCustom"
                      color="error"
                      icon="i-lucide-trash-2"
                      size="xs"
                      variant="ghost"
                      title="ลบจังหวัด"
                      class="!rounded-full size-7 p-0 flex items-center justify-center cursor-pointer hover:bg-red-500/10"
                      @click="handleDeleteProvince(province)"
                    />
                  </div>
                </td>
              </tr>

              <tr v-if="!provincesPending && !provincesData?.items.length">
                <td class="py-12 text-center text-muted" colspan="7">
                  <UIcon
                    name="i-lucide-map-pin"
                    class="mx-auto mb-2 size-8 text-muted"
                  />
                  <p class="font-medium">ไม่พบข้อมูลจังหวัดตามเงื่อนไข</p>
                  <p class="text-xs text-muted">
                    คลิกปุ่ม &quot;รีเซ็ต 77 จังหวัด&quot;
                    เพื่อกู้คืนข้อมูลเริ่มต้น
                  </p>
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        <AppPagination
          v-model:page="page"
          v-model:page-size="pageSize"
          :total="provincesData?.items?.length ?? 0"
          items-name="จังหวัด"
        />
      </UCard>
    </div>

    <!-- ================================================================= -->
    <!-- TAB 2: COMPANY TYPES (ประเภทสถานประกอบการ)                         -->
    <!-- ================================================================= -->
    <div v-if="activeTab === 'companyTypes'" class="space-y-6">
      <UCard>
        <template #header>
          <div class="flex items-center justify-between">
            <div>
              <h2 class="text-base font-bold text-highlighted">
                ประเภทสถานประกอบการและหน่วยงาน (Company Types)
              </h2>
              <p class="text-xs text-muted">
                กำหนดประเภทของหน่วยงานที่เปิดรับนักศึกษาเข้าฝึกงานหรือปฏิบัติสหกิจศึกษา
              </p>
            </div>
            <UBadge
              :label="`${companyTypesList.length} ประเภท`"
              size="md"
              variant="subtle"
            />
          </div>
        </template>

        <div class="space-y-6">
          <!-- Add New Company Type -->
          <div class="flex gap-2">
            <UInput
              v-model="newCompanyType"
              class="flex-1"
              icon="i-lucide-tag"
              placeholder="ระบุประเภทสถานประกอบการ เช่น บริษัทเอกชน (Private Company)..."
              size="md"
              @keyup.enter="addCompanyType"
            />
            <UButton
              color="primary"
              icon="i-lucide-plus"
              label="เพิ่มประเภท"
              size="md"
              @click="addCompanyType"
            />
          </div>

          <!-- List of Company Types -->
          <div class="space-y-2">
            <h3
              class="text-xs font-semibold text-highlighted uppercase tracking-wider"
            >
              รายการประเภทปัจจุบัน
            </h3>
            <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              <div
                v-for="(type, idx) in companyTypesList"
                :key="idx"
                class="flex items-center justify-between p-3 rounded-xl border border-default bg-muted/10 hover:border-primary/50 transition-colors"
              >
                <div class="flex items-center gap-2.5">
                  <span
                    class="grid size-7 place-items-center rounded-md bg-primary/10 text-primary text-xs font-bold font-mono"
                  >
                    {{ idx + 1 }}
                  </span>
                  <span class="text-sm font-medium text-highlighted">
                    {{ type }}
                  </span>
                </div>
                <UButton
                  color="error"
                  icon="i-lucide-x"
                  size="xs"
                  variant="ghost"
                  title="ลบประเภทนี้"
                  class="!rounded-full size-7 p-0 flex items-center justify-center cursor-pointer hover:bg-red-500/10"
                  @click="removeCompanyType(idx)"
                />
              </div>
            </div>
          </div>

          <!-- Bottom Save bar -->
          <div
            class="flex items-center justify-end pt-4 border-t border-default"
          >
            <UButton
              color="primary"
              icon="i-lucide-save"
              label="บันทึกประเภทสถานประกอบการ"
              size="md"
              :loading="isSavingCompanyTypes"
              @click="handleSaveCompanyTypes"
            />
          </div>
        </div>
      </UCard>
    </div>

    <!-- ================================================================= -->
    <!-- MODAL: ADD / EDIT PROVINCE                                        -->
    <!-- ================================================================= -->
    <div
      v-if="isProvinceModalOpen"
      class="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"
      @click="isProvinceModalOpen = false"
    >
      <div
        class="w-full max-w-lg rounded-2xl border border-default bg-default p-6 shadow-2xl space-y-5"
        @click.stop
      >
        <div
          class="flex items-center justify-between border-b border-default pb-4"
        >
          <div class="flex items-center gap-2.5">
            <span
              class="grid size-9 place-items-center rounded-lg bg-primary/10 text-primary"
            >
              <UIcon name="i-lucide-map-pin" class="size-5" />
            </span>
            <div>
              <h2 class="text-lg font-bold text-highlighted">
                {{
                  editingProvinceId ? 'แก้ไขข้อมูลจังหวัด' : 'เพิ่มจังหวัดใหม่'
                }}
              </h2>
              <p class="text-xs text-muted">
                กำหนดรหัส ชื่อภาษาไทย/อังกฤษ และภูมิภาคของจังหวัด
              </p>
            </div>
          </div>
          <UButton
            color="neutral"
            icon="i-lucide-x"
            size="sm"
            variant="ghost"
            @click="isProvinceModalOpen = false"
          />
        </div>

        <form class="space-y-4" @submit.prevent="handleSaveProvince">
          <div>
            <label class="block text-xs font-semibold text-highlighted mb-1">
              รหัสจังหวัด (Province Code) <span class="text-rose-500">*</span>
            </label>
            <UInput
              v-model="provinceForm.code"
              placeholder="เช่น TH-57, CRI, TH-10"
              size="md"
              required
            />
          </div>

          <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label class="block text-xs font-semibold text-highlighted mb-1">
                ชื่อจังหวัด (ภาษาไทย) <span class="text-rose-500">*</span>
              </label>
              <UInput
                v-model="provinceForm.nameTh"
                placeholder="เช่น เชียงราย"
                size="md"
                required
              />
            </div>
            <div>
              <label class="block text-xs font-semibold text-highlighted mb-1">
                Province Name (English) <span class="text-rose-500">*</span>
              </label>
              <UInput
                v-model="provinceForm.nameEn"
                placeholder="เช่น Chiang Rai"
                size="md"
                required
              />
            </div>
          </div>

          <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label class="block text-xs font-semibold text-highlighted mb-1">
                ภูมิภาค (Region)
              </label>
              <select
                v-model="provinceForm.region"
                class="w-full h-10 rounded-lg border border-default bg-default px-3 text-sm text-highlighted focus:border-primary focus:outline-none"
              >
                <option v-for="r in REGIONS" :key="r" :value="r">
                  {{ r }}
                </option>
                <option value="ต่างประเทศ">ต่างประเทศ (Overseas)</option>
              </select>
            </div>

            <div>
              <label class="block text-xs font-semibold text-highlighted mb-1">
                สถานะ (Status)
              </label>
              <select
                v-model="provinceForm.status"
                class="w-full h-10 rounded-lg border border-default bg-default px-3 text-sm text-highlighted focus:border-primary focus:outline-none"
              >
                <option value="active">เปิดใช้งาน (Active)</option>
                <option value="inactive">ระงับใช้งาน (Inactive)</option>
              </select>
            </div>
          </div>

          <div
            class="flex items-center justify-end gap-2.5 pt-4 border-t border-default"
          >
            <UButton
              color="neutral"
              label="ยกเลิก"
              variant="outline"
              @click="isProvinceModalOpen = false"
            />
            <UButton
              color="primary"
              icon="i-lucide-save"
              :label="editingProvinceId ? 'บันทึกการแก้ไข' : 'เพิ่มจังหวัด'"
              :loading="isSubmittingProvince"
              type="submit"
            />
          </div>
        </form>
      </div>
    </div>
  </div>
</template>
