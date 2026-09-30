<script setup>
import { computed, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { onClickOutside } from '@vueuse/core';
import { picoSearch } from '@chatwoot/pico-search';
import { DROPDOWN_SEARCH_THRESHOLD } from '../helper/filterHelper';
import Icon from 'dashboard/components-next/icon/Icon.vue';
import EmojiIcon from 'dashboard/components-next/emoji-icon-picker/EmojiIcon.vue';
import { ChevronDown, Check } from '@lucide/vue';
import { Button } from 'dashboard/components-next/ui/button';

const { options, maxChips, dropdownMaxHeight } = defineProps({
  options: { type: Array, required: true },
  maxChips: { type: Number, default: 3 },
  dropdownMaxHeight: { type: String, default: 'max-h-80' },
});

const vFocus = { mounted: el => el.focus() };

const { t } = useI18n();
const selected = defineModel({ type: [Array, String], required: true });

const isOpen = ref(false);
const containerRef = ref(null);

onClickOutside(containerRef, () => {
  isOpen.value = false;
});

const searchTerm = ref('');

const showSearch = computed(() => options.length > DROPDOWN_SEARCH_THRESHOLD);

const searchResults = computed(() => {
  // picoSearch throws on a whitespace-only query, which trims down to no search terms.
  const query = searchTerm.value.trim();
  if (!query) return options;
  return picoSearch(options, query, ['name']);
});

const hasItems = computed(() => {
  if (!selected.value) return false;
  if (!Array.isArray(selected.value)) return false;
  return selected.value.length > 0;
});

const selectedIds = computed(() => {
  if (!hasItems.value) return [];
  return selected.value.map(v => v.id);
});

const selectedItems = computed(() => {
  if (!hasItems.value) return [];
  return options.filter(o => selectedIds.value.includes(o.id));
});

const selectedVisibleItems = computed(() => {
  if (!hasItems.value) return [];
  if (selectedItems.value.length === maxChips + 1) return selectedItems.value;
  return selectedItems.value.slice(0, maxChips);
});

const remainingItems = computed(() => {
  if (!hasItems.value) return [];
  if (selectedItems.value.length === maxChips + 1) return [];
  return selectedItems.value.slice(maxChips);
});

const remainingTooltip = computed(() =>
  remainingItems.value.map(item => item.name).join(', ')
);

const toggleDropdown = () => {
  searchTerm.value = '';
  isOpen.value = !isOpen.value;
};

const toggleOption = option => {
  const item = { id: option.id, name: option.name };
  if (!Array.isArray(selected.value) || !selected.value.length) {
    selected.value = [item];
    return;
  }
  if (selectedIds.value.includes(item.id)) {
    selected.value = selected.value.filter(v => v.id !== item.id);
  } else {
    selected.value = [...selected.value, item];
  }
};
</script>

<template>
  <div ref="containerRef" class="relative min-w-0">
    <Button
      variant="outline"
      type="button"
      class="max-w-full hover:bg-transparent bg-transparent font-normal"
      @click="toggleDropdown"
    >
      <span v-if="!hasItems" class="min-w-0 truncate">
        {{ t('COMBOBOX.PLACEHOLDER') }}
      </span>
      <span
        v-else
        class="flex items-center gap-1 min-w-0 flex-1 overflow-hidden"
      >
        <span
          v-for="(item, idx) in selectedVisibleItems"
          :key="item.id"
          class="flex items-center gap-1 min-w-0"
        >
          <Icon v-if="item.icon" :icon="item.icon" class="flex-shrink-0" />
          <EmojiIcon
            v-if="item.emoji"
            :value="item.emoji"
            :color="item.iconColor"
            class="flex-shrink-0 size-4"
          />
          <span
            v-if="item.color"
            class="flex-shrink-0 rounded-full size-1.5"
            :style="{ backgroundColor: item.color }"
          />
          <span class="truncate"
            >{{ item.name
            }}{{
              idx < selectedVisibleItems.length - 1 || remainingItems.length > 0
                ? ','
                : ''
            }}</span
          >
        </span>
        <span
          v-if="remainingItems.length > 0"
          v-tooltip.top="remainingTooltip"
          class="text-muted-foreground flex-shrink-0"
        >
          +{{ remainingItems.length }}
        </span>
      </span>
      <ChevronDown class="size-4 opacity-50" />
    </Button>

    <div
      v-if="isOpen"
      class="absolute top-full p-1 left-0 z-50 min-w-48 overflow-y-auto rounded-md border border-muted bg-popover text-popover-foreground shadow-md"
      :class="dropdownMaxHeight"
    >
      <div v-if="showSearch" class="relative mb-1">
        <Icon class="absolute size-4 start-2 top-2" icon="i-lucide-search" />
        <input
          v-model="searchTerm"
          v-focus
          class="w-full p-1.5 ps-8 text-sm rounded-md reset-base !mb-0 bg-transparent border border-input outline-none placeholder:text-muted-foreground"
          :placeholder="t('COMBOBOX.SEARCH_PLACEHOLDER')"
        />
      </div>
      <template v-if="searchResults.length">
        <Button
          v-for="option in searchResults"
          :key="option.id"
          type="button"
          variant="ghost"
          size="sm"
          class="justify-between w-full font-normal"
          @click="toggleOption(option)"
        >
          <EmojiIcon
            v-if="option.emoji"
            :value="option.emoji"
            :color="option.iconColor"
            class="flex-shrink-0 size-4"
          />
          <span
            v-else-if="option.color"
            class="flex-shrink-0 rounded-full size-1.5"
            :style="{ backgroundColor: option.color }"
          />
          <Icon v-else-if="option.icon" :icon="option.icon" />
          <span>{{ option.name }}</span>
          <Check v-if="selectedIds.includes(option.id)" />
        </Button>
      </template>
      <div v-else class="px-2 py-1.5 text-sm text-muted-foreground">
        {{
          searchTerm
            ? t('COMBOBOX.EMPTY_SEARCH_RESULTS', { searchTerm })
            : t('COMBOBOX.EMPTY_STATE')
        }}
      </div>
    </div>
  </div>
</template>
