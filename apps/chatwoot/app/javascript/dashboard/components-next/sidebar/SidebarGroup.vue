<script setup>
import { computed, onMounted, watch, nextTick } from 'vue';
import { useSidebarContext } from './provider';
import { useAppNavigation } from 'dashboard/composables/useAppNavigation';
import Policy from 'dashboard/components/policy.vue';
import SidebarGroupHeader from './SidebarGroupHeader.vue';
import SidebarGroupLeaf from './SidebarGroupLeaf.vue';
import SidebarSubGroup from './SidebarSubGroup.vue';
import SidebarGroupEmptyLeaf from './SidebarGroupEmptyLeaf.vue';

const props = defineProps({
  name: { type: String, required: true },
  label: { type: String, required: true },
  icon: { type: [String, Object, Function], default: null },
  to: { type: Object, default: null },
  activeOn: { type: Array, default: () => [] },
  children: { type: Array, default: undefined },
  getterKeys: { type: Object, default: () => ({}) },
});

const {
  expandedItem,
  setExpandedItem,
  resolvePath,
  resolvePermissions,
  resolveFeatureFlag,
  isAllowed,
} = useSidebarContext();

const navigableChildren = computed(() => {
  return props.children?.flatMap(child => child.children || child) || [];
});

const { currentParams, currentPath, currentRouteName, visit } =
  useAppNavigation();
const isExpanded = computed(() => expandedItem.value === props.name);
const isExpandable = computed(() => props.children);
const hasChildren = computed(
  () => Array.isArray(props.children) && props.children.length > 0
);

const accessibleItems = computed(() => {
  if (!hasChildren.value) return [];
  return props.children.filter(child => {
    // If a item has no link, it means it's just a subgroup header
    // So we don't need to check for permissions here, because there's nothing to
    // access here anyway
    return child.to && isAllowed(child.to);
  });
});

const hasAccessibleChildren = computed(() => {
  return accessibleItems.value.length > 0;
});

const isActive = computed(() => {
  if (props.to) {
    if (currentPath.value === resolvePath(props.to)) return true;

    return props.activeOn.includes(currentRouteName.value);
  }

  return false;
});

// We could use the RouterLink isActive too, but our routes are not always
// nested correctly, so we need to check the active state ourselves
// TODO: Audit the routes and fix the nesting and remove this
const activeChild = computed(() => {
  const pathSame = navigableChildren.value.find(
    child => child.to && currentPath.value === resolvePath(child.to)
  );
  if (pathSame) return pathSame;

  // Rank the activeOn Prop higher than the path match
  // There will be cases where the path name is the same but the params are different
  // So we need to rank them based on the params
  // For example, contacts segment list in the sidebar effectively has the same name
  // But the params are different
  const activeOnPages = navigableChildren.value.filter(child =>
    child.activeOn?.includes(currentRouteName.value)
  );

  if (activeOnPages.length > 0) {
    const rankedPage = activeOnPages.find(child => {
      return Object.keys(child.to.params)
        .map(key => {
          return (
            String(child.to.params[key]) === String(currentParams.value[key])
          );
        })
        .every(match => match);
    });

    // If there is no ranked page, return the first activeOn page anyway
    // Since this takes higher precedence over the path match
    // This is not perfect, ideally we should rank each route based on all the techniques
    // and then return the highest ranked one
    // But this is good enough for now
    return rankedPage ?? activeOnPages[0];
  }

  return navigableChildren.value.find(
    child => child.to && currentPath.value.startsWith(resolvePath(child.to))
  );
});

const hasActiveChild = computed(() => {
  return activeChild.value !== undefined;
});

const toggleTrigger = () => {
  if (
    hasAccessibleChildren.value &&
    !isExpanded.value &&
    !hasActiveChild.value
  ) {
    // if not already expanded, navigate to the first child
    const firstItem = accessibleItems.value[0];
    visit(firstItem.to);
  }
  setExpandedItem(props.name);
};

onMounted(async () => {
  await nextTick();
  if (hasActiveChild.value) {
    setExpandedItem(props.name);
  }
});

watch(
  hasActiveChild,
  hasNewActiveChild => {
    if (hasNewActiveChild && !isExpanded.value) {
      setExpandedItem(props.name);
    }
  },
  { once: true }
);
</script>

<!-- eslint-disable-next-line vue/no-root-v-if -->
<template>
  <Policy
    v-if="!hasChildren || hasAccessibleChildren"
    :permissions="resolvePermissions(to)"
    :feature-flag="resolveFeatureFlag(to)"
    as="li"
    class="grid gap-1 text-sm cursor-pointer select-none min-w-0"
  >
    <SidebarGroupHeader
      :icon
      :name
      :label
      :to
      :getter-keys="getterKeys"
      :is-active="isActive"
      :has-active-child="hasActiveChild"
      :expandable="hasChildren"
      :is-expanded="isExpanded"
      @toggle="toggleTrigger"
    />
    <ul
      v-if="hasChildren"
      v-show="isExpanded || hasActiveChild"
      class="flex flex-col gap-1 m-0 list-none min-w-0 mx-3.5 ltr:border-l rtl:border-r border-n-weak px-2.5 py-0.5"
    >
      <template v-for="child in children" :key="child.name">
        <SidebarSubGroup
          v-if="child.children"
          :label="child.label"
          :icon="child.icon"
          :children="child.children"
          :is-expanded="isExpanded"
          :active-child="activeChild"
        />
        <SidebarGroupLeaf
          v-else-if="isAllowed(child.to)"
          v-show="isExpanded || activeChild?.name === child.name"
          v-bind="child"
          :active="activeChild?.name === child.name"
        />
      </template>
    </ul>
    <ul
      v-else-if="isExpandable && isExpanded"
      class="m-0 list-none ltr:ml-3.5 rtl:mr-3.5 ltr:border-l rtl:border-r border-n-weak ltr:pl-2 rtl:pr-2 py-0.5"
    >
      <SidebarGroupEmptyLeaf />
    </ul>
  </Policy>
</template>
