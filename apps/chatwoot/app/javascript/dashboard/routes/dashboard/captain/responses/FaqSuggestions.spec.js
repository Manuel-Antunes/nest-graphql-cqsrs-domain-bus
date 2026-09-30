import { flushPromises, shallowMount } from '@vue/test-utils';
import FaqSuggestions from './FaqSuggestions.vue';

const mocks = vi.hoisted(() => ({
  apiGet: vi.fn(),
  dispatch: vi.fn(),
  params: null,
  getterValues: null,
}));

vi.mock('dashboard/api/captain/faqSuggestions', () => ({
  default: { get: mocks.apiGet },
}));

vi.mock('dashboard/composables/store', async () => {
  const { ref } = await import('vue');
  mocks.getterValues = {
    'captainFaqSuggestions/getRecords': ref([]),
    'captainFaqSuggestions/getMeta': ref({ totalCount: 0, page: 1 }),
    'captainFaqSuggestions/getUIFlags': ref({
      fetchingList: false,
      updatingItem: false,
      deletingItem: false,
    }),
  };

  return {
    useStore: () => ({ dispatch: mocks.dispatch }),
    useMapGetter: key => mocks.getterValues[key],
  };
});

vi.mock('dashboard/composables', () => ({ useAlert: vi.fn() }));

vi.mock('vue-i18n', () => ({
  useI18n: () => ({ t: key => key }),
}));

vi.mock('dashboard/composables/useAppNavigation', async () => {
  const { computed, reactive } = await import('vue');
  mocks.params = reactive({ accountId: 1, assistantId: 1 });

  return {
    useAppNavigation: () => ({
      currentParams: computed(() => mocks.params),
      visit: vi.fn(),
    }),
  };
});

const deferred = () => {
  let resolve;
  let reject;
  const promise = new Promise((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
};

const PageLayoutStub = {
  template: '<div><slot name="body" /></div>',
};

const FaqSuggestionCardStub = {
  props: ['suggestion'],
  template: '<div>{{ suggestion.question }}</div>',
};

describe('FaqSuggestions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.params.assistantId = 1;
    window.history.replaceState(window.history.state, '', '/');
    mocks.getterValues['captainFaqSuggestions/getRecords'].value = [];
    mocks.getterValues['captainFaqSuggestions/getMeta'].value = {
      totalCount: 0,
      page: 1,
    };
    mocks.dispatch.mockImplementation((action, payload) => {
      if (action !== 'captainFaqSuggestions/setRecords') return;

      mocks.getterValues['captainFaqSuggestions/getRecords'].value =
        payload.records;
      mocks.getterValues['captainFaqSuggestions/getMeta'].value = {
        totalCount: payload.meta.total_count,
        page: payload.meta.page,
      };
    });
  });

  it('keeps the latest assistant results when an older request is superseded', async () => {
    const firstRequest = deferred();
    const secondRequest = deferred();
    const queued = [firstRequest, secondRequest];

    mocks.apiGet.mockImplementation(({ signal }) => {
      const request = queued.shift();
      signal.addEventListener('abort', () => {
        const error = new Error('canceled');
        error.name = 'CanceledError';
        request.reject(error);
      });
      return request.promise;
    });

    const wrapper = shallowMount(FaqSuggestions, {
      global: {
        mocks: { $t: key => key },
        stubs: {
          PageLayout: PageLayoutStub,
          FaqSuggestionCard: FaqSuggestionCardStub,
        },
      },
    });

    await flushPromises();
    // Switching assistants aborts the first request before it resolves.
    mocks.params.assistantId = 2;
    await flushPromises();

    secondRequest.resolve({
      data: {
        payload: [{ id: 2, question: 'Current assistant' }],
        meta: { page: 1, total_count: 1 },
      },
    });
    await flushPromises();

    expect(wrapper.text()).toContain('Current assistant');
    expect(wrapper.text()).not.toContain('Previous assistant');

    wrapper.unmount();
  });
});
