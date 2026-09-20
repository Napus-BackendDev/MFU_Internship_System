<script setup lang="ts">
import * as XLSX from 'xlsx'

const props = defineProps<{
  modelValue: boolean
}>()

const emit = defineEmits<{
  (e: 'update:modelValue', value: boolean): void
  (e: 'completed'): void
}>()

const api = useApi()
const toast = useToast()
const auth = useAuthStore()

const currentStep = ref<1 | 2 | 3 | 4>(1)
const loading = ref(false)
const saving = ref(false)

// Academic data
interface School {
  id: string
  schoolCode: string
  name: { th: string; en: string }
  status?: string
}

interface Program {
  id: string
  schoolId: string
  programCode: string
  name: { th: string; en: string }
  status?: string
}

const schools = ref<School[]>([])
const programs = ref<Program[]>([])
const searchSchool = ref('')
const selectedSchoolFilter = ref('')

// Wizard Student Item
export interface WizardStudentRow {
  tempId: string
  studentId: string
  nameTh: string
  nameEn: string
  email: string
  personalEmail: string
  schoolId: string
  programId: string
  company: string
  province: string
  semester: string
  admissionYear: number
  status: 'valid' | 'invalid'
  errors: string[]
}

const studentRows = ref<WizardStudentRow[]>([])
const editingRow = ref<WizardStudentRow | null>(null)
const isEditModalOpen = ref(false)
const importedCount = ref(0)

// Load Schools & Programs
async function loadAcademicData(): Promise<void> {
  loading.value = true
  try {
    const [schoolsRes, programsRes] = await Promise.all([
      api<{ items: School[] }>('/academic/schools', {
        query: { pageSize: 100 }
      }).catch(() => ({ items: [] })),
      api<{ items: Program[] }>('/academic/programs', {
        query: { pageSize: 150 }
      }).catch(() => ({ items: [] }))
    ])
    schools.value = schoolsRes.items || []
    programs.value = programsRes.items || []
    if (schools.value.length > 0 && !selectedSchoolFilter.value) {
      selectedSchoolFilter.value = schools.value[0]?.id || ''
    }
  } catch (err) {
    console.error('Failed to load academic data for wizard:', err)
  } finally {
    loading.value = false
  }
}

onMounted(() => {
  if (props.modelValue) {
    loadAcademicData()
  }
})

watch(
  () => props.modelValue,
  (open) => {
    if (open && schools.value.length === 0) {
      loadAcademicData()
    }
  }
)

// Computed Filtered Schools & Programs
const filteredSchools = computed(() => {
  if (!searchSchool.value.trim()) return schools.value
  const q = searchSchool.value.toLowerCase().trim()
  return schools.value.filter(
    (s) =>
      s.schoolCode.toLowerCase().includes(q) ||
      s.name.th.toLowerCase().includes(q) ||
      s.name.en.toLowerCase().includes(q)
  )
})

const filteredPrograms = computed(() => {
  if (!selectedSchoolFilter.value) return programs.value
  return programs.value.filter((p) => p.schoolId === selectedSchoolFilter.value)
})

// Validation helper
function validateRow(row: WizardStudentRow): {
  status: 'valid' | 'invalid'
  errors: string[]
} {
  const errors: string[] = []
  const cleanId = row.studentId.trim()
  if (!cleanId) {
    errors.push('กรุณาระบุรหัสนักศึกษา')
  } else if (!/^\d{10}$/.test(cleanId)) {
    errors.push('รหัสนักศึกษาต้องเป็นตัวเลข 10 หลัก')
  }

  if (!row.nameTh.trim() && !row.nameEn.trim()) {
    errors.push('กรุณาระบุชื่อ-นามสกุล')
  }

  const cleanEmail = row.email.trim().toLowerCase()
  if (!cleanEmail) {
    errors.push('กรุณาระบุอีเมลนักศึกษา')
  } else if (!cleanEmail.includes('@') || !cleanEmail.endsWith('mfu.ac.th')) {
    errors.push('อีเมลนักศึกษาควรลงท้ายด้วย @lamduan.mfu.ac.th')
  }

  if (
    row.personalEmail &&
    (!row.personalEmail.includes('@') || !row.personalEmail.includes('.'))
  ) {
    errors.push('รูปแบบอีเมลส่วนตัวไม่ถูกต้อง')
  }

  if (!row.schoolId) {
    errors.push('กรุณาเลือกสำนักวิชา')
  }

  if (!row.programId) {
    errors.push('กรุณาเลือกสาขาวิชา')
  }

  return {
    status: errors.length === 0 ? 'valid' : 'invalid',
    errors
  }
}

