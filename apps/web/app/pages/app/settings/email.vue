<script setup lang="ts">
definePageMeta({ layout: 'app', middleware: 'auth' })

interface SystemTemplateItem {
  id: string
  code: 'evaluation_request' | 'evaluation_reminder'
  name: string
  description: string
  subject: string
  html: string
  text: string
  placeholders: string[]
  versionId: string
  versionNumber: number
  updatedAt: string
}

const api = useApi()
const toast = useToast()

const activeTab = ref<'evaluation_request' | 'evaluation_reminder'>('evaluation_request')
const activeView = ref<'edit' | 'preview'>('edit')

const loading = ref(true)
const saving = ref(false)
const resetting = ref(false)
const templates = ref<Record<'evaluation_request' | 'evaluation_reminder', SystemTemplateItem>>({
  evaluation_request: {
    id: '',
    code: 'evaluation_request',
    name: 'ขอความอนุเคราะห์ประเมินผลการฝึกงาน / กรอกข้อมูลผู้ประเมิน',
    description: 'ส่งไปยังสถานประกอบการหรือผู้ประสานงาน เพื่อขอความอนุเคราะห์กรอกข้อมูลผู้ประเมินหรือเริ่มการประเมินนักศึกษา',
    subject: '',
    html: '',
    text: '',
    placeholders: [],
    versionId: '',
    versionNumber: 1,
    updatedAt: ''
  },
  evaluation_reminder: {
    id: '',
    code: 'evaluation_reminder',
    name: 'แจ้งเตือนการกรอกแบบประเมินผลการฝึกงาน',
    description: 'ส่งไปยังผู้ประเมินเพื่อแจ้งเตือนว่ายังไม่ได้กรอกแบบประเมิน หรือแบบประเมินยังไม่เสร็จสมบูรณ์',
    subject: '',
    html: '',
    text: '',
    placeholders: [],
    versionId: '',
    versionNumber: 1,
    updatedAt: ''
  }
})

// Editable draft forms for each template
const drafts = ref<Record<'evaluation_request' | 'evaluation_reminder', { subject: string; html: string; text: string }>>({
  evaluation_request: { subject: '', html: '', text: '' },
  evaluation_reminder: { subject: '', html: '', text: '' }
})

const currentTemplate = computed(() => templates.value[activeTab.value])
const currentDraft = computed(() => drafts.value[activeTab.value])

const availablePlaceholders = [
  { tag: '{{student_name}}', label: 'ชื่อนักศึกษา', example: 'นายกิตติภูมิ พงษ์ศิริ' },
  { tag: '{{student_id}}', label: 'รหัสนักศึกษา', example: '6531501001' },
  { tag: '{{company_name}}', label: 'สถานประกอบการ', example: 'บริษัท โบวองค์ แบบบอนวาเทอร์ลี่ จำกัด' },
  { tag: '{{evaluator_name}}', label: 'ชื่อผู้ประเมิน / ผู้รับ', example: 'คุณสมชาย ใจดี' },
  { tag: '{{invitation_url}}', label: 'ลิงก์ทำแบบประเมิน', example: 'http://localhost:8180/evaluate?token=sample...' },
  { tag: '{{pin}}', label: 'รหัส PIN', example: '2026501001' },
  { tag: '{{deadline}}', label: 'กำหนดส่ง', example: '12 พฤศจิกายน 2569' }
]

async function loadTemplates(): Promise<void> {
  loading.value = true
  try {
    const res = await api<SystemTemplateItem[]>('/email-templates/system')
    if (Array.isArray(res)) {
      for (const item of res) {
        if (item.code === 'evaluation_request' || item.code === 'evaluation_reminder') {
          templates.value[item.code] = item
          drafts.value[item.code] = {
            subject: item.subject,
            html: item.html,
            text: item.text
          }
        }
      }
    }
  } catch (err: unknown) {
    console.error('Failed to load email templates:', err)
    toast.add({
      title: 'โหลดแม่แบบอีเมลไม่สำเร็จ',
      description: 'เกิดข้อผิดพลาดในการโหลดข้อมูลจากเซิร์ฟเวอร์',
      color: 'error'
    })
  } finally {
    loading.value = false
  }
}

