<script setup lang="ts">
defineOptions({ inheritAttrs: false })
defineProps<{ open: boolean; title: string }>()
const emit = defineEmits<{ 'update:open': [open: boolean] }>()
let opener: HTMLElement | null = null
function rememberFocus(): void {
  opener =
    document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null
}
function restoreFocus(event: Event): void {
  event.preventDefault()
  if (opener?.isConnected) opener.focus()
}
</script>

<template>
  <UModal
    v-bind="$attrs"
    :open="open"
    :title="title"
    :content="{
      onOpenAutoFocus: rememberFocus,
      onCloseAutoFocus: restoreFocus
    }"
    @update:open="emit('update:open', $event)"
  >
    <template #content><slot /></template>
  </UModal>
</template>
