<script setup lang="ts">
definePageMeta({ layout: 'app', middleware: 'auth', redirect: '/app/students' })
await navigateTo('/app/students', { replace: true })

interface Delivery {
  readonly id: string
  readonly recipientEmail: string
  readonly assignmentId: string
  readonly status: 'queued' | 'sending' | 'sent' | 'failed'
  readonly attempts: number
  readonly lastErrorCode?: string
}
interface DeliveryPage {
  readonly items: readonly Delivery[]
  readonly meta?: { readonly total: number }
}

const api = useApi()
const searchQuery = ref('')
const statusFilter = ref<'all' | 'sent' | 'queued' | 'sending' | 'failed'>(
  'all'
)
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
      item.recipientEmail.toLowerCase().includes(q) ||
      item.assignmentId.toLowerCase().includes(q)
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

async function retry(id: string): Promise<void> {
  retrying.value = id
  try {
    await api(`/deliveries/${id}/retry`, { method: 'POST' })
    await refresh()
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
            placeholder="ค้นหาอีเมลผู้รับ หรือ Assignment ID..."
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
          <select
            id="delivery-status-filter"
            v-model="statusFilter"
            class="rounded-lg border border-default bg-default px-3 py-2 text-xs text-highlighted focus:outline-none focus:ring-1 focus:ring-primary font-medium"
          >
            <option value="all">ทุกสถานะ</option>
            <option value="sent">ส่งสำเร็จ (Sent)</option>
            <option value="queued">รอส่ง / อยู่ในคิว (Queued)</option>
            <option value="sending">กำลังส่ง (Sending)</option>
            <option value="failed">ส่งล้มเหลว (Failed)</option>
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
      >
      <div class="overflow-x-auto">
        <table class="data-table">
          <thead>
            <tr>
              <th>ผู้รับ</th>
              <th>Assignment</th>
              <th>สถานะ</th>
              <th>Attempts</th>
              <th>Error / Action</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="item in filteredItems" :key="item.id">
              <td>{{ item.recipientEmail }}</td>
              <td class="font-mono text-xs">{{ item.assignmentId }}</td>
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
                  v-if="item.status !== 'failed'"
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
