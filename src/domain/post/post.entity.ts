import { AutoMap } from "@automapper/classes";
import { Collection, rel } from "@mikro-orm/core";
import { AggregateRoot } from "../shared/aggregate-root";
import { type DelegatedRef, delegateRef } from "../shared/delegation/delegate";
import { BaseEntity } from "../shared/base-entity";
import { WithSoftDelete } from "../shared/soft-delete/soft-delete";
import { Tag } from "../tag/tag.entity";
import { TagId } from "../tag/vo/tag-id";
import { Author, Authorship } from "../user/author.entity";
import { type User } from "../user/user.entity";
import { UserId } from "../user/vo/user-id";
import type { UserName } from "../user/vo/user-name";
import { PostCreatedEvent } from "./event/post-created.event";
import { PostDeletedEvent } from "./event/post-deleted.event";
import { PostRestoredEvent } from "./event/post-restored.event";
import { PostUpdatedEvent } from "./event/post-updated.event";
import { InvalidPostException } from "./exception/invalid-post.exception";
import { PostNotWrittenByException } from "./exception/post-not-written-by.exception";
import {
  type NewPost,
  NewPostSchema,
  type PostChanges,
  PostChangesSchema,
} from "./schemas/new-post.schema";
import { PostContent } from "./vo/post-content";
import { PostId } from "./vo/post-id";
import { PostTitle } from "./vo/post-title";
import { IPost } from "./schemas/post.schema";

export type PostEvent =
  | PostCreatedEvent
  | PostUpdatedEvent
  | PostDeletedEvent
  | PostRestoredEvent;

export type { NewPost, PostChanges };

export class Post
  extends AggregateRoot(WithSoftDelete(BaseEntity))<PostEvent>
  implements IPost
{
  @AutoMap(() => PostId)
  id!: PostId;

  @AutoMap(() => PostTitle)
  title!: PostTitle;

  _content: string;

  @AutoMap(() => PostContent)
  get content(): PostContent {
    return this._content as unknown as PostContent;
  }

  set content(value: PostContent) {
    this._content = value.value;
  }

  author!: DelegatedRef<Authorship, Author>;

  @AutoMap()
  version!: number;

  readonly tags = new Collection<Tag, Post>(this);

  static from(state: Partial<Post>): Post {
    return new Post(state);
  }

  static create(
    id: PostId,
    input: NewPost,
    author: DelegatedRef<Authorship, Author>,
    authorName: UserName,
    now: Date,
  ): Post {
    const parsed = NewPostSchema.safeParse(input);
    if (!parsed.success) {
      throw new InvalidPostException("post inválido", { cause: parsed.error });
    }
    const post = new Post();
    post.author = author;
    post.apply(
      new PostCreatedEvent(
        id.value,
        parsed.data.title.value,
        parsed.data.content.value,
        author.id.value,
        authorName.value,
        now,
      ),
    );
    return post;
  }

  update(changes: PostChanges, now: Date): this {
    const parsed = PostChangesSchema.safeParse(changes);
    if (!parsed.success) {
      throw new InvalidPostException("update inválido", {
        cause: parsed.error,
      });
    }
    const title = parsed.data.title ?? this.title;
    const content = parsed.data.content ?? this.content;
    if (title.equals(this.title) && content.equals(this.content)) {
      throw new InvalidPostException(
        "update sem mudanças: informe um title e/ou content diferente do atual",
      );
    }
    return this.raiseUpdate(title, content, this.loadedTags(), now);
  }

  assignTag(tag: Tag, now: Date): this {
    if (this.hasTag(tag.id)) {
      throw new InvalidPostException(`post já tem a tag ${tag.name}`);
    }
    this.tags.add(tag);
    return this.raiseUpdate(this.title, this.content, this.loadedTags(), now);
  }

  override softDelete(now: Date): this {
    super.softDelete(now);
    this.apply(new PostDeletedEvent(this.id.value, this.version + 1, now));
    return this;
  }

  override restore(now: Date): this {
    super.restore(now);
    this.apply(new PostRestoredEvent(this.id.value, this.version + 1, now));
    return this;
  }

  assertWrittenBy(user: User): this {
    if (!this.author.id.equals(user.id)) {
      throw new PostNotWrittenByException(this.id, user.id);
    }
    return this;
  }

  private authorName(): string {
    return this.author.delegated().name.value;
  }

  private raiseUpdate(
    title: PostTitle,
    content: PostContent,
    tags: readonly Tag[],
    now: Date,
  ): this {
    this.apply(
      new PostUpdatedEvent(
        this.id.value,
        title.value,
        content.value,
        this.author.id.value,
        this.authorName(),
        tags.map(tag => ({ tagId: tag.id.value, name: tag.name.value })),
        this.version + 1,
        this.createdAt,
        now,
      ),
    );
    return this;
  }

  private loadedTags(): Tag[] {
    return this.tags.getItems();
  }

  hasTag(tagId: TagId | string): boolean {
    return this.tags.getIdentifiers().some(id => id.equals(tagId));
  }

  hasNoTags(): boolean {
    return this.tags.count() === 0;
  }

  onPostCreatedEvent(event: PostCreatedEvent): void {
    this.id = PostId.parse(event.postId);
    this.title = PostTitle.parse(event.title);
    this.content = PostContent.parse(event.content);
    this.author = this.sameAuthorOr(event.authorId);
    this.stampCreation(event.occurredAt);
    this.version = 1;
    this.applyRestoration();
    this.tags.removeAll();
  }

  onPostUpdatedEvent(event: PostUpdatedEvent): void {
    this.title = PostTitle.parse(event.title);
    this.content = PostContent.parse(event.content);
    this.touch(event.occurredAt);
    this.version = event.version;
    this.author = this.sameAuthorOr(event.authorId);
    const atHand = new Map(
      this.tags.getItems(false).map(tag => [tag.id.value as string, tag]),
    );
    this.tags.set(
      event.tags.map(
        ({ tagId }) => atHand.get(tagId) ?? rel(Tag, TagId.parse(tagId)),
      ),
    );
  }

  onPostDeletedEvent(event: PostDeletedEvent): void {
    this.applyDeletion(event.occurredAt);
    this.touch(event.occurredAt);
    this.version = event.version;
  }

  onPostRestoredEvent(event: PostRestoredEvent): void {
    this.applyRestoration();
    this.touch(event.occurredAt);
    this.version = event.version;
  }

  private sameAuthorOr(authorId: string): DelegatedRef<Authorship, Author> {
    return this.author?.id.equals(authorId)
      ? this.author
      : delegateRef(Author, UserId.parse(authorId));
  }
}
