<script setup>
import { computed } from 'vue';
import { getI18nKey } from 'dashboard/routes/dashboard/settings/helper/settingsHelper';
import ShowMore from 'dashboard/components/widgets/ShowMore.vue';
import { useI18n } from 'vue-i18n';
import { BaseTableRow, BaseTableCell } from 'dashboard/components-next/table';
import { Button } from 'dashboard/components-next/ui/button';
import Icon from 'dashboard/components-next/icon/Icon.vue';

const props = defineProps({
  webhook: {
    type: Object,
    required: true,
  },
  index: {
    type: Number,
    required: true,
  },
});

const emit = defineEmits(['edit', 'delete']);
const { t } = useI18n();
const subscribedEvents = computed(() => {
  const { subscriptions } = props.webhook;
  return subscriptions
    .map(event =>
      t(
        getI18nKey(
          'INTEGRATION_SETTINGS.WEBHOOK.FORM.SUBSCRIPTIONS.EVENTS',
          event
        )
      )
    )
    .join(', ');
});
</script>

<template>
  <BaseTableRow :item="webhook">
    <template #default>
      <BaseTableCell>
        <div class="flex gap-2 font-medium break-words text-n-slate-12">
          <template v-if="webhook.name">
            {{ webhook.name }}
            <span class="text-n-slate-11">
              {{ webhook.url }}
            </span>
          </template>
          <template v-else>
            {{ webhook.url }}
          </template>
        </div>
        <div class="block mt-1 text-sm text-n-slate-11">
          <span class="font-medium">
            {{ $t('INTEGRATION_SETTINGS.WEBHOOK.SUBSCRIBED_EVENTS') }}:
          </span>
          <ShowMore :text="subscribedEvents" :limit="60" />
        </div>
      </BaseTableCell>

      <BaseTableCell align="end" class="w-24">
        <div class="flex justify-end gap-3 flex-shrink-0">
          <Button
            v-tooltip.top="$t('INTEGRATION_SETTINGS.WEBHOOK.EDIT.BUTTON_TEXT')"
            variant="outline"
            size="icon"
            @click="emit('edit', webhook)"
          >
            <Icon icon="i-lucide-pen" />
          </Button>
          <Button
            v-tooltip.top="
              $t('INTEGRATION_SETTINGS.WEBHOOK.DELETE.BUTTON_TEXT')
            "
            variant="destructive"
            size="icon"
            @click="emit('delete', webhook, index)"
          >
            <Icon icon="i-lucide-trash-2" />
          </Button>
        </div>
      </BaseTableCell>
    </template>
  </BaseTableRow>
</template>
