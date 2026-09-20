<script setup lang="ts">
import type { FormSubmitEvent } from '@nuxt/ui'
import { z } from 'zod'

definePageMeta({ layout: 'app', middleware: 'auth' })

interface SmtpSettings {
  readonly enabled: boolean
  readonly source: 'database' | 'environment'
  readonly host: string
  readonly port: number
  readonly secure: boolean
  readonly username: string
  readonly from: string
  readonly passwordConfigured: boolean
  readonly effectivePasswordConfigured: boolean
  readonly version: number
  readonly updatedAt: string | null
  readonly updatedBy: string | null
}

interface SmtpTestResult {
  readonly id: string
  readonly status: 'queued' | 'sending' | 'sent' | 'failed'
  readonly configurationSource: 'database' | 'environment'
  readonly configurationVersion: number
  readonly failureCode: string | null
  readonly createdAt: string | null
  readonly completedAt: string | null
}

const formSchema = z.object({
  enabled: z.boolean(),
  host: z
    .string()
    .trim()
    .min(1, 'กรุณาระบุ SMTP host')
    .max(253)
    .regex(/^[a-zA-Z0-9.-]+$/, 'ระบุ hostname หรือ IP address เท่านั้น'),
  port: z.coerce.number().int().min(1).max(65_535),
  secure: z.boolean(),
  username: z.string().trim().max(320),
  password: z.string().max(1024),
  clearPassword: z.boolean(),
  sender: z.string().trim().min(3, 'กรุณาระบุอีเมลผู้ส่ง').max(320),
  version: z.number().int().min(0)
})

const testSchema = z.object({
  recipientEmail: z.string().trim().email('รูปแบบอีเมลไม่ถูกต้อง').max(320)
})

type SmtpForm = z.infer<typeof formSchema>
type TestForm = z.infer<typeof testSchema>

const api = useApi()
const auth = useAuthStore()
const toast = useToast()
const runtimeConfig = useRuntimeConfig()
const canManage = computed(() => auth.actor?.roles.includes('systemAdmin'))
const isProduction = computed(
  () =>
    String(runtimeConfig.public.appEnvironment).toLowerCase() === 'production'
)

const showPassword = ref(false)
const actionError = ref<string>()
const testResult = ref<SmtpTestResult>()
const testing = ref(false)

const {
  data: settings,
  error: loadError,
  pending
} = await useAsyncData('smtp-settings', async () => {
  if (!canManage.value) return null
  return api<SmtpSettings>('/system-settings/smtp')
})

const form = reactive<SmtpForm>({
  enabled: settings.value?.enabled ?? false,
  host: settings.value?.host ?? '',
  port: settings.value?.port ?? 1025,
  secure: settings.value?.secure ?? false,
  username: settings.value?.username ?? '',
  password: '',
  clearPassword: false,
  sender: settings.value?.from ?? '',
  version: settings.value?.version ?? 0
})
const testForm = reactive<TestForm>({ recipientEmail: auth.actor?.email ?? '' })

watch(
  settings,
  (value) => {
    if (!value) return
    Object.assign(form, {
      enabled: value.enabled,
      host: value.host,
      port: value.port,
      secure: value.secure,
      username: value.username,
      password: '',
      clearPassword: false,
      sender: value.from,
      version: value.version
    })
  },
  { immediate: true }
)

watch(
  () => auth.actor?.email,
  async (email) => {
    await nextTick()
    if (email && !testForm.recipientEmail) testForm.recipientEmail = email
  },
  { flush: 'post', immediate: true }
)

const sourceLabel = computed(() =>
  settings.value?.source === 'database'
    ? 'ค่าที่บันทึกในระบบ'
    : 'Environment ของเซิร์ฟเวอร์'
)

const sourceColor = computed(() =>
  settings.value?.source === 'database' ? 'primary' : 'neutral'
)

const testColor = computed(() => {
  if (testResult.value?.status === 'sent') return 'success'
  if (testResult.value?.status === 'failed') return 'error'
  return 'warning'
})

const connectionLabel = computed(() =>
  settings.value ? `${settings.value.host}:${settings.value.port}` : '—'
)

