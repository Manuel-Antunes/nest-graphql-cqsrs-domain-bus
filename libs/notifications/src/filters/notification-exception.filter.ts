import type { ArgumentsHost, ExceptionFilter } from '@nestjs/common';
import { Catch } from '@nestjs/common';
import { GraphQLError } from 'graphql';

import { DeviceNotOwnedException } from '../domain/device/exception/device-not-owned.exception';
import { InvalidDeviceException } from '../domain/device/exception/invalid-device.exception';
import { NotificationNotFoundException } from '../domain/notification/exception/notification-not-found.exception';

/**
 * **What the notifications subgraph refuses, in GraphQL's words**: a notification that is not
 * there, a device that is somebody else's, a device that is not valid.
 */
@Catch(
  NotificationNotFoundException,
  DeviceNotOwnedException,
  InvalidDeviceException,
)
export class NotificationExceptionFilter implements ExceptionFilter {
  catch(exception: Error, _host: ArgumentsHost): GraphQLError {
    return new GraphQLError(exception.message, {
      extensions: { code: NotificationExceptionFilter.codeOf(exception) },
    });
  }

  private static codeOf(exception: Error): string {
    if (exception instanceof NotificationNotFoundException) return 'NOT_FOUND';
    if (exception instanceof DeviceNotOwnedException) return 'FORBIDDEN';
    return 'BAD_USER_INPUT';
  }
}
