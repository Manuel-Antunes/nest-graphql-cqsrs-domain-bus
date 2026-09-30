<script>
// Thin Inertia page (docs §2.1): sets the persistent layout stack + document title,
// and renders the EXISTING SMSCampaignsPage component completely unchanged. The
// vue-router wrapper (CampaignsPageRouteView) used to dispatch campaigns/get + labels/get
// on mount; under Inertia that shell is replaced by AppShell + SettingsWrapper, so this
// page performs those same store dispatches. The component still reads via
// campaigns/* getters (REST/Vuex) — no data props, no rewrite.
import { onMounted } from 'vue';
import { Head } from '@inertiajs/vue3';
import { useStore } from 'dashboard/composables/store';
import SMSCampaignsPage from 'dashboard/routes/dashboard/campaigns/pages/SMSCampaignsPage.vue';
import AppShell from 'dashboard/inertia/layouts/AppShell.vue';
import SettingsWrapper from 'dashboard/inertia/layouts/SettingsWrapper.vue';

export default {
  name: 'InertiaSMSCampaignsIndex',
  components: { Head, SMSCampaignsPage },
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
  <Head title="SMS Campaigns" />
  <SMSCampaignsPage />
</template>
