import { computed } from 'vue';
import { usePage } from '@inertiajs/vue3';

/**
 * Dual-mode accessor for the cross-cutting context the backend exposes as Inertia
 * shared props (see InertiaController#inertia_share: auth.user, account, permissions,
 * installationType). This lets composables source "shared" data from the server on
 * Inertia pages while transparently falling back to their existing Vuex/route sources
 * on the legacy vue-router SPA during the migration.
 *
 * `usePage()` reads an Inertia module-level singleton (no inject, optional-chained), so
 * it is safe to call in the SPA too — there `props` is simply undefined and every getter
 * below returns null, signalling callers to use their legacy source.
 *
 * @returns {{
 *   isInertia: import('vue').ComputedRef<boolean>,
 *   accountId: import('vue').ComputedRef<number|null>,
 *   account: import('vue').ComputedRef<object|null>,
 *   user: import('vue').ComputedRef<object|null>,
 *   permissions: import('vue').ComputedRef<string[]|null>,
 *   installationType: import('vue').ComputedRef<string|null>,
 *   isFeatureEnabled: (name: string) => boolean,
 * }}
 */
export function useInertiaShared() {
  const page = usePage();
  const props = computed(() => page.props ?? null);

  return {
    // `auth` is always present on an Inertia page shell; its absence => legacy SPA.
    isInertia: computed(() => Boolean(props.value?.auth)),
    accountId: computed(() =>
      props.value?.account?.id != null ? Number(props.value.account.id) : null
    ),
    account: computed(() => props.value?.account ?? null),
    user: computed(() => props.value?.auth?.user ?? null),
    permissions: computed(() => props.value?.permissions ?? null),
    installationType: computed(() => props.value?.installationType ?? null),
    isFeatureEnabled: name => Boolean(props.value?.account?.features?.[name]),
  };
}
