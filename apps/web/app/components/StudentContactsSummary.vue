<script setup lang="ts">
import type { components } from '@internship/api-client'

const props = withDefaults(
  defineProps<{
    student: Pick<
      components['schemas']['Student'],
      | 'advisorName'
      | 'advisorEmail'
      | 'siteVisitAdvisorName'
      | 'siteVisitAdvisorEmail'
      | 'evaluatorName'
      | 'evaluatorEmail'
    >
    mode?: 'all' | 'evaluator' | 'advisors'
  }>(),
  {
    mode: 'all'
  }
)
const { locale } = useI18n()
const labels = computed(() =>
  locale.value === 'en'
    ? {
        evaluator: 'Workplace evaluator',
        advisor: 'Internship coordinator',
        siteVisitAdvisor: 'Site visit / Academic advisor'
      }
    : {
        evaluator: 'ผู้ประเมินสถานประกอบการ',
        advisor: 'อาจารย์ผู้ประสานงาน',
        siteVisitAdvisor: 'อาจารย์นิเทศ / ที่ปรึกษา'
      }
)

const contacts = computed(() => {
  const list: Array<{
    label: string
    name?: string
    email?: string
    icon: string
  }> = []
  if (props.mode === 'all' || props.mode === 'evaluator') {
    list.push({
      label: labels.value.evaluator,
      name: props.student.evaluatorName,
      email: props.student.evaluatorEmail,
      icon: 'i-lucide-building-2'
    })
  }
  if (props.mode === 'all') {
    list.push({
      label: labels.value.advisor,
      name: props.student.advisorName,
      email: props.student.advisorEmail,
      icon: 'i-lucide-user-check'
    })
    list.push({
      label: labels.value.siteVisitAdvisor,
      name: props.student.siteVisitAdvisorName,
      email: props.student.siteVisitAdvisorEmail,
      icon: 'i-lucide-graduation-cap'
    })
  }
  return list
})

const advisorContacts = computed(() => {
  const items: Array<{ name?: string; email?: string }> = []

  const advName = props.student.advisorName?.trim()
  const advEmail = props.student.advisorEmail?.trim()
  const siteName = props.student.siteVisitAdvisorName?.trim()
  const siteEmail = props.student.siteVisitAdvisorEmail?.trim()

  if (advName || advEmail) {
    items.push({ name: advName, email: advEmail })
  }

  if (siteName || siteEmail) {
    const isDuplicate = items.some(
      (item) => item.name === siteName && item.email === siteEmail
    )
    if (!isDuplicate) {
      items.push({ name: siteName, email: siteEmail })
    }
  }

  return items
})
</script>

<template>
  <div class="space-y-1 text-xs" data-testid="student-contacts">
    <!-- กรณีแสดงผู้ประเมินสถานประกอบการ: แสดงเฉพาะอีเมลผู้ประเมิน ไม่แสดงคำว่าผู้ประเมินสถานประกอบการ ไอคอน และไม่เตือนขาดอีเมล -->
    <template v-if="mode === 'evaluator'">
      <p class="break-all text-[11px] text-muted font-mono leading-tight">
        {{ student.evaluatorEmail || '—' }}
      </p>
    </template>

    <!-- กรณีแสดงอาจารย์: แสดงเฉพาะชื่อและอีเมลอาจารย์ ไม่แสดงไอคอนและคำนำหน้า -->
    <template v-else-if="mode === 'advisors'">
      <div v-if="advisorContacts.length > 0" class="space-y-1.5">
        <div
          v-for="(contact, index) in advisorContacts"
          :key="index"
          class="space-y-0.5 leading-tight"
        >
          <p
            v-if="contact.name"
            class="text-highlighted font-medium text-[11px] truncate"
            :title="contact.name"
          >
            {{ contact.name }}
          </p>
          <p
            v-if="contact.email"
            class="break-all text-[10px] text-muted font-mono"
            :title="contact.email"
          >
            {{ contact.email }}
          </p>
        </div>
      </div>
      <p v-else class="text-[11px] text-muted font-mono leading-tight">—</p>
    </template>

    <!-- กรณีทั่วไป / modal แสดงตามรายการปกติ -->
    <template v-else>
      <div v-for="contact in contacts" :key="contact.label" class="space-y-0.5">
        <div class="flex items-center gap-1 leading-tight">
          <UIcon :name="contact.icon" class="size-3 text-muted shrink-0" />
          <span class="text-muted text-[11px]">{{ contact.label }}:</span>
          <span
            class="ml-1 text-highlighted font-medium text-[11px] truncate"
            >{{ contact.name || '—' }}</span
          >
        </div>
        <p
          class="break-all text-[10px] text-muted/80 pl-4 font-mono leading-tight"
        >
          {{ contact.email || '—' }}
        </p>
      </div>
    </template>
  </div>
</template>
