<script>
import { Head } from '@inertiajs/vue3';
import NotificationsIndex from 'dashboard/routes/dashboard/notifications/components/NotificationsView.vue';
import AppShell from 'dashboard/inertia/layouts/AppShell.vue';
import SettingsWrapper from 'dashboard/inertia/layouts/SettingsWrapper.vue';

export default {
  name: 'InertiaNotificationsIndex',
  components: { Head, NotificationsIndex },
  layout: [AppShell, SettingsWrapper],
};
</script>

<template>
  <Head title="Notifications" />
  <NotificationsIndex />
</template>
