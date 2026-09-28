import type { ArgumentsHost, ExceptionFilter } from '@nestjs/common';
import { Catch } from '@nestjs/common';
import { ValidationMessage } from '@nestposts/validated-dto/filters/validation-message';
import { GraphQLError } from 'graphql';

import { CalendarEventNotFoundException } from '../domain/calendar-event/exception/calendar-event-not-found.exception';
import { InvalidCalendarEventException } from '../domain/calendar-event/exception/invalid-calendar-event.exception';

@Catch(InvalidCalendarEventException, CalendarEventNotFoundException)
export class CalendarEventExceptionFilter implements ExceptionFilter {
  catch(exception: Error, _host: ArgumentsHost): GraphQLError {
    return new GraphQLError(ValidationMessage.of(exception), {
      extensions: {
        code:
          exception instanceof CalendarEventNotFoundException
            ? 'NOT_FOUND'
            : 'BAD_USER_INPUT',
      },
    });
  }
}