onMounted(() => {
  void loadTemplates()
})

function copyPlaceholder(tag: string): void {
  if (import.meta.client) {
    navigator.clipboard.writeText(tag)
    toast.add({
      title: 'คัดลอกตัวแปรแล้ว',
      description: `คัดลอก ${tag} ไปยังคลิปบอร์ดแล้ว`,
      color: 'success',
      icon: 'i-lucide-check'
    })
  }
}

function insertPlaceholder(tag: string): void {
  drafts.value[activeTab.value].html += ` ${tag}`
  copyPlaceholder(tag)
}

// Compute live preview with mock replacements
const renderedPreviewSubject = computed(() => {
  let sub = currentDraft.value.subject || ''
  for (const p of availablePlaceholders) {
    sub = sub.replaceAll(p.tag, p.example)
  }
  return sub
})

const renderedPreviewHtml = computed(() => {
  let body = currentDraft.value.html || ''
  for (const p of availablePlaceholders) {
    body = body.replaceAll(p.tag, p.example)
  }
  return body
})

async function saveTemplate(): Promise<void> {
  saving.value = true
  try {
    const code = activeTab.value
    const draft = drafts.value[code]
    const updated = await api<SystemTemplateItem>(`/email-templates/system/${code}`, {
      method: 'PUT',
      body: {
        subject: draft.subject,
        html: draft.html,
        text: draft.text || draft.subject
      }
    })

    if (updated) {
      templates.value[code] = updated
      toast.add({
        title: 'บันทึกแม่แบบอีเมลสำเร็จ',
        description: `อัปเดตแม่แบบ "${currentTemplate.value.name}" เรียบร้อยแล้ว`,
        color: 'success',
        icon: 'i-lucide-check'
      })
    }
  } catch (err: unknown) {
    console.error('Save failed:', err)
    toast.add({
      title: 'บันทึกไม่สำเร็จ',
      description: 'กรุณาตรวจสอบว่ามีตัวแปรแปลกปลอมหรือไม่',
      color: 'error'
    })
  } finally {
    saving.value = false
  }
}

async function resetTemplate(): Promise<void> {
  if (!confirm(`คุณต้องการคืนค่าเริ่มต้นของแม่แบบ "${currentTemplate.value.name}" หรือไม่?`)) {
    return
  }

  resetting.value = true
  try {
    const code = activeTab.value
    const reset = await api<SystemTemplateItem>(`/email-templates/system/${code}/reset`, {
      method: 'POST'
    })

    if (reset) {
      templates.value[code] = reset
      drafts.value[code] = {
        subject: reset.subject,
        html: reset.html,
        text: reset.text
      }
      toast.add({
        title: 'คืนค่าเริ่มต้นสำเร็จ',
        description: `แม่แบบ "${reset.name}" ถูกคืนค่าเริ่มต้นเรียบร้อยแล้ว`,
        color: 'info',
        icon: 'i-lucide-rotate-ccw'
      })
    }
  } catch (err: unknown) {
    console.error('Reset failed:', err)
    toast.add({
      title: 'คืนค่าเริ่มต้นไม่สำเร็จ',
      color: 'error'
    })
  } finally {
    resetting.value = false
  }
}
</script>

