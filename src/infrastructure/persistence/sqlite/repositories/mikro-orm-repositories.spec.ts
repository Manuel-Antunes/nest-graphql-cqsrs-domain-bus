import type { TestingModule } from '@nestjs/testing';
import {
  createCqrsTestingModule,
  freshEm,
  inRequestContext,
} from '../../../../../test/support/cqrs-testing-module';
import { givenAnAuthor, givenAPost, givenATag, givenAUser, T0 } from '../../../../../test/support/post-fixtures';
import { Post } from '../../../../domain/post/post.entity';
import { PostRepository } from '../../../../domain/post/post.repository';
import { PostId } from '../../../../domain/post/vo/post-id';
import { TagRepository } from '../../../../domain/tag/tag.repository';
import { TagId } from '../../../../domain/tag/vo/tag-id';
import { TagName } from '../../../../domain/tag/vo/tag-name';
import { AUTHOR_ROLE, Author, Authorship } from '../../../../domain/user/author.entity';
import { AuthorRepository } from '../../../../domain/user/author.repository';
import { User } from '../../../../domain/user/user.entity';
import { Email } from '../../../../domain/user/vo/email';
import { UserRepository } from '../../../../domain/user/user.repository';
import { UserId } from '../../../../domain/user/vo/user-id';

describe('adapters do MikroORM', () => {
  let module: TestingModule;
  let posts: PostRepository;
  let tags: TagRepository;
  let users: UserRepository;
  let authors: AuthorRepository;

  beforeEach(async () => {
    module = await createCqrsTestingModule([]);
    posts = module.get(PostRepository);
    tags = module.get(TagRepository);
    users = module.get(UserRepository);
    authors = module.get(AuthorRepository);
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
      expect(found!.author.delegated().name.value).toBe('manuel');
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
    it('findById devolve o user com os papéis que ele carrega', async () => {
      const author = await givenAnAuthor(module);

      const found = await inContext(() => users.findById(author.id));

      expect(found?.hasRole(AUTHOR_ROLE)).toBe(true);
      expect(await inContext(() => users.findById(UserId.generate()))).toBeNull();
    });

    it('findByEmail acha quem está ativo, e devolve null para um email desconhecido', async () => {
      const author = await givenAnAuthor(module, 'conhecido@example.com');

      expect((await inContext(() => users.findByEmail(author.email)))?.id.equals(author.id)).toBe(true);
      expect(await inContext(() => users.findByEmail(Email.parse('outro@example.com')))).toBeNull();
    });

    it('findByEmail não enxerga quem foi apagado', async () => {
      const author = await givenAnAuthor(module, 'apagado@example.com');
      await inContext(async () => {
        const found = await users.findById(author.id);
        found!.softDelete(new Date());
        await users.save(found!);
      });

      expect(await inContext(() => users.findByEmail(author.email))).toBeNull();
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

  describe('MikroOrmAuthorRepository', () => {
    it('findById devolve o Author já castado, e null para quem não tem a linha delegada', async () => {
      const author = await givenAnAuthor(module);
      const semPapel = await givenAUser(module);

      const found = await inContext(() => authors.findById(author.id));

      expect(found).toBeInstanceOf(Author);
      expect(found!.id.equals(author.id)).toBe(true);
      expect(found!.name.value).toBe('manuel');
      expect(await inContext(() => authors.findById(semPapel.id))).toBeNull();
    });

    it('o Author que sai é o MESMO user do identity map, e não uma cópia', async () => {
      const author = await givenAnAuthor(module);

      const [user, cast] = await inContext(async () => [
        await users.findById(author.id),
        await authors.findById(author.id),
      ]);

      expect(cast).toBe(user);
      expect(cast).toBeInstanceOf(Author);
    });

    it('create anexa a delegação a um user que já existe, sem tocar no user', async () => {
      const user = await givenAUser(module);
      const created = await inContext(async () => {
        const found = await users.findById(user.id);
        found!.grantRole(AUTHOR_ROLE, new Date());
        found!.uncommit();
        await users.save(found!);
        return authors.create(found!);
      });

      expect(created).toBeInstanceOf(Author);
      expect(created.authorship).toBeInstanceOf(Authorship);
      expect(await freshEm(module).count(User)).toBe(1);
      expect(await freshEm(module).count(Authorship)).toBe(1);
    });
  });
});
