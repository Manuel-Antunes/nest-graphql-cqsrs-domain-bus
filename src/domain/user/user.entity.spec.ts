import { MikroORM } from '@mikro-orm/core';
import { defineConfig } from '@mikro-orm/sqlite';
import { PostSchema } from '../../infrastructure/persistence/sqlite/entities/post-orm.entity';
import { TagSchema } from '../../infrastructure/persistence/sqlite/entities/tag-orm.entity';
import {
  AuthorSchema,
  ReaderSchema,
  UserSchema,
} from '../../infrastructure/persistence/sqlite/entities/user-orm.entity';
import { UserDeletedEvent } from './event/user-deleted.event';
import { UserRegisteredEvent } from './event/user-registered.event';
import { UserRestoredEvent } from './event/user-restored.event';
import { UserSupersededEvent } from './event/user-superseded.event';
import { InvalidUserException } from './exception/invalid-user.exception';
import { issuesOf } from '../../../test/support/invalid-input';
import { AUTHOR_ROLE, User } from './user.entity';
import { Author } from './author.entity';
import { Reader } from './reader.entity';
import { Email } from './vo/email';
import { UserId } from './vo/user-id';
import { UserName } from './vo/user-name';

/**
 * Domínio puro: nenhum Nest, nenhum bus, **nenhum banco**. O único colaborador é o aggregate root.
 *
 * O `MikroORM.init` abaixo existe **só para descobrir as entidades** — sem `ensureDatabase`, nenhuma
 * tabela criada, nada lido ou escrito. É o mesmo preço que o `post.entity.spec` já pagava por causa
 * da `Collection` de tags, e agora vale aqui pelo mesmo motivo: `supersededBy`/`supersedes` são
 * `Ref<User>`, e `rel()` monta a referência pelo `EntityFactory` — sem metadata, o id não é
 * preenchido. É o custo de preferir relacionamento a id solto, e ele é este.
 */
