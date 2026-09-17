import { MikroORM } from '@mikro-orm/core';
import { defineConfig } from '@mikro-orm/sqlite';
import { User } from '../../../../domain/user/user.entity';
import { AUTHOR_ROLE, Authorship } from '../../../../domain/user/author.entity';
import { PostEntitySchema } from '../entities/post-orm.entity';
import { ACTIVE_FILTER } from './soft-delete-orm.entity';
import { SoftDeleteSubscriber } from './soft-delete.subscriber';
import { TagSchema } from '../entities/tag-orm.entity';
import { AuthorshipEntitySchema, UserEntitySchema } from '../entities/user-orm.entity';
import { UserId } from '../../../../domain/user/vo/user-id';
import { MikroOrmUserRepository } from '../repositories/mikro-orm-user.repository';

describe('soft delete do User, contra o banco', () => {
  let orm: MikroORM;
  let users: MikroOrmUserRepository;
  let authorId: UserId;

  const NOW = new Date('2026-09-05T12:00:00.000Z');
  const EMAIL = 'autor@example.com';

  beforeEach(async () => {
    orm = await MikroORM.init(
      defineConfig({
        dbName: ':memory:',
        entities: [PostEntitySchema, TagSchema, UserEntitySchema, AuthorshipEntitySchema],
        subscribers: [new SoftDeleteSubscriber()],
        ensureDatabase: { create: true },
      }),
    );

    const em = orm.em.fork();
    const author = User.register(UserId.generate(), { email: EMAIL, name: 'Autor' }, [AUTHOR_ROLE], NOW);
    author.uncommit();
    await em.persist(author).persist(Authorship.of(author)).flush();
    authorId = author.id;
    users = new MikroOrmUserRepository(orm.em.fork());
  });

  afterEach(() => orm.close(true));

  const rawCount = async (table: string, where: string): Promise<number> => {
    const [row] = await orm.em
      .fork()
      .getConnection()
      .execute(`select count(*) as total from ${table} where ${where}`);
    return Number(row.total);
  };

  describe('apagar pela porta do ORM (o subscriber)', () => {
    const removeThroughOrm = async () => {
      const em = orm.em.fork();
      const user = await em.findOneOrFail(User, { id: authorId });
      em.remove(user);
      await em.flush();
    };

    it('marca em vez de remover', async () => {
      await removeThroughOrm();

      expect(await users.findById(authorId)).toBeNull();
      expect(await users.findByEmail(EMAIL as never)).toBeNull();
      expect(await rawCount('users', `id = '${authorId.value}' and deleted_at is not null`)).toBe(1);
    });

    it('a linha da authorship sobrevive ao delete', async () => {
      await removeThroughOrm();

      expect(await rawCount('authors', `id = '${authorId.value}'`)).toBe(1);
    });

    it('restaurar traz o user de volta inteiro, com os papéis e a delegação intactos', async () => {
      await removeThroughOrm();

      await users.restore(authorId);

      const restored = await new MikroOrmUserRepository(orm.em.fork()).findById(authorId);
      expect(restored?.hasRole(AUTHOR_ROLE)).toBe(true);
      expect(restored?.isDeleted()).toBe(false);
      expect(restored?.name.value).toBe('Autor');
      expect(await orm.em.fork().findOne(Authorship, { user: authorId })).not.toBeNull();
    });
  });

  describe('apagar pelo domínio (o mixin)', () => {
    it('marcar pelo agregado e salvar tem o mesmo efeito', async () => {
      const em = orm.em.fork();
      const user = await em.findOneOrFail(User, { id: authorId });
      user.softDelete(NOW);
      user.uncommit();
      await em.flush();

      expect(await users.findById(authorId)).toBeNull();
      expect(await rawCount('users', `id = '${authorId.value}' and deleted_at is not null`)).toBe(1);
      expect(await rawCount('authors', `id = '${authorId.value}'`)).toBe(1);
    });

    it('e o instante gravado é o que o domínio decidiu, não o do subscriber', async () => {
      const em = orm.em.fork();
      const user = await em.findOneOrFail(User, { id: authorId });
      user.softDelete(NOW);
      user.uncommit();
      await em.flush();

      const deleted = await orm.em
        .fork()
        .findOneOrFail(User, { id: authorId }, { filters: { [ACTIVE_FILTER]: false } });
      expect(deleted.deletedAt).toEqual(NOW);
    });
  });
});
