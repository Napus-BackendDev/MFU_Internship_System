<script setup lang="ts">
definePageMeta({ layout: 'public' })

interface Question {
  id: string
  label: { th: string; en: string }
  type: 'rating' | 'text' | 'boolean'
  required: boolean
  scaleMin?: number
  scaleMax?: number
}
interface Section {
  id: string
  title: { th: string; en: string }
  questions: Question[]
}
interface EvaluationView {
  assignment: {
    id: string
    studentId: string
    deadlineAt: string
    status: string
    questionSnapshot: Section[]
  }
  draft: {
    answers: Record<string, unknown>
    revision: number
  } | null
  evaluations?: Array<{
    answers: Record<string, unknown>
    submittedAt: string
  }>
  student?: {
    id: string
    studentId: string
    name: { th: string; en: string }
    email?: string
    company?: string
  } | null
}

const route = useRoute()
const api = useApi()
const auth = useAuthStore()

const view = ref<EvaluationView>()
const answers = reactive<Record<string, unknown>>({})
const revision = ref(0)
const loading = ref(true)
const saving = ref(false)
const submitting = ref(false)
const submitted = ref(false)
const confirming = ref(false)
const errorMessage = ref('')
const submitKey = ref('')

// PIN Verification State
const pinParts = ref<[string, string, string, string]>(['', '', '', ''])
const singlePinInput = ref('')
const useSingleInput = ref(false)
const pinVerifying = ref(false)
const pinError = ref('')
const pinInputs = ref<(HTMLInputElement | null)[]>([])
const lockoutCountdown = ref(0)
let lockoutTimer: ReturnType<typeof setInterval> | null = null

function startLockoutCountdown(seconds: number): void {
  if (lockoutTimer) clearInterval(lockoutTimer)
  lockoutCountdown.value = seconds
  lockoutTimer = setInterval(() => {
    lockoutCountdown.value -= 1
    if (lockoutCountdown.value <= 0) {
      if (lockoutTimer) clearInterval(lockoutTimer)
      lockoutTimer = null
      pinError.value = ''
    }
  }, 1000)
}

function formatCountdown(totalSeconds: number): string {
  const m = Math.floor(totalSeconds / 60)
  const s = totalSeconds % 60
  return `${m}:${s.toString().padStart(2, '0')} นาที`
}

onUnmounted(() => {
  if (lockoutTimer) clearInterval(lockoutTimer)
})

const fullPin = computed(() => {
  if (useSingleInput.value) {
    return singlePinInput.value.replace(/[^a-zA-Z0-9]/gu, '').toUpperCase()
  }
  return pinParts.value.join('')
})

function setPinInputRef(el: unknown, index: number): void {
  if (el && typeof el === 'object' && 'focus' in el) {
    pinInputs.value[index] = el as HTMLInputElement
  }
}

function onPinInput(event: Event, index: number): void {
  const target = event.target as HTMLInputElement
  const raw = target.value.replace(/[^a-zA-Z0-9]/gu, '').toUpperCase()

  // If user typed or pasted more than 4 chars into one box (e.g. pasted all 16 digits)
  if (raw.length > 4) {
    const full = raw.slice(0, 16)
    pinParts.value[0] = full.slice(0, 4)
    pinParts.value[1] = full.slice(4, 8)
    pinParts.value[2] = full.slice(8, 12)
    pinParts.value[3] = full.slice(12, 16)
    singlePinInput.value = full
    for (let i = 0; i < 4; i++) {
      if (pinInputs.value[i]) {
        pinInputs.value[i]!.value = pinParts.value[i] ?? ''
      }
    }
    const nextIdx = Math.min(Math.floor(full.length / 4), 3)
    pinInputs.value[nextIdx]?.focus()
    return
  }

  pinParts.value[index] = raw.slice(0, 4)
  target.value = pinParts.value[index]
  singlePinInput.value = pinParts.value.join('')

  if (raw.length >= 4 && index < 3) {
    const next = pinInputs.value[index + 1]
    if (next) {
      next.focus()
      next.select()
    }
  }
}

