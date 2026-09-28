import { MapMemberError } from '@automapper/core';
import type { ArgumentsHost, ExceptionFilter, Type } from '@nestjs/common';
import { Catch } from '@nestjs/common';
import { FILTER_CATCH_EXCEPTIONS } from '@nestjs/common/constants';
import { AssetExceptionFilter } from '@nestposts/asset/filters/asset-exception.filter';
import { CalendarEventExceptionFilter } from '@nestposts/events/filters/calendar-event-exception.filter';
import { OrganizationsExceptionFilter } from '@nestposts/organizations/filters/organizations-exception.filter';
import { SoftDeleteExceptionFilter } from '@nestposts/platform/filters/soft-delete-exception.filter';
import { PostsExceptionFilter } from '@nestposts/posts/filters/posts-exception.filter';
import { UsersExceptionFilter } from '@nestposts/users/filters/users-exception.filter';
import { ValidationExceptionFilter } from '@nestposts/validated-dto/filters/validation-exception.filter';
import { ValidationMessage } from '@nestposts/validated-dto/filters/validation-message';
import { GraphQLError } from 'graphql';

@Catch(MapMemberError)
export class MapperExceptionFilter implements ExceptionFilter {
  private static readonly CAUSES: readonly ExceptionFilter[] = [
    new PostsExceptionFilter(),
    new CalendarEventExceptionFilter(),
    new OrganizationsExceptionFilter(),
    new UsersExceptionFilter(),
    new SoftDeleteExceptionFilter(),
    new AssetExceptionFilter(),
    new ValidationExceptionFilter(),
  ];

  catch(exception: MapMemberError, host: ArgumentsHost): GraphQLError {
    const cause = MapperExceptionFilter.unwrap(exception);
    if (cause instanceof MapMemberError) {
      return new GraphQLError(cause.message, {
        extensions: { code: 'INTERNAL_SERVER_ERROR' },
      });
    }
    const filter = MapperExceptionFilter.CAUSES.find((candidate) =>
      MapperExceptionFilter.catches(candidate, cause),
    );
    return filter
      ? filter.catch(cause, host)
      : new GraphQLError(ValidationMessage.of(cause), {
          extensions: { code: 'BAD_USER_INPUT' },
        });
  }

  private static catches(filter: ExceptionFilter, exception: Error): boolean {
    const caught: Type<Error>[] =
      Reflect.getMetadata(FILTER_CATCH_EXCEPTIONS, filter.constructor) ?? [];
    return caught.some((type) => exception instanceof type);
  }

  private static unwrap(exception: Error): Error {
    return exception instanceof MapMemberError &&
      exception.originalError instanceof Error
      ? MapperExceptionFilter.unwrap(exception.originalError)
      : exception;
  }
}
