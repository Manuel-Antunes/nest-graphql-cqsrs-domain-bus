<script setup lang="ts">
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from 'dashboard/components-next/ui/empty';

withDefaults(
  defineProps<{
    title?: string;
    message?: string;
  }>(),
  {
    title: '',
    message: '',
  }
);
</script>

<template>
  <Empty class="empty-state">
    <EmptyHeader v-if="title || message">
      <EmptyTitle v-if="title">{{ title }}</EmptyTitle>
      <EmptyDescription v-if="message">{{ message }}</EmptyDescription>
    </EmptyHeader>
    <EmptyContent v-if="$slots.default">
      <slot />
    </EmptyContent>
  </Empty>
</template>
