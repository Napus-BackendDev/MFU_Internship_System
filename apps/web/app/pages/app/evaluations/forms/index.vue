<script setup lang="ts">
definePageMeta({ layout: 'app', middleware: 'auth' })

interface LocalizedText {
  th: string
  en: string
}

interface CompetencySet {
  id: string
  code: string
  name: LocalizedText
  status: 'active' | 'inactive' | 'archived'
  createdAt?: string
  updatedAt?: string
}

interface PageResult<T> {
  items: T[]
  meta: {
    total: number
    page: number
    pageSize: number
  }
}

const api = useApi()
const auth = useAuthStore()
const toast = useToast()

const canManage = computed(() =>
  auth.actor?.roles.some((r) => ['systemAdmin', 'internshipStaff'].includes(r))
)

// Main list state
const searchQuery = ref('')
const statusFilter = ref<'all' | 'active' | 'inactive'>('all')

// Fetch Competency Sets (Forms)
const {
  data: formsData,
  error: formsError,
  pending: formsPending,
  refresh: refreshForms
} = useAsyncData(
  'competency-sets-list',
  () =>
    api<PageResult<CompetencySet>>('/competency-sets', {
      query: { page: 1, pageSize: 50 }
    }),
  { lazy: true }
)

// Filtered forms
const filteredForms = computed(() => {
  let list = formsData.value?.items ?? []
  if (statusFilter.value !== 'all') {
    list = list.filter((f) => f.status === statusFilter.value)
  }
  const q = searchQuery.value.trim().toLowerCase()
  if (q) {
    list = list.filter(
      (f) =>
        f.code.toLowerCase().includes(q) ||
        f.name.th.toLowerCase().includes(q) ||
        f.name.en.toLowerCase().includes(q)
    )
  }
  return list
})

const hasActiveFilters = computed(
  () => !!searchQuery.value.trim() || statusFilter.value !== 'all'
)

function resetFilters() {
  searchQuery.value = ''
  statusFilter.value = 'all'
  page.value = 1
}

// Pagination
const page = ref(1)
const pageSize = ref(10)
const paginatedForms = computed(() => {
  const start = (page.value - 1) * pageSize.value
  return filteredForms.value.slice(start, start + pageSize.value)
})

watch([searchQuery, statusFilter, pageSize], () => {
  page.value = 1
})

function navigateToCreate(): void {
  void navigateTo('/app/evaluations/forms/create')
}

function navigateToEdit(formId: string): void {
  void navigateTo(`/app/evaluations/forms/create?id=${formId}`)
}

function navigateToPreview(formId: string): void {
  void navigateTo(`/app/evaluations/forms/create?id=${formId}&preview=true`)
}

const formToDelete = ref<CompetencySet | null>(null)
const isDeletingForm = ref(false)

function openDeleteFormModal(form: CompetencySet) {
  formToDelete.value = form
}

async function confirmDeleteForm() {
  if (!formToDelete.value) return
  isDeletingForm.value = true
  const targetForm = formToDelete.value
  try {
    await api(`/competency-sets/${targetForm.id}`, {
      method: 'DELETE'
    })
    toast.add({
      title: 'ลบแบบประเมินสำเร็จ',
      description: `ลบแบบประเมิน ${targetForm.name.th} เรียบร้อยแล้ว`,
      color: 'success'
    })
    formToDelete.value = null
    await refreshForms()
  } catch (err: unknown) {
    let msg = 'ไม่สามารถลบแบบประเมินได้'
    if (err && typeof err === 'object') {
      const code =
        (
          err as {
            data?: { code?: string }
            response?: { _data?: { code?: string } }
          }
        ).data?.code ||
        (err as { response?: { _data?: { code?: string } } }).response?._data
          ?.code
      if (code === 'COMPETENCY_SET_IN_USE') {
        msg =
          'แบบประเมินนี้กำลังถูกใช้งานอยู่ในรอบการประเมินที่เปิดอยู่ จึงไม่สามารถลบหรือเก็บถาวรได้'
      } else if (err instanceof Error) {
        msg = err.message
      }
    }
    toast.add({
      title: 'ไม่สามารถลบแบบประเมินได้',
      description: msg,
      color: 'error'
    })
  } finally {
    isDeletingForm.value = false
  }
}

const updatingFormId = ref<string | null>(null)

