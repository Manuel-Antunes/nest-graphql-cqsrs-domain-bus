<script>
// Thin Inertia page (docs §2.1): captain scenarios (captain_integration_v2). Full-bleed →
// AppShell ALONE. Renders the EXISTING assistants/scenarios Index.vue unchanged; it
// self-fetches via Vuex and reads :assistantId from the URL via useAppNavigation().
// currentParams. useCaptainAssistantTracking replicates the dropped CaptainPageRouteView
// watch (records last-active assistant).
import { Head } from '@inertiajs/vue3';
import AssistantScenariosIndex from 'dashboard/routes/dashboard/captain/assistants/scenarios/Index.vue';
import AppShell from 'dashboard/inertia/layouts/AppShell.vue';
import { useCaptainAssistantTracking } from 'dashboard/composables/useCaptainAssistantTracking';

export default {
  name: 'InertiaCaptainScenarios',
  components: { Head, AssistantScenariosIndex },
  layout: AppShell,
  setup() {
    useCaptainAssistantTracking();
  },
};
</script>

<template>
  <Head title="Captain" />
  <AssistantScenariosIndex />
</template>
