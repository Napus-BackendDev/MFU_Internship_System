<script setup lang="ts">
import type { RoleKey } from '@internship/shared-types'
import type { NavigationMenuItem } from '@nuxt/ui'

interface AppNavigationItem extends NavigationMenuItem {
  readonly allowedRoles?: readonly RoleKey[]
}

const auth = useAuthStore()
const route = useRoute()
const runtimeConfig = useRuntimeConfig()

const sidebarCollapsed = ref(false)
const signingOut = ref(false)

const allNavigationItems: readonly AppNavigationItem[] = [
  {
    label: 'ภาพรวม',
    to: '/app',
    icon: 'i-lucide-layout-dashboard',
    exact: true,
    allowedRoles: [
      'systemAdmin',
      'internshipStaff',
      'coordinator',
      'auditor',
      'evaluator'
    ]
  },
  {
    label: 'ข้อมูลการฝึกงาน',
    to: '/app',
    icon: 'i-lucide-layout-dashboard',
    exact: true,
    allowedRoles: ['student']
  },
  {
    label: 'นักศึกษา',
    to: '/app/students',
    icon: 'i-lucide-graduation-cap',
    allowedRoles: ['systemAdmin', 'internshipStaff', 'coordinator', 'auditor']
  },
  {
    label: 'การประเมิน',
    to: '/app/evaluations',
    icon: 'i-lucide-clipboard-check',
    exact: true,
    allowedRoles: [
      'systemAdmin',
      'internshipStaff',
      'coordinator',
      'auditor',
      'evaluator'
    ]
  },
  {
    label: 'แบบฟอร์มประเมิน',
    to: '/app/evaluations/forms',
    icon: 'i-lucide-form-input',
    allowedRoles: ['systemAdmin', 'internshipStaff']
  },
  {
    label: 'เอกสาร',
    to: '/app/documents',
    icon: 'i-lucide-file-text',
    allowedRoles: ['systemAdmin', 'internshipStaff', 'coordinator', 'auditor']
  },
  {
    label: 'ผู้ใช้งานระบบ',
    to: '/app/users',
    icon: 'i-lucide-users',
    allowedRoles: ['systemAdmin', 'internshipStaff']
  },
  {
    label: 'Audit Logs',
    to: '/app/audit',
    icon: 'i-lucide-shield-check',
    allowedRoles: ['systemAdmin', 'auditor']
  },
  {
    label: 'สำนักวิชาและหลักสูตร',
    to: '/app/settings/academic',
    icon: 'i-lucide-building-2',
    allowedRoles: ['systemAdmin', 'internshipStaff']
  },
  {
    label: 'ตั้งค่าจดหมาย',
    to: '/app/settings/email',
    icon: 'i-lucide-mails',
    allowedRoles: ['systemAdmin', 'internshipStaff']
  },
  {
    label: 'ตั้งค่า SMTP',
    to: '/app/settings/smtp',
    icon: 'i-lucide-mail',
    allowedRoles: ['systemAdmin']
  }
]

const isStudent = computed(() => {
  const roles = auth.actor?.roles ?? []
  return Boolean(
    roles.includes('student') &&
    !roles.some((r) =>
      ['systemAdmin', 'internshipStaff', 'coordinator', 'auditor'].includes(r)
    )
  )
})

const links = computed<NavigationMenuItem[]>(() => {
  const currentRoles = (auth.actor?.roles ?? []) as RoleKey[]
  if (currentRoles.length === 0) return []

  // If student only, return student-targeted menu items
  if (isStudent.value) {
    return allNavigationItems
      .filter((item) => item.allowedRoles?.includes('student'))
      .map(({ allowedRoles: _a, ...item }) => item)
  }

  // Filter items based on actor's assigned roles
  return allNavigationItems
    .filter((item) => {
      if (!item.allowedRoles || item.allowedRoles.length === 0) return true
      return item.allowedRoles.some((r) => currentRoles.includes(r))
    })
    .map(({ allowedRoles: _a, ...item }) => item)
})

