<script>
import { onMounted } from 'vue';
import { Head } from '@inertiajs/vue3';
import { useStore } from 'dashboard/composables/store';
import WhatsAppCampaignAnalyticsPage from 'dashboard/routes/dashboard/campaigns/pages/WhatsAppCampaignAnalyticsPage.vue';
import AppShell from 'dashboard/inertia/layouts/AppShell.vue';
import SettingsWrapper from 'dashboard/inertia/layouts/SettingsWrapper.vue';

export default {
  name: 'InertiaWhatsAppCampaignAnalytics',
  components: { Head, WhatsAppCampaignAnalyticsPage },
  layout: [AppShell, SettingsWrapper],
  setup() {
    const store = useStore();
    onMounted(() => {
      store.dispatch('campaigns/get');
      store.dispatch('labels/get');
    });
  },
};
</script>

<template>
  <Head title="WhatsApp Campaign Analytics" />
  <WhatsAppCampaignAnalyticsPage />
</template>
