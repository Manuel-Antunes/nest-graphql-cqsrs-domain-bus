import type { ArgumentsHost } from '@nestjs/common';
import { ForeignKeyConstraintViolationException } from '@nestposts/database';

import { AuthorReferenceExceptionFilter } from './author-reference-exception.filter';

describe('AuthorReferenceExceptionFilter', () => {
  const violation = () =>
    new ForeignKeyConstraintViolationException(
      Object.assign(new Error('FOREIGN KEY constraint failed'), {
        code: '23503',
        detail: 'Key (author_id)=(x) is not present in table "authors".',
      }),
    );

  it('reads a broken reference on a post as its author, which is BAD_USER_INPUT', () => {
    const error = new AuthorReferenceExceptionFilter().catch(
      violation(),
      {} as ArgumentsHost,
    );

    expect(error.extensions).toEqual({ code: 'BAD_USER_INPUT' });
    expect(error.message).toBe(
      'o autor informado não existe ou não pode escrever',
    );
  });

  it('does not say which of the two it was, nor repeat the driver', () => {
    const error = new AuthorReferenceExceptionFilter().catch(
      violation(),
      {} as ArgumentsHost,
    );

    expect(error.message).not.toMatch(/FOREIGN KEY|constraint|authors"/i);
  });
});
