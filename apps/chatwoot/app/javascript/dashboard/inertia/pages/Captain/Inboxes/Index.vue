<script>
// Thin Inertia page (docs §2.1): captain connected inboxes. Full-bleed → AppShell ALONE.
// Renders the EXISTING assistants/inboxes Index.vue unchanged; it self-fetches via Vuex
// and reads :assistantId from the URL via useAppNavigation().currentParams.
// useCaptainAssistantTracking replicates the dropped CaptainPageRouteView watch.
import { Head } from '@inertiajs/vue3';
import AssistantInboxesIndex from 'dashboard/routes/dashboard/captain/assistants/inboxes/Index.vue';
import AppShell from 'dashboard/inertia/layouts/AppShell.vue';
import { useCaptainAssistantTracking } from 'dashboard/composables/useCaptainAssistantTracking';

export default {
  name: 'InertiaCaptainInboxes',
  components: { Head, AssistantInboxesIndex },
  layout: AppShell,
  setup() {
    useCaptainAssistantTracking();
  },
};
</script>

<template>
  <Head title="Captain" />
  <AssistantInboxesIndex />
</template>
