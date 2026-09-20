<script setup lang="ts">
const props = withDefaults(
  defineProps<{
    readonly alt?: string
    readonly size?: 'sm' | 'md' | 'lg'
    readonly tone?: 'brand' | 'inverse'
  }>(),
  {
    alt: 'MFU CoEd',
    size: 'md',
    tone: 'brand'
  }
)

const sizeClass = computed(
  () =>
    ({
      sm: 'h-8',
      md: 'h-10',
      lg: 'h-14'
    })[props.size]
)
</script>

<template>
  <img
    :alt="alt"
    :aria-hidden="alt ? undefined : 'true'"
    :class="[
      'block w-auto shrink-0 object-contain',
      sizeClass,
      tone === 'inverse' ? 'brightness-0 invert' : ''
    ]"
    src="/brand/mfu-coed-logo.svg"
  />
</template>