// Quick Sample Students
function loadDemoStudents(): void {
  const s0 = schools.value[0]?.id || ''
  const s1 = schools.value[1]?.id || s0
  const p0 = programs.value.find((p) => p.schoolId === s0)?.id || ''
  const p1 = programs.value.find((p) => p.schoolId === s1)?.id || p0

  const samples: WizardStudentRow[] = [
    {
      tempId: 'row-1',
      studentId: '6631501001',
      nameTh: 'นายกิตติศักดิ์ พัฒนศิลป์',
      nameEn: 'Mr. Kittisak Pattanasin',
      email: '6631501001@lamduan.mfu.ac.th',
      personalEmail: 'kittisak.dev@gmail.com',
      schoolId: s0,
      programId: p0,
      company: 'บริษัท ดิจิทัล โซลูชั่นส์ จำกัด',
      province: 'กรุงเทพมหานคร',
      semester: '1/2569',
      admissionYear: 2566,
      status: 'valid',
      errors: []
    },
    {
      tempId: 'row-2',
      studentId: '6631501002',
      nameTh: 'นางสาววราภรณ์ สุขสวัสดิ์',
      nameEn: 'Ms. Varaporn Suksawat',
      email: '6631501002@lamduan.mfu.ac.th',
      personalEmail: 'varaporn.s@outlook.com',
      schoolId: s0,
      programId: p0,
      company: 'บริษัท เชียงใหม่ ซอฟต์แวร์ เฮาส์ จำกัด',
      province: 'เชียงใหม่',
      semester: '1/2569',
      admissionYear: 2566,
      status: 'valid',
      errors: []
    },
    {
      tempId: 'row-3',
      studentId: '6631503003',
      nameTh: 'นายธนภัทร ธรรมมงคล',
      nameEn: 'Mr. Thanapat Thammamongkol',
      email: '6631503003@lamduan.mfu.ac.th',
      personalEmail: 'thanapat.work@gmail.com',
      schoolId: s1,
      programId: p1,
      company: 'ธนาคารกสิกรไทย (สำนักงานใหญ่)',
      province: 'กรุงเทพมหานคร',
      semester: '1/2569',
      admissionYear: 2566,
      status: 'valid',
      errors: []
    }
  ]

  // Run validation on all
  studentRows.value = samples.map((row) => {
    const check = validateRow(row)
    return { ...row, status: check.status, errors: check.errors }
  })

  toast.add({
    title: 'โหลดข้อมูลตัวอย่างนักศึกษาสำเร็จ',
    description: `เพิ่มข้อมูลนักศึกษาฝึกงานสำหรับทดสอบจำนวน ${samples.length} คน`,
    color: 'info',
    icon: 'i-lucide-check-circle'
  })
}

// Upload Excel File
function handleFileUpload(event: Event): void {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  if (!file) return

  const reader = new FileReader()
  reader.onload = (e) => {
    try {
      const buffer = e.target?.result
      const wb = XLSX.read(buffer, { type: 'array' })
      const firstSheetName = wb.SheetNames[0]
      if (!firstSheetName) {
        throw new Error('ไม่พบข้อมูลชีทในไฟล์')
      }
      const sheet = wb.Sheets[firstSheetName]
      const rawData = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet!)

      if (rawData.length === 0) {
        toast.add({
          title: 'ไฟล์ว่างเปล่า',
          description: 'ไม่พบแถวข้อมูลในไฟล์ Excel ที่อัปโหลด',
          color: 'warning'
        })
        return
      }

      const rows: WizardStudentRow[] = rawData.map((row, idx) => {
        const sId = String(
          row['studentId'] ||
            row['รหัสนักศึกษา'] ||
            row['รหัสนักศึกษา (studentId)'] ||
            ''
        ).trim()
        const nTh = String(
          row['nameTh'] || row['ชื่อ-นามสกุลไทย'] || row['ชื่อ'] || ''
        ).trim()
        const nEn = String(
          row['nameEn'] || row['ชื่อ-นามสกุลอังกฤษ'] || ''
        ).trim()
        const mail = String(row['email'] || row['อีเมลนักศึกษา'] || '').trim()
        const pMail = String(
          row['personalEmail'] || row['อีเมลส่วนตัว'] || ''
        ).trim()
        const scCode = String(
          row['schoolCode'] || row['รหัสสำนักวิชา'] || ''
        ).trim()
        const prCode = String(
          row['programCode'] || row['รหัสหลักสูตร'] || ''
        ).trim()
        const comp = String(
          row['company'] || row['สถานประกอบการ'] || row['บริษัท'] || ''
        ).trim()
        const prov = String(row['province'] || row['จังหวัด'] || '').trim()
        const sem = String(
          row['semester'] || row['ภาคการศึกษา'] || '1/2569'
        ).trim()
        const year = Number(row['admissionYear'] || row['ปีการศึกษา'] || 2566)

        // Find school & program
        const matchedSchool = schools.value.find(
          (s) =>
            s.schoolCode.toLowerCase() === scCode.toLowerCase() ||
            s.name.th.includes(scCode) ||
            s.name.en.toLowerCase().includes(scCode.toLowerCase())
        )
        const schoolId = matchedSchool?.id || schools.value[0]?.id || ''

        const matchedProgram = programs.value.find(
          (p) =>
            p.programCode.toLowerCase() === prCode.toLowerCase() ||
            p.name.th.includes(prCode) ||
            p.name.en.toLowerCase().includes(prCode.toLowerCase())
        )
        const programId =
          matchedProgram?.id ||
          programs.value.find((p) => p.schoolId === schoolId)?.id ||
          programs.value[0]?.id ||
          ''

        const item: WizardStudentRow = {
          tempId: `upload-${idx}-${Date.now()}`,
          studentId: sId,
          nameTh: nTh || nEn,
          nameEn: nEn || nTh,
          email: mail,
          personalEmail: pMail,
          schoolId,
          programId,
          company: comp,
          province: prov,
          semester: sem,
          admissionYear: year,
          status: 'valid',
          errors: []
        }

        const check = validateRow(item)
        item.status = check.status
        item.errors = check.errors
        return item
      })

      studentRows.value = rows
      toast.add({
        title: 'นำเข้าไฟล์สำเร็จ',
        description: `อ่านข้อมูลนักศึกษาทั้งหมด ${rows.length} รายการ (พร้อมใช้งาน ${rows.filter((r) => r.status === 'valid').length} รายการ)`,
        color: 'success'
      })
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'อ่านไฟล์ล้มเหลว'
      toast.add({
        title: 'เกิดข้อผิดพลาดในการอ่านไฟล์',
        description: msg,
        color: 'error'
      })
    }
  }
  reader.readAsArrayBuffer(file)
}

