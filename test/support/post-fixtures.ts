import type { TestingModule } from '@nestjs/testing';
import { Post } from '../../src/domain/post/post.entity';
import { PostId } from '../../src/domain/post/vo/post-id';
import { Tag } from '../../src/domain/tag/tag.entity';
import { TagId } from '../../src/domain/tag/vo/tag-id';
import { delegateRef } from '../../src/domain/shared/delegation/delegate';
import { AUTHOR_ROLE, Author, Authorship } from '../../src/domain/user/author.entity';
import { User } from '../../src/domain/user/user.entity';
import { UserId } from '../../src/domain/user/vo/user-id';
import { freshEm } from './cqrs-testing-module';

export const T0 = new Date('2026-09-08T12:00:00.000Z');

export async function givenAPost(
  module: TestingModule,
  overrides: { id?: PostId; title?: string; content?: string; author?: Author; createdAt?: Date; tags?: Tag[] } = {},
): Promise<Post> {
  const em = freshEm(module);
  const at = overrides.createdAt ?? T0;
  const author = overrides.author ?? (await givenAnAuthor(module));
  const authorship = await em.findOneOrFail(Authorship, { user: author.id });
  const post = Post.create(
    overrides.id ?? PostId.generate(),
    { title: overrides.title ?? 'Nest + GraphQL', content: overrides.content ?? 'oi' },
    delegateRef(Author, authorship),
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

export async function givenAnAuthor(
  module: TestingModule,
  email = `autor+${UserId.generate()}@example.com`,
  name = 'manuel',
): Promise<Author> {
  const em = freshEm(module);
  const user = givenAUserWith(email, name, [AUTHOR_ROLE]);
  const authorship = Authorship.of(user);
  await em.persist(user).persist(authorship).flush();
  return Author.cast(user, authorship);
}

export async function givenAUser(
  module: TestingModule,
  email = `leitor+${UserId.generate()}@example.com`,
  name = 'leitor',
): Promise<User> {
  const user = givenAUserWith(email, name, []);
  await freshEm(module).persist(user).flush();
  return user;
}

function givenAUserWith(email: string, name: string, roles: readonly string[]): User {
  const user = User.register(UserId.generate(), { email, name }, roles, T0);
  user.uncommit();
  return user;
}

export async function givenATag(module: TestingModule, name = 'Untagged', id: TagId = TagId.generate()): Promise<Tag> {
  const tag = Tag.create(id, name, T0);
  tag.uncommit();
  await freshEm(module).persist(tag).flush();
  return tag;
}
