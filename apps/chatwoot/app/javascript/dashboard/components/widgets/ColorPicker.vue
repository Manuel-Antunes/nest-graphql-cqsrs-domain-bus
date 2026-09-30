<script setup lang="ts">
import { ref } from 'vue';
import { Chrome } from '@lk77/vue3-color';

withDefaults(
  defineProps<{
    modelValue?: string;
  }>(),
  {
    modelValue: '',
  }
);

const emit = defineEmits<{
  (e: 'update:modelValue', value: string): void;
}>();

const isPickerOpen = ref(false);

const toggleColorPicker = () => {
  isPickerOpen.value = !isPickerOpen.value;
};

const closeTogglePicker = () => {
  if (isPickerOpen.value) {
    toggleColorPicker();
  }
};

const updateColor = (color: { hex: string }) => {
  emit('update:modelValue', color.hex);
};
</script>

<template>
  <div class="colorpicker">
    <div
      class="colorpicker--selected"
      :style="`background-color: ${modelValue}`"
      @click.prevent="toggleColorPicker"
    />
    <Chrome
      v-if="isPickerOpen"
      v-on-clickaway="closeTogglePicker"
      disable-alpha
      :model-value="modelValue"
      class="colorpicker--chrome"
      @update:model-value="updateColor"
    />
  </div>
</template>

<style scoped lang="scss">
.colorpicker {
  position: relative;
}

.colorpicker--selected {
  @apply border border-solid border-n-weak rounded cursor-pointer h-8 w-8;
}

.colorpicker--chrome.vc-chrome {
  @apply shadow-lg -mt-2.5 absolute z-[9999] border border-solid border-n-weak rounded;

  :deep(input) {
    @apply bg-white dark:bg-white;
  }
}
</style>
