<script>
// Assignment-policy landing (thin-shell). AssignmentPolicyIndex renders the two
// AssignmentCards whose clicks Inertia-visit the agent/capacity list pages via
// useAppNavigation().visit. No data props — unchanged from the SPA.
import { Head } from '@inertiajs/vue3';
import AssignmentPolicyIndex from 'dashboard/routes/dashboard/settings/assignmentPolicy/Index.vue';
import AppShell from 'dashboard/inertia/layouts/AppShell.vue';
import SettingsLayout from 'dashboard/inertia/layouts/SettingsLayout.vue';
import SettingsWrapper from 'dashboard/inertia/layouts/SettingsWrapper.vue';

export default {
  name: 'InertiaAssignmentPolicyIndex',
  components: { Head, AssignmentPolicyIndex },
  layout: [AppShell, SettingsLayout, SettingsWrapper],
};
</script>

<template>
  <Head title="Assignment Policy" />
  <AssignmentPolicyIndex />
</template>
