import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { EventEmitter2, EventEmitterModule } from '@nestjs/event-emitter';
import { Storage } from '@nestjs/storage';
import type { TestingModule } from '@nestjs/testing';
import { Test } from '@nestjs/testing';
import type { EntityManager } from '@nestposts/database';
import { DatabaseModule, MikroORM } from '@nestposts/database';
import type { AnyMikroORM } from '@nestposts/database/testing';
import {
  TestSchemaModule,
  tableIn,
  testDatabaseConfig,
} from '@nestposts/database/testing';
import sharp from 'sharp';

import { Attachment } from '../../domain/asset/attachment';
import type { VariantGenerationEvent } from '../../domain/events/variant-generation.events';
import {
  AttachmentEvent,
  VariantGenerationCompleted,
  VariantGenerationFailed,
} from '../../domain/events/variant-generation.events';
import { AttachmentModule } from '../attachment.module';
import { AttachmentContext } from '../context/attachment-context';
import { AttachmentServer } from '../http/attachment-server';
import { AttachmentKeys } from '../keys/attachment-keys';
import {
  ATTACHMENT_TEST_ENTITIES,
  BrokenConverter,
  ClashLeftSchema,
  ClashRightSchema,
  StrategyPostSchema,
  TestDocument,
  TestDocuments,
  TestPostSchema,
  UppercaseConverter,
} from '../testing/attachment-test-entities';
import { TestDisks } from '../testing/test-disks';
import { RegenerateService } from '../variants/regenerate.service';
import { VariantQueue } from '../variants/variant-queue';

const TABLE = 'attachment_test_post';
const SECRET = 'attachment-spec-secret';

let moduleRef: TestingModule;
let orm: AnyMikroORM;
let storage: Storage;
let events: { name: string; event: VariantGenerationEvent }[];

const em = () => orm.em.fork();

const table = (name: string) => tableIn(orm, name);

const MIME: Record<string, string> = {
  png: 'image/png',
  pdf: 'application/pdf',
  txt: 'text/plain',
};

async function upload(
  disk: 'public' | 'private',
  key: string,
  body = 'payload',
): Promise<Attachment> {
  await storage.disk(disk).put(key, body);
  const extname = key.split('.').pop() as string;
  return Attachment.fromDisk(key, {
    size: body.length,
    mimeType: MIME[extname] ?? 'application/octet-stream',
  });
}

const exists = (disk: 'public' | 'private', key: string) =>
  storage.disk(disk).exists(key);

const read = (disk: 'public' | 'private', key: string) =>
  storage.disk(disk).getText(key);

const idle = () => moduleRef.get(VariantQueue).idle();

async function column<T = Record<string, unknown> | null>(
  id: string,
  name: string,
  from = TABLE,
): Promise<T> {
  const [row] = (await orm.em
    .getConnection()
    .execute(`select ${name} as value from ${table(from)} where id = ?`, [
      id,
    ])) as { value: T }[];
  return row?.value as T;
}

async function insertPost(
  data: Record<string, unknown>,
): Promise<{ id: string; entity: any }> {
  const fork = em();
  const entity = fork.create(TestPostSchema as never, data as never) as any;
  fork.persist(entity);
  await fork.flush();
  return { id: entity.id, entity };
}

const findPost = async (id: string, fork: EntityManager = em()) =>
  (await fork.findOne(TestPostSchema as never, { id } as never)) as any;

const documents = (identification: Record<string, unknown>) =>
  new TestDocuments({ identification: new TestDocument(identification) });

const png = (width = 4, height = 3) =>
  sharp({
    create: {
      width,
      height,
      channels: 3,
      background: { r: 200, g: 20, b: 20 },
    },
  })
    .png()
    .toBuffer();

beforeAll(async () => {
  moduleRef = await Test.createTestingModule({
    imports: [
      DatabaseModule.forRoot({
        ...testDatabaseConfig(
          { entities: ATTACHMENT_TEST_ENTITIES as never[] },
          'asset',
        ),
        exclusive: true,
      }),
      TestSchemaModule.forRoot(),
      EventEmitterModule.forRoot(),
      TestDisks.module(),
      AttachmentModule.forRoot({
        preComputeUrl: true,
        secret: SECRET,
        converters: {
          upper: new UppercaseConverter(),
          broken: new BrokenConverter(),
        },
      }),
    ],
  }).compile();
  await moduleRef.init();

  orm = moduleRef.get(MikroORM);
  storage = moduleRef.get(Storage);
  const emitter = moduleRef.get(EventEmitter2);
  for (const name of Object.values(AttachmentEvent)) {
    emitter.on(name, (event: VariantGenerationEvent) =>
      events.push({ name, event }),
    );
  }
});

afterAll(async () => {
  await moduleRef?.close();
});

