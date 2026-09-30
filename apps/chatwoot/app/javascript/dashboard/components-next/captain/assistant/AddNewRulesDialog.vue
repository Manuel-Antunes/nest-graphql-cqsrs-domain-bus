<script setup>
import { ref } from 'vue';

import { Button } from 'dashboard/components-next/ui/button';
import InlineInput from 'dashboard/components-next/inline-input/InlineInput.vue';
import {
  Popover,
  PopoverTrigger,
  PopoverContent,
} from 'dashboard/components-next/ui/popover';

defineProps({
  placeholder: {
    type: String,
    default: '',
  },
  buttonLabel: {
    type: String,
    default: '',
  },
  confirmLabel: {
    type: String,
    default: '',
  },
  cancelLabel: {
    type: String,
    default: '',
  },
});

const emit = defineEmits(['add']);

const modelValue = defineModel({
  type: String,
  default: '',
});

const isOpen = ref(false);

const onClickAdd = () => {
  if (!modelValue.value?.trim()) return;
  emit('add', modelValue.value.trim());
  modelValue.value = '';
  isOpen.value = false;
};

const onClickCancel = () => {
  isOpen.value = false;
};
</script>

<template>
  <Popover v-model:open="isOpen">
    <PopoverTrigger as-child>
      <Button variant="outline" class="flex-shrink-0">
        {{ buttonLabel }}
      </Button>
    </PopoverTrigger>
    <PopoverContent class="w-[26.5rem] flex flex-col gap-5 p-4">
      <InlineInput
        v-model="modelValue"
        :placeholder="placeholder"
        @keyup.enter="onClickAdd"
      />
      <div class="flex gap-2 justify-between">
        <Button
          variant="link"
          class="h-10 hover:!no-underline"
          @click="onClickCancel"
        >
          {{ cancelLabel }}
        </Button>
        <Button @click="onClickAdd">{{ confirmLabel }}</Button>
      </div>
    </PopoverContent>
  </Popover>
</template>
