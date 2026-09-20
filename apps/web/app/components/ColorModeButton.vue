<script setup lang="ts">
const colorMode = useColorMode()

const isDark = computed({
  get: () => colorMode.value === 'dark',
  set: (val: boolean) => {
    colorMode.preference = val ? 'dark' : 'light'
  }
})
</script>

<template>
  <ClientOnly>
    <UButton
      :aria-label="isDark ? 'สลับเป็นธีมสว่าง' : 'สลับเป็นธีมมืด'"
      class="size-10 shrink-0 items-center justify-center rounded-lg border border-default p-0 transition-colors"
      color="neutral"
      :icon="isDark ? 'i-lucide-moon' : 'i-lucide-sun'"
      size="md"
      variant="ghost"
      @click="isDark = !isDark"
    />
    <template #fallback>
      <div
        aria-hidden="true"
        class="size-10 shrink-0 rounded-lg border border-default bg-muted/20"
      />
    </template>
  </ClientOnly>
</template>
