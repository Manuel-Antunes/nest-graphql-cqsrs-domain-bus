<script setup>
// Persistent Inertia layout for the settings section: pairs the settings sidebar with the
// page. Nests inside AppShell (which owns the rail) and wraps SettingsWrapper (which owns
// the content padding) — pages declare `layout: [AppShell, SettingsLayout, SettingsWrapper]`.
// Because every settings page names the same layout component, the sidebar instance
// survives navigation between them; leaving the section unmounts it, which is what keeps
// it off non-settings screens.
import SettingsSidebar from 'dashboard/components-next/sidebar/SettingsSidebar.vue';
</script>

<template>
  <div class="flex flex-1 w-full h-full min-w-0 min-h-0">
    <SettingsSidebar />
    <div class="flex flex-1 min-w-0 min-h-0"><slot /></div>
  </div>
</template>
