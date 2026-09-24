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

import { Asset } from '../../../domain/data-objects/asset';
import { DiskService } from '../../../domain/storage/disk.service';
import { AssetInfrastructureModule } from '../../asset-infrastructure.module';
import { AssetContext } from '../../context/asset-context';
import {
  ATTACHMENT_TEST_ENTITIES,
  ClashLeftSchema,
  ClashRightSchema,
  StrategyPostSchema,
  TestDocument,
  TestDocuments,
  TestPostSchema,
} from '../../testing/attachment-test-entities';
import type { TestStorage } from '../../testing/test-storage';
import { setupTestStorage } from '../../testing/test-storage';

const TABLE = 'attachment_test_post';

let storage: TestStorage;
let moduleRef: TestingModule;
let orm: AnyMikroORM;
let disks: DiskService;

const em = () => orm.em.fork();

const table = (name: string) => tableIn(orm, name);

const MIME: Record<string, string> = {
  png: 'image/png',
  pdf: 'application/pdf',
  txt: 'text/plain',
};

const staged = (key: string, size = 4) => {
  const extname = key.split('.').pop() as string;
  return new Asset({
    name: key,
    size,
    extname,
    mimeType: MIME[extname] ?? 'application/octet-stream',
  });
};

async function upload(
  disk: 'public' | 'private',
  key: string,
  body = 'payload',
): Promise<Asset> {
  await disks.getDisk(disk).put(key, body);
  return staged(key, body.length);
}

const exists = (disk: 'public' | 'private', key: string) =>
  disks.getDisk(disk).exists(key);

const read = (disk: 'public' | 'private', key: string) =>
  disks.getDisk(disk).get(key);

