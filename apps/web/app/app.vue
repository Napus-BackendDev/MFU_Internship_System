<template>
  <UApp>
    <a
      class="sr-only rounded-md bg-default px-4 py-2 text-highlighted focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50"
      href="#main-content"
    >
      {{ $t('accessibility.skipToContent') }}
    </a>
    <NuxtLoadingIndicator color="var(--ui-primary)" />
    <NuxtRouteAnnouncer />
    <NuxtLayout>
      <NuxtPage />
    </NuxtLayout>
  </UApp>
</template>
