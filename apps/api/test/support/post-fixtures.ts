import type { TestingModule } from '@nestjs/testing';
import { Post } from '../../src/domain/post/post.entity';
import { newPostId, type PostId } from '../../src/domain/post/vo/post-id';
import type { TagRef } from '../../src/domain/post/vo/tag-ref';
import { Tag } from '../../src/domain/tag/tag.entity';
import { newTagId, type TagId } from '../../src/domain/tag/vo/tag-id';
import { freshEm } from './cqrs-testing-module';

export const T0 = new Date('2026-09-08T12:00:00.000Z');

/** Grava um Post direto no banco (sem command), como o "given" de um teste de handler. */
export async function givenAPost(
  module: TestingModule,
  overrides: { id?: PostId; title?: string; content?: string; author?: string; createdAt?: Date; tags?: TagRef[] } = {},
): Promise<Post> {
  const post = Post.create(
    overrides.id ?? newPostId(),
    { title: overrides.title ?? 'Nest + GraphQL', content: overrides.content ?? 'oi', author: overrides.author ?? 'manuel' },
    overrides.createdAt ?? T0,
  );
  for (const tag of overrides.tags ?? []) {
    post.assignTag(tag, overrides.createdAt ?? T0);
  }
  post.uncommit();
  await freshEm(module).persist(post).flush();
  return post;
}

/** Grava uma Tag direto no banco. */
export async function givenATag(module: TestingModule, name = 'Untagged', id: TagId = newTagId()): Promise<Tag> {
  const tag = Tag.create(id, name, T0);
  tag.uncommit();
  await freshEm(module).persist(tag).flush();
  return tag;
}
