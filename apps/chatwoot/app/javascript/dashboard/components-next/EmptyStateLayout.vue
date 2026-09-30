<script setup>
import Policy from 'dashboard/components/policy.vue';
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from 'dashboard/components-next/ui/empty';

defineProps({
  title: {
    type: String,
    required: true,
  },
  subtitle: {
    type: String,
    default: '',
  },
  actionPerms: {
    type: Array,
    default: () => [],
  },
  // Retained for backwards compatibility with existing call sites; the backdrop
  // preview is no longer rendered now that this uses the shadcn Empty pattern.
  showBackdrop: {
    type: Boolean,
    default: true,
  },
});
</script>

<template>
  <Empty class="w-full h-full">
    <EmptyHeader>
      <EmptyMedia v-if="$slots.media" variant="icon">
        <slot name="media" />
      </EmptyMedia>
      <EmptyTitle>{{ title }}</EmptyTitle>
      <EmptyDescription v-if="subtitle">{{ subtitle }}</EmptyDescription>
    </EmptyHeader>
    <EmptyContent v-if="$slots.actions">
      <Policy :permissions="actionPerms">
        <slot name="actions" />
      </Policy>
    </EmptyContent>
  </Empty>
</template>
