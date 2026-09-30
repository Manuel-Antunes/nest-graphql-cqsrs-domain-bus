<script>
// Generic integration config by :integration_id (settings_applications_integration).
// IntegrationHooks requires the integration id as a prop; the controller passes it
// through from params[:integration_id] (e.g. 'dialogflow', 'openai').
import { Head } from '@inertiajs/vue3';
import IntegrationHooks from 'dashboard/routes/dashboard/settings/integrations/IntegrationHooks.vue';
import AppShell from 'dashboard/inertia/layouts/AppShell.vue';
import SettingsLayout from 'dashboard/inertia/layouts/SettingsLayout.vue';
import SettingsWrapper from 'dashboard/inertia/layouts/SettingsWrapper.vue';

export default {
  name: 'InertiaIntegrationHooks',
  components: { Head, IntegrationHooks },
  layout: [AppShell, SettingsLayout, SettingsWrapper],
  props: {
    integrationId: {
      type: String,
      required: true,
    },
  },
};
</script>

<template>
  <Head title="Integration" />
  <IntegrationHooks :integration-id="integrationId" />
</template>
