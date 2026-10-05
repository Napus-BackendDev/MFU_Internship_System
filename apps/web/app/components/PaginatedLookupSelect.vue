<script setup lang="ts">
interface LookupItem {
  readonly id: string
  readonly code?: string
  readonly schoolCode?: string
  readonly programCode?: string
  readonly courseCode?: string
  readonly name?: { readonly th?: string; readonly en?: string }
  readonly semester?: string
  readonly academicYear?: number
  readonly status?: string
  readonly academicTermId?: string
  readonly academicTerm?: {
    readonly id: string
    readonly semester: string
    readonly academicYear: number
  }
}

interface LookupPage {
  readonly items: readonly LookupItem[]
  readonly meta: {
    readonly page: number
    readonly total: number
    readonly totalPages: number
  }
}

const props = withDefaults(
  defineProps<{
    apiPath: string
    modelValue: string
    label: string
    idQueryParam?: string
    query?: Readonly<Record<string, string | number | undefined>>
    emptyLabel?: string
    emptyValue?: string
    required?: boolean
    controlClass?: string
    disabled?: boolean
  }>(),
  {
    idQueryParam: '',
    query: () => ({}),
    emptyLabel: '',
    emptyValue: '',
    required: false,
    controlClass: '',
    disabled: false
  }
)

const emit = defineEmits<{
  'update:modelValue': [value: string]
  selected: [item: LookupItem | null]
}>()

const api = useApi()
const isOpen = ref(false)
const search = ref('')
const page = ref(1)
const items = ref<readonly LookupItem[]>([])
const selectedItem = ref<LookupItem | null>(null)
const total = ref(0)
const totalPages = ref(0)
const pending = ref(false)
const error = ref(false)
const selectedError = ref(false)
const containerRef = ref<HTMLElement | null>(null)
const searchInputRef = ref<HTMLInputElement | null>(null)

let requestVersion = 0
let selectedRequestVersion = 0
let searchTimer: ReturnType<typeof setTimeout> | undefined

function itemLabel(item: LookupItem): string {
  const code =
    item.schoolCode ?? item.programCode ?? item.courseCode ?? item.code
  const thaiName = item.name?.th
  const englishName = item.name?.en
  const name = thaiName
    ? `${thaiName}${englishName ? ` (${englishName})` : ''}`
    : (englishName ?? '')
  const term = [item.semester, item.academicYear]
    .filter((part) => part !== undefined && part !== '')
    .join(' ')
  return [code, name || term].filter(Boolean).join(' — ')
}

const visibleItems = computed(() => {
  if (
    !selectedItem.value ||
    items.value.some((item) => item.id === selectedItem.value?.id)
  ) {
    return items.value
  }
  return [selectedItem.value, ...items.value]
})

const selectedDisplayLabel = computed(() => {
  if (!props.modelValue || props.modelValue === props.emptyValue) {
    return props.emptyLabel || `เลือก${props.label}`
  }
  if (selectedItem.value && selectedItem.value.id === props.modelValue) {
    return itemLabel(selectedItem.value)
  }
  const inList = items.value.find((item) => item.id === props.modelValue)
  if (inList) {
    return itemLabel(inList)
  }
  return props.modelValue
})

async function loadPage(): Promise<void> {
  const version = ++requestVersion
  pending.value = true
  error.value = false
  try {
    const result = await api<LookupPage>(props.apiPath, {
      query: {
        ...props.query,
        page: page.value,
        pageSize: 25,
        search: search.value.trim() || undefined
      }
    })
    if (version !== requestVersion) return
    items.value = result.items
    total.value = result.meta.total
    totalPages.value = result.meta.totalPages
    const currentSelection = result.items.find(
      (item) => item.id === props.modelValue
    )
    if (currentSelection) selectedItem.value = currentSelection
  } catch {
    if (version === requestVersion) error.value = true
  } finally {
    if (version === requestVersion) pending.value = false
  }
}

async function loadSelected(id: string): Promise<void> {
  const version = ++selectedRequestVersion
  selectedError.value = false
  if (!id || id === props.emptyValue) {
    selectedItem.value = null
    emit('selected', null)
    return
  }
  const existing = items.value.find((item) => item.id === id)
  if (existing) {
    selectedItem.value = existing
    emit('selected', existing)
    return
  }
  selectedItem.value = null
  if (!props.idQueryParam || !/^[a-f\d]{24}$/i.test(id)) return

  try {
    const result = await api<LookupPage>(props.apiPath, {
      query: { [props.idQueryParam]: id, page: 1, pageSize: 1 }
    })
    if (version !== selectedRequestVersion) return
    const selected = result.items.find((item) => item.id === id)
    if (selected) {
      selectedItem.value = selected
      emit('selected', selected)
    }
  } catch {
    if (version === selectedRequestVersion) selectedError.value = true
  }
}

