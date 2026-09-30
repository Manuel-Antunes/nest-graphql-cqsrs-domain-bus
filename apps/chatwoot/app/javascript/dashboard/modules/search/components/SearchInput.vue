<script setup>
import { ref, useTemplateRef, onMounted, onUnmounted } from 'vue';
import { debounce } from '@chatwoot/utils';
import RecentSearches from './RecentSearches.vue';
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from 'dashboard/components-next/ui/input-group';
import Icon from 'next/icon/Icon.vue';

const emit = defineEmits(['search', 'selectRecentSearch']);

const searchQuery = defineModel({
  type: String,
  default: '',
});
const isInputFocused = ref(false);
const showRecentSearches = ref(false);
const searchInput = useTemplateRef('searchInput');
const recentSearchesRef = useTemplateRef('recentSearchesRef');

const handler = e => {
  if (e.key === '/' && document.activeElement.tagName !== 'INPUT') {
    e.preventDefault();
    const el = searchInput.value?.$el ?? searchInput.value;
    el?.focus?.();
  } else if (e.key === 'Escape' && document.activeElement.tagName === 'INPUT') {
    e.preventDefault();
    const el = searchInput.value?.$el ?? searchInput.value;
    el?.blur?.();
  }
};

const debouncedEmit = debounce(
  value =>
    emit('search', value.length > 1 || value.match(/^[0-9]+$/) ? value : ''),
  500
);

const onInput = () => {
  debouncedEmit(searchQuery.value);

  if (searchQuery.value.trim()) {
    showRecentSearches.value = false;
  } else if (isInputFocused.value) {
    showRecentSearches.value = true;
  }
};

const onFocus = () => {
  isInputFocused.value = true;
  if (!searchQuery.value.trim()) {
    showRecentSearches.value = true;
  }
};

const onBlur = () => {
  isInputFocused.value = false;
  showRecentSearches.value = false;
};

const onSelectRecentSearch = query => {
  searchQuery.value = query;
  emit('selectRecentSearch', query);
  showRecentSearches.value = false;
  const el = searchInput.value?.$el ?? searchInput.value;
  el?.focus?.();
};

const addToRecentSearches = query => {
  if (recentSearchesRef.value) {
    recentSearchesRef.value.addRecentSearch(query);
  }
};

defineExpose({
  addToRecentSearches,
});

onMounted(() => {
  const el = searchInput.value?.$el ?? searchInput.value;
  el?.focus?.();
  document.addEventListener('keydown', handler);
});

onUnmounted(() => {
  document.removeEventListener('keydown', handler);
});
</script>

<template>
  <InputGroup class="h-14">
    <InputGroupAddon>
      <Icon
        icon="i-lucide-search"
        class="size-4"
        :class="{
          'text-primary': isInputFocused,
          '': !isInputFocused,
        }"
      />
    </InputGroupAddon>
    <InputGroupInput
      ref="searchInput"
      v-model="searchQuery"
      :placeholder="$t('SEARCH.INPUT_PLACEHOLDER')"
      @focus="onFocus"
      @blur="onBlur"
      @input="onInput"
    />
    <InputGroupAddon align="inline-end">
      <span class="text-sm text-muted-foreground flex-shrink-0">
        {{ $t('SEARCH.PLACEHOLDER_KEYBINDING') }}
      </span>
    </InputGroupAddon>
  </InputGroup>

  <slot />

  <div
    class="transition-all duration-200 ease-out grid overflow-hidden w-full !border-t-0"
    :class="
      showRecentSearches
        ? 'grid-rows-[1fr] opacity-100'
        : 'grid-rows-[0fr] opacity-0'
    "
  >
    <div class="overflow-hidden w-full">
      <RecentSearches
        ref="recentSearchesRef"
        @select-search="onSelectRecentSearch"
        @clear-all="showRecentSearches = false"
      />
    </div>
  </div>
</template>
