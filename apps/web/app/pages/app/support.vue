<script setup lang="ts">
definePageMeta({ layout: 'app', middleware: 'auth' })

const faqs = [
  {
    label: 'การสร้างเกณฑ์ประเมินหมวดทั่วไปและหมวดพิเศษต่างกันอย่างไร?',
    content:
      'หมวดทั่วไป (General Core) จะเป็นเกณฑ์กลางที่นักศึกษาทุกคนจากทุกสำนักวิชาจะได้ทำข้อคำถามเหมือนกัน ส่วนหมวดพิเศษ (Specialized) จะขึ้นอยู่กับสำนักวิชาหรือหลักสูตรที่ระบุไว้เท่านั้น'
  },
  {
    label: 'หากต้องการแก้ไขสำนักวิชาหรือหลักสูตรต้องทำอย่างไร?',
    content:
      'สามารถเข้าสู่เมนู "สำนักวิชาและหลักสูตร" จากแถบเมนูด้านซ้าย เพื่อเพิ่ม แก้ไข หรือระงับการใช้งานสำนักวิชาและหลักสูตรได้ทันที (สำหรับผู้มีสิทธิ์ระดับ Admin/Staff)'
  },
  {
    label: 'ผู้ประเมินภายนอกเข้าสู่ระบบเพื่อประเมินนักศึกษาได้อย่างไร?',
    content:
      'เจ้าหน้าที่ส่งคำเชิญไปยังอีเมลของผู้ประเมิน ภายในมีลิงก์หน้าแบบประเมินและรหัส PIN 16 หลัก ผู้ประเมินกรอก PIN เพื่อเปิดแบบประเมินของนักศึกษาที่ได้รับมอบหมาย โดยไม่ต้องลงทะเบียนบัญชีล่วงหน้า หาก PIN หมดอายุหรือถูกเพิกถอน ให้ติดต่อเจ้าหน้าที่เพื่อขอคำเชิญใหม่'
  },
  {
    label: 'สามารถออกใบ Transcript การฝึกงานได้เมื่อใด?',
    content:
      'เมื่อผู้ประเมินหรืออาจารย์ที่ปรึกษาตอบแบบสอบถามครบทุกส่วน ระบบจะปรับสถานะจบการฝึกงานให้อัตโนมัติทันที จากนั้นนักศึกษาจึงสร้างและดาวน์โหลด Transcript ได้ โดยต้องมีแม่แบบที่เผยแพร่พร้อมใช้งาน'
  }
]

const toast = useToast()
const auth = useAuthStore()

const categoryLabels: Record<string, string> = {
  general: 'สอบถามข้อมูลทั่วไป',
  evaluation: 'ปัญหาเกี่ยวกับการประเมิน / แบบฟอร์ม',
  account: 'ปัญหาการเข้าสู่ระบบหรือสิทธิ์การใช้งาน',
  bug: 'แจ้งปัญหาการทำงานของระบบ (Bug)'
}

const feedback = reactive({
  category: 'general',
  subject: '',
  message: '',
  submitting: false
})

const isSuccessModalOpen = ref(false)
const sentDetails = ref({
  category: '',
  subject: '',
  body: '',
  mailtoUrl: '',
  gmailUrl: ''
})

