<script setup>
import { watch } from 'vue';
import { useAppNavigation } from 'dashboard/composables/useAppNavigation';
import { useUISettings } from 'dashboard/composables/useUISettings';

// Dual-mode: this parent shell is dropped under Inertia (the thin pages replicate the
// tracking via useCaptainAssistantTracking); it stays mounted only in the legacy SPA,
// where `<router-view>` renders the child captain routes.
const { currentParams } = useAppNavigation();
const { uiSettings, updateUISettings } = useUISettings();

watch(
  () => currentParams.value.assistantId,
  newAssistantId => {
    if (
      newAssistantId &&
      newAssistantId !== String(uiSettings.value.last_active_assistant_id)
    ) {
      updateUISettings({
        last_active_assistant_id: Number(newAssistantId),
      });
    }
  }
);
</script>

<template>
  <div class="flex w-full h-full min-h-0">
    <section class="flex flex-1 h-full px-0 overflow-hidden bg-n-surface-1">
      <router-view />
    </section>
  </div>
</template>
