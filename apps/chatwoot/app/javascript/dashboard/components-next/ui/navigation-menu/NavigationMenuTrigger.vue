<script setup lang="ts">
import type { NavigationMenuTriggerProps } from "reka-ui"
import type { HTMLAttributes } from "vue"
import { reactiveOmit } from "@vueuse/core"
import { ChevronDown } from "@lucide/vue"
import {
  NavigationMenuTrigger,
  useForwardProps,
} from "reka-ui"
import { cn } from 'next/lib/utils'
import { navigationMenuTriggerStyle } from "."

const props = withDefaults(
  defineProps<
    NavigationMenuTriggerProps & {
      class?: HTMLAttributes["class"]
      // Hide the chevron for icon-only triggers (e.g. a vertical icon rail).
      showChevron?: boolean
      // Skip the default horizontal pill styling when composing custom layouts.
      unstyled?: boolean
    }
  >(),
  { showChevron: true, unstyled: false }
)

const delegatedProps = reactiveOmit(props, 'class', 'showChevron', 'unstyled')

const forwardedProps = useForwardProps(delegatedProps)
</script>

<template>
  <NavigationMenuTrigger
    v-bind="forwardedProps"
    :class="
      cn(unstyled ? 'group' : [navigationMenuTriggerStyle(), 'group'], props.class)
    "
  >
    <slot />
    <ChevronDown
      v-if="showChevron"
      class="relative top-px ml-1 h-3 w-3 transition duration-300 group-data-[state=open]:rotate-180"
      aria-hidden="true"
    />
  </NavigationMenuTrigger>
</template>
