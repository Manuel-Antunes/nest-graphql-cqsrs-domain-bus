import { inject, provide } from 'vue';
import { usePolicy } from 'dashboard/composables/usePolicy';
import { useAppNavigation } from 'dashboard/composables/useAppNavigation';
import { ROUTE_REGISTRY } from 'dashboard/routes/registry';

const SidebarControl = Symbol('SidebarControl');

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
