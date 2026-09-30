<script>
import { Head } from '@inertiajs/vue3';
import CompanyDetailView from 'dashboard/routes/dashboard/companies/pages/CompanyDetailView.vue';
import AppShell from 'dashboard/inertia/layouts/AppShell.vue';

export default {
  name: 'InertiaCompaniesShow',
  components: { Head, CompanyDetailView },
  layout: AppShell,
};
</script>

<template>
  <Head title="Companies" />
  <CompanyDetailView />
</template>
