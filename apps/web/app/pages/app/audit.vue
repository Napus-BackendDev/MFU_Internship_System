<script setup lang="ts">
definePageMeta({ layout: 'app', middleware: 'auth' })

interface AuditItem {
  readonly id: string
  readonly createdAt: string
  readonly actorEmail: string
  readonly action: string
  readonly requestId: string
}
interface AuditPage {
  readonly items: readonly AuditItem[]
  readonly meta?: { readonly total: number }
}

const api = useApi()
const searchQuery = ref('')
const selectedAction = ref('all')
const page = ref(1)
const pageSize = ref(5)

const { data, error, pending, refresh } = await useAsyncData(
  'audit',
  () =>
    api<AuditPage>('/audit-logs', {
      query: {
        page: page.value,
        pageSize: pageSize.value,
        requestId: searchQuery.value.trim() || undefined
      }
    }),
  { watch: [page, pageSize] }
)

const filteredItems = computed(() => {
  const items = data.value?.items ?? []
  if (selectedAction.value === 'all') return items
  return items.filter((item) =>
    item.action.toLowerCase().includes(selectedAction.value.toLowerCase())
  )
})

const hasActiveFilters = computed(
  () => !!searchQuery.value.trim() || selectedAction.value !== 'all'
)

function resetFilters() {
  searchQuery.value = ''
  selectedAction.value = 'all'
  page.value = 1
  refresh()
}

function handleSearch() {
  page.value = 1
  refresh()
}

function clearSearch() {
  searchQuery.value = ''
  handleSearch()
}

watch(pageSize, () => {
  page.value = 1
})
</script>

<template>
  <div class="space-y-6">
    <header>
      <p class="mfu-eyebrow">
        Mutation evidence โดยไม่บันทึก token หรือ password
      </p>
      <h1 class="mt-2 text-3xl font-bold text-highlighted">Audit Log</h1>
    </header>

    <!-- Standardized Modern Multi-Filter Card -->
    <div
      class="rounded-xl border border-default bg-default p-4 shadow-sm space-y-3"
    >
      <form
        class="flex flex-col gap-3 md:flex-row md:items-center"
        @submit.prevent="handleSearch"
      >
        <!-- Live Search Input with Clear Button -->
        <div class="relative flex-1">
          <UInput
            v-model="searchQuery"
            class="w-full"
            icon="i-lucide-fingerprint"
            placeholder="ค้นหา Request ID, อีเมล Actor หรือการดำเนินการ..."
            size="md"
          >
            <template #trailing>
              <button
                v-if="searchQuery"
                type="button"
                class="text-muted hover:text-highlighted cursor-pointer p-0.5"
                title="ล้างคำค้นหา"
                @click="clearSearch"
              >
                <UIcon name="i-lucide-x" class="size-4" />
              </button>
            </template>
          </UInput>
        </div>

        <!-- Action Category Filter -->
        <div class="flex items-center gap-2">
          <label
            for="audit-action-filter"
            class="text-xs font-semibold text-muted whitespace-nowrap"
            >หมวด Action:</label
          >
          <select
            id="audit-action-filter"
            v-model="selectedAction"
            class="rounded-lg border border-default bg-default px-3 py-2 text-xs text-highlighted focus:outline-none focus:ring-1 focus:ring-primary font-medium"
          >
            <option value="all">ทุก Action</option>
            <option value="auth">การเข้าสู่ระบบ (Auth)</option>
            <option value="create">การสร้างข้อมูล (Create)</option>
            <option value="update">การแก้ไขข้อมูล (Update)</option>
            <option value="delete">การลบข้อมูล (Delete)</option>
            <option value="patch">การปรับปรุง (Patch)</option>
          </select>
        </div>

        <UButton
          icon="i-lucide-search"
          label="ค้นหา"
          :loading="pending"
          size="md"
          type="submit"
        />
      </form>

      <!-- Filter Summary & Reset Bar -->
      <div
        class="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-default/70 text-xs text-muted"
      >
        <div class="flex items-center gap-2">
          <span
            class="inline-flex items-center gap-1.5 font-medium text-highlighted"
          >
            <UIcon name="i-lucide-filter" class="size-3.5 text-primary" />
            <span>ผลการตรวจสอบ:</span>
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
    <UAlert
      v-if="error"
      color="error"
      icon="i-lucide-shield-alert"
      title="ไม่มีสิทธิ์หรือโหลด Audit ไม่สำเร็จ"
      variant="soft"
    />
    <UCard :ui="{ body: 'p-0 sm:p-0' }"
      ><div class="overflow-x-auto">
        <table class="data-table">
          <thead>
            <tr>
              <th>เวลา</th>
              <th>Actor</th>
              <th>Action</th>
              <th>Request ID</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="item in filteredItems" :key="item.id">
              <td class="whitespace-nowrap">
                {{ new Date(item.createdAt).toLocaleString('th-TH') }}
              </td>
              <td>{{ item.actorEmail }}</td>
              <td class="font-medium text-highlighted">{{ item.action }}</td>
              <td class="font-mono text-xs">{{ item.requestId }}</td>
            </tr>
            <tr v-if="!pending && !filteredItems.length">
              <td class="py-12 text-center text-muted" colspan="4">
                ไม่พบ Audit event
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