beforeEach(async () => {
  events = [];
  await idle();
  await orm.em
    .getConnection()
    .execute(
      `truncate table ${[
        TABLE,
        'attachment_clash_left',
        'attachment_clash_right',
        'attachment_strategy_post',
      ]
        .map(table)
        .join(', ')}`,
    );
  TestDisks.clear(storage);
});

describe('attachment column type (serialization)', () => {
  it('stores only the durable fields — never the url', async () => {
    const { id, entity } = await insertPost({
      title: 'durable',
      avatar: await upload('private', 'tmp/durable.png'),
    });

    expect(TestDisks.isSigned(storage, entity.avatar.url)).toBe(true);
    expect(await column(id, 'avatar')).toEqual({
      disk: 'private',
      path: entity.avatar.path,
      originalName: 'durable.png',
      size: 'payload'.length,
      extname: 'png',
      mimeType: 'image/png',
    });
  });

  it('hydrates the column back into an Attachment with identical durable fields', async () => {
    const { id, entity } = await insertPost({
      title: 'hydrate',
      avatar: await upload('private', 'tmp/hydrate.png'),
    });

    const loaded = await findPost(id);
    expect(loaded.avatar).toBeInstanceOf(Attachment);
    expect(loaded.avatar.toObject()).toEqual(entity.avatar.toObject());
    expect(loaded.avatar.pending).toBe(false);
  });

  it('round-trips a null attachment as null', async () => {
    const { id } = await insertPost({ title: 'empty' });
    expect(await column(id, 'avatar')).toBeNull();
    expect((await findPost(id)).avatar).toBeNull();
  });

  it('reads a row written before `path` existed as the attachment at its `name`, and never moves it', async () => {
    await storage.disk('private').put('legacy/kept.png', 'legacy');
    const [row] = (await orm.em.getConnection().execute(
      `insert into ${table(TABLE)} (id, title, avatar)
       values (gen_random_uuid(), 'legacy', ?::json) returning id::text as id`,
      [
        JSON.stringify({
          name: 'legacy/kept.png',
          size: 6,
          extname: 'png',
          mimeType: 'image/png',
          persisted: false,
        }),
      ],
    )) as { id: string }[];

    const loaded = await findPost(row.id);

    expect(loaded.avatar.path).toBe('legacy/kept.png');
    expect(loaded.avatar.pending).toBe(false);
    expect(await loaded.avatar.getBuffer()).toEqual(Buffer.from('legacy'));
    expect(await exists('private', 'legacy/kept.png')).toBe(true);
  });
});

