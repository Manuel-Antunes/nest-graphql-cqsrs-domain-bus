<script setup lang="ts">
import type { MessageScrollerProviderProps } from './interface';
import { useProvideMessageScroller } from './useMessageScroller';

const props = withDefaults(defineProps<MessageScrollerProviderProps>(), {
  autoScroll: false,
  defaultScrollPosition: 'end',
});

useProvideMessageScroller(props);
</script>

<template>
  <slot />
</template>
