<script setup>
import { ref, computed } from 'vue';
import { Button } from 'dashboard/components-next/ui/button';
import Icon from 'dashboard/components-next/icon/Icon.vue';
import { Spinner } from 'dashboard/components-next/ui/spinner';

const props = defineProps({
  label: { type: [String, Number], default: '' },
  confirmLabel: { type: [String, Number], default: '' },
  confirmHint: { type: String, default: '' },
  // shadcn Button variants for the default and the confirm state.
  variant: { type: String, default: 'ghost' },
  confirmVariant: { type: String, default: 'destructive' },
  size: { type: String, default: 'default' },
  icon: { type: [String, Object, Function], default: '' },
  isLoading: { type: Boolean, default: false },
});

const emit = defineEmits(['click']);

const isConfirmMode = ref(false);
const isClicked = ref(false);

const currentLabel = computed(() =>
  isConfirmMode.value ? props.confirmLabel : props.label
);

const currentVariant = computed(() =>
  isConfirmMode.value ? props.confirmVariant : props.variant
);

const resetConfirmMode = () => {
  isConfirmMode.value = false;
  isClicked.value = false;
};

const handleClick = () => {
  if (!isConfirmMode.value) {
    isConfirmMode.value = true;
  } else {
    isClicked.value = true;
    emit('click');
    setTimeout(resetConfirmMode, 400);
  }
};
</script>

<template>
  <div
    class="relative"
    :class="{
      'animate-bounce-complete': isClicked,
    }"
  >
    <Button
      type="button"
      :variant="currentVariant"
      :size="size"
      @click="handleClick"
      @blur="resetConfirmMode"
    >
      <Spinner v-if="isLoading" class="size-4" />
      <Icon v-else-if="icon" :icon="icon" />
      <slot>{{ currentLabel }}</slot>
    </Button>
    <div
      v-if="isConfirmMode && confirmHint"
      class="absolute mt-1 w-full text-[10px] text-center text-n-slate-10"
    >
      {{ confirmHint }}
    </div>
  </div>
</template>

<style scoped>
@keyframes bounce-complete {
  0% {
    transform: scale(0.95);
  }
  50% {
    transform: scale(1.02);
  }
  100% {
    transform: scale(1);
  }
}

.animate-bounce-complete {
  animation: bounce-complete 0.2s cubic-bezier(0.68, -0.55, 0.265, 1.55);
}
</style>