const canManageAcademic = computed(() =>
  Boolean(
    auth.actor?.roles.some((r) =>
      ['systemAdmin', 'internshipStaff'].includes(r)
    )
  )
)

const roleLabels: Readonly<Record<RoleKey, string>> = {
  systemAdmin: 'ผู้ดูแลระบบ (Admin)',
  internshipStaff: 'เจ้าหน้าที่ฝึกงาน / คนทำแบบฟอร์ม',
  coordinator: 'อาจารย์ที่ปรึกษา (Advisor)',
  student: 'นักศึกษา (Student)',
  evaluator: 'ผู้ประเมินภายนอก',
  auditor: 'ผู้ตรวจสอบ'
}

interface PageHeaderMeta {
  readonly title: string
  readonly description: string
}

const pageMetadataMap: Readonly<Record<string, PageHeaderMeta>> = {
  '/app': {
    title: 'ภาพรวม',
    description: 'แดชบอร์ดสรุปสถิติและภาพรวมสถานะการฝึกงานของนักศึกษา'
  },
  '/app/students': {
    title: 'นักศึกษา',
    description:
      'จัดการรายชื่อ ข้อมูลสถานประกอบการ และติดตามความก้าวหน้าการฝึกงาน'
  },
  '/app/evaluations/forms': {
    title: 'แบบฟอร์มประเมิน',
    description: 'สร้างและจัดการเกณฑ์ประเมิน แยกหมวดทั่วไปและหมวดเฉพาะสำนักวิชา'
  },
  '/app/evaluations': {
    title: 'การประเมิน',
    description:
      'ติดตามรอบการประเมิน มอบหมายผู้ประเมิน และตรวจสอบผลคะแนนสมรรถนะ'
  },
  '/app/documents': {
    title: 'เอกสาร',
    description:
      'จัดการแม่แบบเอกสาร หนังสือส่งตัว และออกใบ Internship Transcript'
  },
  '/app/users': {
    title: 'ผู้ใช้งานระบบ',
    description:
      'จัดการบัญชีผู้ใช้งาน สิทธิ์การเข้าถึง และสังกัดของบุคลากรและนักศึกษา'
  },
  '/app/audit': {
    title: 'Audit Logs',
    description:
      'ตรวจสอบประวัติการเข้าใช้งานและการเปลี่ยนแปลงข้อมูลในระบบเพื่อความโปร่งใส'
  },
  '/app/settings/academic': {
    title: 'สำนักวิชาและหลักสูตร',
    description:
      'กำหนดโครงสร้างสำนักวิชา หลักสูตร และสาขาวิชาที่เปิดรับการฝึกงาน'
  },
  '/app/settings/general': {
    title: 'ตั้งค่าระบบและข้อมูลพื้นฐาน',
    description:
      'จัดการข้อมูลจังหวัด (Provinces) และประเภทสถานประกอบการ (Company Types)'
  },
  '/app/settings/email': {
    title: 'ตั้งค่าจดหมาย',
    description: 'จัดการแม่แบบและการตกแต่งจดหมายแจ้งสถานประกอบการและผู้ประเมิน'
  },
  '/app/settings/smtp': {
    title: 'ตั้งค่าระบบส่งอีเมล (SMTP)',
    description: 'กำหนดค่าเซิร์ฟเวอร์ส่งอีเมลระบบและการแจ้งเตือนอัตโนมัติ'
  },
  '/app/support': {
    title: 'ช่วยเหลือและสนับสนุน',
    description:
      'ศูนย์รวมคำถามที่พบบ่อย คู่มือการใช้งาน และช่องทางติดต่อเจ้าหน้าที่'
  }
}

const pageTitle = computed(() => {
  const currentLink = links.value.find((link) => {
    if (link.exact) return route.path === link.to
    return route.path === link.to || route.path.startsWith(`${link.to}/`)
  })

  return currentLink?.label ?? 'Internship Transcript'
})

