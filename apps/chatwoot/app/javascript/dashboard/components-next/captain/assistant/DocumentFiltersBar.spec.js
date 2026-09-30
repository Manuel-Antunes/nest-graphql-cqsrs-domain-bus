import { mount } from '@vue/test-utils';
import DocumentFiltersBar from './DocumentFiltersBar.vue';

const { checkPermissions } = vi.hoisted(() => ({
  checkPermissions: vi.fn(() => true),
}));

vi.mock('dashboard/composables/usePolicy', () => ({
  usePolicy: () => ({ checkPermissions }),
}));

vi.mock('vue-i18n', () => ({
  useI18n: () => ({
    t: key => key.split('.').at(-1).replaceAll('_', ' '),
  }),
}));

const PassThroughStub = { template: '<div><slot /></div>' };

const DropdownMenuContentStub = {
  template: '<div data-test="dropdown-menu"><slot /></div>',
};

const DropdownMenuItemStub = {
  emits: ['select'],
  template:
    '<div data-test="menu-item" @click="$emit(\'select\')"><slot /></div>',
};

const IconStub = {
  props: ['icon'],
  template: '<i :data-icon="icon" />',
};

const mountFilterBar = () =>
  mount(DocumentFiltersBar, {
    global: {
      stubs: {
        Button: PassThroughStub,
        DropdownMenu: PassThroughStub,
        DropdownMenuTrigger: PassThroughStub,
        DropdownMenuContent: DropdownMenuContentStub,
        DropdownMenuItem: DropdownMenuItemStub,
        Icon: IconStub,
      },
    },
  });

const sortMenu = wrapper =>
  wrapper.findAll('[data-test="dropdown-menu"]').at(-1);

describe('DocumentFiltersBar', () => {
  beforeEach(() => {
    checkPermissions.mockReturnValue(true);
  });

  it('sorts documents by conversation usage from the existing sort menu', async () => {
    const wrapper = mountFilterBar();
    const mostUsed = sortMenu(wrapper)
      .findAll('[data-test="menu-item"]')
      .find(item => item.text() === 'MOST USED');

    expect(mostUsed).toBeDefined();
    expect(
      mostUsed.find('[data-icon="i-lucide-messages-square"]').exists()
    ).toBe(true);

    await mostUsed.trigger('click');
    expect(wrapper.emitted('selectSort')).toEqual([['most_used']]);
  });

  it('hides conversation usage sorting from agents', () => {
    checkPermissions.mockReturnValue(false);
    const wrapper = mountFilterBar();
    const labels = sortMenu(wrapper)
      .findAll('[data-test="menu-item"]')
      .map(item => item.text());

    expect(labels).not.toContain('MOST USED');
  });
});
