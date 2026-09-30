<script setup>
import { isVNode, computed } from 'vue';
import Icon from 'next/icon/Icon.vue';
import Policy from 'dashboard/components/policy.vue';
import AppLink from 'dashboard/components-next/AppLink.vue';
import { useSidebarContext } from './provider';

const props = defineProps({
  label: { type: String, required: true },
  to: { type: [String, Object], required: true },
  icon: { type: [String, Object], default: null },
  active: { type: Boolean, default: false },
  component: { type: Function, default: null },
  level: { type: Number, default: 2 }, // 2=subitem, 3=sub-subitem
});

const { resolvePermissions, resolveFeatureFlag } = useSidebarContext();

const shouldRenderComponent = computed(() => {
  return typeof props.component === 'function' || isVNode(props.component);
});
</script>

<!-- eslint-disable-next-line vue/no-root-v-if -->
<template>
  <Policy
    :permissions="resolvePermissions(to)"
    :feature-flag="resolveFeatureFlag(to)"
    as="li"
    :class="[level === 3 ? 'list-none' : '']"
  >
    <component
      :is="to ? AppLink : 'div'"
      :to="to"
      :title="label"
      :class="[
        'flex items-center rounded-lg group w-full min-w-0 overflow-hidden',
        level === 3
          ? 'h-7 gap-1.5 pl-2 pr-2 text-xs'
          : 'h-8 gap-2 pl-4 pr-2 text-sm',
        active ? 'bg-n-alpha-2 font-medium' : 'hover:bg-n-alpha-2',
      ]"
    >
      <component
        :is="component"
        v-if="shouldRenderComponent"
        :label
        :icon
        :active
      />
      <template v-else>
        <Icon
          v-if="icon"
          :icon="icon"
          :class="[level === 3 ? 'size-3' : 'size-4', 'inline-block mr-2']"
        />
        <div class="flex-1 truncate min-w-0 max-w-full overflow-hidden">
          {{ label }}
        </div>
      </template>
    </component>
  </Policy>
</template>
