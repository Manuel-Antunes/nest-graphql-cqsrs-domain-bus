<script setup>
import { computed, toRef } from 'vue';
import { useI18n } from 'vue-i18n';

import { Button } from 'dashboard/components-next/ui/button';
import Icon from 'dashboard/components-next/icon/Icon.vue';
import {
  Popover,
  PopoverTrigger,
  PopoverContent,
} from 'dashboard/components-next/ui/popover';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from 'dashboard/components-next/ui/select';

const props = defineProps({
  activeSort: {
    type: String,
    default: 'name',
  },
  activeOrdering: {
    type: String,
    default: '',
  },
});

const emit = defineEmits(['update:sort']);

const { t } = useI18n();

const sortMenus = [
  {
    label: t('COMPANIES.SORT_BY.OPTIONS.NAME'),
    value: 'name',
  },
  {
    label: t('COMPANIES.SORT_BY.OPTIONS.DOMAIN'),
    value: 'domain',
  },
  {
    label: t('COMPANIES.SORT_BY.OPTIONS.CREATED_AT'),
    value: 'created_at',
  },
  {
    label: t('COMPANIES.SORT_BY.OPTIONS.CONTACTS_COUNT'),
    value: 'contacts_count',
  },
];

const orderingMenus = [
  {
    label: t('COMPANIES.ORDER.OPTIONS.ASCENDING'),
    value: '',
  },
  {
    label: t('COMPANIES.ORDER.OPTIONS.DESCENDING'),
    value: '-',
  },
];

const activeSort = toRef(props, 'activeSort');
const activeOrdering = toRef(props, 'activeOrdering');

const activeSortLabel = computed(() => {
  const selectedMenu = sortMenus.find(menu => menu.value === activeSort.value);
  return selectedMenu?.label || t('COMPANIES.SORT_BY.LABEL');
});

const activeOrderingLabel = computed(() => {
  const selectedMenu = orderingMenus.find(
    menu => menu.value === activeOrdering.value
  );
  return selectedMenu?.label || t('COMPANIES.ORDER.LABEL');
});

const handleSortChange = value => {
  emit('update:sort', { sort: value, order: props.activeOrdering });
};

const handleOrderChange = value => {
  emit('update:sort', { sort: props.activeSort, order: value });
};
</script>

<template>
  <Popover>
    <PopoverTrigger as-child>
      <Button variant="ghost" size="icon">
        <Icon icon="i-lucide-arrow-down-up" />
      </Button>
    </PopoverTrigger>
    <PopoverContent align="end" class="flex flex-col gap-4 w-72 p-4">
      <div class="flex items-center justify-between gap-2">
        <span class="text-sm text-n-slate-12">
          {{ t('COMPANIES.SORT_BY.LABEL') }}
        </span>
        <Select
          :model-value="activeSort"
          @update:model-value="handleSortChange"
        >
          <SelectTrigger class="max-w-40">
            <SelectValue :placeholder="activeSortLabel" />
          </SelectTrigger>
          <SelectContent align="end" :side-offset="4">
            <SelectItem
              v-for="option in sortMenus"
              :key="option.value"
              :value="option.value"
            >
              {{ option.label }}
            </SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div class="flex items-center justify-between gap-2">
        <span class="text-sm text-n-slate-12">
          {{ t('COMPANIES.ORDER.LABEL') }}
        </span>
        <Select
          :model-value="activeOrdering"
          @update:model-value="handleOrderChange"
        >
          <SelectTrigger class="max-w-40">
            <SelectValue :placeholder="activeOrderingLabel" />
          </SelectTrigger>
          <SelectContent align="end" :side-offset="4">
            <SelectItem
              v-for="option in orderingMenus"
              :key="option.value"
              :value="option.value"
            >
              {{ option.label }}
            </SelectItem>
          </SelectContent>
        </Select>
      </div>
    </PopoverContent>
  </Popover>
</template>
