<script setup>
// Inertia nested layout — the settings content padding shell. Mirrors
// routes/dashboard/settings/SettingsWrapper.vue, with <router-view> replaced by
// <slot /> (Inertia provides the page as the default slot).
</script>

<template>
  <div
    class="flex flex-col w-full h-full p-6 m-0 overflow-auto sm:py-8 lg:px-16 bg-n-background font-inter"
  >
    <div class="flex items-start w-full max-w-6xl mx-auto">
      <slot />
    </div>
  </div>
</template>
