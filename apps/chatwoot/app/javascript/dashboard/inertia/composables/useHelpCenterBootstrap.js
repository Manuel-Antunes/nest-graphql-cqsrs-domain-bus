import { computed, onMounted } from 'vue';
import { useStore } from 'dashboard/composables/store';
import { useUISettings } from 'dashboard/composables/useUISettings';
import { useAppNavigation } from 'dashboard/composables/useAppNavigation';

/**
 * Replicates HelpCenterPageRouteView's onMounted bootstrap for the Inertia thin pages.
 *
 * On the legacy SPA the help-center parent route component (HelpCenterPageRouteView)
 * hydrates the portal + its categories + agents that EVERY child page reads from the
 * portals/categories/agents Vuex modules. Under Inertia that parent shell is bypassed
 * (each thin page renders its child directly under AppShell), so this composable performs
 * the exact same dispatches — mirroring the parent's slug/locale fallback (URL param →
 * last-active UI setting → first portal, and portal default locale when the URL omits it).
 *
 * No data props change hands: the child components keep fetching via Vuex, unchanged.
 */
export function useHelpCenterBootstrap() {
  const store = useStore();
  const { uiSettings } = useUISettings();
  const { currentParams } = useAppNavigation();

  const portals = computed(() => store.getters['portals/allPortals']);

  const selectedPortal = computed(() => {
    const slug =
      currentParams.value.portalSlug || uiSettings.value.last_active_portal_slug;
    if (slug) return store.getters['portals/portalBySlug'](slug);
    return portals.value[0];
  });

  const defaultPortalLocale = computed(
    () => selectedPortal.value?.meta?.default_locale ?? ''
  );

  const selectedLocale = computed(
    () => currentParams.value.locale || defaultPortalLocale.value
  );

  const selectedPortalSlug = computed(() => selectedPortal.value?.slug ?? '');

  const bootstrap = async () => {
    await store.dispatch('portals/index');
    const selectedPortalParam = {
      portalSlug: selectedPortalSlug.value,
      locale: selectedLocale.value,
    };
    store.dispatch('portals/show', selectedPortalParam);
    store.dispatch('categories/index', selectedPortalParam);
    store.dispatch('agents/get');
  };

  onMounted(bootstrap);
}
