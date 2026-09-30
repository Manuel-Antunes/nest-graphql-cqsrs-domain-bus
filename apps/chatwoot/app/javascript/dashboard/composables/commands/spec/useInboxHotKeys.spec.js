import { useInboxHotKeys } from '../useInboxHotKeys';
import { useI18n } from 'vue-i18n';
import { useAppNavigation } from 'dashboard/composables/useAppNavigation';
import { isAInboxViewRoute } from 'dashboard/helper/routeHelpers';

vi.mock('vue-i18n');
vi.mock('dashboard/composables/useAppNavigation');
vi.mock('dashboard/helper/routeHelpers');
vi.mock('shared/helpers/mitt');

describe('useInboxHotKeys', () => {
  beforeEach(() => {
    useI18n.mockReturnValue({ t: vi.fn(key => key) });
    useAppNavigation.mockReturnValue({
      currentRouteName: { value: 'inbox_dashboard' },
    });
    isAInboxViewRoute.mockReturnValue(true);
  });

  it('should return inbox hot keys when on an inbox view route', () => {
    const { inboxHotKeys } = useInboxHotKeys();
    expect(inboxHotKeys.value.length).toBeGreaterThan(0);
    expect(inboxHotKeys.value[0].id).toBe('snooze_notification');
  });

  it('should return an empty array when not on an inbox view route', () => {
    isAInboxViewRoute.mockReturnValue(false);
    const { inboxHotKeys } = useInboxHotKeys();
    expect(inboxHotKeys.value).toEqual([]);
  });

  it('should have the correct structure for snooze actions', () => {
    const { inboxHotKeys } = useInboxHotKeys();
    const snoozeNotificationAction = inboxHotKeys.value.find(
      action => action.id === 'snooze_notification'
    );
    expect(snoozeNotificationAction).toBeDefined();
  });
});
