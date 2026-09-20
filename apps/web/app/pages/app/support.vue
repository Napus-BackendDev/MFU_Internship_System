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
      'ระบบจะสร้างลิงก์การประเมินเฉพาะบุคคล (Evaluation Link) พร้อม Access Token ส่งตรงไปยังอีเมลของพี่เลี้ยงสถานประกอบการ โดยไม่ต้องลงทะเบียนบัญชีล่วงหน้า'
  },
  {
    label: 'สามารถออกใบ Transcript การฝึกงานได้เมื่อใด?',
    content:
      'ระบบจะสรุปผลและออก Transcript การฝึกงานได้เมื่อการประเมินทุกส่วนได้รับการส่งมอบและตรวจสอบยืนยันเรียบร้อยแล้ว'
  }
]

const toast = useToast()
const feedback = reactive({
  category: 'general',
  subject: '',
  message: '',
  submitting: false
})

const handleSubmitFeedback = () => {
  if (!feedback.subject || !feedback.message) {
    toast.add({
      title: 'กรุณากรอกข้อมูลให้ครบถ้วน',
      description: 'กรุณากรอกหัวข้อและรายละเอียดที่ต้องการสอบถาม',
      color: 'warning'
    })
    return
  }

  feedback.submitting = true
  setTimeout(() => {
    feedback.submitting = false
    feedback.subject = ''
    feedback.message = ''
    toast.add({
      title: 'ส่งคำขอสนับสนุนเรียบร้อยแล้ว',
      description:
        'เจ้าหน้าที่ผู้ดูแลระบบได้รับข้อความแล้ว และจะติดต่อกลับโดยเร็วที่สุด',
      color: 'success'
    })
  }, 600)
}
</script>

<template>
  <div class="mx-auto max-w-5xl space-y-8">
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
          to="/app"
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
              :loading="feedback.submitting"
              type="submit"
            />
          </form>
        </UCard>
      </div>
    </div>
  </div>
</template>
