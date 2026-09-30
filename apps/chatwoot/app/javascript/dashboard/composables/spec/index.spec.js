import { toast } from 'vue-sonner';
import analyticsHelper from 'dashboard/helper/AnalyticsHelper';
import { useTrack, useAlert } from '../index';

vi.mock('vue-sonner', () => ({
  toast: Object.assign(vi.fn(), {
    success: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    warning: vi.fn(),
  }),
}));

vi.mock('dashboard/helper/AnalyticsHelper/index', async importOriginal => {
  const actual = await importOriginal();
  return {
    ...actual,
    default: {
      track: vi.fn(),
    },
  };
});

describe('useTrack', () => {
  it('should call analyticsHelper.track and return a function', () => {
    const eventArgs = ['event-name', { some: 'data' }];
    useTrack(...eventArgs);
    expect(analyticsHelper.track).toHaveBeenCalledWith(...eventArgs);
  });
});

describe('useAlert', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows a default toast with just the message when no action is given', () => {
    useAlert('Toast message');
    expect(toast).toHaveBeenCalledWith('Toast message', {});
  });

  it('uses the typed toast variant and forwards duration', () => {
    useAlert('Saved', { type: 'success', duration: 5000 });
    expect(toast.success).toHaveBeenCalledWith('Saved', { duration: 5000 });
  });

  it('renders a link action button that navigates on click', () => {
    useAlert('Created', {
      type: 'link',
      to: '/app/accounts/1/conversations/1',
      message: 'Navigate',
    });
    expect(toast).toHaveBeenCalledTimes(1);
    const [text, options] = toast.mock.calls[0];
    expect(text).toBe('Created');
    expect(options.action.label).toBe('Navigate');
    expect(typeof options.action.onClick).toBe('function');
  });
});
