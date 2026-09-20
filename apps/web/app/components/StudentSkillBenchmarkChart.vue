<script setup lang="ts">
export interface SkillItem {
  id: string
  name: string
  nameEn: string
  category: 'hard' | 'soft'
  studentScore: number
  cohortAverage: number
  description: string
}

const props = withDefaults(
  defineProps<{
    studentScore?: number | string
    academicYear?: number | string
    studentName?: string
    customSkills?: SkillItem[]
  }>(),
  {
    studentScore: 5.0,
    academicYear: 2569,
    studentName: 'นักศึกษา',
    customSkills: () => []
  }
)

const activeTab = ref<'all' | 'hard' | 'soft'>('all')
const chartView = ref<'radar' | 'bars'>('radar')

// Base student score as float (default 5.0)
const baseScore = computed(() => {
  const parsed =
    typeof props.studentScore === 'string'
      ? parseFloat(props.studentScore)
      : props.studentScore
  return isNaN(parsed) || parsed <= 0 ? 5.0 : Math.min(5.0, parsed)
})

// Skills data dynamic based on student base score
const skills = computed<SkillItem[]>(() => {
  if (props.customSkills && props.customSkills.length > 0) {
    return props.customSkills
  }

  const s = baseScore.value
  const factor = s / 5.0

  return [
    // Soft Skills (6 sub-sections อิงตามแบบฟอร์มประเมินมาตรฐาน มฟล.)
    {
      id: 'soft_punctuality',
      name: 'ความตรงต่อเวลาและระเบียบวินัย',
      nameEn: 'Punctuality & Regulations',
      category: 'soft',
      studentScore: Number((5.0 * factor).toFixed(2)),
      cohortAverage: 4.2,
      description: 'การเข้างานตรงเวลา ปฏิบัติตามกฎระเบียบ และการรักษาวินัย'
    },
    {
      id: 'soft_teamwork',
      name: 'การทำงานร่วมกับผู้อื่นและการสื่อสาร',
      nameEn: 'Teamwork & Communication',
      category: 'soft',
      studentScore: Number((5.0 * factor).toFixed(2)),
      cohortAverage: 4.25,
      description:
        'มนุษยสัมพันธ์ การทำงานเป็นทีม และการสื่อสารอย่างมีประสิทธิภาพ'
    },
    {
      id: 'soft_responsibility',
      name: 'ความรับผิดชอบต่องาน',
      nameEn: 'Task Responsibility & Initiative',
      category: 'soft',
      studentScore: Number((5.0 * factor).toFixed(2)),
      cohortAverage: 4.15,
      description: 'ความใส่ใจรอบคอบ ความมุ่งมั่น และการส่งงานตรงตามกำหนด'
    },
    {
      id: 'soft_problem_solving',
      name: 'การคิดวิเคราะห์และแก้ปัญหา',
      nameEn: 'Problem Solving & Critical Thinking',
      category: 'soft',
      studentScore: Number((4.8 * factor).toFixed(2)),
      cohortAverage: 3.95,
      description: 'การวิเคราะห์ปัญหาอย่างเป็นระบบและการตัดสินใจเฉพาะหน้า'
    },
    {
      id: 'soft_learning',
      name: 'การเรียนรู้และความคิดริเริ่ม',
      nameEn: 'Initiative & Fast Learning',
      category: 'soft',
      studentScore: Number((5.0 * factor).toFixed(2)),
      cohortAverage: 4.15,
      description: 'ความกระตือรือร้นในการศึกษาเทคโนโลยีใหม่และความคิดสร้างสรรค์'
    },
    {
      id: 'soft_ethics',
      name: 'คุณธรรมและจรรยาบรรณวิชาชีพ',
      nameEn: 'Ethics & Professional Integrity',
      category: 'soft',
      studentScore: Number((5.0 * factor).toFixed(2)),
      cohortAverage: 4.3,
      description: 'ความซื่อสัตย์สุจริต การรักษาความลับ และจรรยาบรรณวิชาชีพ'
    },

    // Hard Skills (6 sub-sections)
    {
      id: 'hard_dev',
      name: 'พัฒนาซอฟต์แวร์และสถาปัตยกรรม',
      nameEn: 'Software Engineering & Architecture',
      category: 'hard',
      studentScore: Number((5.0 * factor).toFixed(2)),
      cohortAverage: 4.05,
      description: 'Component architecture, Clean code, RESTful/GraphQL APIs'
    },
    {
      id: 'hard_data',
      name: 'การจัดการฐานข้อมูลและ Data',
      nameEn: 'Database & Data Engineering',
      category: 'hard',
      studentScore: Number((4.9 * factor).toFixed(2)),
      cohortAverage: 4.1,
      description: 'Data modeling, PostgreSQL, MongoDB, Query optimization'
    },
    {
      id: 'hard_qa',
      name: 'การทดสอบระบบและ QA',
      nameEn: 'QA & Automated Testing',
      category: 'hard',
      studentScore: Number((4.8 * factor).toFixed(2)),
      cohortAverage: 3.95,
      description: 'Unit/E2E testing, Vitest, Edge case handling, Code quality'
    },
    {
      id: 'hard_devops',
      name: 'คลาวด์และโครงสร้างพื้นฐาน',
      nameEn: 'Cloud & DevOps Infrastructure',
      category: 'hard',
      studentScore: Number((4.9 * factor).toFixed(2)),
      cohortAverage: 4.0,
      description: 'Docker containerization, CI/CD pipeline automation, Shell'
    },
    {
      id: 'hard_troubleshoot',
      name: 'การวิเคราะห์และแก้ไขปัญหา',
      nameEn: 'System Troubleshooting & Analysis',
      category: 'hard',
      studentScore: Number((5.0 * factor).toFixed(2)),
      cohortAverage: 4.15,
      description:
        'Root cause analysis, Log inspection, Performance optimization'
    },
    {
      id: 'hard_workflow',
      name: 'เครื่องมือวิศวกรรมและ Agile',
      nameEn: 'Engineering Tools & Agile Workflow',
      category: 'hard',
      studentScore: Number((5.0 * factor).toFixed(2)),
      cohortAverage: 4.25,
      description: 'Git workflow, Pull request review, Sprint participation'
    }
  ]
})