function onSinglePinInput(event: Event): void {
  const target = event.target as HTMLInputElement
  const clean = target.value
    .replace(/[^a-zA-Z0-9]/gu, '')
    .toUpperCase()
    .slice(0, 16)
  pinParts.value[0] = clean.slice(0, 4)
  pinParts.value[1] = clean.slice(4, 8)
  pinParts.value[2] = clean.slice(8, 12)
  pinParts.value[3] = clean.slice(12, 16)
  singlePinInput.value = clean
}

function onPinKeydown(event: KeyboardEvent, index: number): void {
  if (
    event.key === 'Backspace' &&
    (pinParts.value[index]?.length ?? 0) === 0 &&
    index > 0
  ) {
    const prev = pinInputs.value[index - 1]
    if (prev) {
      prev.focus()
    }
  }
}

function onPinPaste(event: ClipboardEvent): void {
  event.preventDefault()
  const pasted = event.clipboardData?.getData('text') ?? ''
  const clean = pasted.replace(/[^a-zA-Z0-9]/gu, '').toUpperCase()
  if (!clean) return

  pinParts.value[0] = clean.slice(0, 4)
  pinParts.value[1] = clean.slice(4, 8)
  pinParts.value[2] = clean.slice(8, 12)
  pinParts.value[3] = clean.slice(12, 16)
  singlePinInput.value = clean.slice(0, 16)

  for (let i = 0; i < 4; i++) {
    if (pinInputs.value[i]) {
      pinInputs.value[i]!.value = pinParts.value[i] ?? ''
    }
  }

  const lastIndex = Math.min(Math.floor(clean.length / 4), 3)
  const targetInput = pinInputs.value[lastIndex]
  if (targetInput) targetInput.focus()
}

async function verifyAndLoadPin(): Promise<void> {
  if (lockoutCountdown.value > 0) return

  if (fullPin.value.length < 16) {
    pinError.value = 'กรุณากรอกรหัส PIN ให้ครบ 16 ตัวอักษร'
    return
  }

  pinVerifying.value = true
  pinError.value = ''
  try {
    const result = await auth.verifyPin(fullPin.value)
    await loadAssignment(result.assignmentId)
  } catch (err: unknown) {
    const fetchErr = err as {
      data?: {
        error?: {
          message?: string
          code?: string
          details?: { retryAfter?: number }
        }
      }
      response?: {
        _data?: {
          error?: {
            message?: string
            code?: string
            details?: { retryAfter?: number }
          }
        }
      }
      message?: string
    }
    const errData = fetchErr.data?.error ?? fetchErr.response?._data?.error
    const apiMsg = errData?.message
    const retrySec = errData?.details?.retryAfter

    if (retrySec && retrySec > 0) {
      startLockoutCountdown(retrySec)
    }

    pinError.value =
      apiMsg ||
      (err instanceof Error
        ? err.message
        : 'รหัส PIN ไม่ถูกต้อง หรือไม่พบแบบฟอร์มที่มอบหมาย')
  } finally {
    pinVerifying.value = false
  }
}

async function loadAssignment(assignmentId: string): Promise<void> {
  loading.value = true
  errorMessage.value = ''
  try {
    view.value = await api<EvaluationView>(`/evaluations/${assignmentId}`)
    const existingAnswers =
      view.value.draft?.answers ??
      (view.value.evaluations && view.value.evaluations.length > 0
        ? (view.value.evaluations[0]?.answers ?? {})
        : {})
    Object.assign(answers, existingAnswers)
    revision.value = view.value.draft?.revision ?? 0
    submitKey.value = crypto.randomUUID()
    submitted.value = view.value.assignment.status === 'submitted'
  } catch {
    errorMessage.value =
      'ไม่สามารถโหลดแบบฟอร์มได้ กรุณาตรวจสอบสิทธิ์หรือโหลดใหม่'
  } finally {
    loading.value = false
  }
}

async function resetPinVerification(): Promise<void> {
  view.value = undefined
  submitted.value = false
  pinParts.value = ['', '', '', '']
  singlePinInput.value = ''
  pinError.value = ''
  errorMessage.value = ''
  if (auth.actor) await auth.logout()
  if (route.query.pin || route.query.assignment || route.query.token) {
    await navigateTo('/evaluate')
  }
}

