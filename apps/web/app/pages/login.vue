<script setup lang="ts">
import type { RoleKey } from '@internship/shared-types'

definePageMeta({ layout: 'public' })

const config = useRuntimeConfig()
const auth = useAuthStore()
const errorMessage = ref('')
const isDevelopment = config.public.appEnvironment === 'development'
const pendingRole = ref<string | null>(null)

interface DevPersona {
  readonly id: string
  readonly role: RoleKey
  readonly title: string
  readonly roleLabel: string
  readonly displayName: string
  readonly email: string
  readonly description: string
  readonly icon: string
  readonly badgeColor: 'error' | 'warning' | 'info' | 'success' | 'primary'
  readonly studentId?: string
  readonly redirectTo?: string
}

const devPersonas: DevPersona[] = [
  {
    id: 'admin',
    role: 'systemAdmin',
    title: 'ผู้ดูแลระบบ (Admin)',
    roleLabel: 'Admin',
    displayName: 'ผู้ดูแลระบบ (Admin)',
    email: 'admin@mfu.ac.th',
    description:
      'จัดการทั้งระบบ สำนักวิชา หลักสูตร ผู้ใช้งาน และการตั้งค่า SMTP',
    icon: 'i-lucide-shield-check',
    badgeColor: 'error'
  },
  {
    id: 'staff',
    role: 'internshipStaff',
    title: 'เจ้าหน้าที่ฝึกงาน (Internship Staff)',
    roleLabel: 'Staff',
    displayName: 'เจ้าหน้าที่ฝึกงาน (Internship Staff)',
    email: 'staff@mfu.ac.th',
    description:
      'ดูแลกระบวนการฝึกงาน รายชื่อนักศึกษา สถานประกอบการ และหนังสือส่งตัว',
    icon: 'i-lucide-briefcase',
    badgeColor: 'warning'
  },
  {
    id: 'advisor',
    role: 'coordinator',
    title: 'อาจารย์ที่ปรึกษา (Advisor)',
    roleLabel: 'Advisor',
    displayName: 'ดร.อาจารย์ที่ปรึกษา (Advisor)',
    email: 'advisor@mfu.ac.th',
    description:
      'อาจารย์ที่ปรึกษา ติดตามและตรวจประเมินผลการฝึกงานของนักศึกษาในหลักสูตร',
    icon: 'i-lucide-users',
    badgeColor: 'info'
  },
  {
    id: 'student',
    role: 'student',
    title: 'นักศึกษา (Student)',
    roleLabel: 'Student',
    displayName: 'ปลื้ม (Chayanuch Panyadee)',
    email: '6631503016@lamduan.mfu.ac.th',
    description:
      'เข้าดูสถานะการฝึกงาน ตรวจสอบผลการประเมิน และดาวน์โหลดเอกสาร 2 ฉบับ',
    icon: 'i-lucide-graduation-cap',
    badgeColor: 'success',
    studentId: '6531501009'
  }
]

async function loginAs(persona: DevPersona): Promise<void> {
  pendingRole.value = persona.id
  errorMessage.value = ''
  try {
    await auth.devLogin(persona.role, {
      displayName: persona.displayName,
      email: persona.email,
      studentId: persona.studentId
    })
    await navigateTo(persona.redirectTo || '/app')
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'ไม่สามารถเข้าสู่ระบบได้'
    errorMessage.value = msg
  } finally {
    pendingRole.value = null
  }
}

async function loginSSO(): Promise<void> {
  pendingRole.value = 'sso'
  errorMessage.value = ''
  try {
    await navigateTo(`${config.public.apiBaseUrl}/auth/login`, {
      external: true
    })
  } catch {
    errorMessage.value = 'ไม่สามารถเชื่อมต่อไปยัง MFU SSO ได้'
  } finally {
    pendingRole.value = null
  }
}
</script>

