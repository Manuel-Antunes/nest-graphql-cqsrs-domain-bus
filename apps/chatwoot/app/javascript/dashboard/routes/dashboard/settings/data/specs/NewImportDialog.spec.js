import { flushPromises, mount } from '@vue/test-utils';
import { nextTick } from 'vue';
import DataImportsAPI from 'dashboard/api/dataImports';
import NewImportDialog from '../NewImportDialog.vue';

vi.mock('dashboard/api/dataImports', () => ({
  default: {
    validateSource: vi.fn(),
    create: vi.fn(),
  },
}));

vi.mock('dashboard/composables', () => ({
  useAlert: vi.fn(),
}));

vi.mock('vue-i18n', () => ({
  useI18n: () => ({ t: key => key }),
}));

const SlotStub = { template: '<div><slot /></div>' };

const NativeSelectStub = {
  props: ['modelValue', 'options'],
  emits: ['update:modelValue'],
  template: `
    <select :value="modelValue" @change="$emit('update:modelValue', $event.target.value)">
      <option v-for="option in options" :key="option.value" :value="option.value">
        {{ option.label }}
      </option>
    </select>
  `,
};

const mountDialog = () =>
  mount(NewImportDialog, {
    props: { show: true },
    global: {
      stubs: {
        Dialog: SlotStub,
        DialogContent: SlotStub,
        DialogHeader: SlotStub,
        DialogTitle: SlotStub,
        DialogFooter: SlotStub,
        DialogClose: SlotStub,
        Checkbox: true,
        Spinner: true,
        Select: NativeSelectStub,
      },
      mocks: {
        $t: key => key,
      },
    },
  });

describe('NewImportDialog', () => {
  beforeEach(() => {
    DataImportsAPI.validateSource.mockResolvedValue({
      data: { valid: true, totals: {} },
    });
    DataImportsAPI.create.mockResolvedValue({ data: { id: 42 } });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('validates and creates a Freshdesk import with its domain', async () => {
    const wrapper = mountDialog();
    await wrapper.find('select').setValue('freshdesk');
    await nextTick();

    const domainInput = wrapper.find(
      'input[placeholder="DATA_IMPORTS.DRAWER.FRESHDESK_DOMAIN_PLACEHOLDER"]'
    );
    const apiKeyInput = wrapper.find(
      'input[placeholder="DATA_IMPORTS.DRAWER.FRESHDESK_API_KEY_PLACEHOLDER"]'
    );
    await domainInput.setValue('acme.freshdesk.com');
    await apiKeyInput.setValue(' freshdesk-api-key ');
    await apiKeyInput.trigger('blur');
    await flushPromises();

    expect(DataImportsAPI.validateSource).toHaveBeenCalledWith({
      source_provider: 'freshdesk',
      domain: 'acme.freshdesk.com',
      access_token: 'freshdesk-api-key',
      import_types: ['contacts', 'conversations'],
    });

    const submitButton = wrapper.find('button[type="submit"]');
    expect(submitButton.attributes('disabled')).toBeUndefined();

    await wrapper.find('form').trigger('submit');
    await flushPromises();

    expect(DataImportsAPI.create).toHaveBeenCalledWith({
      source_provider: 'freshdesk',
      domain: 'acme.freshdesk.com',
      access_token: 'freshdesk-api-key',
      import_types: ['contacts', 'conversations'],
      name: 'DATA_IMPORTS.DEFAULT_IMPORT_NAMES.FRESHDESK',
    });
    expect(wrapper.emitted('created')).toEqual([[42]]);
  });
});
