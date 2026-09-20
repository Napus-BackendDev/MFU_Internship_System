<script setup lang="ts">
const props = withDefaults(
  defineProps<{
    page: number
    total: number
    pageSize?: number
    itemsName?: string
    pageSizeOptions?: readonly number[]
    showPageSize?: boolean
  }>(),
  {
    pageSize: 5,
    itemsName: 'รายการ',
    pageSizeOptions: () => [5, 10, 15, 20],
    showPageSize: true
  }
)

const emit = defineEmits<{
  (e: 'update:page' | 'update:pageSize', value: number): void
}>()

const totalPages = computed(() =>
  Math.max(1, Math.ceil(props.total / props.pageSize))
)

const startItem = computed(() => {
  if (props.total === 0) return 0
  return (props.page - 1) * props.pageSize + 1
})

const endItem = computed(() => {
  return Math.min(props.page * props.pageSize, props.total)
})

function setPage(p: number): void {
  if (p >= 1 && p <= totalPages.value && p !== props.page) {
    emit('update:page', p)
  }
}

function onPageSizeChange(size: number): void {
  if (size !== props.pageSize) {
    emit('update:pageSize', size)
    emit('update:page', 1)
  }
}
</script>

<template>
  <div
    v-if="total > 0"
    class="flex flex-wrap items-center justify-between gap-3 px-4 py-3 border-t border-default bg-muted/20 text-xs"
  >
    <div class="flex flex-wrap items-center gap-3 text-muted">
      <div>
        แสดง
        <span class="font-semibold text-highlighted"
          >{{ startItem }}-{{ endItem }}</span
        >
        จากทั้งหมด
        <span class="font-semibold text-highlighted">{{ total }}</span>
        {{ itemsName }}
      </div>

      <!-- ตัวเลือกกำหนดแสดง 5 10 15 20 -->
      <div
        v-if="showPageSize"
        class="flex items-center gap-1.5 border-l border-default pl-3"
      >
        <span class="text-xs text-muted">แสดงหน้าละ:</span>
        <div
          class="inline-flex items-center gap-0.5 rounded-full border border-default bg-default p-0.5 shadow-2xs"
        >
          <button
            v-for="opt in pageSizeOptions"
            :key="opt"
            type="button"
            :class="[
              'size-6 rounded-full inline-flex items-center justify-center text-xs font-medium transition-all cursor-pointer',
              pageSize === opt
                ? 'bg-primary text-inverted font-bold shadow-xs'
                : 'text-muted hover:text-highlighted hover:bg-muted/40'
            ]"
            @click="onPageSizeChange(opt)"
          >
            {{ opt }}
          </button>
        </div>
        <span class="text-xs text-muted">{{ itemsName }}</span>
      </div>
    </div>

    <div class="flex items-center gap-1.5">
      <UButton
        color="neutral"
        icon="i-lucide-chevron-left"
        label="ก่อนหน้า"
        size="xs"
        variant="subtle"
        class="rounded-full px-2.5"
        :disabled="page <= 1"
        @click="setPage(page - 1)"
      />

      <div class="flex items-center gap-1 px-1">
        <template v-for="p in totalPages" :key="p">
          <button
            v-if="
              totalPages <= 7 ||
              p === 1 ||
              p === totalPages ||
              Math.abs(p - page) <= 1
            "
            type="button"
            :class="[
              'size-7 rounded-full inline-flex items-center justify-center font-mono text-xs transition-all cursor-pointer select-none',
              p === page
                ? 'bg-primary text-inverted font-bold shadow-xs ring-2 ring-primary/25'
                : 'border border-default/80 bg-default/80 text-muted hover:text-highlighted hover:bg-muted/60 hover:border-default font-medium'
            ]"
            @click="setPage(p)"
          >
            {{ p }}
          </button>
          <span
            v-else-if="
              (p === 2 && page > 3) ||
              (p === totalPages - 1 && page < totalPages - 2)
            "
            class="size-7 inline-flex items-center justify-center text-muted select-none text-xs"
          >
            ...
          </span>
        </template>
      </div>

      <UButton
        color="neutral"
        trailing-icon="i-lucide-chevron-right"
        label="ถัดไป"
        size="xs"
        variant="subtle"
        class="rounded-full px-2.5"
        :disabled="page >= totalPages"
        @click="setPage(page + 1)"
      />
    </div>
  </div>
</template>
