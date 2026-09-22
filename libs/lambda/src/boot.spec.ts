import { BootTimeoutError, bootOnce } from './boot';

const never = new Promise<string>(() => undefined);

describe('bootOnce', () => {
  it('boots once and replays the same application to every invocation', async () => {
    let boots = 0;
    const booted = bootOnce(async () => {
      boots += 1;
      return { id: boots };
    });

    const [first, second] = await Promise.all([booted(), booted()]);

    expect(boots).toBe(1);
    expect(first).toBe(second);
  });

  it('answers an invocation that arrives after the boot finished', async () => {
    const booted = bootOnce(async () => 'ready');
    await booted();

    await expect(booted()).resolves.toBe('ready');
  });

  it('gives up on a boot that is still running, instead of waiting for the function timeout', async () => {
    const booted = bootOnce(() => never, { timeout: 20 });

    await expect(booted()).rejects.toBeInstanceOf(BootTimeoutError);
  });

  it('does not cancel the boot when one invocation gives up', async () => {
    let resolve: (value: string) => void = () => undefined;
    const booted = bootOnce(() => new Promise<string>((done) => (resolve = done)), { timeout: 20 });

    await expect(booted()).rejects.toBeInstanceOf(BootTimeoutError);
    resolve('ready');

    await expect(booted()).resolves.toBe('ready');
  });

  it('hands a boot failure to the invocation and to whoever is watching the container', async () => {
    const failures: unknown[] = [];
    const booted = bootOnce(
      () => Promise.reject(new Error('the database refused the connection')),
      { onFailure: (failure) => failures.push(failure) },
    );

    await expect(booted()).rejects.toThrow('the database refused the connection');
    expect(failures).toHaveLength(1);
  });
});
