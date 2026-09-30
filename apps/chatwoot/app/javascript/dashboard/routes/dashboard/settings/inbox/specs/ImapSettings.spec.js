import { nextTick } from 'vue';
import { shallowMount } from '@vue/test-utils';
import { createStore } from 'vuex';
import ImapSettings from '../ImapSettings.vue';

vi.mock('dashboard/composables', () => ({
  useAlert: vi.fn(),
}));

vi.mock('vue-i18n', () => ({
  useI18n: () => ({ t: key => key }),
}));

const FormStub = {
  name: 'Form',
  emits: ['submit'],
  methods: {
    setValues: vi.fn(),
  },
  template:
    '<form><slot :values="{ isIMAPEnabled: false }" :meta="{ valid: true }" /></form>',
};

describe('ImapSettings', () => {
  it('disables IMAP without changing the SMTP configuration', async () => {
    const updateInboxIMAP = vi.fn();
    const wrapper = shallowMount(ImapSettings, {
      props: {
        inbox: {
          id: 1,
          imap_enabled: true,
          smtp_enabled: true,
          imap_address: 'imap.example.com',
          imap_port: 993,
          imap_login: 'support@example.com',
          imap_password: 'password',
          imap_enable_ssl: true,
          imap_authentication: 'plain',
        },
      },
      global: {
        plugins: [
          createStore({
            getters: {
              'inboxes/getUIFlags': () => ({ isUpdatingIMAP: false }),
            },
            actions: {
              'inboxes/updateInboxIMAP': updateInboxIMAP,
            },
          }),
        ],
        mocks: { $t: key => key },
        stubs: {
          Form: FormStub,
          SettingsFieldSection: {
            template: '<section><slot /></section>',
          },
        },
      },
    });

    await nextTick();
    wrapper.findComponent(FormStub).vm.$emit('submit', {
      isIMAPEnabled: false,
      address: 'imap.example.com',
      port: 993,
      login: 'support@example.com',
      password: 'password',
      isSSLEnabled: true,
    });
    await nextTick();

    expect(updateInboxIMAP).toHaveBeenCalledOnce();
    expect(updateInboxIMAP.mock.calls[0][1]).toEqual({
      id: 1,
      formData: false,
      channel: {
        imap_enabled: false,
        imap_address: 'imap.example.com',
        imap_port: 993,
        imap_login: 'support@example.com',
        imap_password: 'password',
        imap_enable_ssl: true,
        imap_authentication: 'plain',
      },
    });
  });
});
