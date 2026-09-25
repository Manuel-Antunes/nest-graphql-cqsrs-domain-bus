/* eslint-disable @typescript-eslint/no-explicit-any */
import { act, renderHook } from '@testing-library/react';
import type { Mock } from 'vitest';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type {
  ConnectionState,
  SubscriptionHandlers,
  SubscriptionOptions,
  SubscriptionResult,
} from './types';
import { useSubscription } from './use-subscription';

/**
 * The generic hook, tested generically: NO GraphQL anywhere in this file, on
 * purpose. Options are hand-built the way any builder would build them, so what
 * is pinned here is the contract a future standalone package would ship —
 * lifecycle, `enabled`, the connection/result split, and the narrowing.
 */

interface OpenStream {
  handlers: SubscriptionHandlers<Tick>;
  unsubscribe: Mock<() => void>;
}

interface Tick {
  at: string;
}

function createTransport() {
  const streams: OpenStream[] = [];

  const subscribe = vi.fn((handlers: SubscriptionHandlers<Tick>) => {
    const stream: OpenStream = { handlers, unsubscribe: vi.fn() };
    streams.push(stream);
    return () => stream.unsubscribe();
  });

  return {
    subscribe,
    streams,
    /** The stream opened last — the one the hook is currently holding. */
    get current() {
      return streams[streams.length - 1];
    },
    get openCount() {
      return streams.filter((s) => s.unsubscribe.mock.calls.length === 0)
        .length;
    },
  };
}

/** What a builder hands over: a key, a switch, and a way to open the stream. */
function options(
  transport: ReturnType<typeof createTransport>,
  overrides: Partial<SubscriptionOptions<Tick>> = {},
): SubscriptionOptions<Tick> {
  return {
    enabled: true,
    queryKey: ['ticks', { room: 'a' }],
    subscribe: transport.subscribe,
    ...overrides,
  };
}

