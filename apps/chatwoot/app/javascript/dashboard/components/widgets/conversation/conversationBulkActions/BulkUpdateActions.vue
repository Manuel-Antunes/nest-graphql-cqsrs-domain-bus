<script setup>
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';

import { Button } from 'dashboard/components-next/ui/button';
import Icon from 'dashboard/components-next/icon/Icon.vue';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from 'dashboard/components-next/ui/dropdown-menu';

const props = defineProps({
  showResolve: {
    type: Boolean,
    default: true,
  },
  showReopen: {
    type: Boolean,
    default: true,
  },
  showSnooze: {
    type: Boolean,
    default: true,
  },
});

const emit = defineEmits(['update']);

const { t } = useI18n();

const updateMenuItems = computed(() => {
  const items = [];

  if (props.showResolve) {
    items.push({
      value: 'resolved',
      label: t('CONVERSATION.HEADER.RESOLVE_ACTION'),
      icon: 'i-lucide-check',
    });
  }

  if (props.showReopen) {
    items.push({
      value: 'open',
      label: t('CONVERSATION.HEADER.REOPEN_ACTION'),
      icon: 'i-lucide-redo',
    });
  }

  if (props.showSnooze) {
    items.push({
      value: 'snoozed',
      label: t('BULK_ACTION.UPDATE.SNOOZE_UNTIL'),
      icon: 'i-lucide-alarm-clock',
    });
  }

  return items;
});

const handleUpdate = item => {
  if (item.value === 'snoozed') {
    // If the user clicks on the snooze option from the bulk action change status dropdown.
    // Open the snooze option for bulk action in the cmd bar.
    const ninja = document.querySelector('ninja-keys');
    ninja?.open({ parent: 'bulk_action_snooze_conversation' });
  } else {
    emit('update', item.value);
  }
};
</script>

<template>
  <DropdownMenu>
    <DropdownMenuTrigger as-child>
      <Button
        v-tooltip="$t('BULK_ACTION.UPDATE.CHANGE_STATUS')"
        variant="outline"
        size="icon"
      >
        <Icon icon="i-lucide-circle-fading-arrow-up" />
      </Button>
    </DropdownMenuTrigger>
    <DropdownMenuContent align="end">
      <DropdownMenuItem
        v-for="item in updateMenuItems"
        :key="item.value"
        @select="handleUpdate(item)"
      >
        <Icon :icon="item.icon" />
        {{ item.label }}
      </DropdownMenuItem>
    </DropdownMenuContent>
  </DropdownMenu>
</template>
