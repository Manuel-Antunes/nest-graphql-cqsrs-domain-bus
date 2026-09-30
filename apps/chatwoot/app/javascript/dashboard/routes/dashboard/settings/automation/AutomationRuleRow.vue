<script setup>
import { computed } from 'vue';
import { messageStamp } from 'shared/helpers/timeHelper';
import { Button } from 'dashboard/components-next/ui/button';
import { Spinner } from 'dashboard/components-next/ui/spinner';
import Icon from 'dashboard/components-next/icon/Icon.vue';
import { Switch } from 'dashboard/components-next/ui/switch';

const props = defineProps({
  automation: {
    type: Object,
    required: true,
  },
  loading: {
    type: Boolean,
    default: false,
  },
});

const emit = defineEmits(['toggle', 'edit', 'delete', 'clone']);

const readableDate = date => messageStamp(new Date(date), 'LLL d, yyyy');
const readableDateWithTime = date =>
  messageStamp(new Date(date), 'LLL d, yyyy hh:mm a');

const automationActive = computed({
  get: () => props.automation.active,
  set: active => {
    const { id, name } = props.automation;
    emit('toggle', {
      id,
      name,
      status: !active,
    });
  },
});
</script>

<template>
  <tr>
    <td class="py-4 ltr:pr-4 rtl:pl-4 min-w-[200px]">{{ automation.name }}</td>
    <td class="py-4 ltr:pr-4 rtl:pl-4">{{ automation.description }}</td>
    <td class="py-4 ltr:pr-4 rtl:pl-4">
      <Switch v-model="automationActive" />
    </td>
    <td
      class="py-4 ltr:pr-4 rtl:pl-4 min-w-[12px]"
      :title="readableDateWithTime(automation.created_on)"
    >
      {{ readableDate(automation.created_on) }}
    </td>
    <td class="py-4 min-w-xs">
      <div class="flex gap-1 justify-end flex-shrink-0">
        <Button
          v-tooltip.top="$t('AUTOMATION.FORM.EDIT')"
          variant="outline"
          size="icon"
          :disabled="loading"
          @click="$emit('edit', automation)"
        >
          <Spinner v-if="loading" class="size-4 flex-shrink-0" />
          <template v-if="!loading">
            <Icon :icon="'i-lucide-pen'" />
          </template>
        </Button>
        <Button
          v-tooltip.top="$t('AUTOMATION.CLONE.TOOLTIP')"
          variant="outline"
          size="icon"
          :disabled="loading"
          @click="$emit('clone', automation)"
        >
          <Spinner v-if="loading" class="size-4 flex-shrink-0" />
          <template v-if="!loading">
            <Icon :icon="'i-lucide-copy-plus'" />
          </template>
        </Button>
        <Button
          v-tooltip.top="$t('AUTOMATION.FORM.DELETE')"
          variant="destructive"
          size="icon"
          :disabled="loading"
          @click="$emit('delete', automation)"
        >
          <Spinner v-if="loading" class="size-4 flex-shrink-0" />
          <template v-if="!loading">
            <Icon :icon="'i-lucide-trash-2'" class="size-4" />
          </template>
        </Button>
      </div>
    </td>
  </tr>
</template>
