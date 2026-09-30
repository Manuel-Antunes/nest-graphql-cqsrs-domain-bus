<script>
// Thin Inertia page (docs §2.1): captain assistant settings. Full-bleed → AppShell ALONE.
// Renders the EXISTING assistants/settings Index.vue unchanged; it self-fetches via Vuex
// and reads :assistantId from the URL via useAppNavigation().currentParams.
// useCaptainAssistantTracking replicates the dropped CaptainPageRouteView watch.
import { Head } from '@inertiajs/vue3';
import AssistantSettingsIndex from 'dashboard/routes/dashboard/captain/assistants/settings/Index.vue';
import AppShell from 'dashboard/inertia/layouts/AppShell.vue';
import { useCaptainAssistantTracking } from 'dashboard/composables/useCaptainAssistantTracking';

export default {
  name: 'InertiaCaptainSettings',
  components: { Head, AssistantSettingsIndex },
  layout: AppShell,
  setup() {
    useCaptainAssistantTracking();
  },
};
</script>

<template>
  <Head title="Captain" />
  <AssistantSettingsIndex />
</template>
