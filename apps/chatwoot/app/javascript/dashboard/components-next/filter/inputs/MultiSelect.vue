<script setup>
import { computed, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { onClickOutside } from '@vueuse/core';
import Icon from 'dashboard/components-next/icon/Icon.vue';
import { ChevronDown, Check } from '@lucide/vue';
import { Button } from 'dashboard/components-next/ui/button';

const { options, maxChips } = defineProps({
  options: { type: Array, required: true },
  maxChips: { type: Number, default: 3 },
});

const { t } = useI18n();
const selected = defineModel({ type: [Array, String], required: true });

const isOpen = ref(false);
const containerRef = ref(null);

onClickOutside(containerRef, () => {
  isOpen.value = false;
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
  <div ref="containerRef" class="relative">
    <Button
      variant="outline"
      type="button"
      @click="isOpen = !isOpen"
      class="hover:bg-transparent bg-transparent font-normal"
    >
      <span v-if="!hasItems" class="truncate">
        {{ t('COMBOBOX.PLACEHOLDER') }}
      </span>
      <span
        v-else
        class="flex items-center gap-1 min-w-0 flex-1 overflow-hidden"
      >
        <span v-for="(item, idx) in selectedVisibleItems" :key="item.id">
          <Icon v-if="item.icon" :icon="item.icon" />
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
      v-show="isOpen"
      class="absolute top-full p-1 left-0 z-50 min-w-48 max-h-80 overflow-y-auto rounded-md border border-muted bg-popover text-popover-foreground shadow-md"
    >
      <Button
        v-for="option in options"
        :key="option.id"
        type="button"
        variant="ghost"
        size="sm"
        class="justify-between w-full font-normal"
        @click="toggleOption(option)"
      >
        <Icon v-if="option.icon" :icon="option.icon" />
        <span>{{ option.name }}</span>
        <Check v-if="selectedIds.includes(option.id)" />
      </Button>
    </div>
  </div>
</template>
