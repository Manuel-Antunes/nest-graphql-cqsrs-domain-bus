<script setup>
import { computed, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import wootConstants from 'dashboard/constants/globals';
import { useUISettings } from 'dashboard/composables/useUISettings';
import { Checkbox } from 'dashboard/components-next/ui/checkbox';
import { Label } from 'dashboard/components-next/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from 'dashboard/components-next/ui/select';
import Icon from 'next/icon/Icon.vue';

const emit = defineEmits(['filter']);
const { t } = useI18n();
const { uiSettings, updateUISettings } = useUISettings();

const displayOptions = ref([
  {
    name: t('INBOX.DISPLAY_MENU.DISPLAY_OPTIONS.SNOOZED'),
    key: wootConstants.INBOX_DISPLAY_BY.SNOOZED,
    selected: false,
    type: wootConstants.INBOX_FILTER_TYPE.STATUS,
  },
  {
    name: t('INBOX.DISPLAY_MENU.DISPLAY_OPTIONS.READ'),
    key: wootConstants.INBOX_DISPLAY_BY.READ,
    selected: false,
    type: wootConstants.INBOX_FILTER_TYPE.TYPE,
  },
]);

const sortOptions = [
  {
    name: t('INBOX.DISPLAY_MENU.SORT_OPTIONS.NEWEST'),
    key: wootConstants.INBOX_SORT_BY.NEWEST,
    type: wootConstants.INBOX_FILTER_TYPE.SORT_ORDER,
  },
  {
    name: t('INBOX.DISPLAY_MENU.SORT_OPTIONS.OLDEST'),
    key: wootConstants.INBOX_SORT_BY.OLDEST,
    type: wootConstants.INBOX_FILTER_TYPE.SORT_ORDER,
  },
];

const activeSort = ref(wootConstants.INBOX_SORT_BY.NEWEST);
const activeDisplayFilter = ref({ status: '', type: '' });

const activeSortLabel = computed(
  () => sortOptions.find(o => o.key === activeSort.value)?.name ?? ''
);

const saveSelectedDisplayFilter = () => {
  updateUISettings({
    inbox_filter_by: {
      ...activeDisplayFilter.value,
      sort_by: activeSort.value || wootConstants.INBOX_SORT_BY.NEWEST,
    },
  });
};

const updateDisplayOption = option => {
  const opt = displayOptions.value.find(o => o.key === option.key);
  if (!opt) return;
  opt.selected = !option.selected;
  activeDisplayFilter.value[opt.type] = opt.selected ? opt.key : '';
  saveSelectedDisplayFilter();
  emit('filter', option);
};

const onSortOptionClick = key => {
  activeSort.value = key;
  saveSelectedDisplayFilter();
  emit(
    'filter',
    sortOptions.find(o => o.key === key)
  );
};

const setSavedFilter = () => {
  const { inbox_filter_by: filterBy = {} } = uiSettings.value;
  const { status, type, sort_by: sortBy } = filterBy;
  activeSort.value = sortBy || wootConstants.INBOX_SORT_BY.NEWEST;
  displayOptions.value.forEach(option => {
    option.selected =
      option.type === wootConstants.INBOX_FILTER_TYPE.STATUS
        ? option.key === status
        : option.key === type;
    activeDisplayFilter.value[option.type] = option.selected ? option.key : '';
  });
};

setSavedFilter();
</script>

<template>
  <div class="flex items-center gap-2 justify-between">
    <div class="flex items-center gap-2">
      <Icon icon="i-lucide-arrow-down-up" />
      <span class="text-sm">
        {{ t('INBOX.DISPLAY_MENU.SORT') }}
      </span>
    </div>
    <Select :model-value="activeSort" @update:model-value="onSortOptionClick">
      <SelectTrigger>{{ activeSortLabel }}</SelectTrigger>
      <SelectContent align="end">
        <SelectItem
          v-for="option in sortOptions"
          :key="option.key"
          :value="option.key"
        >
          {{ option.name }}
        </SelectItem>
      </SelectContent>
    </Select>
  </div>
  <div class="flex flex-col gap-2">
    <span class="text-muted-foreground text-sm">
      {{ t('INBOX.DISPLAY_MENU.DISPLAY') }}
    </span>
    <div class="flex flex-col gap-2">
      <div
        v-for="option in displayOptions"
        :key="option.key"
        class="flex items-center gap-2"
      >
        <Checkbox
          :id="option.key"
          :checked="option.selected"
          @update:checked="() => updateDisplayOption(option)"
        />
        <Label :for="option.key">
          {{ option.name }}
        </Label>
      </div>
    </div>
  </div>
</template>