const handleSubmitFeedback = () => {
  if (!feedback.subject.trim() || !feedback.message.trim()) {
    toast.add({
      title: 'กรุณากรอกข้อมูลให้ครบถ้วน',
      description: 'กรุณากรอกหัวข้อและรายละเอียดที่ต้องการสอบถาม',
      color: 'warning'
    })
    return
  }

  const targetEmail = 'Napus.dev@gmail.com'
  const categoryLabel = categoryLabels[feedback.category] || 'ทั่วไป'
  const senderName = auth.actor?.displayName || 'ผู้ใช้งานระบบ'
  const senderEmail = auth.actor?.email || 'ไม่ระบุอีเมล'
  const senderRoles = auth.actor?.roles?.join(', ') || 'ทั่วไป'
  const nowStr = new Date().toLocaleString('th-TH', { timeZone: 'Asia/Bangkok' })

  const mailSubject = `[MFU Internship - ${categoryLabel}] ${feedback.subject.trim()}`
  const mailBody = `เรียน ทีมงานพัฒนาและสนับสนุนระบบ (Napus.dev),

หมวดหมู่: ${categoryLabel}
ผู้ส่ง: ${senderName} (${senderEmail})
บทบาท: ${senderRoles}
วันที่แจ้ง: ${nowStr}

--------------------------------------------------
หัวข้อเรื่อง: ${feedback.subject.trim()}
รายละเอียดข้อความ:
${feedback.message.trim()}
--------------------------------------------------
ส่งจาก: ระบบ MFU Internship Transcript System (Support Portal)`

  const encodedSubject = encodeURIComponent(mailSubject)
  const encodedBody = encodeURIComponent(mailBody)
  const mailtoUrl = `mailto:${targetEmail}?subject=${encodedSubject}&body=${encodedBody}`
  const gmailUrl = `https://mail.google.com/mail/?view=cm&fs=1&to=${targetEmail}&su=${encodedSubject}&body=${encodedBody}`

  sentDetails.value = {
    category: categoryLabel,
    subject: mailSubject,
    body: mailBody,
    mailtoUrl,
    gmailUrl
  }

  if (import.meta.client) {
    window.location.href = mailtoUrl
  }

  isSuccessModalOpen.value = true

  toast.add({
    title: 'เตรียมส่งข้อความไปยัง Napus.dev@gmail.com',
    description: 'ระบบสร้างข้อความและเปิดโปรแกรมอีเมลเรียบร้อยแล้ว',
    color: 'success'
  })
}

const copyMessage = async () => {
  if (import.meta.client && navigator?.clipboard) {
    await navigator.clipboard.writeText(sentDetails.value.body)
    toast.add({
      title: 'คัดลอกข้อความสำเร็จ',
      description: 'ข้อความถูกคัดลอกไปยังคลิปบอร์ดแล้ว',
      color: 'success'
    })
  }
}

const handleFinish = () => {
  feedback.subject = ''
  feedback.message = ''
  feedback.category = 'general'
  isSuccessModalOpen.value = false
}
</script>

