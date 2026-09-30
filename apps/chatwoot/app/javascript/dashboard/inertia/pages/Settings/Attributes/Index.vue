<script>
// Thin Inertia page — renders the existing custom-attributes component unchanged.
import { Head } from '@inertiajs/vue3';
import AttributesHome from 'dashboard/routes/dashboard/settings/attributes/Index.vue';
import AppShell from 'dashboard/inertia/layouts/AppShell.vue';
import SettingsLayout from 'dashboard/inertia/layouts/SettingsLayout.vue';
import SettingsWrapper from 'dashboard/inertia/layouts/SettingsWrapper.vue';

export default {
  name: 'InertiaAttributesIndex',
  components: { Head, AttributesHome },
  layout: [AppShell, SettingsLayout, SettingsWrapper],
};
</script>

<template>
  <Head title="Custom Attributes" />
  <AttributesHome />
</template>
