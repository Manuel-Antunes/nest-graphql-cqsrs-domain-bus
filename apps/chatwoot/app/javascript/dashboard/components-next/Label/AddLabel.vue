<script setup>
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';

import { AsyncSelect } from 'dashboard/components-next/ui/async-select';
import { Button } from 'dashboard/components-next/ui/button';
import Icon from 'next/icon/Icon.vue';

const props = defineProps({
  labelMenuItems: {
    type: Array,
    default: () => [],
  },
});

const emit = defineEmits(['updateLabel']);

const { t } = useI18n();

// AsyncSelect speaks in arrays of id strings; the applied labels are the ones
// flagged `isSelected`.
const selectedValues = computed(() =>
  props.labelMenuItems
    .filter(item => item.isSelected)
    .map(item => String(item.value))
);

// Multi emits the whole new array; figure out the single id that toggled and
// forward it so the parent keeps its add/remove (toggle) logic.
const onUpdate = newValues => {
  const before = new Set(selectedValues.value);
  const after = new Set(newValues);
  const toggled =
    newValues.find(value => !before.has(value)) ??
    selectedValues.value.find(value => !after.has(value));
  if (toggled == null) return;
  const item = props.labelMenuItems.find(
    menuItem => String(menuItem.value) === String(toggled)
  );
  emit('updateLabel', item ?? { value: toggled });
};
</script>

<template>
  <AsyncSelect
    multi
    width="16rem"
    :options="labelMenuItems"
    :model-value="selectedValues"
    :search-placeholder="t('COMBOBOX.SEARCH_PLACEHOLDER')"
    :not-found-text="t('COMBOBOX.EMPTY_STATE')"
    @update:model-value="onUpdate"
  >
    <template #trigger>
      <Button
        variant="outline"
        class="text-muted-foreground border-dashed border-muted-foreground"
      >
        <Icon icon="i-lucide-plus" />
        {{ t('LABEL.TAG_BUTTON') }}
      </Button>
    </template>
    <template #option="{ option }">
      <span
        v-if="option.thumbnail && option.thumbnail.color"
        class="rounded-sm size-2 flex-shrink-0"
        :style="{ backgroundColor: option.thumbnail.color }"
      />
      <span class="truncate">{{ option.label }}</span>
    </template>
  </AsyncSelect>
</template>
