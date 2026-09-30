<script>
import { Head } from '@inertiajs/vue3';
import ProfileIndex from 'dashboard/routes/dashboard/settings/profile/Index.vue';
import AppShell from 'dashboard/inertia/layouts/AppShell.vue';
import SettingsLayout from 'dashboard/inertia/layouts/SettingsLayout.vue';
import SettingsWrapper from 'dashboard/inertia/layouts/SettingsWrapper.vue';

export default {
  name: 'InertiaProfileIndex',
  components: { Head, ProfileIndex },
  layout: [AppShell, SettingsLayout, SettingsWrapper],
};
</script>

<template>
  <Head title="Profile" />
  <ProfileIndex />
</template>
