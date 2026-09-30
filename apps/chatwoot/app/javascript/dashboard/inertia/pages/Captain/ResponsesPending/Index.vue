<script>
// Thin Inertia page (docs §2.1): captain pending FAQs. Full-bleed → AppShell ALONE.
// Renders the EXISTING responses Pending.vue unchanged; it self-fetches via Vuex and reads
// :assistantId from the URL via useAppNavigation().currentParams. useCaptainAssistantTracking
// replicates the dropped CaptainPageRouteView watch (records last-active assistant).
import { Head } from '@inertiajs/vue3';
import ResponsesPendingIndex from 'dashboard/routes/dashboard/captain/responses/Pending.vue';
import AppShell from 'dashboard/inertia/layouts/AppShell.vue';
import { useCaptainAssistantTracking } from 'dashboard/composables/useCaptainAssistantTracking';

export default {
  name: 'InertiaCaptainResponsesPending',
  components: { Head, ResponsesPendingIndex },
  layout: AppShell,
  setup() {
    useCaptainAssistantTracking();
  },
};
</script>

<template>
  <Head title="Captain" />
  <ResponsesPendingIndex />
</template>
