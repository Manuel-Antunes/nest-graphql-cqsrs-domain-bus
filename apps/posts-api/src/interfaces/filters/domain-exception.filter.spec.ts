import type { ArgumentsHost } from '@nestjs/common';
import { AlreadyDeletedException } from '@nestposts/platform/domain/shared/soft-delete/already-deleted.exception';
import { NotDeletedException } from '@nestposts/platform/domain/shared/soft-delete/not-deleted.exception';
import { InvalidPostException } from '@nestposts/posts/domain/post/exception/invalid-post.exception';
import { PostAlreadyExistsException } from '@nestposts/posts/domain/post/exception/post-already-exists.exception';
import { PostNotFoundException } from '@nestposts/posts/domain/post/exception/post-not-found.exception';
import { PostId } from '@nestposts/posts/domain/post/vo/post-id';
import { TagNotFoundException } from '@nestposts/posts/domain/tag/exception/tag-not-found.exception';
import { TagId } from '@nestposts/posts/domain/tag/vo/tag-id';
import { GraphQLError } from 'graphql';
import { z } from 'zod';

import { DomainExceptionFilter } from './domain-exception.filter';

describe('DomainExceptionFilter', () => {
  const filter = new DomainExceptionFilter();
  const host = {} as ArgumentsHost;

  it.each([
    [new InvalidPostException('title não pode ser vazio'), 'BAD_USER_INPUT'],
    [new PostNotFoundException(new PostId('x')), 'NOT_FOUND'],
    [new TagNotFoundException(new TagId('x')), 'NOT_FOUND'],
    [new PostAlreadyExistsException(new PostId('x')), 'CONFLICT'],
    [new AlreadyDeletedException('post-x'), 'BAD_USER_INPUT'],
    [new NotDeletedException('post-x'), 'BAD_USER_INPUT'],
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

  it('turns a ZodError from the edge into BAD_USER_INPUT with the pretty message', () => {
    const { error } = z.uuid().safeParse('nao-existe');

    const translated = filter.catch(error!, host);

    expect(translated.extensions.code).toBe('BAD_USER_INPUT');
    expect(translated.message).toMatch(/Invalid UUID/);
  });
});
