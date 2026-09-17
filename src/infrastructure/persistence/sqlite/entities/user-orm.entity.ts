import { defineEntity, p } from "@mikro-orm/core";
import { Authorship } from "../../../../domain/user/author.entity";
import { InvalidUserException } from "../../../../domain/user/exception/invalid-user.exception";
import { UserSchema } from "../../../../domain/user/schemas/user.schema";
import { User } from "../../../../domain/user/user.entity";
import { Email } from "../../../../domain/user/vo/email";
import { UserId } from "../../../../domain/user/vo/user-id";
import { UserName } from "../../../../domain/user/vo/user-name";
import { ZodEntity } from "../../../../domain/shared/zod-entity";
import {
  activeFilter,
  activeThrough,
  softDeleteIndex,
  softDeleteProperty,
} from "../soft-delete/soft-delete-orm.entity";
import { referencesServeDelegations } from "../delegation/delegated-reference";
import { valueObjectType } from "../helpers/value-object-type";
import { PostEntitySchema } from "./post-orm.entity";

const UserIdType = valueObjectType(UserId, { columnType: "varchar(36)" });
const EmailType = valueObjectType(Email, { columnType: "varchar(320)" });
const UserNameType = valueObjectType(UserName, { columnType: "varchar(100)" });

export const UserEntitySchema = defineEntity({
  class: User,
  tableName: "users",
  forceConstructor: true,
  properties: {
    id: p.type(UserIdType).primary(),
    email: p.type(EmailType),
    name: p.type(UserNameType),
    roles: p.array(),
    createdAt: p.datetime(),
    updatedAt: p.datetime(),
    version: p.integer(),
    deleted: () => softDeleteProperty(),
  },
  filters: activeFilter,
  indexes: [{ properties: ["email"] }, softDeleteIndex],
});

export const AuthorshipEntitySchema = defineEntity({
  class: Authorship,
  tableName: "authors",
  forceConstructor: true,
  properties: {
    user: () => p.oneToOne(UserEntitySchema).ref().primary().eager().fieldName("id"),
    posts: () => p.oneToMany(PostEntitySchema).mappedBy("author"),
  },
  filters: activeThrough("user"),
});

referencesServeDelegations();

ZodEntity(
  User,
  UserSchema,
  error => new InvalidUserException("user inválido", { cause: error }),
);