const currentPageInfo = computed<PageHeaderMeta>(() => {
  const currentPath = route.path

  if (isStudent.value && currentPath === '/app') {
    return {
      title: 'ข้อมูลการฝึกงานและเอกสาร',
      description:
        'แดชบอร์ดข้อมูลนักศึกษา ติดตามสถานะจากผู้ทำฟอร์ม และดาวน์โหลดแบบฟอร์มรับรอง'
    }
  }

  const directMatch = pageMetadataMap[currentPath]
  if (directMatch) {
    return directMatch
  }

  const sortedKeys = Object.keys(pageMetadataMap).sort(
    (a, b) => b.length - a.length
  )
  for (const key of sortedKeys) {
    if (key !== '/app' && currentPath.startsWith(key)) {
      const nestedMatch = pageMetadataMap[key]
      if (nestedMatch) return nestedMatch
    }
  }

  return {
    title: pageTitle.value,
    description: 'ระบบจัดการและออกเอกสารรับรองการฝึกงาน มหาวิทยาลัยแม่ฟ้าหลวง'
  }
})

const actorName = computed(() => auth.actor?.displayName ?? 'ผู้ใช้งานระบบ')

const actorRole = computed(() => {
  const primaryRole = auth.actor?.roles[0]
  return primaryRole ? roleLabels[primaryRole] : 'บัญชีผู้ใช้งาน'
})

const actorAvatar = computed(() => {
  const actor = auth.actor
  return actor?.avatarUrl || actor?.picture || undefined
})

const isProduction = computed(
  () =>
    String(runtimeConfig.public.appEnvironment).toLowerCase() === 'production'
)

async function signOut(): Promise<void> {
  signingOut.value = true

  try {
    await auth.logout()
    await navigateTo('/login')
  } finally {
    signingOut.value = false
  }
}
</script>

