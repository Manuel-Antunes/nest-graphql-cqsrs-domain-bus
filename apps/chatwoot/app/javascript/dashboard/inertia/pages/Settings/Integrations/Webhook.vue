<script>
import { Head } from '@inertiajs/vue3';
import Webhook from 'dashboard/routes/dashboard/settings/integrations/Webhooks/Index.vue';
import AppShell from 'dashboard/inertia/layouts/AppShell.vue';
import SettingsLayout from 'dashboard/inertia/layouts/SettingsLayout.vue';
import SettingsWrapper from 'dashboard/inertia/layouts/SettingsWrapper.vue';

export default {
  name: 'InertiaIntegrationsWebhook',
  components: { Head, Webhook },
  layout: [AppShell, SettingsLayout, SettingsWrapper],
};
</script>

<template>
  <Head title="Webhooks" />
  <Webhook />
</template>
