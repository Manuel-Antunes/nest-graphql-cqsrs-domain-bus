<script>
// Account-suspended page under Inertia. Reuses the existing SPA view component; renders
// in the sidebar-less BlankLayout (full-screen empty state).
import { Head } from '@inertiajs/vue3';
import BlankLayout from 'dashboard/inertia/layouts/BlankLayout.vue';
import SuspendedView from 'dashboard/routes/dashboard/suspended/Index.vue';

export default {
  name: 'InertiaSuspended',
  components: { Head, SuspendedView },
  layout: BlankLayout,
};
</script>

<template>
  <Head title="Account Suspended" />
  <SuspendedView />
</template>