describe('CREATE — storing a pending attachment', () => {
  it('copies a staged upload into its key, stores the key, and lets the staged object go', async () => {
    const staged = await upload('public', 'tmp/upload-1.png', 'cover-bytes');
    const { id, entity } = await insertPost({ title: 'create', cover: staged });

    const owned = entity.cover.path;
    expect(owned).toMatch(/^posts\/covers\/[0-9a-f-]{36}\.png$/);
    expect(entity.cover.pending).toBe(false);
    expect((await column<{ path: string }>(id, 'cover')).path).toBe(owned);
    expect(await exists('public', 'tmp/upload-1.png')).toBe(false);
    expect(await read('public', owned)).toBe('cover-bytes');
  });

  it('exposes a public url right after the flush', async () => {
    const { entity } = await insertPost({
      title: 'public-url',
      cover: await upload('public', 'tmp/public.png'),
    });

    expect(entity.cover.url).toBe(
      `${TestDisks.BASE_URL}/public/${entity.cover.path}`,
    );
  });

  it('exposes a SIGNED url for a private disk', async () => {
    const { entity } = await insertPost({
      title: 'private-url',
      avatar: await upload('private', 'tmp/private.png'),
    });

    expect(TestDisks.isSigned(storage, entity.avatar.url)).toBe(true);
  });

  it('leaves the source where it is when keepSource is set', async () => {
    const { id, entity } = await insertPost({
      title: 'keep-source',
      sourced: await upload('private', 'agents/thread-1/file.png', 'kept'),
    });

    expect(await exists('private', 'agents/thread-1/file.png')).toBe(true);
    expect(await read('private', entity.sourced.path)).toBe('kept');
    expect((await column<{ path: string }>(id, 'sourced')).path).toBe(
      entity.sourced.path,
    );
  });

  it('leaves the source where it is when the attachment itself says so', async () => {
    await storage.disk('public').put('shared/logo.png', 'logo');
    const { entity } = await insertPost({
      title: 'keep-this-source',
      cover: Attachment.fromDisk('shared/logo.png', {
        size: 4,
        mimeType: 'image/png',
        keepSource: true,
      }),
    });

    expect(await exists('public', 'shared/logo.png')).toBe(true);
    expect(await read('public', entity.cover.path)).toBe('logo');
  });

  it('handles every attachment column on one entity, across both disks', async () => {
    const { entity } = await insertPost({
      title: 'multi',
      cover: await upload('public', 'tmp/m-cover.png', 'c'),
      avatar: await upload('private', 'tmp/m-avatar.png', 'a'),
      manual: await upload('private', 'tmp/m-manual.png', 'm'),
      sourced: await upload('private', 'tmp/m-sourced.png', 's'),
    });

    expect(entity.cover.path).toContain('posts/covers/');
    expect(entity.avatar.path).toContain('posts/avatars/');
    expect(entity.manual.path).toContain('posts/manual/');
    expect(entity.sourced.path).toContain('posts/sourced/');
    expect(await read('public', entity.cover.path)).toBe('c');
    expect(await read('private', entity.avatar.path)).toBe('a');
    expect(await read('private', entity.manual.path)).toBe('m');
    expect(await read('private', entity.sourced.path)).toBe('s');
  });

  it('stores every entity of a multi-entity flush', async () => {
    const fork = em();
    const staged = await Promise.all([
      upload('public', 'tmp/batch-a.png', 'a'),
      upload('public', 'tmp/batch-b.png', 'b'),
      upload('public', 'tmp/batch-c.png', 'c'),
    ]);
    const posts = staged.map(
      (cover, i) =>
        fork.create(
          TestPostSchema as never,
          { title: `batch-${i}`, cover } as never,
        ) as any,
    );
    for (const post of posts) {
      fork.persist(post);
    }
    await fork.flush();

    for (const [i, post] of posts.entries()) {
      expect(await read('public', post.cover.path)).toBe(['a', 'b', 'c'][i]);
      expect((await column<{ path: string }>(post.id, 'cover')).path).toBe(
        post.cover.path,
      );
    }
  });

  it('stores bytes in memory, telling what they are by the bytes', async () => {
    const bytes = await png();
    const { entity } = await insertPost({
      title: 'from-buffer',
      cover: await Attachment.fromBuffer(bytes, 'pixel.png'),
    });

    expect(entity.cover.mimeType).toBe('image/png');
    expect(entity.cover.originalName).toBe('pixel.png');
    expect(await storage.disk('public').getBuffer(entity.cover.path)).toEqual(
      bytes,
    );
  });

  it('stores what a URL answers with', async () => {
    const bytes = await png();
    const server = createServer((_request, response) => {
      response.writeHead(200, { 'content-type': 'image/png' });
      response.end(bytes);
    });
    await new Promise<void>((resolve) => server.listen(0, resolve));
    try {
      const { port } = server.address() as AddressInfo;
      const { entity } = await insertPost({
        title: 'from-url',
        cover: await Attachment.fromUrl(`http://127.0.0.1:${port}/red.png`),
      });

      expect(entity.cover.originalName).toBe('red.png');
      expect(entity.cover.mimeType).toBe('image/png');
      expect(await storage.disk('public').getBuffer(entity.cover.path)).toEqual(
        bytes,
      );
    } finally {
      server.close();
    }
  });

  it('keeps the original name, in a folder named after the entity, when rename is off', async () => {
    const { entity } = await insertPost({
      title: 'Olá Mundo',
      named: await Attachment.fromBuffer(Buffer.from('hi'), 'notes.txt'),
    });

    expect(entity.named.path).toBe('posts/ola-mundo/notes.txt');
    expect(await read('public', 'posts/ola-mundo/notes.txt')).toBe('hi');
  });

  it('reads the metadata of the file when meta is on', async () => {
    const { id } = await insertPost({
      title: 'meta',
      described: await Attachment.fromBuffer(await png(6, 5), 'meta.png'),
    });

    expect(await column<{ meta: unknown }>(id, 'described')).toMatchObject({
      meta: { dimension: { width: 6, height: 5 } },
    });
  });
});

