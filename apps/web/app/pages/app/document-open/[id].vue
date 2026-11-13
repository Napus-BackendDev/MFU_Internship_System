<script setup lang="ts">
import { resolveSafeDownloadUrl } from '~/utils/safe-download-url'

// Stable link used by the Excel export: it signs a fresh short-lived URL on each
// visit, so the workbook never holds an expiring storage link.
definePageMeta({ layout: 'app', middleware: 'auth' })

const route = useRoute()
const api = useApi()
const errorMessage = ref('')

onMounted(async () => {
  const id = String(route.params.id ?? '')
  try {
    const response = await api<{ url: string }>(
      `/generated-documents/${encodeURIComponent(id)}/download-url`
    )
    const signedUrl = resolveSafeDownloadUrl(
      response.url,
      window.location.protocol
    )
    if (!signedUrl) throw new Error('ลิงก์เอกสารไม่ถูกต้อง')
    window.location.replace(signedUrl)
  } catch (error: unknown) {
    errorMessage.value =
      error instanceof Error ? error.message : 'เปิดเอกสารไม่สำเร็จ'
  }
})
</script>

<template>
  <div class="mx-auto max-w-xl py-16 text-center">
    <UAlert
      v-if="errorMessage"
      color="error"
      icon="i-lucide-circle-alert"
      title="เปิดเอกสารไม่สำเร็จ"
      :description="errorMessage"
    />
    <p v-else class="text-sm text-muted">กำลังเปิดเอกสาร...</p>
  </div>
</template>
