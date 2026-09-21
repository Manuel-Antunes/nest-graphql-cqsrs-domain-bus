import {
  createMap,
  forMember,
  fromValue,
  mapFrom,
  mapWith,
  mapWithArguments,
  type Mapper,
  type MappingConfiguration,
  type MappingProfile,
} from '@automapper/core';
import { AutomapperProfile, InjectMapper } from '@automapper/nestjs';
import { Injectable } from '@nestjs/common';
import { CreatePostCommand } from '../../application/post/command/create-post.command';
import { UpdatePostCommand } from '../../application/post/command/update-post.command';
import { PostCreatedEvent } from '@nestposts/posts/domain/post/event/post-created.event';
import { PostPreCreatedEvent } from '@nestposts/posts/domain/post/event/post-pre-created.event';
import { PostUpdatedEvent } from '@nestposts/posts/domain/post/event/post-updated.event';
import { Post } from '@nestposts/posts/domain/post/post.entity';
import { PostContent } from '@nestposts/posts/domain/post/vo/post-content';
import { PostId } from '@nestposts/posts/domain/post/vo/post-id';
import { PostTitle } from '@nestposts/posts/domain/post/vo/post-title';
import { Tag } from '@nestposts/posts/domain/tag/tag.entity';
import type { Author } from '@nestposts/users/domain/user/author.entity';
import { UserId } from '@nestposts/users/domain/user/vo/user-id';
import { CreatePostInput } from '../../dto/graphql/create-post.input';
import { PostView } from '../../dto/graphql/post.view';
import { TagView } from '../../dto/graphql/tag.view';
import { UpdatePostInput } from '../../dto/graphql/update-post.input';
import { valueObjectConverter } from './value-object.converter';

const authorOf = (args: Record<string, unknown>): Author => args.author as Author;

@Injectable()
export class PostProfile extends AutomapperProfile {
  constructor(@InjectMapper() mapper: Mapper) {
    super(mapper);
  }

  override get profile(): MappingProfile {
    return (mapper) => {

      createMap(mapper, Tag, TagView);

      createMap(
        mapper,
        Post,
        PostView,
        forMember(
          (view) => view.authorId,
          mapFrom((post) => post.author.id),
        ),
        forMember(
          (view) => view.tags,
          mapWith(TagView, Tag, (post) => post.tags.getItems()),
        ),
      );

      createMap(
        mapper,
        PostPreCreatedEvent,
        PostView,
        forMember(
          (view) => view.id,
          mapFrom((event) => new PostId(event.postId)),
        ),
        forMember(
          (view) => view.createdAt,
          mapFrom((event) => event.occurredAt),
        ),
        forMember(
          (view) => view.updatedAt,
          mapFrom((event) => event.occurredAt),
        ),
        forMember((view) => view.version, fromValue(1)),
        forMember(
          (view) => view.tags,
          mapFrom(() => [] as TagView[]),
        ),
      );

      createMap(
        mapper,
        PostCreatedEvent,
        PostView,
        forMember(
          (view) => view.id,
          mapFrom((event) => new PostId(event.postId)),
        ),
        forMember(
          (view) => view.createdAt,
          mapFrom((event) => event.occurredAt),
        ),
        forMember(
          (view) => view.updatedAt,
          mapFrom((event) => event.occurredAt),
        ),
        forMember(
          (view) => view.tags,
          mapFrom((event) => event.tags.map(({ tagId, name }) => new TagView({ id: tagId, name }))),
        ),
      );

      createMap(
        mapper,
        PostUpdatedEvent,
        PostView,
        forMember(
          (view) => view.id,
          mapFrom((event) => new PostId(event.postId)),
        ),
        forMember(
          (view) => view.updatedAt,
          mapFrom((event) => event.occurredAt),
        ),
        forMember(
          (view) => view.tags,
          mapFrom((event) => event.tags.map(({ tagId, name }) => new TagView({ id: tagId, name }))),
        ),
      );

      createMap(
        mapper,
        CreatePostInput,
        CreatePostCommand.CreatePost,
        forMember(
          (command) => command.postId,
          mapFrom(() => PostId.generate()),
        ),
        forMember(
          (command) => command.authorId,
          mapWithArguments((_input, args) => authorOf(args).id),
        ),
        forMember(
          (command) => command.authorName,
          mapWithArguments((_input, args) => authorOf(args).name),
        ),
      );

      createMap(
        mapper,
        UpdatePostInput,
        UpdatePostCommand.UpdatePost,
        forMember(
          (command) => command.postId,
          mapFrom((input) => input.id.assertValid()),
        ),
      );
    };
  }

  protected override get mappingConfigurations(): MappingConfiguration[] {
    return [
      valueObjectConverter(PostTitle, String),
      valueObjectConverter(PostContent, String),
      valueObjectConverter(UserId, String),
    ];
  }
}
