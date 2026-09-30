import { inject, provide, ref, computed } from 'vue';
import { usePolicy } from 'dashboard/composables/usePolicy';
import { useAppNavigation } from 'dashboard/composables/useAppNavigation';
import { ROUTE_REGISTRY } from 'dashboard/routes/registry';
import { useUISettings } from 'dashboard/composables/useUISettings';

const SidebarControl = Symbol('SidebarControl');

const DEFAULT_WIDTH = 200;
const MIN_WIDTH = 56;
const COLLAPSED_THRESHOLD = 160;
const MAX_WIDTH = 320;

// Shared state for active popover (only one can be open at a time)
const activePopover = ref(null);
let globalCloseTimeout = null;

export function useSidebarResize() {
  const { uiSettings, updateUISettings } = useUISettings();

  const sidebarWidth = ref(uiSettings.value.sidebar_width || DEFAULT_WIDTH);
  const isCollapsed = computed(() => sidebarWidth.value < COLLAPSED_THRESHOLD);

  const setSidebarWidth = width => {
    sidebarWidth.value = Math.max(MIN_WIDTH, Math.min(MAX_WIDTH, width));
  };

  const saveWidth = () => {
    updateUISettings({ sidebar_width: sidebarWidth.value });
  };

  const snapToCollapsed = () => {
    sidebarWidth.value = MIN_WIDTH;
    updateUISettings({ sidebar_width: MIN_WIDTH });
  };

  const snapToExpanded = () => {
    sidebarWidth.value = DEFAULT_WIDTH;
    updateUISettings({ sidebar_width: DEFAULT_WIDTH });
  };

  return {
    sidebarWidth,
    isCollapsed,
    setSidebarWidth,
    saveWidth,
    snapToCollapsed,
    snapToExpanded,
    MIN_WIDTH,
    MAX_WIDTH,
    COLLAPSED_THRESHOLD,
    DEFAULT_WIDTH,
  };
}

export function usePopoverState() {
  const setActivePopover = name => {
    clearTimeout(globalCloseTimeout);
    activePopover.value = name;
  };

  const closeActivePopover = () => {
    activePopover.value = null;
  };

  const scheduleClose = (delay = 150) => {
    clearTimeout(globalCloseTimeout);
    globalCloseTimeout = setTimeout(() => {
      closeActivePopover();
    }, delay);
  };

  const cancelClose = () => {
    clearTimeout(globalCloseTimeout);
  };

  return {
    activePopover,
    setActivePopover,
    closeActivePopover,
    scheduleClose,
    cancelClose,
  };
}

export function useSidebarContext() {
  const context = inject(SidebarControl, null);
  if (context === null) {
    throw new Error(`Component is missing a parent <Sidebar /> component.`);
  }

  // Dual-mode: vue-router on the legacy SPA, registry under Inertia. Replaces the
  // former router.resolve(to).path / .meta lookups so the sidebar renders without
  // vue-router (the migration goal).
  const { resolvePath, resolveMeta } = useAppNavigation();
  const { shouldShow } = usePolicy();

  // If a `navigationPath` param exists, gate on the *target* route's meta.
  const metaFor = to => {
    if (to?.params?.navigationPath) {
      return ROUTE_REGISTRY[to.params.navigationPath]?.meta ?? {};
    }
    return resolveMeta(to);
  };

  const resolvePermissions = to => (to ? (metaFor(to).permissions ?? []) : []);
  const resolveFeatureFlag = to => (to ? (metaFor(to).featureFlag ?? '') : '');
  const resolveInstallationType = to =>
    to ? (metaFor(to).installationTypes ?? []) : [];

  const isAllowed = to =>
    shouldShow(
      resolveFeatureFlag(to),
      resolvePermissions(to),
      resolveInstallationType(to)
    );

  return {
    ...context,
    resolvePath,
    resolvePermissions,
    resolveFeatureFlag,
    resolveInstallationType,
    isAllowed,
  };
}

export function provideSidebarContext(context) {
  provide(SidebarControl, context);
}
