import type { QueryBus } from '@nestjs/cqrs';
import { FindAuthorQuery } from '../../application/user/query/find-author.query';
import type { Author } from '../../domain/user/author.entity';
import { NotAnAuthorException } from '../../domain/user/exception/not-an-author.exception';
import { AUTHOR_ROLE } from '../../domain/user/user.entity';
import { Users } from '../../domain/user/user.factory';
import { PostId } from '../../domain/post/vo/post-id';
import { UserId } from '../../domain/user/vo/user-id';
import { AuthorView } from '../../dto/graphql/user.view';
import { PostView } from '../../dto/graphql/post.view';
import { UserViewMapper } from '../mapper/user-view.mapper';
import { PostAuthorResolver } from './post-author.resolver';

/**
 * `Post.author`, isolado: a troca do `authorId` da view pelo `Author` do protocolo.
 *
 * O que se afirma é a tradução em dois sentidos — o id da view vira a mensagem com o **value object**,
 * e o agregado vira `AuthorView` — e o que acontece quando o autor não está mais lá. Quantas consultas
 * custa é assunto do handler, e está no `find-author.query.spec`.
 */
describe('PostAuthorResolver', () => {
  const mapper = new UserViewMapper();
  const authorId = UserId.parse('3a7b1c2d-4e5f-4a6b-8c9d-0e1f2a3b4c5d');
  const now = new Date('2026-09-08T12:00:00.000Z');

  const anAuthor = (): Author => {
    const user = Users.register(authorId, { email: 'manuel@example.com', name: 'manuel' }, AUTHOR_ROLE, now);
    if (!user.canWritePosts()) {
      throw new Error('AUTHOR_ROLE precisa nascer Author');
    }
    return user;
  };

  const aPostView = () =>
    new PostView({
      id: PostId.generate(),
      title: 'um post',
      content: 'conteúdo',
      authorId: authorId.value,
      createdAt: now,
      updatedAt: now,
      version: 1,
      tags: [],
    });

  const resolverOn = (result: unknown) => {
    const dispatched: unknown[] = [];
    const bus = {
      execute: (query: unknown) => {
        dispatched.push(query);
        return Promise.resolve(result);
      },
    } as unknown as QueryBus;
    return { resolver: new PostAuthorResolver(bus, mapper), dispatched };
  };

  it('despacha FindAuthor com o authorId da view, como value object', async () => {
    const { resolver, dispatched } = resolverOn(anAuthor());

    await resolver.author(aPostView());

    expect(dispatched).toHaveLength(1);
    expect(dispatched[0]).toBeInstanceOf(FindAuthorQuery.FindAuthor);
    expect((dispatched[0] as FindAuthorQuery.FindAuthor).authorId.equals(authorId)).toBe(true);
  });

  it('devolve um AuthorView — o tipo que o `Author!` do schema promete', async () => {
    const { resolver } = resolverOn(anAuthor());

    const view = await resolver.author(aPostView());

    expect(view).toBeInstanceOf(AuthorView);
    expect(view.id.equals(authorId)).toBe(true);
    expect(view.name.value).toBe('manuel');
    expect(view.email.value).toBe('manuel@example.com');
  });

  /**
   * `Author!` é não-nulo, então não achar o autor não pode virar `null`: vira erro. A janela em que isso
   * acontece é estreita — o autor apagado entre o evento e a resolução —, mas calar sobre ela entregaria
   * ao cliente um campo não-nulo vazio, que é pior que um erro.
   */
  it('um autor que não está mais lá é um erro, e não um null', async () => {
    const { resolver } = resolverOn(null);

    await expect(resolver.author(aPostView())).rejects.toThrow(NotAnAuthorException);
  });

  it('o erro nomeia o autor que faltou', async () => {
    const { resolver } = resolverOn(null);

    await expect(resolver.author(aPostView())).rejects.toThrow(authorId.value);
  });
});
