import { defineComponent, h } from 'vue';
import { createStore } from 'vuex';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useAccount } from '../useAccount';
import { usePage } from '@inertiajs/vue3';
import { mount } from '@vue/test-utils';

const store = createStore({
  modules: {
    auth: {
      namespaced: false,
      getters: {
        getCurrentAccountId: () => 1,
        getCurrentUser: () => ({
          accounts: [
            { id: 1, name: 'Chatwoot', role: 'administrator' },
            { id: 2, name: 'GitX', role: 'agent' },
          ],
        }),
      },
    },
    accounts: {
      namespaced: true,
      getters: {
        getAccount: () => id => ({ id, name: 'Chatwoot' }),
      },
    },
  },
});

const mountParams = {
  global: {
    plugins: [store],
  },
};

vi.mock('@inertiajs/vue3', () => ({ usePage: vi.fn() }));

describe('useAccount', () => {
  beforeEach(() => {
    usePage.mockReturnValue({
      props: {},
      url: '/app/accounts/123/dashboard',
    });
  });

  const createComponent = () =>
    defineComponent({
      setup() {
        return useAccount();
      },
      render() {
        return h('div'); // Dummy render to satisfy mount
      },
    });

  it('returns accountId as a computed property', () => {
    const wrapper = mount(createComponent(), mountParams);
    const { accountId } = wrapper.vm;
    expect(accountId).toBe(123);
  });

  it('generates account-scoped URLs correctly', () => {
    const wrapper = mount(createComponent(), mountParams);
    const { accountScopedUrl } = wrapper.vm;
    const result = accountScopedUrl('settings/inbox/new');
    expect(result).toBe('/app/accounts/123/settings/inbox/new');
  });

  it('handles URLs with leading slash', () => {
    const wrapper = mount(createComponent(), mountParams);
    const { accountScopedUrl } = wrapper.vm;
    const result = accountScopedUrl('users');
    expect(result).toBe('/app/accounts/123/users'); // Ensures no double slashes
  });

  it('handles empty URL', () => {
    const wrapper = mount(createComponent(), mountParams);
    const { accountScopedUrl } = wrapper.vm;
    const result = accountScopedUrl('');
    expect(result).toBe('/app/accounts/123/');
  });

  it('returns current account based on accountId', () => {
    const wrapper = mount(createComponent(), mountParams);
    const { currentAccount } = wrapper.vm;
    expect(currentAccount).toEqual({ id: 123, name: 'Chatwoot' });
  });

  it('returns an account-scoped route', () => {
    const wrapper = mount(createComponent(), mountParams);
    const { accountScopedRoute } = wrapper.vm;
    const result = accountScopedRoute('accountDetail', { userId: 456 }, {});
    expect(result).toEqual({
      name: 'accountDetail',
      params: { accountId: 123, userId: 456 },
      query: {},
    });
  });

  it('prefers the account the backend shares over the URL', () => {
    usePage.mockReturnValueOnce({
      props: { account: { id: '7' } },
      url: '/app/accounts/123/dashboard',
    });

    const wrapper = mount(createComponent(), mountParams);
    const { accountId } = wrapper.vm;
    expect(accountId).toBe(7);
  });

  it('exposes no vue-router route', () => {
    const wrapper = mount(createComponent(), mountParams);
    const { route } = wrapper.vm;
    expect(route).toBeUndefined();
  });

  it('handles non-numeric accountId gracefully', async () => {
    usePage.mockReturnValueOnce({
      props: {},
      url: '/app/accounts/abc/dashboard',
    });

    const wrapper = mount(createComponent(), mountParams);
    const { accountId } = wrapper.vm;
    expect(accountId).toBeNaN(); // Handles invalid numeric conversion
  });
});
