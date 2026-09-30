import type { PipeTransform } from '@nestjs/common';
import { Injectable } from '@nestjs/common';
import { QueryBus } from '@nestjs/cqrs';
import type { Identity } from '@nestposts/auth/domain/auth/vo/identity';
import type { INotifiable } from '@nestposts/notifications/domain/notification/notifiable';

import { FindReaderQuery } from '../../application/notification/query/find-reader.query';

export type IdentityNotifiable = Pick<
  INotifiable,
  'notifiableType' | 'notifiableId'
> | null;

@Injectable()
export class IdentityNotifiablePipe
  implements PipeTransform<Identity | null, Promise<IdentityNotifiable>>
{
  constructor(private readonly queryBus: QueryBus) {}

  async transform(identity: Identity | null): Promise<IdentityNotifiable> {
    return identity?.kind === 'user'
      ? this.queryBus.execute(new FindReaderQuery.FindReader(identity.email))
      : null;
  }
}
