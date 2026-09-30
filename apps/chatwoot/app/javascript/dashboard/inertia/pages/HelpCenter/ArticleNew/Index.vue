<script>
// Thin Inertia page (docs §2.1): the new-article editor (portals_articles_new). AppShell
// alone. useHelpCenterBootstrap replays the SPA parent's portal/categories/agents hydration
// (ArticleEditorControls reads agents + categories). Reads portalSlug/locale/categorySlug
// from the URL and, after create, visits the edit route via useAppNavigation. NO data props.
import { Head } from '@inertiajs/vue3';
import PortalsArticlesNewPage from 'dashboard/routes/dashboard/helpcenter/pages/PortalsArticlesNewPage.vue';
import AppShell from 'dashboard/inertia/layouts/AppShell.vue';
import { useHelpCenterBootstrap } from 'dashboard/inertia/composables/useHelpCenterBootstrap';

export default {
  name: 'InertiaPortalsArticlesNew',
  components: { Head, PortalsArticlesNewPage },
  layout: AppShell,
  setup() {
    useHelpCenterBootstrap();
  },
};
</script>

<template>
  <Head title="New Article" />
  <PortalsArticlesNewPage />
</template>
