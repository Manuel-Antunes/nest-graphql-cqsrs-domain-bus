<script>
// Macros list (thin-shell). Its "New" button + row "Edit" links are AppLinks that
// Inertia-visit the editor pages below.
import { Head } from '@inertiajs/vue3';
import MacrosIndex from 'dashboard/routes/dashboard/settings/macros/Index.vue';
import AppShell from 'dashboard/inertia/layouts/AppShell.vue';
import SettingsLayout from 'dashboard/inertia/layouts/SettingsLayout.vue';
import SettingsWrapper from 'dashboard/inertia/layouts/SettingsWrapper.vue';

export default {
  name: 'InertiaMacrosIndex',
  components: { Head, MacrosIndex },
  layout: [AppShell, SettingsLayout, SettingsWrapper],
};
</script>

<template>
  <Head title="Macros" />
  <MacrosIndex />
</template>
