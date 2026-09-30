<script>
// Thin Inertia page (docs §2.1): captain playground. Full-bleed → AppShell ALONE.
// Renders the EXISTING assistants/playground Index.vue unchanged; it reads :assistantId
// from the URL via useAppNavigation().currentParams. useCaptainAssistantTracking
// replicates the dropped CaptainPageRouteView watch (records last-active assistant).
import { Head } from '@inertiajs/vue3';
import AssistantPlaygroundIndex from 'dashboard/routes/dashboard/captain/assistants/playground/Index.vue';
import AppShell from 'dashboard/inertia/layouts/AppShell.vue';
import { useCaptainAssistantTracking } from 'dashboard/composables/useCaptainAssistantTracking';

export default {
  name: 'InertiaCaptainPlayground',
  components: { Head, AssistantPlaygroundIndex },
  layout: AppShell,
  setup() {
    useCaptainAssistantTracking();
  },
};
</script>

<template>
  <Head title="Captain" />
  <AssistantPlaygroundIndex />
</template>
