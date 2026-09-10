import { defineEntity, p } from '@mikro-orm/core';
import { User } from '../../../../domain/user/user.entity';
import { Author } from '../../../../domain/user/author.entity';
import { PostSchema } from './post-orm.entity';
import { Reader } from '../../../../domain/user/reader.entity';
import { Email } from '../../../../domain/user/vo/email';
import { UserId } from '../../../../domain/user/vo/user-id';
import { UserName } from '../../../../domain/user/vo/user-name';
import { activeFilter, softDeleteIndex, softDeleteProperty } from './soft-delete-orm.entity';
import { valueObjectType } from '../helpers/value-object-type';

const UserIdType = valueObjectType(UserId, { columnType: 'varchar(36)' });
const EmailType = valueObjectType(Email, { columnType: 'varchar(320)' });
const UserNameType = valueObjectType(UserName, { columnType: 'varchar(100)' });

/**
 * A tabela base da herança. `abstract: true` + `inheritance: 'tpt'`: `users` guarda o comum, e cada
 * tipo concreto tem a sua tabela ligada por PK — sem coluna discriminadora, como no `JOINED` do JPA.
 *
 * O índice único de email é **parcial** e vive na migração, não aqui: `defineEntity` não expressa
 * `where`, e é justamente o `where` que faz o email ser único **entre ativos** — sem ele, promover
 * (que abre um stream novo com o mesmo email) seria impossível.
 */
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
    // Relacionamentos, e não ids soltos: a auto-referência aponta para a **raiz abstrata**, então o
    // ORM resolve `Reader` ou `Author` ao carregar. O `fieldName` mantém a coluna com o nome de
    // sempre — trocar o id pela referência não mudou o banco.
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

/**
 * O `authors` da herança multi-tabela. A tabela só tem a chave; o que ela ganha aqui é o **lado
 * inverso** de `Post.author` — nenhuma coluna nova, e é por ela que o `Author` pagina os posts dele
 * sem carregar a lista inteira (ver `Author.posted`).
 */
export const AuthorSchema = defineEntity({
  class: Author,
  tableName: 'authors',
  extends: UserSchema,
  forceConstructor: true,
  properties: {
    posts: () => p.oneToMany(PostSchema).mappedBy('author'),
  },
});
