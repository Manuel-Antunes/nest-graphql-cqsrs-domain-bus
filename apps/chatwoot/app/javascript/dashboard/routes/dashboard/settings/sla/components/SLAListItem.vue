<script setup>
import BaseSettingsListItem from '../../components/BaseSettingsListItem.vue';
import SLAResponseTime from './SLAResponseTime.vue';
import SLABusinessHoursLabel from './SLABusinessHoursLabel.vue';
import { Button } from 'dashboard/components-next/ui/button';
import { Spinner } from 'dashboard/components-next/ui/spinner';
import Icon from 'dashboard/components-next/icon/Icon.vue';

defineProps({
  slaName: {
    type: String,
    required: true,
  },
  description: {
    type: String,
    required: true,
  },
  firstResponse: {
    type: String,
    required: true,
  },
  nextResponse: {
    type: String,
    required: true,
  },
  resolutionTime: {
    type: String,
    required: true,
  },
  hasBusinessHours: {
    type: Boolean,
    required: true,
  },
  isLoading: {
    type: Boolean,
    default: false,
  },
});

const emit = defineEmits(['delete']);
</script>

<template>
  <BaseSettingsListItem
    class="sm:divide-x sm:divide-n-weak"
    :title="slaName"
    :description="description"
  >
    <template #label>
      <SLABusinessHoursLabel :has-business-hours="hasBusinessHours" />
    </template>
    <template #rightSection>
      <div
        class="flex items-center divide-x rtl:divide-x-reverse sm:rtl:!border-l-0 sm:rtl:!border-r sm:rtl:border-solid sm:rtl:border-n-weak gap-1.5 w-fit sm:w-full sm:gap-0 sm:justify-between divide-n-weak"
      >
        <SLAResponseTime response-type="FRT" :response-time="firstResponse" />
        <SLAResponseTime response-type="NRT" :response-time="nextResponse" />
        <SLAResponseTime response-type="RT" :response-time="resolutionTime" />
      </div>
    </template>
    <template #actions>
      <Button
        v-tooltip.top="$t('SLA.FORM.DELETE')"
        variant="destructive"
        size="icon"
        :disabled="isLoading"
        @click="emit('delete')"
      >
        <Spinner v-if="isLoading" class="size-4 flex-shrink-0" />
        <template v-if="!isLoading">
          <Icon :icon="'i-lucide-trash-2'" />
        </template>
      </Button>
    </template>
  </BaseSettingsListItem>
</template>
