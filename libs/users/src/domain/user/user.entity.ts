import { AutoMap } from '@automapper/classes';
import { EMAIL_CHANNEL } from '@nestposts/notifications/domain/channel/channel-names';
import type { NotificationReceivedEvent } from '@nestposts/notifications/domain/notification/event/notification-received.event';
import { Notifiable } from '@nestposts/notifications/domain/notification/notifiable';
import { AggregateRoot } from '@nestposts/platform/domain/shared/aggregate-root';
import { BaseEntity } from '@nestposts/platform/domain/shared/base-entity';
import { WithSoftDelete } from '@nestposts/platform/domain/shared/soft-delete/soft-delete';

import { UserDeletedEvent } from './event/user-deleted.event';
import { UserRegisteredEvent } from './event/user-registered.event';
import { UserRestoredEvent } from './event/user-restored.event';
import { InvalidUserException } from './exception/invalid-user.exception';
import type { NewUser } from './schemas/new-user.schema';
import { NewUserSchema } from './schemas/new-user.schema';
import type { IUser } from './schemas/user.schema';
import { Email } from './vo/email';
import { UserId } from './vo/user-id';
import { UserName } from './vo/user-name';

export type UserEvent =
  | UserRegisteredEvent
  | UserDeletedEvent
  | UserRestoredEvent
  | NotificationReceivedEvent;

export const USER_NOTIFIABLE_TYPE = 'users.User';

export type { NewUser };

export class User
  extends Notifiable(AggregateRoot(WithSoftDelete(BaseEntity))<UserEvent>)
  implements IUser
{
  @AutoMap(() => UserId)
  id!: UserId;

  @AutoMap(() => Email)
  email!: Email;

  @AutoMap(() => UserName)
  name!: UserName;

  role: string | null = null;

  version = 1;

  static register(
    id: UserId,
    input: NewUser,
    roles: readonly string[],
    now: Date,
  ): User {
    const parsed = NewUserSchema.safeParse(input);
    if (!parsed.success) {
      throw new InvalidUserException('user inválido', { cause: parsed.error });
    }
    const user = new User();
    user.apply(
      new UserRegisteredEvent(
        id.value,
        parsed.data.email.value,
        parsed.data.name.value,
        [...roles],
        now,
      ),
    );
    return user;
  }

  override get notifiableType(): string {
    return USER_NOTIFIABLE_TYPE;
  }

  override get notifiableId(): string {
    return this.id.value;
  }

  override get notifiableName(): string | null {
    return this.name.value;
  }

  override routeNotificationFor(channel: string): string | undefined {
    return channel === EMAIL_CHANNEL ? this.email.value : undefined;
  }

  get roles(): readonly string[] {
    return (this.role ?? '')
      .split(',')
      .map((role) => role.trim())
      .filter((role) => role.length > 0);
  }

  hasRole(role: string): boolean {
    return this.roles.includes(role);
  }

  isActive(): boolean {
    return !this.isDeleted();
  }

  override softDelete(now: Date): this {
    super.softDelete(now);
    this.apply(new UserDeletedEvent(this.id.value, now));
    return this;
  }

  override restore(now: Date): this {
    super.restore(now);
    this.apply(new UserRestoredEvent(this.id.value, now));
    return this;
  }

  onUserRegisteredEvent(event: UserRegisteredEvent): void {
    this.id = UserId.parse(event.userId);
    this.email = Email.parse(event.email);
    this.name = UserName.parse(event.name);
    this.role = event.roles.length > 0 ? event.roles.join(',') : null;
    this.stampCreation(event.occurredAt);
    this.applyRestoration();
    this.version = 1;
  }

  onUserDeletedEvent(event: UserDeletedEvent): void {
    this.applyDeletion(event.occurredAt);
    this.touch(event.occurredAt);
    this.version += 1;
  }

  onUserRestoredEvent(event: UserRestoredEvent): void {
    this.applyRestoration();
    this.touch(event.occurredAt);
    this.version += 1;
  }
}
