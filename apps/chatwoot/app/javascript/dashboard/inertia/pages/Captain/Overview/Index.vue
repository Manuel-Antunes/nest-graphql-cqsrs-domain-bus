<script>
import { Head } from '@inertiajs/vue3';
import AssistantOverviewIndex from 'dashboard/routes/dashboard/captain/assistants/overview/Index.vue';
import AppShell from 'dashboard/inertia/layouts/AppShell.vue';
import { useCaptainAssistantTracking } from 'dashboard/composables/useCaptainAssistantTracking';

export default {
  name: 'InertiaCaptainOverview',
  components: { Head, AssistantOverviewIndex },
  layout: AppShell,
  setup() {
    useCaptainAssistantTracking();
  },
};
</script>

<template>
  <Head title="Captain" />
  <AssistantOverviewIndex />
</template>
