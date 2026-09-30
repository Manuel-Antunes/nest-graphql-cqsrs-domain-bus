<script setup>
import { computed, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { picoSearch } from '@chatwoot/pico-search';
import { DROPDOWN_SEARCH_THRESHOLD } from '../helper/filterHelper';
import Icon from 'dashboard/components-next/icon/Icon.vue';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectLabel,
  SelectTrigger,
} from 'dashboard/components-next/ui/select';

const props = defineProps({
  // Empty while an attribute the saved filter refers to no longer exists.
  options: { type: Array, default: () => [] },
  hideLabel: { type: Boolean, default: false },
  hideIcon: { type: Boolean, default: false },
  variant: { type: String, default: 'faded' },
  label: { type: String, default: null },
});

const { t } = useI18n();
const selected = defineModel({ type: [String, Number], required: true });

const searchInputRef = ref(null);
const searchTerm = ref('');

const showSearch = computed(
  () => props.options.length > DROPDOWN_SEARCH_THRESHOLD
);

const searchResults = computed(() => {
  // picoSearch throws on a whitespace-only query, which trims down to no search terms.
  const query = searchTerm.value.trim();
  if (!query) return props.options;
  // Section headers are not selectable, so they are dropped once a query narrows the list.
  const selectableOptions = props.options.filter(option => !option.disabled);
  return picoSearch(selectableOptions, query, ['label']);
});

const selectedOption = computed(
  () =>
    props.options.find(o => String(o.value) === String(selected.value)) || {}
);

const handleUpdate = val => {
  const original = props.options.find(o => String(o.value) === val);
  selected.value = original ? original.value : val;
};

const handleOpenChange = isOpen => {
  if (isOpen) searchTerm.value = '';
};

const isPrintableKey = event =>
  event.key.length === 1 &&
  event.key !== ' ' &&
  !event.ctrlKey &&
  !event.altKey &&
  !event.metaKey;

const redirectTypingToSearch = event => {
  if (!showSearch.value || !isPrintableKey(event)) return;
  if (event.target === searchInputRef.value) return;
  event.stopPropagation();
  searchInputRef.value?.focus();
};

const handleSearchKeydown = event => {
  if (['Escape', 'ArrowDown', 'ArrowUp'].includes(event.key)) return;
  event.stopPropagation();
};

const isVNodeIcon = icon => icon && typeof icon !== 'string';
</script>

<template>
  <Select
    :model-value="String(selected)"
    :modal="false"
    @update:model-value="handleUpdate"
    @update:open="handleOpenChange"
  >
    <SelectTrigger
      :class="{ 'border-transparent shadow-none': variant === 'ghost' }"
    >
      <component
        :is="() => selectedOption.icon"
        v-if="
          !hideIcon && selectedOption.icon && isVNodeIcon(selectedOption.icon)
        "
      />
      <Icon
        v-else-if="!hideIcon && selectedOption.icon"
        :icon="selectedOption.icon"
      />
      <span v-if="label || !hideLabel" class="truncate">
        {{ label || selectedOption.label }}
      </span>
    </SelectTrigger>
    <SelectContent disable-portal>
      <div @keydown.capture="redirectTypingToSearch">
        <div
          v-if="showSearch"
          class="sticky top-0 z-10 flex items-center gap-2 px-2 pb-1 bg-popover"
        >
          <Icon icon="i-lucide-search" class="size-4 text-muted-foreground" />
          <input
            ref="searchInputRef"
            v-model="searchTerm"
            class="w-full h-8 p-0 text-sm bg-transparent border-0 outline-none reset-base !mb-0 placeholder:text-muted-foreground"
            :placeholder="t('COMBOBOX.SEARCH_PLACEHOLDER')"
            @keydown="handleSearchKeydown"
          />
        </div>
        <template v-for="option in searchResults" :key="option.value">
          <SelectLabel v-if="option.disabled">
            {{ option.label }}
          </SelectLabel>
          <SelectItem
            v-else
            :value="String(option.value)"
            class="flex items-center gap-2"
          >
            <component
              :is="() => option.icon"
              v-if="!hideIcon && option.icon && isVNodeIcon(option.icon)"
            />
            <Icon v-else-if="!hideIcon && option.icon" :icon="option.icon" />
            {{ option.label }}
          </SelectItem>
        </template>
        <div
          v-if="!searchResults.length"
          class="px-2 py-1.5 text-sm text-muted-foreground"
        >
          {{
            searchTerm
              ? t('COMBOBOX.EMPTY_SEARCH_RESULTS', { searchTerm })
              : t('COMBOBOX.EMPTY_STATE')
          }}
        </div>
      </div>
    </SelectContent>
  </Select>
</template>
