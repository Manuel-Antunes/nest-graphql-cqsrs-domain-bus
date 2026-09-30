import { mount, flushPromises } from '@vue/test-utils';

import ShopifyBilling from '../ShopifyBilling.vue';
import EnterpriseAccountAPI from 'dashboard/api/enterprise/account';

const mocks = vi.hoisted(() => ({
  dispatch: vi.fn(),
  translate: (key, params) => {
    const translations = {
      'BILLING_SETTINGS.SHOPIFY.DESCRIPTION':
        'Your Chatwoot subscription is billed through Shopify.',
      'BILLING_SETTINGS.SHOPIFY.PLAN_DESCRIPTION':
        'Manage your Chatwoot plan in Shopify.',
    };
    if (params?.price) return `${key}: ${params.price}`;
    return translations[key] || key;
  },
}));

vi.mock('dashboard/composables/useAccount', () => ({
  useAccount: () => ({ accountId: { value: 1 } }),
}));

vi.mock('dashboard/composables/store', () => ({
  useStore: () => ({ dispatch: mocks.dispatch }),
}));

vi.mock('vue-i18n', async importOriginal => {
  const actual = await importOriginal();
  return {
    ...actual,
    useI18n: () => ({ t: mocks.translate }),
  };
});

vi.mock('dashboard/api/enterprise/account', () => ({
  default: {
    billingSummary: vi.fn(),
  },
}));

vi.mock('shared/composables/useBranding', () => ({
  useBranding: () => ({
    replaceInstallationName: text => text.replace(/chatwoot/gi, 'Acme'),
  }),
}));

const summary = {
  provider: 'shopify',
  state: 'active',
  plan: { name: 'Shopify Growth', handle: 'growth' },
  amount: '49.00',
  currency: 'USD',
  billing_period: 'EVERY_30_DAYS',
  trial_ends_at: null,
  current_period_end: '2026-08-29T00:00:00Z',
  allowed_actions: {
    manage_subscription: true,
  },
  last_verified_at: '2026-07-29T08:30:00Z',
};

const SettingsLayoutStub = {
  name: 'SettingsLayout',
  props: ['isLoading', 'loadingMessage'],
  template: '<main><slot name="header" /><slot name="body" /></main>',
};

const BillingCardStub = {
  name: 'BillingCard',
  props: ['title', 'description'],
  template: '<section><slot name="action" /><slot /></section>',
};

const BILLING_PATH = '/app/accounts/1/settings/billing';

const visitBilling = (search = '') => {
  window.history.replaceState({}, '', `${BILLING_PATH}${search}`);
};

const ButtonStub = {
  name: 'Button',
  props: ['disabled'],
  emits: ['click'],
  template: '<button @click="$emit(\'click\')"><slot /></button>',
};

const mountComponent = () =>
  mount(ShopifyBilling, {
    global: {
      mocks: {
        $t: mocks.translate,
      },
      stubs: {
        SettingsLayout: SettingsLayoutStub,
        BillingCard: BillingCardStub,
        BaseSettingsHeader: true,
        DetailItem: {
          name: 'DetailItem',
          props: ['label', 'value'],
          template: '<div>{{ label }}: {{ value }}</div>',
        },
        Button: ButtonStub,
      },
    },
  });

