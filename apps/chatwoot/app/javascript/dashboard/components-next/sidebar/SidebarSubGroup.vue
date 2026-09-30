<script setup>
import { computed, ref, watch } from 'vue';
import SidebarGroupLeaf from './SidebarGroupLeaf.vue';
import Icon from 'next/icon/Icon.vue';

import { useSidebarContext } from './provider';
import { useAppNavigation } from 'dashboard/composables/useAppNavigation';
import { useEventListener } from '@vueuse/core';

const props = defineProps({
  isExpanded: { type: Boolean, default: false },
  label: { type: String, required: true },
  icon: { type: [Object, String], required: true },
  children: { type: Array, default: undefined },
  activeChild: { type: Object, default: undefined },
});

const { isAllowed } = useSidebarContext();
const { visit } = useAppNavigation();
const scrollableContainer = ref(null);
const subGroupExpanded = ref(false);

const accessibleItems = computed(() =>
  props.children.filter(child => child.to && isAllowed(child.to))
);

const hasAccessibleItems = computed(() => accessibleItems.value.length > 0);

const isScrollable = computed(() => accessibleItems.value.length > 7);

const hasActiveChild = computed(() =>
  accessibleItems.value.some(child => child.name === props.activeChild?.name)
);

watch(
  () => props.activeChild,
  newVal => {
    if (newVal && accessibleItems.value.some(c => c.name === newVal.name)) {
      subGroupExpanded.value = true;
    }
  },
  { immediate: true }
);

const scrollEnd = ref(false);

useEventListener(scrollableContainer, 'scroll', () => {
  if (!scrollableContainer.value) return;
  const { scrollHeight, scrollTop, clientHeight } = scrollableContainer.value;
  scrollEnd.value = scrollHeight - scrollTop === clientHeight;
});

const toggleSubGroup = () => {
  if (
    !subGroupExpanded.value &&
    !hasActiveChild.value &&
    accessibleItems.value.length > 0
  ) {
    visit(accessibleItems.value[0].to);
  }
  subGroupExpanded.value = !subGroupExpanded.value;
};
</script>

<template>
  <li v-if="hasAccessibleItems && isExpanded" class="list-none min-w-0 w-full">
    <button
      class="flex flex-row items-center justify-between gap-2 px-2 rounded-lg h-8 w-full text-sm min-w-0 cursor-pointer select-none hover:bg-n-alpha-2"
      :class="hasActiveChild && 'font-medium'"
      @click="toggleSubGroup"
    >
      <div class="flex flex-row gap-2">
        <Icon v-if="icon" :icon="icon" class="size-4 mr-2 flex-shrink-0" />
        <span class="truncate min-w-0">{{ label }}</span>
      </div>
      <span
        class="i-lucide-chevron-up size-4 flex-shrink-0 transition-transform duration-200"
        :class="{ '-rotate-180': subGroupExpanded }"
      />
    </button>
    <ul
      v-if="subGroupExpanded"
      class="m-0 list-none flex flex-col gap-1 min-w-0 relative group mx-3.5 ltr:border-l rtl:border-r border-n-weak px-2.5 py-0.5"
    >
      <!-- Each element has h-8, which is 32px, we will show 7 items with one hidden at the end,
      which is 14rem. Then we add 16px so that we have some text visible from the next item  -->
      <div
        ref="scrollableContainer"
        class="min-w-0 w-full"
        :class="{
          'max-h-[calc(14rem+16px)] overflow-y-scroll no-scrollbar':
            isScrollable,
        }"
      >
        <SidebarGroupLeaf
          v-for="child in accessibleItems"
          :key="child.name"
          v-bind="child"
          :active="activeChild?.name === child.name"
          :level="3"
        />
      </div>
      <div
        v-if="isScrollable"
        v-show="!scrollEnd"
        class="absolute bg-gradient-to-t from-n-solid-2 w-full h-12 to-transparent -bottom-1 pointer-events-none flex items-end justify-end px-2 animate-fade-in-up"
      >
        <svg
          width="16"
          height="24"
          viewBox="0 0 16 24"
          fill="none"
          class="opacity-50 group-hover:opacity-100"
          xmlns="http://www.w3.org/2000/svg"
        >
          <path
            d="M4 4L8 8L12 4"
            stroke="currentColor"
            opacity="0.5"
            stroke-width="1.33333"
            stroke-linecap="round"
            stroke-linejoin="round"
          />
          <path
            d="M4 10L8 14L12 10"
            stroke="currentColor"
            opacity="0.75"
            stroke-width="1.33333"
            stroke-linecap="round"
            stroke-linejoin="round"
          />
          <path
            d="M4 16L8 20L12 16"
            stroke="currentColor"
            stroke-width="1.33333"
            stroke-linecap="round"
            stroke-linejoin="round"
          />
        </svg>
      </div>
    </ul>
  </li>
</template>