// Filtered by selected tab
const filteredSkills = computed(() => {
  if (activeTab.value === 'all') return skills.value
  return skills.value.filter((s) => s.category === activeTab.value)
})

// Aggregates
const overallStudentAvg = computed(() => {
  const sum = skills.value.reduce((acc, curr) => acc + curr.studentScore, 0)
  return (sum / skills.value.length).toFixed(2)
})

const overallCohortAvg = computed(() => {
  const sum = skills.value.reduce((acc, curr) => acc + curr.cohortAverage, 0)
  return (sum / skills.value.length).toFixed(2)
})

const overallDiffPercent = computed(() => {
  const s = parseFloat(overallStudentAvg.value)
  const c = parseFloat(overallCohortAvg.value)
  const diff = ((s - c) / c) * 100
  return (diff >= 0 ? '+' : '') + diff.toFixed(1) + '%'
})

const softAvg = computed(() => {
  const list = skills.value.filter((s) => s.category === 'soft')
  const s = list.reduce((a, b) => a + b.studentScore, 0) / list.length
  const c = list.reduce((a, b) => a + b.cohortAverage, 0) / list.length
  return {
    student: s.toFixed(2),
    cohort: c.toFixed(2),
    diff: (((s - c) / c) * 100).toFixed(1)
  }
})

const hardAvg = computed(() => {
  const list = skills.value.filter((s) => s.category === 'hard')
  const s = list.reduce((a, b) => a + b.studentScore, 0) / list.length
  const c = list.reduce((a, b) => a + b.cohortAverage, 0) / list.length
  return {
    student: s.toFixed(2),
    cohort: c.toFixed(2),
    diff: (((s - c) / c) * 100).toFixed(1)
  }
})

