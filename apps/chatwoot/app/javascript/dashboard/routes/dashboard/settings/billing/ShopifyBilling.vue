<script setup>
import { computed, onMounted, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { format } from 'date-fns';
import { useStore } from 'dashboard/composables/store';
import { useAccount } from 'dashboard/composables/useAccount';
import EnterpriseAccountAPI from 'dashboard/api/enterprise/account';
import { useBranding } from 'shared/composables/useBranding';

import BillingCard from './components/BillingCard.vue';
import DetailItem from './components/DetailItem.vue';
import BaseSettingsHeader from '../components/BaseSettingsHeader.vue';
import SettingsLayout from '../SettingsLayout.vue';
import { Button } from 'dashboard/components-next/ui/button';
import { Spinner } from 'dashboard/components-next/ui/spinner';

const store = useStore();
const { accountId } = useAccount();
const { t } = useI18n();
const { replaceInstallationName } = useBranding();

const summary = ref(null);
const isLoading = ref(true);
const isRefreshing = ref(false);
const hasError = ref(false);
const isStale = ref(false);

const formatDate = (value, pattern = 'dd MMM, yyyy') => {
  return format(new Date(value), pattern);
};

const routeQuery = ref(
  Object.fromEntries(new URLSearchParams(window.location.search))
);

const isShopifyReturn = computed(
  () => Boolean(routeQuery.value.plan_handle) || Boolean(routeQuery.value.shop)
);

const statusLabel = computed(() => {
  const state = summary.value?.state?.toUpperCase() || 'PENDING';
  switch (state) {
    case 'ACTIVE':
      return t('BILLING_SETTINGS.SHOPIFY.STATUS.ACTIVE');
    case 'TRIALING':
      return t('BILLING_SETTINGS.SHOPIFY.STATUS.TRIALING');
    case 'CANCELLED':
      return t('BILLING_SETTINGS.SHOPIFY.STATUS.CANCELLED');
    case 'EXPIRED':
      return t('BILLING_SETTINGS.SHOPIFY.STATUS.EXPIRED');
    case 'MISSING':
      return t('BILLING_SETTINGS.SHOPIFY.STATUS.MISSING');
    default:
      return t('BILLING_SETTINGS.SHOPIFY.STATUS.PENDING');
  }
});

const actionLabel = computed(() => {
  return ['active', 'trialing', 'cancelled'].includes(summary.value?.state)
    ? t('BILLING_SETTINGS.SHOPIFY.MANAGE_PLAN')
    : t('BILLING_SETTINGS.SHOPIFY.VIEW_PLANS');
});

const formattedPrice = computed(() => {
  if (summary.value?.amount == null || !summary.value?.currency) return '';

  return new Intl.NumberFormat(undefined, {
    style: 'currency',
    currency: summary.value.currency,
  }).format(Number(summary.value.amount));
});

const formattedRecurringPrice = computed(() => {
  if (!formattedPrice.value) return '';

  if (summary.value?.billing_period?.toUpperCase() === 'ANNUAL') {
    return t('BILLING_SETTINGS.SHOPIFY.PER_YEAR', {
      price: formattedPrice.value,
    });
  }
  if (summary.value?.billing_period?.toUpperCase() === 'EVERY_30_DAYS') {
    return t('BILLING_SETTINGS.SHOPIFY.PER_MONTH', {
      price: formattedPrice.value,
    });
  }

  return formattedPrice.value;
});

const billingDate = computed(() => {
  if (summary.value?.state === 'trialing' && summary.value?.trial_ends_at) {
    return {
      label: t('BILLING_SETTINGS.SHOPIFY.TRIAL_ENDS_ON'),
      value: formatDate(summary.value.trial_ends_at),
    };
  }
  if (!summary.value?.current_period_end) return null;

  return {
    label:
      summary.value.state === 'cancelled'
        ? t('BILLING_SETTINGS.SHOPIFY.ACCESS_UNTIL')
        : t('BILLING_SETTINGS.SHOPIFY.RENEWS_ON'),
    value: formatDate(summary.value.current_period_end),
  };
});

const lastVerifiedAt = computed(() => {
  if (!summary.value?.last_verified_at) return '';
  return formatDate(summary.value.last_verified_at, 'dd MMM, yyyy, h:mm a');
});

const canManageSubscription = computed(
  () => summary.value?.allowed_actions?.manage_subscription
);

const fetchSummary = async ({ refresh = false } = {}) => {
  const response = await EnterpriseAccountAPI.billingSummary({ refresh });
  return response.data;
};

const clearShopifyReturnParams = async () => {
  const { plan_handle: _planHandle, shop: _shop, ...query } = routeQuery.value;
  routeQuery.value = query;
  const queryString = new URLSearchParams(query).toString();
  window.history.replaceState(
    window.history.state,
    '',
    `${window.location.pathname}${queryString ? `?${queryString}` : ''}`
  );
};

const loadSummary = async () => {
  isLoading.value = true;
  hasError.value = false;
  isStale.value = false;

  try {
    summary.value = await fetchSummary();
  } catch {
    hasError.value = true;
    isLoading.value = false;
    return;
  }

  isRefreshing.value = true;
  try {
    summary.value = await fetchSummary({ refresh: true });
    await store.dispatch('setUser');
    await store.dispatch('accounts/get', {
      accountId: accountId.value,
    });
    if (isShopifyReturn.value) {
      await clearShopifyReturnParams();
    }
  } catch {
    hasError.value = true;
    isStale.value = true;
  } finally {
    isRefreshing.value = false;
  }

  isLoading.value = false;
};

const manageSubscription = () => {
  store.dispatch('accounts/checkout');
};

onMounted(loadSummary);
</script>

<template>
  <SettingsLayout
    :is-loading="isLoading"
    :loading-message="$t('BILLING_SETTINGS.SHOPIFY.LOADING')"
  >
    <template #header>
      <BaseSettingsHeader
        :title="$t('BILLING_SETTINGS.SHOPIFY.TITLE')"
        :description="
          replaceInstallationName($t('BILLING_SETTINGS.SHOPIFY.DESCRIPTION'))
        "
      />
    </template>
    <template #body>
      <section class="grid gap-4">
        <div
          v-if="isStale"
          class="rounded-xl border border-n-amber-5 bg-n-amber-2 px-5 py-4"
        >
          <p class="text-sm font-medium text-n-amber-12">
            {{ $t('BILLING_SETTINGS.SHOPIFY.STALE_TITLE') }}
          </p>
          <p class="mt-1 text-sm text-n-amber-11">
            {{ $t('BILLING_SETTINGS.SHOPIFY.STALE_DESCRIPTION') }}
          </p>
        </div>

        <div
          v-if="hasError && !summary"
          class="rounded-xl border border-n-weak bg-n-solid-2 px-5 py-8 text-center"
        >
          <p class="text-base font-medium text-n-slate-12">
            {{ $t('BILLING_SETTINGS.SHOPIFY.ERROR_TITLE') }}
          </p>
          <p class="mt-1 text-sm text-n-slate-11">
            {{ $t('BILLING_SETTINGS.SHOPIFY.ERROR_DESCRIPTION') }}
          </p>
          <Button class="mt-4" size="sm" @click="loadSummary">
            {{ $t('BILLING_SETTINGS.SHOPIFY.RETRY') }}
          </Button>
        </div>

        <BillingCard
          v-else-if="summary"
          :title="$t('BILLING_SETTINGS.SHOPIFY.PLAN_TITLE')"
          :description="
            replaceInstallationName(
              $t('BILLING_SETTINGS.SHOPIFY.PLAN_DESCRIPTION')
            )
          "
        >
          <template #action>
            <Button
              v-if="canManageSubscription"
              size="sm"
              :disabled="isRefreshing"
              @click="manageSubscription"
            >
              <Spinner v-if="isRefreshing" class="size-4 flex-shrink-0" />
              {{ actionLabel }}
            </Button>
          </template>

          <div
            class="grid grid-cols-1 gap-2 divide-x divide-n-weak sm:grid-cols-2 lg:grid-cols-4"
          >
            <DetailItem
              :label="$t('BILLING_SETTINGS.SHOPIFY.CURRENT_PLAN')"
              :value="summary.plan?.name || statusLabel"
            />
            <DetailItem
              :label="$t('BILLING_SETTINGS.SHOPIFY.SUBSCRIPTION_STATUS')"
              :value="statusLabel"
            />
            <DetailItem
              v-if="formattedRecurringPrice"
              :label="$t('BILLING_SETTINGS.SHOPIFY.PRICE')"
              :value="formattedRecurringPrice"
            />
            <DetailItem
              v-if="billingDate"
              :label="billingDate.label"
              :value="billingDate.value"
            />
            <DetailItem
              v-if="lastVerifiedAt"
              :label="$t('BILLING_SETTINGS.SHOPIFY.LAST_VERIFIED')"
              :value="lastVerifiedAt"
            />
          </div>
        </BillingCard>
      </section>
    </template>
  </SettingsLayout>
</template>