describe('User', () => {
  let orm: MikroORM;

  beforeAll(async () => {
    orm = await MikroORM.init(
      defineConfig({
        dbName: ':memory:',
        entities: [PostSchema, TagSchema, UserSchema, ReaderSchema, AuthorSchema],
      }),
    );
  });

  afterAll(() => orm.close());

  const id = UserId.parse('4bc1e458-ec1d-4279-b74d-da537d18811c');
  const other = UserId.parse('e489c6c4-76e1-4959-8972-b80c2f9d23db');
  const now = new Date('2026-09-08T12:00:00.000Z');
  const later = new Date('2026-09-08T12:05:00.000Z');
  const input = { email: 'Manuel@Example.com ', name: ' Manuel ' };
  /** O estado observável, sem os internos do aggregate root. */
  const stateOf = ({ id, email, name, createdAt, version, supersededBy, supersedes, deletedAt }: User) => ({
    id, email, name, createdAt, version, deletedAt,
    // referências entram pelo id: duas `Ref` do mesmo user são objetos diferentes
    supersededBy: supersededBy?.id ?? null,
    supersedes: supersedes?.id ?? null,
  });

  describe('o papel decide a classe', () => {
    it('sem papel de autor, nasce Reader', () => {
      const user = Reader.register(id, input, null, now);

      expect(user).toBeInstanceOf(Reader);
      expect(user.canWritePosts()).toBe(false);
    });

    it('com papel de autor, nasce Author', () => {
      const user = Author.register(id, input, AUTHOR_ROLE, now);

      expect(user).toBeInstanceOf(Author);
      expect(user.canWritePosts()).toBe(true);
    });

    it('normaliza o email e o nome, e dispara UserRegistered', () => {
      const user = Reader.register(id, input, null, now);

      expect(user).toMatchObject({
        id,
        email: Email.parse('manuel@example.com'),
        name: UserName.parse('Manuel'),
        version: 1,
        supersedes: null,
      });
      expect(user.getUncommittedEvents()).toEqual([
        new UserRegisteredEvent(id.value, 'manuel@example.com', 'Manuel', null, null, now),
      ]);
    });

    it('rejeita email inválido e nome vazio sem disparar nada', () => {
      expect(() => Reader.register(id, { email: 'não-é-email', name: 'x' }, null, now)).toThrow(InvalidUserException);
      expect(issuesOf(() => Reader.register(id, { email: 'a@b.com', name: '   ' }, null, now))).toContain('name não pode ser vazio');
    });
  });

  /**
   * Decidir e evoluir chegam ao mesmo estado — a mesma afirmação que o `post.entity.spec` faz, e pelo
   * mesmo motivo: `register` termina chamando os `on<Evento>`, então "o que o command gravou" e "o que
   * sai de um replay" não podem divergir.
   *
   * Repare em como o replay é feito: `new Reader()` e `loadFromHistory`. Não há construtor nomeado
   * para isso, porque a classe é escolhida por quem chama — nos dois caminhos.
   */
  describe('reconstituir devolve o que decidir montou', () => {
    it('um Reader replica o estado que a decisão montou', () => {
      const decided = Reader.register(id, input, null, now);

      const sourced = new Reader();
      sourced.loadFromHistory(decided.getUncommittedEvents());

      expect(sourced.getUncommittedEvents()).toEqual([]);
      expect(stateOf(sourced)).toEqual(stateOf(decided));
    });

    it('um Author replica o estado, e continua sabendo escrever', () => {
      const decided = Author.register(id, input, AUTHOR_ROLE, now);

      const sourced = new Author();
      sourced.loadFromHistory(decided.getUncommittedEvents());

      expect(sourced.canWritePosts()).toBe(true);
      expect(stateOf(sourced)).toEqual(stateOf(decided));
    });
  });

  describe('promover é encerrar um stream e abrir outro', () => {
    it('supersede encerra o stream apontando para o sucessor', () => {
      const reader = Reader.register(id, input, null, now);
      reader.uncommit();

      reader.supersede(other, later);

      expect(reader.supersededBy?.id.equals(other)).toBe(true);
      expect(reader.isActive()).toBe(false);
      expect(reader.getUncommittedEvents()).toEqual([new UserSupersededEvent(id.value, other.value, later)]);
    });

    it('o novo stream nasce Author e aponta de volta para o encerrado', () => {
      const author = Author.register(other, input, AUTHOR_ROLE, later, id);

      expect(author).toBeInstanceOf(Author);
      expect(author.supersedes?.id.equals(id)).toBe(true);
      expect(author.isActive()).toBe(true);
    });

    it('um stream já encerrado não encerra de novo, e ninguém sucede a si mesmo', () => {
      const reader = Reader.register(id, input, null, now).supersede(other, later);

      expect(() => reader.supersede(other, later)).toThrow(/já foi encerrado/);
      expect(() => Reader.register(id, input, null, now).supersede(id, later)).toThrow(/a si mesmo/);
    });

    it('o Reader promovido continua Reader — a classe é do stream, não do papel de hoje', () => {
      const reader = Reader.register(id, input, null, now).supersede(other, later);

      expect(reader).toBeInstanceOf(Reader);
      expect(reader.canWritePosts()).toBe(false);
    });
  });

  describe('apagar é reversível', () => {
    it('softDelete marca a data e tira o user de circulação', () => {
      const user = Reader.register(id, input, null, now);
      user.uncommit();

      user.softDelete(later);

      expect(user.deletedAt).toBe(later);
      expect(user.isActive()).toBe(false);
      expect(user.getUncommittedEvents()).toEqual([new UserDeletedEvent(id.value, later)]);
    });

    it('restore limpa a data', () => {
      const user = Reader.register(id, input, null, now).softDelete(later);
      user.uncommit();

      user.restore(later);

      expect(user.deletedAt).toBeNull();
      expect(user.isActive()).toBe(true);
      expect(user.getUncommittedEvents()).toEqual([new UserRestoredEvent(id.value, later)]);
    });

    it('não apaga duas vezes nem restaura o que não está apagado', () => {
      const user = Reader.register(id, input, null, now);

      expect(() => user.restore(later)).toThrow(/não está apagado/);
      user.softDelete(later);
      expect(() => user.softDelete(later)).toThrow(/já está apagado/);
    });
  });

  it('a versão conta os eventos aplicados', () => {
    const user = Reader.register(id, input, null, now);
    expect(user.version).toBe(1);

    user.softDelete(later);
    user.restore(later);

    expect(user.version).toBe(3);
    const sourced = new Reader();
    sourced.loadFromHistory(user.getUncommittedEvents());
    expect(sourced.version).toBe(3);
  });
});
