<script>
// Thin Inertia page (docs §2.1): captain custom tools (captain_integration_v2). Full-bleed
// → AppShell ALONE. Renders the EXISTING tools Index.vue unchanged; it self-fetches via
// Vuex. useCaptainAssistantTracking replicates the dropped CaptainPageRouteView watch
// (records last-active assistant from the :assistantId in the URL).
import { Head } from '@inertiajs/vue3';
import CustomToolsIndex from 'dashboard/routes/dashboard/captain/tools/Index.vue';
import AppShell from 'dashboard/inertia/layouts/AppShell.vue';
import { useCaptainAssistantTracking } from 'dashboard/composables/useCaptainAssistantTracking';

export default {
  name: 'InertiaCaptainTools',
  components: { Head, CustomToolsIndex },
  layout: AppShell,
  setup() {
    useCaptainAssistantTracking();
  },
};
</script>

<template>
  <Head title="Captain" />
  <CustomToolsIndex />
</template>
