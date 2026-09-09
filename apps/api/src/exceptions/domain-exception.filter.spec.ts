import type { ArgumentsHost } from '@nestjs/common';
import { GraphQLError } from 'graphql';
import { z } from 'zod';
import { InvalidPostException } from '../domain/post/exception/invalid-post.exception';
import { PostAlreadyExistsException } from '../domain/post/exception/post-already-exists.exception';
import { PostNotFoundException } from '../domain/post/exception/post-not-found.exception';
import { TagNotFoundException } from '../domain/tag/exception/tag-not-found.exception';
import { DomainExceptionFilter } from './domain-exception.filter';

describe('DomainExceptionFilter', () => {
  const filter = new DomainExceptionFilter();
  const host = {} as ArgumentsHost;

  it.each([
    [new InvalidPostException('title não pode ser vazio'), 'BAD_USER_INPUT'],
    [new PostNotFoundException('x'), 'NOT_FOUND'],
    [new TagNotFoundException('x'), 'NOT_FOUND'],
    [new PostAlreadyExistsException('x'), 'CONFLICT'],
  ])('translates %s to a GraphQLError with the right code', (exception, code) => {
    const error = filter.catch(exception, host);

    expect(error).toBeInstanceOf(GraphQLError);
    expect(error.message).toBe(exception.message);
    expect(error.extensions).toEqual({ code });
  });

  it('turns a ZodError from the edge into BAD_USER_INPUT with the pretty message', () => {
    const { error } = z.uuid().safeParse('nao-existe');

    const translated = filter.catch(error!, host);

    expect(translated.extensions.code).toBe('BAD_USER_INPUT');
    expect(translated.message).toMatch(/Invalid UUID/);
  });
});
