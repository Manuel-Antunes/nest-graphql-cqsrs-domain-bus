import { ref } from '@mikro-orm/core';
import type { TestingModule } from '@nestjs/testing';
import { Post } from '../../src/domain/post/post.entity';
import { PostId } from '../../src/domain/post/vo/post-id';
import { Tag } from '../../src/domain/tag/tag.entity';
import { TagId } from '../../src/domain/tag/vo/tag-id';
import { AUTHOR_ROLE, User } from '../../src/domain/user/user.entity';
import { Users } from '../../src/domain/user/user.factory';
import { Author } from '../../src/domain/user/author.entity';
import { UserId } from '../../src/domain/user/vo/user-id';
import { freshEm } from './cqrs-testing-module';

export const T0 = new Date('2026-09-08T12:00:00.000Z');

/**
 * Grava um Post direto no banco (sem command), como o "given" de um teste de handler.
 *
 * As tags entram como o agregado `Tag`, e recarregadas **no mesmo fork**: `Post.tags` é uma relação
 * m:n, e ligar a um objeto vindo de outro EntityManager misturaria identity maps. Quem chama passa
 * as Tags que `givenATag` gravou; a fixture as busca de novo aqui.
 */
export async function givenAPost(
  module: TestingModule,
  overrides: { id?: PostId; title?: string; content?: string; author?: Author; createdAt?: Date; tags?: Tag[] } = {},
): Promise<Post> {
  const em = freshEm(module);
  const at = overrides.createdAt ?? T0;
  const author = overrides.author
    ? await em.findOneOrFail(Author, { id: overrides.author.id })
    : await givenAnAuthorIn(em, `manuel+${UserId.generate()}@example.com`, 'manuel');
  const post = Post.create(
    overrides.id ?? PostId.generate(),
    { title: overrides.title ?? 'Nest + GraphQL', content: overrides.content ?? 'oi' },
    ref(author),
    author.name,
    at,
  );
  for (const { id } of overrides.tags ?? []) {
    post.assignTag(await em.findOneOrFail(Tag, { id }), at);
  }
  post.uncommit();
  await em.persist(post).flush();
  return post;
}

/**
 * Grava um Author direto no banco (sem command). Todo Post precisa de um: a relação é obrigatória.
 */
export async function givenAnAuthor(module: TestingModule, email = `autor+${UserId.generate()}@example.com`, name = 'manuel'): Promise<Author> {
  return givenAnAuthorIn(freshEm(module), email, name);
}

/** Grava um Reader — quem lê mas não escreve. */
export async function givenAReader(module: TestingModule, email = `leitor+${UserId.generate()}@example.com`, name = 'leitor'): Promise<User> {
  const em = freshEm(module);
  const reader = Users.register(UserId.generate(), { email, name }, null, T0);
  reader.uncommit();
  await em.persist(reader).flush();
  return reader;
}

async function givenAnAuthorIn(em: ReturnType<typeof freshEm>, email: string, name: string): Promise<Author> {
  const author = Users.register(UserId.generate(), { email, name }, AUTHOR_ROLE, T0);
  if (!author.canWritePosts()) {
    throw new Error('User.register com AUTHOR_ROLE precisa nascer Author');
  }
  author.uncommit();
  await em.persist(author).flush();
  return author;
}

/** Grava uma Tag direto no banco. */
export async function givenATag(module: TestingModule, name = 'Untagged', id: TagId = TagId.generate()): Promise<Tag> {
  const tag = Tag.create(id, name, T0);
  tag.uncommit();
  await freshEm(module).persist(tag).flush();
  return tag;
}
