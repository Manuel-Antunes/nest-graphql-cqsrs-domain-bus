<script>
// Thin Inertia page (docs §2.1): captain documents. Full-bleed → AppShell ALONE.
// Renders the EXISTING documents Index.vue unchanged; it self-fetches via Vuex and reads
// :assistantId from the URL via useAppNavigation().currentParams. useCaptainAssistantTracking
// replicates the dropped CaptainPageRouteView watch (records last-active assistant).
import { Head } from '@inertiajs/vue3';
import DocumentsIndex from 'dashboard/routes/dashboard/captain/documents/Index.vue';
import AppShell from 'dashboard/inertia/layouts/AppShell.vue';
import { useCaptainAssistantTracking } from 'dashboard/composables/useCaptainAssistantTracking';

export default {
  name: 'InertiaCaptainDocuments',
  components: { Head, DocumentsIndex },
  layout: AppShell,
  setup() {
    useCaptainAssistantTracking();
  },
};
</script>

<template>
  <Head title="Captain" />
  <DocumentsIndex />
</template>
