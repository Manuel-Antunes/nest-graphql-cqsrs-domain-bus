<script setup>
import { computed, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { usePolicy } from 'dashboard/composables/usePolicy';

import Icon from 'dashboard/components-next/icon/Icon.vue';
import { Button } from 'dashboard/components-next/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from 'dashboard/components-next/ui/dropdown-menu';

const props = defineProps({
  activeSourceFilter: { type: String, default: 'all' },
  activeStatusFilter: { type: String, default: null },
  activeSort: { type: String, default: 'recently_updated' },
});

const emit = defineEmits(['selectSource', 'selectStatus', 'selectSort']);

const { t } = useI18n();
const { checkPermissions } = usePolicy();

const openMenu = ref(null);
const canViewUsage = computed(() => checkPermissions(['administrator']));

const MENU_CONFIG = [
  {
    key: 'source',
    activeKey: 'activeSourceFilter',
    dropdownClass: 'min-w-48',
    options: [
      { labelKey: 'SOURCE.ALL', value: 'all', icon: 'i-lucide-files' },
      { labelKey: 'SOURCE.WEB', value: 'web', icon: 'i-lucide-link' },
      { labelKey: 'SOURCE.PDF', value: 'pdf', icon: 'i-lucide-file-text' },
    ],
  },
  {
    key: 'status',
    activeKey: 'activeStatusFilter',
    dropdownClass: 'min-w-52',
    options: [
      { labelKey: 'STATUS.ANY', value: null, icon: 'i-lucide-circle-dashed' },
      {
        labelKey: 'STATUS.UPDATED',
        value: 'synced',
        icon: 'i-lucide-check-circle',
      },
      {
        labelKey: 'STATUS.NEEDS_UPDATE',
        value: 'stale',
        icon: 'i-lucide-clock',
      },
      {
        labelKey: 'STATUS.UPDATING',
        value: 'syncing',
        icon: 'i-lucide-refresh-cw',
      },
      {
        labelKey: 'STATUS.FAILED',
        value: 'failed',
        icon: 'i-lucide-circle-x',
      },
    ],
  },
  {
    key: 'sort',
    activeKey: 'activeSort',
    dropdownClass: 'min-w-56',
    options: [
      {
        labelKey: 'SORT.RECENTLY_UPDATED',
        value: 'recently_updated',
        icon: 'i-lucide-arrow-down-up',
      },
      {
        labelKey: 'SORT.RECENTLY_CREATED',
        value: 'recently_created',
        icon: 'i-lucide-clock',
      },
      {
        labelKey: 'SORT.MOST_USED',
        value: 'most_used',
        icon: 'i-lucide-messages-square',
      },
    ],
  },
];

const filterMenus = computed(() =>
  MENU_CONFIG.filter(
    menu => !(menu.key === 'status' && props.activeSourceFilter === 'pdf')
  ).map(menu => {
    const active = props[menu.activeKey];
    const items = menu.options
      .filter(option => option.value !== 'most_used' || canViewUsage.value)
      .map(opt => ({
        label: t(`CAPTAIN.DOCUMENTS.FILTERS.${opt.labelKey}`),
        value: opt.value,
        icon: opt.icon,
        action: menu.key,
        isSelected: opt.value === active,
      }));
    return {
      ...menu,
      items,
      selected: items.find(item => item.isSelected) || items[0],
    };
  })
);

const closeMenu = () => {
  openMenu.value = null;
};

const setMenuOpen = (menu, isOpen) => {
  if (isOpen) openMenu.value = menu;
  else if (openMenu.value === menu) closeMenu();
};

const handleMenuAction = ({ action, value }) => {
  closeMenu();
  if (action === 'source') emit('selectSource', value);
  else if (action === 'status') emit('selectStatus', value);
  else if (action === 'sort') emit('selectSort', value);
};
</script>

<template>
  <div class="inline-flex flex-wrap items-center gap-2 pt-2 w-fit">
    <DropdownMenu
      v-for="menu in filterMenus"
      :key="menu.key"
      :open="openMenu === menu.key"
      @update:open="isOpen => setMenuOpen(menu.key, isOpen)"
    >
      <DropdownMenuTrigger as-child>
        <Button
          variant="outline"
          size="sm"
          :class="{ 'bg-n-slate-9/10': openMenu === menu.key }"
        >
          <Icon :icon="menu.selected.icon" class="shrink-0 size-4" />
          <span class="min-w-0 truncate">{{ menu.selected.label }}</span>
          <Icon icon="i-lucide-chevron-down" class="shrink-0 size-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" :class="menu.dropdownClass">
        <DropdownMenuItem
          v-for="item in menu.items"
          :key="`${menu.key}-${item.value}`"
          @select="handleMenuAction(item)"
        >
          <Icon :icon="item.icon" class="shrink-0 size-4" />
          <span class="flex-1 min-w-0 truncate">{{ item.label }}</span>
          <Icon
            v-if="item.isSelected"
            icon="i-lucide-check"
            class="shrink-0 size-4"
          />
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  </div>
</template>
