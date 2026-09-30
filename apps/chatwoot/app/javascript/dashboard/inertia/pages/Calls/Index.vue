<script>
import { Head } from '@inertiajs/vue3';
import CallsIndex from 'dashboard/routes/dashboard/calls/pages/CallsIndex.vue';
import AppShell from 'dashboard/inertia/layouts/AppShell.vue';

export default {
  name: 'InertiaCallsIndex',
  components: { Head, CallsIndex },
  layout: AppShell,
};
</script>

<template>
  <Head title="Calls" />
  <CallsIndex />
</template>
