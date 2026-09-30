<script>
// Thin Inertia page (docs §2.1): sets the persistent layout stack + document title,
// and renders the EXISTING ContactManageView component unchanged. It reads contactId
// from the URL via useAppNavigation().currentParams and self-fetches via Vuex — no data
// props. Serves the three detail routes: edit, edit_segment, edit_label.
import { Head } from '@inertiajs/vue3';
import ContactManageView from 'dashboard/routes/dashboard/contacts/pages/ContactManageView.vue';
import AppShell from 'dashboard/inertia/layouts/AppShell.vue';

export default {
  name: 'InertiaContactManageView',
  components: { Head, ContactManageView },
  layout: AppShell,
};
</script>

<template>
  <Head title="Contact" />
  <ContactManageView />
</template>
