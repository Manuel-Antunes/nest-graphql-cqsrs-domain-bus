<script>
import { Head } from '@inertiajs/vue3';
import BillingIndex from 'dashboard/routes/dashboard/settings/billing/Index.vue';
import AppShell from 'dashboard/inertia/layouts/AppShell.vue';
import SettingsLayout from 'dashboard/inertia/layouts/SettingsLayout.vue';
import SettingsWrapper from 'dashboard/inertia/layouts/SettingsWrapper.vue';

export default {
  name: 'InertiaBillingIndex',
  components: { Head, BillingIndex },
  layout: [AppShell, SettingsLayout, SettingsWrapper],
};
</script>

<template>
  <Head title="Billing" />
  <BillingIndex />
</template>
