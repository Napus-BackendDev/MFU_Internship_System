<script setup lang="ts">
export interface SelectOption {
  readonly value: string | number
  readonly label: string
  readonly icon?: string
  readonly disabled?: boolean
  readonly group?: string
}

type RawOption = string | number | SelectOption

const props = withDefaults(
  defineProps<{
    modelValue: string | number | undefined | null
    options: readonly RawOption[]
    placeholder?: string
    searchPlaceholder?: string
    disabled?: boolean
    required?: boolean
    controlClass?: string
    ariaLabel?: string
  }>(),
  {
    placeholder: '-- กรุณาเลือก --',
    searchPlaceholder: 'ค้นหา…',
    disabled: false,
    required: false,
    controlClass: '',
    ariaLabel: 'เลือกรายการ'
  }
)

const emit = defineEmits<{
  'update:modelValue': [value: string | number]
  change: [value: string | number]
}>()

const isOpen = ref(false)
const search = ref('')
const containerRef = ref<HTMLElement | null>(null)
const searchInputRef = ref<HTMLInputElement | null>(null)

const normalizedOptions = computed<readonly SelectOption[]>(() => {
  return props.options.map((opt) => {
    if (typeof opt === 'string' || typeof opt === 'number') {
      return {
        value: opt,
        label: String(opt)
      }
    }
    return opt
  })
})

const selectedOption = computed(() => {
  return normalizedOptions.value.find(
    (opt) => String(opt.value) === String(props.modelValue)
  )
})

const displayLabel = computed(() => {
  if (selectedOption.value) {
    return selectedOption.value.label
  }
  return props.placeholder
})

const filteredOptions = computed(() => {
  const q = search.value.trim().toLowerCase()
  if (!q) return normalizedOptions.value
  return normalizedOptions.value.filter((opt) => {
    const labelMatch = opt.label.toLowerCase().includes(q)
    const valueMatch = String(opt.value).toLowerCase().includes(q)
    const groupMatch = opt.group ? opt.group.toLowerCase().includes(q) : false
    return labelMatch || valueMatch || groupMatch
  })
})

const groupedFilteredOptions = computed(() => {
  const groups: Array<{ groupName: string; items: SelectOption[] }> = []
  const noGroup: SelectOption[] = []

  for (const opt of filteredOptions.value) {
    if (!opt.group) {
      noGroup.push(opt)
    } else {
      let g = groups.find((grp) => grp.groupName === opt.group)
      if (!g) {
        g = { groupName: opt.group, items: [] }
        groups.push(g)
      }
      g.items.push(opt)
    }
  }

  return { groups, noGroup }
})

const alignRight = ref(false)

