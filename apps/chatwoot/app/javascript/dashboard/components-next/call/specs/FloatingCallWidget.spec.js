import { computed, ref } from 'vue';
import { flushPromises, mount } from '@vue/test-utils';
import { createStore } from 'vuex';
import { router } from '@inertiajs/vue3';
import FloatingCallWidget from '../FloatingCallWidget.vue';

const { session } = vi.hoisted(() => ({ session: {} }));

vi.mock('dashboard/composables/useCallSession', () => ({
  useCallSession: () => session,
}));
vi.mock('dashboard/composables/useWhatsappCallSession', () => ({
  setWhatsappCallMuted: vi.fn(),
}));
vi.mock('dashboard/api/channel/voice/twilioVoiceClient', () => ({
  default: { setMuted: vi.fn() },
}));
vi.mock('dashboard/helper/AudioAlerts/WindowVisibilityHelper', () => ({
  default: { isWindowVisible: () => false },
}));
vi.mock('@inertiajs/vue3', () => ({
  usePage: () => ({ url: '/app/accounts/1/dashboard', props: {} }),
  router: { visit: vi.fn() },
}));

const ringingCall = {
  callSid: 'CA-ringing',
  conversationId: 7,
  inboxId: 3,
  callDirection: 'inbound',
  caller: { name: 'Jane Doe', phone: '+15550001' },
};

const liveCall = {
  callSid: 'CA-live',
  conversationId: 8,
  inboxId: 3,
  callDirection: 'inbound',
  caller: { name: 'John Roe', phone: '+15550002' },
};

describe('FloatingCallWidget', () => {
  let play;

  const startSession = ({ activeCall = null, incomingCalls = [] } = {}) => {
    const active = ref(activeCall);
    Object.assign(session, {
      activeCall: active,
      incomingCalls: ref(incomingCalls),
      hasActiveCall: computed(() => Boolean(active.value)),
      isJoining: ref(false),
      joinCall: vi.fn().mockResolvedValue({ conferenceSid: 'CF1' }),
      endCall: vi.fn(),
      rejectIncomingCall: vi.fn(),
      dismissCall: vi.fn(),
      formattedCallDuration: ref('00:42'),
    });
  };

  const mountWidget = async () => {
    const store = createStore({
      getters: { getConversationById: () => () => null },
      modules: {
        inboxes: {
          namespaced: true,
          getters: { getInbox: () => () => ({ id: 3, name: 'Support line' }) },
        },
      },
    });
    const wrapper = mount(FloatingCallWidget, {
      global: { plugins: [store] },
    });
    await flushPromises();
    return wrapper;
  };

  const cards = wrapper => wrapper.findAll('[data-call-state]');

  beforeEach(() => {
    window.history.pushState({}, '', '/app/accounts/1/dashboard');
    play = vi
      .spyOn(window.HTMLMediaElement.prototype, 'play')
      .mockResolvedValue();
    vi.spyOn(window.HTMLMediaElement.prototype, 'pause').mockReturnValue();
  });

  it('renders nothing while no call is ringing or active', async () => {
    startSession();

    const wrapper = await mountWidget();

    expect(cards(wrapper)).toHaveLength(0);
    expect(play).not.toHaveBeenCalled();
  });

  it('rings and offers to answer an incoming call', async () => {
    startSession({ incomingCalls: [ringingCall] });

    const wrapper = await mountWidget();

    expect(cards(wrapper)).toHaveLength(1);
    expect(cards(wrapper)[0].attributes('data-call-state')).toBe('incoming');
    expect(cards(wrapper)[0].text()).toContain('Jane Doe');
    expect(play).toHaveBeenCalled();

    await wrapper.find('[data-test="call-accept"]').trigger('click');

    expect(session.joinCall).toHaveBeenCalledWith({
      conversationId: 7,
      inboxId: 3,
      callSid: 'CA-ringing',
    });
  });

  it('declines or dismisses a ringing call', async () => {
    startSession({ incomingCalls: [ringingCall] });

    const wrapper = await mountWidget();
    await wrapper.find('[data-test="call-reject"]').trigger('click');
    await wrapper.find('[data-test="call-dismiss"]').trigger('click');

    expect(session.rejectIncomingCall).toHaveBeenCalledWith('CA-ringing');
    expect(session.dismissCall).toHaveBeenCalledWith('CA-ringing');
  });

  it('keeps the live call below the calls still ringing', async () => {
    startSession({ activeCall: liveCall, incomingCalls: [ringingCall] });

    const wrapper = await mountWidget();
    const [stacked, main] = cards(wrapper);

    expect(stacked.attributes('data-call-state')).toBe('incoming');
    expect(main.attributes('data-call-state')).toBe('ongoing');
    expect(main.find('[data-test="call-duration"]').text()).toBe('00:42');
    expect(main.find('[data-test="call-mute"]').exists()).toBe(true);
    expect(play).not.toHaveBeenCalled();

    await main.find('[data-test="call-end"]').trigger('click');

    expect(session.endCall).toHaveBeenCalledWith({
      conversationId: 8,
      inboxId: 3,
      callSid: 'CA-live',
    });
  });

  it('opens the conversation of the call', async () => {
    startSession({ activeCall: liveCall });

    const wrapper = await mountWidget();
    await wrapper
      .find('[data-test="call-go-to-conversation"]')
      .trigger('click');

    expect(router.visit).toHaveBeenCalledWith(
      '/app/accounts/1/conversations/8'
    );
  });
});
