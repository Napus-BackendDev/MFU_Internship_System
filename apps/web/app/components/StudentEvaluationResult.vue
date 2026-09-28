<script setup lang="ts">
import {
  formatCategoryAverage,
  type EvaluationCategoryScore,
  type EvaluationRatingAnswer,
  type EvaluationTextAnswer
} from '~/utils/student-evaluation-result'

defineProps<{
  readonly hardSkillScore: EvaluationCategoryScore | null
  readonly softSkillScore: EvaluationCategoryScore | null
  readonly hardSkillQuestions: readonly EvaluationRatingAnswer[]
  readonly softSkillQuestions: readonly EvaluationRatingAnswer[]
  readonly suggestions: readonly EvaluationTextAnswer[]
}>()

function formatRating(answer: EvaluationRatingAnswer): string {
  if (answer.score === null) return 'ยังไม่ได้ตอบ'
  return `${answer.score.toFixed(1)} / ${answer.scaleMax ?? '—'}`
}
</script>

<template>
  <section
    class="rounded-xl border border-default bg-default p-5 shadow-sm space-y-5"
  >
    <header class="flex items-start gap-3 border-b border-default/70 pb-4">
      <span
        class="grid size-9 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary"
      >
        <UIcon name="i-lucide-chart-no-axes-combined" class="size-4" />
      </span>
      <div>
        <h3 class="font-bold text-highlighted">ผลการประเมินสมรรถนะ</h3>
        <p class="mt-1 text-xs text-muted">
          คะแนนแยกตามหมวดจากผลประเมินฉบับสมบูรณ์ ไม่มีคะแนนรวมข้ามหมวด
        </p>
      </div>
    </header>

    <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
      <article class="rounded-xl border border-blue-500/20 bg-blue-500/5 p-4">
        <p class="text-xs font-semibold text-blue-700 dark:text-blue-300">
          Hard Skills · ทักษะวิชาชีพ
        </p>
        <p class="mt-1 text-2xl font-bold text-highlighted">
          {{ formatCategoryAverage(hardSkillScore) }}
          <span class="text-sm font-medium text-muted">
            {{ hardSkillScore?.scaleMax ? `/ ${hardSkillScore.scaleMax}` : '' }}
          </span>
        </p>
        <p class="mt-1 text-[11px] text-muted">
          ตอบ {{ hardSkillScore?.answeredCount ?? 0 }} ข้อ
        </p>
      </article>

      <article
        class="rounded-xl border border-purple-500/20 bg-purple-500/5 p-4"
      >
        <p class="text-xs font-semibold text-purple-700 dark:text-purple-300">
          Soft Skills · ทักษะการทำงาน
        </p>
        <p class="mt-1 text-2xl font-bold text-highlighted">
          {{ formatCategoryAverage(softSkillScore) }}
          <span class="text-sm font-medium text-muted">
            {{ softSkillScore?.scaleMax ? `/ ${softSkillScore.scaleMax}` : '' }}
          </span>
        </p>
        <p class="mt-1 text-[11px] text-muted">
          ตอบ {{ softSkillScore?.answeredCount ?? 0 }} ข้อ
        </p>
      </article>
    </div>

    <div class="grid grid-cols-1 xl:grid-cols-2 gap-4">
      <article class="space-y-2">
        <h4 class="text-sm font-bold text-highlighted">Hard Skills</h4>
        <p v-if="hardSkillQuestions.length === 0" class="text-xs text-muted">
          แบบประเมินไม่มีคำถามคะแนนในหมวดนี้
        </p>
        <div
          v-for="answer in hardSkillQuestions"
          :key="answer.id"
          class="flex items-start justify-between gap-3 rounded-lg border border-default/70 bg-muted/10 p-3 text-xs"
        >
          <span class="text-highlighted">{{ answer.label.th }}</span>
          <span
            class="shrink-0 font-mono font-semibold text-blue-700 dark:text-blue-300"
          >
            {{ formatRating(answer) }}
          </span>
        </div>
      </article>

      <article class="space-y-2">
        <h4 class="text-sm font-bold text-highlighted">Soft Skills</h4>
        <p v-if="softSkillQuestions.length === 0" class="text-xs text-muted">
          แบบประเมินไม่มีคำถามคะแนนในหมวดนี้
        </p>
        <div
          v-for="answer in softSkillQuestions"
          :key="answer.id"
          class="flex items-start justify-between gap-3 rounded-lg border border-default/70 bg-muted/10 p-3 text-xs"
        >
          <span class="text-highlighted">{{ answer.label.th }}</span>
          <span
            class="shrink-0 font-mono font-semibold text-purple-700 dark:text-purple-300"
          >
            {{ formatRating(answer) }}
          </span>
        </div>
      </article>
    </div>

    <article v-if="suggestions.length > 0" class="space-y-2">
      <h4 class="text-sm font-bold text-highlighted">ข้อเสนอแนะ</h4>
      <div
        v-for="suggestion in suggestions"
        :key="suggestion.id"
        class="rounded-lg border border-default/70 bg-muted/10 p-3 text-xs"
      >
        <p class="font-semibold text-highlighted">{{ suggestion.label.th }}</p>
        <p class="mt-1 whitespace-pre-wrap leading-relaxed text-muted">
          {{ suggestion.value }}
        </p>
      </div>
    </article>
  </section>
</template>
