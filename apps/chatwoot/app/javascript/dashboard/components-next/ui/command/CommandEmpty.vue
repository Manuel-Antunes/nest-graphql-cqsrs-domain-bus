<script setup lang="ts">
import type { PrimitiveProps } from "reka-ui"
import type { HTMLAttributes } from "vue"
import { reactiveOmit } from "@vueuse/core"
import { Primitive } from "reka-ui"
import { computed } from "vue"
import { cn } from 'next/lib/utils'
import { useCommand } from "."

const props = defineProps<PrimitiveProps & { class?: HTMLAttributes["class"] }>()

const delegatedProps = reactiveOmit(props, "class")

const { filterState, allItems, shouldFilter } = useCommand()
const isRender = computed(() => {
  // When the consumer owns filtering (shouldFilter = false), `filtered.count` is
  // stale between searches (it only recomputes on search change, not when async
  // options mount). Fall back to the live count of rendered items so the empty
  // state and the list are never shown at the same time.
  if (shouldFilter && !shouldFilter.value) {
    return allItems.value.size === 0
  }
  return !!filterState.search && filterState.filtered.count === 0
})
</script>

<template>
  <Primitive v-if="isRender" v-bind="delegatedProps" :class="cn('py-6 text-center text-sm', props.class)">
    <slot />
  </Primitive>
</template>