onMounted(async () => {
  try {
    const token =
      typeof route.query.token === 'string' ? route.query.token : undefined
    const pinParam =
      typeof route.query.pin === 'string' ? route.query.pin : undefined

    if (token) {
      await auth.exchangeInvitation(token)
    } else if (pinParam) {
      const clean = pinParam.replace(/[^a-zA-Z0-9]/gu, '').toUpperCase()
      if (clean.length === 16) {
        pinParts.value = [
          clean.slice(0, 4),
          clean.slice(4, 8),
          clean.slice(8, 12),
          clean.slice(12, 16)
        ]
        await verifyAndLoadPin()
        return
      }
    } else if (!auth.actor) {
      try {
        await auth.load()
      } catch {
        // Safe to ignore when unauthenticated visitor visits /evaluate
      }
    }

    const assignmentId =
      auth.actor?.scope.assignmentId ??
      (typeof route.query.assignment === 'string'
        ? route.query.assignment
        : undefined)

    if (assignmentId) {
      await loadAssignment(assignmentId)
    }
  } catch {
    // If automatic loading fails, user stays on the PIN verification screen
  } finally {
    loading.value = false
  }
})

async function saveDraft(): Promise<void> {
  if (!view.value) return
  saving.value = true
  errorMessage.value = ''
  try {
    const draft = await api<{ revision: number }>(
      `/evaluations/${view.value.assignment.id}/draft`,
      { method: 'PUT', body: { answers, revision: revision.value } }
    )
    revision.value = draft.revision
  } catch {
    errorMessage.value =
      'บันทึกร่างไม่สำเร็จ อาจมีข้อมูลเวอร์ชันใหม่กว่า กรุณาโหลดหน้าใหม่'
  } finally {
    saving.value = false
  }
}

async function submitEvaluation(): Promise<void> {
  if (!view.value) return

  // Validate required questions before submitting
  for (const section of view.value.assignment.questionSnapshot) {
    for (const q of section.questions) {
      if (q.required) {
        const val = answers[q.id]
        if (val === undefined || val === null || val === '') {
          errorMessage.value = `กรุณาตอบคำถามบังคับ: "${q.label.th}" (${section.title.th})`
          confirming.value = false
          return
        }
      }
    }
  }

  submitting.value = true
  errorMessage.value = ''
  try {
    await api(`/evaluations/${view.value.assignment.id}/submit`, {
      method: 'POST',
      body: { answers },
      headers: { 'idempotency-key': submitKey.value }
    })
    submitted.value = true
    confirming.value = false
  } catch (err: unknown) {
    const msg =
      err instanceof Error
        ? err.message
        : 'ส่งไม่สำเร็จ กรุณาตรวจคำถามบังคับ กำหนดส่ง และสถานะ Assignment'
    errorMessage.value = msg
  } finally {
    submitting.value = false
  }
}

function ratingValues(question: Question): readonly number[] {
  const minimum = question.scaleMin ?? 1
  const maximum = question.scaleMax ?? 5
  return Array.from(
    { length: maximum - minimum + 1 },
    (_, index) => minimum + index
  )
}
</script>

