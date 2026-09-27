import { expect, test } from '../fixtures/test';
import { PostEvent } from '../model/post';
import { Poll } from '../support/poll';

const { PRE_CREATED, CREATED } = PostEvent;

const POLICY_CEILING = 3;
const DELIVERIES_UNTIL_GIVING_UP = POLICY_CEILING + 1;
const DEAD_LETTER_QUEUE = 'nestposts.tagging.post-events.dead';

test.describe
  .serial('a failure deciding the tag is retried by the transport', () => {
    let givenUp: string;

    test('fails twice, then completes: three deliveries and one decision', async ({
      accounts,
      authentication,
      publishing,
      appendFaults,
      postRecords,
      eventLog,
      inbox,
    }) => {
      await appendFaults.failAppendsOf(CREATED, 2);
      await authentication.signIn(accounts.author);

      const postId = await publishing.publishThroughTheApi(
        'Retried until it held',
      );

      expect(
        await postRecords.whenVersion(postId, 2, 60_000),
        'the saga never closed: the failure was not retried',
      ).toBeDefined();
      expect(
        await appendFaults.attempts(),
        'two refused appends and the one that held',
      ).toBe(3);
      expect(await eventLog.count(postId, CREATED)).toBe(1);
      expect(await eventLog.streamOf(postId)).toEqual([PRE_CREATED, CREATED]);
      const preCreated = await eventLog.eventOf(postId, PRE_CREATED);
      expect(
        await inbox.rowsFor(preCreated.identifier),
        'the failed deliveries were forgotten, the one that held was remembered',
      ).toBe(1);
      expect(await postRecords.tagsOf(postId)).toEqual(['Untagged']);
    });

    test('gives up at the policy ceiling: the post stays pre-created and nothing is remembered', async ({
      accounts,
      authentication,
      publishing,
      appendFaults,
      postRecords,
      eventLog,
      inbox,
    }) => {
      await appendFaults.failAppendsOf(CREATED, 1_000);
      await authentication.signIn(accounts.author);
      const remembered = await inbox.countOf('tagging', PRE_CREATED);

      const postId = await publishing.publishThroughTheApi('Never takes a tag');

      expect(
        await appendFaults.whenAttempted(DELIVERIES_UNTIL_GIVING_UP, 60_000),
        'the retries never reached the ceiling',
      ).toBe(DELIVERIES_UNTIL_GIVING_UP);

      await Poll.pause(5_000);

      expect(
        await appendFaults.attempts(),
        'a delivery past the ceiling: the policy did not stop the transport',
      ).toBe(DELIVERIES_UNTIL_GIVING_UP);
      expect(await postRecords.find(postId)).toMatchObject({ version: 1 });
      expect(
        await eventLog.streamOf(postId),
        'the ingested event is rolled back with the decision that failed',
      ).toEqual([]);
      expect(
        await inbox.countOf('tagging', PRE_CREATED),
        'a message that was never acted on is not remembered as done',
      ).toBe(remembered);
      givenUp = postId;
    });

    test('parks what it gave up on in the dead-letter queue, with why', async ({
      environment,
      broker,
    }) => {
      test.skip(
        environment.transport !== 'rabbitmq',
        'a dead-letter queue is a broker thing: Inngest keeps the failed run instead',
      );

      const parked = await broker.findIn(
        DEAD_LETTER_QUEUE,
        (message) =>
          message.properties.headers['x-original-routing-key']?.endsWith(
            givenUp,
          ) ?? false,
        10_000,
      );

      expect(parked, `nothing parked in ${DEAD_LETTER_QUEUE}`).toBeDefined();
      expect(parked?.properties.headers).toMatchObject({
        'x-retry-attempt': POLICY_CEILING,
        'x-original-routing-key': `${PRE_CREATED}.${givenUp}`,
      });
      expect(parked?.properties.headers['x-retry-failure']).toContain(
        'e2e: injected failure',
      );
    });
  });
