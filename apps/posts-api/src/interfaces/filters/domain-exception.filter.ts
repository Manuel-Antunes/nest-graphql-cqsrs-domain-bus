import { MapMemberError } from '@automapper/core';
import type { ArgumentsHost, ExceptionFilter } from '@nestjs/common';
import { Catch } from '@nestjs/common';
import { UploadNotOwnedException } from '@nestposts/asset/domain/asset/upload-area';
import { CalendarEventNotFoundException } from '@nestposts/events/domain/calendar-event/exception/calendar-event-not-found.exception';
import { InvalidCalendarEventException } from '@nestposts/events/domain/calendar-event/exception/invalid-calendar-event.exception';
import { TeamNotFoundException } from '@nestposts/organizations/domain/organization/exception/team-not-found.exception';
import { AlreadyDeletedException } from '@nestposts/platform/domain/shared/soft-delete/already-deleted.exception';
import { NotDeletedException } from '@nestposts/platform/domain/shared/soft-delete/not-deleted.exception';
import { InvalidPostException } from '@nestposts/posts/domain/post/exception/invalid-post.exception';
import { PostAlreadyExistsException } from '@nestposts/posts/domain/post/exception/post-already-exists.exception';
import { PostNotFoundException } from '@nestposts/posts/domain/post/exception/post-not-found.exception';
import { InvalidTagException } from '@nestposts/posts/domain/tag/exception/invalid-tag.exception';
import { TagAlreadyExistsException } from '@nestposts/posts/domain/tag/exception/tag-already-exists.exception';
import { TagNotFoundException } from '@nestposts/posts/domain/tag/exception/tag-not-found.exception';
import { UserNotFoundException } from '@nestposts/users/domain/user/exception/user-not-found.exception';
import { GraphQLError } from 'graphql';
import { ZodError, z } from 'zod';

@Catch(
  InvalidPostException,
  InvalidTagException,
  PostNotFoundException,
  TagNotFoundException,
  PostAlreadyExistsException,
  TagAlreadyExistsException,
  InvalidCalendarEventException,
  CalendarEventNotFoundException,
  TeamNotFoundException,
  UserNotFoundException,
  AlreadyDeletedException,
  NotDeletedException,
  UploadNotOwnedException,
  ZodError,
  MapMemberError,
)
export class DomainExceptionFilter implements ExceptionFilter {
  catch(exception: Error, _host: ArgumentsHost): GraphQLError {
    const cause = DomainExceptionFilter.unwrap(exception);
    return new GraphQLError(DomainExceptionFilter.messageOf(cause), {
      extensions: { code: DomainExceptionFilter.codeOf(cause) },
    });
  }

  private static unwrap(exception: Error): Error {
    return exception instanceof MapMemberError &&
      exception.originalError instanceof Error
      ? DomainExceptionFilter.unwrap(exception.originalError)
      : exception;
  }

  private static codeOf(exception: Error): string {
    if (
      exception instanceof PostNotFoundException ||
      exception instanceof TagNotFoundException ||
      exception instanceof CalendarEventNotFoundException ||
      exception instanceof TeamNotFoundException ||
      exception instanceof UserNotFoundException
    ) {
      return 'NOT_FOUND';
    }
    if (
      exception instanceof PostAlreadyExistsException ||
      exception instanceof TagAlreadyExistsException
    ) {
      return 'CONFLICT';
    }
    if (exception instanceof MapMemberError) {
      return 'INTERNAL_SERVER_ERROR';
    }
    return 'BAD_USER_INPUT';
  }

  private static messageOf(exception: Error): string {
    const zodError = DomainExceptionFilter.zodCauseOf(exception);
    return zodError ? z.prettifyError(zodError) : exception.message;
  }

  private static zodCauseOf(exception: unknown): ZodError | undefined {
    if (exception instanceof ZodError) {
      return exception;
    }
    return exception instanceof Error && exception.cause !== undefined
      ? DomainExceptionFilter.zodCauseOf(exception.cause)
      : undefined;
  }
}
