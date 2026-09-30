<script>
import { Head } from '@inertiajs/vue3';
import AssistantSystemSettingsIndex from 'dashboard/routes/dashboard/captain/assistants/settings/System.vue';
import AppShell from 'dashboard/inertia/layouts/AppShell.vue';
import { useCaptainAssistantTracking } from 'dashboard/composables/useCaptainAssistantTracking';

export default {
  name: 'InertiaCaptainSystemSettings',
  components: { Head, AssistantSystemSettingsIndex },
  layout: AppShell,
  setup() {
    useCaptainAssistantTracking();
  },
};
</script>

<template>
  <Head title="Captain" />
  <AssistantSystemSettingsIndex />
</template>
