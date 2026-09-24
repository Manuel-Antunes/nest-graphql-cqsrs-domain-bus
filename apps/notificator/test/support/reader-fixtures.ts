import { randomUUID } from 'node:crypto';
import type { INotifiable } from '@nestposts/notifications/domain/notification/notifiable';

export type Reader = Pick<INotifiable, 'notifiableType' | 'notifiableId'>;

export const aReader = (): Reader => ({
  notifiableType: 'users.User',
  notifiableId: randomUUID(),
});
