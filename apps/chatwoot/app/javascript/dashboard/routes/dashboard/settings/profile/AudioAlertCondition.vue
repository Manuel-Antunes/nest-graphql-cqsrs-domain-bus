<script setup>
import { Checkbox } from 'dashboard/components-next/ui/checkbox';
defineProps({
  label: {
    type: String,
    required: true,
  },
  items: {
    type: Array,
    required: true,
  },
});

const emit = defineEmits(['change']);
const onChange = (id, value) => {
  emit('change', id, value);
};
</script>

<template>
  <div>
    <label
      class="flex justify-between pb-1 text-sm font-medium leading-6 text-n-slate-12"
    >
      {{ label }}
    </label>
    <div class="flex flex-col gap-3 mt-2">
      <div
        v-for="item in items"
        :key="item.id"
        class="flex flex-row items-start gap-2"
      >
        <Checkbox
          :id="`checkbox-condition-${item.value}`"
          :checked="item.model"
          @update:checked="val => onChange(item.value, val)"
        />
        <label
          class="text-sm font-normal text-n-slate-12"
          :for="`checkbox-condition-${item.value}`"
        >
          {{ item.label }}
        </label>
      </div>
    </div>
  </div>
</template>
