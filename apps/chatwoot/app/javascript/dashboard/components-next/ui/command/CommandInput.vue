<script setup lang="ts">
import type { ListboxFilterProps } from 'reka-ui';
import type { HTMLAttributes } from 'vue';
import { reactiveOmit } from '@vueuse/core';
import { Search } from '@lucide/vue';
import { ListboxFilter, useForwardProps } from 'reka-ui';
import { cn } from 'next/lib/utils';
import { useCommand } from '.';

defineOptions({
  inheritAttrs: false,
});

const props = defineProps<
  ListboxFilterProps & {
    class?: HTMLAttributes['class'];
  }
>();

const delegatedProps = reactiveOmit(props, 'class');

const forwardedProps = useForwardProps(delegatedProps);

const { filterState } = useCommand();
</script>

<template>
  <div class="flex items-center border-b border-input px-3" cmdk-input-wrapper>
    <Search class="mr-2 h-4 w-4 shrink-0 opacity-50" />
    <ListboxFilter
      v-bind="{ ...forwardedProps, ...$attrs }"
      v-model="filterState.search"
      auto-focus
      :class="
        cn(
          '!border-0 !bg-transparent !shadow-none !ring-0 !outline-none !text-smplaceholder:text-muted-foreground flex !h-10 w-full rounded-md !py-3 !px-0 !text-sm disabled:cursor-not-allowed !m-0 disabled:opacity-50',
          props.class
        )
      "
    />
  </div>
</template>
