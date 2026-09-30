import { flushPromises, mount } from '@vue/test-utils';
import { createStore } from 'vuex';
import { createPinia, setActivePinia } from 'pinia';
import { createI18n } from 'vue-i18n';
import ReconnectService from 'dashboard/helper/ReconnectService';
import { setupThemeSync } from 'dashboard/helper/themeHelper';
import { useCallsStore } from 'dashboard/stores/calls';
import AppShell from '../AppShell.vue';

const { shell, stubOf } = vi.hoisted(() => ({
  shell: { upgradePage: false },
  stubOf: (name, props = []) => ({
    __esModule: true,
    default: {
      name,
      props,
      emits: ['openKeyShortcutModal', 'closeKeyShortcutModal'],
      template: `<div data-test="${name}"><slot /></div>`,
    },
  }),
}));

vi.mock('@inertiajs/vue3', () => ({
  usePage: () => ({ url: '/app/accounts/1/dashboard', props: {} }),
  router: { visit: vi.fn() },
}));
vi.mock('dashboard/helper/actionCable', () => ({ default: { init: vi.fn() } }));
vi.mock('dashboard/helper/ReconnectService', () => ({ default: vi.fn() }));
vi.mock('dashboard/helper/themeHelper', () => ({ setupThemeSync: vi.fn() }));
vi.mock('next/ui/sonner', () => ({
  Toaster: { name: 'Toaster', template: '<div />' },
}));
vi.mock('next/sidebar/Sidebar.vue', () => stubOf('NextSidebar'));
vi.mock('dashboard/components-next/sidebar/MobileSidebarLauncher.vue', () =>
  stubOf('MobileSidebarLauncher')
);
vi.mock('dashboard/components/app/UpdateBanner.vue', () =>
  stubOf('UpdateBanner', ['latestChatwootVersion'])
);
vi.mock('dashboard/components/app/PaymentPendingBanner.vue', () =>
  stubOf('PaymentPendingBanner')
);
vi.mock('dashboard/components/app/StatusBanner.vue', () =>
  stubOf('StatusBanner')
);
vi.mock('dashboard/components/app/LowBackupCodesBanner.vue', () =>
  stubOf('LowBackupCodesBanner')
);
vi.mock('dashboard/components/app/PendingEmailVerificationBanner.vue', () =>
  stubOf('PendingEmailVerificationBanner')
);
vi.mock('dashboard/components/NetworkNotification.vue', () =>
  stubOf('NetworkNotification')
);
vi.mock('dashboard/components/widgets/modal/WootKeyShortcutModal.vue', () =>
  stubOf('WootKeyShortcutModal', ['show'])
);
vi.mock('dashboard/components-next/copilot/CopilotLauncher.vue', () =>
  stubOf('CopilotLauncher')
);
vi.mock('dashboard/components/copilot/CopilotContainer.vue', () =>
  stubOf('CopilotContainer')
);
vi.mock('dashboard/routes/dashboard/commands/commandbar.vue', () =>
  stubOf('CommandBar', ['isPaywalled'])
);
vi.mock('dashboard/components-next/call/FloatingCallWidget.vue', () =>
  stubOf('FloatingCallWidget')
);
vi.mock('dashboard/routes/dashboard/upgrade/UpgradePage.vue', () => ({
  default: {
    name: 'UpgradePage',
    props: ['bypassUpgradePage'],
    setup(_, { expose }) {
      expose({
        shouldShowUpgradePage: shell.upgradePage,
        isAccountPaywalled: shell.upgradePage,
      });
    },
    template: '<div data-test="UpgradePage"><slot /></div>',
  },
}));

describe('AppShell', () => {
  let store;
  let pinia;

  const mountShell = async () => {
    const wrapper = mount(AppShell, {
      slots: { default: '<div data-test="page" />' },
      global: {
        plugins: [
          store,
          pinia,
          createI18n({ legacy: false, locale: 'en', messages: { en: {} } }),
        ],
      },
    });
    await flushPromises();
    await flushPromises();
    return wrapper;
  };

  const has = (wrapper, name) => wrapper.find(`[data-test="${name}"]`).exists();

  beforeEach(() => {
    shell.upgradePage = false;
    window.history.pushState({}, '', '/app/accounts/1/dashboard');
    setupThemeSync.mockReturnValue(() => {});
    pinia = createPinia();
    setActivePinia(pinia);
    store = createStore({
      getters: { getCurrentUser: () => ({ pubsub_token: 'pubsub' }) },
      actions: { setUser: () => {}, setActiveAccount: () => {} },
      modules: {
        accounts: {
          namespaced: true,
          getters: {
            isRTL: () => false,
            getAccount: () => id =>
              id === 1 ? { id, latest_chatwoot_version: '4.18.0' } : null,
          },
          actions: { get: () => {} },
        },
      },
    });
  });

  it('mounts around the page everything the dashboard shell had', async () => {
    const wrapper = await mountShell();

    [
      'page',
      'NextSidebar',
      'UpdateBanner',
      'PendingEmailVerificationBanner',
      'PaymentPendingBanner',
      'StatusBanner',
      'LowBackupCodesBanner',
      'CommandBar',
      'CopilotLauncher',
      'CopilotContainer',
      'WootKeyShortcutModal',
      'NetworkNotification',
      'UpgradePage',
    ].forEach(piece => expect(has(wrapper, piece), piece).toBe(true));
  });

  it("hands the update banner the account's latest known version", async () => {
    const wrapper = await mountShell();

    expect(
      wrapper
        .findComponent({ name: 'UpdateBanner' })
        .props('latestChatwootVersion')
    ).toBe('4.18.0');
  });

  it('opens and closes the keyboard shortcuts when the sidebar asks', async () => {
    const wrapper = await mountShell();
    const sidebar = wrapper.findComponent({ name: 'NextSidebar' });
    const shortcuts = () =>
      wrapper.findComponent({ name: 'WootKeyShortcutModal' }).props('show');

    expect(shortcuts()).toBe(false);
    await sidebar.vm.$emit('openKeyShortcutModal');
    expect(shortcuts()).toBe(true);
    await sidebar.vm.$emit('closeKeyShortcutModal');
    expect(shortcuts()).toBe(false);
  });

  it('reconnects against the route Inertia is showing', async () => {
    await mountShell();

    expect(ReconnectService).toHaveBeenCalledTimes(1);
    const [givenStore, { currentRoute }] = ReconnectService.mock.calls[0];
    expect(givenStore).toBe(store);
    expect(currentRoute.value).toEqual({
      name: 'home',
      params: { accountId: '1' },
    });
  });

  it('shows the call widget only while a call is ringing or active', async () => {
    const wrapper = await mountShell();
    expect(has(wrapper, 'FloatingCallWidget')).toBe(false);

    useCallsStore().addCall({ callSid: 'CA1', conversationId: 7 });
    await flushPromises();

    expect(has(wrapper, 'FloatingCallWidget')).toBe(true);
  });

  it('puts the upgrade page in place of the page when the account must upgrade', async () => {
    shell.upgradePage = true;

    const wrapper = await mountShell();

    expect(has(wrapper, 'page')).toBe(false);
    expect(has(wrapper, 'UpgradePage')).toBe(true);
    expect(
      wrapper.findComponent({ name: 'CommandBar' }).props('isPaywalled'),
      'Cmd+K stays, limited to what a paywalled account may reach'
    ).toBe(true);
  });
});
