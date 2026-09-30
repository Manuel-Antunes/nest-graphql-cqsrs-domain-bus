<script setup>
import { computed } from 'vue';
import { useMapGetter } from 'dashboard/composables/store.js';
import Icon from 'next/icon/Icon.vue';
import AppLink from 'dashboard/components-next/AppLink.vue';

const props = defineProps({
  to: { type: [Object, String], default: '' },
  label: { type: String, default: '' },
  icon: { type: [String, Object], default: '' },
  expandable: { type: Boolean, default: false },
  isExpanded: { type: Boolean, default: false },
  isActive: { type: Boolean, default: false },
  hasActiveChild: { type: Boolean, default: false },
  getterKeys: { type: Object, default: () => ({}) },
});

const emit = defineEmits(['toggle']);

const showBadge = useMapGetter(props.getterKeys.badge);
const dynamicCount = useMapGetter(props.getterKeys.count);
const count = computed(() =>
  dynamicCount.value > 99 ? '99+' : dynamicCount.value
);
</script>

<template>
  <component
    :is="to ? AppLink : 'div'"
    class="flex items-center gap-2 px-2 rounded-lg h-9 min-w-0"
    role="button"
    draggable="false"
    :to="to"
    :title="label"
    :class="[
      isActive || hasActiveChild
        ? 'bg-n-alpha-2 font-medium'
        : 'hover:bg-n-alpha-2',
    ]"
    @click.stop="emit('toggle')"
  >
    <div v-if="icon" class="relative flex items-center gap-2 mr-2">
      <Icon v-if="icon" :icon="icon" class="size-4" />
      <span
        v-if="showBadge"
        class="size-2 -top-px ltr:-right-px rtl:-left-px bg-n-brand absolute rounded-full border border-n-solid-2"
      />
    </div>
    <div class="flex items-center gap-1.5 flex-grow min-w-0">
      <span class="text-sm leading-5 truncate">
        {{ label }}
      </span>
      <span
        v-if="dynamicCount && !expandable"
        class="min-w-5 h-5 px-1 rounded-full flex items-center justify-center text-xxs font-bold leading-none"
        :class="{
          'border-input': isActive,
          'text-n-slate-11 outline-n-strong': !isActive,
        }"
      >
        {{ count }}
      </span>
    </div>
    <span
      v-if="expandable"
      class="i-lucide-chevron-up size-4 flex-shrink-0 transition-transform duration-200"
      :class="{ '-rotate-180': isExpanded }"
      @click.stop="emit('toggle')"
    />
  </component>
</template>
