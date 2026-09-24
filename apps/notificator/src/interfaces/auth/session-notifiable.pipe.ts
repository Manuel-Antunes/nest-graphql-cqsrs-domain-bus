import type { PipeTransform } from '@nestjs/common';
import { Injectable } from '@nestjs/common';
import { QueryBus } from '@nestjs/cqrs';
import type { INotifiable } from '@nestposts/notifications/domain/notification/notifiable';
import { Email } from '@nestposts/users/domain/user/vo/email';
import type { UserSession } from '@thallesp/nestjs-better-auth';

import { FindReaderQuery } from '../../application/notification/query/find-reader.query';

export type SessionNotifiable = Pick<
  INotifiable,
  'notifiableType' | 'notifiableId'
> | null;

type MaybeSession =
  | UserSession
  | Promise<UserSession | null>
  | null
  | undefined;

@Injectable()
export class SessionNotifiablePipe
  implements PipeTransform<MaybeSession, Promise<SessionNotifiable>>
{
  constructor(private readonly queryBus: QueryBus) {}

  async transform(maybeSession: MaybeSession): Promise<SessionNotifiable> {
    const email = Email.safeParse((await maybeSession)?.user?.email);
    return email.success
      ? this.queryBus.execute(new FindReaderQuery.FindReader(email.data))
      : null;
  }
}
