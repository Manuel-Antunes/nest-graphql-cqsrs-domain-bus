import { Injectable } from '@nestjs/common';
import type { ICommand, IEvent } from '@nestjs/cqrs';
import { AsyncContext, ofType, Saga } from '@nestjs/cqrs';
import { NotificationReceivedEvent } from '@nestposts/notifications/domain/notification/event/notification-received.event';
import type { Observable } from 'rxjs';
import { map } from 'rxjs';

import { SendNotificationCommand } from './send-notification.command';

@Injectable()
export class SendOnNotificationReceived {
  @Saga()
  sendTheNotification = (events$: Observable<IEvent>): Observable<ICommand> =>
    events$.pipe(
      ofType(NotificationReceivedEvent),
      map((event) => {
        const command = SendNotificationCommand.SendNotification.of(event);
        AsyncContext.merge(event, command);
        return command;
      }),
    );
}
