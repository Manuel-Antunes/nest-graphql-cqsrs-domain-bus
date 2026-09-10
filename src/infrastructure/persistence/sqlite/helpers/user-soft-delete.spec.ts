import { MikroORM } from '@mikro-orm/core';
import { defineConfig } from '@mikro-orm/sqlite';
import { AUTHOR_ROLE, User } from '../../../../domain/user/user.entity';
import { Users } from '../../../../domain/user/user.factory';
import { Author } from '../../../../domain/user/author.entity';
import { PostSchema } from '../entities/post-orm.entity';
import { ACTIVE_FILTER } from '../entities/soft-delete-orm.entity';
import { SoftDeleteSubscriber } from './soft-delete.subscriber';
import { TagSchema } from '../entities/tag-orm.entity';
import { AuthorSchema, ReaderSchema, UserSchema } from '../entities/user-orm.entity';
import { UserId } from '../../../../domain/user/vo/user-id';
import { MikroOrmUserRepository } from '../repositories/mikro-orm-user.repository';

/**
 * A exclusão lógica do `User` contra o **banco**, e não contra objetos.
 *
 * É a contraparte do `UserSoftDeleteJpaTest` da versão Java, e existe pelo mesmo motivo: os outros
 * testes de soft delete provam as regras do mixin, não o SQL que sai. E é no SQL que mora a parte
 * frágil — numa herança multi-tabela apagar toca **duas** tabelas, e sem o subscriber a linha de
 * `authors` seria removida de verdade enquanto a de `users` só ficava marcada. O autor voltaria de um
 * restore como se fosse um leitor.
 *
 * É o tipo de bug que nenhum teste de unidade pega e que só aparece no ciclo apagar → restaurar
 * inteiro.
 */
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
        entities: [PostSchema, TagSchema, UserSchema, ReaderSchema, AuthorSchema],
        subscribers: [new SoftDeleteSubscriber()],
        ensureDatabase: { create: true },
      }),
    );

    const em = orm.em.fork();
    const author = Users.register(UserId.generate(), { email: EMAIL, name: 'Autor' }, AUTHOR_ROLE, NOW);
    author.uncommit();
    await em.persist(author).flush();
    authorId = author.id;
    users = new MikroOrmUserRepository(orm.em.fork());
  });

  afterEach(() => orm.close(true));

  /** Conta a linha sem passar pelo mapeamento — é o único jeito de enxergar o que o filtro esconde. */
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

      // some das consultas…
      expect(await users.findById(authorId)).toBeNull();
      expect(await users.findActiveByEmail(EMAIL as never)).toBeNull();
      // …mas a linha continua lá, marcada
      expect(await rawCount('users', `id = '${authorId.value}' and deleted_at is not null`)).toBe(1);
    });

    it('a linha da tabela filha sobrevive ao delete', async () => {
      await removeThroughOrm();

      // é o subscriber que segura isto: sem ele, o DELETE da tabela da herança passaria
      expect(await rawCount('authors', `id = '${authorId.value}'`)).toBe(1);
    });

    it('restaurar traz o Author de volta inteiro, com a subclasse intacta', async () => {
      await removeThroughOrm();

      await users.restore(authorId);

      const restored = await new MikroOrmUserRepository(orm.em.fork()).findById(authorId);
      expect(restored).toBeInstanceOf(Author);
      expect(restored?.canWritePosts()).toBe(true);
      expect(restored?.isDeleted()).toBe(false);
      expect(restored?.name.value).toBe('Autor');
    });
  });

  describe('apagar pelo domínio (o mixin)', () => {
    it('marcar pelo agregado e salvar tem o mesmo efeito', async () => {
      // o outro caminho: o domínio decide, o save persiste. Não passa por subscriber nenhum
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
