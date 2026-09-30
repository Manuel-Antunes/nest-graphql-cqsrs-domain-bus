<script>
// Thin Inertia page — renders the existing auditlogs settings component unchanged.
import { Head } from '@inertiajs/vue3';
import AuditLogsIndex from 'dashboard/routes/dashboard/settings/auditlogs/Index.vue';
import AppShell from 'dashboard/inertia/layouts/AppShell.vue';
import SettingsLayout from 'dashboard/inertia/layouts/SettingsLayout.vue';
import SettingsWrapper from 'dashboard/inertia/layouts/SettingsWrapper.vue';

export default {
  name: 'InertiaAuditLogsIndex',
  components: { Head, AuditLogsIndex },
  layout: [AppShell, SettingsLayout, SettingsWrapper],
};
</script>

<template>
  <Head title="Audit Logs" />
  <AuditLogsIndex />
</template>
