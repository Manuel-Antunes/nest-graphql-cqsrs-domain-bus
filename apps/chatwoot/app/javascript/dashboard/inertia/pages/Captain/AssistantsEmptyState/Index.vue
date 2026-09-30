<script>
// Thin Inertia page (docs §2.1): the assistants empty-state / create page. Full-bleed →
// AppShell ALONE. Renders the EXISTING assistants Index.vue unchanged (it self-fetches
// and navigates via useAppNavigation). No :assistantId in this route → no tracking.
import { Head } from '@inertiajs/vue3';
import AssistantEmptyStateIndex from 'dashboard/routes/dashboard/captain/assistants/Index.vue';
import AppShell from 'dashboard/inertia/layouts/AppShell.vue';

export default {
  name: 'InertiaCaptainAssistantsEmptyState',
  components: { Head, AssistantEmptyStateIndex },
  layout: AppShell,
};
</script>

<template>
  <Head title="Captain" />
  <AssistantEmptyStateIndex />
</template>
