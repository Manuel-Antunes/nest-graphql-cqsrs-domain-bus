import type { ArgumentsHost, ExceptionFilter } from '@nestjs/common';
import { Catch } from '@nestjs/common';
import { DeviceNotOwnedException } from '@nestposts/notifications/domain/device/exception/device-not-owned.exception';
import { InvalidDeviceException } from '@nestposts/notifications/domain/device/exception/invalid-device.exception';
import { NotificationNotFoundException } from '@nestposts/notifications/domain/notification/exception/notification-not-found.exception';
import { GraphQLError } from 'graphql';
import { ZodError, z } from 'zod';

@Catch(
  NotificationNotFoundException,
  DeviceNotOwnedException,
  InvalidDeviceException,
  ZodError,
)
export class NotificationExceptionFilter implements ExceptionFilter {
  catch(exception: Error, _host: ArgumentsHost): GraphQLError {
    return new GraphQLError(
      exception instanceof ZodError
        ? z.prettifyError(exception)
        : exception.message,
      { extensions: { code: NotificationExceptionFilter.codeOf(exception) } },
    );
  }

  private static codeOf(exception: Error): string {
    if (exception instanceof NotificationNotFoundException) return 'NOT_FOUND';
    if (exception instanceof DeviceNotOwnedException) return 'FORBIDDEN';
    return 'BAD_USER_INPUT';
  }
}
