import { flushPromises, mount } from '@vue/test-utils';
import { createStore } from 'vuex';
import { createPinia, setActivePinia } from 'pinia';
import CallsAPI from 'dashboard/api/calls';
import CallsIndex from '../CallsIndex.vue';

vi.mock('dashboard/api/calls', () => ({ default: { get: vi.fn() } }));
vi.mock('@inertiajs/vue3', () => ({
  usePage: () => ({ url: '/app/accounts/1/calls', props: {} }),
  router: { visit: vi.fn() },
  Link: {
    name: 'Link',
    props: ['href'],
    template: '<a :href="href"><slot /></a>',
  },
}));
vi.mock('shared/helpers/timeHelper', async importOriginal => ({
  ...(await importOriginal()),
  relativeDayTimestamp: () => '10:30 AM',
}));

const voiceInbox = {
  id: 3,
  name: 'Support line',
  channel_type: 'Channel::TwilioSms',
  voice_enabled: true,
};

const agent = { id: 7, name: 'Ana Agent', thumbnail: '' };

const missedCall = {
  id: 1,
  status: 'no-answer',
  direction: 'inbound',
  created_at: 1780000000,
  message_id: 55,
  recording_url: null,
  duration_seconds: 0,
  transcript: null,
  conversation: { id: 9, display_id: 12 },
  inbox: {
    id: 3,
    name: 'Support line',
    channel_type: 'Channel::TwilioSms',
    medium: 'sms',
  },
  agent: null,
  contact: { id: 4, name: 'Jane Doe', phone_number: '+15550001', avatar: '' },
};

const answeredCall = {
  ...missedCall,
  id: 2,
  status: 'completed',
  recording_url: 'https://example.com/recording.ogg',
  duration_seconds: 42,
  transcript: 'Hello, I would like to reschedule.',
  agent: { id: 7, name: 'Ana Agent', avatar: '' },
};

const respondWith = (payload, count = payload.length) =>
  CallsAPI.get.mockResolvedValue({
    data: {
      payload,
      meta: { count, current_page: 1, total_pages: 1 },
    },
  });

describe('CallsIndex', () => {
  let pinia;
  let actions;

  const buildStore = ({ role = 'administrator', inboxes = [voiceInbox] }) => {
    actions = { getInboxes: vi.fn(), getAgents: vi.fn() };
    return createStore({
      getters: {
        getCurrentAccountId: () => 1,
        getCurrentUserID: () => 7,
        getCurrentRole: () => role,
      },
      modules: {
        inboxes: {
          namespaced: true,
          getters: { getInboxes: () => inboxes },
          actions: { get: actions.getInboxes },
        },
        agents: {
          namespaced: true,
          getters: { getVerifiedAgents: () => [agent] },
          actions: { get: actions.getAgents },
        },
        accounts: {
          namespaced: true,
          getters: {
            isFeatureEnabledonAccount: () => () => true,
            getUIFlags: () => ({ isFetchingItem: false }),
          },
        },
      },
    });
  };

  const mountPage = async ({ stubs = {}, ...options } = {}) => {
    const wrapper = mount(CallsIndex, {
      global: {
        plugins: [buildStore(options), pinia],
        stubs: { CallRecordingPlayer: true, ...stubs },
      },
    });
    await flushPromises();
    return wrapper;
  };

  beforeEach(() => {
    window.history.pushState({}, '', '/app/accounts/1/calls');
    pinia = createPinia();
    setActivePinia(pinia);
    respondWith([missedCall]);
  });

  it('fetches the first page and renders each call with its status', async () => {
    const wrapper = await mountPage();

    expect(CallsAPI.get).toHaveBeenCalledWith({ page: 1 });

    const row = wrapper.find('[data-call-id="1"]');
    expect(row.text()).toContain('Jane Doe');
    expect(row.find('[data-kind="missed"]').text()).toBe('Missed');
    expect(row.find('[data-test="call-result"]').text()).toBe(
      'No agent answered this call'
    );
    expect(row.text()).toContain('Support line');
    expect(row.find('[data-test="call-conversation"]').attributes('href')).toBe(
      '/app/accounts/1/conversations/12?messageId=55'
    );
  });

  it('shows who handled an answered call, its recording and its transcript', async () => {
    respondWith([answeredCall]);

    const wrapper = await mountPage();
    const row = wrapper.find('[data-call-id="2"]');

    expect(row.find('[data-kind="incoming"]').text()).toBe('Incoming');
    expect(row.find('[data-test="call-agent"]').text()).toContain('Picked by');
    expect(row.find('[data-test="call-agent"]').text()).toContain('Ana Agent');
    expect(row.find('call-recording-player-stub').exists()).toBe(true);
    expect(row.find('[data-test="call-transcript"]').exists()).toBe(true);
  });

  it('refetches with the activity filter and keeps it in the URL', async () => {
    const wrapper = await mountPage();

    await wrapper.find('[data-test="activity-missed"]').trigger('click');
    await flushPromises();

    expect(CallsAPI.get).toHaveBeenLastCalledWith({
      page: 1,
      status: 'no-answer',
      direction: 'inbound',
    });
    expect(window.location.search).toBe('?activity=missed');
    expect(wrapper.find('[data-test="active-activity"]').text()).toContain(
      'Missed (1)'
    );
  });

  it('restores the filters and the page from the URL', async () => {
    window.history.pushState(
      {},
      '',
      '/app/accounts/1/calls?activity=outgoing&inbox_id=3&page=2'
    );

    await mountPage();

    expect(CallsAPI.get).toHaveBeenCalledWith({
      page: 2,
      direction: 'outbound',
      inbox_id: 3,
    });
  });

  it('scopes an agent to their own calls and hides the assignee filter', async () => {
    const wrapper = await mountPage({ role: 'agent' });

    expect(CallsAPI.get).toHaveBeenCalledWith({ page: 1, agent_id: 7 });
    expect(actions.getAgents).not.toHaveBeenCalled();
    expect(wrapper.find('[data-test="assignee-filter"]').exists()).toBe(false);
  });

  it('lets an administrator filter by assignee', async () => {
    const wrapper = await mountPage();

    expect(actions.getAgents).toHaveBeenCalled();
    expect(wrapper.find('[data-test="assignee-filter"]').exists()).toBe(true);
  });

  it('says so when no call matches', async () => {
    respondWith([]);

    const wrapper = await mountPage();

    expect(wrapper.find('[data-test="calls-empty"]').text()).toBe(
      'No calls found'
    );
    expect(wrapper.find('[data-test="calls-table"]').exists()).toBe(false);
  });

  it('offers to set up a voice channel when no inbox can take calls', async () => {
    const wrapper = await mountPage({
      inboxes: [],
      stubs: { Policy: { template: '<div><slot /></div>' } },
    });

    expect(CallsAPI.get).not.toHaveBeenCalled();
    expect(wrapper.text()).toContain('Make and receive calls in one place');
  });
});
