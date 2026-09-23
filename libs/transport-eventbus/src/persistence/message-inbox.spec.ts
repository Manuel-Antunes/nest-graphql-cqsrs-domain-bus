import { MikroORM } from '@mikro-orm/core';
import { inRequestContext } from '@nestposts/database';
import { closeTestDatabase, testDatabase } from '@nestposts/database/testing';

import { MikroOrmMessageInbox } from './message-inbox';
import { transportEntities, TransportMessage } from './message-inbox.entity';

describe('MessageInbox', () => {
  let orm: MikroORM;
  let inbox: MikroOrmMessageInbox;

  beforeAll(async () => {
    orm = await testDatabase({ entities: [...transportEntities] });
    inbox = new MikroOrmMessageInbox(orm.em);
  });

  afterAll(() => closeTestDatabase(orm));

  beforeEach(async () => {
    await orm.em.fork().nativeDelete(TransportMessage, {});
  });

  const register = (identifier: string, origin = 'tagging') =>
    inRequestContext(orm.em, () =>
      inbox.register(identifier, 'posts.PostCreated#1.0.0', origin),
    );

  it('accepts a message it has not seen', async () => {
    await expect(register('evt-1')).resolves.toBe(true);
  });

  it('refuses the same identifier a second time, which is what a redelivery is', async () => {
    await register('evt-1');

    await expect(register('evt-1')).resolves.toBe(false);
  });

  it('settles a race in the database, not in the process', async () => {
    const [first, second] = await inRequestContext(orm.em, () =>
      Promise.all([
        inbox.register('evt-2', 'posts.PostCreated#1.0.0', 'tagging'),
        inbox.register('evt-2', 'posts.PostCreated#1.0.0', 'tagging'),
      ]),
    );

    expect([first, second].filter(Boolean)).toHaveLength(1);
  });

  it('remembers what it received and who sent it', async () => {
    await register('evt-3', 'tagging');
    await register('evt-4', 'posts-api');

    const received = await inRequestContext(orm.em, () => inbox.received());

    expect(received).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ identifier: 'evt-3', origin: 'tagging' }),
        expect.objectContaining({ identifier: 'evt-4', origin: 'posts-api' }),
      ]),
    );
  });

  it("takes a message with no origin, which is what upstream's wire shape has", async () => {
    await expect(
      inRequestContext(orm.em, () => inbox.register('evt-5', 'PostCreated')),
    ).resolves.toBe(true);
  });

  it('keeps the row inside the transaction that wrote it', async () => {
    await inRequestContext(orm.em, async () => {
      await orm.em
        .transactional(async () => {
          await inbox.register('evt-6', 'posts.PostCreated#1.0.0', 'tagging');
          throw new Error('the work failed');
        })
        .catch(() => undefined);
    });

    await expect(register('evt-6')).resolves.toBe(true);
  });
});