describe('LOAD — binding without touching storage', () => {
  it('computes a signed url on load', async () => {
    const { id, entity } = await insertPost({
      title: 'load-signed',
      avatar: await upload('private', 'tmp/load.png', 'load-bytes'),
    });

    const loaded = await findPost(id);
    expect(TestDisks.isSigned(storage, loaded.avatar.url)).toBe(true);
    expect(loaded.avatar.path).toBe(entity.avatar.path);
    expect(await loaded.avatar.getBuffer()).toEqual(Buffer.from('load-bytes'));
  });

  it('leaves the url to be asked for when preComputeUrl is off', async () => {
    const { id } = await insertPost({
      title: 'load-manual',
      manual: await upload('private', 'tmp/manual.png'),
    });

    const loaded = await findPost(id);
    expect(loaded.manual.url).toBeUndefined();
    expect(
      TestDisks.isSigned(storage, await loaded.manual.getSignedUrl()),
    ).toBe(true);
  });

  it('a load followed by a flush issues no UPDATE (no url churn)', async () => {
    const { id } = await insertPost({
      title: 'no-churn',
      avatar: await upload('private', 'tmp/churn.png'),
      gallery: [
        await Attachment.fromBuffer(Buffer.from('one'), 'one.txt'),
        await Attachment.fromBuffer(Buffer.from('two'), 'two.txt'),
      ],
    });

    const fork = em();
    const loaded = await findPost(id, fork);
    expect(loaded.avatar.url).toBeTruthy();

    const uow = fork.getUnitOfWork();
    uow.computeChangeSets();
    expect(uow.getChangeSets()).toHaveLength(0);
  });

  it('keeps what it stored, bound and with its url, when the same entity manager reads the row again', async () => {
    const { id } = await insertPost({ title: 'read-again' });

    const fork = em();
    const loaded = await findPost(id, fork);
    loaded.cover = await upload('public', 'tmp/read-again.png', 'again');
    loaded.gallery = [
      await Attachment.fromBuffer(Buffer.from('one'), 'one.txt'),
    ];
    await fork.flush();
    const [again] = (await fork.find(
      TestPostSchema as never,
      {
        id,
      } as never,
    )) as any[];

    expect(again).toBe(loaded);
    expect(again.cover.url).toBe(
      `${TestDisks.BASE_URL}/public/${again.cover.path}`,
    );
    expect(await again.gallery[0].getBuffer()).toEqual(Buffer.from('one'));
  });

  it('seals a key id that opens to the row and the property', async () => {
    const { id, entity } = await insertPost({
      title: 'key-id',
      avatar: await upload('private', 'tmp/key.png'),
    });

    const loaded = await findPost(id);
    const keys = moduleRef.get(AttachmentKeys);
    expect(keys.open(entity.avatar.keyId)).toMatchObject({
      entity: 'TestPost',
      where: { id },
      path: ['avatar'],
      key: entity.avatar.path,
    });
    expect(keys.open(loaded.avatar.keyId)).toEqual(
      keys.open(entity.avatar.keyId),
    );
    expect(loaded.avatar.toJSON()).toMatchObject({
      keyId: loaded.avatar.keyId,
    });
  });
});

describe('UPDATE — replacing and clearing', () => {
  it('stores the replacement and deletes the old object after the commit', async () => {
    const { id, entity } = await insertPost({
      title: 'replace',
      cover: await upload('public', 'tmp/old.png', 'old'),
    });
    const oldKey = entity.cover.path;

    const fork = em();
    const loaded = await findPost(id, fork);
    loaded.cover = await upload('public', 'tmp/new.png', 'new');
    await fork.flush();

    expect(loaded.cover.path).not.toBe(oldKey);
    expect((await column<{ path: string }>(id, 'cover')).path).toBe(
      loaded.cover.path,
    );
    expect(await read('public', loaded.cover.path)).toBe('new');
    expect(await exists('public', oldKey)).toBe(false);
  });

  it('deletes the old object when the attachment is cleared', async () => {
    const { id, entity } = await insertPost({
      title: 'clear',
      cover: await upload('public', 'tmp/clear.png'),
    });

    const fork = em();
    const loaded = await findPost(id, fork);
    loaded.cover = null;
    await fork.flush();

    expect(await column(id, 'cover')).toBeNull();
    expect(await exists('public', entity.cover.path)).toBe(false);
  });

  it('leaves the attachment alone when an unrelated column changes', async () => {
    const { id, entity } = await insertPost({
      title: 'untouched',
      cover: await upload('public', 'tmp/untouched.png', 'keep'),
    });

    const fork = em();
    const loaded = await findPost(id, fork);
    loaded.title = 'untouched-renamed';
    await fork.flush();

    expect(await read('public', entity.cover.path)).toBe('keep');
    expect((await column<{ path: string }>(id, 'cover')).path).toBe(
      entity.cover.path,
    );
  });
});

describe('DELETE — removing the row', () => {
  it('removes the object the deleted row owned', async () => {
    const { id, entity } = await insertPost({
      title: 'delete',
      cover: await upload('public', 'tmp/delete.png'),
    });

    const fork = em();
    fork.remove(await findPost(id, fork));
    await fork.flush();

    expect(await exists('public', entity.cover.path)).toBe(false);
  });
});

describe('attachments() — a list in one column', () => {
  it('stores, adds to, takes from and clears the list', async () => {
    const { id, entity } = await insertPost({
      title: 'gallery',
      gallery: [
        await Attachment.fromBuffer(Buffer.from('one'), 'one.txt'),
        await Attachment.fromBuffer(Buffer.from('two'), 'two.txt'),
      ],
    });
    const [one, two] = entity.gallery.map((file: Attachment) => file.path);
    expect(await read('public', one)).toBe('one');
    expect(await read('public', two)).toBe('two');

    const fork = em();
    const loaded = await findPost(id, fork);
    loaded.gallery = [
      loaded.gallery[1],
      await Attachment.fromBuffer(Buffer.from('three'), 'three.txt'),
    ];
    await fork.flush();

    const stored = await column<{ path: string }[]>(id, 'gallery');
    expect(stored.map((file) => file.path)).toEqual([
      two,
      loaded.gallery[1].path,
    ]);
    expect(await exists('public', one)).toBe(false);
    expect(await read('public', loaded.gallery[1].path)).toBe('three');

    loaded.gallery = null;
    await fork.flush();
    expect(await exists('public', two)).toBe(false);
  });
});