async function column<T = Record<string, unknown> | null>(
  id: string,
  name: string,
): Promise<T> {
  const [row] = (await orm.em
    .getConnection()
    .execute(`select ${name} as value from ${table(TABLE)} where id = ?`, [
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

beforeAll(async () => {
  storage = await setupTestStorage();
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
      AssetInfrastructureModule.forRoot(storage.options),
    ],
  }).compile();
  await moduleRef.init();

  orm = moduleRef.get(MikroORM);
  disks = moduleRef.get(DiskService);
});

afterAll(async () => {
  await moduleRef?.close();
  await storage?.stop();
});

beforeEach(async () => {
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
  await storage.drop();
});

describe('attachment column type (serialization)', () => {
  it('stores only the durable fields — never the signed url', async () => {
    const { id, entity } = await insertPost({
      title: 'durable',
      avatar: await upload('private', 'tmp/durable.png'),
    });

    expect(entity.avatar.url).toEqual(expect.stringContaining('http'));
    expect(await column(id, 'avatar')).toEqual({
      name: entity.avatar.name,
      size: 'payload'.length,
      extname: 'png',
      mimeType: 'image/png',
      persisted: true,
    });
  });

  it('hydrates the column back into an Asset with identical durable fields', async () => {
    const { id, entity } = await insertPost({
      title: 'hydrate',
      avatar: await upload('private', 'tmp/hydrate.png'),
    });
    const name = entity.avatar.name;

    const loaded = await findPost(id);
    expect(loaded.avatar).toBeInstanceOf(Asset);
    expect(loaded.avatar.name).toBe(name);
    expect(loaded.avatar.size).toBe('payload'.length);
    expect(loaded.avatar.extname).toBe('png');
    expect(loaded.avatar.mimeType).toBe('image/png');
    expect(loaded.avatar.persisted).toBe(true);
  });

  it('round-trips a null attachment as null', async () => {
    const { id } = await insertPost({ title: 'empty' });
    expect(await column(id, 'avatar')).toBeNull();
    expect((await findPost(id)).avatar).toBeNull();
  });

  it('accepts a plain object assignment and promotes it like an Asset', async () => {
    await disks.getDisk('private').put('tmp/plain.png', 'plain-bytes');
    const { id } = await insertPost({
      title: 'plain',
      avatar: {
        name: 'tmp/plain.png',
        size: 11,
        extname: 'png',
        mimeType: 'image/png',
      },
    });

    const stored = await column<{ name: string; persisted: boolean }>(
      id,
      'avatar',
    );
    expect(stored.persisted).toBe(true);
    expect(stored.name).toMatch(/^posts\/avatars\/[0-9a-f-]{36}\.png$/);
    expect(await read('private', stored.name)).toBe('plain-bytes');
  });
});

describe('CREATE — promoting a staged upload', () => {
  it('moves the staged object into its owned key and stores that key', async () => {
    const asset = await upload('public', 'tmp/upload-1.png', 'cover-bytes');
    const { id, entity } = await insertPost({ title: 'create', cover: asset });

    const owned = entity.cover.name;
    expect(owned).toMatch(/^posts\/covers\/[0-9a-f-]{36}\.png$/);
    expect(entity.cover.persisted).toBe(true);

    expect((await column<{ name: string }>(id, 'cover')).name).toBe(owned);

    expect(await exists('public', 'tmp/upload-1.png')).toBe(false);
    expect(await read('public', owned)).toBe('cover-bytes');
  });

  it('exposes a fetchable public url right after the flush', async () => {
    const { entity } = await insertPost({
      title: 'public-url',
      cover: await upload('public', 'tmp/public.png', 'public-bytes'),
    });

    const response = await fetch(entity.cover.url);
    expect(response.status).toBe(200);
    expect(await response.text()).toBe('public-bytes');
  });

  it('exposes a fetchable SIGNED url for a private disk', async () => {
    const { entity } = await insertPost({
      title: 'private-url',
      avatar: await upload('private', 'tmp/private.png', 'private-bytes'),
    });

    expect(entity.avatar.url).toContain('X-Amz-Signature');
    const response = await fetch(entity.avatar.url);
    expect(response.status).toBe(200);
    expect(await response.text()).toBe('private-bytes');

    const unsigned = await fetch(entity.avatar.url.split('?')[0]);
    expect(unsigned.status).toBe(403);
  });

  it('copies instead of moving when keepSource is set', async () => {
    const { id, entity } = await insertPost({
      title: 'keep-source',
      sourced: await upload('private', 'agents/thread-1/file.png', 'kept'),
    });

    expect(await exists('private', 'agents/thread-1/file.png')).toBe(true);
    expect(await read('private', entity.sourced.name)).toBe('kept');
    expect((await column<{ name: string }>(id, 'sourced')).name).toBe(
      entity.sourced.name,
    );
  });

  it('handles every attachment column on one entity, across both disks', async () => {
    const { id, entity } = await insertPost({
      title: 'multi',
      cover: await upload('public', 'tmp/m-cover.png', 'c'),
      avatar: await upload('private', 'tmp/m-avatar.png', 'a'),
      manual: await upload('private', 'tmp/m-manual.png', 'm'),
      sourced: await upload('private', 'tmp/m-sourced.png', 's'),
    });

    expect(entity.cover.name).toContain('posts/covers/');
    expect(entity.avatar.name).toContain('posts/avatars/');
    expect(entity.manual.name).toContain('posts/manual/');
    expect(entity.sourced.name).toContain('posts/sourced/');

    expect(await read('public', entity.cover.name)).toBe('c');
    expect(await read('private', entity.avatar.name)).toBe('a');
    expect(await read('private', entity.manual.name)).toBe('m');
    expect(await read('private', entity.sourced.name)).toBe('s');

    for (const slot of ['cover', 'avatar', 'manual', 'sourced'] as const) {
      expect((await column<{ persisted: boolean }>(id, slot)).persisted).toBe(
        true,
      );
    }
  });

  it('promotes every entity of a multi-entity flush', async () => {
    const fork = em();
    const assets = await Promise.all([
      upload('public', 'tmp/batch-a.png', 'a'),
      upload('public', 'tmp/batch-b.png', 'b'),
      upload('public', 'tmp/batch-c.png', 'c'),
    ]);
    const posts = assets.map((cover, i) =>
      fork.create(
        TestPostSchema as never,
        {
          title: `batch-${i}`,
          cover,
        } as never,
      ),
    );
    for (const post of posts) {
      fork.persist(post);
    }
    await fork.flush();

    for (const [i, post] of posts.entries()) {
      const owned = (post as any).cover.name;
      expect(owned).toContain('posts/covers/');
      expect(await read('public', owned)).toBe(['a', 'b', 'c'][i]);
      expect(
        (await column<{ name: string }>((post as any).id, 'cover')).name,
      ).toBe(owned);
    }
  });

  it('creates a row from a remote URL via Asset.fromUrl', async () => {
    await disks.getDisk('public').put('remote/source.txt', 'remote-bytes');
    const remoteUrl = await disks
      .getDisk('public')
      .getSignedUrl('remote/source.txt');

    const { id, entity } = await insertPost({
      title: 'from-url',
      cover: Asset.fromUrl(remoteUrl, 'downloads', 'remote'),
    });

    expect(entity.cover.persisted).toBe(true);
    expect(entity.cover.name).toContain('posts/covers/');
    expect(await read('public', entity.cover.name)).toBe('remote-bytes');
    expect((await column<{ name: string }>(id, 'cover')).name).toBe(
      entity.cover.name,
    );
  });
});

describe('LOAD — resolving urls without touching storage', () => {
  it('computes a working signed url on load', async () => {
    const { id, entity } = await insertPost({
      title: 'load-signed',
      avatar: await upload('private', 'tmp/load.png', 'load-bytes'),
    });
    const name = entity.avatar.name;

    const loaded = await findPost(id);
    expect(loaded.avatar.url).toContain('X-Amz-Signature');
    const response = await fetch(loaded.avatar.url);
    expect(response.status).toBe(200);
    expect(await response.text()).toBe('load-bytes');
    expect(loaded.avatar.name).toBe(name);
  });

  it('leaves the url unresolved when preComputeUrl is off', async () => {
    const { id } = await insertPost({
      title: 'load-manual',
      manual: await upload('private', 'tmp/manual.png'),
    });

    const loaded = await findPost(id);
    expect(loaded.manual).toBeInstanceOf(Asset);
    expect(() => loaded.manual.url).toThrow(/not loaded/i);
  });

  it('never moves an object on read, even when the row says persisted:false', async () => {
    await disks.getDisk('private').put('legacy/kept.png', 'legacy');
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
    expect(loaded.avatar.name).toBe('legacy/kept.png');
    expect(loaded.avatar.persisted).toBe(false);
    expect(await exists('private', 'legacy/kept.png')).toBe(true);
    expect(await column<{ name: string }>(row.id, 'avatar')).toMatchObject({
      name: 'legacy/kept.png',
      persisted: false,
    });
  });

  it('a load followed by a flush issues no UPDATE (no url churn)', async () => {
    const { id } = await insertPost({
      title: 'no-churn',
      avatar: await upload('private', 'tmp/churn.png'),
    });

    const fork = em();
    const loaded = await findPost(id, fork);
    expect(loaded.avatar.url).toBeTruthy();

    const uow = fork.getUnitOfWork();
    uow.computeChangeSets();
    expect(uow.getChangeSets()).toHaveLength(0);
  });
});

describe('UPDATE — replacing and clearing', () => {
  it('promotes the replacement and deletes the old object after commit', async () => {
    const { id, entity } = await insertPost({
      title: 'replace',
      cover: await upload('public', 'tmp/old.png', 'old'),
    });
    const oldKey = entity.cover.name;

    const fork = em();
    const loaded = await findPost(id, fork);
    loaded.cover = await upload('public', 'tmp/new.png', 'new');
    await fork.flush();

    const newKey = loaded.cover.name;
    expect(newKey).not.toBe(oldKey);
    expect((await column<{ name: string }>(id, 'cover')).name).toBe(newKey);
    expect(await read('public', newKey)).toBe('new');
    expect(await exists('public', oldKey)).toBe(false);
  });

  it('deletes the old object when the attachment is cleared', async () => {
    const { id, entity } = await insertPost({
      title: 'clear',
      cover: await upload('public', 'tmp/clear.png'),
    });
    const oldKey = entity.cover.name;

    const fork = em();
    const loaded = await findPost(id, fork);
    loaded.cover = null;
    await fork.flush();

    expect(await column(id, 'cover')).toBeNull();
    expect(await exists('public', oldKey)).toBe(false);
  });

  it('leaves the attachment alone when an unrelated column changes', async () => {
    const { id, entity } = await insertPost({
      title: 'untouched',
      cover: await upload('public', 'tmp/untouched.png', 'keep'),
    });
    const key = entity.cover.name;

    const fork = em();
    const loaded = await findPost(id, fork);
    loaded.title = 'untouched-renamed';
    await fork.flush();

    expect(await exists('public', key)).toBe(true);
    expect((await column<{ name: string }>(id, 'cover')).name).toBe(key);
  });
});

describe('DELETE — removing the row', () => {
  it('removes the object the deleted row owned', async () => {
    const { id, entity } = await insertPost({
      title: 'delete',
      cover: await upload('public', 'tmp/delete.png'),
    });
    const key = entity.cover.name;

    const fork = em();
    const loaded = await findPost(id, fork);
    fork.remove(loaded);
    await fork.flush();

    expect(await exists('public', key)).toBe(false);
  });
});

describe('transactions', () => {
  it('commits attach + old-object cleanup together (explicit transaction)', async () => {
    const { id, entity } = await insertPost({
      title: 'tx-commit',
      cover: await upload('public', 'tmp/tx-old.png', 'old'),
    });
    const oldKey = entity.cover.name;

    const fork = em();
    await fork.begin();
    const loaded = await findPost(id, fork);
    loaded.cover = await upload('public', 'tmp/tx-new.png', 'new');
    await fork.flush();

    expect(await exists('public', oldKey)).toBe(true);

    await fork.commit();

    expect(await exists('public', oldKey)).toBe(false);
    expect(await read('public', loaded.cover.name)).toBe('new');
  });

  it('restores the staged object when the transaction rolls back', async () => {
    const fork = em();
    await fork.begin();
    const asset = await upload('public', 'tmp/rollback.png', 'staged');
    const post = fork.create(
      TestPostSchema as never,
      {
        title: 'tx-rollback',
        cover: asset,
      } as never,
    ) as any;
    fork.persist(post);
    await fork.flush();

    const promoted = post.cover.name;
    expect(await exists('public', promoted)).toBe(true);

    await fork.rollback();

    expect(await exists('public', promoted)).toBe(false);
    expect(await read('public', 'tmp/rollback.png')).toBe('staged');
    expect(post.cover.name).toBe('tmp/rollback.png');
    expect(post.cover.persisted).toBe(false);

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
    const oldKey = entity.cover.name;

    const fork = em();
    await fork.begin();
    const loaded = await findPost(id, fork);
    loaded.cover = await upload('public', 'tmp/rr-new.png', 'new');
    await fork.flush();
    await fork.rollback();

    expect(await read('public', oldKey)).toBe('old');
    expect((await column<{ name: string }>(id, 'cover')).name).toBe(oldKey);
    expect(await read('public', 'tmp/rr-new.png')).toBe('new');
  });

  it('compensates when the database write itself fails', async () => {
    const fork = em();
    const asset = await upload('public', 'tmp/constraint.png', 'staged');
    fork.create(
      TestPostSchema as never,
      {
        title: null,
        cover: asset,
      } as never,
    );

    await expect(fork.flush()).rejects.toThrow();

    expect(await read('public', 'tmp/constraint.png')).toBe('staged');
    expect(asset.persisted).toBe(false);
  });

  it('deletes only the copy when a keepSource attach rolls back', async () => {
    const fork = em();
    await fork.begin();
    const asset = await upload('private', 'agents/thread-2/keep.png', 'kept');
    const post = fork.create(
      TestPostSchema as never,
      {
        title: 'tx-keep-source',
        sourced: asset,
      } as never,
    ) as any;
    fork.persist(post);
    await fork.flush();
    const copyKey = post.sourced.name;

    await fork.rollback();

    expect(await read('private', 'agents/thread-2/keep.png')).toBe('kept');
    expect(await exists('private', copyKey)).toBe(false);
  });

  it('commits through em.transactional()', async () => {
    const asset = await upload('public', 'tmp/transactional.png', 'tx');
    let id = '';
    await (orm.em.fork() as any).transactional(async (tx: any) => {
      const post = tx.create(
        TestPostSchema as never,
        {
          title: 'transactional',
          cover: asset,
        } as never,
      );
      tx.persist(post);
      await tx.flush();
      id = post.id;
    });

    const stored = await column<{ name: string }>(id, 'cover');
    expect(stored.name).toContain('posts/covers/');
    expect(await read('public', stored.name)).toBe('tx');
  });

  it('compensates every attach of a rolled-back multi-flush transaction', async () => {
    const fork = em();
    await fork.begin();

    const first = await upload('public', 'tmp/multi-1.png', 'one');
    const postA = fork.create(
      TestPostSchema as never,
      {
        title: 'multi-flush-a',
        cover: first,
      } as never,
    ) as any;
    fork.persist(postA);
    await fork.flush();

    const second = await upload('public', 'tmp/multi-2.png', 'two');
    const postB = fork.create(
      TestPostSchema as never,
      {
        title: 'multi-flush-b',
        cover: second,
      } as never,
    ) as any;
    fork.persist(postB);
    await fork.flush();

    const promotedA = postA.cover.name;
    const promotedB = postB.cover.name;

    await fork.rollback();

    expect(await exists('public', promotedA)).toBe(false);
    expect(await exists('public', promotedB)).toBe(false);
    expect(await read('public', 'tmp/multi-1.png')).toBe('one');
    expect(await read('public', 'tmp/multi-2.png')).toBe('two');
  });
});

describe('two entities whose classes report the same name', () => {
  it('keeps each entity on its own attachment options', async () => {
    const fork = em();
    const left = fork.create(
      ClashLeftSchema as never,
      {
        file: await upload('public', 'tmp/clash-left.png', 'left'),
      } as never,
    ) as any;
    const right = fork.create(
      ClashRightSchema as never,
      {
        file: await upload('public', 'tmp/clash-right.png', 'right'),
      } as never,
    ) as any;
    fork.persist(left);
    fork.persist(right);
    await fork.flush();

    expect(left.file.name).toMatch(/^clash\/left\//);
    expect(right.file.name).toMatch(/^clash\/right\//);
    expect(await read('public', left.file.name)).toBe('left');
    expect(await read('public', right.file.name)).toBe('right');
  });
});

describe('embeddables — the production shape', () => {
  it('promotes an asset nested two embeddables deep', async () => {
    const { id, entity } = await insertPost({
      title: 'embedded-create',
      documents: documents({
        label: 'Documento de Identificação',
        status: 'PENDING',
        asset: await upload('private', 'tmp/doc.pdf', 'doc-bytes'),
      }),
    });

    const owned = entity.documents.identification.asset.name;
    expect(owned).toMatch(/^cases\/documents\/[0-9a-f-]{36}\.pdf$/);
    expect(await read('private', owned)).toBe('doc-bytes');
    expect(await exists('private', 'tmp/doc.pdf')).toBe(false);

    const stored = await column<{ name: string; persisted: boolean }>(
      id,
      'documents_identification_asset',
    );
    expect(stored.name).toBe(owned);
    expect(stored.persisted).toBe(true);
  });

  it('computes the signed url of a nested asset on load', async () => {
    const { id } = await insertPost({
      title: 'embedded-load',
      documents: documents({
        label: 'Documento de Identificação',
        status: 'PENDING',
        asset: await upload('private', 'tmp/doc-load.pdf', 'load-bytes'),
      }),
    });

    const loaded = await findPost(id);
    const asset = loaded.documents.identification.asset;
    expect(asset).toBeInstanceOf(Asset);
    expect(asset.url).toContain('X-Amz-Signature');
    const response = await fetch(asset.url);
    expect(response.status).toBe(200);
    expect(await response.text()).toBe('load-bytes');
    expect(loaded.documents.identification.label).toBe(
      'Documento de Identificação',
    );
    expect(loaded.documents.identification.status).toBe('PENDING');
  });

  it('replaces a nested asset and cleans up the old object', async () => {
    const { id, entity } = await insertPost({
      title: 'embedded-replace',
      documents: documents({
        label: 'Doc',
        status: 'PENDING',
        asset: await upload('private', 'tmp/doc-old.pdf', 'old'),
      }),
    });
    const oldKey = entity.documents.identification.asset.name;

    const fork = em();
    const loaded = await findPost(id, fork);
    loaded.documents.identification.asset = await upload(
      'private',
      'tmp/doc-new.pdf',
      'new',
    );
    await fork.flush();

    const newKey = loaded.documents.identification.asset.name;
    expect(newKey).not.toBe(oldKey);
    expect(
      (await column<{ name: string }>(id, 'documents_identification_asset'))
        .name,
    ).toBe(newKey);
    expect(await read('private', newKey)).toBe('new');
    expect(await exists('private', oldKey)).toBe(false);
  });

  it('clears a nested asset and deletes its object', async () => {
    const { id, entity } = await insertPost({
      title: 'embedded-clear',
      documents: documents({
        label: 'Doc',
        status: 'PENDING',
        asset: await upload('private', 'tmp/doc-clear.pdf'),
      }),
    });
    const key = entity.documents.identification.asset.name;

    const fork = em();
    const loaded = await findPost(id, fork);
    loaded.documents.identification.asset = null;
    await fork.flush();

    expect(await column(id, 'documents_identification_asset')).toBeNull();
    expect(await exists('private', key)).toBe(false);
  });

  it('restores a nested staged object when the transaction rolls back', async () => {
    const fork = em();
    await fork.begin();
    const asset = await upload('private', 'tmp/doc-rollback.pdf', 'staged');
    const post = fork.create(
      TestPostSchema as never,
      {
        title: 'embedded-rollback',
        documents: documents({ label: 'Doc', status: 'PENDING', asset }),
      } as never,
    ) as any;
    fork.persist(post);
    await fork.flush();
    const promoted = post.documents.identification.asset.name;

    await fork.rollback();

    expect(await exists('private', promoted)).toBe(false);
    expect(await read('private', 'tmp/doc-rollback.pdf')).toBe('staged');
  });

  it('removes the nested object when the owning row is deleted', async () => {
    const { id, entity } = await insertPost({
      title: 'embedded-delete',
      documents: documents({
        label: 'Doc',
        status: 'PENDING',
        asset: await upload('private', 'tmp/doc-delete.pdf'),
      }),
    });
    const key = entity.documents.identification.asset.name;

    const fork = em();
    fork.remove(await findPost(id, fork));
    await fork.flush();

    expect(await exists('private', key)).toBe(false);
  });
});

describe('folder strategies (dynamic options)', () => {
  const strategyColumn = async (id: string, name: string) => {
    const [row] = (await orm.em
      .getConnection()
      .execute(
        `select ${name} as value from ${table('attachment_strategy_post')} where id = ?`,
        [id],
      )) as { value: { name: string } | null }[];
    return row?.value;
  };

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

    expect(entity.byDate.name).toMatch(
      /^archive\/2026\/08\/[0-9a-f-]{36}\.png$/,
    );
    expect(await read('public', entity.byDate.name)).toBe('D');
  });

  it('passes the owning entity, Adonis-style', async () => {
    const entity = await createStrategyPost({
      slug: 'my-post',
      byEntity: await upload('public', 'tmp/by-entity.png', 'E'),
    });

    expect(entity.byEntity.name).toMatch(
      /^posts\/my-post\/[0-9a-f-]{36}\.png$/,
    );
    expect((await strategyColumn(entity.id, 'by_entity'))?.name).toBe(
      entity.byEntity.name,
    );
  });

  it('reads the ambient AssetContext a middleware opened', async () => {
    const entity = await AssetContext.run({ tenantId: 'acme' }, async () =>
      createStrategyPost({
        slug: 'scoped',
        byTenant: await upload('private', 'tmp/scoped.png', 'T'),
      }),
    );

    expect(entity.byTenant.name).toMatch(
      /^tenants\/acme\/byTenant\/[0-9a-f-]{36}\.png$/,
    );
    expect(await read('private', entity.byTenant.name)).toBe('T');
  });

  it('falls back to the globals when no scope is open', async () => {
    AssetContext.setGlobals({ tenantId: 'root' });
    try {
      const entity = await createStrategyPost({
        slug: 'global',
        byTenant: await upload('private', 'tmp/global.png', 'G'),
      });
      expect(entity.byTenant.name).toMatch(/^tenants\/root\/byTenant\//);
    } finally {
      AssetContext.clearGlobals();
    }
  });

  it('a nested scope narrows rather than replaces', async () => {
    const entity = await AssetContext.run({ tenantId: 'outer' }, () =>
      AssetContext.run({ keepEverything: true }, async () =>
        createStrategyPost({
          slug: 'nested',
          byTenant: await upload('private', 'agents/thread/keep.png', 'N'),
        }),
      ),
    );

    expect(entity.byTenant.name).toMatch(/^tenants\/outer\/byTenant\//);
    expect(await exists('private', 'agents/thread/keep.png')).toBe(true);
    expect(await read('private', entity.byTenant.name)).toBe('N');
  });

  it('resolves the SAME key on load as it wrote (url stays fetchable)', async () => {
    const entity = await AssetContext.run({ tenantId: 'acme' }, async () =>
      createStrategyPost({
        slug: 'roundtrip',
        byTenant: await upload('private', 'tmp/roundtrip.png', 'R'),
      }),
    );
    const key = entity.byTenant.name;

    const loaded = (await em().findOne(
      StrategyPostSchema as never,
      {
        id: entity.id,
      } as never,
    )) as any;

    expect(loaded.byTenant.name).toBe(key);
    const response = await fetch(loaded.byTenant.url);
    expect(response.status).toBe(200);
    expect(await response.text()).toBe('R');
  });
});
