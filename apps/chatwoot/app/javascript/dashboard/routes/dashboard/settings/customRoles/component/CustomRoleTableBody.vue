<script setup>
import { useI18n } from 'vue-i18n';
import { getI18nKey } from 'dashboard/routes/dashboard/settings/helper/settingsHelper';

import { Button } from 'dashboard/components-next/ui/button';
import { Spinner } from 'dashboard/components-next/ui/spinner';
import Icon from 'dashboard/components-next/icon/Icon.vue';
import { BaseTableRow, BaseTableCell } from 'dashboard/components-next/table';

defineProps({
  roles: {
    type: Array,
    required: true,
  },
  loading: {
    type: Object,
    default: () => ({}),
  },
});

const emit = defineEmits(['edit', 'delete']);

const { t } = useI18n();

const getFormattedPermissions = role => {
  return role.permissions
    .map(event => t(getI18nKey('CUSTOM_ROLE.PERMISSIONS', event)))
    .join(', ');
};
</script>

<template>
  <BaseTableRow
    v-for="customRole in roles"
    :key="customRole.id"
    :item="customRole"
  >
    <template #default>
      <BaseTableCell>
        <span class="text-body-main text-n-slate-12 truncate block">
          {{ customRole.name }}
        </span>
      </BaseTableCell>

      <BaseTableCell>
        <span class="text-body-main text-n-slate-11 truncate block">
          {{ customRole.description }}
        </span>
      </BaseTableCell>

      <BaseTableCell>
        <span class="text-body-main text-n-slate-11 block">
          {{ getFormattedPermissions(customRole) }}
        </span>
      </BaseTableCell>

      <BaseTableCell align="end" class="w-24">
        <div class="flex gap-3 justify-end flex-shrink-0">
          <Button
            v-tooltip.top="$t('CUSTOM_ROLE.EDIT.BUTTON_TEXT')"
            variant="outline"
            size="icon"
            @click="emit('edit', customRole)"
          >
            <Icon icon="i-lucide-pen" />
          </Button>
          <Button
            v-tooltip.top="$t('CUSTOM_ROLE.DELETE.BUTTON_TEXT')"
            variant="destructive"
            size="icon"
            :disabled="loading[customRole.id]"
            @click="emit('delete', customRole)"
          >
            <Spinner
              v-if="loading[customRole.id]"
              class="size-4 flex-shrink-0"
            />
            <template v-if="!loading[customRole.id]">
              <Icon icon="i-lucide-trash-2" />
            </template>
          </Button>
        </div>
      </BaseTableCell>
    </template>
  </BaseTableRow>
</template>