describe('transactions', () => {
  it('deletes the replaced object only once the transaction commits', async () => {
    const { id, entity } = await insertPost({
      title: 'tx-commit',
      cover: await upload('public', 'tmp/tx-old.png', 'old'),
    });
    const oldKey = entity.cover.path;

    const fork = em();
    await fork.begin();
    const loaded = await findPost(id, fork);
    loaded.cover = await upload('public', 'tmp/tx-new.png', 'new');
    await fork.flush();

    expect(await exists('public', oldKey)).toBe(true);
    expect(await exists('public', 'tmp/tx-new.png')).toBe(true);

    await fork.commit();

    expect(await exists('public', oldKey)).toBe(false);
    expect(await exists('public', 'tmp/tx-new.png')).toBe(false);
    expect(await read('public', loaded.cover.path)).toBe('new');
  });

  it('puts the attachment back, pending, when the transaction rolls back', async () => {
    const fork = em();
    await fork.begin();
    const post = fork.create(
      TestPostSchema as never,
      {
        title: 'tx-rollback',
        cover: await upload('public', 'tmp/rollback.png', 'staged'),
      } as never,
    ) as any;
    fork.persist(post);
    await fork.flush();
    const stored = post.cover.path;
    expect(await exists('public', stored)).toBe(true);

    await fork.rollback();

    expect(await exists('public', stored)).toBe(false);
    expect(await read('public', 'tmp/rollback.png')).toBe('staged');
    expect(post.cover.pending).toBe(true);
    expect(post.cover.path).toBe('');
    const [{ count }] = (await orm.em
      .getConnection()
      .execute(`select count(*)::text as count from ${table(TABLE)}`)) as {
      count: string;
    }[];
    expect(count).toBe('0');
  });

  it('keeps the replaced object when the transaction rolls back', async () => {
    const { id, entity } = await insertPost({
      title: 'tx-rollback-replace',
      cover: await upload('public', 'tmp/rr-old.png', 'old'),
    });
    const oldKey = entity.cover.path;

    const fork = em();
    await fork.begin();
    const loaded = await findPost(id, fork);
    loaded.cover = await upload('public', 'tmp/rr-new.png', 'new');
    await fork.flush();
    await fork.rollback();

    expect(await read('public', oldKey)).toBe('old');
    expect((await column<{ path: string }>(id, 'cover')).path).toBe(oldKey);
    expect(await read('public', 'tmp/rr-new.png')).toBe('new');
  });

  it('compensates when the database write itself fails', async () => {
    const fork = em();
    const cover = await upload('public', 'tmp/constraint.png', 'staged');
    fork.create(TestPostSchema as never, { title: null, cover } as never);

    await expect(fork.flush()).rejects.toThrow();

    expect(await read('public', 'tmp/constraint.png')).toBe('staged');
    expect(cover.pending).toBe(true);
    const { entries } = await storage.disk('public').list({
      prefix: 'posts/covers/',
    });
    expect(entries).toHaveLength(0);
  });

  it('deletes only the copy when a keepSource store rolls back', async () => {
    const fork = em();
    await fork.begin();
    const post = fork.create(
      TestPostSchema as never,
      {
        title: 'tx-keep-source',
        sourced: await upload('private', 'agents/thread-2/keep.png', 'kept'),
      } as never,
    ) as any;
    fork.persist(post);
    await fork.flush();
    const copy = post.sourced.path;

    await fork.rollback();

    expect(await read('private', 'agents/thread-2/keep.png')).toBe('kept');
    expect(await exists('private', copy)).toBe(false);
  });

  it('commits through em.transactional()', async () => {
    const cover = await upload('public', 'tmp/transactional.png', 'tx');
    let id = '';
    await (orm.em.fork() as any).transactional(async (tx: any) => {
      const post = tx.create(
        TestPostSchema as never,
        {
          title: 'transactional',
          cover,
        } as never,
      );
      tx.persist(post);
      await tx.flush();
      id = post.id;
    });

    const stored = await column<{ path: string }>(id, 'cover');
    expect(stored.path).toContain('posts/covers/');
    expect(await read('public', stored.path)).toBe('tx');
    expect(await exists('public', 'tmp/transactional.png')).toBe(false);
  });

  it('undoes every store of a rolled-back multi-flush transaction', async () => {
    const fork = em();
    await fork.begin();
    const postA = fork.create(
      TestPostSchema as never,
      {
        title: 'multi-flush-a',
        cover: await upload('public', 'tmp/multi-1.png', 'one'),
      } as never,
    ) as any;
    fork.persist(postA);
    await fork.flush();
    const postB = fork.create(
      TestPostSchema as never,
      {
        title: 'multi-flush-b',
        cover: await upload('public', 'tmp/multi-2.png', 'two'),
      } as never,
    ) as any;
    fork.persist(postB);
    await fork.flush();
    const [storedA, storedB] = [postA.cover.path, postB.cover.path];

    await fork.rollback();

    expect(await exists('public', storedA)).toBe(false);
    expect(await exists('public', storedB)).toBe(false);
    expect(await read('public', 'tmp/multi-1.png')).toBe('one');
    expect(await read('public', 'tmp/multi-2.png')).toBe('two');
  });
});

