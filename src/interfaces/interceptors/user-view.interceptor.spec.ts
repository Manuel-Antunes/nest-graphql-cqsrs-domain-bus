import type { Mapper, ModelIdentifier } from '@automapper/core';
import type { CallHandler, ExecutionContext } from '@nestjs/common';
import { lastValueFrom, of } from 'rxjs';
import { AUTHOR_ROLE, User } from '../../domain/user/user.entity';
import { Author } from '../../domain/user/author.entity';
import { Reader } from '../../domain/user/reader.entity';
import { UserId } from '../../domain/user/vo/user-id';
import { AuthorView, ReaderView } from '../../dto/graphql/user.view';
import { UserViewInterceptor } from './user-view.interceptor';

describe('UserViewInterceptor', () => {
  const now = new Date('2026-09-08T12:00:00.000Z');

  const mapperSpy = () => {
    const dispatched: Array<[ModelIdentifier, ModelIdentifier]> = [];
    const mapper = {
      mapAsync: (_source: unknown, from: ModelIdentifier, to: ModelIdentifier) => {
        dispatched.push([from, to]);
        return Promise.resolve({ to });
      },
    } as unknown as Mapper;
    return { mapper, dispatched };
  };

  const intercept = async (user: User) => {
    const { mapper, dispatched } = mapperSpy();
    const next: CallHandler<User> = { handle: () => of(user) };
    await lastValueFrom(
      new UserViewInterceptor(mapper).intercept({} as ExecutionContext, next as CallHandler),
    );
    return dispatched;
  };

  const anAuthor = (): User =>
    Author.register(UserId.generate(), { email: 'quem@example.com', name: 'quem' }, AUTHOR_ROLE, now);
  const aReader = (): User =>
    Reader.register(UserId.generate(), { email: 'quem@example.com', name: 'quem' }, null, now);

  it('um autor é mapeado como Author → AuthorView', async () => {
    const author = anAuthor();
    expect(author).toBeInstanceOf(Author);

    const dispatched = await intercept(author);

    expect(dispatched).toEqual([[Author, AuthorView]]);
  });

  it('quem não escreve é mapeado como Reader → ReaderView', async () => {
    const reader = aReader();
    expect(reader).toBeInstanceOf(Reader);

    const dispatched = await intercept(reader);

    expect(dispatched).toEqual([[Reader, ReaderView]]);
  });

  it('a triagem é a que o agregado publica, e não uma reimplementada aqui', async () => {
    const user = aReader();
    vi.spyOn(user, 'canWritePosts').mockReturnValue(true as never);

    const dispatched = await intercept(user);

    expect(dispatched).toEqual([[Author, AuthorView]]);
  });
});
