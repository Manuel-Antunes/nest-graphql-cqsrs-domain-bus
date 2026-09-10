import {
  ForeignKeyConstraintViolationException,
  NotFoundError,
  UniqueConstraintViolationException,
} from '@mikro-orm/core';
import type { ArgumentsHost } from '@nestjs/common';
import { MikroOrmExceptionFilter } from './mikro-orm-exception.filter';

/**
 * A tabela violação de integridade → erro de usuário.
 *
 * É o que torna possível confiar nas restrições do banco em vez de checar antes: sem tradução, uma
 * chave estrangeira recusada chegaria ao cliente como `INTERNAL_SERVER_ERROR` com uma mensagem de
 * driver, e ninguém trocaria uma checagem legível por isso.
 */
describe('MikroOrmExceptionFilter', () => {
  const filter = new MikroOrmExceptionFilter();
  const host = {} as ArgumentsHost;

  const cases: Array<[Error, string]> = [
    [new ForeignKeyConstraintViolationException(new Error('FOREIGN KEY constraint failed')), 'BAD_USER_INPUT'],
    [new UniqueConstraintViolationException(new Error('UNIQUE constraint failed: tags.name')), 'CONFLICT'],
    [new NotFoundError('Post not found'), 'NOT_FOUND'],
  ];

  it.each(cases)('%s → %s', (exception, code) => {
    // Act
    const error = filter.catch(exception, host);

    // Assert
    expect(error.extensions?.code).toBe(code);
  });

  it('a mensagem da chave estrangeira não diz qual das duas causas foi', () => {
    // Arrange — a FK dispara para um id inexistente E para um id de leitor
    const violation = new ForeignKeyConstraintViolationException(new Error('FOREIGN KEY constraint failed'));

    // Act
    const error = filter.catch(violation, host);

    // Assert — distinguir as duas seria um oráculo de quais usuários existem
    expect(error.message).toBe('o autor informado não existe ou não pode escrever');
    expect(error.message).not.toMatch(/FOREIGN KEY|constraint|sqlite/i);
  });

  it('não deixa a mensagem do driver vazar em nenhum dos casos', () => {
    // Arrange / Act / Assert
    for (const [exception] of cases) {
      expect(filter.catch(exception, host).message).not.toMatch(/constraint failed/i);
    }
  });
});
