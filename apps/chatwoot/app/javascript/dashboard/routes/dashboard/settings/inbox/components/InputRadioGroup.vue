<script setup lang="ts">
import { computed } from 'vue';
import type { AcceptableValue } from 'reka-ui';
import { RadioGroup, RadioGroupItem } from 'next/ui/radio-group';
import { Label } from 'next/ui/label';

interface RadioItem {
  id: string | number;
  title: string;
  checked?: boolean;
  [key: string]: unknown;
}

const props = withDefaults(
  defineProps<{
    name?: string;
    label?: string;
    items?: RadioItem[];
    action?: (item: RadioItem) => void;
  }>(),
  {
    name: 'string',
    label: '',
    items: () => [],
    action: () => {},
  }
);

const selectedValue = computed(() => {
  const checked = props.items.find(item => item.checked);
  return checked ? String(checked.id) : undefined;
});

const onChange = (value: AcceptableValue) => {
  const item = props.items.find(i => String(i.id) === String(value));
  if (item) props.action({ ...item, checked: true });
};
</script>

<template>
  <div>
    <Label v-if="label" class="block mb-1 text-sm font-medium">
      {{ label }}
    </Label>
    <RadioGroup
      :model-value="selectedValue"
      :name="`${name}-radio-input`"
      class="flex flex-row flex-wrap gap-x-2.5 gap-y-1"
      @update:model-value="onChange"
    >
      <Label
        v-for="item in items"
        :key="item.id"
        class="flex items-center gap-2 font-normal cursor-pointer"
      >
        <RadioGroupItem :value="String(item.id)" />
        <span>{{ item.title }}</span>
      </Label>
    </RadioGroup>
  </div>
</template>
