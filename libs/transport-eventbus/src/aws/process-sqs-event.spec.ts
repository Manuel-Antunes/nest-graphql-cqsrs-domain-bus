import type { Context as LambdaContext, SQSEvent, SQSRecord } from 'aws-lambda';

import type { SqsProcessResult } from './sqs.strategy';
import { processSqsEvent } from './process-sqs-event';

const record = (messageId: string): SQSRecord => ({
  messageId,
  receiptHandle: `r-${messageId}`,
  body: '{}',
  attributes: {} as SQSRecord['attributes'],
  messageAttributes: {},
  md5OfBody: '',
  eventSource: 'aws:sqs',
  eventSourceARN: 'arn:aws:sqs:us-east-1:000000000000:nestposts-tagging',
  awsRegion: 'us-east-1',
});

const delivery = (...ids: string[]): SQSEvent => ({ Records: ids.map(record) });

const applicationReturning = (results: SqsProcessResult[]) => {
  const processEvent = vi.fn().mockResolvedValue(results);
  return { app: { unwrap: () => ({ processEvent }) }, processEvent };
};

const lambdaContext = {} as LambdaContext;

describe('processSqsEvent', () => {
  it('hands the whole delivery to the application, not just its first record', async () => {
    const { app, processEvent } = applicationReturning([
      { response: 'a' },
      { response: 'b' },
      { response: 'c' },
    ]);

    const response = await processSqsEvent(
      app,
      delivery('1', '2', '3'),
      lambdaContext,
    );

    expect(processEvent).toHaveBeenCalledOnce();
    expect(processEvent.mock.calls[0][0].Records).toHaveLength(3);
    expect(response.batchItemFailures).toEqual([]);
  });

  it('reports only what failed, so what succeeded is not run a second time', async () => {
    const { app } = applicationReturning([
      { response: 'ok' },
      { err: new Error('boom') },
      { response: 'ok' },
    ]);

    const response = await processSqsEvent(
      app,
      delivery('1', '2', '3'),
      lambdaContext,
    );

    expect(response.batchItemFailures).toEqual([{ itemIdentifier: '2' }]);
  });

  it('does not throw when a record fails, which would fail the whole batch', async () => {
    const { app } = applicationReturning([{ err: new Error('boom') }]);

    await expect(
      processSqsEvent(app, delivery('1'), lambdaContext),
    ).resolves.toEqual({
      batchItemFailures: [{ itemIdentifier: '1' }],
    });
  });

  it('reports every failure of an all-failing batch', async () => {
    const { app } = applicationReturning([
      { err: new Error('a') },
      { err: new Error('b') },
    ]);

    const response = await processSqsEvent(
      app,
      delivery('1', '2'),
      lambdaContext,
    );

    expect(response.batchItemFailures).toEqual([
      { itemIdentifier: '1' },
      { itemIdentifier: '2' },
    ]);
  });
});
