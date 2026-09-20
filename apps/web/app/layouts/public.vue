<template>
  <div class="min-h-dvh bg-[var(--semantic-bg-canvas)]">
    <div
      aria-hidden="true"
      class="h-1 bg-gradient-to-r from-primary via-primary to-secondary"
    />
    <header class="sticky top-0 z-40 border-b border-default bg-default">
      <UContainer class="flex h-16 items-center justify-between">
        <NuxtLink
          class="flex min-h-11 items-center gap-3 text-highlighted"
          to="/"
        >
          <MfuBrandMark alt="" size="md" />
          <span>
            <strong class="font-heading block text-sm font-bold">
              MFU Internship
            </strong>
            <span class="block text-xs font-medium text-secondary">
              Transcript System
            </span>
          </span>
        </NuxtLink>
        <ColorModeButton />
      </UContainer>
    </header>
    <main id="main-content"><slot /></main>
  </div>
</template>
