import { mount } from '@vue/test-utils';
import { createStore } from 'vuex';
import { createI18n } from 'vue-i18n';
import UpdateBanner from '../UpdateBanner.vue';

const BannerStub = {
  name: 'Banner',
  props: ['bannerMessage', 'hrefLink', 'hrefLinkText'],
  template: '<div data-test="banner">{{ bannerMessage }}</div>',
};

const mountAs = (currentUser, { appVersion = '4.10.1' } = {}) =>
  mount(UpdateBanner, {
    props: { latestChatwootVersion: '4.18.0' },
    global: {
      plugins: [
        createStore({
          getters: { getCurrentUser: () => currentUser },
          modules: {
            globalConfig: {
              namespaced: true,
              getters: {
                get: () => ({ appVersion, displayManifest: true }),
              },
            },
          },
        }),
        createI18n({
          legacy: false,
          locale: 'en',
          messages: {
            en: {
              GENERAL_SETTINGS: {
                UPDATE_CHATWOOT:
                  'An update {latestChatwootVersion} is available.',
              },
            },
          },
        }),
      ],
      stubs: { Banner: BannerStub },
    },
  });

describe('UpdateBanner', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('tells a super admin of the platform, who can update the installation', () => {
    const wrapper = mountAs({ type: 'SuperAdmin', role: 'administrator' });

    const banner = wrapper.findComponent(BannerStub);
    expect(banner.exists()).toBe(true);
    expect(banner.text()).toBe('An update 4.18.0 is available.');
  });

  it('names no product and links nowhere', () => {
    const banner = mountAs({ type: 'SuperAdmin' }).findComponent(BannerStub);

    expect(banner.text()).not.toMatch(/chatwoot/i);
    expect(banner.props('hrefLink')).toBeUndefined();
    expect(banner.props('hrefLinkText')).toBeUndefined();
  });

  it('stays hidden from an administrator of an account, who cannot update anything', () => {
    const wrapper = mountAs({ type: 'User', role: 'administrator' });

    expect(wrapper.findComponent(BannerStub).exists()).toBe(false);
  });

  it('stays hidden once the installation runs that version', () => {
    const wrapper = mountAs({ type: 'SuperAdmin' }, { appVersion: '4.18.0' });

    expect(wrapper.findComponent(BannerStub).exists()).toBe(false);
  });
});
