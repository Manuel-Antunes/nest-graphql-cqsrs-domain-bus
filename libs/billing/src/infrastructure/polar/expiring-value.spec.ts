import { ExpiringValue } from './expiring-value';

describe('ExpiringValue', () => {
  let now = 0;
  const clock = () => now;

  beforeEach(() => {
    now = 0;
  });

  it('loads once while the value is fresh, and again once it expires', async () => {
    const load = vi.fn(async () => now);
    const value = new ExpiringValue(1000, load, clock);

    await value.get();
    now = 999;
    await value.get();
    now = 1000;
    await value.get();

    expect(load).toHaveBeenCalledTimes(2);
  });

  it('shares one load between callers that arrive while it is in flight', async () => {
    const load = vi.fn(
      () =>
        new Promise<string>((resolve) => setTimeout(() => resolve('plans'), 5)),
    );
    const value = new ExpiringValue(1000, load, clock);

    const [first, second] = await Promise.all([value.get(), value.get()]);

    expect([first, second]).toEqual(['plans', 'plans']);
    expect(load).toHaveBeenCalledTimes(1);
  });

  it('forgets a load that failed, so the next caller tries again', async () => {
    const load = vi
      .fn<() => Promise<string>>()
      .mockRejectedValueOnce(new Error('polar is down'))
      .mockResolvedValueOnce('plans');
    const value = new ExpiringValue(1000, load, clock);

    await expect(value.get()).rejects.toThrow('polar is down');
    await expect(value.get()).resolves.toBe('plans');
  });
});