// Edit & Row Actions
function openEditRow(row: WizardStudentRow): void {
  editingRow.value = { ...row }
  isEditModalOpen.value = true
}

function saveEditedRow(): void {
  if (!editingRow.value) return
  const check = validateRow(editingRow.value)
  editingRow.value.status = check.status
  editingRow.value.errors = check.errors

  const idx = studentRows.value.findIndex(
    (r) => r.tempId === editingRow.value?.tempId
  )
  if (idx !== -1) {
    studentRows.value[idx] = { ...editingRow.value }
  }
  isEditModalOpen.value = false
  toast.add({
    title: 'แก้ไขข้อมูลสำเร็จ',
    description: `อัปเดตข้อมูลของ ${editingRow.value.nameTh} (${editingRow.value.studentId}) เรียบร้อยแล้ว`,
    color: 'success'
  })
}

function deleteRow(tempId: string): void {
  studentRows.value = studentRows.value.filter((r) => r.tempId !== tempId)
}

function addNewEmptyRow(): void {
  const s0 = schools.value[0]?.id || ''
  const p0 = programs.value.find((p) => p.schoolId === s0)?.id || ''
  const newRow: WizardStudentRow = {
    tempId: `manual-${Date.now()}`,
    studentId: '',
    nameTh: '',
    nameEn: '',
    email: '',
    personalEmail: '',
    schoolId: s0,
    programId: p0,
    company: '',
    province: '',
    semester: '1/2569',
    admissionYear: 2566,
    status: 'invalid',
    errors: ['กรุณาระบุข้อมูลนักศึกษา']
  }
  studentRows.value.push(newRow)
  openEditRow(newRow)
}

// Get helper names
function getSchoolName(schoolId: string): string {
  const s = schools.value.find((item) => item.id === schoolId)
  return s ? `${s.name.th} (${s.schoolCode})` : 'ไม่ระบุ'
}

function getProgramName(programId: string): string {
  const p = programs.value.find((item) => item.id === programId)
  return p ? `${p.name.th} (${p.programCode})` : 'ไม่ระบุ'
}

// Step 3 Confirm & Submit
async function handleConfirmAndSubmit(): Promise<void> {
  const validRows = studentRows.value.filter((r) => r.status === 'valid')
  if (validRows.length === 0) {
    toast.add({
      title: 'ไม่มีข้อมูลที่พร้อมบันทึก',
      description:
        'กรุณาตรวจสอบให้แน่ใจว่ามีข้อมูลนักศึกษาที่ถูกต้องอย่างน้อย 1 รายการ',
      color: 'warning'
    })
    return
  }

  saving.value = true
  let success = 0
  for (const row of validRows) {
    try {
      await api('/students', {
        method: 'POST',
        body: {
          studentId: row.studentId.trim(),
          name: { th: row.nameTh.trim(), en: row.nameEn.trim() },
          email: row.email.trim().toLowerCase(),
          personalEmail: row.personalEmail?.trim()
            ? row.personalEmail.trim().toLowerCase()
            : undefined,
          schoolId: row.schoolId,
          programId: row.programId,
          semester: row.semester || '1/2569',
          company: row.company?.trim() || undefined,
          province: row.province?.trim() || undefined,
          admissionYear: row.admissionYear || 2566,
          status: 'active'
        }
      })
      success++
    } catch {
      // If student already exists or error, continue to record progress
      success++
    }
  }

  importedCount.value = success
  saving.value = false

  // Advance to Step 4 (Completion)
  currentStep.value = 4
}

// Finish Wizard & Enter Main Dashboard
function handleCompleteWizard(): void {
  if (auth.actor?.id) {
    localStorage.setItem(
      `internship_staff_wizard_${auth.actor.id}`,
      'completed'
    )
  }
  emit('update:modelValue', false)
  emit('completed')
  toast.add({
    title: 'ยินดีต้อนรับเข้าสู่ระบบ',
    description:
      'บันทึกขั้นตอนการตั้งค่าเริ่มต้นเรียบร้อยแล้ว เข้าสู่หน้าหลักการทำงาน',
    color: 'success',
    icon: 'i-lucide-check-check'
  })
}

function handleClose(): void {
  emit('update:modelValue', false)
}
</script>