describe('ShopifyBilling', () => {
  beforeEach(() => {
    visitBilling();
    mocks.dispatch.mockReset();
    EnterpriseAccountAPI.billingSummary.mockReset();
  });

  it('renders the normalized Shopify subscription summary', async () => {
    EnterpriseAccountAPI.billingSummary.mockResolvedValue({ data: summary });

    const wrapper = mountComponent();
    await flushPromises();

    expect(EnterpriseAccountAPI.billingSummary).toHaveBeenCalledWith({
      refresh: false,
    });
    expect(EnterpriseAccountAPI.billingSummary).toHaveBeenCalledWith({
      refresh: true,
    });
    expect(mocks.dispatch).toHaveBeenCalledWith('setUser');
    expect(wrapper.text()).toContain('Shopify Growth');
    expect(wrapper.text()).toContain('BILLING_SETTINGS.SHOPIFY.STATUS.ACTIVE');
    expect(wrapper.text()).toContain('$49.00');
    expect(wrapper.text()).toContain(
      'BILLING_SETTINGS.SHOPIFY.PER_MONTH: $49.00'
    );
    expect(wrapper.findComponent(BillingCardStub).props('description')).toBe(
      'Manage your Acme plan in Shopify.'
    );
    expect(wrapper.text()).toContain('BILLING_SETTINGS.SHOPIFY.RENEWS_ON');
  });

  it('labels annual prices with their actual billing period', async () => {
    EnterpriseAccountAPI.billingSummary.mockResolvedValue({
      data: { ...summary, billing_period: 'ANNUAL' },
    });

    const wrapper = mountComponent();
    await flushPromises();

    expect(wrapper.text()).toContain(
      'BILLING_SETTINGS.SHOPIFY.PER_YEAR: $49.00'
    );
    expect(wrapper.text()).not.toContain(
      'BILLING_SETTINGS.SHOPIFY.PER_MONTH: $49.00'
    );
  });

  it('opens Shopify-hosted App Pricing through the provider-aware checkout', async () => {
    EnterpriseAccountAPI.billingSummary.mockResolvedValue({ data: summary });
    const wrapper = mountComponent();
    await flushPromises();

    await wrapper.find('button').trigger('click');

    expect(mocks.dispatch).toHaveBeenCalledWith('accounts/checkout');
  });

  it('refreshes and clears Shopify return parameters after App Pricing', async () => {
    visitBilling('?shop=store.myshopify.com&plan_handle=growth&source=billing');
    EnterpriseAccountAPI.billingSummary
      .mockResolvedValueOnce({ data: { ...summary, state: 'pending' } })
      .mockResolvedValueOnce({ data: summary });

    mountComponent();
    await flushPromises();

    expect(EnterpriseAccountAPI.billingSummary).toHaveBeenNthCalledWith(1, {
      refresh: false,
    });
    expect(EnterpriseAccountAPI.billingSummary).toHaveBeenNthCalledWith(2, {
      refresh: true,
    });
    expect(mocks.dispatch).toHaveBeenCalledWith('setUser');
    expect(mocks.dispatch).toHaveBeenCalledWith('accounts/get', {
      accountId: 1,
    });
    expect(window.location.pathname).toBe(BILLING_PATH);
    expect(window.location.search).toBe('?source=billing');
  });

  it('preserves the last verified summary when a return refresh fails', async () => {
    visitBilling('?plan_handle=growth');
    EnterpriseAccountAPI.billingSummary
      .mockResolvedValueOnce({ data: summary })
      .mockRejectedValueOnce(new Error('Shopify unavailable'));

    const wrapper = mountComponent();
    await flushPromises();

    expect(wrapper.text()).toContain('Shopify Growth');
    expect(wrapper.text()).toContain('BILLING_SETTINGS.SHOPIFY.STALE_TITLE');
    expect(window.location.search).toBe('?plan_handle=growth');
  });

  it('shows an initial error and retries without losing the page', async () => {
    EnterpriseAccountAPI.billingSummary
      .mockRejectedValueOnce(new Error('Shopify unavailable'))
      .mockResolvedValueOnce({ data: summary })
      .mockResolvedValueOnce({ data: summary });

    const wrapper = mountComponent();
    await flushPromises();

    expect(wrapper.text()).toContain('BILLING_SETTINGS.SHOPIFY.ERROR_TITLE');

    await wrapper.find('button').trigger('click');
    await flushPromises();

    expect(EnterpriseAccountAPI.billingSummary).toHaveBeenCalledTimes(3);
    expect(wrapper.text()).toContain('Shopify Growth');
  });

  it('shows the scheduled access end for a cancelled subscription', async () => {
    EnterpriseAccountAPI.billingSummary.mockResolvedValue({
      data: { ...summary, state: 'cancelled' },
    });

    const wrapper = mountComponent();
    await flushPromises();

    expect(wrapper.text()).toContain(
      'BILLING_SETTINGS.SHOPIFY.STATUS.CANCELLED'
    );
    expect(wrapper.text()).toContain('BILLING_SETTINGS.SHOPIFY.ACCESS_UNTIL');
  });

  it('ignores a historical trial date after the trial ends', async () => {
    EnterpriseAccountAPI.billingSummary.mockResolvedValue({
      data: {
        ...summary,
        state: 'active',
        trial_ends_at: '2026-07-01T00:00:00Z',
      },
    });

    const wrapper = mountComponent();
    await flushPromises();

    expect(wrapper.text()).toContain('BILLING_SETTINGS.SHOPIFY.RENEWS_ON');
    expect(wrapper.text()).not.toContain(
      'BILLING_SETTINGS.SHOPIFY.TRIAL_ENDS_ON'
    );
  });
});
