import { mount } from '@vue/test-utils';
import ImportDetailHeader from '../components/ImportDetailHeader.vue';

vi.mock('vue-i18n', () => ({
  useI18n: () => ({ t: key => key }),
}));

const BaseSettingsHeaderStub = {
  template: `
    <section>
      <slot name="title" />
      <slot name="description" />
    </section>
  `,
};

const mountHeader = props =>
  mount(ImportDetailHeader, {
    props,
    global: {
      stubs: {
        BaseSettingsHeader: BaseSettingsHeaderStub,
        Icon: true,
        Spinner: true,
      },
      mocks: {
        $t: key => key,
      },
    },
  });

describe('ImportDetailHeader', () => {
  const activeImport = {
    id: 1,
    name: 'Intercom import',
    data_type: 'intercom',
    source_provider: 'intercom',
    status: 'processing',
    stalled: true,
  };

  it('shows Retry between Refresh and Abandon for stalled imports', async () => {
    const wrapper = mountHeader({ dataImport: activeImport });
    const buttons = wrapper.findAll('button');

    expect(buttons.map(button => button.text())).toEqual([
      '',
      'DATA_IMPORTS.TABLE.RETRY',
      'DATA_IMPORTS.TABLE.ABANDON',
    ]);
    expect(buttons[0].attributes('aria-label')).toBe(
      'DATA_IMPORTS.MONITOR.REFRESH'
    );

    await buttons[1].trigger('click');

    expect(wrapper.emitted('retry')).toHaveLength(1);
  });

  it('hides Retry when the server does not report the import as stalled', () => {
    const wrapper = mountHeader({
      dataImport: { ...activeImport, stalled: false },
    });

    expect(
      wrapper
        .findAll('button')
        .some(button => button.text() === 'DATA_IMPORTS.TABLE.RETRY')
    ).toBe(false);
  });
});