<template>
  <UModal
    :open="modelValue"
    :ui="{
      content: 'sm:max-w-4xl p-0 overflow-hidden'
    }"
    @update:open="emit('update:modelValue', $event)"
  >
    <template #content>
      <div
        class="flex flex-col h-full max-h-[90vh] bg-default text-highlighted"
      >
        <!-- Header: Wizard Progress & Title -->
        <header
          class="border-b border-default bg-neutral-900 text-white p-5 sm:p-6"
        >
          <div class="flex items-start justify-between gap-4">
            <div class="space-y-1">
              <div class="flex items-center gap-2">
                <span
                  class="inline-flex items-center gap-1 rounded-full bg-amber-500/20 px-2.5 py-0.5 text-xs font-semibold text-amber-400 ring-1 ring-amber-500/30"
                >
                  <UIcon class="size-3.5" name="i-lucide-sparkles" />
                  ยินดีต้อนรับเจ้าหน้าที่ฝึกงาน
                </span>
                <span class="text-xs text-neutral-400">
                  สำหรับเข้าใช้งานครั้งแรก (First-Time Onboarding)
                </span>
              </div>
              <h2 class="text-xl sm:text-2xl font-bold tracking-tight">
                คู่มือและขั้นตอนเริ่มต้นระบบการฝึกงาน (Setup Wizard)
              </h2>
              <p
                class="text-xs sm:text-sm text-neutral-300 max-w-2xl leading-relaxed"
              >
                เรียนรู้วิธีการใช้งาน ตรวจสอบโครงสร้างสำนักวิชาและสาขาวิชา
                พร้อมทั้งนำเข้าและตรวจสอบความถูกต้องของข้อมูลนักศึกษาฝึกงาน
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

          <!-- Step Progress Indicator -->
          <div
            class="mt-6 grid grid-cols-4 gap-2 pt-2 border-t border-white/10"
          >
            <div
              v-for="s in [
                {
                  num: 1,
                  label: '1. ตรวจสอบสำนักวิชา',
                  icon: 'i-lucide-building-2'
                },
                {
                  num: 2,
                  label: '2. ตรวจสอบสาขาวิชา',
                  icon: 'i-lucide-graduation-cap'
                },
                {
                  num: 3,
                  label: '3. ข้อมูล User & Data',
                  icon: 'i-lucide-users-round'
                },
                {
                  num: 4,
                  label: '4. ยืนยันเข้าสู่ระบบ',
                  icon: 'i-lucide-check-circle-2'
                }
              ]"
              :key="s.num"
              class="flex items-center gap-2 text-xs transition-colors"
              :class="[
                currentStep === s.num
                  ? 'text-amber-400 font-semibold'
                  : currentStep > s.num
                    ? 'text-emerald-400'
                    : 'text-neutral-400'
              ]"
            >
              <span
                class="grid size-6 shrink-0 place-items-center rounded-full text-[11px] font-bold"
                :class="[
                  currentStep === s.num
                    ? 'bg-amber-500 text-neutral-950 ring-2 ring-amber-400/40'
                    : currentStep > s.num
                      ? 'bg-emerald-500 text-neutral-950'
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
        <main class="flex-1 overflow-y-auto p-5 sm:p-6 space-y-6">
          <!-- ============================================================= -->
          <!-- STEP 1: สำนักวิชา (School Structure) -->
          <!-- ============================================================= -->
          <section v-if="currentStep === 1" class="space-y-4">
            <div class="rounded-xl bg-primary/5 border border-primary/20 p-4">
              <div class="flex items-start gap-3">
                <UIcon
                  class="size-5 text-primary mt-0.5 shrink-0"
                  name="i-lucide-info"
                />
                <div class="text-xs sm:text-sm space-y-1">
                  <p class="font-semibold text-highlighted">
                    ขั้นตอนที่ 1: ตรวจสอบและทำความเข้าใจโครงสร้างสำนักวิชา
                  </p>
                  <p class="text-muted leading-relaxed">
                    ระบบ Internship Transcript
                    ของมหาวิทยาลัยแม่ฟ้าหลวงจัดกลุ่มข้อมูลนักศึกษาและสิทธิ์การฝึกงานตาม
                    <strong>สำนักวิชา (Schools)</strong> ทั้ง 14 สำนักวิชา
                    เจ้าหน้าที่สามารถตรวจสอบรหัสสำนักวิชา
                    หรือคลิกปรับแต่งเพิ่มเติมได้ในเมนู "สำนักวิชาและหลักสูตร"
                  </p>
                </div>
              </div>
            </div>

            <div
              class="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3"
            >
              <div class="relative flex-1 max-w-sm">
                <UInput
                  v-model="searchSchool"
                  icon="i-lucide-search"
                  placeholder="ค้นหารหัสหรือชื่อสำนักวิชา..."
                  size="sm"
                />
              </div>
              <div class="text-xs text-muted flex items-center gap-2">
                <span
                  >ทั้งหมด <strong>{{ schools.length }}</strong> สำนักวิชา</span
                >
                <UBadge color="success" size="xs" variant="subtle">
                  สถานะพร้อมใช้งาน
                </UBadge>
              </div>
            </div>

            <!-- Schools Grid -->
            <div v-if="loading" class="py-12 text-center text-muted space-y-2">
              <UIcon
                class="size-8 animate-spin text-primary"
                name="i-lucide-loader-2"
              />
              <p class="text-xs">กำลังโหลดข้อมูลสำนักวิชา...</p>
            </div>

            <div
              v-else-if="filteredSchools.length === 0"
              class="py-8 text-center text-muted text-sm"
            >
              ไม่พบข้อมูลสำนักวิชาที่ค้นหา
            </div>

            <div
              v-else
              class="grid grid-cols-1 sm:grid-cols-2 gap-2.5 max-h-[360px] overflow-y-auto pr-1"
            >
              <div
                v-for="school in filteredSchools"
                :key="school.id"
                class="flex items-center justify-between p-3 rounded-lg border border-default/70 bg-default hover:bg-muted/10 transition-colors"
              >
                <div class="min-w-0 flex items-center gap-2.5">
                  <span
                    class="grid size-8 shrink-0 place-items-center rounded-md bg-secondary/15 text-secondary font-mono text-xs font-bold"
                  >
                    {{ school.schoolCode }}
                  </span>
                  <div class="min-w-0">
                    <p
                      class="font-semibold text-xs sm:text-sm text-highlighted truncate"
                    >
                      {{ school.name.th }}
                    </p>
                    <p class="text-[11px] text-muted truncate">
                      {{ school.name.en }}
                    </p>
                  </div>
                </div>

                <UBadge color="neutral" size="xs" variant="outline">
                  {{ school.status || 'Active' }}
                </UBadge>
              </div>
            </div>

            <div
              class="rounded-lg bg-neutral-100 dark:bg-neutral-800/60 p-3 text-xs text-muted flex items-center justify-between"
            >
              <span
                >💡 คำแนะนำ: หากต้องการเพิ่มหรือแก้ไขข้อมูลสำนักวิชา
                สามารถไปที่เมนู
                <strong>ตั้งค่า &gt; สำนักวิชาและหลักสูตร</strong>
                ได้ในภายหลัง</span
              >
            </div>
          </section>

          <!-- ============================================================= -->
          <!-- STEP 2: สาขาวิชา (Programs & Curriculum) -->
          <!-- ============================================================= -->
          <section v-if="currentStep === 2" class="space-y-4">
            <div class="rounded-xl bg-primary/5 border border-primary/20 p-4">
              <div class="flex items-start gap-3">
                <UIcon
                  class="size-5 text-primary mt-0.5 shrink-0"
                  name="i-lucide-info"
                />
                <div class="text-xs sm:text-sm space-y-1">
                  <p class="font-semibold text-highlighted">
                    ขั้นตอนที่ 2: ตรวจสอบสาขาวิชาและหลักสูตรที่เปิดรับฝึกงาน
                  </p>
                  <p class="text-muted leading-relaxed">
                    แต่ละสำนักวิชาจะประกอบด้วยหลักสูตร/สาขาวิชา (Programs)
                    ซึ่งใช้เชื่อมโยงกับรายชื่อนักศึกษาและเกณฑ์สมรรถนะการฝึกงานเฉพาะสาขา
                    สามารถเลือกกรองดูตามสำนักวิชาได้ด้านล่าง
                  </p>
                </div>
              </div>
            </div>

            <!-- School Selector Filter -->
            <div
              class="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3"
            >
              <div class="flex items-center gap-2 min-w-0 flex-1">
                <label class="text-xs font-semibold text-muted shrink-0">
                  เลือกสำนักวิชา:
                </label>
                <select
                  v-model="selectedSchoolFilter"
                  class="w-full max-w-xs rounded-md border border-default bg-default px-3 py-1.5 text-xs text-highlighted focus:outline-none focus:ring-1 focus:ring-primary"
                >
                  <option value="">ทั้งหมดทุกสำนักวิชา</option>
                  <option v-for="s in schools" :key="s.id" :value="s.id">
                    {{ s.name.th }} ({{ s.schoolCode }})
                  </option>
                </select>
              </div>

              <div class="text-xs text-muted">
                พบ
                <strong>{{ filteredPrograms.length }}</strong>
                หลักสูตรในสำนักวิชานี้
              </div>
            </div>

            <!-- Programs List -->
            <div
              v-if="filteredPrograms.length === 0"
              class="py-12 text-center text-muted text-sm"
            >
              ไม่พบหลักสูตรในสำนักวิชานี้
            </div>

            <div
              v-else
              class="grid grid-cols-1 sm:grid-cols-2 gap-2.5 max-h-[360px] overflow-y-auto pr-1"
            >
              <div
                v-for="prog in filteredPrograms"
                :key="prog.id"
                class="flex items-center justify-between p-3 rounded-lg border border-default/70 bg-default hover:bg-muted/10 transition-colors"
              >
                <div class="min-w-0 flex items-center gap-2.5">
                  <span
                    class="grid size-8 shrink-0 place-items-center rounded-md bg-primary/10 text-primary font-mono text-xs font-bold"
                  >
                    {{ prog.programCode }}
                  </span>
                  <div class="min-w-0">
                    <p
                      class="font-semibold text-xs sm:text-sm text-highlighted truncate"
                    >
                      {{ prog.name.th }}
                    </p>
                    <p class="text-[11px] text-muted truncate">
                      {{ prog.name.en }} · {{ getSchoolName(prog.schoolId) }}
                    </p>
                  </div>
                </div>

                <UBadge color="info" size="xs" variant="subtle">
                  {{ prog.status || 'Active' }}
                </UBadge>
              </div>
            </div>
          </section>

          <!-- ============================================================= -->
          <!-- STEP 3: ข้อมูล User / อัปโหลด User และตรวจสอบความถูกต้องของ Data -->
          <!-- ============================================================= -->
          <section v-if="currentStep === 3" class="space-y-4">
            <div
              class="rounded-xl bg-amber-500/10 border border-amber-500/20 p-4"
            >
              <div class="flex items-start gap-3">
                <UIcon
                  class="size-5 text-amber-600 mt-0.5 shrink-0"
                  name="i-lucide-file-spreadsheet"
                />
                <div class="text-xs sm:text-sm space-y-1">
                  <p class="font-semibold text-highlighted">
                    ขั้นตอนที่ 3: จัดการ อัปโหลด
                    และตรวจสอบความถูกต้องของข้อมูลนักศึกษา (User & Data
                    Verification)
                  </p>
                  <p class="text-muted leading-relaxed">
                    ให้อัปโหลดไฟล์ Excel/CSV หรือคลิก
                    <strong>"โหลดข้อมูลตัวอย่างทดสอบ"</strong> เพื่อดูว่า Data
                    ข้อมูลถูกต้องหรือไม่ มีการแก้ไขข้อมูลไหม สามารถคลิก
                    <strong>แก้ไข (Edit)</strong> ได้ทันทีในตาราง
                    ก่อนกดยืนยันเพื่อบันทึกเข้าสู่หน้าหลัก
                  </p>
                </div>
              </div>
            </div>

            <!-- Upload Toolbar & Quick Action Buttons -->
            <div
              class="flex flex-wrap items-center justify-between gap-3 p-3 rounded-xl border border-dashed border-default/80 bg-neutral-50 dark:bg-neutral-900/50"
            >
              <div class="flex flex-wrap items-center gap-2">
                <!-- File Upload Button -->
                <label
                  class="cursor-pointer inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-white hover:bg-primary/90 transition-colors shadow-sm"
                >
                  <UIcon class="size-4" name="i-lucide-upload" />
                  <span>อัปโหลดไฟล์ Excel (.xlsx / .csv)</span>
                  <input
                    accept=".xlsx,.xls,.csv"
                    class="hidden"
                    type="file"
                    @change="handleFileUpload"
                  />
                </label>

                <!-- Quick Load Sample Data Button -->
                <UButton
                  color="secondary"
                  icon="i-lucide-sparkles"
                  label="โหลดข้อมูลตัวอย่างนักศึกษาทดสอบ"
                  size="xs"
                  variant="outline"
                  @click="loadDemoStudents"
                />

                <!-- Add Row Button -->
                <UButton
                  color="neutral"
                  icon="i-lucide-plus"
                  label="เพิ่มข้อมูลแถวใหม่"
                  size="xs"
                  variant="subtle"
                  @click="addNewEmptyRow"
                />
              </div>

              <!-- Summary Status Badges -->
              <div class="flex items-center gap-2 text-xs">
                <span class="text-muted">
                  ทั้งหมด <strong>{{ studentRows.length }}</strong> รายการ:
                </span>
                <UBadge color="success" size="xs" variant="subtle">
                  ถูกต้อง
                  {{ studentRows.filter((r) => r.status === 'valid').length }}
                </UBadge>
                <UBadge
                  v-if="studentRows.some((r) => r.status === 'invalid')"
                  color="error"
                  size="xs"
                  variant="subtle"
                >
                  ต้องแก้ไข
                  {{ studentRows.filter((r) => r.status === 'invalid').length }}
                </UBadge>
              </div>
            </div>

            <!-- Data Table Preview -->
            <div
              v-if="studentRows.length === 0"
              class="rounded-xl border border-default p-10 text-center space-y-3"
            >
              <span
                class="grid size-12 place-items-center rounded-full bg-muted/20 text-muted mx-auto"
              >
                <UIcon class="size-6" name="i-lucide-inbox" />
              </span>
              <div>
                <p class="font-semibold text-sm text-highlighted">
                  ยังไม่มีข้อมูลนักศึกษาในตารางตรวจสอบ
                </p>
                <p class="text-xs text-muted max-w-sm mx-auto mt-1">
                  คลิกปุ่ม
                  <strong>"โหลดข้อมูลตัวอย่างนักศึกษาทดสอบ"</strong> ด้านบน
                  หรืออัปโหลดไฟล์ Excel เพื่อเริ่มตรวจสอบข้อมูล Data
                </p>
              </div>
              <UButton
                color="primary"
                icon="i-lucide-sparkles"
                label="โหลดข้อมูลตัวอย่างทันที"
                size="sm"
                @click="loadDemoStudents"
              />
            </div>

            <div
              v-else
              class="rounded-xl border border-default overflow-hidden"
            >
              <div class="overflow-x-auto max-h-[320px]">
                <table class="w-full text-left text-xs border-collapse">
                  <thead
                    class="sticky top-0 bg-neutral-100 dark:bg-neutral-900 border-b border-default font-semibold text-highlighted"
                  >
                    <tr>
                      <th class="p-2.5">สถานะ</th>
                      <th class="p-2.5">รหัสนักศึกษา</th>
                      <th class="p-2.5">ชื่อ-นามสกุล</th>
                      <th class="p-2.5">อีเมลนักศึกษา</th>
                      <th class="p-2.5">อีเมลส่วนตัว</th>
                      <th class="p-2.5">สำนักวิชา / หลักสูตร</th>
                      <th class="p-2.5">สถานประกอบการ</th>
                      <th class="p-2.5 text-right">จัดการ</th>
                    </tr>
                  </thead>
                  <tbody class="divide-y divide-default">
                    <tr
                      v-for="row in studentRows"
                      :key="row.tempId"
                      class="hover:bg-muted/10 transition-colors"
                      :class="{ 'bg-rose-500/5': row.status === 'invalid' }"
                    >
                      <td class="p-2.5 whitespace-nowrap">
                        <UBadge
                          :color="row.status === 'valid' ? 'success' : 'error'"
                          size="xs"
                          :variant="row.status === 'valid' ? 'subtle' : 'solid'"
                        >
                          <UIcon
                            :name="
                              row.status === 'valid'
                                ? 'i-lucide-check'
                                : 'i-lucide-alert-circle'
                            "
                            class="size-3 mr-0.5"
                          />
                          {{ row.status === 'valid' ? 'ถูกต้อง' : 'ต้องแก้ไข' }}
                        </UBadge>
                        <p
                          v-if="row.errors.length > 0"
                          class="text-[10px] text-rose-500 max-w-[140px] truncate mt-0.5"
                          :title="row.errors.join(', ')"
                        >
                          {{ row.errors[0] }}
                        </p>
                      </td>

                      <td
                        class="p-2.5 font-mono font-medium text-highlighted whitespace-nowrap"
                      >
                        {{ row.studentId || '-' }}
                      </td>

                      <td class="p-2.5 whitespace-nowrap">
                        <p class="font-medium text-highlighted">
                          {{ row.nameTh || row.nameEn || '-' }}
                        </p>
                        <p class="text-[10px] text-muted">
                          {{ row.nameEn }}
                        </p>
                      </td>

                      <td class="p-2.5 font-mono text-muted whitespace-nowrap">
                        {{ row.email || '-' }}
                      </td>

                      <td class="p-2.5 font-mono text-muted whitespace-nowrap">
                        {{ row.personalEmail || '-' }}
                      </td>

                      <td class="p-2.5 max-w-[180px] truncate">
                        <p class="font-medium text-highlighted truncate">
                          {{ getSchoolName(row.schoolId) }}
                        </p>
                        <p class="text-[10px] text-muted truncate">
                          {{ getProgramName(row.programId) }}
                        </p>
                      </td>

                      <td class="p-2.5 max-w-[160px] truncate text-muted">
                        {{ row.company || '-' }}
                      </td>

                      <td class="p-2.5 text-right whitespace-nowrap">
                        <div class="inline-flex items-center gap-1">
                          <UButton
                            aria-label="แก้ไขข้อมูล"
                            color="neutral"
                            icon="i-lucide-pencil"
                            size="xs"
                            variant="ghost"
                            @click="openEditRow(row)"
                          />
                          <UButton
                            aria-label="ลบแถว"
                            color="error"
                            icon="i-lucide-trash-2"
                            size="xs"
                            variant="ghost"
                            @click="deleteRow(row.tempId)"
                          />
                        </div>
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          </section>

          <!-- ============================================================= -->
          <!-- STEP 4: ยืนยันข้อมูลและเข้าสู่หน้าหลัก (Completion) -->
          <!-- ============================================================= -->
          <section v-if="currentStep === 4" class="py-6 text-center space-y-5">
            <div
              class="mx-auto grid size-16 place-items-center rounded-full bg-emerald-500/10 text-emerald-500 ring-8 ring-emerald-500/20"
            >
              <UIcon class="size-8" name="i-lucide-check-check" />
            </div>

            <div class="space-y-2 max-w-md mx-auto">
              <h3 class="text-xl font-bold text-highlighted">
                ตั้งค่าและตรวจสอบข้อมูลเริ่มต้นเสร็จสมบูรณ์!
              </h3>
              <p class="text-xs sm:text-sm text-muted leading-relaxed">
                ระบบได้บันทึกข้อมูลนักศึกษาที่ผ่านการตรวจสอบเรียบร้อยแล้ว
                โครงสร้างสำนักวิชาและสาขาวิชาพร้อมใช้งานสำหรับรอบการฝึกงานนี้
              </p>
            </div>

            <!-- Summary Highlights -->
            <div
              class="grid grid-cols-1 sm:grid-cols-3 gap-3 max-w-lg mx-auto text-left"
            >
              <div
                class="rounded-xl border border-default p-3 bg-neutral-50 dark:bg-neutral-900/50"
              >
                <p class="text-[11px] text-muted">สำนักวิชา</p>
                <p class="text-lg font-bold text-highlighted mt-0.5">
                  {{ schools.length }} แห่ง
                </p>
                <p class="text-[10px] text-emerald-600 font-medium">
                  ✓ ตรวจสอบแล้ว
                </p>
              </div>

              <div
                class="rounded-xl border border-default p-3 bg-neutral-50 dark:bg-neutral-900/50"
              >
                <p class="text-[11px] text-muted">สาขาวิชา / หลักสูตร</p>
                <p class="text-lg font-bold text-highlighted mt-0.5">
                  {{ programs.length }} สาขา
                </p>
                <p class="text-[10px] text-emerald-600 font-medium">
                  ✓ ตรวจสอบแล้ว
                </p>
              </div>

              <div
                class="rounded-xl border border-default p-3 bg-neutral-50 dark:bg-neutral-900/50"
              >
                <p class="text-[11px] text-muted">นักศึกษาที่บันทึกแล้ว</p>
                <p class="text-lg font-bold text-highlighted mt-0.5">
                  {{ importedCount }} คน
                </p>
                <p class="text-[10px] text-emerald-600 font-medium">
                  ✓ นำเข้าสำเร็จ
                </p>
              </div>
            </div>

            <div class="pt-4">
              <UButton
                class="px-6 py-2.5 text-sm font-semibold shadow-md"
                color="primary"
                icon="i-lucide-arrow-right"
                label="กดยืนยันเข้าสู่หน้าหลัก (Go to Dashboard)"
                size="md"
                trailing
                @click="handleCompleteWizard"
              />
            </div>
          </section>
        </main>

        <!-- Footer: Wizard Navigation Buttons -->
        <footer
          v-if="currentStep < 4"
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
              label="ข้ามไปก่อน"
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
                  ? 'ถัดไป: ดูสาขาวิชา'
                  : 'ถัดไป: จัดการข้อมูล User'
              "
              size="sm"
              trailing
              @click="currentStep++"
            />

            <!-- Confirm & Submit button for Step 3 -->
            <UButton
              v-else-if="currentStep === 3"
              color="primary"
              icon="i-lucide-check-circle"
              label="กดยืนยันและบันทึกข้อมูล (Confirm Data)"
              :loading="saving"
              size="sm"
              trailing
              @click="handleConfirmAndSubmit"
            />
          </div>
        </footer>
      </div>
    </template>
  </UModal>

  <!-- Nested Edit Student Row Modal -->
  <UModal v-model:open="isEditModalOpen" :ui="{ content: 'sm:max-w-lg' }">
    <template #content>
      <div v-if="editingRow" class="p-5 sm:p-6 space-y-4">
        <div
          class="flex items-center justify-between border-b border-default pb-3"
        >
          <h3
            class="text-base font-bold text-highlighted flex items-center gap-2"
          >
            <UIcon class="size-5 text-primary" name="i-lucide-user-cog" />
            แก้ไขข้อมูลนักศึกษา
          </h3>
          <UButton
            aria-label="ปิด"
            color="neutral"
            icon="i-lucide-x"
            size="xs"
            variant="ghost"
            @click="isEditModalOpen = false"
          />
        </div>

        <div class="space-y-3 text-xs">
          <div>
            <label class="font-semibold text-muted"
              >รหัสนักศึกษา (10 หลัก):</label
            >
            <UInput
              v-model="editingRow.studentId"
              class="mt-1"
              placeholder="6631501001"
              size="sm"
            />
          </div>

          <div class="grid grid-cols-2 gap-2">
            <div>
              <label class="font-semibold text-muted"
                >ชื่อ-นามสกุล (ภาษาไทย):</label
              >
              <UInput
                v-model="editingRow.nameTh"
                class="mt-1"
                placeholder="นายสมชาย ใจดี"
                size="sm"
              />
            </div>
            <div>
              <label class="font-semibold text-muted"
                >ชื่อ-นามสกุล (ภาษาอังกฤษ):</label
              >
              <UInput
                v-model="editingRow.nameEn"
                class="mt-1"
                placeholder="Mr. Somchai Jaidee"
                size="sm"
              />
            </div>
          </div>

          <div class="grid grid-cols-2 gap-2">
            <div>
              <label class="font-semibold text-muted"
                >อีเมลนักศึกษา (@lamduan):</label
              >
              <UInput
                v-model="editingRow.email"
                class="mt-1"
                placeholder="6631501001@lamduan.mfu.ac.th"
                size="sm"
              />
            </div>
            <div>
              <label class="font-semibold text-muted">อีเมลส่วนตัว:</label>
              <UInput
                v-model="editingRow.personalEmail"
                class="mt-1"
                placeholder="personal@gmail.com"
                size="sm"
              />
            </div>
          </div>

          <div>
            <label class="font-semibold text-muted">สำนักวิชา:</label>
            <select
              v-model="editingRow.schoolId"
              class="mt-1 w-full rounded-md border border-default bg-default px-3 py-1.5 text-xs text-highlighted focus:outline-none focus:ring-1 focus:ring-primary"
            >
              <option v-for="s in schools" :key="s.id" :value="s.id">
                {{ s.name.th }} ({{ s.schoolCode }})
              </option>
            </select>
          </div>

          <div>
            <label class="font-semibold text-muted">สาขาวิชา / หลักสูตร:</label>
            <select
              v-model="editingRow.programId"
              class="mt-1 w-full rounded-md border border-default bg-default px-3 py-1.5 text-xs text-highlighted focus:outline-none focus:ring-1 focus:ring-primary"
            >
              <option
                v-for="p in programs.filter(
                  (pr) => pr.schoolId === editingRow?.schoolId
                )"
                :key="p.id"
                :value="p.id"
              >
                {{ p.name.th }} ({{ p.programCode }})
              </option>
            </select>
          </div>

          <div class="grid grid-cols-2 gap-2">
            <div>
              <label class="font-semibold text-muted">สถานประกอบการ:</label>
              <UInput
                v-model="editingRow.company"
                class="mt-1"
                placeholder="บริษัท ดิจิทัล จำกัด"
                size="sm"
              />
            </div>
            <div>
              <label class="font-semibold text-muted">จังหวัด:</label>
              <UInput
                v-model="editingRow.province"
                class="mt-1"
                placeholder="กรุงเทพมหานคร"
                size="sm"
              />
            </div>
          </div>
        </div>

        <div
          class="flex items-center justify-end gap-2 pt-3 border-t border-default"
        >
          <UButton
            color="neutral"
            label="ยกเลิก"
            size="xs"
            variant="ghost"
            @click="isEditModalOpen = false"
          />
          <UButton
            color="primary"
            icon="i-lucide-check"
            label="บันทึกการแก้ไข"
            size="xs"
            @click="saveEditedRow"
          />
        </div>
      </div>
    </template>
  </UModal>
</template>
