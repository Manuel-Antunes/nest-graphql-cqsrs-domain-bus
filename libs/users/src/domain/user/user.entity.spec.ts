import { metadataOnly } from '@nestposts/database/testing';
import { MikroORM } from '@mikro-orm/core';
import {
  AuthorshipEntitySchema,
  UserEntitySchema,
} from '../../infrastructure/persistence/entities/user-orm.entity';
import { issuesOf } from '@nestposts/platform/testing/invalid-input';
import { AUTHOR_ROLE } from './author.entity';
import { UserDeletedEvent } from './event/user-deleted.event';
import { UserRegisteredEvent } from './event/user-registered.event';
import { UserRestoredEvent } from './event/user-restored.event';
import { UserRoleGrantedEvent } from './event/user-role-granted.event';
import { InvalidUserException } from './exception/invalid-user.exception';
import { User } from './user.entity';
import { Email } from './vo/email';
import { UserId } from './vo/user-id';
import { UserName } from './vo/user-name';

describe('User', () => {
  let orm: MikroORM;

  beforeAll(async () => {
    orm = await metadataOnly([UserEntitySchema, AuthorshipEntitySchema]);
  });

  afterAll(() => orm.close());

  const id = UserId.parse('4bc1e458-ec1d-4279-b74d-da537d18811c');
  const now = new Date('2026-09-08T12:00:00.000Z');
  const later = new Date('2026-09-08T12:05:00.000Z');
  const input = { email: 'Manuel@Example.com ', name: ' Manuel ' };
  const register = (roles: readonly string[] = [], at = now) => User.register(id, input, roles, at);
  const stateOf = ({ id, email, name, roles, createdAt, updatedAt, version, deletedAt }: User) => ({
    id, email, name, roles, createdAt, updatedAt, version, deletedAt,
  });

  describe('registering', () => {
    it('normalizes the email and the name, and raises UserRegistered', () => {
      const user = register();

      expect(user).toMatchObject({
        id,
        email: Email.parse('manuel@example.com'),
        name: UserName.parse('Manuel'),
        roles: [],
        version: 1,
      });
      expect(user.getUncommittedEvents()).toEqual([
        new UserRegisteredEvent(id.value, 'manuel@example.com', 'Manuel', [], now),
      ]);
    });

    it('keeps the roles it was registered with — one class, many capabilities', () => {
      const user = register([AUTHOR_ROLE]);

      expect(user.roles).toEqual([AUTHOR_ROLE]);
      expect(user.hasRole(AUTHOR_ROLE)).toBe(true);
      expect(user.hasRole('reviewer')).toBe(false);
    });

    it('rejects an invalid email and a blank name without raising anything', () => {
      expect(() => User.register(id, { email: 'não-é-email', name: 'x' }, [], now)).toThrow(InvalidUserException);
      expect(issuesOf(() => User.register(id, { email: 'a@b.com', name: '   ' }, [], now))).toContain(
        'name não pode ser vazio',
      );
    });
  });

  describe('sourcing replays what deciding built', () => {
    it('a registered user replays into the same state', () => {
      const decided = register([AUTHOR_ROLE]);

      const sourced = new User();
      sourced.loadFromHistory(decided.getUncommittedEvents());

      expect(sourced.getUncommittedEvents()).toEqual([]);
      expect(stateOf(sourced)).toEqual(stateOf(decided));
      expect(sourced.hasRole(AUTHOR_ROLE)).toBe(true);
    });
  });

  describe('granting a role is an event on the same stream', () => {
    it('grantRole raises UserRoleGranted and keeps the identity', () => {
      const user = register();
      user.uncommit();

      user.grantRole(AUTHOR_ROLE, later);

      expect(user.id.equals(id)).toBe(true);
      expect(user.roles).toEqual([AUTHOR_ROLE]);
      expect(user.version).toBe(2);
      expect(user.getUncommittedEvents()).toEqual([new UserRoleGrantedEvent(id.value, AUTHOR_ROLE, later)]);
    });

    it('granting the same role twice is refused', () => {
      const user = register([AUTHOR_ROLE]);

      expect(() => user.grantRole(AUTHOR_ROLE, later)).toThrow(/já tem o papel/);
    });

    it('replaying the grant lands on the same roles', () => {
      const user = register();
      user.grantRole(AUTHOR_ROLE, later);

      const sourced = new User();
      sourced.loadFromHistory(user.getUncommittedEvents());

      expect(stateOf(sourced)).toEqual(stateOf(user));
    });
  });

  describe('deleting is reversible', () => {
    it('softDelete marks the date and takes the user out of circulation', () => {
      const user = register();
      user.uncommit();

      user.softDelete(later);

      expect(user.deletedAt).toBe(later);
      expect(user.isActive()).toBe(false);
      expect(user.getUncommittedEvents()).toEqual([new UserDeletedEvent(id.value, later)]);
    });

    it('restore clears the date', () => {
      const user = register().softDelete(later);
      user.uncommit();

      user.restore(later);

      expect(user.deletedAt).toBeNull();
      expect(user.isActive()).toBe(true);
      expect(user.getUncommittedEvents()).toEqual([new UserRestoredEvent(id.value, later)]);
    });

    it('does not delete twice, nor restore what is not deleted', () => {
      const user = register();

      expect(() => user.restore(later)).toThrow(/não está apagado/);
      user.softDelete(later);
      expect(() => user.softDelete(later)).toThrow(/já está apagado/);
    });
  });

  it('the version counts the applied events', () => {
    const user = register();
    expect(user.version).toBe(1);

    user.grantRole(AUTHOR_ROLE, later);
    user.softDelete(later);
    user.restore(later);

    expect(user.version).toBe(4);
    const sourced = new User();
    sourced.loadFromHistory(user.getUncommittedEvents());
    expect(sourced.version).toBe(4);
  });
});
