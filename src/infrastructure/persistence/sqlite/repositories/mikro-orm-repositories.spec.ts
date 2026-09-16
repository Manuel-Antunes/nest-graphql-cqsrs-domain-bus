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
import { Author } from '../../../../domain/user/author.entity';
import { AUTHOR_ROLE, User } from '../../../../domain/user/user.entity';
import { Email } from '../../../../domain/user/vo/email';
import { UserRepository } from '../../../../domain/user/user.repository';
import { UserId } from '../../../../domain/user/vo/user-id';

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

  const inContext = <T>(work: () => Promise<T>) => inRequestContext(module, work);

  describe('MikroOrmPostRepository', () => {
    it('save grava, e findById devolve com tags e autor populados', async () => {
      const tag = await givenATag(module, 'dev');
      const post = await givenAPost(module, { tags: [tag] });

      const found = await inContext(() => posts.findById(post.id));

      expect(found?.id.equals(post.id)).toBe(true);
      expect(found?.tags.getItems().map((each) => each.name.value)).toEqual(['dev']);
      expect(found?.author.getEntity().name.value).toBe('manuel');
    });

    it('findById devolve null para um id que não existe', async () => {
      expect(await inContext(() => posts.findById(PostId.generate()))).toBeNull();
    });

    it('um post apagado some das consultas — é o filtro active agindo', async () => {
      const post = await givenAPost(module);
      await inContext(async () => {
        const found = await posts.findById(post.id);
        found!.softDelete(new Date());
        await posts.save(found!);
      });

      expect(await inContext(() => posts.findById(post.id))).toBeNull();
    });

    it('restore torna a linha visível de novo, e só então o agregado pode decidir', async () => {
      const post = await givenAPost(module);
      await inContext(async () => {
        const found = await posts.findById(post.id);
        found!.softDelete(new Date());
        await posts.save(found!);
      });
      expect(await inContext(() => posts.findById(post.id))).toBeNull();

      await inContext(() => posts.restore(post.id));

      const back = await inContext(() => posts.findById(post.id));
      expect(back?.id.equals(post.id)).toBe(true);
      expect(back?.isDeleted()).toBe(false);
    });

    it('restaurar um post que nunca foi apagado não muda nada', async () => {
      const post = await givenAPost(module);

      await inContext(() => posts.restore(post.id));

      expect((await inContext(() => posts.findById(post.id)))?.isDeleted()).toBe(false);
    });

    it('findAll pagina por cursor em ordem de criação', async () => {
      const first = await givenAPost(module, { title: 'primeiro', createdAt: T0 });
      const second = await givenAPost(module, {
        title: 'segundo',
        createdAt: new Date(T0.getTime() + 60_000),
      });

      const page = await inContext(() => posts.findAll({ first: 1 }));

      expect(page.items.map((each) => each.title.value)).toEqual(['primeiro']);
      expect(page.hasNextPage).toBe(true);
      expect(page.totalCount).toBe(2);

      const next = await inContext(() => posts.findAll({ first: 1, after: page.endCursor }));

      expect(next.items.map((each) => each.id.value)).toEqual([second.id.value]);
      expect(next.hasNextPage).toBe(false);
      expect(first.id.equals(page.items[0].id)).toBe(true);
    });

    it('findAll com after nulo é a primeira página', async () => {
      await givenAPost(module);

      const page = await inContext(() => posts.findAll({ first: 10, after: null }));

      expect(page.items).toHaveLength(1);
      expect(page.hasPrevPage).toBe(false);
    });
  });

  describe('MikroOrmTagRepository', () => {
    it('acha pelo id e pelo nome, que é a chave única de negócio', async () => {
      const tag = await givenATag(module, 'dev');

      expect((await inContext(() => tags.findById(tag.id)))?.name.value).toBe('dev');
      expect((await inContext(() => tags.findByName(TagName.parse('dev'))))?.id.equals(tag.id)).toBe(true);
    });

    it('devolve null quando não existe, em vez de estourar', async () => {
      expect(await inContext(() => tags.findById(TagId.generate()))).toBeNull();
      expect(await inContext(() => tags.findByName(TagName.parse('inexistente')))).toBeNull();
    });
  });

  describe('MikroOrmUserRepository', () => {
    it('findById devolve o tipo concreto certo', async () => {
      const author = await givenAnAuthor(module);

      const found = await inContext(() => users.findById(author.id));

      expect(found?.canWritePosts()).toBe(true);
      expect(await inContext(() => users.findById(UserId.generate()))).toBeNull();
    });

    it('findActiveByEmail ignora quem foi encerrado por promoção', async () => {
      const email = 'promovido@example.com';
      const reader = await givenAnAuthor(module, email);
      const sucessorId = UserId.generate();
      await inContext(async () => {
        const encerrado = await users.findById(reader.id);
        encerrado!.supersede(sucessorId, new Date());
        encerrado!.uncommit();
        const sucessor = Author.register(sucessorId, { email, name: 'manuel' }, AUTHOR_ROLE, new Date(), reader.id);
        sucessor.uncommit();
        await users.saveAll([sucessor, encerrado!]);
      });

      const ativo = await inContext(() => users.findActiveByEmail(Email.parse(email)));

      expect(ativo?.id.equals(sucessorId)).toBe(true);
      expect(ativo?.id.equals(reader.id)).toBe(false);
      expect(await freshEm(module).count(User, {}, { filters: false })).toBe(2);
    });

    it('findActiveByEmail devolve null para um email desconhecido', async () => {
      const author = await givenAnAuthor(module, 'conhecido@example.com');

      expect((await inContext(() => users.findActiveByEmail(author.email)))?.id.equals(author.id)).toBe(true);
      expect(await inContext(() => users.findActiveByEmail(Email.parse('outro@example.com')))).toBeNull();
    });

    it('saveAll grava vários numa transação só', async () => {
      const primeiro = await givenAnAuthor(module, 'a@example.com');
      const segundo = await givenAnAuthor(module, 'b@example.com');
      await inContext(async () => {
        const carregados = await Promise.all([users.findById(primeiro.id), users.findById(segundo.id)]);
        await users.saveAll(carregados.filter((each): each is User => each !== null));
      });

      expect(await freshEm(module).count(User)).toBe(2);
    });

    it('findSupersededBy acha o stream encerrado a partir do sucessor', async () => {
      const email = 'voltando@example.com';
      const antigo = await givenAnAuthor(module, email);
      const sucessorId = UserId.generate();
      await inContext(async () => {
        const encerrado = await users.findById(antigo.id);
        encerrado!.supersede(sucessorId, new Date());
        encerrado!.uncommit();
        const sucessor = Author.register(sucessorId, { email, name: 'manuel' }, AUTHOR_ROLE, new Date(), antigo.id);
        sucessor.uncommit();
        await users.saveAll([sucessor, encerrado!]);
      });

      const encontrado = await inContext(() => users.findSupersededBy(sucessorId));

      expect(encontrado?.id.equals(antigo.id)).toBe(true);
      expect(await inContext(() => users.findSupersededBy(UserId.generate()))).toBeNull();
    });

    it('restore traz de volta um user apagado', async () => {
      const author = await givenAnAuthor(module);
      await inContext(async () => {
        const found = await users.findById(author.id);
        found!.softDelete(new Date());
        await users.save(found!);
      });
      expect(await inContext(() => users.findById(author.id))).toBeNull();

      await inContext(() => users.restore(author.id));

      const back = await inContext(() => users.findById(author.id));
      expect(back?.id.equals(author.id)).toBe(true);
      expect(back?.isDeleted()).toBe(false);
    });
  });
});
