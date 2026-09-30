<script setup>
import { useI18n } from 'vue-i18n';

import { Button } from 'dashboard/components-next/ui/button';
import Icon from 'dashboard/components-next/icon/Icon.vue';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from 'dashboard/components-next/ui/dropdown-menu';

const emit = defineEmits(['create']);

const { t } = useI18n();

const menuItems = [
  {
    label: t('COMPANIES.ACTIONS.CREATE'),
    action: 'create',
    value: 'create',
    icon: 'i-lucide-plus',
  },
];

const handleAction = ({ action }) => {
  if (action === 'create') emit('create');
};
</script>

<template>
  <DropdownMenu>
    <DropdownMenuTrigger as-child>
      <Button variant="ghost" size="icon">
        <Icon icon="i-lucide-ellipsis-vertical" />
      </Button>
    </DropdownMenuTrigger>
    <DropdownMenuContent side="bottom" align="end" class="min-w-40">
      <DropdownMenuItem
        v-for="item in menuItems"
        :key="item.value"
        class="gap-2"
        @select="handleAction(item)"
      >
        <Icon :icon="item.icon" />
        {{ item.label }}
      </DropdownMenuItem>
    </DropdownMenuContent>
  </DropdownMenu>
</template>
