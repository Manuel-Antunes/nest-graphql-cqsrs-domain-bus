<script setup>
import { computed } from 'vue';
import Icon from 'dashboard/components-next/icon/Icon.vue';
import AppLink from 'dashboard/components-next/AppLink.vue';
import { DropdownMenuItem } from 'reka-ui';

const props = defineProps({
  label: { type: String, default: '' },
  icon: { type: [String, Object, Function], default: '' },
  link: { type: [String, Object], default: '' },
  nativeLink: { type: Boolean, default: false },
  click: { type: Function, default: null },
  preserveOpen: { type: Boolean, default: false },
});

defineOptions({
  inheritAttrs: false,
});

// A link dropdown item renders as AppLink (vue-router-free: Inertia visit for migrated
// routes, plain <a> otherwise), unless explicitly a nativeLink (plain <a href>).
const isAppLink = computed(
  () => Boolean(props.link) && !(props.nativeLink && typeof props.link === 'string')
);

const componentIs = computed(() => {
  if (props.link) {
    if (props.nativeLink && typeof props.link === 'string') return 'a';
    return AppLink;
  }
  if (props.click) return 'button';
  return 'div';
});

const triggerClick = () => {
  if (props.click) props.click();
};

const handleSelect = event => {
  if (props.preserveOpen) event.preventDefault();
  triggerClick();
};
</script>

<template>
  <li class="n-dropdown-item">
    <DropdownMenuItem as-child @select="handleSelect">
      <component
        :is="componentIs"
        v-bind="$attrs"
        class="flex text-left rtl:text-right items-center p-2 reset-base text-sm text-n-slate-12 w-full border-0 rounded-lg cursor-pointer outline-none"
        :class="{
          'hover:bg-n-alpha-2 gap-3': !$slots.default,
        }"
        :href="componentIs === 'a' ? props.link : null"
        :to="isAppLink ? props.link : null"
      >
        <slot>
          <slot name="icon">
            <Icon v-if="icon" class="size-4 text-n-slate-11" :icon="icon" />
          </slot>
          <slot name="label">{{ label }}</slot>
        </slot>
      </component>
    </DropdownMenuItem>
  </li>
</template>
