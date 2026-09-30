<script>
// Thin Inertia page — renders the existing account settings component unchanged.
import { Head } from '@inertiajs/vue3';
import GeneralIndex from 'dashboard/routes/dashboard/settings/account/Index.vue';
import AppShell from 'dashboard/inertia/layouts/AppShell.vue';
import SettingsLayout from 'dashboard/inertia/layouts/SettingsLayout.vue';
import SettingsWrapper from 'dashboard/inertia/layouts/SettingsWrapper.vue';

export default {
  name: 'InertiaGeneralIndex',
  components: { Head, GeneralIndex },
  layout: [AppShell, SettingsLayout, SettingsWrapper],
};
</script>

<template>
  <Head title="General Settings" />
  <GeneralIndex />
</template>