describe('useSubscription', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('stays idle — and opens nothing — while disabled', () => {
    const transport = createTransport();

    const { result } = renderHook(() =>
      useSubscription(options(transport, { enabled: false })),
    );

    expect(result.current.status).toBe('idle');
    expect(result.current.isSubscribed).toBe(false);
    expect(transport.subscribe).not.toHaveBeenCalled();
  });

  it('connects, then reports the last payload', () => {
    const transport = createTransport();
    const onStarted = vi.fn();
    const onData = vi.fn();

    const { result } = renderHook(() =>
      useSubscription(options(transport, { onStarted, onData })),
    );

    expect(result.current.status).toBe('connecting');
    expect(onStarted).toHaveBeenCalledTimes(1);

    act(() => transport.current.handlers.next({ at: '10:00' }));
    expect(result.current.status).toBe('pending');
    expect(result.current.data).toEqual({ at: '10:00' });

    act(() => transport.current.handlers.next({ at: '10:01' }));
    // The last payload wins — this is state, not an accumulation.
    expect(result.current.data).toEqual({ at: '10:01' });
    expect(onData).toHaveBeenCalledTimes(2);
  });

  it('opens the stream when it becomes enabled, without changing hook count', () => {
    const transport = createTransport();

    const { result, rerender } = renderHook(
      ({ enabled }: { enabled: boolean }) =>
        useSubscription(options(transport, { enabled })),
      { initialProps: { enabled: false } },
    );

    expect(transport.subscribe).not.toHaveBeenCalled();

    rerender({ enabled: true });

    expect(transport.subscribe).toHaveBeenCalledTimes(1);
    expect(result.current.status).toBe('connecting');
  });

  it('closes the old stream and clears data when the key changes', () => {
    const transport = createTransport();

    const { result, rerender } = renderHook(
      ({ room }: { room: string }) =>
        useSubscription(options(transport, { queryKey: ['ticks', { room }] })),
      { initialProps: { room: 'a' } },
    );

    act(() => transport.current.handlers.next({ at: '10:00' }));
    const first = transport.current;

    rerender({ room: 'b' });

    expect(first.unsubscribe).toHaveBeenCalledTimes(1);
    expect(transport.openCount).toBe(1);
    // The previous stream's data must not show under the new one's identity.
    expect(result.current.data).toBeUndefined();
    expect(result.current.status).toBe('connecting');
  });

  it('does not re-subscribe when only the callbacks change identity', () => {
    const transport = createTransport();

    const { rerender } = renderHook(
      ({ label }: { label: string }) =>
        useSubscription(
          options(transport, {
            // A new arrow every render — the common call site.
            onData: () => void label,
          }),
        ),
      { initialProps: { label: 'a' } },
    );

    rerender({ label: 'b' });
    rerender({ label: 'c' });

    expect(transport.subscribe).toHaveBeenCalledTimes(1);
  });

  it('always calls the callbacks from the latest render', () => {
    const transport = createTransport();
    const first = vi.fn();
    const second = vi.fn();

    const { rerender } = renderHook(
      ({ onData }: { onData: (d: Tick) => void }) =>
        useSubscription(options(transport, { onData })),
      { initialProps: { onData: first } },
    );

    rerender({ onData: second });
    act(() => transport.current.handlers.next({ at: '10:00' }));

    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledTimes(1);
  });

  it('unsubscribes on unmount', () => {
    const transport = createTransport();

    const { unmount } = renderHook(() => useSubscription(options(transport)));
    const stream = transport.current;

    unmount();

    expect(stream.unsubscribe).toHaveBeenCalledTimes(1);
  });

  it('closes the stream and forgets the data when disabled again', () => {
    const transport = createTransport();

    const { result, rerender } = renderHook(
      ({ enabled }: { enabled: boolean }) =>
        useSubscription(options(transport, { enabled })),
      { initialProps: { enabled: true } },
    );

    act(() => transport.current.handlers.next({ at: '10:00' }));
    const stream = transport.current;

    rerender({ enabled: false });

    expect(stream.unsubscribe).toHaveBeenCalledTimes(1);
    expect(result.current.status).toBe('idle');
    expect(result.current.data).toBeUndefined();
  });

  /**
   * The union is the point of the shape: these bodies only COMPILE because
   * `status` discriminates. Written without a single `!` or `?.` on purpose.
   */
  it('narrows data and error on the status', () => {
    const transport = createTransport();
    const failure = new Error('stream closed');

    const { result, rerender } = renderHook(
      ({ enabled }: { enabled: boolean }) =>
        useSubscription(options(transport, { enabled })),
      { initialProps: { enabled: false } },
    );

    const idle: SubscriptionResult<Tick> = result.current;
    if (idle.status !== 'idle') throw new Error('expected idle');
    const nothing: undefined = idle.data;
    expect(nothing).toBeUndefined();

    rerender({ enabled: true });
    act(() => transport.current.handlers.next({ at: '10:00' }));

    const pending: SubscriptionResult<Tick> = result.current;
    if (pending.status !== 'pending') throw new Error('expected pending');
    const noError: null = pending.error;
    expect(noError).toBeNull();

    act(() => transport.current.handlers.error?.(failure));

    const failed: SubscriptionResult<Tick> = result.current;
    if (failed.status !== 'error') throw new Error('expected error');
    const message: string = failed.error.message;
    expect(message).toBe('stream closed');
  });

  describe('failures', () => {
    it('keeps a transport Error as-is, and the last payload with it', () => {
      const transport = createTransport();
      const thrown = new Error('stream closed');
      const onError = vi.fn();

      const { result } = renderHook(() =>
        useSubscription(options(transport, { onError })),
      );

      act(() => {
        transport.current.handlers.next({ at: '10:00' });
        transport.current.handlers.error?.(thrown);
      });

      expect(result.current.status).toBe('error');
      expect(result.current.error).toBe(thrown);
      expect(onError).toHaveBeenCalledWith(thrown);
      // The last payload is still the truest thing we know.
      expect(result.current.data).toEqual({ at: '10:00' });
      expect(result.current.isSubscribed).toBe(false);
    });

    it('coerces whatever else a transport reports into an Error', () => {
      const transport = createTransport();

      const { result } = renderHook(() => useSubscription(options(transport)));

      // A `CloseEvent`-ish object, which is what a socket hands over.
      act(() => transport.current.handlers.error?.({ reason: 'going away' }));

      expect(result.current.error).toBeInstanceOf(Error);
      expect(result.current.error?.message).toBe('going away');
    });

    it('surfaces a transport that throws synchronously instead of crashing', () => {
      const transport = createTransport();
      transport.subscribe.mockImplementationOnce(() => {
        throw new Error('no socket');
      });

      const { result } = renderHook(() => useSubscription(options(transport)));

      expect(result.current.status).toBe('error');
      expect(result.current.error?.message).toBe('no socket');
    });

    it('marks a server-ended stream complete', () => {
      const transport = createTransport();
      const onComplete = vi.fn();

      const { result } = renderHook(() =>
        useSubscription(options(transport, { onComplete })),
      );

      act(() => {
        transport.current.handlers.next({ at: '10:00' });
        transport.current.handlers.complete?.();
      });

      expect(result.current.status).toBe('complete');
      expect(onComplete).toHaveBeenCalledTimes(1);
      // Terminal, but the final payload stays on screen.
      expect(result.current.data).toEqual({ at: '10:00' });
    });
  });

  describe('restart', () => {
    it('re-opens the same stream without blanking the data', () => {
      const transport = createTransport();

      const { result } = renderHook(() => useSubscription(options(transport)));

      act(() => transport.current.handlers.next({ at: '10:00' }));
      const first = transport.current;

      act(() => result.current.restart());

      expect(first.unsubscribe).toHaveBeenCalledTimes(1);
      expect(transport.subscribe).toHaveBeenCalledTimes(2);
      // Same logical stream: blanking data about to be replaced by the same
      // value would be a flicker, not information.
      expect(result.current.data).toEqual({ at: '10:00' });
      expect(result.current.status).toBe('connecting');
    });

    it('revives a stream the server ended', () => {
      const transport = createTransport();

      const { result } = renderHook(() => useSubscription(options(transport)));

      act(() => transport.current.handlers.complete?.());
      expect(result.current.status).toBe('complete');

      act(() => result.current.restart());

      // A terminal status must not outlive the stream that produced it.
      expect(result.current.status).toBe('connecting');
      expect(result.current.error).toBeNull();
      expect(transport.subscribe).toHaveBeenCalledTimes(2);
    });

    it('does nothing while disabled', () => {
      const transport = createTransport();

      const { result } = renderHook(() =>
        useSubscription(options(transport, { enabled: false })),
      );

      act(() => result.current.restart());

      expect(result.current.status).toBe('idle');
      expect(transport.subscribe).not.toHaveBeenCalled();
    });
  });

  describe('connection state', () => {
    it('reports connecting on open and pending once the server accepts', () => {
      const transport = createTransport();
      const states: ConnectionState[] = [];

      const { result } = renderHook(() =>
        useSubscription(
          options(transport, {
            onConnectionStateChange: (state) => states.push(state),
          }),
        ),
      );

      expect(states).toEqual([
        { state: 'connecting', error: null, reconnecting: false },
      ]);

      act(() => transport.current.handlers.connected?.(false));

      expect(states.at(-1)).toEqual({
        state: 'pending',
        error: null,
        reconnecting: false,
      });
      // Connected is not the same as "has data" — this is the tRPC meaning.
      expect(result.current.status).toBe('pending');
      expect(result.current.data).toBeUndefined();
    });

    it('goes back to connecting on a retry, keeping the last payload', () => {
      const transport = createTransport();
      const states: ConnectionState[] = [];

      const { result } = renderHook(() =>
        useSubscription(
          options(transport, {
            onConnectionStateChange: (state) => states.push(state),
          }),
        ),
      );

      act(() => {
        transport.current.handlers.connected?.(false);
        transport.current.handlers.next({ at: '10:00' });
      });

      act(() => transport.current.handlers.connecting?.(true));

      expect(states.at(-1)).toEqual({
        state: 'connecting',
        error: null,
        reconnecting: true,
      });
      // A retry is not a failure. Dropping the data would say it was.
      expect(result.current.data).toEqual({ at: '10:00' });
      expect(result.current.error).toBeNull();
    });

    it('never announces the same state twice', () => {
      const transport = createTransport();
      const states: ConnectionState[] = [];

      renderHook(() =>
        useSubscription(
          options(transport, {
            onConnectionStateChange: (state) => states.push(state),
          }),
        ),
      );

      act(() => {
        // Some transports fire this synchronously inside `subscribe`; the hook
        // announces the open itself. Exactly one `connecting` must come out.
        transport.current.handlers.connecting?.(false);
        transport.current.handlers.connected?.(false);
        transport.current.handlers.next({ at: '10:00' });
        transport.current.handlers.next({ at: '10:01' });
      });

      expect(states.map((s) => s.state)).toEqual(['connecting', 'pending']);
    });

    it('reaches pending on the first payload when the transport reports nothing', () => {
      const transport = createTransport();
      const states: ConnectionState[] = [];

      const { result } = renderHook(() =>
        useSubscription(
          options(transport, {
            onConnectionStateChange: (state) => states.push(state),
          }),
        ),
      );

      act(() => transport.current.handlers.next({ at: '10:00' }));

      // A payload is the only proof of a working stream such a transport gives.
      expect(states.map((s) => s.state)).toEqual(['connecting', 'pending']);
      expect(result.current.status).toBe('pending');
    });

    it('reports idle with the terminal error, and on unmount', () => {
      const transport = createTransport();
      const states: ConnectionState[] = [];
      const failed = new Error('stream closed');

      const { unmount } = renderHook(() =>
        useSubscription(
          options(transport, {
            onConnectionStateChange: (state) => states.push(state),
          }),
        ),
      );

      act(() => transport.current.handlers.error?.(failed));
      expect(states.at(-1)).toEqual({
        state: 'idle',
        error: failed,
        reconnecting: false,
      });

      unmount();
      // Already idle — a closed connection is not closed twice.
      expect(states.filter((s) => s.state === 'idle')).toHaveLength(1);
    });
  });
});
