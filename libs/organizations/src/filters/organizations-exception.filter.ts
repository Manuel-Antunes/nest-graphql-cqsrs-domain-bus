import type { ArgumentsHost, ExceptionFilter } from '@nestjs/common';
import { Catch } from '@nestjs/common';
import { ValidationMessage } from '@nestposts/validated-dto/filters/validation-message';
import { GraphQLError } from 'graphql';

import { ActiveMemberNotFoundException } from '../domain/organization/exception/active-member-not-found.exception';
import { OrganizationNotFoundException } from '../domain/organization/exception/organization-not-found.exception';
import { OrganizationNotSelectedException } from '../domain/organization/exception/organization-not-selected.exception';
import { TeamNotFoundException } from '../domain/organization/exception/team-not-found.exception';

@Catch(
  OrganizationNotSelectedException,
  OrganizationNotFoundException,
  ActiveMemberNotFoundException,
  TeamNotFoundException,
)
export class OrganizationsExceptionFilter implements ExceptionFilter {
  catch(exception: Error, _host: ArgumentsHost): GraphQLError {
    return new GraphQLError(ValidationMessage.of(exception), {
      extensions: { code: OrganizationsExceptionFilter.codeOf(exception) },
    });
  }

  private static codeOf(exception: Error): string {
    return exception instanceof ActiveMemberNotFoundException
      ? 'FORBIDDEN'
      : 'NOT_FOUND';
  }
}
