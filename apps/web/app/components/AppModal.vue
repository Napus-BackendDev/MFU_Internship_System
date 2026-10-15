<script setup lang="ts">
defineOptions({ inheritAttrs: false })
withDefaults(
  defineProps<{
    open: boolean
    title: string
    fullscreen?: boolean
    dismissible?: boolean
    scrollable?: boolean
    ui?: Record<string, string>
  }>(),
  { fullscreen: false, dismissible: true, scrollable: false, ui: () => ({}) }
)
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
    :fullscreen="fullscreen"
    :dismissible="dismissible"
    :scrollable="scrollable"
    :ui="ui"
    :content="{
      onOpenAutoFocus: rememberFocus,
      onCloseAutoFocus: restoreFocus
    }"
    @update:open="emit('update:open', $event)"
  >
    <template #content><slot /></template>
  </UModal>
</template>
