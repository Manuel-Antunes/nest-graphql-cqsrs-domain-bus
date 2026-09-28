import type { ArgumentsHost } from '@nestjs/common';
import { GraphQLError } from 'graphql';
import type { ZodError } from 'zod';
import { z } from 'zod';

import { ValidationExceptionFilter } from './validation-exception.filter';
import { ValidationMessage } from './validation-message';

describe('ValidationExceptionFilter', () => {
  const host = {} as ArgumentsHost;

  it('turns a ZodError from the edge into BAD_USER_INPUT with the pretty message', () => {
    const { error } = z.uuid().safeParse('nao-existe');

    const translated = new ValidationExceptionFilter().catch(
      error as ZodError,
      host,
    );

    expect(translated).toBeInstanceOf(GraphQLError);
    expect(translated.extensions).toEqual({ code: 'BAD_USER_INPUT' });
    expect(translated.message).toMatch(/Invalid UUID/);
  });
});

describe('ValidationMessage', () => {
  it('prints the ZodError an exception carries as its cause', () => {
    const { error } = z
      .object({ title: z.string().min(1, 'title cannot be empty') })
      .safeParse({ title: '' });

    const message = ValidationMessage.of(
      new Error('invalid post', {
        cause: new Error('wrapped', { cause: error }),
      }),
    );

    expect(message).toContain('title cannot be empty');
  });

  it('is the exception’s own message when no ZodError is behind it', () => {
    expect(ValidationMessage.of(new Error('no changes'))).toBe('no changes');
  });
});
