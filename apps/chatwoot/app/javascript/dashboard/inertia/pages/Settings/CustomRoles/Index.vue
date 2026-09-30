<script>
// Thin Inertia page — renders the existing customRoles settings component unchanged.
import { Head } from '@inertiajs/vue3';
import CustomRolesIndex from 'dashboard/routes/dashboard/settings/customRoles/Index.vue';
import AppShell from 'dashboard/inertia/layouts/AppShell.vue';
import SettingsLayout from 'dashboard/inertia/layouts/SettingsLayout.vue';
import SettingsWrapper from 'dashboard/inertia/layouts/SettingsWrapper.vue';

export default {
  name: 'InertiaCustomRolesIndex',
  components: { Head, CustomRolesIndex },
  layout: [AppShell, SettingsLayout, SettingsWrapper],
};
</script>

<template>
  <Head title="Custom Roles" />
  <CustomRolesIndex />
</template>
