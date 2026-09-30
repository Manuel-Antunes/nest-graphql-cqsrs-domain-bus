import { computed } from 'vue';
import { usePage } from '@inertiajs/vue3';
import { useMapGetter, useStore } from './store';

/**
 * Composable for account-related operations.
 * @returns {Object} An object containing account-related properties and methods.
 */
export function useAccount() {
  const store = useStore();
  const page = usePage();
  const getAccountFn = useMapGetter('accounts/getAccount');
  const isOnChatwootCloud = useMapGetter('globalConfig/isOnChatwootCloud');
  const isMetaInboxCreationDisabled = useMapGetter(
    'globalConfig/isMetaInboxCreationDisabled'
  );
  const isMetaMessageSendingDisabled = useMapGetter(
    'globalConfig/isMetaMessageSendingDisabled'
  );
  const isFeatureEnabledonAccount = useMapGetter(
    'accounts/isFeatureEnabledonAccount'
  );

  /**
   * Current account id — from the backend shared props when present, else parsed from
   * the URL (both vue-router-free; reactive via usePage().url).
   * @type {import('vue').ComputedRef<number>}
   */
  const accountId = computed(() => {
    const fromProps = page.props?.account?.id;
    if (fromProps != null) return Number(fromProps);
    const match = (page.url || window.location.pathname).match(
      /\/accounts\/(\d+)/
    );
    return match ? Number(match[1]) : NaN;
  });
  const currentAccount = computed(() => getAccountFn.value(accountId.value));

  /**
   * Generates an account-scoped URL.
   * @param {string} url - The URL to be scoped to the account.
   * @returns {string} The account-scoped URL.
   */
  const accountScopedUrl = url => {
    return `/app/accounts/${accountId.value}/${url}`;
  };

  const isCloudFeatureEnabled = feature => {
    return isFeatureEnabledonAccount.value(currentAccount.value.id, feature);
  };

  const accountScopedRoute = (name, params, query) => {
    return {
      name,
      params: { accountId: accountId.value, ...params },
      query: { ...query },
    };
  };

  const updateAccount = async (data, options) => {
    await store.dispatch('accounts/update', {
      ...data,
      options,
    });
  };

  const finishOnboarding = async data => {
    await store.dispatch('accounts/finishOnboarding', data);
  };

  return {
    accountId,
    // Kept for API compatibility; always undefined post-vue-router (Inertia has no route
    // object). Consumers already tolerated this on the Inertia path during coexistence.
    route: undefined,
    currentAccount,
    accountScopedUrl,
    accountScopedRoute,
    isCloudFeatureEnabled,
    isOnChatwootCloud,
    isMetaInboxCreationDisabled,
    isMetaMessageSendingDisabled,
    updateAccount,
    finishOnboarding,
  };
}
