<script>
import { Head } from '@inertiajs/vue3';
import CaptainSettingsIndex from 'dashboard/routes/dashboard/settings/captain/Index.vue';
import AppShell from 'dashboard/inertia/layouts/AppShell.vue';
import SettingsLayout from 'dashboard/inertia/layouts/SettingsLayout.vue';
import SettingsWrapper from 'dashboard/inertia/layouts/SettingsWrapper.vue';

export default {
  name: 'InertiaCaptainSettingsIndex',
  components: { Head, CaptainSettingsIndex },
  layout: [AppShell, SettingsLayout, SettingsWrapper],
};
</script>

<template>
  <Head title="Captain" />
  <CaptainSettingsIndex />
</template>
