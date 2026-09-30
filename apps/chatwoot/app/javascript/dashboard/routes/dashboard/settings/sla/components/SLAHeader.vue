<script setup>
import { Button } from 'dashboard/components-next/ui/button';
import Icon from 'dashboard/components-next/icon/Icon.vue';
import BaseSettingsHeader from '../../components/BaseSettingsHeader.vue';

defineProps({
  showActions: {
    type: Boolean,
    default: true,
  },
});

defineEmits(['add']);
</script>

<template>
  <BaseSettingsHeader
    :title="$t('SLA.HEADER')"
    :description="$t('SLA.DESCRIPTION')"
    :link-text="$t('SLA.LEARN_MORE')"
    feature-name="sla"
  >
    <template v-if="showActions" #actions>
      <Button @click="$emit('add')">
        <Icon :icon="'i-lucide-circle-plus'" class="size-4" />
        {{ $t('SLA.ADD_ACTION') }}
      </Button>
    </template>
  </BaseSettingsHeader>
</template>
