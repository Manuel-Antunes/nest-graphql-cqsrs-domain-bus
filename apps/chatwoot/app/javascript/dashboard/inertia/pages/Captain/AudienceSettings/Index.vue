<script>
import { Head } from '@inertiajs/vue3';
import AssistantAudienceSettingsIndex from 'dashboard/routes/dashboard/captain/assistants/settings/Audience.vue';
import AppShell from 'dashboard/inertia/layouts/AppShell.vue';
import { useCaptainAssistantTracking } from 'dashboard/composables/useCaptainAssistantTracking';

export default {
  name: 'InertiaCaptainAudienceSettings',
  components: { Head, AssistantAudienceSettingsIndex },
  layout: AppShell,
  setup() {
    useCaptainAssistantTracking();
  },
};
</script>

<template>
  <Head title="Captain" />
  <AssistantAudienceSettingsIndex />
</template>
