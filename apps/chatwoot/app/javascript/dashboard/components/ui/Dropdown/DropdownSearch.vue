<script setup>
import { Button } from 'dashboard/components-next/ui/button';

defineProps({
  inputPlaceholder: {
    type: String,
    default: '',
  },
  showClearFilter: {
    type: Boolean,
    default: false,
  },
});

const emit = defineEmits(['remove']);

const value = defineModel({
  type: String,
  default: '',
});
</script>

<template>
  <div
    class="flex items-center justify-between h-10 min-h-[40px] sticky top-0 bg-n-solid-2 dark:bg-n-solid-2 z-10 gap-2 px-3 border-b rounded-t-xl border-n-weak"
  >
    <div class="flex items-center w-full gap-2" @keyup.space.prevent>
      <fluent-icon
        icon="search"
        size="16"
        class="text-n-slate-11 flex-shrink-0"
      />
      <input
        v-model="value"
        :placeholder="inputPlaceholder"
        type="search"
        class="w-full mb-0 text-sm !outline-0 !outline-none bg-transparent text-n-slate-12 placeholder:text-n-slate-10 reset-base"
      />
    </div>
    <!-- Clear filter button -->
    <Button
      v-if="!modelValue && showClearFilter"
      variant="outline"
      class="h-6 px-2 text-xs flex-shrink-0"
      @click="emit('remove')"
    >
      {{ $t('REPORT.FILTER_ACTIONS.CLEAR_FILTER') }}
    </Button>
  </div>
</template>
