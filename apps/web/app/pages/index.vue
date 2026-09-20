<script setup lang="ts">
definePageMeta({ layout: 'public' })

const features = [
  ['i-lucide-users', 'จัดการข้อมูล', 'ขอบเขตสิทธิ์ตามสำนักวิชาและหลักสูตร'],
  [
    'i-lucide-clipboard-check',
    'ประเมินบนมือถือ',
    'บันทึกร่าง ป้องกันข้อมูลทับ และส่งครั้งเดียว'
  ],
  [
    'i-lucide-mail-check',
    'ติดตามอีเมล',
    'คิวส่งแบบ idempotent พร้อม retry ที่ตรวจสอบได้'
  ],
  [
    'i-lucide-file-check-2',
    'เอกสารส่วนตัว',
    'สร้าง PDF ฝั่ง server และดาวน์โหลดด้วยลิงก์ชั่วคราว'
  ]
] as const
</script>

<template>
  <UContainer
    class="grid min-h-[calc(100dvh-4.25rem)] items-center gap-12 py-12 lg:grid-cols-[1.05fr_0.95fr] lg:py-20"
  >
    <section class="max-w-2xl">
      <p class="mfu-eyebrow">MFU Internship · Secure workflow</p>
      <div aria-hidden="true" class="mfu-section-rule mt-4" />
      <h1
        class="font-heading mt-6 text-balance text-[2.5rem] font-bold leading-[1.15] tracking-tight text-highlighted sm:text-5xl"
      >
        ทุกขั้นตอนการฝึกงาน<br class="hidden sm:block" />อยู่ในระบบเดียว
      </h1>
      <p class="mt-6 max-w-xl text-lg leading-8 text-muted">
        จัดการนักศึกษา รอบประเมิน ผู้ประเมิน การสื่อสาร และเอกสารผลลัพธ์
        ด้วยกระบวนการที่ชัดเจน ปลอดภัย และตรวจสอบย้อนหลังได้
      </p>
      <div class="mt-8 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
        <UButton
          class="justify-center"
          icon="i-lucide-log-in"
          label="เข้าสู่ระบบ"
          size="xl"
          to="/login"
        />
        <UButton
          class="justify-center"
          color="neutral"
          icon="i-lucide-clipboard-check"
          label="เปิดแบบประเมิน"
          size="xl"
          to="/evaluate"
          variant="outline"
        />
      </div>
      <p class="mt-5 flex items-center gap-2 text-sm text-muted">
        <UIcon
          aria-hidden="true"
          class="size-4 text-secondary"
          name="i-lucide-shield-check"
        />
        กำหนดสิทธิ์ตามบทบาทและขอบเขตข้อมูลของผู้ใช้งาน
      </p>
    </section>

    <section aria-label="คุณสมบัติระบบ" class="mfu-surface overflow-hidden">
      <header class="mfu-brand-panel p-6 sm:p-8">
        <p
          class="text-xs font-semibold uppercase tracking-[0.05em] text-secondary"
        >
          Internship operations
        </p>
        <h2 class="font-heading mt-3 text-2xl font-semibold text-highlighted">
          ทำงานง่ายขึ้น โดยไม่ลดความปลอดภัย
        </h2>
        <p class="mt-3 text-sm leading-6 text-muted">
          ออกแบบสำหรับเจ้าหน้าที่ ผู้ประเมิน และนักศึกษาในกระบวนการเดียว
        </p>
      </header>

      <div class="divide-y divide-default">
        <article
          v-for="item in features"
          :key="item[1]"
          class="flex min-h-24 items-start gap-4 p-4 transition-colors duration-150 hover:bg-muted/60 sm:px-6"
        >
          <span
            class="grid size-10 shrink-0 place-items-center rounded-lg bg-secondary/10 text-secondary"
          >
            <UIcon aria-hidden="true" class="size-5" :name="item[0]" />
          </span>
          <div class="min-w-0">
            <h3 class="font-heading font-semibold text-highlighted">
              {{ item[1] }}
            </h3>
            <p class="mt-1 text-sm leading-6 text-muted">{{ item[2] }}</p>
          </div>
        </article>
      </div>
    </section>
  </UContainer>
</template>
