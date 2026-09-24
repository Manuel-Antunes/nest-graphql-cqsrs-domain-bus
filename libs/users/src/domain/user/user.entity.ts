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
import { UserRoleGrantedEvent } from './event/user-role-granted.event';
import { InvalidUserException } from './exception/invalid-user.exception';
import type { NewUser } from './schemas/new-user.schema';
import { NewUserSchema } from './schemas/new-user.schema';
import type { IUser } from './schemas/user.schema';
import { Email } from './vo/email';
import { UserId } from './vo/user-id';
import { UserName } from './vo/user-name';

export type UserEvent =
  | UserRegisteredEvent
  | UserRoleGrantedEvent
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

  roles: string[] = [];

  version!: number;

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

  hasRole(role: string): boolean {
    return this.roles.includes(role);
  }

  grantRole(role: string, now: Date): this {
    if (this.hasRole(role)) {
      throw new InvalidUserException(`user ${this.id} já tem o papel ${role}`);
    }
    this.apply(new UserRoleGrantedEvent(this.id.value, role, now));
    return this;
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
    this.roles = [...event.roles];
    this.stampCreation(event.occurredAt);
    this.applyRestoration();
    this.version = 1;
  }

  onUserRoleGrantedEvent(event: UserRoleGrantedEvent): void {
    this.roles = this.hasRole(event.role)
      ? this.roles
      : [...this.roles, event.role];
    this.touch(event.occurredAt);
    this.version += 1;
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
