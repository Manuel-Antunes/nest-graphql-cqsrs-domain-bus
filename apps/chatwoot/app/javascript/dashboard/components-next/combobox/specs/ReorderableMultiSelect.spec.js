import { mount } from '@vue/test-utils';
import { h } from 'vue';
import ReorderableMultiSelect from '../ReorderableMultiSelect.vue';

const OPTIONS = [
  { value: 1, label: 'Getting started', subtitle: 'Guides' },
  { value: 2, label: 'Billing', subtitle: 'Payments' },
  { value: 3, label: 'Security' },
  { value: 4, label: 'API', icon: '🔌', iconColor: '#000' },
];

const PopoverStub = {
  name: 'Popover',
  props: ['open'],
  emits: ['update:open'],
  template: '<div><slot /></div>',
};

const PassThroughStub = { template: '<div><slot /></div>' };

const SearchInputStub = {
  name: 'InputGroupInput',
  props: ['modelValue', 'placeholder'],
  emits: ['update:modelValue'],
  template: '<input :value="modelValue" />',
};

const ButtonStub = {
  name: 'Button',
  props: ['disabled'],
  emits: ['click'],
  template:
    '<button :disabled="disabled" @click="$emit(\'click\')"><slot /></button>',
};

const mountSelect = (props = {}, slots = {}) =>
  mount(ReorderableMultiSelect, {
    props: { options: OPTIONS, max: 3, ...props },
    slots,
    global: {
      stubs: {
        Button: ButtonStub,
        Popover: PopoverStub,
        PopoverTrigger: PassThroughStub,
        PopoverContent: PassThroughStub,
        InputGroup: PassThroughStub,
        InputGroupAddon: PassThroughStub,
        InputGroupInput: SearchInputStub,
        Spinner: true,
        Icon: true,
        EmojiIcon: true,
      },
    },
  });

const popover = wrapper => wrapper.findComponent(PopoverStub);
const openDropdown = async wrapper => {
  popover(wrapper).vm.$emit('update:open', true);
  await wrapper.vm.$nextTick();
};
const searchFor = async (wrapper, value) => {
  wrapper.findComponent(SearchInputStub).vm.$emit('update:modelValue', value);
  await wrapper.vm.$nextTick();
};
const optionItems = wrapper => wrapper.findAll('li[role="option"]');
const optionLabels = wrapper => optionItems(wrapper).map(item => item.text());
const addTrigger = wrapper =>
  wrapper
    .findAll('button')
    .find(button => !button.element.closest('[draggable="true"]'));
const removeButtons = wrapper => wrapper.findAll('[draggable="true"] button');
const rows = wrapper => wrapper.findAll('[draggable="true"]');
const lastModel = wrapper => wrapper.emitted('update:modelValue')?.at(-1)?.[0];

