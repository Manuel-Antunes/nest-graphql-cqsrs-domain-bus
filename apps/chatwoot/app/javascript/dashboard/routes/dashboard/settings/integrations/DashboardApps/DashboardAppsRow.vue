<script setup>
import { BaseTableRow, BaseTableCell } from 'dashboard/components-next/table';
import { Button } from 'dashboard/components-next/ui/button';
import Icon from 'dashboard/components-next/icon/Icon.vue';

defineProps({
  app: {
    type: Object,
    default: () => ({}),
  },
});

defineEmits(['edit', 'delete']);
</script>

<template>
  <BaseTableRow :item="app">
    <template #default>
      <BaseTableCell>
        <span
          class="text-body-main text-n-slate-12 truncate block"
          :title="app.title"
        >
          {{ app.title }}
        </span>
      </BaseTableCell>

      <BaseTableCell>
        <span
          class="text-body-main text-n-slate-11 truncate block"
          :title="app.content[0].url"
        >
          {{ app.content[0].url }}
        </span>
      </BaseTableCell>

      <BaseTableCell align="end" class="w-24">
        <div class="flex justify-end gap-3 flex-shrink-0">
          <Button
            v-tooltip.top="
              $t('INTEGRATION_SETTINGS.DASHBOARD_APPS.LIST.EDIT_TOOLTIP')
            "
            variant="outline"
            size="icon"
            @click="$emit('edit', app)"
          >
            <Icon icon="i-lucide-pen" />
          </Button>
          <Button
            v-tooltip.top="
              $t('INTEGRATION_SETTINGS.DASHBOARD_APPS.LIST.DELETE_TOOLTIP')
            "
            variant="destructive"
            size="icon"
            @click="$emit('delete', app)"
          >
            <Icon icon="i-lucide-trash-2" />
          </Button>
        </div>
      </BaseTableCell>
    </template>
  </BaseTableRow>
</template>