<template>
  <div class="space-y-6">
    <!-- Header -->
    <header
      class="flex flex-wrap items-end justify-between gap-4 border-b border-default pb-6"
    >
      <div>
        <p class="mfu-eyebrow">ระบบสนับสนุนผู้ใช้งาน</p>
        <h1 class="mt-2 text-3xl font-bold text-highlighted">
          ศูนย์ช่วยเหลือและการสนับสนุน (Support)
        </h1>
        <p class="mt-1 text-sm text-muted">
          คู่มือการใช้งาน คำถามที่พบบ่อย
          และช่องทางติดต่อประสานงานฝ่ายสนับสนุนระบบ
        </p>
      </div>
      <div class="flex items-center gap-2">
        <UButton
          color="neutral"
          icon="i-lucide-arrow-left"
          label="กลับหน้าหลัก"
          :to="$localePath('/app')"
          variant="outline"
        />
      </div>
    </header>

    <!-- Quick Contact Cards -->
    <div class="grid grid-cols-1 gap-4 sm:grid-cols-3">
      <UCard>
        <div class="flex items-start gap-3">
          <div
            class="grid size-10 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary"
          >
            <UIcon class="size-5" name="i-lucide-mail" />
          </div>
          <div>
            <h3 class="text-sm font-bold text-highlighted">อีเมลติดต่อ</h3>
            <p class="mt-1 text-xs text-muted">ติดต่อฝ่ายส่งเสริมการฝึกงาน</p>
            <a
              class="mt-2 block text-sm font-semibold text-primary hover:underline"
              href="mailto:internship@mfu.ac.th"
            >
              internship@mfu.ac.th
            </a>
          </div>
        </div>
      </UCard>

      <UCard>
        <div class="flex items-start gap-3">
          <div
            class="grid size-10 shrink-0 place-items-center rounded-lg bg-secondary/10 text-secondary"
          >
            <UIcon class="size-5" name="i-lucide-phone" />
          </div>
          <div>
            <h3 class="text-sm font-bold text-highlighted">โทรศัพท์ติดต่อ</h3>
            <p class="mt-1 text-xs text-muted">เวลาทำการ 08:30 - 16:30 น.</p>
            <p class="mt-2 text-sm font-semibold text-highlighted">
              0-5391-6000 ต่อ 1234
            </p>
          </div>
        </div>
      </UCard>

      <UCard>
        <div class="flex items-start gap-3">
          <div
            class="grid size-10 shrink-0 place-items-center rounded-lg bg-info/10 text-info"
          >
            <UIcon class="size-5" name="i-lucide-building-2" />
          </div>
          <div>
            <h3 class="text-sm font-bold text-highlighted">สถานที่ติดต่อ</h3>
            <p class="mt-1 text-xs text-muted">ศูนย์บริการการฝึกงานและสหกิจ</p>
            <p class="mt-2 text-sm font-medium text-muted">
              อาคาร D1 มหาวิทยาลัยแม่ฟ้าหลวง
            </p>
          </div>
        </div>
      </UCard>
    </div>

    <!-- Main Content: FAQs + Contact Form -->
    <div class="grid grid-cols-1 gap-8 lg:grid-cols-12">
      <!-- FAQ Section -->
      <div class="space-y-6 lg:col-span-7">
        <div>
          <h2 class="text-xl font-bold text-highlighted">
            คำถามที่พบบ่อย (FAQs)
          </h2>
          <p class="mt-1 text-xs text-muted">
            คำตอบสำหรับข้อสงสัยทั่วไปเกี่ยวกับการประเมินและการใช้งานระบบ
          </p>
        </div>

        <div class="space-y-3">
          <div
            v-for="(item, idx) in faqs"
            :key="idx"
            class="rounded-xl border border-default bg-default p-4 shadow-2xs transition-colors"
          >
            <div class="flex items-start gap-3">
              <span
                class="mt-0.5 grid size-6 shrink-0 place-items-center rounded-full bg-primary/10 text-xs font-bold text-primary"
              >
                Q
              </span>
              <div class="flex-1">
                <h3 class="text-sm font-bold text-highlighted leading-snug">
                  {{ item.label }}
                </h3>
                <p class="mt-2 text-xs text-muted leading-relaxed">
                  {{ item.content }}
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Submit Support Request Form -->
      <div class="space-y-6 lg:col-span-5">
        <div>
          <h2 class="text-xl font-bold text-highlighted">
            ส่งคำถาม / แจ้งปัญหา
          </h2>
          <p class="mt-1 text-xs text-muted">
            กรอกข้อมูลด้านล่างเพื่อให้ทีมงานประสานงานช่วยเหลือ
          </p>
        </div>

        <UCard>
          <form class="space-y-4" @submit.prevent="handleSubmitFeedback">
            <UAlert
              color="info"
              icon="i-lucide-mail"
              title="ส่งคำถาม / แจ้งปัญหาไปยัง Napus.dev@gmail.com"
              description="เมื่อกดส่ง ระบบจะจัดเตรียมข้อความพร้อมเปิดโปรแกรมอีเมลหรือเปิดส่งผ่าน Gmail ทันที"
            />
            <div>
              <label class="block text-xs font-semibold text-highlighted mb-1">
                หมวดหมู่เรื่องที่ติดต่อ
              </label>
              <select
                v-model="feedback.category"
                class="w-full rounded-md border border-default bg-default px-3 py-2 text-sm text-highlighted focus:outline-none focus:ring-2 focus:ring-primary"
              >
                <option value="general">สอบถามข้อมูลทั่วไป</option>
                <option value="evaluation">
                  ปัญหาเกี่ยวกับการประเมิน / แบบฟอร์ม
                </option>
                <option value="account">
                  ปัญหาการเข้าสู่ระบบหรือสิทธิ์การใช้งาน
                </option>
                <option value="bug">แจ้งปัญหาการทำงานของระบบ (Bug)</option>
              </select>
            </div>

            <div>
              <label class="block text-xs font-semibold text-highlighted mb-1">
                หัวข้อเรื่อง <span class="text-error">*</span>
              </label>
              <UInput
                v-model="feedback.subject"
                class="w-full"
                :ui="{ root: 'w-full', base: 'w-full' }"
                placeholder="ระบุหัวข้อเรื่องที่ต้องการติดต่อ..."
                size="md"
              />
            </div>

            <div>
              <label class="block text-xs font-semibold text-highlighted mb-1">
                รายละเอียดข้อความ <span class="text-error">*</span>
              </label>
              <textarea
                v-model="feedback.message"
                class="form-textarea w-full text-sm"
                placeholder="อธิบายรายละเอียดปัญหาหรือคำถามที่ต้องการให้ช่วยเหลือ..."
                rows="4"
              />
            </div>

            <UButton
              block
              color="primary"
              icon="i-lucide-send"
              label="ส่งข้อความถึงฝ่ายสนับสนุน"
              type="submit"
            />
          </form>
        </UCard>
      </div>
    </div>

    <!-- Success / Email Dispatch Modal -->
    <UModal
      v-model:open="isSuccessModalOpen"
      title="ส่งข้อความถึงฝ่ายสนับสนุนระบบ"
      :ui="{ content: 'sm:max-w-xl w-full' }"
    >
      <template #body>
        <div class="space-y-4">
          <div class="rounded-lg border border-default bg-muted/20 p-3 space-y-2 text-xs">
            <div class="flex items-center justify-between">
              <span class="font-semibold text-highlighted">ปลายทาง:</span>
              <span class="font-mono text-primary font-semibold">Napus.dev@gmail.com</span>
            </div>
            <div class="flex items-center justify-between">
              <span class="font-semibold text-highlighted">หมวดหมู่:</span>
              <span class="text-muted">{{ sentDetails.category }}</span>
            </div>
            <div>
              <span class="font-semibold text-highlighted">หัวข้อ:</span>
              <p class="mt-0.5 text-highlighted font-medium truncate">{{ sentDetails.subject }}</p>
            </div>
          </div>

          <div>
            <label class="block text-xs font-semibold text-highlighted mb-1">
              ตัวอย่างข้อความที่จัดเตรียมไว้
            </label>
            <textarea
              :value="sentDetails.body"
              readonly
              rows="6"
              class="form-textarea w-full text-xs font-mono bg-default text-muted select-all"
            />
          </div>

          <div class="flex flex-col sm:flex-row gap-2 pt-2">
            <UButton
              color="primary"
              icon="i-lucide-external-link"
              label="เปิดส่งด้วย Gmail (เว็บ)"
              class="flex-1 justify-center"
              :to="sentDetails.gmailUrl"
              target="_blank"
            />
            <UButton
              color="neutral"
              variant="outline"
              icon="i-lucide-mail"
              label="เปิดโปรแกรมเมลในเครื่อง"
              class="flex-1 justify-center"
              :to="sentDetails.mailtoUrl"
            />
            <UButton
              color="neutral"
              variant="ghost"
              icon="i-lucide-copy"
              label="คัดลอกข้อความ"
              @click="copyMessage"
            />
          </div>
        </div>
      </template>

      <template #footer>
        <div class="flex justify-end">
          <UButton
            color="primary"
            variant="solid"
            label="เสร็จสิ้น"
            @click="handleFinish"
          />
        </div>
      </template>
    </UModal>
  </div>
</template>
