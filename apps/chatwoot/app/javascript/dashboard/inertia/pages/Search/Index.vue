<script>
// Thin Inertia page (docs §2.1): sets the persistent layout stack + document title,
// and renders the EXISTING global-search component. The component still fetches via
// the conversationSearch Vuex module (REST) — no data props, no rewrite.
import { Head } from '@inertiajs/vue3';
import SearchView from 'dashboard/modules/search/components/SearchView.vue';
import AppShell from 'dashboard/inertia/layouts/AppShell.vue';

export default {
  name: 'InertiaSearchIndex',
  components: { Head, SearchView },
  layout: AppShell,
};
</script>

<template>
  <Head title="Search" />
  <SearchView />
</template>