function openDropdown(): void {
  if (props.disabled) return
  if (containerRef.value) {
    const rect = containerRef.value.getBoundingClientRect()
    alignRight.value = window.innerWidth - rect.left < 260
  }
  isOpen.value = true
  search.value = ''
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

function selectOption(opt: SelectOption): void {
  if (opt.disabled) return
  emit('update:modelValue', opt.value)
  emit('change', opt.value)
  isOpen.value = false
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

onMounted(() => {
  document.addEventListener('pointerdown', handleClickOutside)
})

onBeforeUnmount(() => {
  document.removeEventListener('pointerdown', handleClickOutside)
})
</script>

<template>
  <div ref="containerRef" class="relative w-full">
    <!-- Trigger Button -->
    <button
      type="button"
      :disabled="disabled"
      :aria-label="ariaLabel"
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
      <div class="flex items-center gap-2 truncate">
        <UIcon
          v-if="selectedOption?.icon"
          :name="selectedOption.icon"
          class="size-3.5 shrink-0 text-primary"
        />
        <span
          class="truncate"
          :class="{
            'text-muted':
              modelValue === undefined ||
              modelValue === null ||
              modelValue === '' ||
              (!selectedOption && !modelValue)
          }"
        >
          {{ displayLabel }}
        </span>
      </div>
      <UIcon
        name="i-lucide-chevron-down"
        class="size-4 shrink-0 text-muted transition-transform duration-200"
        :class="{ 'rotate-180': isOpen }"
      />
    </button>

    <!-- Hidden Input for Form Compatibility -->
    <input
      type="hidden"
      :value="modelValue ?? ''"
      :required="required && (!modelValue || modelValue === '')"
    />

    <!-- Dropdown Popover -->
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
        class="absolute z-50 mt-1 w-full min-w-[240px] max-w-[480px] rounded-xl border border-default bg-default shadow-xl overflow-hidden focus:outline-none"
        :class="alignRight ? 'right-0' : 'left-0'"
      >
        <!-- Search Input Bar -->
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
              :placeholder="searchPlaceholder"
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
        <div class="max-h-60 overflow-y-auto p-1 text-xs">
          <!-- Empty State -->
          <div
            v-if="!filteredOptions.length"
            class="py-6 text-center text-muted text-xs"
          >
            ไม่พบข้อมูลที่ค้นหา
          </div>

          <template v-else>
            <!-- Items without group -->
            <button
              v-for="opt in groupedFilteredOptions.noGroup"
              :key="String(opt.value)"
              type="button"
              :disabled="opt.disabled"
              class="w-full text-left px-3 py-2 rounded-lg transition-colors flex items-center justify-between gap-2"
              :class="[
                opt.disabled
                  ? 'opacity-40 cursor-not-allowed'
                  : String(modelValue) === String(opt.value)
                    ? 'bg-primary/10 text-primary font-medium'
                    : 'text-highlighted hover:bg-muted/50'
              ]"
              @click="selectOption(opt)"
            >
              <div class="flex items-center gap-2 truncate">
                <UIcon
                  v-if="opt.icon"
                  :name="opt.icon"
                  class="size-3.5 shrink-0 text-primary"
                />
                <span class="truncate">{{ opt.label }}</span>
              </div>
              <UIcon
                v-if="String(modelValue) === String(opt.value)"
                name="i-lucide-check"
                class="size-4 text-primary shrink-0"
              />
            </button>

            <!-- Grouped Items -->
            <div
              v-for="grp in groupedFilteredOptions.groups"
              :key="grp.groupName"
              class="mt-1.5 pt-1.5 border-t border-default/40 first:mt-0 first:pt-0 first:border-0"
            >
              <div
                class="px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-muted select-none"
              >
                {{ grp.groupName }}
              </div>
              <button
                v-for="opt in grp.items"
                :key="String(opt.value)"
                type="button"
                :disabled="opt.disabled"
                class="w-full text-left px-3 py-2 rounded-lg transition-colors flex items-center justify-between gap-2"
                :class="[
                  opt.disabled
                    ? 'opacity-40 cursor-not-allowed'
                    : String(modelValue) === String(opt.value)
                      ? 'bg-primary/10 text-primary font-medium'
                      : 'text-highlighted hover:bg-muted/50'
                ]"
                @click="selectOption(opt)"
              >
                <div class="flex items-center gap-2 truncate">
                  <UIcon
                    v-if="opt.icon"
                    :name="opt.icon"
                    class="size-3.5 shrink-0 text-primary"
                  />
                  <span class="truncate">{{ opt.label }}</span>
                </div>
                <UIcon
                  v-if="String(modelValue) === String(opt.value)"
                  name="i-lucide-check"
                  class="size-4 text-primary shrink-0"
                />
              </button>
            </div>
          </template>
        </div>

        <!-- Footer -->
        <div
          class="flex items-center justify-between border-t border-default bg-muted/10 px-3 py-1.5 text-[11px] text-muted"
        >
          <span>{{ filteredOptions.length }} รายการ</span>
          <span v-if="search" class="text-[10px] text-primary">กำลังกรอง</span>
        </div>
      </div>
    </Transition>
  </div>
</template>
