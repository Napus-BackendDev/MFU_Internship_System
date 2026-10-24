<script setup lang="ts">
definePageMeta({ layout: 'app', middleware: 'auth' })
const localePath = useLocalePath()
await navigateTo(localePath('/app/evaluations'))
</script>

<template>
  <div class="p-8 text-center text-muted">
    <UIcon name="i-lucide-loader" class="size-6 animate-spin mx-auto mb-2" />
    <p class="text-sm">กำลังนำทางไปยังหน้าการประเมิน...</p>
  </div>
</template>
