<script setup lang="ts">
definePageMeta({ layout: 'app', middleware: 'auth' })
const route = useRoute()
await navigateTo({ path: '/app/evaluations/forms/create', query: route.query })
</script>

<template>
  <div class="p-8 text-center text-muted">
    <UIcon name="i-lucide-loader" class="size-6 animate-spin mx-auto mb-2" />
    <p class="text-sm">กำลังนำทางไปยังตัวสร้างแบบฟอร์ม...</p>
  </div>
</template>
