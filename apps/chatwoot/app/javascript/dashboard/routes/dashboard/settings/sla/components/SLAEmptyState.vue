<script setup>
import { Button } from 'dashboard/components-next/ui/button';
import Icon from 'dashboard/components-next/icon/Icon.vue';
import {
  Empty,
  EmptyContent,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from 'dashboard/components-next/ui/empty';

const emit = defineEmits(['primaryAction']);
const primaryAction = () => emit('primaryAction');
</script>

<template>
  <Empty>
    <EmptyHeader>
      <EmptyMedia variant="icon">
        <Icon icon="i-lucide-timer" class="size-6" />
      </EmptyMedia>
      <EmptyTitle>{{ $t('SLA.LIST.404') }}</EmptyTitle>
    </EmptyHeader>
    <EmptyContent>
      <Button variant="default" @click="primaryAction">
        <Icon icon="i-lucide-plus" class="size-4" />
        {{ $t('SLA.ADD_ACTION_LONG') }}
      </Button>
    </EmptyContent>
  </Empty>
</template>
