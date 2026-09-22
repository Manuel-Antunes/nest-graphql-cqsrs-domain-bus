import { type ArgumentsHost, Catch, type ExceptionFilter } from '@nestjs/common';
import { ActiveMemberNotFoundException } from '@nestposts/organizations/domain/organization/exception/active-member-not-found.exception';
import { OrganizationNotFoundException } from '@nestposts/organizations/domain/organization/exception/organization-not-found.exception';
import { OrganizationNotSelectedException } from '@nestposts/organizations/domain/organization/exception/organization-not-selected.exception';
import { SessionNotAuthenticatedException } from '@nestposts/auth/domain/auth/exception/session-not-authenticated.exception';
import { NotAnAuthorException } from '@nestposts/users/domain/user/exception/not-an-author.exception';
import { UnknownIdentityException } from '@nestposts/users/domain/user/exception/unknown-identity.exception';
import { GraphQLError } from 'graphql';

@Catch(
  SessionNotAuthenticatedException,
  OrganizationNotSelectedException,
  OrganizationNotFoundException,
  ActiveMemberNotFoundException,
  NotAnAuthorException,
  UnknownIdentityException,
)
export class AuthExceptionFilter implements ExceptionFilter {
  catch(exception: Error, _host: ArgumentsHost): GraphQLError {
    return new GraphQLError(exception.message, {
      extensions: { code: AuthExceptionFilter.codeOf(exception) },
    });
  }

  private static codeOf(exception: Error): string {
    if (exception instanceof SessionNotAuthenticatedException) {
      return 'UNAUTHENTICATED';
    }
    if (
      exception instanceof OrganizationNotSelectedException ||
      exception instanceof OrganizationNotFoundException ||
      exception instanceof UnknownIdentityException
    ) {
      return 'NOT_FOUND';
    }
    return 'FORBIDDEN';
  }
}