describe('ReorderableMultiSelect', () => {
  describe('rendering selected rows', () => {
    it('renders rows in model order with labels resolved from options', () => {
      const wrapper = mountSelect({ modelValue: [2, 1] });

      const labels = rows(wrapper).map(row => row.find('p').text());
      expect(labels).toEqual(['Billing', 'Getting started']);
    });

    it('falls back to the stringified id when an option is unknown', () => {
      const wrapper = mountSelect({ modelValue: [99] });

      expect(rows(wrapper)[0].find('p').text()).toBe('99');
    });

    it('renders the progress dots filled up to the selection count', () => {
      const wrapper = mountSelect({
        modelValue: [1, 2],
        max: 3,
        label: 'Tags',
      });

      const filled = wrapper.findAll('.bg-n-brand').length;
      expect(filled).toBe(2);
    });

    it('exposes remaining and max to the counter slot', () => {
      const wrapper = mountSelect(
        { modelValue: [1], max: 3 },
        { counter: ({ remaining, max }) => h('span', `${remaining}/${max}`) }
      );

      expect(wrapper.text()).toContain('2/3');
    });
  });

  describe('adding options', () => {
    it('appends the chosen option to the model', async () => {
      const wrapper = mountSelect({ modelValue: [1] });

      await optionItems(wrapper)[0].trigger('click');

      expect(lastModel(wrapper)).toEqual([1, 2]);
    });

    it('hides the add trigger once the model reaches max', () => {
      const wrapper = mountSelect({ modelValue: [1, 2], max: 2 });

      expect(addTrigger(wrapper)).toBeUndefined();
      expect(popover(wrapper).exists()).toBe(false);
    });

    it('closes the dropdown when the last slot is filled', async () => {
      const wrapper = mountSelect({ modelValue: [1], max: 2 });
      await openDropdown(wrapper);
      expect(popover(wrapper).props('open')).toBe(true);

      await optionItems(wrapper)[0].trigger('click');

      // Reaching max removes the trigger (and its dropdown) entirely.
      expect(popover(wrapper).exists()).toBe(false);
    });

    it('excludes already-selected options from the dropdown', () => {
      const wrapper = mountSelect({ modelValue: [1] });

      expect(optionLabels(wrapper)).toEqual(['Billing', 'Security', 'API']);
    });
  });

  describe('removing options', () => {
    it('removes the clicked item from the model', async () => {
      const wrapper = mountSelect({ modelValue: [1, 2, 3] });

      await removeButtons(wrapper)[1].trigger('click');

      expect(lastModel(wrapper)).toEqual([1, 3]);
    });
  });

  describe('searching', () => {
    it('filters options locally by label', async () => {
      const wrapper = mountSelect({ modelValue: [] });

      await searchFor(wrapper, 'bill');

      expect(optionLabels(wrapper)).toEqual(['Billing']);
    });

    it('emits search and skips local filtering when serverSearch is set', async () => {
      const wrapper = mountSelect({ modelValue: [], serverSearch: true });

      await searchFor(wrapper, 'bill');

      expect(wrapper.emitted('search').at(-1)).toEqual(['bill']);
      // All unselected options remain; the parent owns filtering.
      expect(optionItems(wrapper)).toHaveLength(4);
    });

    it('emits an empty search when the trigger opens', async () => {
      const wrapper = mountSelect({ modelValue: [1] });

      await openDropdown(wrapper);

      expect(wrapper.emitted('search').at(-1)).toEqual(['']);
      expect(popover(wrapper).props('open')).toBe(true);
    });
  });

  describe('reordering', () => {
    it('moves a row to the dropped position within the model', async () => {
      const wrapper = mountSelect({ modelValue: [1, 2, 3] });

      await rows(wrapper)[0].trigger('dragstart');
      await rows(wrapper)[2].trigger('dragover');

      expect(lastModel(wrapper)).toEqual([2, 3, 1]);
    });
  });

  describe('loading state', () => {
    it('shows skeleton rows when loading a non-empty, closed selection', () => {
      const wrapper = mountSelect({ modelValue: [1, 2], loading: true });

      const skeleton = wrapper.find('[aria-busy="true"]');
      expect(skeleton.exists()).toBe(true);
      expect(skeleton.findAll('.animate-pulse').length).toBeGreaterThan(0);
    });

    it('does not show skeletons when the selection is empty', () => {
      const wrapper = mountSelect({ modelValue: [], loading: true });

      expect(wrapper.find('[aria-busy="true"]').exists()).toBe(false);
    });

    it('shows the real rows, not skeletons, while searching in an open dropdown', async () => {
      // Open first (trigger is enabled), then a live search turns loading on.
      const wrapper = mountSelect({ modelValue: [1, 2] });
      await openDropdown(wrapper);

      await wrapper.setProps({ loading: true });

      expect(wrapper.find('[aria-busy="true"]').exists()).toBe(false);
      expect(rows(wrapper)).toHaveLength(2);
    });

    it('shows a spinner and disables the closed trigger while loading', () => {
      const wrapper = mountSelect({ modelValue: [1], loading: true });

      expect(addTrigger(wrapper).find('spinner-stub').exists()).toBe(true);
      expect(addTrigger(wrapper).attributes('disabled')).toBeDefined();
    });
  });
});