// =============================================================================
// SVG RADAR CHART MATHEMATICAL COMPUTATION
// =============================================================================
const radarSize = 340
const cx = 170
const cy = 160
const maxRadius = 100

const radarSkills = computed(() => filteredSkills.value)

function getCoordinates(
  index: number,
  total: number,
  value: number,
  max: number = 5
): { x: number; y: number } {
  const angle = -Math.PI / 2 + (index * 2 * Math.PI) / total
  const r = (Math.max(0, Math.min(value, max)) / max) * maxRadius
  return {
    x: Number((cx + r * Math.cos(angle)).toFixed(2)),
    y: Number((cy + r * Math.sin(angle)).toFixed(2))
  }
}

function getLabelCoordinates(
  index: number,
  total: number
): { x: number; y: number } {
  const angle = -Math.PI / 2 + (index * 2 * Math.PI) / total
  const r = maxRadius + 32
  return {
    x: Number((cx + r * Math.cos(angle)).toFixed(2)),
    y: Number((cy + r * Math.sin(angle)).toFixed(2))
  }
}

const studentPolygonPoints = computed(() => {
  const total = radarSkills.value.length
  return radarSkills.value
    .map((s, i) => {
      const pt = getCoordinates(i, total, s.studentScore)
      return `${pt.x},${pt.y}`
    })
    .join(' ')
})

const cohortPolygonPoints = computed(() => {
  const total = radarSkills.value.length
  return radarSkills.value
    .map((s, i) => {
      const pt = getCoordinates(i, total, s.cohortAverage)
      return `${pt.x},${pt.y}`
    })
    .join(' ')
})

const gridRings = [1.0, 2.0, 3.0, 4.0, 5.0]
function getRingPolygonPoints(level: number): string {
  const total = radarSkills.value.length
  return Array.from({ length: total })
    .map((_, i) => {
      const pt = getCoordinates(i, total, level)
      return `${pt.x},${pt.y}`
    })
    .join(' ')
}
</script>

