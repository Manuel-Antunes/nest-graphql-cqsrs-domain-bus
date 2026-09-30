<script>
// Thin Inertia page (docs §2.1): captain is a full-bleed view, so it uses AppShell
// ALONE (no SettingsWrapper). Renders the EXISTING AssistantsIndexPage landing/redirect
// component unchanged — it dispatches captainAssistants/get and then routes to the last
// active assistant via useAppNavigation().visit. Reads :navigationPath from the URL.
import { Head } from '@inertiajs/vue3';
import AssistantsIndexPage from 'dashboard/routes/dashboard/captain/pages/AssistantsIndexPage.vue';
import AppShell from 'dashboard/inertia/layouts/AppShell.vue';

export default {
  name: 'InertiaCaptainAssistantsIndex',
  components: { Head, AssistantsIndexPage },
  layout: AppShell,
};
</script>

<template>
  <Head title="Captain" />
  <AssistantsIndexPage />
</template>
