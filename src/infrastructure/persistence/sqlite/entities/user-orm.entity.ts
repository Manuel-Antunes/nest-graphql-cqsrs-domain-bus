import { defineEntity, p } from '@mikro-orm/core';
import { User } from '../../../../domain/user/user.entity';
import { Author } from '../../../../domain/user/author.entity';
import { Reader } from '../../../../domain/user/reader.entity';
import { PostSchema } from './post-orm.entity';
import { Email } from '../../../../domain/user/vo/email';
import { UserId } from '../../../../domain/user/vo/user-id';
import { UserName } from '../../../../domain/user/vo/user-name';
import { activeFilter, softDeleteIndex, softDeleteProperty } from '../soft-delete/soft-delete-orm.entity';
import { valueObjectType } from '../helpers/value-object-type';

const UserIdType = valueObjectType(UserId, { columnType: 'varchar(36)' });
const EmailType = valueObjectType(Email, { columnType: 'varchar(320)' });
const UserNameType = valueObjectType(UserName, { columnType: 'varchar(100)' });

export const UserSchema = defineEntity({
  class: User,
  tableName: 'users',
  abstract: true,
  inheritance: 'tpt',
  forceConstructor: true,
  properties: {
    id: p.type(UserIdType).primary(),
    email: p.type(EmailType),
    name: p.type(UserNameType),
    createdAt: p.datetime(),
    version: p.integer(),
    supersededBy: () => p.manyToOne(UserSchema).ref().nullable().fieldName('superseded_by'),
    supersedes: () => p.manyToOne(UserSchema).ref().nullable().fieldName('supersedes'),
    deleted: () => softDeleteProperty(),
  },
  filters: activeFilter,
  indexes: [{ properties: ['email'] }, softDeleteIndex],
});

export const ReaderSchema = defineEntity({
  class: Reader,
  tableName: 'readers',
  extends: UserSchema,
  forceConstructor: true,
  properties: {},
});

export const AuthorSchema = defineEntity({
  class: Author,
  tableName: 'authors',
  extends: UserSchema,
  forceConstructor: true,
  properties: {
    posts: () => p.oneToMany(PostSchema).mappedBy('author'),
  },
});
