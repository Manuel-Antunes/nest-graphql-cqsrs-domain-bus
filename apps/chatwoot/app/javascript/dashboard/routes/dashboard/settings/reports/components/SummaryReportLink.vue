<script setup>
import { computed } from 'vue';
import AppLink from 'dashboard/components-next/AppLink.vue';
import { useAppNavigation } from 'dashboard/composables/useAppNavigation';

const props = defineProps({
  row: {
    type: Object,
    required: true,
  },
});

const { resolvePath } = useAppNavigation();

const routeName = computed(() => `${props.row.original.type}_reports_show`);

const reportPath = computed(
  () =>
    `${resolvePath({
      name: routeName.value,
      params: { id: props.row.original.id },
    })}${window.location.search}`
);
</script>

<template>
  <AppLink :to="reportPath" class="text-n-slate-12 hover:underline">
    {{ row.original.name }}
  </AppLink>
</template>
