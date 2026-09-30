<script setup>
import { computed, ref, toRef } from 'vue';
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
import Label from 'next/ui/label/Label.vue';

const props = defineProps({
  activeSort: {
    type: String,
    default: 'last_activity_at',
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
    label: t('CONTACTS_LAYOUT.HEADER.ACTIONS.SORT_BY.OPTIONS.NAME'),
    value: 'name',
  },
  {
    label: t('CONTACTS_LAYOUT.HEADER.ACTIONS.SORT_BY.OPTIONS.EMAIL'),
    value: 'email',
  },
  {
    label: t('CONTACTS_LAYOUT.HEADER.ACTIONS.SORT_BY.OPTIONS.COMPANY'),
    value: 'company_name',
  },
  {
    label: t('CONTACTS_LAYOUT.HEADER.ACTIONS.SORT_BY.OPTIONS.COUNTRY'),
    value: 'country',
  },
  {
    label: t('CONTACTS_LAYOUT.HEADER.ACTIONS.SORT_BY.OPTIONS.CITY'),
    value: 'city',
  },
  {
    label: t('CONTACTS_LAYOUT.HEADER.ACTIONS.SORT_BY.OPTIONS.LAST_ACTIVITY'),
    value: 'last_activity_at',
  },
  {
    label: t('CONTACTS_LAYOUT.HEADER.ACTIONS.SORT_BY.OPTIONS.CREATED_AT'),
    value: 'created_at',
  },
];

// `Select` items cannot use an empty-string value (reserved by reka for the
// cleared state), so the menu uses `asc`/`desc` sentinels that we map to the
// order prefix the parent expects (`''` = ascending, `'-'` = descending).
const orderingMenus = [
  {
    label: t('CONTACTS_LAYOUT.HEADER.ACTIONS.ORDER.OPTIONS.ASCENDING'),
    value: 'asc',
  },
  {
    label: t('CONTACTS_LAYOUT.HEADER.ACTIONS.ORDER.OPTIONS.DESCENDING'),
    value: 'desc',
  },
];

const orderKeyToPrefix = key => (key === 'desc' ? '-' : '');
const orderPrefixToKey = prefix => (prefix === '-' ? 'desc' : 'asc');

const activeSort = toRef(props, 'activeSort');
const activeOrdering = toRef(props, 'activeOrdering');
const activeOrderingKey = computed(() =>
  orderPrefixToKey(activeOrdering.value)
);

const activeSortLabel = computed(() => {
  const selectedMenu = sortMenus.find(menu => menu.value === activeSort.value);
  return (
    selectedMenu?.label || t('CONTACTS_LAYOUT.HEADER.ACTIONS.SORT_BY.LABEL')
  );
});

const activeOrderingLabel = computed(() => {
  const selectedMenu = orderingMenus.find(
    menu => menu.value === activeOrderingKey.value
  );
  return selectedMenu?.label || t('CONTACTS_LAYOUT.HEADER.ACTIONS.ORDER.LABEL');
});

const handleSortChange = value => {
  emit('update:sort', { sort: value, order: props.activeOrdering });
};

const handleOrderChange = value => {
  emit('update:sort', {
    sort: props.activeSort,
    order: orderKeyToPrefix(value),
  });
};

const isOpen = ref(false);
</script>

<template>
  <Popover v-model:open="isOpen">
    <PopoverTrigger as-child>
      <Button variant="ghost" size="icon">
        <Icon icon="i-lucide-arrow-down-up" />
      </Button>
    </PopoverTrigger>
    <PopoverContent align="end" class="flex flex-col gap-2 w-72 p-4">
      <div class="flex items-center justify-between gap-2">
        <Label>
          {{ t('CONTACTS_LAYOUT.HEADER.ACTIONS.SORT_BY.LABEL') }}
        </Label>
        <Select
          :modal="false"
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
        <Label>
          {{ t('CONTACTS_LAYOUT.HEADER.ACTIONS.ORDER.LABEL') }}
        </Label>
        <Select
          :modal="false"
          :model-value="activeOrderingKey"
          @update:model-value="handleOrderChange"
        >
          <SelectTrigger>
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
