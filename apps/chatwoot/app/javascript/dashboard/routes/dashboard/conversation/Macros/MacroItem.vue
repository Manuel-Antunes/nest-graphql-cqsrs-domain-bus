<script setup>
import { ref } from 'vue';

import { Button } from 'dashboard/components-next/ui/button';
import { Spinner } from 'dashboard/components-next/ui/spinner';
import Icon from 'dashboard/components-next/icon/Icon.vue';
import MacroPreview from './MacroPreview.vue';

defineProps({
  macro: {
    type: Object,
    required: true,
  },
  isExecuting: {
    type: Boolean,
    default: false,
  },
});

defineEmits(['execute']);

const showPreview = ref(false);

const toggleMacroPreview = () => {
  showPreview.value = !showPreview.value;
};

const closeMacroPreview = () => {
  showPreview.value = false;
};
</script>

<template>
  <div
    class="relative flex items-center justify-between leading-4 rounded-md h-10 pl-3 pr-2"
    :class="showPreview ? 'cursor-default' : 'drag-handle cursor-grab'"
  >
    <span
      class="overflow-hidden whitespace-nowrap text-ellipsis font-medium text-n-slate-12"
    >
      {{ macro.name }}
    </span>
    <div class="flex items-center gap-1 justify-end">
      <Button
        v-tooltip.left-start="$t('MACROS.EXECUTE.PREVIEW')"
        variant="outline"
        size="icon"
        @click="toggleMacroPreview"
      >
        <Icon icon="i-lucide-info" />
      </Button>
      <Button
        v-tooltip.left-start="$t('MACROS.EXECUTE.BUTTON_TOOLTIP')"
        variant="outline"
        size="icon"
        :disabled="isExecuting"
        @click="$emit('execute')"
      >
        <Spinner v-if="isExecuting" class="size-4 flex-shrink-0" />
        <template v-if="!isExecuting">
          <Icon icon="i-lucide-play" />
        </template>
      </Button>
    </div>
    <transition name="menu-slide">
      <MacroPreview
        v-if="showPreview"
        v-on-clickaway="closeMacroPreview"
        :macro="macro"
      />
    </transition>
  </div>
</template>
