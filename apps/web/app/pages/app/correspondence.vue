<script setup lang="ts">
definePageMeta({ layout: 'app', middleware: 'auth' })

interface AssignmentDetails {
  readonly id?: string
  readonly studentId?: string
  readonly studentName?: string
  readonly evaluatorName?: string
  readonly evaluatorEmail?: string
  readonly company?: string
  readonly status?: string
  readonly deadlineAt?: string | null
}

interface Delivery {
  readonly id: string
  readonly recipientMasked: string
  readonly assignmentId: string
  readonly status: 'queued' | 'sending' | 'sent' | 'failed' | 'uncertain'
  readonly attempts: number
  readonly lastErrorCode?: string
  readonly assignment?: AssignmentDetails
}
interface DeliveryPage {
  readonly items: readonly Delivery[]
  readonly meta?: { readonly total: number }
}

const api = useApi()
const searchQuery = ref('')
const statusFilter = ref<
  'all' | 'sent' | 'queued' | 'sending' | 'failed' | 'uncertain'
>('all')
const deliveryStatusOptions = [
  { value: 'all', label: 'ทุกสถานะ' },
  { value: 'sent', label: 'ส่งสำเร็จ (Sent)' },
  { value: 'queued', label: 'รอส่ง / อยู่ในคิว (Queued)' },
  { value: 'sending', label: 'กำลังส่ง (Sending)' },
  { value: 'failed', label: 'ส่งล้มเหลว (Failed)' },
  { value: 'uncertain', label: 'ผลส่งไม่แน่ชัด (Uncertain)' }
]
const page = ref(1)
const pageSize = ref(5)

const { data, error, pending, refresh } = await useAsyncData(
  'deliveries',
  () =>
    api<DeliveryPage>('/deliveries', {
      query: {
        page: page.value,
        pageSize: pageSize.value,
        status: statusFilter.value === 'all' ? undefined : statusFilter.value
      }
    }),
  { watch: [page, pageSize, statusFilter] }
)

const filteredItems = computed(() => {
  const items = data.value?.items ?? []
  const q = searchQuery.value.trim().toLowerCase()
  if (!q) return items
  return items.filter(
    (item) =>
      item.recipientMasked.toLowerCase().includes(q) ||
      item.assignmentId.toLowerCase().includes(q) ||
      item.assignment?.studentName?.toLowerCase().includes(q) ||
      item.assignment?.studentId?.toLowerCase().includes(q) ||
      item.assignment?.evaluatorName?.toLowerCase().includes(q) ||
      item.assignment?.company?.toLowerCase().includes(q)
  )
})

const hasActiveFilters = computed(
  () => !!searchQuery.value.trim() || statusFilter.value !== 'all'
)

function resetFilters() {
  searchQuery.value = ''
  statusFilter.value = 'all'
  page.value = 1
}

watch([statusFilter, pageSize], () => {
  page.value = 1
})
const retrying = ref<string>()
const retryError = ref('')
const retryIdempotencyKeys = new Map<string, string>()
const auth = useAuthStore()
const canRetryDeliveries = computed(() =>
  auth.actor?.roles.some((role) =>
    ['systemAdmin', 'internshipStaff'].includes(role)
  )
)

async function retry(id: string): Promise<void> {
  retrying.value = id
  retryError.value = ''
  const idempotencyKey =
    retryIdempotencyKeys.get(id) ?? globalThis.crypto.randomUUID()
  retryIdempotencyKeys.set(id, idempotencyKey)
  try {
    await api(`/deliveries/${id}/retry`, {
      method: 'POST',
      headers: { 'idempotency-key': idempotencyKey }
    })
    await refresh()
    retryIdempotencyKeys.delete(id)
  } catch {
    retryError.value =
      'รับคำขอ Retry ไม่สำเร็จ หากเครือข่ายขัดข้อง ลองซ้ำได้โดยระบบจะใช้คำขอเดิม'
  } finally {
    retrying.value = undefined
  }
}
</script>

