import type { CallHandler } from '@nestjs/common';
import {
  BadRequestException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ExecutionContextHost } from '@nestjs/core/helpers/execution-context-host';
import { context, propagation, ROOT_CONTEXT, trace } from '@opentelemetry/api';
import { node } from '@opentelemetry/sdk-node';
import type { Event } from '@sentry/nestjs';
import * as Sentry from '@sentry/nestjs';
import { lastValueFrom, of, throwError } from 'rxjs';

import { startErrorReporting } from './error-reporting';
import { ErrorReportingInterceptor } from './error-reporting.module';

const MESSAGE_TRACE = '4bf92f3577b34da6a3ce929d0e0e4736';
const PUBLISHER_SPAN = '00f067aa0ba902b7';

const provider = new node.NodeTracerProvider();
const events: Event[] = [];

const interceptor = new ErrorReportingInterceptor({
  traceOf: (execution) =>
    execution.getType() === 'rpc'
      ? propagation.extract(ROOT_CONTEXT, {
          traceparent: `00-${MESSAGE_TRACE}-${PUBLISHER_SPAN}-01`,
        })
      : undefined,
});

const delivery = (type: string) => {
  const host = new ExecutionContextHost([{ data: 'envelope' }, {}]);
  host.setType(type);
  return host;
};

const failing = (failure: unknown): CallHandler => ({
  handle: () => throwError(() => failure),
});

const intercepted = (type: string, handler: CallHandler) =>
  lastValueFrom(interceptor.intercept(delivery(type), handler));

describe('ErrorReportingInterceptor', () => {
  beforeAll(() => {
    provider.register();
    vi.stubEnv('LAMBDA_TASK_ROOT', '/var/task');
    startErrorReporting({
      serviceName: 'tagging',
      dsn: 'https://public@127.0.0.1:9/1',
      environment: 'spec',
    });
    Sentry.getClient()?.on('beforeSendEvent', (event) => events.push(event));
  });

  afterAll(async () => {
    await Sentry.close(0);
    vi.unstubAllEnvs();
    await provider.shutdown();
    trace.disable();
    context.disable();
    propagation.disable();
  });

  beforeEach(() => {
    events.length = 0;
  });

  it('reports a message that failed, and rethrows the very same failure', async () => {
    const failure = new Error('the aggregate is gone');

    await expect(intercepted('rpc', failing(failure))).rejects.toBe(failure);

    expect(events).toHaveLength(1);
    expect(events[0].exception?.values?.[0]).toMatchObject({
      type: 'Error',
      value: 'the aggregate is gone',
      mechanism: { handled: false, type: 'auto.rpc.nestjs' },
    });
    expect(events[0].tags).toMatchObject({ service: 'tagging' });
    expect(events[0].environment).toBe('spec');
  });

  it("opens the report onto the trace the message came with, not the delivery's", async () => {
    await expect(
      intercepted('rpc', failing(new Error('boom'))),
    ).rejects.toThrow('boom');

    expect(events[0].contexts?.trace).toMatchObject({
      trace_id: MESSAGE_TRACE,
      span_id: PUBLISHER_SPAN,
    });
  });

  it('reports the cause a retry policy carries, and rethrows the carrier', async () => {
    const cause = new TypeError('cannot read the post');
    const carrier = { cause, policy: { maxRetries: 5 } };

    await expect(intercepted('rpc', failing(carrier))).rejects.toBe(carrier);

    expect(events[0].exception?.values?.[0]).toMatchObject({
      type: 'TypeError',
      value: 'cannot read the post',
    });
  });

  it('leaves out a 4xx, which is an answer, and reports a 5xx', async () => {
    await expect(
      intercepted('http', failing(new BadRequestException('no title'))),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(events).toEqual([]);

    await expect(
      intercepted('http', failing(new ServiceUnavailableException('down'))),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
    expect(events).toHaveLength(1);
  });

  it('leaves GraphQL to the Yoga plugin', async () => {
    await expect(
      intercepted('graphql', failing(new Error('masked'))),
    ).rejects.toThrow('masked');

    expect(events).toEqual([]);
  });

  it('lets a handler that succeeded through untouched', async () => {
    await expect(
      intercepted('rpc', { handle: () => of('done') }),
    ).resolves.toBe('done');

    expect(events).toEqual([]);
  });
});