const securityLabel = computed(() =>
  settings.value?.secure
    ? 'TLS ตั้งแต่เริ่มเชื่อมต่อ'
    : 'TLS ตามความสามารถของเซิร์ฟเวอร์'
)

const credentialLabel = computed(() => {
  if (settings.value?.effectivePasswordConfigured) {
    return 'ใช้ข้อมูลรับรองที่เข้ารหัส'
  }
  if (settings.value?.username) return 'ระบุ Username โดยไม่มีรหัสผ่าน'
  return 'ไม่ต้องยืนยันตัวตน'
})

const lastUpdatedLabel = computed(() => {
  if (!settings.value?.updatedAt) return 'ยังไม่เคยบันทึก'
  return new Intl.DateTimeFormat('th-TH-u-ca-gregory', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'Asia/Bangkok'
  }).format(new Date(settings.value.updatedAt))
})

const testStatusLabel = computed(() => {
  if (testResult.value?.status === 'queued') return 'อยู่ในคิวรอส่ง'
  if (testResult.value?.status === 'sending') return 'กำลังเชื่อมต่อ SMTP'
  if (testResult.value?.status === 'sent') return 'ส่งอีเมลทดสอบแล้ว'
  if (testResult.value?.status === 'failed') return 'ส่งอีเมลทดสอบไม่สำเร็จ'
  return ''
})

const testStatusIcon = computed(() => {
  if (testResult.value?.status === 'sent') return 'i-lucide-circle-check'
  if (testResult.value?.status === 'failed') return 'i-lucide-circle-x'
  return 'i-lucide-clock'
})

const isDirty = computed(() => {
  const current = settings.value
  if (!current) return false
  return (
    form.enabled !== current.enabled ||
    form.host !== current.host ||
    form.port !== current.port ||
    form.secure !== current.secure ||
    form.username !== current.username ||
    form.sender !== current.from ||
    form.password.length > 0 ||
    form.clearPassword
  )
})

function resetForm(): void {
  const current = settings.value
  if (!current) return
  Object.assign(form, {
    enabled: current.enabled,
    host: current.host,
    port: current.port,
    secure: current.secure,
    username: current.username,
    password: '',
    clearPassword: false,
    sender: current.from,
    version: current.version
  })
  actionError.value = undefined
}

async function save(event: FormSubmitEvent<SmtpForm>): Promise<void> {
  actionError.value = undefined

  try {
    const password = event.data.password.trim()
    const saved = await api<SmtpSettings>('/system-settings/smtp', {
      method: 'PUT',
      body: {
        enabled: event.data.enabled,
        host: event.data.host,
        port: event.data.port,
        secure: event.data.secure,
        username: event.data.username,
        ...(password ? { password } : {}),
        clearPassword: event.data.clearPassword,
        from: event.data.sender,
        version: event.data.version
      }
    })
    settings.value = saved
    toast.add({
      title: 'บันทึกการตั้งค่า SMTP แล้ว',
      description:
        saved.source === 'database'
          ? 'Worker จะใช้ค่าที่บันทึกกับอีเมลชุดถัดไป'
          : 'Worker จะใช้ค่าจาก Environment ต่อไป',
      color: 'success',
      icon: 'i-lucide-circle-check'
    })
  } catch (error: unknown) {
    actionError.value = readApiError(error)
  }
}

async function sendTest(event: FormSubmitEvent<TestForm>): Promise<void> {
  actionError.value = undefined
  testing.value = true
  testResult.value = undefined

  try {
    testResult.value = await api<SmtpTestResult>('/system-settings/smtp/test', {
      method: 'POST',
      body: { recipientEmail: event.data.recipientEmail }
    })
    await pollTest(testResult.value.id)
  } catch (error: unknown) {
    actionError.value = readApiError(error)
  } finally {
    testing.value = false
  }
}

