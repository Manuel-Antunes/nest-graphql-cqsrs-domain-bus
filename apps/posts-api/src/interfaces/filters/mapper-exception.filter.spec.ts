import { MapMemberError } from '@automapper/core';
import type { ArgumentsHost } from '@nestjs/common';
import { InvalidPostException } from '@nestposts/posts/domain/post/exception/invalid-post.exception';
import { PostNotFoundException } from '@nestposts/posts/domain/post/exception/post-not-found.exception';
import { PostId } from '@nestposts/posts/domain/post/vo/post-id';
import { GraphQLError } from 'graphql';
import { z } from 'zod';

import { MapperExceptionFilter } from './mapper-exception.filter';

describe('MapperExceptionFilter', () => {
  const filter = new MapperExceptionFilter();
  const host = {} as ArgumentsHost;
  const mapping = (cause: unknown) =>
    new MapMemberError('title', 'NewPost', cause);

  it('answers for the domain exception the mapping failed on, with its own code', () => {
    const error = filter.catch(
      mapping(new PostNotFoundException(new PostId('x'))),
      host,
    );

    expect(error).toBeInstanceOf(GraphQLError);
    expect(error.extensions).toEqual({ code: 'NOT_FOUND' });
  });

  it('prints the issues of a value object that refused its input', () => {
    const { error: zodError } = z
      .object({ title: z.string().min(1, 'title não pode ser vazio') })
      .safeParse({ title: '' });

    const error = filter.catch(
      mapping(new InvalidPostException('post inválido', { cause: zodError })),
      host,
    );

    expect(error.extensions).toEqual({ code: 'BAD_USER_INPUT' });
    expect(error.message).toContain('title não pode ser vazio');
  });

  it('unwraps a mapping nested in another, down to the ZodError', () => {
    const { error: zodError } = z.uuid().safeParse('nao-existe');

    const error = filter.catch(mapping(mapping(zodError)), host);

    expect(error.extensions).toEqual({ code: 'BAD_USER_INPUT' });
    expect(error.message).toMatch(/Invalid UUID/);
  });

  it('calls any other cause bad input, in its own words', () => {
    const error = filter.catch(mapping(new Error('sem mudanças')), host);

    expect(error.extensions).toEqual({ code: 'BAD_USER_INPUT' });
    expect(error.message).toBe('sem mudanças');
  });

  it('is an internal error when the mapping failed on something that is not an error', () => {
    const error = filter.catch(mapping('not an error'), host);

    expect(error.extensions).toEqual({ code: 'INTERNAL_SERVER_ERROR' });
  });
});
