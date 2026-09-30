<script>
// Macro editor (thin-shell) — used for both `new` and `edit`. MacroEditor reads the
// macro id from the URL via useAppNavigation().currentParams and navigates back to the
// list via useAppNavigation().visit after save.
import { Head } from '@inertiajs/vue3';
import MacroEditor from 'dashboard/routes/dashboard/settings/macros/MacroEditor.vue';
import AppShell from 'dashboard/inertia/layouts/AppShell.vue';
import SettingsLayout from 'dashboard/inertia/layouts/SettingsLayout.vue';
import SettingsWrapper from 'dashboard/inertia/layouts/SettingsWrapper.vue';

export default {
  name: 'InertiaMacroEditor',
  components: { Head, MacroEditor },
  layout: [AppShell, SettingsLayout, SettingsWrapper],
};
</script>

<template>
  <Head title="Macro" />
  <MacroEditor />
</template>