async function pollTest(testId: string): Promise<void> {
  for (let attempt = 0; attempt < 15; attempt += 1) {
    const result = await api<SmtpTestResult>(
      `/system-settings/smtp/tests/${testId}`
    )
    testResult.value = result

    if (result.status === 'sent') {
      toast.add({
        title: 'ส่งอีเมลทดสอบสำเร็จ',
        description: isProduction.value
          ? 'ตรวจสอบกล่องจดหมายผู้รับ'
          : 'ตรวจสอบอีเมลใน Mailpit ที่ localhost:8025',
        color: 'success',
        icon: 'i-lucide-send'
      })
      return
    }
    if (result.status === 'failed') return
    await new Promise((resolve) => setTimeout(resolve, 1000))
  }
}

function readApiError(error: unknown): string {
  if (
    typeof error === 'object' &&
    error !== null &&
    'data' in error &&
    typeof error.data === 'object' &&
    error.data !== null &&
    'error' in error.data &&
    typeof error.data.error === 'object' &&
    error.data.error !== null &&
    'message' in error.data.error &&
    typeof error.data.error.message === 'string'
  ) {
    return error.data.error.message
  }
  return 'ดำเนินการไม่สำเร็จ กรุณาลองใหม่'
}
</script>

<template>
  <div class="mx-auto max-w-6xl space-y-6 pb-10">
    <header
      class="overflow-hidden rounded-lg border border-default bg-elevated"
    >
      <div
        class="flex flex-col gap-5 px-5 py-6 sm:flex-row sm:items-center sm:justify-between sm:px-8 sm:py-7"
      >
        <div class="flex min-w-0 items-start gap-4">
          <div
            class="flex size-12 shrink-0 items-center justify-center rounded-lg bg-primary text-inverted"
          >
            <UIcon aria-hidden="true" class="size-6" name="i-lucide-mail" />
          </div>
          <div class="min-w-0">
            <p class="mfu-eyebrow">System integration</p>
            <h1
              class="mt-1 text-2xl font-bold text-highlighted sm:text-3xl sm:leading-10"
            >
              ตั้งค่าการส่งอีเมล
            </h1>
            <p class="mt-2 max-w-2xl text-sm leading-6 text-muted sm:text-base">
              เชื่อมต่อ SMTP สำหรับอีเมลแจ้งเตือนของระบบ
              ข้อมูลรับรองถูกเข้ารหัสและไม่แสดงกลับบนหน้าจอ
            </p>
          </div>
        </div>

        <div v-if="canManage" class="flex shrink-0 items-center gap-3">
          <div class="text-left sm:text-right">
            <p class="text-xs font-medium text-muted">แหล่งที่ใช้งาน</p>
            <p class="mt-1 text-sm font-semibold text-highlighted">
              {{ sourceLabel }}
            </p>
          </div>
          <UBadge
            :color="sourceColor"
            :icon="
              settings?.source === 'database'
                ? 'i-lucide-database'
                : 'i-lucide-server'
            "
            :label="
              settings?.source === 'database' ? 'Database' : 'Environment'
            "
            size="lg"
            variant="soft"
          />
        </div>
      </div>

      <div
        v-if="canManage"
        class="grid border-t border-default bg-muted/40 sm:grid-cols-3 sm:divide-x sm:divide-default"
      >
        <div
          class="flex items-center gap-3 border-b border-default px-5 py-4 sm:border-b-0"
        >
          <UIcon
            aria-hidden="true"
            class="size-5 shrink-0 text-primary"
            name="i-lucide-server"
          />
          <div class="min-w-0">
            <p class="text-xs font-medium text-muted">SMTP endpoint</p>
            <p class="truncate text-sm font-semibold text-highlighted">
              {{ connectionLabel }}
            </p>
          </div>
        </div>
        <div
          class="flex items-center gap-3 border-b border-default px-5 py-4 sm:border-b-0"
        >
          <UIcon
            aria-hidden="true"
            class="size-5 shrink-0 text-primary"
            name="i-lucide-shield-check"
          />
          <div class="min-w-0">
            <p class="text-xs font-medium text-muted">Connection security</p>
            <p class="text-sm font-semibold text-highlighted">
              {{ securityLabel }}
            </p>
          </div>
        </div>
        <div class="flex items-center gap-3 px-5 py-4">
          <UIcon
            aria-hidden="true"
            class="size-5 shrink-0 text-primary"
            name="i-lucide-lock-keyhole"
          />
          <div class="min-w-0">
            <p class="text-xs font-medium text-muted">Credentials</p>
            <p class="text-sm font-semibold text-highlighted">
              {{ credentialLabel }}
            </p>
          </div>
        </div>
      </div>
    </header>

    <UAlert
      v-if="!canManage"
      color="error"
      description="หน้านี้เปิดให้เฉพาะผู้ดูแลระบบที่มีสิทธิ์ system.config.manage"
      icon="i-lucide-shield-alert"
      title="ไม่มีสิทธิ์จัดการการตั้งค่า"
      variant="soft"
    />

    <template v-else>
      <UAlert
        :color="isProduction ? 'warning' : 'info'"
        :description="
          isProduction
            ? 'การส่งอีเมลทดสอบจะส่งไปยังผู้รับจริง ตรวจสอบผู้รับและค่าการเชื่อมต่อก่อนกดส่ง'
            : 'Development อนุญาตเฉพาะ localhost หรือ Mailpit อีเมลจะไม่ออกไปหาผู้รับจริง'
        "
        :icon="
          isProduction ? 'i-lucide-triangle-alert' : 'i-lucide-flask-conical'
        "
        :title="isProduction ? 'Production mail' : 'Development mail safety'"
        variant="soft"
      />

      <UAlert
        v-if="loadError || actionError"
        color="error"
        :description="
          actionError ?? 'โหลดการตั้งค่าไม่สำเร็จ กรุณารีเฟรชหน้าอีกครั้ง'
        "
        icon="i-lucide-circle-alert"
        title="ดำเนินการไม่สำเร็จ"
        variant="soft"
      />

      <div v-if="pending" class="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
        <USkeleton class="h-[44rem] rounded-lg" />
        <div class="space-y-6">
          <USkeleton class="h-72 rounded-lg" />
          <USkeleton class="h-64 rounded-lg" />
        </div>
      </div>

      <div
        v-else
        class="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_340px]"
      >
        <UCard :ui="{ body: 'p-0 sm:p-0' }">
          <template #header>
            <div class="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 class="text-lg font-semibold text-highlighted">
                  การตั้งค่าการส่ง
                </h2>
                <p class="mt-1 text-sm leading-5 text-muted">
                  กำหนดปลายทาง ผู้ส่ง และข้อมูลยืนยันตัวตน
                </p>
              </div>
              <UBadge
                :color="isDirty ? 'warning' : 'success'"
                :icon="
                  isDirty ? 'i-lucide-pencil-line' : 'i-lucide-circle-check'
                "
                :label="isDirty ? 'มีการเปลี่ยนแปลง' : 'บันทึกแล้ว'"
                variant="soft"
              />
            </div>
          </template>

          <UForm
            :schema="formSchema"
            :state="form"
            :disabled="pending"
            loading-auto
            @submit="save"
          >
            <section class="p-5 sm:p-6" aria-labelledby="smtp-mode-heading">
              <div
                class="flex flex-col gap-4 rounded-lg border p-4 sm:flex-row sm:items-center sm:justify-between"
                :class="
                  form.enabled
                    ? 'border-primary bg-primary/5'
                    : 'border-default bg-muted/50'
                "
              >
                <div class="flex min-w-0 items-start gap-3">
                  <div
                    class="flex size-10 shrink-0 items-center justify-center rounded-lg bg-elevated"
                  >
                    <UIcon
                      aria-hidden="true"
                      class="size-5 text-primary"
                      :name="
                        form.enabled ? 'i-lucide-database' : 'i-lucide-server'
                      "
                    />
                  </div>
                  <div>
                    <h3
                      id="smtp-mode-heading"
                      class="text-sm font-semibold text-highlighted"
                    >
                      {{
                        form.enabled
                          ? 'ใช้ค่าที่บันทึกในระบบ'
                          : 'ใช้ค่า Environment ของเซิร์ฟเวอร์'
                      }}
                    </h3>
                    <p class="mt-1 text-sm leading-5 text-muted">
                      {{
                        form.enabled
                          ? 'Worker จะอ่านค่าชุดนี้กับอีเมลชุดถัดไป'
                          : 'ค่าด้านล่างบันทึกได้ แต่ยังไม่ถูกนำไปใช้งาน'
                      }}
                    </p>
                  </div>
                </div>
                <USwitch
                  v-model="form.enabled"
                  label="เปิดใช้ค่าจากหน้านี้"
                  size="lg"
                />
              </div>
            </section>

            <section
              class="border-t border-default p-5 sm:p-6"
              aria-labelledby="smtp-endpoint-heading"
            >
              <div class="mb-5 flex items-start gap-3">
                <div
                  class="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary text-sm font-bold text-inverted"
                  aria-hidden="true"
                >
                  1
                </div>
                <div>
                  <h3
                    id="smtp-endpoint-heading"
                    class="font-semibold text-highlighted"
                  >
                    SMTP endpoint
                  </h3>
                  <p class="mt-1 text-sm leading-5 text-muted">
                    ระบุเซิร์ฟเวอร์และรูปแบบการเชื่อมต่อ
                  </p>
                </div>
              </div>

              <fieldset class="space-y-5">
                <legend class="sr-only">ข้อมูล SMTP server</legend>
                <div class="grid gap-5 sm:grid-cols-[minmax(0,1fr)_9rem]">
                  <UFormField
                    description="ตัวอย่าง smtp.example.com หรือ localhost"
                    label="SMTP host"
                    name="host"
                    required
                  >
                    <UInput
                      v-model="form.host"
                      autocomplete="url"
                      class="w-full"
                      icon="i-lucide-server"
                      placeholder="smtp.example.com"
                      size="xl"
                    />
                  </UFormField>
                  <UFormField
                    description="1–65535"
                    label="Port"
                    name="port"
                    required
                  >
                    <UInput
                      v-model.number="form.port"
                      class="w-full"
                      inputmode="numeric"
                      max="65535"
                      min="1"
                      placeholder="587"
                      size="xl"
                      type="number"
                    />
                  </UFormField>
                </div>

                <div class="rounded-lg border border-default bg-muted/40 p-4">
                  <USwitch
                    v-model="form.secure"
                    description="เปิด TLS ตั้งแต่เริ่มเชื่อมต่อ เหมาะกับพอร์ต 465"
                    label="Secure connection (SSL/TLS)"
                    size="lg"
                  />
                </div>
              </fieldset>
            </section>

            <section
              class="border-t border-default p-5 sm:p-6"
              aria-labelledby="smtp-identity-heading"
            >
              <div class="mb-5 flex items-start gap-3">
                <div
                  class="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary text-sm font-bold text-inverted"
                  aria-hidden="true"
                >
                  2
                </div>
                <div>
                  <h3
                    id="smtp-identity-heading"
                    class="font-semibold text-highlighted"
                  >
                    ผู้ส่งและการยืนยันตัวตน
                  </h3>
                  <p class="mt-1 text-sm leading-5 text-muted">
                    กำหนดชื่อผู้ส่งและบัญชีที่ใช้เชื่อมต่อ SMTP
                  </p>
                </div>
              </div>

              <fieldset class="space-y-5">
                <legend class="sr-only">ข้อมูลผู้ส่งและบัญชี SMTP</legend>
                <UFormField
                  description="รองรับ no-reply@example.com หรือ Internship <no-reply@example.com>"
                  label="อีเมลผู้ส่ง"
                  name="sender"
                  required
                >
                  <UInput
                    v-model="form.sender"
                    autocomplete="email"
                    class="w-full"
                    icon="i-lucide-mail"
                    placeholder="Internship <no-reply@example.com>"
                    size="xl"
                    type="text"
                  />
                </UFormField>

                <div class="grid gap-5 md:grid-cols-2">
                  <UFormField
                    description="เว้นว่างได้ เมื่อเซิร์ฟเวอร์ไม่ต้องใช้บัญชี"
                    label="Username"
                    name="username"
                  >
                    <UInput
                      v-model="form.username"
                      autocomplete="username"
                      class="w-full"
                      icon="i-lucide-user"
                      placeholder="smtp-user@example.com"
                      size="xl"
                    />
                  </UFormField>

                  <UFormField
                    :description="
                      settings?.passwordConfigured
                        ? 'เว้นว่างเพื่อใช้รหัสผ่านเดิม'
                        : 'กรอกเมื่อเซิร์ฟเวอร์ต้องยืนยันตัวตน'
                    "
                    label="Password"
                    name="password"
                  >
                    <UInput
                      v-model="form.password"
                      :autocomplete="
                        settings?.passwordConfigured
                          ? 'new-password'
                          : 'current-password'
                      "
                      class="w-full"
                      :disabled="form.clearPassword"
                      icon="i-lucide-key-round"
                      placeholder="••••••••••••"
                      size="xl"
                      :type="showPassword ? 'text' : 'password'"
                    >
                      <template #trailing>
                        <UButton
                          :aria-label="
                            showPassword ? 'ซ่อนรหัสผ่าน' : 'แสดงรหัสผ่าน'
                          "
                          :icon="
                            showPassword ? 'i-lucide-eye-off' : 'i-lucide-eye'
                          "
                          color="neutral"
                          size="sm"
                          type="button"
                          variant="ghost"
                          @click="showPassword = !showPassword"
                        />
                      </template>
                    </UInput>
                  </UFormField>
                </div>

                <div
                  class="flex items-start gap-3 rounded-lg border border-default bg-muted/40 p-4"
                >
                  <UIcon
                    aria-hidden="true"
                    class="mt-0.5 size-5 shrink-0 text-primary"
                    name="i-lucide-lock-keyhole"
                  />
                  <p class="text-sm leading-5 text-muted">
                    Password เป็นข้อมูลแบบ write-only ระบบเข้ารหัสก่อนจัดเก็บ
                    และจะไม่ส่งค่ากลับมาแสดงอีก
                  </p>
                </div>

                <USwitch
                  v-if="settings?.passwordConfigured"
                  v-model="form.clearPassword"
                  color="error"
                  description="ใช้เมื่อเปลี่ยนเป็น SMTP ที่ไม่ต้องมีรหัสผ่าน"
                  label="ลบรหัสผ่านที่บันทึกไว้เมื่อกดบันทึก"
                />
              </fieldset>
            </section>

            <footer
              class="flex flex-col gap-4 border-t border-default bg-muted/40 p-5 sm:flex-row sm:items-center sm:justify-between sm:p-6"
            >
              <div aria-live="polite" class="flex min-w-0 items-center gap-2">
                <UIcon
                  aria-hidden="true"
                  class="size-4 shrink-0"
                  :class="isDirty ? 'text-warning' : 'text-success'"
                  :name="
                    isDirty ? 'i-lucide-pencil-line' : 'i-lucide-circle-check'
                  "
                />
                <p class="text-sm text-muted">
                  {{
                    isDirty
                      ? 'มีการเปลี่ยนแปลงที่ยังไม่ได้บันทึก'
                      : `บันทึกล่าสุด ${lastUpdatedLabel}`
                  }}
                </p>
              </div>
              <div class="flex flex-col-reverse gap-3 sm:flex-row">
                <UButton
                  class="w-full sm:w-auto"
                  color="neutral"
                  :disabled="!isDirty"
                  icon="i-lucide-rotate-ccw"
                  label="คืนค่าเดิม"
                  size="xl"
                  type="button"
                  variant="ghost"
                  @click="resetForm"
                />
                <UButton
                  class="w-full sm:w-auto"
                  color="primary"
                  :disabled="!isDirty"
                  icon="i-lucide-save"
                  :label="
                    form.enabled ? 'บันทึกและเปิดใช้งาน' : 'บันทึกการตั้งค่า'
                  "
                  size="xl"
                  type="submit"
                />
              </div>
            </footer>
          </UForm>
        </UCard>

        <aside class="space-y-6 lg:sticky lg:top-6">
          <UCard>
            <template #header>
              <div class="flex items-center justify-between gap-3">
                <div class="flex items-center gap-3">
                  <div
                    class="flex size-10 items-center justify-center rounded-lg bg-muted"
                  >
                    <UIcon
                      aria-hidden="true"
                      class="size-5 text-primary"
                      name="i-lucide-activity"
                    />
                  </div>
                  <div>
                    <h2 class="font-semibold text-highlighted">
                      สถานะการตั้งค่า
                    </h2>
                    <p class="text-xs text-muted">ค่าที่ Worker จะใช้งาน</p>
                  </div>
                </div>
                <UBadge
                  color="neutral"
                  :label="`Version ${settings?.version ?? 0}`"
                  variant="soft"
                />
              </div>
            </template>

            <dl class="divide-y divide-default text-sm">
              <div class="py-3 first:pt-0">
                <dt class="text-xs font-medium text-muted">แหล่งการตั้งค่า</dt>
                <dd class="mt-1.5">
                  <UBadge
                    :color="sourceColor"
                    :label="sourceLabel"
                    variant="soft"
                  />
                </dd>
              </div>
              <div class="py-3">
                <dt class="text-xs font-medium text-muted">Server</dt>
                <dd
                  class="mt-1 font-mono text-sm font-semibold text-highlighted"
                >
                  {{ connectionLabel }}
                </dd>
              </div>
              <div class="py-3">
                <dt class="text-xs font-medium text-muted">ผู้ส่งที่ใช้งาน</dt>
                <dd
                  class="mt-1 [overflow-wrap:anywhere] font-medium text-highlighted"
                >
                  {{ settings?.from ?? '—' }}
                </dd>
              </div>
              <div class="grid grid-cols-2 gap-4 py-3">
                <div>
                  <dt class="text-xs font-medium text-muted">Version</dt>
                  <dd class="mt-1 font-mono font-semibold text-highlighted">
                    {{ settings?.version ?? 0 }}
                  </dd>
                </div>
                <div>
                  <dt class="text-xs font-medium text-muted">Password</dt>
                  <dd class="mt-1 font-medium text-highlighted">
                    {{
                      settings?.effectivePasswordConfigured
                        ? 'ตั้งค่าแล้ว'
                        : 'ไม่ใช้'
                    }}
                  </dd>
                </div>
              </div>
              <div class="pt-3">
                <dt class="text-xs font-medium text-muted">อัปเดตล่าสุด</dt>
                <dd class="mt-1 font-medium text-highlighted">
                  {{ lastUpdatedLabel }}
                </dd>
              </div>
            </dl>
          </UCard>

          <UCard>
            <template #header>
              <div class="flex items-start gap-3">
                <div
                  class="flex size-10 shrink-0 items-center justify-center rounded-lg bg-muted"
                >
                  <UIcon
                    aria-hidden="true"
                    class="size-5 text-primary"
                    name="i-lucide-send"
                  />
                </div>
                <div>
                  <h2 class="font-semibold text-highlighted">ส่งอีเมลทดสอบ</h2>
                  <p class="mt-1 text-xs leading-5 text-muted">
                    ใช้ค่าที่มีผลอยู่ตอนนี้ ไม่รวมค่าที่ยังไม่บันทึก
                  </p>
                </div>
              </div>
            </template>

            <UForm
              :schema="testSchema"
              :state="testForm"
              class="space-y-4"
              loading-auto
              @submit="sendTest"
            >
              <UFormField
                description="Development จะส่งเข้า Mailpit เท่านั้น"
                label="อีเมลผู้รับ"
                name="recipientEmail"
                required
              >
                <UInput
                  v-model="testForm.recipientEmail"
                  autocomplete="email"
                  class="w-full"
                  icon="i-lucide-at-sign"
                  placeholder="admin@example.com"
                  size="xl"
                  type="email"
                />
              </UFormField>
              <UButton
                block
                color="neutral"
                icon="i-lucide-send"
                label="ส่งอีเมลทดสอบ"
                :loading="testing"
                size="xl"
                type="submit"
                variant="soft"
              />
            </UForm>

            <UAlert
              v-if="testResult"
              class="mt-4"
              :color="testColor"
              :description="
                testResult.failureCode
                  ? `${testStatusLabel} · Error code: ${testResult.failureCode}`
                  : testStatusLabel
              "
              :icon="testStatusIcon"
              title="ผลการทดสอบ"
              variant="soft"
            />
          </UCard>
        </aside>
      </div>
    </template>
  </div>
</template>
