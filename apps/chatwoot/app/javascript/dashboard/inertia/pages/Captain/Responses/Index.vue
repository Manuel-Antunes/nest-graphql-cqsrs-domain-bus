<script>
// Thin Inertia page (docs §2.1): captain FAQs/responses. Full-bleed → AppShell ALONE.
// Renders the EXISTING responses Index.vue unchanged; it self-fetches via Vuex and reads
// :assistantId from the URL via useAppNavigation().currentParams. useCaptainAssistantTracking
// replicates the dropped CaptainPageRouteView watch (records last-active assistant).
import { Head } from '@inertiajs/vue3';
import ResponsesIndex from 'dashboard/routes/dashboard/captain/responses/Index.vue';
import AppShell from 'dashboard/inertia/layouts/AppShell.vue';
import { useCaptainAssistantTracking } from 'dashboard/composables/useCaptainAssistantTracking';

export default {
  name: 'InertiaCaptainResponses',
  components: { Head, ResponsesIndex },
  layout: AppShell,
  setup() {
    useCaptainAssistantTracking();
  },
};
</script>

<template>
  <Head title="Captain" />
  <ResponsesIndex />
</template>