async function toggleFormStatus(form: CompetencySet, activate: boolean) {
  updatingFormId.value = form.id
  try {
    const newStatus = activate ? 'active' : 'inactive'
    await api(`/competency-sets/${form.id}`, {
      method: 'PATCH',
      body: { status: newStatus }
    })
    toast.add({
      title: activate ? 'เปิดใช้งานแบบฟอร์มสำเร็จ' : 'ปิดใช้งานแบบฟอร์มสำเร็จ',
      description: activate
        ? `แบบฟอร์ม ${form.name.th} ได้รับการตั้งเป็นแบบฟอร์มหลักที่เปิดใช้งานแล้ว (แบบฟอร์มอื่นจะถูกปิดการใช้งานอัตโนมัติ)`
        : `ปิดใช้งานแบบฟอร์ม ${form.name.th} เรียบร้อยแล้ว`,
      color: 'success'
    })
    await refreshForms()
  } catch (err: unknown) {
    toast.add({
      title: 'ไม่สามารถเปลี่ยนสถานะแบบฟอร์มได้',
      description: err instanceof Error ? err.message : 'เกิดข้อผิดพลาด',
      color: 'error'
    })
  } finally {
    updatingFormId.value = null
  }
}
</script>

<template>
  <div class="space-y-6">
    <!-- Header -->
    <header
      class="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between"
    >
      <div>
        <h1 class="text-xl sm:text-2xl font-bold text-highlighted">
          แบบฟอร์มประเมินสมรรถนะ (Evaluation Forms)
        </h1>
        <p class="mt-1 text-xs sm:text-sm text-muted">
          ออกแบบเกณฑ์ประเมินสมรรถนะ กำหนดสัดส่วนคะแนน
          และจับคู่แบบประเมินเฉพาะทางตามสำนักวิชาและหลักสูตร
        </p>
      </div>

      <div class="flex flex-wrap items-center gap-2">
        <UButton
          color="neutral"
          icon="i-lucide-refresh-cw"
          label="รีเฟรช"
          :loading="formsPending"
          variant="outline"
          @click="() => refreshForms()"
        />
        <UButton
          v-if="canManage"
          color="primary"
          icon="i-lucide-plus"
          label="สร้างแบบฟอร์มใหม่"
          @click="navigateToCreate"
        />
      </div>
    </header>

    <!-- Info Banner Explain General vs Special vs Suggestion -->
    <div class="grid grid-cols-1 gap-4 md:grid-cols-3">
      <div
        class="flex items-start gap-3.5 rounded-xl border border-default bg-muted/20 p-4"
      >
        <span
          class="grid size-9 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary"
        >
          <UIcon name="i-lucide-layers" class="size-5" />
        </span>
        <div>
          <h3 class="text-sm font-bold text-highlighted">
            หมวดทั่วไป (General Core)
          </h3>
          <p class="mt-1 text-xs text-muted leading-relaxed">
            ทุกคนในทุกสำนักวิชาจะได้รับโจทย์และเกณฑ์การประเมินในหมวดนี้เหมือนกันทั้งหมด
            เช่น ทักษะทางสังคม (Soft Skills), ความตรงต่อเวลา, การสื่อสาร
            และการทำงานเป็นทีม
          </p>
        </div>
      </div>

      <div
        class="flex items-start gap-3.5 rounded-xl border border-default bg-muted/20 p-4"
      >
        <span
          class="grid size-9 shrink-0 place-items-center rounded-lg bg-secondary/10 text-secondary"
        >
          <UIcon name="i-lucide-sparkles" class="size-5" />
        </span>
        <div>
          <h3 class="text-sm font-bold text-highlighted">
            หมวดพิเศษเฉพาะสำนักวิชา (Specialized)
          </h3>
          <p class="mt-1 text-xs text-muted leading-relaxed">
            ข้อคำถามและเกณฑ์ประเมินจะแสดงผลเฉพาะนักศึกษาที่สังกัดสำนักวิชาหรือสาขาวิชานั้นๆ
            เช่น ทักษะการเขียนโปรแกรม (IT), ทักษะการพยาบาล (NUR), ทักษะกฎหมาย
            (LAW)
          </p>
        </div>
      </div>

      <div
        class="flex items-start gap-3.5 rounded-xl border border-default bg-muted/20 p-4"
      >
        <span
          class="grid size-9 shrink-0 place-items-center rounded-lg bg-amber-500/10 text-amber-600 dark:text-amber-400"
        >
          <UIcon name="i-lucide-message-square" class="size-5" />
        </span>
        <div>
          <h3 class="text-sm font-bold text-highlighted">
            หมวดคำแนะนำ (Suggestion)
          </h3>
          <p class="mt-1 text-xs text-muted leading-relaxed">
            ข้อคำถามและแบบประเมินสำหรับให้ผู้ประเมินบันทึกข้อเสนอแนะ จุดเด่น
            สิ่งที่ควรพัฒนา และคำแนะนำเพิ่มเติมแก่นักศึกษาฝึกงาน
          </p>
        </div>
      </div>
    </div>

    <!-- Error Alert -->
    <UAlert
      v-if="formsError"
      color="error"
      icon="i-lucide-circle-alert"
      title="โหลดแบบฟอร์มการประเมินไม่สำเร็จ"
      description="กรุณาตรวจสอบการเชื่อมต่อ API หรือสิทธิ์การใช้งาน (competencies.read)"
      variant="soft"
    />

    <!-- Filter & Search Bar -->
    <div
      class="rounded-xl border border-default bg-default p-4 shadow-xs space-y-3"
    >
      <div class="flex flex-col gap-3 md:flex-row md:items-center">
        <!-- Live Search with Clear Button -->
        <div class="relative flex-1">
          <UInput
            v-model="searchQuery"
            class="w-full"
            icon="i-lucide-search"
            placeholder="ค้นหาชื่อหรือรหัสแบบฟอร์มประเมิน (ไทย / English)..."
            size="md"
          >
            <template #trailing>
              <button
                v-if="searchQuery"
                type="button"
                class="text-muted hover:text-highlighted cursor-pointer p-0.5"
                title="ล้างคำค้นหา"
                @click="searchQuery = ''"
              >
                <UIcon name="i-lucide-x" class="size-4" />
              </button>
            </template>
          </UInput>
        </div>

        <!-- Status Filter Dropdown -->
        <div class="flex items-center gap-2">
          <label
            for="form-status-filter"
            class="text-xs font-semibold text-muted whitespace-nowrap"
            >สถานะ:</label
          >
          <select
            id="form-status-filter"
            v-model="statusFilter"
            class="rounded-lg border border-default bg-default px-3 py-2 text-xs text-highlighted focus:outline-none focus:ring-1 focus:ring-primary font-medium"
          >
            <option value="all">ทุกสถานะ</option>
            <option value="active">เปิดใช้งาน (Active)</option>
            <option value="inactive">ปิดใช้งาน (Inactive)</option>
          </select>
        </div>
      </div>

      <!-- Filter Summary & Reset Bar -->
      <div
        class="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-default/70 text-xs text-muted"
      >
        <div class="flex items-center gap-2">
          <span
            class="inline-flex items-center gap-1.5 font-medium text-highlighted"
          >
            <UIcon name="i-lucide-filter" class="size-3.5 text-primary" />
            <span>ผลการกรอง:</span>
            <span class="font-bold text-primary">{{
              filteredForms.length
            }}</span>
            แบบฟอร์ม
          </span>
          <span
            v-if="(formsData?.items.length ?? 0) > filteredForms.length"
            class="text-muted"
          >
            (จากทั้งหมด {{ formsData?.items.length ?? 0 }} แบบฟอร์ม)
          </span>
        </div>

        <button
          v-if="hasActiveFilters"
          type="button"
          class="inline-flex items-center gap-1 font-medium text-primary hover:underline cursor-pointer"
          @click="resetFilters"
        >
          <UIcon name="i-lucide-rotate-ccw" class="size-3.5" />
          <span>ล้างตัวกรองทั้งหมด</span>
        </button>
      </div>
    </div>

    <!-- Forms List Table -->
    <UCard :ui="{ body: 'p-0 sm:p-0' }">
      <div class="overflow-x-auto">
        <table class="data-table">
          <thead>
            <tr>
              <th class="w-36">รหัสแบบฟอร์ม</th>
              <th>ชื่อแบบฟอร์ม (ภาษาไทย)</th>
              <th>ชื่อภาษาอังกฤษ</th>
              <th class="w-28 text-center">สถานะ</th>
              <th class="w-24 text-right">การจัดการ</th>
            </tr>
          </thead>
          <tbody>
            <tr v-if="filteredForms.length === 0">
              <td colspan="5" class="py-12 text-center text-muted">
                <UIcon
                  name="i-lucide-clipboard-check"
                  class="mx-auto mb-2 size-8 text-muted"
                />
                <p class="font-medium">ยังไม่มีแบบฟอร์มการประเมินในระบบ</p>
                <p class="text-xs">
                  คลิกปุ่ม &quot;สร้างแบบฟอร์มใหม่&quot;
                  เพื่อเริ่มต้นออกแบบเกณฑ์ประเมิน
                </p>
              </td>
            </tr>
            <tr v-for="form in paginatedForms" :key="form.id">
              <td class="font-mono font-bold text-highlighted">
                {{ form.code }}
              </td>
              <td class="font-medium text-highlighted">
                {{ form.name.th }}
              </td>
              <td class="text-muted">
                {{ form.name.en }}
              </td>
              <td class="text-center">
                <div class="flex items-center justify-center gap-2">
                  <USwitch
                    v-if="canManage"
                    :model-value="form.status === 'active'"
                    :loading="updatingFormId === form.id"
                    :disabled="updatingFormId === form.id"
                    size="xs"
                    title="เปิด/ปิด การใช้งานแบบฟอร์ม"
                    @update:model-value="(val) => toggleFormStatus(form, val)"
                  />
                  <UBadge
                    :color="
                      form.status === 'active'
                        ? 'success'
                        : form.status === 'inactive'
                          ? 'neutral'
                          : 'warning'
                    "
                    :label="
                      form.status === 'active'
                        ? 'เปิดใช้งาน'
                        : form.status === 'inactive'
                          ? 'ปิดใช้งาน'
                          : 'เก็บถาวร'
                    "
                    size="sm"
                    variant="subtle"
                  />
                </div>
              </td>
              <td class="text-right">
                <div class="flex items-center justify-end gap-1">
                  <UButton
                    color="neutral"
                    icon="i-lucide-pencil"
                    size="xs"
                    title="แก้ไข / ออกแบบฟอร์ม"
                    variant="ghost"
                    class="hidden sm:inline-flex cursor-pointer"
                    @click="navigateToEdit(form.id)"
                  />
                  <UButton
                    color="error"
                    icon="i-lucide-trash-2"
                    size="xs"
                    title="ลบแบบประเมิน"
                    variant="ghost"
                    class="hidden sm:inline-flex cursor-pointer hover:bg-red-500/10 text-red-600 dark:text-red-400"
                    @click="openDeleteFormModal(form)"
                  />
                  <UDropdownMenu
                    :items="[
                      [
                        {
                          label:
                            form.status === 'active'
                              ? 'ปิดใช้งานแบบฟอร์ม'
                              : 'เปิดใช้งานเป็นฟอร์มหลัก',
                          icon:
                            form.status === 'active'
                              ? 'i-lucide-power-off'
                              : 'i-lucide-power',
                          onSelect: () =>
                            toggleFormStatus(form, form.status !== 'active')
                        },
                        {
                          label: 'แก้ไข / ออกแบบฟอร์ม',
                          icon: 'i-lucide-pencil',
                          onSelect: () => navigateToEdit(form.id)
                        },
                        {
                          label: 'ทดสอบดูตัวอย่างแบบฟอร์ม',
                          icon: 'i-lucide-eye',
                          onSelect: () => navigateToPreview(form.id)
                        }
                      ],
                      [
                        {
                          label: 'ลบแบบประเมิน...',
                          icon: 'i-lucide-trash-2',
                          color: 'error',
                          onSelect: () => openDeleteFormModal(form)
                        }
                      ]
                    ]"
                    :content="{ align: 'end' }"
                  >
                    <UButton
                      aria-label="การจัดการแบบฟอร์ม"
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
        :total="filteredForms.length"
        items-name="แบบฟอร์ม"
      />
    </UCard>

    <!-- Modal: ยืนยันการลบแบบฟอร์มประเมิน -->
    <AppModal
      v-if="formToDelete"
      :open="true"
      title="ยืนยันการลบแบบประเมิน"
      @update:open="
        (open) => {
          if (!open) formToDelete = null
        }
      "
    >
      <div class="space-y-4 p-6">
        <div class="flex items-center gap-3">
          <div
            class="p-2.5 rounded-full bg-red-100 dark:bg-red-950/60 text-red-600 dark:text-red-400"
          >
            <UIcon
              name="i-lucide-trash-2"
              class="size-6 text-red-600 dark:text-red-400"
            />
          </div>
          <div>
            <h2 class="text-lg font-semibold text-foreground">
              ยืนยันการลบแบบประเมิน
            </h2>
            <p class="text-xs text-muted">
              แบบประเมินจะถูกเปลี่ยนสถานะเป็นเก็บถาวร (Archived)
            </p>
          </div>
        </div>
        <p class="text-sm text-foreground">
          คุณต้องการลบแบบประเมิน
          <strong class="font-medium text-red-600 dark:text-red-400">{{
            formToDelete.name.th
          }}</strong>
          <span class="text-xs text-muted"> ({{ formToDelete.code }})</span>
          ใช่หรือไม่?
        </p>
        <div class="flex justify-end gap-2 pt-2 border-t border-default">
          <UButton
            label="ยกเลิก"
            color="neutral"
            variant="outline"
            :disabled="isDeletingForm"
            @click="formToDelete = null"
          />
          <UButton
            label="ยืนยันการลบ"
            color="error"
            icon="i-lucide-trash-2"
            :loading="isDeletingForm"
            @click="confirmDeleteForm"
          />
        </div>
      </div>
    </AppModal>
  </div>
</template>
