<script setup>
import { ref, watch } from 'vue';
import { Checkbox } from 'dashboard/components-next/ui/checkbox';

const props = defineProps({
  modelValue: {
    type: String,
    required: true,
  },
  span: {
    type: Number,
    default: 2,
  },
  selectedFlags: {
    type: Array,
    required: true,
  },
  type: {
    type: String,
    required: true,
  },
});

const emit = defineEmits(['update:modelValue', 'input']);

const localValue = ref(props.modelValue);
const localFlags = ref(props.selectedFlags);

watch(
  () => props.selectedFlags,
  newValue => {
    localFlags.value = newValue;
  }
);

const handleInput = checked => {
  emit('update:modelValue', props.type, checked);
  emit('input', props.type, checked);
};
</script>

<template>
  <div
    class="flex items-start gap-2 px-0 text-sm tracking-[0.5] text-left rtl:text-right"
    :class="`col-span-${span}`"
  >
    <Checkbox
      class="mt-1 flex-shrink-0"
      :checked="localFlags.includes(localValue)"
      @update:checked="handleInput"
    />
  </div>
</template>
