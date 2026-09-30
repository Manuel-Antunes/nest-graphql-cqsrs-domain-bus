<script>
import { Head } from '@inertiajs/vue3';
import Shopify from 'dashboard/routes/dashboard/settings/integrations/Shopify.vue';
import AppShell from 'dashboard/inertia/layouts/AppShell.vue';
import SettingsLayout from 'dashboard/inertia/layouts/SettingsLayout.vue';
import SettingsWrapper from 'dashboard/inertia/layouts/SettingsWrapper.vue';

export default {
  name: 'InertiaIntegrationsShopify',
  components: { Head, Shopify },
  layout: [AppShell, SettingsLayout, SettingsWrapper],
};
</script>

<template>
  <Head title="Shopify" />
  <Shopify />
</template>
