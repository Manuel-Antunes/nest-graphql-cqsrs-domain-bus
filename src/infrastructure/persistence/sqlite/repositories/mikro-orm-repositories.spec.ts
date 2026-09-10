import type { TestingModule } from '@nestjs/testing';
import {
  createCqrsTestingModule,
  freshEm,
  inRequestContext,
} from '../../../../../test/support/cqrs-testing-module';
import { givenAnAuthor, givenAPost, givenATag, T0 } from '../../../../../test/support/post-fixtures';
import { Post } from '../../../../domain/post/post.entity';
import { PostRepository } from '../../../../domain/post/post.repository';
import { PostId } from '../../../../domain/post/vo/post-id';
import { TagRepository } from '../../../../domain/tag/tag.repository';
import { TagId } from '../../../../domain/tag/vo/tag-id';
import { TagName } from '../../../../domain/tag/vo/tag-name';
import { AUTHOR_ROLE, User } from '../../../../domain/user/user.entity';
import { Users } from '../../../../domain/user/user.factory';
import { Email } from '../../../../domain/user/vo/email';
import { UserRepository } from '../../../../domain/user/user.repository';
import { UserId } from '../../../../domain/user/vo/user-id';

/**
 * Os adapters do MikroORM contra o banco de verdade — sem command, sem bus.
 *
 * O que estes testes cobrem não é "o ORM funciona": é a parte que é **decisão nossa** e que nenhum
 * teste de handler alcança, porque nenhum handler a usa ainda.
 *
 * O caso central é o `restore`. O filtro `active` recorta toda consulta, então uma linha apagada é
 * invisível até para o `findById` — restaurá-la exige uma escrita que passe **por fora do filtro**, e
 * é isso que o `nativeUpdate` com `filters: { active: false }` faz. Um `restore` que respeitasse o
 * filtro não encontraria nada para atualizar e falharia em silêncio: zero linhas afetadas, nenhum
 * erro, e o post continuaria sumido. É a regressão mais barata de introduzir aqui e a mais cara de
 * perceber, porque o caminho feliz nunca passa por ela.
 */
