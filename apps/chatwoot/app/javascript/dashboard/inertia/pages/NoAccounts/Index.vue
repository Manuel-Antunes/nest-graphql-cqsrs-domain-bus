<script>
// No-accounts page under Inertia (user is authenticated but belongs to no account).
// Reuses the existing SPA view component; renders in the sidebar-less BlankLayout.
import { Head } from '@inertiajs/vue3';
import BlankLayout from 'dashboard/inertia/layouts/BlankLayout.vue';
import NoAccountsView from 'dashboard/routes/dashboard/noAccounts/Index.vue';

export default {
  name: 'InertiaNoAccounts',
  components: { Head, NoAccountsView },
  layout: BlankLayout,
};
</script>

<template>
  <Head title="No Accounts" />
  <NoAccountsView />
</template>