<template>
  <UContainer class="max-w-3xl py-8 sm:py-12">
    <!-- 1. กำลังโหลดข้อมูลระบบ -->
    <div v-if="loading" class="grid min-h-96 place-items-center">
      <div class="text-center space-y-3">
        <UIcon
          aria-label="กำลังโหลด"
          class="size-9 animate-spin text-primary mx-auto"
          name="i-lucide-loader-circle"
        />
        <p class="text-sm text-muted">กำลังโหลดข้อมูลระบบประเมิน...</p>
      </div>
    </div>

    <!-- 2. หน้าจอส่งแบบประเมินเรียบร้อยแล้ว -->
    <UCard v-else-if="submitted && view">
      <div class="py-12 text-center space-y-4">
        <span
          class="mx-auto grid size-20 place-items-center rounded-full bg-emerald-500/10 text-emerald-600 dark:bg-emerald-500/20"
        >
          <UIcon class="size-10" name="i-lucide-circle-check" />
        </span>
        <div>
          <h1 class="text-2xl font-bold text-highlighted">
            ส่งผลการประเมินเรียบร้อยแล้ว
          </h1>
          <p class="mt-2 text-sm text-muted max-w-md mx-auto">
            ผลการประเมินของนักศึกษา
            <strong class="text-highlighted">
              {{ view.student?.name?.th || view.assignment.studentId }}
              ({{ view.student?.studentId || view.assignment.studentId }})
            </strong>
            ได้รับการบันทึกและล็อกเรียบร้อยแล้ว
          </p>
        </div>

        <!-- รายละเอียดแบบฟอร์มที่ส่งแล้วในโหมด Read-only (เปิดแสดงไว้ทันที) -->
        <div class="mt-8 text-left border-t border-default pt-6 space-y-5">
          <div class="flex items-center justify-between">
            <h2
              class="text-base font-bold text-highlighted flex items-center gap-2"
            >
              <UIcon
                name="i-lucide-clipboard-check"
                class="size-5 text-emerald-600"
              />
              สรุปคำตอบและผลคะแนนที่ประเมิน (Review)
            </h2>
            <UBadge color="success" size="xs" variant="subtle">
              บันทึกเรียบร้อย
            </UBadge>
          </div>

          <div
            v-for="(section, sIdx) in view.assignment.questionSnapshot"
            :key="section.id"
            class="p-4 sm:p-5 rounded-xl border border-default bg-muted/20 space-y-3"
          >
            <h3
              class="text-sm font-semibold text-highlighted flex items-center gap-2"
            >
              <span
                class="grid size-6 place-items-center rounded-full bg-primary/10 text-xs text-primary font-bold"
              >
                {{ sIdx + 1 }}
              </span>
              {{ section.title.th }}
            </h3>

            <div class="space-y-2.5 pt-1">
              <div
                v-for="(q, qIdx) in section.questions"
                :key="q.id"
                class="flex flex-col sm:flex-row sm:items-center justify-between gap-1.5 text-xs border-b border-default/50 pb-2 last:border-0 last:pb-0"
              >
                <span class="text-muted leading-relaxed sm:max-w-md">
                  {{ qIdx + 1 }}. {{ q.label.th }}
                </span>
                <span
                  class="font-bold text-highlighted font-mono shrink-0 sm:text-right"
                >
                  {{
                    q.type === 'rating'
                      ? `${answers[q.id] ?? '-'} / 5.0 คะแนน`
                      : q.type === 'boolean'
                        ? answers[q.id]
                          ? 'ผ่านเกณฑ์มาตรฐาน'
                          : 'ไม่ผ่านเกณฑ์'
                        : answers[q.id] || 'ไม่มีข้อความเพิ่มเติม'
                  }}
                </span>
              </div>
            </div>
          </div>
        </div>

        <!-- แถบปุ่มด้านล่าง: กรอก PIN นักศึกษาคนอื่น (ฝั่งซ้าย) และ กลับหน้าหลัก (ฝั่งขวา) -->
        <div
          class="pt-6 border-t border-default flex flex-col-reverse sm:flex-row sm:items-center justify-between gap-3"
        >
          <UButton
            color="neutral"
            icon="i-lucide-key-round"
            label="ประเมินนักศึกษาคนอื่น (กรอกรหัส PIN)"
            size="lg"
            variant="outline"
            @click="resetPinVerification"
          />
          <UButton
            color="primary"
            icon="i-lucide-home"
            label="กลับหน้าหลัก"
            size="lg"
            to="/"
          />
        </div>
      </div>
    </UCard>

    <!-- 3. หน้าจอกรอกรหัส PIN 16 หลัก (เมื่อยังไม่ได้เปิดฟอร์ม) -->
    <div v-else-if="!view" class="space-y-6">
      <div class="text-center max-w-xl mx-auto space-y-2">
        <span
          class="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-primary/10 text-primary mb-2"
        >
          <UIcon name="i-lucide-shield-check" class="size-3.5" />
          ระบบยืนยันตัวตนผู้ทำแบบฟอร์ม
        </span>
        <h1 class="text-2xl sm:text-3xl font-bold text-highlighted">
          สำหรับผู้ทำแบบฟอร์มประเมินการฝึกงาน
        </h1>
        <p class="text-sm text-muted leading-relaxed">
          กรุณากรอกรหัส PIN 16 หลัก
          ที่ได้รับมอบหมายจากผู้ดูแลระบบเพื่อเข้าทำแบบประเมินสมรรถนะนักศึกษา
        </p>
      </div>

      <UCard class="max-w-xl mx-auto border border-default/80 shadow-md">
        <template #header>
          <div class="flex items-center justify-between gap-3">
            <div class="flex items-center gap-3">
              <span
                class="grid size-10 place-items-center rounded-lg bg-secondary/15 text-secondary"
              >
                <UIcon name="i-lucide-key-round" class="size-5" />
              </span>
              <div>
                <h2 class="text-base font-semibold text-highlighted">
                  กรอกรหัสผ่าน PIN (16 หลัก)
                </h2>
                <p class="text-xs text-muted">
                  รูปแบบ 4 ช่อง หรือช่องเดียว (กดวางรหัส 16 ตัวได้ทันที)
                </p>
              </div>
            </div>

            <UButton
              color="neutral"
              icon="i-lucide-arrow-left"
              label="กลับหน้าล็อกอิน"
              size="xs"
              to="/login"
              variant="ghost"
            />
          </div>
        </template>

        <form class="space-y-6 py-2" @submit.prevent="verifyAndLoadPin">
          <!-- Lockout countdown banner -->
          <UAlert
            v-if="lockoutCountdown > 0"
            color="warning"
            icon="i-lucide-clock"
            :title="`ระบบระงับการตรวจสอบ PIN ชั่วคราวเนื่องจากกรอกผิดเกินจำนวนครั้ง กรุณารออีก ${formatCountdown(lockoutCountdown)} แล้วลองใหม่อีกครั้ง`"
            variant="soft"
          />
          <UAlert
            v-else-if="pinError"
            color="error"
            icon="i-lucide-circle-alert"
            :title="pinError"
            variant="soft"
          />

          <!-- PIN Inputs Area: Support both 4x4 segmented boxes and single box mode -->
          <div class="space-y-3">
            <div class="flex items-center justify-between">
              <label
                class="block text-xs font-semibold text-muted uppercase tracking-wider"
              >
                16-Character Verification PIN
              </label>
              <button
                type="button"
                :disabled="lockoutCountdown > 0"
                class="text-xs text-primary hover:underline cursor-pointer flex items-center gap-1 font-medium disabled:opacity-50 disabled:pointer-events-none"
                @click="useSingleInput = !useSingleInput"
              >
                <UIcon
                  :name="
                    useSingleInput
                      ? 'i-lucide-grid-2x2'
                      : 'i-lucide-rectangle-horizontal'
                  "
                  class="size-3.5"
                />
                {{
                  useSingleInput
                    ? 'เปลี่ยนเป็นแบบแยก 4 ช่อง'
                    : 'เปลี่ยนเป็นแบบช่องเดียว'
                }}
              </button>
            </div>

            <!-- Mode A: 4 Segmented PIN Inputs (4 x 4 = 16 characters) -->
            <div
              v-if="!useSingleInput"
              class="flex items-center justify-center gap-2 sm:gap-3"
              @paste="onPinPaste"
            >
              <div
                v-for="idx in [0, 1, 2, 3]"
                :key="idx"
                class="flex items-center gap-1.5 sm:gap-2"
              >
                <input
                  :ref="(el) => setPinInputRef(el, idx)"
                  :value="pinParts[idx]"
                  autocomplete="off"
                  :disabled="lockoutCountdown > 0 || pinVerifying"
                  class="w-14 sm:w-18 h-12 text-center font-mono text-base sm:text-lg font-bold tracking-widest rounded-lg border border-default bg-muted/20 focus:border-primary focus:bg-default focus:ring-2 focus:ring-primary/20 focus:outline-none transition-all uppercase cursor-text disabled:opacity-50 disabled:cursor-not-allowed disabled:bg-muted/40"
                  maxlength="16"
                  placeholder="••••"
                  spellcheck="false"
                  type="text"
                  @focus="(e) => (e.target as HTMLInputElement).select()"
                  @input="(e) => onPinInput(e, idx)"
                  @keydown="(e) => onPinKeydown(e, idx)"
                />
                <span
                  v-if="idx < 3"
                  class="font-mono text-muted text-lg font-bold select-none"
                >
                  -
                </span>
              </div>
            </div>

            <!-- Mode B: Single Full PIN Input (16 characters) -->
            <div v-else class="space-y-1">
              <input
                :value="singlePinInput"
                autocomplete="off"
                :disabled="lockoutCountdown > 0 || pinVerifying"
                class="w-full h-12 text-center font-mono text-base sm:text-lg font-bold tracking-widest rounded-lg border border-default bg-muted/20 focus:border-primary focus:bg-default focus:ring-2 focus:ring-primary/20 focus:outline-none transition-all uppercase px-4 cursor-text disabled:opacity-50 disabled:cursor-not-allowed disabled:bg-muted/40"
                maxlength="19"
                placeholder="กรอก PIN 16 หลัก"
                spellcheck="false"
                type="text"
                @focus="(e) => (e.target as HTMLInputElement).select()"
                @input="onSinglePinInput"
              />
              <p class="text-[11px] text-muted text-center">
                กรอกหรือวางรหัส 16 ตัวอักษรติดกันได้ทันที
              </p>
            </div>

            <div
              class="flex items-center justify-between px-1 text-xs text-muted pt-1"
            >
              <span
                >ความยาว: <strong>{{ fullPin.length }}</strong> / 16
                ตัวอักษร</span
              >
              <span
                v-if="fullPin.length === 16"
                class="text-emerald-600 font-medium inline-flex items-center gap-1"
              >
                <UIcon name="i-lucide-check-circle-2" class="size-3.5" />
                ครบ 16 ตัวอักษรแล้ว
              </span>
            </div>
          </div>

          <UButton
            block
            class="justify-center mt-2"
            color="primary"
            :disabled="lockoutCountdown > 0 || fullPin.length < 16"
            :icon="
              lockoutCountdown > 0 ? 'i-lucide-lock' : 'i-lucide-arrow-right'
            "
            :label="
              lockoutCountdown > 0
                ? `ระงับชั่วคราว (รออีก ${formatCountdown(lockoutCountdown)})`
                : 'ตรวจสอบรหัส PIN และเข้าสู่แบบฟอร์ม'
            "
            :loading="pinVerifying"
            size="lg"
            trailing
            type="submit"
          />
        </form>
      </UCard>
    </div>

    <!-- 4. หน้าจอทำแบบฟอร์มประเมินที่แอดมินกำหนดส่งให้ (เมื่อยืนยัน PIN สำเร็จ) -->
    <form v-else class="space-y-6" @submit.prevent>
      <!-- แถบด้านบน: ข้อมูลนักศึกษา และปุ่มสลับ PIN -->
      <div
        class="rounded-xl border border-default bg-default p-4 sm:p-5 shadow-sm space-y-3"
      >
        <div class="flex flex-wrap items-center justify-between gap-2">
          <div class="flex items-center gap-2">
            <UBadge
              :color="
                view.assignment.status === 'submitted'
                  ? 'success'
                  : view.assignment.status === 'reopened'
                    ? 'warning'
                    : 'info'
              "
              :label="
                view.assignment.status === 'submitted'
                  ? 'ส่งผลประเมินแล้ว'
                  : view.assignment.status === 'inProgress'
                    ? 'กำลังดำเนินการ'
                    : 'รอทำแบบฟอร์ม'
              "
              variant="subtle"
            />
            <span class="text-xs text-muted font-mono">
              Assignment: {{ view.assignment.id.slice(-8) }}
            </span>
          </div>

          <UButton
            color="neutral"
            icon="i-lucide-arrow-left"
            label="เปลี่ยนรหัส PIN / ออกจากฟอร์มนี้"
            size="xs"
            variant="ghost"
            @click="resetPinVerification"
          />
        </div>

        <div>
          <h1 class="text-2xl sm:text-3xl font-bold text-highlighted">
            แบบประเมินสมรรถนะการฝึกงาน
          </h1>
          <p class="text-sm text-muted mt-1">
            นักศึกษา:
            <strong class="text-highlighted">
              {{ view.student?.name?.th || view.assignment.studentId }}
              ({{ view.student?.studentId || view.assignment.studentId }})
            </strong>
            · กำหนดส่งภายใน:
            <span class="font-medium text-highlighted">
              {{ new Date(view.assignment.deadlineAt).toLocaleString('th-TH') }}
            </span>
          </p>
        </div>
      </div>

      <UAlert
        v-if="errorMessage"
        color="error"
        icon="i-lucide-circle-alert"
        :title="errorMessage"
        variant="soft"
      />

      <!-- แบบฟอร์มประเมินตาม Sections ที่แอดมินกำหนด Snapshot ไว้ -->
      <UCard
        v-for="(section, sectionIndex) in view.assignment.questionSnapshot"
        :key="section.id"
      >
        <template #header>
          <div class="flex items-center gap-3">
            <span
              class="grid size-8 place-items-center rounded-full bg-primary/10 text-sm font-semibold text-primary"
            >
              {{ sectionIndex + 1 }}
            </span>
            <h2 class="text-base sm:text-lg font-semibold text-highlighted">
              {{ section.title.th }}
            </h2>
          </div>
        </template>

        <div class="space-y-7">
          <fieldset
            v-for="(question, questionIndex) in section.questions"
            :key="question.id"
            class="space-y-3"
          >
            <legend
              class="font-medium text-sm sm:text-base text-highlighted leading-relaxed"
            >
              {{ questionIndex + 1 }}. {{ question.label.th }}
              <span
                v-if="question.required"
                aria-label="คำถามบังคับ"
                class="text-error"
                >*</span
              >
            </legend>

            <!-- Rating 1-5 -->
            <div v-if="question.type === 'rating'" class="flex flex-wrap gap-2">
              <label
                v-for="rating in ratingValues(question)"
                :key="rating"
                class="rating-option"
                :class="
                  answers[question.id] === rating ? 'rating-option-active' : ''
                "
              >
                <input
                  v-model.number="answers[question.id]"
                  class="sr-only"
                  :name="question.id"
                  :value="rating"
                  type="radio"
                />
                <span>{{ rating }}</span>
              </label>
            </div>

            <!-- Text Feedback -->
            <textarea
              v-else-if="question.type === 'text'"
              v-model="answers[question.id] as string"
              class="form-textarea"
              :placeholder="'พิมพ์ข้อเสนอแนะหรือความคิดเห็น...'"
              :required="question.required"
              rows="3"
            />

            <!-- Boolean / Checkbox -->
            <label
              v-else
              class="flex min-h-11 items-center gap-3 cursor-pointer"
            >
              <input
                v-model="answers[question.id] as boolean"
                class="size-5 accent-[var(--ui-primary)]"
                type="checkbox"
              />
              <span class="text-sm font-medium">ใช่ / ผ่านเกณฑ์มาตรฐาน</span>
            </label>
          </fieldset>
        </div>
      </UCard>

      <!-- แถบปุ่มบันทึกและส่ง Sticky ด้านล่าง -->
      <UCard class="sticky bottom-4 z-20 shadow-[var(--shadow-md)]">
        <div
          v-if="!confirming"
          class="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end"
        >
          <UButton
            color="neutral"
            icon="i-lucide-save"
            label="บันทึกร่าง"
            :loading="saving"
            size="lg"
            variant="outline"
            @click="saveDraft"
          />
          <UButton
            color="primary"
            icon="i-lucide-send"
            label="ตรวจสอบก่อนส่ง"
            size="lg"
            @click="confirming = true"
          />
        </div>

        <div
          v-else
          class="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between"
        >
          <div>
            <p class="font-semibold text-highlighted">ยืนยันส่งผลสุดท้าย?</p>
            <p class="text-sm text-muted">
              หลังส่งจะแก้ไขไม่ได้ เว้นแต่เจ้าหน้าที่เปิดใหม่ตามนโยบาย
            </p>
          </div>
          <div class="flex gap-2">
            <UButton
              color="neutral"
              label="ย้อนกลับ"
              variant="ghost"
              @click="confirming = false"
            />
            <UButton
              color="error"
              icon="i-lucide-lock-keyhole"
              label="ยืนยันและส่ง"
              :loading="submitting"
              @click="submitEvaluation"
            />
          </div>
        </div>
      </UCard>
    </form>
  </UContainer>
</template>
