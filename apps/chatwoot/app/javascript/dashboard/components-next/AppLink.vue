<script setup>
// Navigation link (vue-router-free primitive).
//   - Inertia-served route: Inertia <Link :href> — SPA-style visit, no reload.
//   - Non-migrated route (e.g. the v3app login): plain <a :href> — full-page load.
// `to` accepts a path string or a route-location object ({ name, params }).
import { computed } from 'vue';
import { Link as InertiaLink } from '@inertiajs/vue3';
import { useAppNavigation } from 'dashboard/composables/useAppNavigation';

const props = defineProps({
  to: { type: [String, Object], required: true },
});

const { resolvePath, isInertiaTarget } = useAppNavigation();

const href = computed(() => resolvePath(props.to));
const inertiaTarget = computed(() => isInertiaTarget(props.to));
</script>

<template>
  <InertiaLink v-if="inertiaTarget" :href="href"><slot /></InertiaLink>
  <a v-else :href="href"><slot /></a>
</template>
