import { flushPromises, shallowMount } from '@vue/test-utils';
import FaqSuggestionReviewDialog from './FaqSuggestionReviewDialog.vue';

const { dispatch, visit, show, uiFlags } = vi.hoisted(() => ({
  dispatch: vi.fn(),
  visit: vi.fn(),
  show: vi.fn(),
  uiFlags: {
    value: {
      fetchingItem: false,
      updatingItem: false,
      deletingItem: false,
    },
  },
}));

vi.mock('dashboard/composables/store', () => ({
  useStore: () => ({ dispatch }),
  useMapGetter: () => uiFlags,
}));

vi.mock('dashboard/api/captain/faqSuggestions', () => ({
  default: { show },
}));

vi.mock('dashboard/composables', () => ({ useAlert: vi.fn() }));

vi.mock('vue-i18n', () => ({
  useI18n: () => ({ t: key => key, locale: { value: 'en' } }),
}));

vi.mock('dashboard/composables/useAppNavigation', () => ({
  useAppNavigation: () => ({ visit }),
}));

const SlotStub = { template: '<div><slot /></div>' };

const Button = {
  name: 'Button',
  props: ['disabled'],
  emits: ['click'],
  template:
    '<button :disabled="disabled" @click="$emit(\'click\')"><slot /></button>',
};

const stubs = {
  Button,
  Dialog: SlotStub,
  DialogContent: SlotStub,
  DialogTitle: SlotStub,
  DialogDescription: SlotStub,
  DialogFooter: SlotStub,
};

const buttonLabel = button => button.text().trim();

describe('FaqSuggestionReviewDialog', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    uiFlags.value.updatingItem = false;
    uiFlags.value.deletingItem = false;
  });

  it('keeps a visible error when source conversations fail to load', async () => {
    show.mockRejectedValueOnce(new Error('Request failed'));

    const wrapper = shallowMount(FaqSuggestionReviewDialog, {
      props: {
        suggestion: {
          id: 1,
          question: 'How do I enable the feature?',
          answer: 'Turn it on in settings.',
          source_count: 2,
          assistant: { name: 'Support assistant' },
          language: 'en',
        },
      },
      global: {
        mocks: { $t: key => key },
        stubs,
      },
    });

    await flushPromises();

    expect(wrapper.get('[role="alert"]').text()).toContain(
      'CAPTAIN.FAQ_SUGGESTIONS.ERRORS.LOAD_DETAILS'
    );
    expect(wrapper.text()).not.toContain(
      'CAPTAIN.FAQ_SUGGESTIONS.DETAILS.NO_SOURCES'
    );
  });

  it('opens source conversations using their display ID', async () => {
    show.mockResolvedValueOnce({
      data: {
        observations: [
          {
            id: 1,
            generated_question: 'How do I enable the feature?',
            created_at: 1,
            conversation: { id: 99, display_id: 42 },
          },
        ],
      },
    });

    const wrapper = shallowMount(FaqSuggestionReviewDialog, {
      props: {
        suggestion: {
          id: 1,
          question: 'How do I enable the feature?',
          answer: 'Turn it on in settings.',
          source_count: 1,
          assistant: { name: 'Support assistant' },
          language: 'en',
        },
      },
      global: {
        mocks: { $t: key => key },
        stubs,
      },
    });

    await flushPromises();
    await wrapper.get('section button').trigger('click');

    expect(visit).toHaveBeenCalledWith({
      name: 'inbox_conversation',
      params: { conversation_id: 42 },
    });
  });

  it('shows the review actions to users who can open the page', async () => {
    show.mockResolvedValueOnce({ data: { observations: [] } });

    const wrapper = shallowMount(FaqSuggestionReviewDialog, {
      props: {
        suggestion: {
          id: 1,
          question: 'How do I enable the feature?',
          answer: 'Turn it on in settings.',
          source_count: 1,
          assistant: { name: 'Support assistant' },
          language: 'en',
        },
      },
      global: {
        mocks: { $t: key => key },
        stubs,
      },
    });

    await flushPromises();

    expect(wrapper.findAllComponents(Button).map(buttonLabel)).toEqual(
      expect.arrayContaining([
        'CAPTAIN.FAQ_SUGGESTIONS.DISMISS',
        'CAPTAIN.FAQ_SUGGESTIONS.SAVE',
        'CAPTAIN.FAQ_SUGGESTIONS.APPROVE_FAQ',
      ])
    );
  });

  it('disables review actions while source conversations are loading', async () => {
    let resolveRequest;
    show.mockReturnValueOnce(
      new Promise(resolve => {
        resolveRequest = resolve;
      })
    );

    const wrapper = shallowMount(FaqSuggestionReviewDialog, {
      props: {
        suggestion: {
          id: 1,
          question: 'How do I enable the feature?',
          answer: 'Turn it on in settings.',
          source_count: 1,
          assistant: { name: 'Support assistant' },
          language: 'en',
        },
      },
      global: {
        mocks: { $t: key => key },
        stubs,
      },
    });
    await flushPromises();

    const actionButtons = wrapper
      .findAllComponents(Button)
      .filter(button =>
        [
          'CAPTAIN.FAQ_SUGGESTIONS.DISMISS',
          'CAPTAIN.FAQ_SUGGESTIONS.SAVE',
          'CAPTAIN.FAQ_SUGGESTIONS.APPROVE_FAQ',
        ].includes(buttonLabel(button))
      );

    expect(actionButtons).toHaveLength(3);
    expect(
      actionButtons.map(button => ({
        label: buttonLabel(button),
        disabled: button.element.hasAttribute('disabled'),
      }))
    ).toEqual([
      {
        label: 'CAPTAIN.FAQ_SUGGESTIONS.DISMISS',
        disabled: true,
      },
      {
        label: 'CAPTAIN.FAQ_SUGGESTIONS.SAVE',
        disabled: true,
      },
      {
        label: 'CAPTAIN.FAQ_SUGGESTIONS.APPROVE_FAQ',
        disabled: true,
      },
    ]);

    resolveRequest({ data: { observations: [] } });
    await flushPromises();

    const enabledActionButtons = wrapper
      .findAllComponents(Button)
      .filter(button =>
        [
          'CAPTAIN.FAQ_SUGGESTIONS.DISMISS',
          'CAPTAIN.FAQ_SUGGESTIONS.SAVE',
          'CAPTAIN.FAQ_SUGGESTIONS.APPROVE_FAQ',
        ].includes(buttonLabel(button))
      );

    expect(
      enabledActionButtons.map(button =>
        button.element.hasAttribute('disabled')
      )
    ).toEqual([false, false, false]);
  });
});
