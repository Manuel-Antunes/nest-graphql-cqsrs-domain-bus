import { expect, test } from '../fixtures/test';
import { graphql } from '../gql';
import { AppendFaults } from '../support/faults';
import { sleep, until } from '../support/posts-api';
import { e2eTransport } from '../support/transport';

const PRE_CREATED = 'posts.PostPreCreated';
const CREATED = 'posts.PostCreated';

const POLICY_CEILING = 3;
const DELIVERIES_UNTIL_GIVING_UP = POLICY_CEILING + 1;
const DEAD_LETTER_QUEUE = 'nestposts.tagging.post-events.dead';

const stripVersion = (messageType: string): string => messageType.split('#')[0];

const CreateRetriedPost = graphql(`
  mutation CreateRetriedPost($title: String!) {
    createPost(input: { title: $title, content: "oi" }) {
      id
    }
  }
`);

test.describe
  .serial('a failure deciding the tag is retried by the transport', () => {
    let faults: AppendFaults;
    let givenUp: string;

    test.beforeEach(({ taggingStore }) => {
      faults = new AppendFaults(taggingStore);
    });

    test.afterEach(async () => {
      await faults.clear();
    });

    test('fails twice, then completes: three deliveries and one decision', async ({
      accounts,
      signIn,
      executeGraphql,
      postsStore,
      taggingStore,
    }) => {
      await faults.failAppendsOf(CREATED, 2);
      await signIn(accounts.author);

      const created = await executeGraphql(CreateRetriedPost, {
        title: 'Retried until it held',
      });
      expect(created.errors, JSON.stringify(created.errors)).toBeUndefined();
      const postId = created.data?.createPost.id as string;

      const completed = await until(async () => {
        const post = await postsStore.post(postId);
        return post?.version === 2 ? post : undefined;
      }, 60_000);

      expect(
        completed,
        'the saga never closed: the failure was not retried',
      ).toBeDefined();
      expect(
        await faults.attempts(),
        'two refused appends and the one that held',
      ).toBe(3);
      expect(await taggingStore.countEvents(postId, CREATED)).toBe(1);
      expect((await taggingStore.streamOf(postId)).map(stripVersion)).toEqual([
        PRE_CREATED,
        CREATED,
      ]);
      const preCreated = await taggingStore.eventOf(postId, PRE_CREATED);
      expect(
        await taggingStore.inboxRowsFor(preCreated.identifier),
        'the failed deliveries were forgotten, the one that held was remembered',
      ).toBe(1);
      expect(await postsStore.tagsOf(postId)).toEqual(['Untagged']);
    });

    test('gives up at the policy ceiling: the post stays pre-created and nothing is remembered', async ({
      accounts,
      signIn,
      executeGraphql,
      postsStore,
      taggingStore,
    }) => {
      await faults.failAppendsOf(CREATED, 1_000);
      await signIn(accounts.author);

      const created = await executeGraphql(CreateRetriedPost, {
        title: 'Never takes a tag',
      });
      expect(created.errors, JSON.stringify(created.errors)).toBeUndefined();
      const postId = created.data?.createPost.id as string;

      const exhausted = await until(async () => {
        const attempts = await faults.attempts();
        return attempts >= DELIVERIES_UNTIL_GIVING_UP ? attempts : undefined;
      }, 60_000);
      expect(exhausted, 'the retries never reached the ceiling').toBe(
        DELIVERIES_UNTIL_GIVING_UP,
      );

      await sleep(5_000);

      expect(
        await faults.attempts(),
        'a delivery past the ceiling: the policy did not stop the transport',
      ).toBe(DELIVERIES_UNTIL_GIVING_UP);
      expect(await postsStore.post(postId)).toMatchObject({ version: 1 });
      expect(await taggingStore.countEvents(postId, CREATED)).toBe(0);
      const preCreated = await taggingStore.eventOf(postId, PRE_CREATED);
      expect(
        await taggingStore.inboxRowsFor(preCreated.identifier),
        'a message that was never acted on is not remembered as done',
      ).toBe(0);
      givenUp = postId;
    });

    test('parks what it gave up on in the dead-letter queue, with why', async ({
      broker,
    }) => {
      test.skip(
        e2eTransport() !== 'rabbitmq',
        'a dead-letter queue is a broker thing: Inngest keeps the failed run instead',
      );

      const parked = await until(async () => {
        const messages = await broker.drain(DEAD_LETTER_QUEUE);
        return messages.find((message) =>
          message.properties.headers['x-original-routing-key']?.endsWith(
            givenUp,
          ),
        );
      }, 10_000);

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
