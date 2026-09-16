import { AutoMap } from "@automapper/classes";
import { BaseEntity, ref, rel, type Ref } from "@mikro-orm/core";
import { WithAggregateRoot } from "@nestjs/cqrs";
import { WithSoftDelete } from "../shared/soft-delete/soft-delete";
import type { Author } from "./author.entity";
import { UserDeletedEvent } from "./event/user-deleted.event";
import { UserRegisteredEvent } from "./event/user-registered.event";
import { UserRestoredEvent } from "./event/user-restored.event";
import { UserSupersededEvent } from "./event/user-superseded.event";
import { InvalidUserException } from "./exception/invalid-user.exception";
import { type NewUser, NewUserSchema } from "./schemas/new-user.schema";
import { Email } from "./vo/email";
import { UserId } from "./vo/user-id";
import { UserName } from "./vo/user-name";

export type UserEvent =
  | UserRegisteredEvent
  | UserSupersededEvent
  | UserDeletedEvent
  | UserRestoredEvent;

export const AUTHOR_ROLE = "author";

export type { NewUser };

export abstract class User extends WithAggregateRoot(
  WithSoftDelete(BaseEntity),
)<UserEvent> {
  @AutoMap(() => UserId)
  id!: UserId;
  @AutoMap(() => Email)
  email!: Email;
  @AutoMap(() => UserName)
  name!: UserName;
  createdAt!: Date;
  version!: number;
  supersededBy?: Ref<User> | null;
  supersedes?: Ref<User> | null;

  static referenceTo(userId: UserId): Ref<User> {
    return ref(rel(User as unknown as new () => User, userId)) as Ref<User>;
  }

  static register<T extends User>(
    this: new () => T,
    id: UserId,
    input: NewUser,
    role: string | null,
    now: Date,
    supersedes: UserId | null = null,
  ): T {
    const parsed = NewUserSchema.safeParse(input);
    if (!parsed.success) {
      throw new InvalidUserException('user inválido', { cause: parsed.error });
    }
    const user = new this();
    user.apply(
      new UserRegisteredEvent(
        id.value,
        parsed.data.email.value,
        parsed.data.name.value,
        role,
        supersedes?.value ?? null,
        now,
      ),
    );
    return user;
  }

  supersede(by: UserId, now: Date): this {
    if (this.supersededBy) {
      throw new InvalidUserException(
        `user ${this.id} já foi encerrado em favor de ${this.supersededBy.id}`,
      );
    }
    if (by.equals(this.id)) {
      throw new InvalidUserException("um user não pode suceder a si mesmo");
    }
    this.apply(new UserSupersededEvent(this.id.value, by.value, now));
    return this;
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

  canWritePosts(): this is Author {
    return false;
  }

  isActive(): boolean {
    return !this.supersededBy && !this.isDeleted();
  }

  onUserRegisteredEvent(event: UserRegisteredEvent): void {
    this.id = UserId.parse(event.userId);
    this.email = Email.parse(event.email);
    this.name = UserName.parse(event.name);
    this.createdAt = event.occurredAt;
    this.supersedes = event.supersedes
      ? User.referenceTo(UserId.parse(event.supersedes))
      : null;
    this.supersededBy = null;
    this.applyRestoration();
    this.version = 1;
  }

  onUserSupersededEvent(event: UserSupersededEvent): void {
    this.supersededBy = User.referenceTo(UserId.parse(event.supersededBy));
    this.version += 1;
  }

  onUserDeletedEvent(event: UserDeletedEvent): void {
    this.applyDeletion(event.occurredAt);
    this.version += 1;
  }

  onUserRestoredEvent(_event: UserRestoredEvent): void {
    this.applyRestoration();
    this.version += 1;
  }
}