<template>
  <UContainer
    class="grid min-h-[calc(100dvh-4.25rem)] place-items-center py-8 sm:py-12"
  >
    <div
      class="mfu-surface grid w-full max-w-5xl overflow-hidden lg:grid-cols-[0.82fr_1.18fr]"
    >
      <!-- ฝั่งซ้าย: ข้อมูลระบบและอัตลักษณ์มหาวิทยาลัย -->
      <section class="mfu-brand-panel flex flex-col justify-between p-6 sm:p-8">
        <div>
          <MfuBrandMark size="lg" tone="inverse" />
          <p
            class="mt-8 text-xs font-semibold uppercase tracking-[0.05em] text-secondary"
          >
            Secure university portal
          </p>
          <h1 class="font-heading mt-3 text-3xl font-bold text-highlighted">
            Internship Transcript
          </h1>
          <p class="mt-4 max-w-sm text-sm leading-7 text-muted">
            เข้าถึงข้อมูลการฝึกงาน การประเมิน และเอกสารตามบทบาทของคุณ
            ทุกกิจกรรมสำคัญตรวจสอบย้อนหลังได้
          </p>
        </div>

        <ul class="mt-10 space-y-3 text-sm text-muted">
          <li class="flex items-center gap-3">
            <UIcon
              aria-hidden="true"
              class="size-4 text-secondary"
              name="i-lucide-check"
            />
            รองรับ 5 บทบาทหลักของระบบการฝึกงาน
          </li>
          <li class="flex items-center gap-3">
            <UIcon
              aria-hidden="true"
              class="size-4 text-secondary"
              name="i-lucide-check"
            />
            สิทธิ์จำกัดตาม School และ Program
          </li>
          <li class="flex items-center gap-3">
            <UIcon
              aria-hidden="true"
              class="size-4 text-secondary"
              name="i-lucide-check"
            />
            Session ปลอดภัยและยกเลิกได้
          </li>
        </ul>
      </section>

      <!-- ฝั่งขวา: เลือกเข้าสู่ระบบ 5 บทบาท (โหมด Dev) หรือ SSO -->
      <section
        class="flex flex-col justify-center bg-default p-6 sm:p-8 lg:p-10"
      >
        <p class="mfu-eyebrow">Identity verification</p>
        <h2 class="font-heading mt-2 text-2xl font-bold text-highlighted">
          เข้าสู่ระบบ
        </h2>
        <p class="mt-1.5 text-xs text-muted leading-relaxed">
          {{
            isDevelopment
              ? 'เลือกล็อกอินตามบทบาท เพื่อทดสอบการทำงานตามสิทธิ์ที่ได้รับ หรือเข้าประเมินด้วยรหัส PIN:'
              : 'ดำเนินการต่อด้วยบัญชี MFU SSO ที่ได้รับอนุมัติ'
          }}
        </p>

        <UAlert
          v-if="errorMessage"
          class="mt-4"
          color="error"
          icon="i-lucide-circle-alert"
          :title="errorMessage"
          variant="soft"
        />

        <!-- โหมด Development: แถวยาว 4 บทบาท (ผู้ดูแลระบบ, เจ้าหน้าที่ฝึกงาน, อาจารย์ที่ปรึกษา, นักศึกษา) และ แถวสำหรับผู้ทำแบบฟอร์ม (PIN) -->
        <div v-if="isDevelopment" class="mt-4 space-y-2.5">
          <div class="space-y-2">
            <button
              v-for="p in devPersonas"
              :key="p.id"
              type="button"
              class="group relative flex w-full items-center justify-between gap-3 rounded-xl border border-default/80 bg-default hover:bg-muted/30 px-3.5 py-2.5 sm:px-4 sm:py-3 text-left transition-all duration-200 hover:border-primary hover:shadow-sm focus:outline-none focus:ring-2 focus:ring-primary/20 cursor-pointer"
              :class="{
                'opacity-60 pointer-events-none':
                  pendingRole && pendingRole !== p.id
              }"
              @click="loginAs(p)"
            >
              <!-- ไอคอน + ข้อมูลบทบาท -->
              <div class="flex items-center gap-3 min-w-0 flex-1">
                <span
                  class="grid size-10 shrink-0 place-items-center rounded-lg ring-1 ring-default transition-transform group-hover:scale-105"
                  :class="{
                    'bg-rose-500/10 text-rose-600 ring-rose-500/20':
                      p.badgeColor === 'error',
                    'bg-amber-500/10 text-amber-600 ring-amber-500/20':
                      p.badgeColor === 'warning',
                    'bg-sky-500/10 text-sky-600 ring-sky-500/20':
                      p.badgeColor === 'info',
                    'bg-emerald-500/10 text-emerald-600 ring-emerald-500/20':
                      p.badgeColor === 'success'
                  }"
                >
                  <UIcon :name="p.icon" class="size-5" />
                </span>

                <div class="min-w-0 flex-1">
                  <div class="flex items-center gap-2 flex-wrap">
                    <p
                      class="font-semibold text-sm text-highlighted group-hover:text-primary transition-colors truncate"
                    >
                      {{ p.title }}
                    </p>
                    <UBadge
                      :color="p.badgeColor"
                      :label="p.roleLabel"
                      size="xs"
                      variant="subtle"
                    />
                  </div>
                  <p class="text-[11px] text-muted truncate mt-0.5">
                    {{ p.description }}
                  </p>
                  <div
                    class="flex items-center gap-1 text-[10px] text-muted/80 font-mono mt-0.5"
                  >
                    <UIcon
                      name="i-lucide-mail"
                      class="size-2.5 shrink-0 text-muted/60"
                    />
                    <span class="truncate">{{ p.email }}</span>
                  </div>
                </div>
              </div>

              <!-- ปุ่มเข้าสู่ระบบด้านขวา -->
              <div class="shrink-0 pl-1">
                <span
                  class="inline-flex items-center gap-1 text-xs font-medium text-primary group-hover:translate-x-0.5 transition-transform"
                >
                  <span v-if="pendingRole === p.id">เข้าสู่ระบบ...</span>
                  <span v-else class="hidden sm:inline">เข้าสู่ระบบ</span>
                  <UIcon
                    :name="
                      pendingRole === p.id
                        ? 'i-lucide-loader-2'
                        : 'i-lucide-arrow-right'
                    "
                    :class="[
                      'size-4',
                      pendingRole === p.id ? 'animate-spin' : ''
                    ]"
                  />
                </span>
              </div>
            </button>
          </div>

          <!-- แถวสำหรับผู้ทำแบบฟอร์ม (ผู้ประเมินสถานประกอบการด้วยรหัส PIN 16 หลัก) -->
          <NuxtLink
            to="/evaluate"
            class="block w-full text-left rounded-xl border border-dashed border-primary/50 bg-primary/5 px-3.5 py-3 sm:px-4 sm:py-3.5 transition-all duration-200 hover:border-primary hover:bg-primary/10 hover:shadow-sm cursor-pointer group"
          >
            <div class="flex items-center justify-between gap-3">
              <div class="flex items-center gap-3 min-w-0 flex-1">
                <span
                  class="grid size-10 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary ring-1 ring-primary/20 group-hover:scale-105 group-hover:bg-primary group-hover:text-inverted transition-all"
                >
                  <UIcon class="size-5" name="i-lucide-key-round" />
                </span>
                <div class="min-w-0 flex-1">
                  <div class="flex items-center gap-2 flex-wrap">
                    <p
                      class="font-semibold text-sm text-highlighted group-hover:text-primary transition-colors"
                    >
                      สำหรับผู้ทำแบบฟอร์ม (ผู้ประเมินสถานประกอบการ)
                    </p>
                    <UBadge
                      color="primary"
                      label="PIN ACCESS"
                      size="xs"
                      variant="subtle"
                    />
                  </div>
                  <p class="text-[11px] text-muted mt-0.5">
                    คลิกที่นี่เพื่อกรอกรหัส PIN 16 หลัก
                    เข้าทำแบบฟอร์มประเมินนักศึกษา
                  </p>
                </div>
              </div>
              <div class="shrink-0 pl-1">
                <span
                  class="inline-flex items-center gap-1 text-xs font-semibold text-primary group-hover:translate-x-1 transition-transform"
                >
                  <span>กรอกรหัส PIN</span>
                  <UIcon name="i-lucide-arrow-right" class="size-4" />
                </span>
              </div>
            </div>
          </NuxtLink>
        </div>

        <!-- โหมด Production: ปุ่ม SSO ปกติ -->
        <div v-else class="mt-8">
          <UButton
            block
            class="justify-center"
            icon="i-lucide-log-in"
            label="เข้าสู่ระบบด้วย MFU SSO"
            :loading="pendingRole === 'sso'"
            size="xl"
            @click="loginSSO"
          />
        </div>

        <div class="mt-6 flex items-start gap-3 border-t border-default pt-4">
          <UIcon
            aria-hidden="true"
            class="mt-0.5 size-4 shrink-0 text-secondary"
            name="i-lucide-lock-keyhole"
          />
          <p class="text-xs leading-5 text-muted">
            {{
              isDevelopment
                ? 'คลิกเลือกบทบาทเพื่อเข้าใช้งานในฐานะผู้ใช้นั้นได้ทันทีในโหมดจำลอง'
                : 'ระบบจะไม่ขอรหัสผ่าน MFU ภายในหน้านี้ และไม่บันทึกข้อมูลเข้าสู่ระบบลงใน Browser'
            }}
          </p>
        </div>
      </section>
    </div>
  </UContainer>
</template>
