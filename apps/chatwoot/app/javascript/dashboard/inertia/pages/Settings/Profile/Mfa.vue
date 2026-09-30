<script>
import { Head } from '@inertiajs/vue3';
import MfaSettings from 'dashboard/routes/dashboard/settings/profile/MfaSettings.vue';
import AppShell from 'dashboard/inertia/layouts/AppShell.vue';
import SettingsLayout from 'dashboard/inertia/layouts/SettingsLayout.vue';
import SettingsWrapper from 'dashboard/inertia/layouts/SettingsWrapper.vue';

export default {
  name: 'InertiaProfileMfa',
  components: { Head, MfaSettings },
  layout: [AppShell, SettingsLayout, SettingsWrapper],
};
</script>

<template>
  <Head title="Two-factor authentication" />
  <MfaSettings />
</template>
