import { watch } from 'vue';
import { useAppNavigation } from 'dashboard/composables/useAppNavigation';
import { useUISettings } from 'dashboard/composables/useUISettings';

/**
 * Persist the last-active assistant id.
 *
 * Mirrors the SPA's CaptainPageRouteView `<router-view>` wrapper (dropped under
 * Inertia, where there is no persistent captain-level parent). Called from the thin
 * Inertia pages that carry an :assistantId, so navigating to any assistant sub-page
 * records that assistant — letting the /captain/:navigationPath landing page redirect
 * back to the assistant the user last visited.
 *
 * `immediate: true` because each Inertia page is a fresh mount (unlike the SPA wrapper
 * that stayed mounted across child route changes), so the id must be recorded on load.
 */
export function useCaptainAssistantTracking() {
  const { currentParams } = useAppNavigation();
  const { uiSettings, updateUISettings } = useUISettings();

  watch(
    () => currentParams.value.assistantId,
    newAssistantId => {
      if (
        newAssistantId &&
        newAssistantId !== String(uiSettings.value.last_active_assistant_id)
      ) {
        updateUISettings({
          last_active_assistant_id: Number(newAssistantId),
        });
      }
    },
    { immediate: true }
  );
}
