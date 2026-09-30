<script>
import { Head } from '@inertiajs/vue3';
import AssistantScheduleSettingsIndex from 'dashboard/routes/dashboard/captain/assistants/settings/Schedule.vue';
import AppShell from 'dashboard/inertia/layouts/AppShell.vue';
import { useCaptainAssistantTracking } from 'dashboard/composables/useCaptainAssistantTracking';

export default {
  name: 'InertiaCaptainScheduleSettings',
  components: { Head, AssistantScheduleSettingsIndex },
  layout: AppShell,
  setup() {
    useCaptainAssistantTracking();
  },
};
</script>

<template>
  <Head title="Captain" />
  <AssistantScheduleSettingsIndex />
</template>
