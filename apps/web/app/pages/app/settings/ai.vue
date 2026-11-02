<script setup lang="ts">
definePageMeta({ layout: 'app', middleware: 'auth' })

interface AiSettings {
  readonly enabled: boolean
  readonly provider: 'gemini'
  readonly model: string
  readonly prompt: string
  readonly apiKeyConfigured: boolean
  readonly version: number
  readonly updatedAt: string | null
}

const api = useApi()
const toast = useToast()

const {
  data: settings,
  error: loadError,
  pending,
  refresh
} = await useAsyncData('ai-settings', () =>
  api<AiSettings>('/system-settings/ai')
)

const form = reactive({
  enabled: false,
  model: '',
  prompt: '',
  apiKey: '',
  clearApiKey: false,
  version: 0
})
const saving = ref(false)
const testing = ref(false)
const actionError = ref<string>()

watch(
  settings,
  (value) => {
    if (!value) return
    Object.assign(form, {
      enabled: value.enabled,
      model: value.model,
      prompt: value.prompt,
      apiKey: '',
      clearApiKey: false,
      version: value.version
    })
  },
  { immediate: true }
)

async function save(): Promise<void> {
  saving.value = true
  actionError.value = undefined
  try {
    const { apiKey, ...rest } = form
    settings.value = await api<AiSettings>('/system-settings/ai', {
      method: 'PUT',
      body: { ...rest, ...(apiKey.trim() ? { apiKey: apiKey.trim() } : {}) }
    })
    toast.add({ title: 'บันทึกการตั้งค่า AI แล้ว', color: 'success' })
  } catch (error: unknown) {
    actionError.value =
      error instanceof Error ? error.message : 'บันทึกการตั้งค่าไม่สำเร็จ'
  } finally {
    saving.value = false
  }
}

async function testConnection(): Promise<void> {
  testing.value = true
  actionError.value = undefined
  try {
    await api('/system-settings/ai/test', { method: 'POST' })
    toast.add({ title: 'เชื่อมต่อ Gemini สำเร็จ', color: 'success' })
  } catch (error: unknown) {
    actionError.value =
      error instanceof Error ? error.message : 'เชื่อมต่อ Gemini ไม่สำเร็จ'
  } finally {
    testing.value = false
  }
}
</script>

<template>
  <div class="mx-auto max-w-3xl space-y-4">
    <UAlert
      v-if="loadError"
      color="error"
      icon="i-lucide-circle-alert"
      title="โหลดการตั้งค่า AI ไม่สำเร็จ"
      :actions="[{ label: 'ลองใหม่', onClick: () => refresh() }]"
    />
    <UAlert
      color="info"
      icon="i-lucide-shield-check"
      title="ข้อมูลที่ส่งให้ Google Gemini"
      description="ระบบส่งเฉพาะคำถามและข้อความข้อเสนอแนะของผู้ประเมินไปยัง Google ไม่ส่งชื่อหรือรหัสนักศึกษา ผู้ประเมิน และสถานประกอบการ แต่ข้อความที่ผู้ประเมินเขียนอาจมีชื่อบุคคลอยู่ ควรตรวจนโยบายข้อมูลก่อนเปิดใช้"
      variant="soft"
    />
    <UAlert
      v-if="actionError"
      color="error"
      icon="i-lucide-circle-alert"
      :title="actionError"
    />

    <UCard>
      <USkeleton v-if="pending" class="h-64 w-full" />
      <form v-else class="space-y-4" @submit.prevent="save">
        <USwitch
          v-model="form.enabled"
          label="เปิดใช้การสรุป Feedback ด้วย AI"
        />

        <UFormField label="โมเดล Gemini" name="model" required>
          <UInput
            v-model="form.model"
            class="w-full"
            placeholder="gemini-2.5-flash"
          />
        </UFormField>

        <UFormField
          label="Gemini API Key"
          name="apiKey"
          :help="
            settings?.apiKeyConfigured
              ? 'มีคีย์เก็บแบบเข้ารหัสแล้ว เว้นว่างเพื่อใช้คีย์เดิม'
              : 'ยังไม่มีคีย์ในระบบ'
          "
        >
          <UInput
            v-model="form.apiKey"
            autocomplete="off"
            class="w-full"
            type="password"
          />
        </UFormField>

        <UCheckbox
          v-if="settings?.apiKeyConfigured"
          v-model="form.clearApiKey"
          label="ลบคีย์ที่เก็บไว้"
        />

        <UFormField label="คำสั่งสำหรับการสรุป (Prompt)" name="prompt" required>
          <UTextarea v-model="form.prompt" class="w-full" :rows="6" />
        </UFormField>

        <div class="flex flex-wrap justify-end gap-2">
          <UButton
            color="neutral"
            icon="i-lucide-plug-zap"
            label="ทดสอบการเชื่อมต่อ"
            variant="outline"
            :disabled="!settings?.enabled || !settings?.apiKeyConfigured"
            :loading="testing"
            @click="testConnection"
          />
          <UButton
            icon="i-lucide-save"
            label="บันทึก"
            type="submit"
            :loading="saving"
          />
        </div>
      </form>
    </UCard>
  </div>
</template>
