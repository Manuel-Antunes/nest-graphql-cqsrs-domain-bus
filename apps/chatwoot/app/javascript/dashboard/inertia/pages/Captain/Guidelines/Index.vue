<script>
// Thin Inertia page (docs §2.1): captain response guidelines (captain_integration_v2).
// Full-bleed → AppShell ALONE. Renders the EXISTING assistants/guidelines Index.vue
// unchanged; it self-fetches via Vuex and reads :assistantId from the URL via
// useAppNavigation().currentParams. useCaptainAssistantTracking replicates the dropped
// CaptainPageRouteView watch.
import { Head } from '@inertiajs/vue3';
import AssistantGuidelinesIndex from 'dashboard/routes/dashboard/captain/assistants/guidelines/Index.vue';
import AppShell from 'dashboard/inertia/layouts/AppShell.vue';
import { useCaptainAssistantTracking } from 'dashboard/composables/useCaptainAssistantTracking';

export default {
  name: 'InertiaCaptainGuidelines',
  components: { Head, AssistantGuidelinesIndex },
  layout: AppShell,
  setup() {
    useCaptainAssistantTracking();
  },
};
</script>

<template>
  <Head title="Captain" />
  <AssistantGuidelinesIndex />
</template>
