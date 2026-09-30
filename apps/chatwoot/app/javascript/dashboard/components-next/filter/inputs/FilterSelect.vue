<script setup>
import { computed } from 'vue';
import Icon from 'dashboard/components-next/icon/Icon.vue';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from 'dashboard/components-next/ui/select';

const props = defineProps({
  options: { type: Array, required: true },
  hideLabel: { type: Boolean, default: false },
  hideIcon: { type: Boolean, default: false },
  variant: { type: String, default: 'faded' },
  label: { type: String, default: null },
});

const selected = defineModel({ type: [String, Number], required: true });

const selectedOption = computed(
  () =>
    props.options.find(o => String(o.value) === String(selected.value)) || {}
);

const handleUpdate = val => {
  const original = props.options.find(o => String(o.value) === val);
  selected.value = original ? original.value : val;
};

const isVNodeIcon = icon => icon && typeof icon !== 'string';
</script>

<template>
  <Select
    :model-value="String(selected)"
    :modal="false"
    @update:model-value="handleUpdate"
  >
    <SelectTrigger>
      <component
        v-if="
          !hideIcon && selectedOption.icon && isVNodeIcon(selectedOption.icon)
        "
        :is="() => selectedOption.icon"
      />
      <Icon
        v-else-if="!hideIcon && selectedOption.icon"
        :icon="selectedOption.icon"
      />
      <span v-if="!hideLabel" class="truncate"
        >{{ selectedOption.label }}
      </span>
    </SelectTrigger>
    <SelectContent disable-portal>
      <SelectItem
        v-for="option in options"
        :key="option.value"
        :value="String(option.value)"
        class="flex items-center gap-2"
      >
        <component
          v-if="!hideIcon && option.icon && isVNodeIcon(option.icon)"
          :is="() => option.icon"
        />
        <Icon v-else-if="!hideIcon && option.icon" :icon="option.icon" />
        {{ option.label }}
      </SelectItem>
    </SelectContent>
  </Select>
</template>
