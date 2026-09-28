import {
  SyntaxErrorException,
  UniqueConstraintViolationException,
} from '@mikro-orm/core';
import type { ArgumentsHost, HttpServer } from '@nestjs/common';
import { HttpStatus } from '@nestjs/common';
import { GraphQLError } from 'graphql';

import { DatabaseExceptionFilter } from './database-exception.filter';

describe('DatabaseExceptionFilter', () => {
  const duplicate = () =>
    new UniqueConstraintViolationException(
      Object.assign(new Error('driver says secret'), {
        code: '23505',
        detail: 'Key (name)=(secret) already exists.',
      }),
    );

  const internal = () =>
    new SyntaxErrorException(
      Object.assign(new Error('syntax error at or near "selec"'), {
        code: '42601',
      }),
    );

  const response = {};

  const hostOf = (type: string) =>
    ({
      getType: () => type,
      getArgByIndex: () => response,
    }) as unknown as ArgumentsHost;

  const httpAdapter = () => {
    const replies: Array<{ body: unknown; status: number }> = [];
    const adapter = {
      isHeadersSent: () => false,
      reply: (_: unknown, body: unknown, status: number) => {
        replies.push({ body, status });
      },
      end: () => undefined,
    } as unknown as HttpServer;
    return { filter: new DatabaseExceptionFilter(adapter), replies };
  };

  describe('in GraphQL', () => {
    it('answers with a GraphQLError carrying the code and the field', () => {
      const error = new DatabaseExceptionFilter().catch(
        duplicate(),
        hostOf('graphql'),
      );

      expect(error).toBeInstanceOf(GraphQLError);
      expect((error as GraphQLError).message).toBe(
        'a record with this name already exists',
      );
      expect((error as GraphQLError).extensions).toEqual({
        code: 'CONFLICT',
        field: 'name',
      });
    });

    it('rethrows what is not the caller’s to explain, for Yoga to mask and report', () => {
      const exception = internal();

      expect(() =>
        new DatabaseExceptionFilter().catch(exception, hostOf('graphql')),
      ).toThrow(exception);
    });
  });

  describe('over HTTP', () => {
    it('replies with the status and the facts, through the adapter', () => {
      const { filter, replies } = httpAdapter();

      filter.catch(duplicate(), hostOf('http'));

      expect(replies).toEqual([
        {
          status: HttpStatus.CONFLICT,
          body: {
            statusCode: HttpStatus.CONFLICT,
            message: 'a record with this name already exists',
            code: 'CONFLICT',
            field: 'name',
          },
        },
      ]);
    });

    it('answers what is not the caller’s to explain with a plain 500', () => {
      const { filter, replies } = httpAdapter();

      filter.catch(internal(), hostOf('http'));

      expect(replies).toEqual([
        {
          status: HttpStatus.INTERNAL_SERVER_ERROR,
          body: {
            statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
            message: 'Internal server error',
          },
        },
      ]);
    });
  });

  it('rethrows the very same exception for a message, so the transport retries it', () => {
    const exception = duplicate();

    expect(() =>
      new DatabaseExceptionFilter().catch(exception, hostOf('rpc')),
    ).toThrow(exception);
  });
});