describe('adapters do MikroORM', () => {
  let module: TestingModule;
  let posts: PostRepository;
  let tags: TagRepository;
  let users: UserRepository;

  beforeEach(async () => {
    module = await createCqrsTestingModule([]);
    posts = module.get(PostRepository);
    tags = module.get(TagRepository);
    users = module.get(UserRepository);
  });

  afterEach(() => module.close());

  /** Cada acesso ao repositório é uma requisição, como na borda. */
  const inContext = <T>(work: () => Promise<T>) => inRequestContext(module, work);

  describe('MikroOrmPostRepository', () => {
    it('save grava, e findById devolve com tags e autor populados', async () => {
      // Arrange
      const tag = await givenATag(module, 'dev');
      const post = await givenAPost(module, { tags: [tag] });

      // Act
      const found = await inContext(() => posts.findById(post.id));

      // Assert — sem `populate`, ler o nome do autor estouraria em vez de responder
      expect(found?.id.equals(post.id)).toBe(true);
      expect(found?.tags.getItems().map((each) => each.name.value)).toEqual(['dev']);
      expect(found?.author.getEntity().name.value).toBe('manuel');
    });

    it('findById devolve null para um id que não existe', async () => {
      // Act / Assert
      expect(await inContext(() => posts.findById(PostId.generate()))).toBeNull();
    });

    it('um post apagado some das consultas — é o filtro active agindo', async () => {
      // Arrange
      const post = await givenAPost(module);
      await inContext(async () => {
        const found = await posts.findById(post.id);
        found!.softDelete(new Date());
        await posts.save(found!);
      });

      // Act / Assert
      expect(await inContext(() => posts.findById(post.id))).toBeNull();
    });

    /**
     * A escrita que passa por fora do filtro. Sem ela não haveria como restaurar: o `findById` não
     * acha a linha apagada, então não há entidade para o agregado decidir em cima.
     */
    it('restore torna a linha visível de novo, e só então o agregado pode decidir', async () => {
      // Arrange
      const post = await givenAPost(module);
      await inContext(async () => {
        const found = await posts.findById(post.id);
        found!.softDelete(new Date());
        await posts.save(found!);
      });
      expect(await inContext(() => posts.findById(post.id))).toBeNull();

      // Act
      await inContext(() => posts.restore(post.id));

      // Assert
      const back = await inContext(() => posts.findById(post.id));
      expect(back?.id.equals(post.id)).toBe(true);
      expect(back?.isDeleted()).toBe(false);
    });

    it('restaurar um post que nunca foi apagado não muda nada', async () => {
      // Arrange
      const post = await givenAPost(module);

      // Act
      await inContext(() => posts.restore(post.id));

      // Assert
      expect((await inContext(() => posts.findById(post.id)))?.isDeleted()).toBe(false);
    });

    it('findAll pagina por cursor em ordem de criação', async () => {
      // Arrange
      const first = await givenAPost(module, { title: 'primeiro', createdAt: T0 });
      const second = await givenAPost(module, {
        title: 'segundo',
        createdAt: new Date(T0.getTime() + 60_000),
      });

      // Act
      const page = await inContext(() => posts.findAll({ first: 1 }));

      // Assert
      expect(page.items.map((each) => each.title.value)).toEqual(['primeiro']);
      expect(page.hasNextPage).toBe(true);
      expect(page.totalCount).toBe(2);

      // Act — a página seguinte começa depois do cursor da anterior
      const next = await inContext(() => posts.findAll({ first: 1, after: page.endCursor }));

      // Assert
      expect(next.items.map((each) => each.id.value)).toEqual([second.id.value]);
      expect(next.hasNextPage).toBe(false);
      expect(first.id.equals(page.items[0].id)).toBe(true);
    });

    it('findAll com after nulo é a primeira página', async () => {
      // Arrange
      await givenAPost(module);

      // Act
      const page = await inContext(() => posts.findAll({ first: 10, after: null }));

      // Assert
      expect(page.items).toHaveLength(1);
      expect(page.hasPrevPage).toBe(false);
    });
  });

  describe('MikroOrmTagRepository', () => {
    it('acha pelo id e pelo nome, que é a chave única de negócio', async () => {
      // Arrange
      const tag = await givenATag(module, 'dev');

      // Act / Assert
      expect((await inContext(() => tags.findById(tag.id)))?.name.value).toBe('dev');
      expect((await inContext(() => tags.findByName(TagName.parse('dev'))))?.id.equals(tag.id)).toBe(true);
    });

    it('devolve null quando não existe, em vez de estourar', async () => {
      // Act / Assert
      expect(await inContext(() => tags.findById(TagId.generate()))).toBeNull();
      expect(await inContext(() => tags.findByName(TagName.parse('inexistente')))).toBeNull();
    });
  });

  describe('MikroOrmUserRepository', () => {
    /**
     * As consultas apontam para a raiz abstrata da herança multi-tabela: o que volta é o tipo
     * concreto, sem discriminador nenhum a inspecionar.
     */
    it('findById devolve o tipo concreto certo', async () => {
      // Arrange
      const author = await givenAnAuthor(module);

      // Act
      const found = await inContext(() => users.findById(author.id));

      // Assert
      expect(found?.canWritePosts()).toBe(true);
      expect(await inContext(() => users.findById(UserId.generate()))).toBeNull();
    });

    /**
     * A supersessão de verdade: o stream antigo é encerrado e o novo nasce com o **mesmo email**. O
     * índice único de email é parcial (só entre ativos), e é isso que permite os dois coexistirem —
     * mas `findActiveByEmail` precisa devolver **um** deles, o vivo.
     */
    it('findActiveByEmail ignora quem foi encerrado por promoção', async () => {
      // Arrange
      const email = 'promovido@example.com';
      const reader = await givenAnAuthor(module, email);
      const sucessorId = UserId.generate();
      await inContext(async () => {
        const encerrado = await users.findById(reader.id);
        encerrado!.supersede(sucessorId, new Date());
        encerrado!.uncommit();
        const sucessor = Users.register(sucessorId, { email, name: 'manuel' }, AUTHOR_ROLE, new Date(), reader.id);
        sucessor.uncommit();
        // o sucessor primeiro: a chave estrangeira não aceita a referência antes de a linha existir
        await users.saveAll([sucessor, encerrado!]);
      });

      // Act
      const ativo = await inContext(() => users.findActiveByEmail(Email.parse(email)));

      // Assert
      expect(ativo?.id.equals(sucessorId)).toBe(true);
      expect(ativo?.id.equals(reader.id)).toBe(false);
      expect(await freshEm(module).count(User, {}, { filters: false })).toBe(2);
    });

    it('findActiveByEmail devolve null para um email desconhecido', async () => {
      // Arrange
      const author = await givenAnAuthor(module, 'conhecido@example.com');

      // Act / Assert
      expect((await inContext(() => users.findActiveByEmail(author.email)))?.id.equals(author.id)).toBe(true);
      expect(await inContext(() => users.findActiveByEmail(Email.parse('outro@example.com')))).toBeNull();
    });

    it('saveAll grava vários numa transação só', async () => {
      // Arrange / Act
      const primeiro = await givenAnAuthor(module, 'a@example.com');
      const segundo = await givenAnAuthor(module, 'b@example.com');
      await inContext(async () => {
        const carregados = await Promise.all([users.findById(primeiro.id), users.findById(segundo.id)]);
        await users.saveAll(carregados.filter((each): each is User => each !== null));
      });

      // Assert
      expect(await freshEm(module).count(User)).toBe(2);
    });

    /** O caminho de volta da promoção: do sucessor para o stream que ele encerrou. */
    it('findSupersededBy acha o stream encerrado a partir do sucessor', async () => {
      // Arrange
      const email = 'voltando@example.com';
      const antigo = await givenAnAuthor(module, email);
      const sucessorId = UserId.generate();
      await inContext(async () => {
        const encerrado = await users.findById(antigo.id);
        encerrado!.supersede(sucessorId, new Date());
        encerrado!.uncommit();
        const sucessor = Users.register(sucessorId, { email, name: 'manuel' }, AUTHOR_ROLE, new Date(), antigo.id);
        sucessor.uncommit();
        await users.saveAll([sucessor, encerrado!]);
      });

      // Act
      const encontrado = await inContext(() => users.findSupersededBy(sucessorId));

      // Assert
      expect(encontrado?.id.equals(antigo.id)).toBe(true);
      // e um id que não sucedeu ninguém não acha nada
      expect(await inContext(() => users.findSupersededBy(UserId.generate()))).toBeNull();
    });

    /** Mesma escrita por fora do filtro do `PostRepository.restore`. */
    it('restore traz de volta um user apagado', async () => {
      // Arrange
      const author = await givenAnAuthor(module);
      await inContext(async () => {
        const found = await users.findById(author.id);
        found!.softDelete(new Date());
        await users.save(found!);
      });
      expect(await inContext(() => users.findById(author.id))).toBeNull();

      // Act
      await inContext(() => users.restore(author.id));

      // Assert
      const back = await inContext(() => users.findById(author.id));
      expect(back?.id.equals(author.id)).toBe(true);
      expect(back?.isDeleted()).toBe(false);
    });
  });
});
