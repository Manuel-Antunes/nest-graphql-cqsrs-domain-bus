import type { ArgumentsHost, ExceptionFilter } from '@nestjs/common';
import { Catch } from '@nestjs/common';
import { ValidationMessage } from '@nestposts/validated-dto/filters/validation-message';
import { GraphQLError } from 'graphql';

import { InvalidPostException } from '../domain/post/exception/invalid-post.exception';
import { PostAlreadyExistsException } from '../domain/post/exception/post-already-exists.exception';
import { PostNotFoundException } from '../domain/post/exception/post-not-found.exception';
import { InvalidTagException } from '../domain/tag/exception/invalid-tag.exception';
import { TagAlreadyExistsException } from '../domain/tag/exception/tag-already-exists.exception';
import { TagNotFoundException } from '../domain/tag/exception/tag-not-found.exception';

@Catch(
  InvalidPostException,
  InvalidTagException,
  PostNotFoundException,
  TagNotFoundException,
  PostAlreadyExistsException,
  TagAlreadyExistsException,
)
export class PostsExceptionFilter implements ExceptionFilter {
  catch(exception: Error, _host: ArgumentsHost): GraphQLError {
    return new GraphQLError(ValidationMessage.of(exception), {
      extensions: { code: PostsExceptionFilter.codeOf(exception) },
    });
  }

  private static codeOf(exception: Error): string {
    if (
      exception instanceof PostNotFoundException ||
      exception instanceof TagNotFoundException
    ) {
      return 'NOT_FOUND';
    }
    if (
      exception instanceof PostAlreadyExistsException ||
      exception instanceof TagAlreadyExistsException
    ) {
      return 'CONFLICT';
    }
    return 'BAD_USER_INPUT';
  }
}