<template>
  <div
    class="rounded-xl border border-default bg-default p-5 shadow-sm space-y-5"
  >
    <!-- Header with Benchmark Standing Badges -->
    <div
      class="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-default/70 pb-4"
    >
      <div>
        <div class="flex items-center gap-2">
          <span
            class="grid size-8 place-items-center rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
          >
            <UIcon name="i-lucide-radar" class="size-4" />
          </span>
          <h3 class="text-base font-bold text-highlighted">
            การวิเคราะห์สมรรถนะเทียบกับนักศึกษารุ่นปี {{ academicYear }}
          </h3>
          <UBadge
            color="success"
            size="xs"
            variant="subtle"
            class="font-semibold"
          >
            เด่นกว่ารุ่นปี {{ academicYear }} ({{ overallDiffPercent }})
          </UBadge>
        </div>
        <p class="text-xs text-muted mt-1">
          เปรียบเทียบทักษะรายด้าน (Hard Skills & Soft Skills) ของ
          {{ studentName }} กับค่าเฉลี่ยของเพื่อนร่วมรุ่นปีการศึกษา
          {{ academicYear }}
        </p>
      </div>

      <!-- Chart Display View Toggle (Radar / Bars) -->
      <div
        class="inline-flex items-center rounded-lg border border-default bg-muted/20 p-1 text-xs shrink-0 self-start sm:self-auto"
      >
        <button
          type="button"
          :class="[
            'px-2.5 py-1 rounded-md font-medium transition-colors flex items-center gap-1.5 cursor-pointer',
            chartView === 'radar'
              ? 'bg-primary text-inverted font-bold shadow-xs'
              : 'text-muted hover:text-highlighted'
          ]"
          @click="chartView = 'radar'"
        >
          <UIcon name="i-lucide-radar" class="size-3.5" />
          ใยแมงมุม (Radar)
        </button>
        <button
          type="button"
          :class="[
            'px-2.5 py-1 rounded-md font-medium transition-colors flex items-center gap-1.5 cursor-pointer',
            chartView === 'bars'
              ? 'bg-primary text-inverted font-bold shadow-xs'
              : 'text-muted hover:text-highlighted'
          ]"
          @click="chartView = 'bars'"
        >
          <UIcon name="i-lucide-bar-chart-2" class="size-3.5" />
          แท่งเปรียบเทียบ (Bars)
        </button>
      </div>
    </div>

    <!-- 3 Summary KPI Cards (Overall, Hard, Soft) -->
    <div class="grid grid-cols-1 sm:grid-cols-3 gap-3">
      <!-- 1. ภาพรวม -->
      <div
        class="p-3.5 rounded-xl border border-default/80 bg-gradient-to-br from-emerald-500/5 to-transparent space-y-1"
      >
        <div class="flex items-center justify-between text-xs text-muted">
          <span class="font-medium">ภาพรวมสมรรถนะทุกด้าน</span>
          <span class="text-emerald-600 font-bold font-mono">{{
            overallDiffPercent
          }}</span>
        </div>
        <div class="flex items-baseline gap-2">
          <span class="text-2xl font-bold text-highlighted">{{
            overallStudentAvg
          }}</span>
          <span class="text-xs text-muted"
            >/ 5.0 (รุ่นปี: {{ overallCohortAvg }})</span
          >
        </div>
        <div
          class="text-[11px] text-emerald-700 dark:text-emerald-400 flex items-center gap-1"
        >
          <UIcon name="i-lucide-trending-up" class="size-3" />
          ระดับโดดเด่น Top 5% ของรุ่น
        </div>
      </div>

      <!-- 2. Hard Skills -->
      <div
        class="p-3.5 rounded-xl border border-default/80 bg-gradient-to-br from-blue-500/5 to-transparent space-y-1"
      >
        <div class="flex items-center justify-between text-xs text-muted">
          <span class="font-medium">ทักษะวิชาชีพ (Hard Skills)</span>
          <span class="text-blue-600 font-bold font-mono"
            >+{{ hardAvg.diff }}%</span
          >
        </div>
        <div class="flex items-baseline gap-2">
          <span class="text-2xl font-bold text-highlighted">{{
            hardAvg.student
          }}</span>
          <span class="text-xs text-muted"
            >/ 5.0 (รุ่นปี: {{ hardAvg.cohort }})</span
          >
        </div>
        <div
          class="text-[11px] text-blue-700 dark:text-blue-400 flex items-center gap-1"
        >
          <UIcon name="i-lucide-cpu" class="size-3" />
          เด่นด้านเครื่องมือและงานเทคนิค
        </div>
      </div>

      <!-- 3. Soft Skills -->
      <div
        class="p-3.5 rounded-xl border border-default/80 bg-gradient-to-br from-purple-500/5 to-transparent space-y-1"
      >
        <div class="flex items-center justify-between text-xs text-muted">
          <span class="font-medium">ทักษะการทำงาน (Soft Skills)</span>
          <span class="text-purple-600 font-bold font-mono"
            >+{{ softAvg.diff }}%</span
          >
        </div>
        <div class="flex items-baseline gap-2">
          <span class="text-2xl font-bold text-highlighted">{{
            softAvg.student
          }}</span>
          <span class="text-xs text-muted"
            >/ 5.0 (รุ่นปี: {{ softAvg.cohort }})</span
          >
        </div>
        <div
          class="text-[11px] text-purple-700 dark:text-purple-400 flex items-center gap-1"
        >
          <UIcon name="i-lucide-users" class="size-3" />
          เด่นด้านทีมเวิร์กและการเรียนรู้
        </div>
      </div>
    </div>

    <!-- Filter Category Tabs (ทั้งหมด / Hard Skills / Soft Skills) -->
    <div class="flex items-center gap-1.5 border-b border-default/70 pb-2">
      <button
        type="button"
        :class="[
          'px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer flex items-center gap-1.5',
          activeTab === 'all'
            ? 'bg-primary/10 text-primary ring-1 ring-primary/20'
            : 'text-muted hover:text-highlighted hover:bg-muted/30'
        ]"
        @click="activeTab = 'all'"
      >
        <UIcon name="i-lucide-layers" class="size-3.5" />
        ทักษะทั้งหมด (10 ทักษะ)
      </button>

      <button
        type="button"
        :class="[
          'px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer flex items-center gap-1.5',
          activeTab === 'hard'
            ? 'bg-blue-500/10 text-blue-600 dark:text-blue-400 ring-1 ring-blue-500/20'
            : 'text-muted hover:text-highlighted hover:bg-muted/30'
        ]"
        @click="activeTab = 'hard'"
      >
        <UIcon name="i-lucide-code" class="size-3.5" />
        Hard Skills (วิชาชีพ)
      </button>

      <button
        type="button"
        :class="[
          'px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer flex items-center gap-1.5',
          activeTab === 'soft'
            ? 'bg-purple-500/10 text-purple-600 dark:text-purple-400 ring-1 ring-purple-500/20'
            : 'text-muted hover:text-highlighted hover:bg-muted/30'
        ]"
        @click="activeTab = 'soft'"
      >
        <UIcon name="i-lucide-heart-handshake" class="size-3.5" />
        Soft Skills (ความประพฤติ)
      </button>
    </div>

    <!-- Chart Body -->
    <!-- VIEW 1: SVG RADAR CHART (ใยแมงมุม) -->
    <div
      v-if="chartView === 'radar'"
      class="grid grid-cols-1 xl:grid-cols-12 gap-6 items-center"
    >
      <div class="xl:col-span-7 flex flex-col items-center justify-center p-2">
        <svg
          :viewBox="`0 0 ${radarSize} ${radarSize}`"
          class="w-full max-w-[340px] sm:max-w-[380px] overflow-visible drop-shadow-sm"
        >
          <!-- Background concentric polygon rings (Levels 1 to 5) -->
          <g
            class="text-neutral-300 dark:text-neutral-700/60 stroke-current"
            fill="none"
            stroke-width="1"
          >
            <polygon
              v-for="level in gridRings"
              :key="level"
              :points="getRingPolygonPoints(level)"
              :class="
                level === 5
                  ? 'stroke-neutral-400 dark:stroke-neutral-600'
                  : 'stroke-neutral-200 dark:stroke-neutral-800'
              "
              :stroke-dasharray="level === 5 ? undefined : '2 2'"
            />
          </g>

          <!-- Axis lines connecting center to outer ring points -->
          <g
            class="stroke-neutral-300 dark:stroke-neutral-700/80"
            stroke-width="1"
          >
            <line
              v-for="(_, i) in radarSkills"
              :key="i"
              :x1="cx"
              :y1="cy"
              :x2="getCoordinates(i, radarSkills.length, 5).x"
              :y2="getCoordinates(i, radarSkills.length, 5).y"
            />
          </g>

          <!-- Cohort Average Polygon (ปีเดียวกัน - สีเทา/ฟ้าโปร่งใส) -->
          <polygon
            :points="cohortPolygonPoints"
            class="fill-slate-400/20 stroke-slate-500 dark:stroke-slate-400"
            stroke-width="2"
            stroke-dasharray="4 2"
          />

          <!-- Student Polygon (คะแนนนักศึกษา - สีมรกต/เขียวเด่นชัด) -->
          <polygon
            :points="studentPolygonPoints"
            class="fill-emerald-500/35 stroke-emerald-600 dark:stroke-emerald-400"
            stroke-width="2.5"
          />

          <!-- Student Data Points & Glow -->
          <circle
            v-for="(s, i) in radarSkills"
            :key="`student-pt-${i}`"
            :cx="getCoordinates(i, radarSkills.length, s.studentScore).x"
            :cy="getCoordinates(i, radarSkills.length, s.studentScore).y"
            r="4.5"
            class="fill-emerald-600 dark:fill-emerald-400 stroke-white dark:stroke-neutral-900"
            stroke-width="1.5"
          />

          <!-- Axis Labels around perimeter -->
          <text
            v-for="(s, i) in radarSkills"
            :key="`label-${i}`"
            :x="getLabelCoordinates(i, radarSkills.length).x"
            :y="getLabelCoordinates(i, radarSkills.length).y"
            text-anchor="middle"
            dominant-baseline="central"
            class="fill-neutral-700 dark:fill-neutral-300 font-semibold text-[10px] sm:text-[11px]"
          >
            {{ s.name }}
          </text>
        </svg>

        <!-- Radar Legend -->
        <div class="flex items-center justify-center gap-6 mt-4 text-xs">
          <div class="flex items-center gap-2">
            <span
              class="size-3 rounded-full bg-emerald-500 ring-2 ring-emerald-500/30"
            />
            <span class="font-bold text-highlighted"
              >คะแนนของนักศึกษา ({{ overallStudentAvg }})</span
            >
          </div>
          <div class="flex items-center gap-2">
            <span
              class="size-3 rounded-full border-2 border-dashed border-slate-500 bg-slate-400/30"
            />
            <span class="text-muted"
              >ค่าเฉลี่ยรุ่นปี {{ academicYear }} ({{ overallCohortAvg }})</span
            >
          </div>
        </div>
      </div>

      <!-- Radar Insight Sidebar List -->
      <div class="xl:col-span-5 space-y-3">
        <h4
          class="text-xs font-bold uppercase tracking-wider text-muted flex items-center gap-1.5"
        >
          <UIcon name="i-lucide-sparkles" class="size-3.5 text-amber-500" />
          การประเมินจุดเด่นรายทักษะ
        </h4>

        <div class="space-y-2 max-h-[300px] overflow-y-auto pr-1">
          <div
            v-for="s in radarSkills"
            :key="s.id"
            class="p-2.5 rounded-lg border border-default/60 bg-muted/10 hover:bg-muted/20 transition-colors text-xs space-y-1"
          >
            <div class="flex items-center justify-between">
              <span
                class="font-bold text-highlighted flex items-center gap-1.5"
              >
                <span
                  :class="[
                    'size-2 rounded-full',
                    s.category === 'hard' ? 'bg-blue-500' : 'bg-purple-500'
                  ]"
                />
                {{ s.name }}
              </span>
              <span class="font-mono font-bold text-emerald-600">
                {{ s.studentScore }}
                <span class="text-[10px] text-muted font-normal">/ 5.0</span>
              </span>
            </div>
            <div
              class="flex items-center justify-between text-[11px] text-muted"
            >
              <span
                >ค่าเฉลี่ยรุ่นปี {{ academicYear }}: {{ s.cohortAverage }}</span
              >
              <span
                class="font-semibold text-emerald-600 dark:text-emerald-400"
              >
                +{{
                  (
                    ((s.studentScore - s.cohortAverage) / s.cohortAverage) *
                    100
                  ).toFixed(0)
                }}% เหนือกว่า
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- VIEW 2: COMPARATIVE PROGRESS BARS (แท่งเปรียบเทียบ) -->
    <div v-else class="space-y-4">
      <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div
          v-for="s in filteredSkills"
          :key="s.id"
          class="p-3.5 rounded-xl border border-default/70 bg-muted/10 space-y-2"
        >
          <!-- Skill Title & Badges -->
          <div class="flex items-start justify-between gap-2">
            <div>
              <div class="flex items-center gap-1.5">
                <UBadge
                  :color="s.category === 'hard' ? 'info' : 'secondary'"
                  size="xs"
                  variant="subtle"
                >
                  {{ s.category === 'hard' ? 'Hard Skill' : 'Soft Skill' }}
                </UBadge>
                <h4 class="font-bold text-xs sm:text-sm text-highlighted">
                  {{ s.name }}
                </h4>
              </div>
              <p class="text-[11px] text-muted mt-0.5">
                {{ s.nameEn }}
              </p>
            </div>

            <div class="text-right shrink-0">
              <span class="text-xs font-bold text-emerald-600 font-mono">
                {{ s.studentScore }} / 5.0
              </span>
              <p
                class="text-[10px] text-emerald-700 dark:text-emerald-400 font-semibold"
              >
                +{{
                  (
                    ((s.studentScore - s.cohortAverage) / s.cohortAverage) *
                    100
                  ).toFixed(0)
                }}% จากรุ่น
              </p>
            </div>
          </div>

          <!-- Progress Bar 1: Student Score -->
          <div class="space-y-1 text-xs">
            <div class="flex justify-between text-[11px] text-muted">
              <span
                class="font-medium text-highlighted flex items-center gap-1"
              >
                <span class="size-1.5 rounded-full bg-emerald-500" />
                คะแนนของนักศึกษา
              </span>
              <span class="font-mono font-semibold text-highlighted">{{
                s.studentScore
              }}</span>
            </div>
            <div class="h-2 w-full rounded-full bg-muted/40 overflow-hidden">
              <div
                class="h-full bg-gradient-to-r from-emerald-500 to-teal-400 rounded-full transition-all duration-500"
                :style="{ width: `${(s.studentScore / 5.0) * 100}%` }"
              />
            </div>
          </div>

          <!-- Progress Bar 2: Cohort Average -->
          <div class="space-y-1 text-xs">
            <div class="flex justify-between text-[11px] text-muted">
              <span class="flex items-center gap-1">
                <span class="size-1.5 rounded-full bg-slate-400" />
                ค่าเฉลี่ยรุ่นปี {{ academicYear }}
              </span>
              <span class="font-mono">{{ s.cohortAverage }}</span>
            </div>
            <div class="h-1.5 w-full rounded-full bg-muted/30 overflow-hidden">
              <div
                class="h-full bg-slate-400 dark:bg-slate-500 rounded-full transition-all duration-500"
                :style="{ width: `${(s.cohortAverage / 5.0) * 100}%` }"
              />
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- AI Diagnostic & Growth Feedback Banner -->
    <div
      class="p-3.5 rounded-xl border border-emerald-500/20 bg-emerald-500/5 text-xs text-muted flex items-start gap-3"
    >
      <span
        class="grid size-8 shrink-0 place-items-center rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
      >
        <UIcon name="i-lucide-trophy" class="size-4" />
      </span>
      <div class="space-y-0.5">
        <p class="font-bold text-highlighted">
          บทวิเคราะห์สมรรถนะภาพรวม (Competency Standing):
        </p>
        <p class="leading-relaxed">
          นักศึกษามีผลการประเมินเฉลี่ย
          <strong class="text-emerald-600 dark:text-emerald-400"
            >{{ overallStudentAvg }} / 5.0</strong
          >
          ซึ่ง
          <strong
            >โดดเด่นกว่าค่าเฉลี่ยของนักศึกษารุ่นปี {{ academicYear }}</strong
          >
          ({{ overallCohortAvg }} / 5.0) คิดเป็น
          <strong class="text-emerald-600 dark:text-emerald-400">{{
            overallDiffPercent
          }}</strong>
          โดยมีจุดเด่นสูงสุดในด้าน
          <em>การประยุกต์ใช้เครื่องมือและเทคโนโลยี</em> (5.0) และ
          <em>การทำงานร่วมกับผู้อื่น</em> (5.0)
          สอดคล้องกับมาตรฐานวิชาชีพระดับดีเยี่ยม (Grade A)
        </p>
      </div>
    </div>
  </div>
</template>
