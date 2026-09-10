import { defineEntity, p } from '@mikro-orm/core';
import { Post } from '../../../../domain/post/post.entity';
import { PostContent } from '../../../../domain/post/vo/post-content';
import { PostId } from '../../../../domain/post/vo/post-id';
import { POST_TITLE_MAX_LENGTH, PostTitle } from '../../../../domain/post/vo/post-title';
import { activeFilter, softDeleteIndex, softDeleteProperty } from './soft-delete-orm.entity';
import { TagSchema } from './tag-orm.entity';
import { AuthorSchema } from './user-orm.entity';
import { valueObjectType } from '../helpers/value-object-type';

const PostIdType = valueObjectType(PostId, { columnType: 'varchar(36)' });
const PostTitleType = valueObjectType(PostTitle, { columnType: `varchar(${POST_TITLE_MAX_LENGTH})` });
const PostContentType = valueObjectType(PostContent, { columnType: 'text' });

/**
 * O mapeamento do Post, pelo `defineEntity` do MikroORM v7 apontando para a classe de domínio.
 *
 * Os value objects viram colunas simples pelo `valueObjectType` — o objeto é do TypeScript, o banco vê
 * texto; as tags são uma relação many-to-many, com a tabela pivô que o ORM cria (`posts_tags`); e o
 * autor é uma m:1 para `AuthorSchema`, e não para `UserSchema`, para que a chave estrangeira aponte
 * para `authors` — nenhuma linha de post consegue referenciar um Reader nem por acidente de dados.
 */
export const PostSchema = defineEntity({
  class: Post,
  tableName: 'posts',
  forceConstructor: true,
  properties: {
    id: p.type(PostIdType).primary(),
    title: p.type(PostTitleType),
    content: p.type(PostContentType),
    author: () => p.manyToOne(AuthorSchema).ref(),
    createdAt: p.datetime(),
    updatedAt: p.datetime(),
    version: p.integer(),
    deleted: () => softDeleteProperty(),
    tags: () => p.manyToMany(TagSchema).owner(),
  },
  filters: activeFilter,
  indexes: [{ properties: ['createdAt', 'id'] }, softDeleteIndex],
});