function selectItem(item: LookupItem | null): void {
  const value = item ? item.id : props.emptyValue
  selectedItem.value = item
  emit('update:modelValue', value)
  emit('selected', item)
  isOpen.value = false
}

const alignRight = ref(false)

function openDropdown(): void {
  if (props.disabled) return
  if (containerRef.value) {
    const rect = containerRef.value.getBoundingClientRect()
    alignRight.value = window.innerWidth - rect.left < 280
  }
  isOpen.value = true
  void nextTick(() => {
    searchInputRef.value?.focus()
  })
}

function toggleDropdown(): void {
  if (props.disabled) return
  if (isOpen.value) {
    isOpen.value = false
  } else {
    openDropdown()
  }
}

function scheduleSearch(): void {
  if (searchTimer) clearTimeout(searchTimer)
  if (page.value > 1) {
    page.value = 1
    return
  }
  searchTimer = setTimeout(() => void loadPage(), 250)
}

function handleClickOutside(event: MouseEvent | TouchEvent): void {
  if (
    isOpen.value &&
    containerRef.value &&
    !containerRef.value.contains(event.target as Node)
  ) {
    isOpen.value = false
  }
}

watch(
  () => JSON.stringify(props.query),
  () => scheduleSearch()
)
watch(search, scheduleSearch)
watch(page, () => void loadPage())
watch(
  () => props.modelValue,
  (id) => void loadSelected(id)
)

onMounted(() => {
  void loadPage()
  void loadSelected(props.modelValue)
  document.addEventListener('pointerdown', handleClickOutside)
})

onBeforeUnmount(() => {
  requestVersion += 1
  if (searchTimer) clearTimeout(searchTimer)
  document.removeEventListener('pointerdown', handleClickOutside)
})
</script>

