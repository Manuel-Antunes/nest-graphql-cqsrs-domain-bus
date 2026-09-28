import type { ArgumentsHost } from '@nestjs/common';
import { GraphQLError } from 'graphql';
import { z } from 'zod';

import { InvalidPostException } from '../domain/post/exception/invalid-post.exception';
import { PostAlreadyExistsException } from '../domain/post/exception/post-already-exists.exception';
import { PostNotFoundException } from '../domain/post/exception/post-not-found.exception';
import { PostId } from '../domain/post/vo/post-id';
import { InvalidTagException } from '../domain/tag/exception/invalid-tag.exception';
import { TagAlreadyExistsException } from '../domain/tag/exception/tag-already-exists.exception';
import { TagNotFoundException } from '../domain/tag/exception/tag-not-found.exception';
import { TagId } from '../domain/tag/vo/tag-id';
import { PostsExceptionFilter } from './posts-exception.filter';

describe('PostsExceptionFilter', () => {
  const filter = new PostsExceptionFilter();
  const host = {} as ArgumentsHost;

  it.each([
    [new InvalidPostException('title não pode ser vazio'), 'BAD_USER_INPUT'],
    [new InvalidTagException('nome de tag inválido'), 'BAD_USER_INPUT'],
    [new PostNotFoundException(new PostId('x')), 'NOT_FOUND'],
    [new TagNotFoundException(new TagId('x')), 'NOT_FOUND'],
    [new PostAlreadyExistsException(new PostId('x')), 'CONFLICT'],
    [new TagAlreadyExistsException(new TagId('x')), 'CONFLICT'],
  ])(
    'translates %s to a GraphQLError with the right code',
    (exception, code) => {
      const error = filter.catch(exception, host);

      expect(error).toBeInstanceOf(GraphQLError);
      expect(error.message).toBe(exception.message);
      expect(error.extensions).toEqual({ code });
    },
  );

  it('prints the ZodError a domain exception carries as its cause', () => {
    const { error } = z
      .object({ title: z.string().min(1, 'title não pode ser vazio') })
      .safeParse({ title: '' });

    const translated = filter.catch(
      new InvalidPostException('post inválido', { cause: error }),
      host,
    );

    expect(translated.extensions.code).toBe('BAD_USER_INPUT');
    expect(translated.message).toContain('title não pode ser vazio');
  });
});