describe('two entities whose classes report the same name', () => {
  it('keeps each entity on its own attachment options', async () => {
    const fork = em();
    const left = fork.create(
      ClashLeftSchema as never,
      { file: await upload('public', 'tmp/clash-left.png', 'left') } as never,
    ) as any;
    const right = fork.create(
      ClashRightSchema as never,
      { file: await upload('public', 'tmp/clash-right.png', 'right') } as never,
    ) as any;
    fork.persist(left);
    fork.persist(right);
    await fork.flush();

    expect(left.file.path).toMatch(/^clash\/left\//);
    expect(right.file.path).toMatch(/^clash\/right\//);
    expect(await read('public', left.file.path)).toBe('left');
    expect(await read('public', right.file.path)).toBe('right');
  });
});

describe('embeddables — attachments nested in flattened embeddables', () => {
  it('stores an attachment nested two embeddables deep', async () => {
    const { id, entity } = await insertPost({
      title: 'embedded-create',
      documents: documents({
        label: 'Documento de Identificação',
        status: 'PENDING',
        file: await upload('private', 'tmp/doc.pdf', 'doc-bytes'),
      }),
    });

    const owned = entity.documents.identification.file.path;
    expect(owned).toMatch(/^cases\/documents\/[0-9a-f-]{36}\.pdf$/);
    expect(await read('private', owned)).toBe('doc-bytes');
    expect(await exists('private', 'tmp/doc.pdf')).toBe(false);
    expect(
      (await column<{ path: string }>(id, 'documents_identification_file'))
        .path,
    ).toBe(owned);
  });

  it('binds a nested attachment on load', async () => {
    const { id } = await insertPost({
      title: 'embedded-load',
      documents: documents({
        label: 'Documento de Identificação',
        status: 'PENDING',
        file: await upload('private', 'tmp/doc-load.pdf', 'load-bytes'),
      }),
    });

    const loaded = await findPost(id);
    const file = loaded.documents.identification.file;
    expect(file).toBeInstanceOf(Attachment);
    expect(TestDisks.isSigned(storage, file.url)).toBe(true);
    expect(await file.getBuffer()).toEqual(Buffer.from('load-bytes'));
    expect(loaded.documents.identification.status).toBe('PENDING');
  });

  it('replaces a nested attachment and deletes the old object', async () => {
    const { id, entity } = await insertPost({
      title: 'embedded-replace',
      documents: documents({
        label: 'Doc',
        status: 'PENDING',
        file: await upload('private', 'tmp/doc-old.pdf', 'old'),
      }),
    });
    const oldKey = entity.documents.identification.file.path;

    const fork = em();
    const loaded = await findPost(id, fork);
    loaded.documents.identification.file = await upload(
      'private',
      'tmp/doc-new.pdf',
      'new',
    );
    await fork.flush();

    const newKey = loaded.documents.identification.file.path;
    expect(newKey).not.toBe(oldKey);
    expect(await read('private', newKey)).toBe('new');
    expect(await exists('private', oldKey)).toBe(false);
  });

  it('puts a nested attachment back when the transaction rolls back', async () => {
    const fork = em();
    await fork.begin();
    const file = await upload('private', 'tmp/doc-rollback.pdf', 'staged');
    const post = fork.create(
      TestPostSchema as never,
      {
        title: 'embedded-rollback',
        documents: documents({ label: 'Doc', status: 'PENDING', file }),
      } as never,
    ) as any;
    fork.persist(post);
    await fork.flush();
    const stored = post.documents.identification.file.path;

    await fork.rollback();

    expect(await exists('private', stored)).toBe(false);
    expect(await read('private', 'tmp/doc-rollback.pdf')).toBe('staged');
    expect(file.pending).toBe(true);
  });

  it('removes the nested object when the owning row is deleted', async () => {
    const { id, entity } = await insertPost({
      title: 'embedded-delete',
      documents: documents({
        label: 'Doc',
        status: 'PENDING',
        file: await upload('private', 'tmp/doc-delete.pdf'),
      }),
    });

    const fork = em();
    fork.remove(await findPost(id, fork));
    await fork.flush();

    expect(
      await exists('private', entity.documents.identification.file.path),
    ).toBe(false);
  });
});

describe('strategies', () => {
  async function createStrategyPost(data: Record<string, unknown>) {
    const fork = em();
    const entity = fork.create(
      StrategyPostSchema as never,
      data as never,
    ) as any;
    fork.persist(entity);
    await fork.flush();
    return entity;
  }

  it('accepts a zero-argument strategy', async () => {
    const entity = await createStrategyPost({
      slug: 'dated',
      byDate: await upload('public', 'tmp/dated.png', 'D'),
    });

    expect(entity.byDate.path).toMatch(
      /^archive\/2026\/08\/[0-9a-f-]{36}\.png$/,
    );
  });

  it('passes the owning entity', async () => {
    const entity = await createStrategyPost({
      slug: 'my-post',
      byEntity: await upload('public', 'tmp/by-entity.png', 'E'),
    });

    expect(entity.byEntity.path).toMatch(
      /^posts\/my-post\/[0-9a-f-]{36}\.png$/,
    );
    expect(
      (
        await column<{ path: string }>(
          entity.id,
          'by_entity',
          'attachment_strategy_post',
        )
      ).path,
    ).toBe(entity.byEntity.path);
  });

  it('names the file by an asynchronous strategy that reads the original name', async () => {
    const entity = await createStrategyPost({
      slug: 'my-post',
      renamed: await Attachment.fromBuffer(Buffer.from('R'), 'photo.png'),
    });

    expect(entity.renamed.path).toBe('renamed/my-post-photo.png');
  });

  it('reads the ambient AttachmentContext a middleware opened', async () => {
    const entity = await AttachmentContext.run({ tenantId: 'acme' }, async () =>
      createStrategyPost({
        slug: 'scoped',
        byTenant: await upload('private', 'tmp/scoped.png', 'T'),
      }),
    );

    expect(entity.byTenant.path).toMatch(
      /^tenants\/acme\/byTenant\/[0-9a-f-]{36}\.png$/,
    );
  });

  it('falls back to the globals when no scope is open', async () => {
    AttachmentContext.setGlobals({ tenantId: 'root' });
    try {
      const entity = await createStrategyPost({
        slug: 'global',
        byTenant: await upload('private', 'tmp/global.png', 'G'),
      });
      expect(entity.byTenant.path).toMatch(/^tenants\/root\/byTenant\//);
    } finally {
      AttachmentContext.clearGlobals();
    }
  });

  it('a nested scope narrows rather than replaces', async () => {
    const entity = await AttachmentContext.run({ tenantId: 'outer' }, () =>
      AttachmentContext.run({ keepEverything: true }, async () =>
        createStrategyPost({
          slug: 'nested',
          byTenant: await upload('private', 'agents/thread/keep.png', 'N'),
        }),
      ),
    );

    expect(entity.byTenant.path).toMatch(/^tenants\/outer\/byTenant\//);
    expect(await exists('private', 'agents/thread/keep.png')).toBe(true);
  });

  it('keeps the key it wrote on load, whatever the strategy says now', async () => {
    const entity = await AttachmentContext.run({ tenantId: 'acme' }, async () =>
      createStrategyPost({
        slug: 'roundtrip',
        byTenant: await upload('private', 'tmp/roundtrip.png', 'R'),
      }),
    );

    const loaded = (await em().findOne(
      StrategyPostSchema as never,
      { id: entity.id } as never,
    )) as any;

    expect(loaded.byTenant.path).toBe(entity.byTenant.path);
    expect(await loaded.byTenant.getBuffer()).toEqual(Buffer.from('R'));
  });
});

describe('variants', () => {
  it('makes the declared variants once the row is committed, and records them on it', async () => {
    const { id, entity } = await insertPost({
      title: 'variants',
      shouted: await Attachment.fromBuffer(Buffer.from('shout'), 'shout.txt'),
    });

    await idle();

    const stored = await column<{
      variants: { key: string; path: string }[];
    }>(id, 'shouted');
    expect(stored.variants).toEqual([
      expect.objectContaining({ key: 'upper' }),
    ]);
    const [variant] = stored.variants;
    expect(variant.path).toMatch(
      new RegExp(`^posts/shouted/variants/${entity.shouted.name}/`),
    );
    expect(await read('public', variant.path)).toBe('SHOUT');

    const loaded = await findPost(id);
    expect(loaded.shouted.getVariant('upper').url).toBe(
      `${TestDisks.BASE_URL}/public/${variant.path}`,
    );
    expect(await loaded.shouted.getUrl('upper')).toBe(
      loaded.shouted.getVariant('upper').url,
    );
    expect(loaded.shouted.toJSON()).toMatchObject({
      upper: { url: loaded.shouted.getVariant('upper').url },
    });
  });

  it('announces the generation on the event emitter', async () => {
    const { id } = await insertPost({
      title: 'events',
      shouted: await Attachment.fromBuffer(Buffer.from('e'), 'e.txt'),
    });

    await idle();

    expect(events.map(({ name }) => name)).toEqual([
      AttachmentEvent.VARIANT_STARTED,
      AttachmentEvent.VARIANT_COMPLETED,
    ]);
    const completed = events[1].event as VariantGenerationCompleted;
    expect(completed).toMatchObject({
      entity: 'TestPost',
      tableName: 'attachment_test_post',
      attribute: 'shouted',
      primaryKey: id,
      variants: ['upper'],
      generated: ['upper'],
    });
  });

  it('keeps what one converter made when another fails, and announces the failure', async () => {
    const { id } = await insertPost({
      title: 'flaky',
      flaky: await Attachment.fromBuffer(Buffer.from('f'), 'f.txt'),
    });

    await idle();

    const stored = await column<{ variants: { key: string }[] }>(id, 'flaky');
    expect(stored.variants.map(({ key }) => key)).toEqual(['upper']);
    expect(events.at(-1)?.event).toBeInstanceOf(VariantGenerationFailed);
  });

  it('makes nothing when the transaction rolls back', async () => {
    const fork = em();
    await fork.begin();
    fork.persist(
      fork.create(
        TestPostSchema as never,
        {
          title: 'no-variants',
          shouted: await Attachment.fromBuffer(Buffer.from('x'), 'x.txt'),
        } as never,
      ),
    );
    await fork.flush();
    await fork.rollback();

    await idle();

    expect(events).toEqual([]);
  });

  it('deletes the variants with the attachment they were made of', async () => {
    const { id } = await insertPost({
      title: 'variants-go-too',
      shouted: await Attachment.fromBuffer(Buffer.from('bye'), 'bye.txt'),
    });
    await idle();
    const [variant] = (
      await column<{ variants: { path: string }[] }>(id, 'shouted')
    ).variants;

    const fork = em();
    const loaded = await findPost(id, fork);
    loaded.shouted = null;
    await fork.flush();

    expect(await exists('public', variant.path)).toBe(false);
  });

  it('regenerates a variant, replacing the one there was', async () => {
    const { id } = await insertPost({
      title: 'regenerate',
      shouted: await Attachment.fromBuffer(Buffer.from('again'), 'again.txt'),
    });
    await idle();
    const [before] = (
      await column<{ variants: { path: string }[] }>(id, 'shouted')
    ).variants;

    const made = await moduleRef
      .get(RegenerateService)
      .entity(await findPost(id), { variants: ['upper'] });

    const [after] = (
      await column<{ variants: { path: string }[] }>(id, 'shouted')
    ).variants;
    expect(made.map((variant) => variant.path)).toEqual([after.path]);
    expect(after.path).not.toBe(before.path);
    expect(await exists('public', before.path)).toBe(false);
    expect(await read('public', after.path)).toBe('AGAIN');
  });
});

describe('AttachmentServer — serving by key id', () => {
  it('serves the attachment a key id points at', async () => {
    const { entity } = await insertPost({
      title: 'served',
      cover: await Attachment.fromBuffer(Buffer.from('served'), 'served.txt'),
    });

    const served = await moduleRef
      .get(AttachmentServer)
      .serve(entity.cover.keyId);

    expect(served?.mimeType).toBe('text/plain');
    expect(await served?.stream.toArray()).toEqual([Buffer.from('served')]);
  });

  it('makes a variant the column does not declare the first time it is asked for, and keeps it', async () => {
    const { id, entity } = await insertPost({
      title: 'on-demand',
      cover: await Attachment.fromBuffer(Buffer.from('lazy'), 'lazy.txt'),
    });

    const served = await moduleRef
      .get(AttachmentServer)
      .serve(entity.cover.keyId, 'upper');

    expect(
      Buffer.concat((await served?.stream.toArray()) ?? []).toString(),
    ).toBe('LAZY');
    const stored = await column<{ variants: { key: string }[] }>(id, 'cover');
    expect(stored.variants.map(({ key }) => key)).toEqual(['upper']);
  });

  it('serves nothing for a key it did not seal, a variant no converter makes, or a replaced attachment', async () => {
    const { id, entity } = await insertPost({
      title: 'refused',
      cover: await Attachment.fromBuffer(Buffer.from('r'), 'r.txt'),
    });
    const server = moduleRef.get(AttachmentServer);

    expect(await server.serve('not-a-key')).toBeUndefined();
    expect(
      await server.serve(
        new AttachmentKeys('another').seal({
          entity: 'TestPost',
          where: { id },
          path: ['cover'],
          key: entity.cover.path,
        }) as string,
      ),
    ).toBeUndefined();
    expect(await server.serve(entity.cover.keyId, 'nothing')).toBeUndefined();

    const fork = em();
    const loaded = await findPost(id, fork);
    loaded.cover = await Attachment.fromBuffer(Buffer.from('n'), 'n.txt');
    await fork.flush();
    expect(await server.serve(entity.cover.keyId)).toBeUndefined();
  });
});
