<script setup>
import { ref } from 'vue';

import { Button } from 'dashboard/components-next/ui/button';
import Icon from 'dashboard/components-next/icon/Icon.vue';
import { Switch } from 'dashboard/components-next/ui/switch';

const props = defineProps({
  attribute: {
    type: Object,
    required: true,
  },
  isEditingView: {
    type: Boolean,
    default: false,
  },
});

const emit = defineEmits(['update', 'delete']);

const attributeValue = ref(Boolean(props.attribute.value));

const handleChange = value => {
  emit('update', value);
};
</script>

<template>
  <div
    class="flex items-center w-full gap-2"
    :class="{
      'justify-start': isEditingView,
      'justify-end': !isEditingView,
    }"
  >
    <Switch v-model="attributeValue" @update:model-value="handleChange" />
    <Button
      v-if="isEditingView"
      variant="destructive"
      size="icon"
      @click="emit('delete')"
    >
      <Icon :icon="'i-lucide-trash'" />
    </Button>
  </div>
</template>
