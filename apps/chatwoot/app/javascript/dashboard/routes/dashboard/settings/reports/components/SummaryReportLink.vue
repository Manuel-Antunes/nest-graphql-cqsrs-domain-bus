<script setup>
import { computed } from 'vue';
import AppLink from 'dashboard/components-next/AppLink.vue';

const props = defineProps({
  row: {
    type: Object,
    required: true,
  },
});

const routeName = computed(() => `${props.row.original.type}_reports_show`);
</script>

<template>
  <AppLink
    :to="{ name: routeName, params: { id: row.original.id } }"
    class="text-n-slate-12 hover:underline"
  >
    {{ row.original.name }}
  </AppLink>
</template>
