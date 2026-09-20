<script setup lang="ts">
defineProps<{
  modelValue: boolean
}>()

const emit = defineEmits<{
  (e: 'update:modelValue', value: boolean): void
  (e: 'completed'): void
}>()

const auth = useAuthStore()
const toast = useToast()

const currentStep = ref<1 | 2 | 3>(1)

function handleComplete(): void {
  if (auth.actor?.id) {
    localStorage.setItem(`student_wizard_${auth.actor.id}`, 'completed')
  }
  emit('update:modelValue', false)
  emit('completed')
  toast.add({
    title: 'ยินดีต้อนรับเข้าสู่แดชบอร์ดนักศึกษา',
    description:
      'เริ่มต้นตรวจสอบข้อมูลการฝึกงานและดาวน์โหลดเอกสารของคุณได้ทันที',
    color: 'success',
    icon: 'i-lucide-check-check'
  })
}

function handleClose(): void {
  emit('update:modelValue', false)
}

function scrollToDocumentsSection(): void {
  handleComplete()
  if (import.meta.client) {
    setTimeout(() => {
      const el = document.getElementById('documents')
      if (el) {
        el.scrollIntoView({ behavior: 'smooth' })
      }
    }, 150)
  }
}
</script>

<template>
  <UModal
    :open="modelValue"
    :ui="{
      content: 'sm:max-w-3xl p-0 overflow-hidden'
    }"
    @update:open="emit('update:modelValue', $event)"
  >
    <template #content>
      <div
        class="flex flex-col h-full max-h-[90vh] bg-default text-highlighted"
      >
        <!-- Header: Student Wizard Progress & Title -->
        <header
          class="border-b border-default bg-gradient-to-r from-emerald-950 via-neutral-900 to-neutral-950 text-white p-5 sm:p-6"
        >
          <div class="flex items-start justify-between gap-4">
            <div class="space-y-1">
              <div class="flex items-center gap-2">
                <span
                  class="inline-flex items-center gap-1 rounded-full bg-emerald-500/20 px-2.5 py-0.5 text-xs font-semibold text-emerald-400 ring-1 ring-emerald-500/30"
                >
                  <UIcon class="size-3.5" name="i-lucide-sparkles" />
                  คู่มือสำหรับนักศึกษา
                </span>
                <span class="text-xs text-neutral-400">
                  แนะนำการใช้งานแดชบอร์ด 3 ขั้นตอนง่ายๆ
                </span>
              </div>
              <h2 class="text-xl sm:text-2xl font-bold tracking-tight">
                ยินดีต้อนรับสู่ระบบ Internship Portal
              </h2>
              <p
                class="text-xs sm:text-sm text-neutral-300 max-w-xl leading-relaxed"
              >
                เรียนรู้วิธีดูข้อมูลการฝึกงาน
                ตรวจสอบผลการประเมินจากสถานประกอบการ และจุดดาวน์โหลดเอกสารสำคัญ
              </p>
            </div>

            <UButton
              aria-label="ปิดคู่มือ"
              color="neutral"
              icon="i-lucide-x"
              size="sm"
              variant="ghost"
              @click="handleClose"
            />
          </div>

          <!-- Step Progress Indicator (3 Steps) -->
          <div
            class="mt-6 grid grid-cols-3 gap-2 pt-2 border-t border-white/10"
          >
            <div
              v-for="s in [
                {
                  num: 1,
                  label: '1. ข้อมูลแดชบอร์ด',
                  icon: 'i-lucide-layout-dashboard'
                },
                { num: 2, label: '2. ติดตามผลประเมิน', icon: 'i-lucide-award' },
                {
                  num: 3,
                  label: '3. ดาวน์โหลดเอกสาร 2 ฉบับ',
                  icon: 'i-lucide-file-text'
                }
              ]"
              :key="s.num"
              class="flex items-center gap-2 text-xs transition-colors"
              :class="[
                currentStep === s.num
                  ? 'text-emerald-400 font-semibold'
                  : currentStep > s.num
                    ? 'text-emerald-300'
                    : 'text-neutral-400'
              ]"
            >
              <span
                class="grid size-6 shrink-0 place-items-center rounded-full text-[11px] font-bold"
                :class="[
                  currentStep === s.num
                    ? 'bg-emerald-500 text-neutral-950 ring-2 ring-emerald-400/40'
                    : currentStep > s.num
                      ? 'bg-emerald-600 text-white'
                      : 'bg-white/10 text-neutral-300'
                ]"
              >
                <UIcon
                  v-if="currentStep > s.num"
                  class="size-3.5"
                  name="i-lucide-check"
                />
                <span v-else>{{ s.num }}</span>
              </span>
              <span class="truncate hidden sm:inline">{{ s.label }}</span>
            </div>
          </div>
        </header>

        <!-- Body Content by Step -->
        <main class="flex-1 overflow-y-auto p-5 sm:p-6 space-y-5">
          <!-- ============================================================= -->
          <!-- STEP 1: แดชบอร์ดและข้อมูลการฝึกงาน (Dashboard Overview) -->
          <!-- ============================================================= -->
          <section v-if="currentStep === 1" class="space-y-4">
            <div
              class="rounded-xl bg-emerald-500/10 border border-emerald-500/20 p-4"
            >
              <div class="flex items-start gap-3">
                <UIcon
                  class="size-5 text-emerald-600 mt-0.5 shrink-0"
                  name="i-lucide-layout-dashboard"
                />
                <div class="text-xs sm:text-sm space-y-1">
                  <p class="font-semibold text-highlighted">
                    ขั้นตอนที่ 1: แดชบอร์ดรวบรวมข้อมูลการฝึกงานของคุณ
                  </p>
                  <p class="text-muted leading-relaxed">
                    เมื่อเข้าสู่ระบบ
                    หน้านี้จะเป็นศูนย์กลางแสดงข้อมูลส่วนตัวของนักศึกษา
                    สังกัดสำนักวิชา หลักสูตร สถานที่ประกอบการ
                    และไทม์ไลน์ความก้าวหน้าของการฝึกงาน
                  </p>
                </div>
              </div>
            </div>

            <!-- Visual Preview Card for Step 1 -->
            <div
              class="rounded-xl border border-default bg-neutral-50 dark:bg-neutral-900/50 p-4 space-y-4"
            >
              <p
                class="text-xs font-semibold text-muted flex items-center gap-1.5"
              >
                <UIcon class="size-4 text-emerald-500" name="i-lucide-eye" />
                ตัวอย่างหน้าจอที่คุณจะได้เห็นในแดชบอร์ด:
              </p>

              <!-- Profile Simulation -->
              <div
                class="flex items-center gap-3 p-3 rounded-lg border border-default bg-default"
              >
                <span
                  class="grid size-11 place-items-center rounded-xl bg-primary/10 text-primary"
                >
                  <UIcon class="size-6" name="i-lucide-graduation-cap" />
                </span>
                <div class="min-w-0">
                  <div class="flex items-center gap-2">
                    <p class="font-bold text-sm text-highlighted truncate">
                      นายสมชาย ใจดี (6531501001)
                    </p>
                    <UBadge color="success" size="xs" variant="subtle">
                      กำลังฝึกงาน
                    </UBadge>
                  </div>
                  <p class="text-[11px] text-muted truncate">
                    สำนักวิชาเทคโนโลยีสารสนเทศ · บริษัท นวัตกรรมดิจิทัล จำกัด
                  </p>
                </div>
              </div>

              <!-- 4-Stage Lifecycle Timeline Simulation -->
              <div class="space-y-1.5 pt-1">
                <p class="text-[11px] font-semibold text-muted">
                  ไทม์ไลน์ติดตามสถานะ 4 ขั้นตอน:
                </p>
                <div class="grid grid-cols-4 gap-1.5 text-center text-[10px]">
                  <div
                    class="p-2 rounded bg-emerald-500/15 text-emerald-600 font-semibold border border-emerald-500/20"
                  >
                    ✓ 1. ยื่นคำร้อง
                  </div>
                  <div
                    class="p-2 rounded bg-emerald-500/15 text-emerald-600 font-semibold border border-emerald-500/20"
                  >
                    ✓ 2. ฝึกงาน
                  </div>
                  <div
                    class="p-2 rounded bg-amber-500/15 text-amber-600 font-semibold border border-amber-500/20"
                  >
                    ⏳ 3. รอประเมิน
                  </div>
                  <div
                    class="p-2 rounded bg-neutral-200 dark:bg-neutral-800 text-muted"
                  >
                    4. เสร็จสมบูรณ์
                  </div>
                </div>
              </div>
            </div>

            <p class="text-xs text-muted leading-relaxed">
              💡
              <strong>ข้อแนะนำ:</strong>
              หากข้อมูลสถานประกอบการหรือสำนักวิชาไม่ถูกต้อง
              สามารถติดต่อเจ้าหน้าที่ฝึกงานประจำสำนักวิชาเพื่อทำการปรับปรุงข้อมูลได้ทันที
            </p>
          </section>

          <!-- ============================================================= -->
          <!-- STEP 2: ติดตามผลประเมินและคะแนน (Evaluation Status) -->
          <!-- ============================================================= -->
          <section v-if="currentStep === 2" class="space-y-4">
            <div class="rounded-xl bg-primary/5 border border-primary/20 p-4">
              <div class="flex items-start gap-3">
                <UIcon
                  class="size-5 text-primary mt-0.5 shrink-0"
                  name="i-lucide-award"
                />
                <div class="text-xs sm:text-sm space-y-1">
                  <p class="font-semibold text-highlighted">
                    ขั้นตอนที่ 2: ติดตามผลการประเมินจากสถานประกอบการ
                  </p>
                  <p class="text-muted leading-relaxed">
                    เมื่อผู้ประเมินสถานประกอบการ (พี่เลี้ยง/Supervisor) กรอกรหัส
                    PIN 16 หลัก และทำการประเมินสมรรถนะเรียบร้อยแล้ว
                    ผลคะแนนและข้อคิดเห็นจะปรากฏขึ้นบนแดชบอร์ดของคุณแบบเรียลไทม์
                  </p>
                </div>
              </div>
            </div>

            <!-- Evaluation Simulation -->
            <div
              class="rounded-xl border border-default bg-neutral-50 dark:bg-neutral-900/50 p-4 space-y-3"
            >
              <div class="flex items-center justify-between">
                <div class="flex items-center gap-2">
                  <span
                    class="grid size-8 place-items-center rounded-lg bg-emerald-500/15 text-emerald-600"
                  >
                    <UIcon class="size-4" name="i-lucide-check-check" />
                  </span>
                  <div>
                    <p class="font-semibold text-xs text-highlighted">
                      สถานะแบบประเมิน: ได้รับผลการประเมินเรียบร้อยแล้ว
                    </p>
                    <p class="text-[10px] text-muted">
                      ประเมินโดยหัวหน้าทีมผู้ควบคุมการฝึกงาน
                    </p>
                  </div>
                </div>
                <UBadge color="success" size="xs" variant="solid">
                  เกรด A (4.85 / 5.00)
                </UBadge>
              </div>

              <!-- Competencies preview bar -->
              <div class="space-y-2 pt-2 border-t border-default/60">
                <div>
                  <div
                    class="flex justify-between text-[11px] font-medium text-highlighted mb-1"
                  >
                    <span>ทักษะทางเทคนิคและการแก้ปัญหา (Technical Skills)</span>
                    <span class="text-emerald-600 font-bold">5.0 / 5.0</span>
                  </div>
                  <div
                    class="h-2 w-full rounded-full bg-neutral-200 dark:bg-neutral-800 overflow-hidden"
                  >
                    <div class="h-full bg-emerald-500 rounded-full w-[100%]" />
                  </div>
                </div>

                <div>
                  <div
                    class="flex justify-between text-[11px] font-medium text-highlighted mb-1"
                  >
                    <span
                      >การทำงานร่วมกับผู้อื่นและการสื่อสาร (Communication &
                      Teamwork)</span
                    >
                    <span class="text-emerald-600 font-bold">4.8 / 5.0</span>
                  </div>
                  <div
                    class="h-2 w-full rounded-full bg-neutral-200 dark:bg-neutral-800 overflow-hidden"
                  >
                    <div class="h-full bg-emerald-500 rounded-full w-[96%]" />
                  </div>
                </div>
              </div>

              <div
                class="p-2.5 rounded-lg bg-default border border-default text-[11px] text-muted italic"
              >
                💬 ข้อคิดเห็นจากผู้ประเมิน: "นักศึกษามีความรับผิดชอบสูง
                เรียนรู้ระบบได้รวดเร็ว และสามารถส่งมอบงานได้ตรงตามเวลา"
              </div>
            </div>
          </section>

          <!-- ============================================================= -->
          <!-- STEP 3: จุดดาวน์โหลดเอกสารสำคัญ 2 ฉบับ (Downloads) -->
          <!-- ============================================================= -->
          <section v-if="currentStep === 3" class="space-y-4">
            <div
              class="rounded-xl bg-amber-500/10 border border-amber-500/20 p-4"
            >
              <div class="flex items-start gap-3">
                <UIcon
                  class="size-5 text-amber-600 mt-0.5 shrink-0"
                  name="i-lucide-file-down"
                />
                <div class="text-xs sm:text-sm space-y-1">
                  <p class="font-semibold text-highlighted">
                    ขั้นตอนที่ 3: จุดดาวน์โหลดเอกสารสำคัญ 2 ฉบับ (Word & PDF)
                  </p>
                  <p class="text-muted leading-relaxed">
                    ในหน้าแดชบอร์ด เลื่อนลงมาที่ส่วน
                    <strong>"เอกสารสำคัญที่สามารถดาวน์โหลดได้"</strong>
                    จะมีเอกสารให้คุณดาวน์โหลดและพิมพ์ใช้งาน 2
                    ฉบับอย่างเป็นทางการ
                  </p>
                </div>
              </div>
            </div>

            <!-- The 2 Documents Highlights -->
            <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <!-- Document 1: Certification -->
              <div
                class="rounded-xl border border-default bg-default p-4 flex flex-col justify-between space-y-3"
              >
                <div class="space-y-2">
                  <div class="flex items-center justify-between gap-2">
                    <span
                      class="grid size-9 place-items-center rounded-lg bg-amber-500/10 text-amber-600"
                    >
                      <UIcon class="size-5" name="i-lucide-award" />
                    </span>
                    <UBadge color="warning" size="xs" variant="subtle">
                      เอกสารที่ 1
                    </UBadge>
                  </div>
                  <div>
                    <h4 class="font-bold text-sm text-highlighted">
                      ใบรับรองการฝึกงาน (Certification)
                    </h4>
                    <p class="text-[11px] text-muted mt-0.5 leading-snug">
                      ออกให้โดยสำนักวิชาและมหาวิทยาลัย
                      รับรองผลการฝึกงานและเกรดที่ได้รับ
                    </p>
                  </div>
                </div>

                <div
                  class="pt-2 border-t border-default/60 flex items-center gap-1.5"
                >
                  <span
                    class="inline-flex items-center gap-1 text-[10px] font-semibold bg-neutral-100 dark:bg-neutral-800 px-2 py-1 rounded text-highlighted"
                  >
                    <UIcon
                      class="size-3 text-blue-500"
                      name="i-lucide-file-text"
                    />
                    Word (.doc)
                  </span>
                  <span
                    class="inline-flex items-center gap-1 text-[10px] font-semibold bg-neutral-100 dark:bg-neutral-800 px-2 py-1 rounded text-highlighted"
                  >
                    <UIcon
                      class="size-3 text-rose-500"
                      name="i-lucide-printer"
                    />
                    พิมพ์ / PDF
                  </span>
                </div>
              </div>

              <!-- Document 2: Official Referral Letter -->
              <div
                class="rounded-xl border border-default bg-default p-4 flex flex-col justify-between space-y-3"
              >
                <div class="space-y-2">
                  <div class="flex items-center justify-between gap-2">
                    <span
                      class="grid size-9 place-items-center rounded-lg bg-primary/10 text-primary"
                    >
                      <UIcon class="size-5" name="i-lucide-file-badge" />
                    </span>
                    <UBadge color="primary" size="xs" variant="subtle">
                      เอกสารที่ 2
                    </UBadge>
                  </div>
                  <div>
                    <h4 class="font-bold text-sm text-highlighted">
                      หนังสือส่งตัวนักศึกษาฝึกงาน (Referral Letter)
                    </h4>
                    <p class="text-[11px] text-muted mt-0.5 leading-snug">
                      หนังสือราชการจากผู้ดูแลระบบเพื่อส่งตัวเข้าฝึกงาน ณ
                      สถานประกอบการ
                    </p>
                  </div>
                </div>

                <div
                  class="pt-2 border-t border-default/60 flex items-center gap-1.5"
                >
                  <span
                    class="inline-flex items-center gap-1 text-[10px] font-semibold bg-neutral-100 dark:bg-neutral-800 px-2 py-1 rounded text-highlighted"
                  >
                    <UIcon
                      class="size-3 text-blue-500"
                      name="i-lucide-file-text"
                    />
                    Word (.doc)
                  </span>
                  <span
                    class="inline-flex items-center gap-1 text-[10px] font-semibold bg-neutral-100 dark:bg-neutral-800 px-2 py-1 rounded text-highlighted"
                  >
                    <UIcon
                      class="size-3 text-rose-500"
                      name="i-lucide-printer"
                    />
                    พิมพ์ / PDF
                  </span>
                </div>
              </div>
            </div>

            <div
              class="rounded-lg bg-neutral-100 dark:bg-neutral-800/60 p-3 text-xs text-muted flex items-center justify-between"
            >
              <span
                >✨ คุณสามารถคลิก
                <strong>"ดูตัวอย่างและพิมพ์"</strong> เพื่อตรวจสอบหน้ากระดาษ A4
                เสมือนจริง หรือดาวน์โหลดเป็นไฟล์
                <strong>Word (.doc)</strong> ได้ตลอดเวลา</span
              >
            </div>
          </section>
        </main>

        <!-- Footer: Student Wizard Navigation Buttons -->
        <footer
          class="border-t border-default bg-neutral-50 dark:bg-neutral-900/80 p-4 flex items-center justify-between gap-3"
        >
          <div>
            <UButton
              v-if="currentStep > 1"
              color="neutral"
              icon="i-lucide-arrow-left"
              label="ย้อนกลับ"
              size="sm"
              variant="outline"
              @click="currentStep--"
            />
          </div>

          <div class="flex items-center gap-2">
            <UButton
              color="neutral"
              label="ข้ามคู่มือ"
              size="sm"
              variant="ghost"
              @click="handleClose"
            />

            <!-- Next button for Step 1 & 2 -->
            <UButton
              v-if="currentStep < 3"
              color="primary"
              icon="i-lucide-arrow-right"
              :label="
                currentStep === 1
                  ? 'ถัดไป: ดูผลประเมิน'
                  : 'ถัดไป: จุดดาวน์โหลดเอกสาร'
              "
              size="sm"
              trailing
              @click="currentStep++"
            />

            <!-- Finish button on Step 3 -->
            <UButton
              v-else
              class="shadow-md"
              color="primary"
              icon="i-lucide-check-circle"
              label="เข้าใจแล้ว เริ่มต้นใช้งานแดชบอร์ด"
              size="sm"
              trailing
              @click="scrollToDocumentsSection"
            />
          </div>
        </footer>
      </div>
    </template>
  </UModal>
</template>