<template>
  <div ref="containerRef" class="relative w-full">
    <!-- Trigger Button (Single clean select widget) -->
    <button
      type="button"
      :disabled="disabled"
      :aria-label="label"
      :aria-expanded="isOpen"
      class="w-full rounded-lg border border-default bg-default px-3 py-2 text-xs text-highlighted flex items-center justify-between gap-2 text-left focus:outline-none focus:ring-1 focus:ring-primary transition-all select-none"
      :class="[
        controlClass,
        {
          'ring-1 ring-primary border-primary': isOpen,
          'opacity-50 cursor-not-allowed': disabled,
          'cursor-pointer': !disabled
        }
      ]"
      @click="toggleDropdown"
      @keydown.down.prevent="openDropdown"
      @keydown.enter.prevent="toggleDropdown"
    >
      <span
        class="truncate"
        :class="{ 'text-muted': !modelValue || modelValue === emptyValue }"
      >
        {{ selectedDisplayLabel }}
      </span>
      <div class="flex items-center gap-1 shrink-0 text-muted">
        <UIcon
          v-if="pending"
          name="i-lucide-loader-circle"
          class="size-3.5 animate-spin text-primary"
        />
        <UIcon
          name="i-lucide-chevron-down"
          class="size-4 transition-transform duration-200"
          :class="{ 'rotate-180': isOpen }"
        />
      </div>
    </button>

    <!-- Hidden Input for Form Compatibility -->
    <input
      type="hidden"
      :value="modelValue || ''"
      :required="required && (!modelValue || modelValue === emptyValue)"
    />

    <!-- Dropdown Popover with Integrated Search -->
    <Transition
      enter-active-class="transition duration-100 ease-out"
      enter-from-class="transform scale-95 opacity-0"
      enter-to-class="transform scale-100 opacity-100"
      leave-active-class="transition duration-75 ease-in"
      leave-from-class="transform scale-100 opacity-100"
      leave-to-class="transform scale-95 opacity-0"
    >
      <div
        v-if="isOpen"
        class="absolute z-50 mt-1 w-full min-w-[260px] max-w-[480px] rounded-xl border border-default bg-default shadow-xl overflow-hidden focus:outline-none"
        :class="alignRight ? 'right-0' : 'left-0'"
      >
        <!-- Search Input Bar inside dropdown -->
        <div class="p-2 border-b border-default bg-muted/20">
          <div class="relative flex items-center">
            <UIcon
              name="i-lucide-search"
              class="absolute left-2.5 size-3.5 text-muted pointer-events-none"
            />
            <input
              ref="searchInputRef"
              v-model="search"
              type="search"
              :placeholder="`ค้นหา${label}…`"
              class="w-full rounded-lg border border-default bg-default pl-8 pr-7 py-1.5 text-xs text-highlighted placeholder:text-muted focus:outline-none focus:ring-1 focus:ring-primary"
              @keydown.esc="isOpen = false"
            />
            <button
              v-if="search"
              type="button"
              class="absolute right-2 text-muted hover:text-highlighted p-0.5 rounded"
              @click="search = ''"
            >
              <UIcon name="i-lucide-x" class="size-3.5" />
            </button>
          </div>
        </div>

        <!-- Options List -->
        <div class="max-h-60 overflow-y-auto p-1 text-xs divide-y divide-default/30">
          <!-- Empty/Default Choice (e.g. ทุกสำนักวิชา / -- เลือกสำนักวิชา --) -->
          <div v-if="emptyLabel" class="pb-1">
            <button
              type="button"
              class="w-full text-left px-3 py-2 rounded-lg transition-colors flex items-center justify-between gap-2"
              :class="
                !modelValue || modelValue === emptyValue
                  ? 'bg-primary/10 text-primary font-medium'
                  : 'text-highlighted hover:bg-muted/50'
              "
              @click="selectItem(null)"
            >
              <span class="truncate">{{ emptyLabel }}</span>
              <UIcon
                v-if="!modelValue || modelValue === emptyValue"
                name="i-lucide-check"
                class="size-4 text-primary shrink-0"
              />
            </button>
          </div>

          <!-- Loading state -->
          <div
            v-if="pending && !visibleItems.length"
            class="flex items-center justify-center gap-2 py-6 text-muted text-xs"
          >
            <UIcon
              name="i-lucide-loader-circle"
              class="size-4 animate-spin text-primary"
            />
            <span>กำลังโหลด…</span>
          </div>

          <!-- Error state -->
          <div
            v-else-if="error"
            role="alert"
            class="p-3 text-center text-xs text-error space-y-1"
          >
            <p>โหลดรายการไม่สำเร็จ</p>
            <button
              type="button"
              class="underline font-medium hover:text-primary"
              @click="loadPage"
            >
              ลองอีกครั้ง
            </button>
          </div>

          <!-- Empty Result -->
          <div
            v-else-if="!visibleItems.length"
            class="py-6 text-center text-muted text-xs"
          >
            ไม่พบข้อมูลที่ค้นหา
          </div>

          <!-- Items -->
          <div v-else class="pt-1 space-y-0.5">
            <button
              v-for="item in visibleItems"
              :key="item.id"
              type="button"
              class="w-full text-left px-3 py-2 rounded-lg transition-colors flex items-center justify-between gap-2"
              :class="
                modelValue === item.id
                  ? 'bg-primary/10 text-primary font-medium'
                  : 'text-highlighted hover:bg-muted/50'
              "
              @click="selectItem(item)"
            >
              <span class="truncate">{{ itemLabel(item) }}</span>
              <UIcon
                v-if="modelValue === item.id"
                name="i-lucide-check"
                class="size-4 text-primary shrink-0"
              />
            </button>
          </div>
        </div>

        <!-- Dropdown Footer: Total count & Compact Pagination -->
        <div
          class="flex items-center justify-between border-t border-default bg-muted/10 px-3 py-1.5 text-[11px] text-muted"
        >
          <span>
            {{ pending ? 'กำลังโหลด…' : `${total.toLocaleString()} รายการ` }}
          </span>
          <div v-if="totalPages > 1" class="flex items-center gap-1.5">
            <button
              type="button"
              class="rounded border border-default px-1.5 py-0.5 disabled:opacity-40 hover:bg-muted/40 transition-colors"
              :disabled="pending || page <= 1"
              :aria-label="`หน้าก่อนหน้า: ${label}`"
              @click.stop="page -= 1"
            >
              ก่อนหน้า
            </button>
            <span class="tabular-nums">{{ page }}/{{ totalPages }}</span>
            <button
              type="button"
              class="rounded border border-default px-1.5 py-0.5 disabled:opacity-40 hover:bg-muted/40 transition-colors"
              :disabled="pending || page >= totalPages"
              :aria-label="`หน้าถัดไป: ${label}`"
              @click.stop="page += 1"
            >
              ถัดไป
            </button>
          </div>
        </div>
      </div>
    </Transition>
  </div>
</template>
