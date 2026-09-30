<script>
import { Head } from '@inertiajs/vue3';
import FaqSuggestionsIndex from 'dashboard/routes/dashboard/captain/responses/FaqSuggestions.vue';
import AppShell from 'dashboard/inertia/layouts/AppShell.vue';
import { useCaptainAssistantTracking } from 'dashboard/composables/useCaptainAssistantTracking';

export default {
  name: 'InertiaCaptainFaqSuggestions',
  components: { Head, FaqSuggestionsIndex },
  layout: AppShell,
  setup() {
    useCaptainAssistantTracking();
  },
};
</script>

<template>
  <Head title="Captain" />
  <FaqSuggestionsIndex />
</template>
