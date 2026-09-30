<script setup>
import { computed } from 'vue';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from 'dashboard/components-next/ui/select';

const props = defineProps({
  options: {
    type: Array,
    default: () => [],
    validator: options =>
      options.every(
        opt => typeof opt === 'object' && 'value' in opt && 'label' in opt
      ),
  },
  groups: {
    type: Array,
    default: () => [],
    validator: groups =>
      groups.every(
        group =>
          'label' in group &&
          Array.isArray(group.options) &&
          group.options.every(opt => 'value' in opt && 'label' in opt)
      ),
  },
  placeholder: {
    type: String,
    default: '',
  },
  disabled: {
    type: Boolean,
    default: false,
  },
  error: {
    type: String,
    default: '',
  },
  ariaLabel: {
    type: String,
    default: '',
  },
});

const modelValue = defineModel({
  type: [String, Number, Boolean],
  default: '',
});

const allOptions = computed(() =>
  props.groups.length
    ? props.groups.flatMap(group => group.options)
    : props.options
);

const keyOf = value => JSON.stringify(value);

const selectedKey = computed({
  get() {
    const selected = allOptions.value.find(
      option => option.value === modelValue.value
    );
    return selected ? keyOf(selected.value) : '';
  },
  set(key) {
    const selected = allOptions.value.find(
      option => keyOf(option.value) === key
    );
    if (selected) modelValue.value = selected.value;
  },
});
</script>

<template>
  <div class="w-fit relative">
    <Select v-model="selectedKey" :disabled="disabled">
      <SelectTrigger
        :aria-label="ariaLabel || undefined"
        :aria-invalid="error ? true : undefined"
        class="w-full min-w-0"
      >
        <SelectValue :placeholder="placeholder" />
      </SelectTrigger>
      <SelectContent>
        <template v-if="groups.length">
          <SelectGroup v-for="group in groups" :key="group.label">
            <SelectLabel>{{ group.label }}</SelectLabel>
            <SelectItem
              v-for="option in group.options"
              :key="keyOf(option.value)"
              :value="keyOf(option.value)"
              :disabled="option.disabled"
            >
              {{ option.label }}
            </SelectItem>
          </SelectGroup>
        </template>
        <template v-else>
          <SelectItem
            v-for="option in options"
            :key="keyOf(option.value)"
            :value="keyOf(option.value)"
            :disabled="option.disabled"
          >
            {{ option.label }}
          </SelectItem>
        </template>
      </SelectContent>
    </Select>
  </div>
</template>
