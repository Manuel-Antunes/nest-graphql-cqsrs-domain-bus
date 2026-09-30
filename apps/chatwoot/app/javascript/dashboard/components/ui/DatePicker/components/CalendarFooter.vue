<script setup>
import { Button } from 'dashboard/components-next/ui/button';

const emit = defineEmits(['clear', 'change']);

const onClickClear = () => {
  emit('clear');
};

const onClickApply = () => {
  emit('change');
};
</script>

<template>
  <div class="h-[56px] flex justify-between gap-2 px-2 py-3 items-center">
    <Button
      variant="ghost"
      @click="onClickClear"
    >
      {{ $t('DATE_PICKER.CLEAR_BUTTON') }}
    </Button>
    <Button
      variant="ghost"
      @click="onClickApply"
    >
      {{ $t('DATE_PICKER.APPLY_BUTTON') }}
    </Button>
  </div>
</template>