<template>
  <div class="space-y-6">
    <!-- Header -->
    <header class="flex flex-wrap items-end justify-between gap-4">
      <div>
        <p class="mfu-eyebrow">การตั้งค่าและแม่แบบอีเมลระบบ (System Email Templates)</p>
        <h1 class="mt-2 text-3xl font-bold text-highlighted">ตั้งค่าอีเมล</h1>
        <p class="mt-1 text-sm text-muted">
          จัดการแม่แบบอีเมล 2 ประเภทหลักของระบบสำหรับขอความอนุเคราะห์ประเมินและแจ้งเตือนผู้ประเมิน
        </p>
      </div>

      <div class="flex items-center gap-2">
        <UButton
          color="neutral"
          icon="i-lucide-mail"
          label="ดูประวัติการส่ง (Deliveries)"
          to="/app/correspondence"
          variant="outline"
        />
      </div>
    </header>

    <!-- Main Card -->
    <div class="rounded-xl border border-default bg-default shadow-sm overflow-hidden">
      <!-- Tabs Selector: Exactly 2 types as required -->
      <div class="flex border-b border-default bg-muted/20 px-4 pt-3 gap-2 overflow-x-auto">
        <button
          type="button"
          :class="[
            'inline-flex items-center gap-2 px-4 py-2.5 rounded-t-lg text-xs font-semibold border-b-2 transition-all cursor-pointer whitespace-nowrap',
            activeTab === 'evaluation_request'
              ? 'border-primary text-primary bg-default shadow-xs'
              : 'border-transparent text-muted hover:text-highlighted hover:bg-muted/40'
          ]"
          @click="activeTab = 'evaluation_request'"
        >
          <UIcon name="i-lucide-send" class="size-4 text-emerald-600" />
          <span>1. ขอความอนุเคราะห์ประเมินผล</span>
          <span class="rounded-full bg-emerald-500/10 text-emerald-600 text-[10px] px-2 py-0.5 font-normal">
            ยังไม่ได้ส่ง / เริ่มต้น
          </span>
        </button>

        <button
          type="button"
          :class="[
            'inline-flex items-center gap-2 px-4 py-2.5 rounded-t-lg text-xs font-semibold border-b-2 transition-all cursor-pointer whitespace-nowrap',
            activeTab === 'evaluation_reminder'
              ? 'border-primary text-primary bg-default shadow-xs'
              : 'border-transparent text-muted hover:text-highlighted hover:bg-muted/40'
          ]"
          @click="activeTab = 'evaluation_reminder'"
        >
          <UIcon name="i-lucide-bell-ring" class="size-4 text-amber-600" />
          <span>2. แจ้งเตือนการประเมิน</span>
          <span class="rounded-full bg-amber-500/10 text-amber-600 text-[10px] px-2 py-0.5 font-normal">
            ส่งแล้วยังไม่ตอบ
          </span>
        </button>
      </div>

      <!-- Loading State -->
      <div v-if="loading" class="p-12 text-center text-muted text-sm space-y-2">
        <UIcon name="i-lucide-loader-2" class="size-6 animate-spin mx-auto text-primary" />
        <p>กำลังโหลดข้อมูลแม่แบบอีเมล...</p>
      </div>

      <!-- Tab Content Area -->
      <div v-else class="p-6 space-y-6">
        <!-- Usage Guidance Banner -->
        <div
          v-if="activeTab === 'evaluation_request'"
          class="rounded-lg border border-emerald-500/30 bg-emerald-500/5 p-4 flex items-start gap-3"
        >
          <UIcon name="i-lucide-info" class="size-5 text-emerald-600 shrink-0 mt-0.5" />
          <div class="text-xs space-y-1">
            <p class="font-bold text-emerald-900 dark:text-emerald-300">
              ประเภทที่ 1: อีเมลขอความอนุเคราะห์ประเมินผลการฝึกงาน / กรอกข้อมูลผู้ประเมิน
            </p>
            <p class="text-emerald-800 dark:text-emerald-400 leading-relaxed">
              ระบบจะเลือกเทมเพลตนี้โดยอัตโนมัติเมื่อกดส่งอีเมลให้นักศึกษาที่
              <strong>ยังไม่ได้ส่งแบบประเมิน</strong> หรือยังอยู่ในขั้นตอนเริ่มต้น (สถานะ <code>pending</code> หรือ <code>awaiting_evaluator</code>)
              เพื่อส่งให้สถานประกอบการหรือผู้ประเมินเริ่มดำเนินการ
            </p>
          </div>
        </div>

        <div
          v-else
          class="rounded-lg border border-amber-500/30 bg-amber-500/5 p-4 flex items-start gap-3"
        >
          <UIcon name="i-lucide-alert-triangle" class="size-5 text-amber-600 shrink-0 mt-0.5" />
          <div class="text-xs space-y-1">
            <p class="font-bold text-amber-900 dark:text-amber-300">
              ประเภทที่ 2: อีเมลแจ้งเตือนการกรอกแบบประเมินผลการฝึกงาน
            </p>
            <p class="text-amber-800 dark:text-amber-400 leading-relaxed">
              ระบบจะเลือกเทมเพลตนี้โดยอัตโนมัติเมื่อกดส่งอีเมลให้นักศึกษาที่
              <strong>เคยส่งแบบประเมินไปแล้วแต่ผู้ประเมินยังไม่ได้ตอบ</strong> หรือแบบประเมินยังค้างอยู่ (สถานะ <code>inProgress</code> หรือ <code>awaiting_response</code>)
              เพื่อแจ้งเตือนให้เข้ามาดำเนินการก่อนถึงกำหนดส่ง
            </p>
          </div>
        </div>

        <!-- Available Placeholders Section -->
        <div class="rounded-lg border border-default bg-muted/20 p-4 space-y-2.5">
          <div class="flex items-center justify-between">
            <span class="text-xs font-semibold text-highlighted flex items-center gap-1.5">
              <UIcon name="i-lucide-variable" class="size-4 text-primary" />
              ตัวแปรที่สามารถแทรกในเนื้อหาได้ (คลิกเพื่อคัดลอกหรือแทรกลงในเนื้อหา):
            </span>
          </div>

          <div class="flex flex-wrap gap-2">
            <button
              v-for="p in availablePlaceholders"
              :key="p.tag"
              type="button"
              class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-mono border border-default bg-default hover:border-primary hover:text-primary transition-all cursor-pointer group"
              :title="`คลิกเพื่อแทรก ${p.tag} (${p.label})`"
              @click="insertPlaceholder(p.tag)"
            >
              <span class="text-primary font-bold">{{ p.tag }}</span>
              <span class="text-muted text-[11px]">({{ p.label }})</span>
              <UIcon name="i-lucide-plus" class="size-3 opacity-0 group-hover:opacity-100 transition-opacity" />
            </button>
          </div>
        </div>

        <!-- Editor / Preview Mode Tabs -->
        <div class="flex items-center justify-between border-b border-default pb-2">
          <div class="inline-flex p-0.5 rounded-lg border border-default bg-muted/30">
            <button
              type="button"
              :class="[
                'px-3 py-1 text-xs font-medium rounded-md transition-all cursor-pointer',
                activeView === 'edit'
                  ? 'bg-default text-highlighted shadow-2xs font-bold'
                  : 'text-muted hover:text-highlighted'
              ]"
              @click="activeView = 'edit'"
            >
              <UIcon name="i-lucide-edit-3" class="size-3.5 inline mr-1" />
              แก้ไขแม่แบบ (Editor)
            </button>
            <button
              type="button"
              :class="[
                'px-3 py-1 text-xs font-medium rounded-md transition-all cursor-pointer',
                activeView === 'preview'
                  ? 'bg-default text-highlighted shadow-2xs font-bold'
                  : 'text-muted hover:text-highlighted'
              ]"
              @click="activeView = 'preview'"
            >
              <UIcon name="i-lucide-eye" class="size-3.5 inline mr-1" />
              ดูตัวอย่างจริง (Live Preview)
            </button>
          </div>

          <span v-if="currentTemplate.versionNumber" class="text-xs text-muted font-mono">
            เวอร์ชัน: {{ currentTemplate.versionNumber }}
          </span>
        </div>

        <!-- 1. EDIT MODE -->
        <div v-show="activeView === 'edit'" class="space-y-4">
          <!-- Subject Input -->
          <div class="space-y-1.5">
            <label class="text-xs font-semibold text-highlighted flex items-center gap-1.5">
              <UIcon name="i-lucide-heading" class="size-3.5 text-primary" />
              หัวข้ออีเมล (Subject):
            </label>
            <input
              v-model="currentDraft.subject"
              type="text"
              class="w-full rounded-lg border border-default bg-default px-3 py-2 text-xs text-highlighted focus:outline-none focus:ring-1 focus:ring-primary font-medium"
              placeholder="ระบุหัวข้ออีเมล เช่น [มหาวิทยาลัยแม่ฟ้าหลวง] ขอความอนุเคราะห์..."
            />
          </div>

          <!-- HTML Body Editor -->
          <div class="space-y-1.5">
            <div class="flex items-center justify-between">
              <label class="text-xs font-semibold text-highlighted flex items-center gap-1.5">
                <UIcon name="i-lucide-code" class="size-3.5 text-primary" />
                เนื้อหาอีเมล (HTML & Template Body):
              </label>
              <span class="text-[11px] text-muted">รองรับ HTML Styling พร้อมตัวแปรอัตโนมัติ</span>
            </div>
            <textarea
              v-model="currentDraft.html"
              rows="16"
              class="w-full rounded-lg border border-default bg-default p-3 text-xs text-highlighted font-mono focus:outline-none focus:ring-1 focus:ring-primary leading-relaxed"
              placeholder="กรอกโค้ด HTML หรือข้อความของอีเมล..."
            ></textarea>
          </div>

          <!-- Text Fallback (Collapsible / Secondary) -->
          <details class="text-xs text-muted rounded-lg border border-default p-3">
            <summary class="cursor-pointer font-semibold text-highlighted flex items-center gap-1.5">
              <UIcon name="i-lucide-align-left" class="size-3.5" />
              ข้อความสำรอง (Plain Text Fallback)
            </summary>
            <div class="pt-2">
              <textarea
                v-model="currentDraft.text"
                rows="5"
                class="w-full rounded-lg border border-default bg-default p-2 text-xs text-highlighted font-mono focus:outline-none focus:ring-1 focus:ring-primary"
                placeholder="ข้อความธรรมดาสำหรับไคลเอนต์อีเมลที่ไม่รองรับ HTML..."
              ></textarea>
            </div>
          </details>
        </div>

        <!-- 2. PREVIEW MODE -->
        <div v-show="activeView === 'preview'" class="space-y-4">
          <!-- Mock Email Window -->
          <div class="rounded-xl border border-default bg-default shadow-sm overflow-hidden">
            <!-- Email Window Header -->
            <div class="bg-muted/30 border-b border-default p-4 space-y-2 text-xs">
              <div class="flex items-center gap-2">
                <span class="text-muted w-14 shrink-0">เรื่อง:</span>
                <span class="font-bold text-highlighted text-sm">{{ renderedPreviewSubject }}</span>
              </div>
              <div class="flex items-center gap-2 text-muted">
                <span class="w-14 shrink-0">จาก:</span>
                <span class="font-medium">มหาวิทยาลัยแม่ฟ้าหลวง &lt;internship@mfu.ac.th&gt;</span>
              </div>
              <div class="flex items-center gap-2 text-muted">
                <span class="w-14 shrink-0">ถึง:</span>
                <span class="font-medium text-highlighted">คุณสมชาย ใจดี &lt;evaluator.cos@milott.com&gt;</span>
              </div>
            </div>

            <!-- Email Body Render -->
            <div class="p-6 bg-white dark:bg-neutral-900 overflow-x-auto min-h-[350px]">
              <div v-html="renderedPreviewHtml"></div>
            </div>
          </div>
        </div>

        <!-- Action Footer -->
        <div class="flex flex-wrap items-center justify-between gap-3 pt-4 border-t border-default">
          <UButton
            color="neutral"
            icon="i-lucide-rotate-ccw"
            label="คืนค่าเริ่มต้น (Reset Default)"
            size="sm"
            variant="ghost"
            :loading="resetting"
            @click="resetTemplate"
          />

          <div class="flex items-center gap-2">
            <UButton
              color="primary"
              icon="i-lucide-save"
              label="บันทึกการเปลี่ยนแปลง"
              size="sm"
              :loading="saving"
              @click="saveTemplate"
            />
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
