import type { ArgumentsHost } from '@nestjs/common';
import { GraphQLError } from 'graphql';

import { AlreadyDeletedException } from '../domain/shared/soft-delete/already-deleted.exception';
import { NotDeletedException } from '../domain/shared/soft-delete/not-deleted.exception';
import { SoftDeleteExceptionFilter } from './soft-delete-exception.filter';

describe('SoftDeleteExceptionFilter', () => {
  it.each([
    new AlreadyDeletedException('post-x'),
    new NotDeletedException('post-x'),
  ])('translates %s to BAD_USER_INPUT, keeping its message', (exception) => {
    const error = new SoftDeleteExceptionFilter().catch(
      exception,
      {} as ArgumentsHost,
    );

    expect(error).toBeInstanceOf(GraphQLError);
    expect(error.message).toBe(exception.message);
    expect(error.extensions).toEqual({ code: 'BAD_USER_INPUT' });
  });
});
