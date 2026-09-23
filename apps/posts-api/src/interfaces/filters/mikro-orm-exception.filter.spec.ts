import {
  ForeignKeyConstraintViolationException,
  NotFoundError,
  UniqueConstraintViolationException,
} from '@mikro-orm/core';
import type { ArgumentsHost } from '@nestjs/common';

import { MikroOrmExceptionFilter } from './mikro-orm-exception.filter';

describe('MikroOrmExceptionFilter', () => {
  const filter = new MikroOrmExceptionFilter();
  const host = {} as ArgumentsHost;

  const cases: Array<[Error, string]> = [
    [
      new ForeignKeyConstraintViolationException(
        new Error('FOREIGN KEY constraint failed'),
      ),
      'BAD_USER_INPUT',
    ],
    [
      new UniqueConstraintViolationException(
        new Error('UNIQUE constraint failed: tags.name'),
      ),
      'CONFLICT',
    ],
    [new NotFoundError('Post not found'), 'NOT_FOUND'],
  ];

  it.each(cases)('%s → %s', (exception, code) => {
    const error = filter.catch(exception, host);

    expect(error.extensions?.code).toBe(code);
  });

  it('a mensagem da chave estrangeira não diz qual das duas causas foi', () => {
    const violation = new ForeignKeyConstraintViolationException(
      new Error('FOREIGN KEY constraint failed'),
    );

    const error = filter.catch(violation, host);

    expect(error.message).toBe(
      'o autor informado não existe ou não pode escrever',
    );
    expect(error.message).not.toMatch(/FOREIGN KEY|constraint|sqlite/i);
  });

  it('não deixa a mensagem do driver vazar em nenhum dos casos', () => {
    for (const [exception] of cases) {
      expect(filter.catch(exception, host).message).not.toMatch(
        /constraint failed/i,
      );
    }
  });
});