<template>
  <div class="space-y-6">
    <header>
      <p class="mfu-eyebrow">Delivery state, retry และ idempotency</p>
      <h1 class="mt-2 text-3xl font-bold text-highlighted">การสื่อสาร</h1>
    </header>
    <UAlert
      v-if="retryError"
      color="error"
      icon="i-lucide-circle-alert"
      :description="retryError"
      title="Retry ไม่สำเร็จ"
      variant="soft"
    />
    <UAlert
      color="info"
      description="Development ส่งเข้า Mailpit ใน Localhost เท่านั้น; Production ต้องใช้ SMTP credentials จาก Secret Manager"
      icon="i-lucide-info"
      title="Mail safety"
      variant="soft"
    />
    <UAlert
      v-if="error"
      color="error"
      icon="i-lucide-circle-alert"
      title="โหลด Delivery ไม่สำเร็จ"
      variant="soft"
    />

    <!-- Standardized Modern Multi-Filter Card -->
    <div
      class="rounded-xl border border-default bg-default p-4 shadow-sm space-y-3"
    >
      <div class="flex flex-col gap-3 md:flex-row md:items-center">
        <!-- Live Search Input with Clear Button -->
        <div class="relative flex-1">
          <UInput
            v-model="searchQuery"
            class="w-full"
            icon="i-lucide-search"
            placeholder="ค้นหาชื่อนักศึกษา, รหัส, ผู้ประเมิน, บริษัท, อีเมล..."
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
            for="delivery-status-filter"
            class="text-xs font-semibold text-muted whitespace-nowrap"
            >สถานะส่งเมล:</label
          >
          <SearchableSelect
            v-model="statusFilter"
            :options="deliveryStatusOptions"
            search-placeholder="ค้นหาสถานะส่งเมล…"
            aria-label="สถานะส่งเมล"
          />
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
              data?.meta?.total ?? filteredItems.length
            }}</span>
            รายการ
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

    <UCard :ui="{ body: 'p-0 sm:p-0' }">
      <div class="overflow-x-auto">
        <table class="data-table">
          <thead>
            <tr>
              <th>ผู้รับ</th>
              <th>ข้อมูลแบบประเมิน (Assignment)</th>
              <th>สถานะ</th>
              <th>Attempts</th>
              <th>Error / Action</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="item in filteredItems" :key="item.id">
              <td>{{ item.recipientMasked }}</td>
              <td class="py-2.5">
                <div v-if="item.assignment" class="space-y-1">
                  <!-- ข้อมูลนักศึกษา -->
                  <div class="flex items-center gap-1.5 flex-wrap">
                    <span
                      v-if="item.assignment.studentId"
                      class="inline-flex items-center px-1.5 py-0.5 rounded text-[11px] font-mono font-bold bg-primary/10 text-primary border border-primary/20"
                    >
                      {{ item.assignment.studentId }}
                    </span>
                    <span class="font-semibold text-highlighted text-xs">
                      {{ item.assignment.studentName || 'ไม่ระบุชื่อ' }}
                    </span>
                  </div>

                  <!-- สถานประกอบการ & ผู้ประเมิน -->
                  <div
                    v-if="
                      item.assignment.company || item.assignment.evaluatorName
                    "
                    class="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px] text-muted"
                  >
                    <span
                      v-if="item.assignment.company"
                      class="inline-flex items-center gap-1"
                      title="สถานประกอบการ"
                    >
                      <UIcon
                        name="i-lucide-building-2"
                        class="size-3 text-muted shrink-0"
                      />
                      <span>{{ item.assignment.company }}</span>
                    </span>
                    <span
                      v-if="item.assignment.evaluatorName"
                      class="inline-flex items-center gap-1"
                      title="ผู้ประเมิน"
                    >
                      <UIcon
                        name="i-lucide-user-check"
                        class="size-3 text-muted shrink-0"
                      />
                      <span>{{ item.assignment.evaluatorName }}</span>
                    </span>
                  </div>

                  <!-- รหัส Assignment ID ทางเทคนิค -->
                  <div class="text-[10px] text-muted/60 font-mono">
                    ID: {{ item.assignmentId }}
                  </div>
                </div>

                <div v-else class="font-mono text-xs text-muted">
                  {{ item.assignmentId }}
                </div>
              </td>
              <td>
                <UBadge
                  :color="
                    item.status === 'sent'
                      ? 'success'
                      : item.status === 'failed'
                        ? 'error'
                        : 'warning'
                  "
                  :label="item.status"
                  variant="soft"
                />
              </td>
              <td class="tabular-nums">{{ item.attempts }}</td>
              <td>
                <span
                  v-if="item.status !== 'failed' || !canRetryDeliveries"
                  class="text-sm text-muted"
                  >{{ item.lastErrorCode || '—' }}</span
                ><UButton
                  v-else
                  color="error"
                  icon="i-lucide-refresh-cw"
                  label="Retry"
                  :loading="retrying === item.id"
                  size="sm"
                  variant="soft"
                  @click="retry(item.id)"
                />
              </td>
            </tr>
            <tr v-if="!pending && !filteredItems.length">
              <td class="py-12 text-center text-muted" colspan="5">
                ยังไม่มีข้อมูลการส่งอีเมล
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <AppPagination
        v-model:page="page"
        v-model:page-size="pageSize"
        :total="data?.meta?.total ?? data?.items?.length ?? 0"
        items-name="รายการ"
      />
    </UCard>
  </div>
</template>