<template>
  <UDashboardGroup
    class="bg-[var(--semantic-bg-canvas)]"
    storage-key="internship-app-shell"
    unit="px"
  >
    <UDashboardSidebar
      id="main-navigation"
      v-model:collapsed="sidebarCollapsed"
      :collapsed-size="72"
      :default-size="256"
      :max-size="256"
      :menu="{
        side: 'left',
        title: 'เมนูหลัก',
        description: 'เมนูนำทางของระบบ Internship Transcript'
      }"
      :min-size="256"
      :ui="{
        root: 'border-r border-default bg-default transition-[width] duration-300 ease-in-out will-change-[width] overflow-x-hidden',
        header: sidebarCollapsed
          ? 'border-b border-default p-3 flex items-center justify-center transition-all duration-300 ease-in-out'
          : 'border-b border-default px-4 transition-all duration-300 ease-in-out',
        body: 'gap-2 px-3 py-4 transition-all duration-300 ease-in-out overflow-x-hidden',
        footer:
          'border-t border-default bg-muted/40 px-3 py-3 transition-all duration-300 ease-in-out overflow-x-hidden'
      }"
      collapsible
      mode="slideover"
    >
      <template #toggle="{ open, toggle }">
        <UButton
          :aria-label="open ? 'ปิดเมนูหลัก' : 'เปิดเมนูหลัก'"
          :icon="open ? 'i-lucide-x' : 'i-lucide-menu'"
          color="neutral"
          size="xl"
          variant="ghost"
          @click="toggle"
        />
      </template>

      <template #header="{ collapsed: isCollapsed }">
        <div
          class="flex h-11 w-full items-center justify-between overflow-hidden"
        >
          <NuxtLink
            aria-label="ไปหน้าภาพรวม"
            class="flex min-w-0 items-center gap-3 rounded-lg transition-all duration-300 ease-in-out"
            :class="
              isCollapsed
                ? 'max-w-0 opacity-0 pointer-events-none'
                : 'max-w-[190px] opacity-100 flex-1'
            "
            to="/app"
          >
            <MfuBrandMark alt="" class="transition-transform duration-300" />
            <span class="min-w-0 whitespace-nowrap">
              <strong
                class="font-heading block truncate text-sm font-bold text-highlighted"
              >
                MFU Internship
              </strong>
              <span class="block truncate text-xs font-medium text-secondary">
                Transcript System
              </span>
            </span>
          </NuxtLink>

          <UDashboardSidebarCollapse
            :aria-label="isCollapsed ? 'ขยายเมนูหลัก' : 'ยุบเมนูหลัก'"
            class="shrink-0 transition-all duration-300 ease-in-out"
            :class="
              isCollapsed
                ? 'size-11 flex items-center justify-center mx-auto'
                : 'ms-auto'
            "
            size="lg"
          />
        </div>
      </template>

      <template #default="{ collapsed }">
        <nav aria-label="เมนูหลัก" class="w-full">
          <UNavigationMenu
            :collapsed="collapsed"
            :items="links"
            :tooltip="{
              delayDuration: 0,
              content: { side: 'right', align: 'center' }
            }"
            :ui="{
              item: collapsed ? 'flex justify-center' : '',
              link: [
                'min-h-11 rounded-lg border border-transparent transition-colors',
                'data-[active]:border-primary/20 data-[active]:bg-primary/10 data-[active]:font-semibold data-[active]:text-primary data-[active]:before:hidden',
                collapsed
                  ? 'size-11 justify-center px-0 mx-auto'
                  : 'w-full px-3 gap-2.5'
              ].join(' '),
              linkLeadingIcon: 'size-5 shrink-0'
            }"
            class="w-full"
            color="primary"
            orientation="vertical"
            variant="pill"
          />
        </nav>

        <div class="mt-auto pt-2 border-t border-default space-y-1">
          <UTooltip
            :disabled="!collapsed"
            text="ช่วยเหลือและสนับสนุน"
            :content="{ side: 'right', align: 'center' }"
          >
            <UButton
              aria-label="ช่วยเหลือและสนับสนุน"
              :block="!collapsed"
              :class="[
                'min-h-11 rounded-lg border border-transparent transition-colors',
                collapsed
                  ? 'size-11 justify-center p-0 mx-auto'
                  : 'w-full justify-start px-3 gap-2.5',
                $route.path === '/app/support'
                  ? 'bg-primary/10 text-primary font-semibold border-primary/20'
                  : 'text-muted hover:text-highlighted hover:bg-muted/50'
              ]"
              color="neutral"
              icon="i-lucide-life-buoy"
              :label="collapsed ? undefined : 'ช่วยเหลือและสนับสนุน'"
              size="md"
              to="/app/support"
              variant="ghost"
            />
          </UTooltip>

          <UTooltip
            v-if="canManageAcademic"
            :disabled="!collapsed"
            text="ตั้งค่าระบบ"
            :content="{ side: 'right', align: 'center' }"
          >
            <UButton
              aria-label="ตั้งค่าระบบ"
              :block="!collapsed"
              :class="[
                'min-h-11 rounded-lg border border-transparent transition-colors',
                collapsed
                  ? 'size-11 justify-center p-0 mx-auto'
                  : 'w-full justify-start px-3 gap-2.5',
                $route.path.startsWith('/app/settings/general')
                  ? 'bg-primary/10 text-primary font-semibold border-primary/20'
                  : 'text-muted hover:text-highlighted hover:bg-muted/50'
              ]"
              color="neutral"
              icon="i-lucide-settings"
              :label="collapsed ? undefined : 'ตั้งค่าระบบ'"
              size="md"
              to="/app/settings/general"
              variant="ghost"
            />
          </UTooltip>
        </div>
      </template>

      <template #footer="{ collapsed }">
        <!-- โหมดปกติ (Expanded): Account และปุ่มออกจากระบบรวมอยู่ในบรรทัดเดียว (ไม่ใช่ 2 บรรทัด) -->
        <div
          v-if="!collapsed"
          class="flex w-full items-center justify-between gap-2 px-1 py-1 transition-all duration-300 ease-in-out"
        >
          <!-- ฝั่งซ้าย: ข้อมูลบัญชีผู้ใช้ (Avatar + ชื่อ + บทบาท) -->
          <div class="flex min-w-0 flex-1 items-center gap-2.5">
            <UAvatar
              :src="actorAvatar"
              icon="i-lucide-user"
              :alt="actorName"
              class="shrink-0 ring-1 ring-default/70"
              color="primary"
              size="md"
            />

            <div class="min-w-0 flex-1">
              <p
                class="truncate text-sm font-semibold text-highlighted leading-tight"
                :title="actorName"
              >
                {{ actorName }}
              </p>
              <p
                class="truncate text-xs text-muted leading-tight mt-0.5"
                :title="actorRole"
              >
                {{ actorRole }}
              </p>
            </div>
          </div>

          <!-- ฝั่งขวา (อยู่ข้างหลังตัว Account ในบรรทัดเดียว): ปุ่มออกจากระบบ -->
          <UTooltip text="ออกจากระบบ" :content="{ side: 'top', align: 'end' }">
            <UButton
              aria-label="ออกจากระบบ"
              color="neutral"
              icon="i-lucide-log-out"
              size="sm"
              variant="ghost"
              class="shrink-0 text-muted hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/30 transition-colors"
              :loading="signingOut"
              @click="signOut"
            />
          </UTooltip>
        </div>

        <!-- โหมดกดย่อ (Collapsed): แสดง Avatar กึ่งกลาง พร้อมปุ่มออกจากระบบ -->
        <div
          v-else
          class="flex w-full flex-col items-center gap-2 py-0.5 transition-all duration-300 ease-in-out"
        >
          <UTooltip
            :text="`${actorName} (${actorRole})`"
            :content="{ side: 'right', align: 'center' }"
          >
            <UAvatar
              :src="actorAvatar"
              icon="i-lucide-user"
              :alt="actorName"
              class="shrink-0 ring-1 ring-default/70 cursor-pointer"
              color="primary"
              size="md"
            />
          </UTooltip>

          <UTooltip
            text="ออกจากระบบ"
            :content="{ side: 'right', align: 'center' }"
          >
            <UButton
              aria-label="ออกจากระบบ"
              color="neutral"
              icon="i-lucide-log-out"
              size="sm"
              variant="ghost"
              class="size-10 justify-center p-0 text-muted hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/30 transition-colors mx-auto"
              :loading="signingOut"
              @click="signOut"
            />
          </UTooltip>
        </div>
      </template>
    </UDashboardSidebar>

    <UDashboardPanel id="main-content-panel">
      <UDashboardNavbar
        :toggle="false"
        :ui="{
          root: 'border-b border-default bg-default',
          left: 'min-w-0 flex-1'
        }"
      >
        <template #title>
          <div class="flex min-w-0 items-center gap-3">
            <h1 class="shrink-0 text-base font-bold text-highlighted">
              {{ currentPageInfo.title }}
            </h1>
            <span
              v-if="currentPageInfo.description"
              class="hidden truncate text-xs font-normal text-muted lg:inline-block border-l border-default pl-3"
            >
              {{ currentPageInfo.description }}
            </span>
          </div>
        </template>

        <template #right>
          <UBadge
            v-if="!isProduction"
            class="hidden sm:inline-flex"
            color="warning"
            label="Development"
            variant="subtle"
          />
          <ColorModeButton />
        </template>
      </UDashboardNavbar>

      <main
        id="main-content"
        class="min-h-0 flex-1 overflow-y-auto bg-[var(--semantic-bg-canvas)]"
      >
        <UContainer class="py-6 sm:py-8">
          <slot />
        </UContainer>
      </main>
    </UDashboardPanel>
  </UDashboardGroup>
</template>

<style scoped>
:deep([data-slot='root']) {
  transition: width 300ms cubic-bezier(0.4, 0, 0.2, 1);
  will-change: width;
}
:deep([data-slot='root'][data-dragging='true']) {
  transition: none !important;
}
</style>
