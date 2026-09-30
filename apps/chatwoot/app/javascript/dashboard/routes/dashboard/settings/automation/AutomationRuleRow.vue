<script setup>
import { computed } from 'vue';
import { messageStamp } from 'shared/helpers/timeHelper';
import { formatDelay } from 'dashboard/helper/automationHelper';
import { Button } from 'dashboard/components-next/ui/button';
import { Spinner } from 'dashboard/components-next/ui/spinner';
import Icon from 'dashboard/components-next/icon/Icon.vue';
import { Switch } from 'dashboard/components-next/ui/switch';
import { BaseTableRow, BaseTableCell } from 'dashboard/components-next/table';

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
  <BaseTableRow :item="automation">
    <template #default>
      <BaseTableCell class="max-w-0 w-full">
        <div class="flex items-center gap-2 min-w-0">
          <span class="text-body-main text-n-slate-12 truncate">
            {{ automation.name }}
          </span>
          <span
            v-if="automation.execution_delay"
            class="text-xs px-1.5 py-0.5 rounded-md bg-n-alpha-2 text-n-slate-11 whitespace-nowrap flex-shrink-0"
          >
            {{
              $t('AUTOMATION.LIST.DELAY_BADGE', {
                delay: formatDelay(automation.execution_delay),
              })
            }}
          </span>
          <div class="w-px h-3 rounded-lg bg-n-weak flex-shrink-0" />
          <span class="text-body-main text-n-slate-11 truncate">
            {{ automation.description }}
          </span>
        </div>
      </BaseTableCell>

      <BaseTableCell>
        <Switch v-model="automationActive" />
      </BaseTableCell>

      <BaseTableCell :title="readableDateWithTime(automation.created_on)">
        <span class="text-body-main text-n-slate-12 whitespace-nowrap">
          {{ readableDate(automation.created_on) }}
        </span>
      </BaseTableCell>

      <BaseTableCell align="end">
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
              <Icon icon="i-lucide-pen" />
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
              <Icon icon="i-lucide-copy-plus" />
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
              <Icon icon="i-lucide-trash-2" class="size-4" />
            </template>
          </Button>
        </div>
      </BaseTableCell>
    </template>
  </BaseTableRow>
</template>
