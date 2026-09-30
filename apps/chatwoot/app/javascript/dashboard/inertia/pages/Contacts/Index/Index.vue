<script>
// Thin Inertia page (docs §2.1): sets the persistent layout stack + document title,
// and renders the EXISTING ContactsIndex component unchanged. The component still
// self-fetches via store.dispatch('contacts/*') (REST) and reads segmentId/label from
// the URL via useAppNavigation — no data props, no rewrite. Serves the four list
// routes: index, active, segments/:segmentId, labels/:label.
import { Head } from '@inertiajs/vue3';
import ContactsIndex from 'dashboard/routes/dashboard/contacts/pages/ContactsIndex.vue';
import AppShell from 'dashboard/inertia/layouts/AppShell.vue';

export default {
  name: 'InertiaContactsIndex',
  components: { Head, ContactsIndex },
  layout: AppShell,
};
</script>

<template>
  <Head title="Contacts" />
  <ContactsIndex />
</template>
