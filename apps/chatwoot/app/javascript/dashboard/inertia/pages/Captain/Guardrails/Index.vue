<script>
// Thin Inertia page (docs §2.1): captain guardrails (captain_integration_v2). Full-bleed →
// AppShell ALONE. Renders the EXISTING assistants/guardrails Index.vue unchanged; it
// self-fetches via Vuex and reads :assistantId from the URL via useAppNavigation().
// currentParams. useCaptainAssistantTracking replicates the dropped CaptainPageRouteView watch.
import { Head } from '@inertiajs/vue3';
import AssistantGuardrailsIndex from 'dashboard/routes/dashboard/captain/assistants/guardrails/Index.vue';
import AppShell from 'dashboard/inertia/layouts/AppShell.vue';
import { useCaptainAssistantTracking } from 'dashboard/composables/useCaptainAssistantTracking';

export default {
  name: 'InertiaCaptainGuardrails',
  components: { Head, AssistantGuardrailsIndex },
  layout: AppShell,
  setup() {
    useCaptainAssistantTracking();
  },
};
</script>

<template>
  <Head title="Captain" />
  <AssistantGuardrailsIndex />
</template>
