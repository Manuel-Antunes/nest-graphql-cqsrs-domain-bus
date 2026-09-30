<script>
// Thin Inertia page (docs §2.1): sets the persistent layout stack + document title,
// and renders the EXISTING companies component. The component still fetches via the
// companies Pinia store (REST) — no data props, no rewrite.
import { Head } from '@inertiajs/vue3';
import CompaniesIndex from 'dashboard/routes/dashboard/companies/pages/CompaniesIndex.vue';
import AppShell from 'dashboard/inertia/layouts/AppShell.vue';

export default {
  name: 'InertiaCompaniesIndex',
  components: { Head, CompaniesIndex },
  layout: AppShell,
};
</script>

<template>
  <Head title="Companies" />
  <CompaniesIndex />
</template>
