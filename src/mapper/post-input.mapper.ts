import { Injectable } from '@nestjs/common';
import { CreatePostCommand } from '../application/post/command/create-post.command';
import { UpdatePostCommand } from '../application/post/command/update-post.command';
import { newPostId, PostId } from '../domain/post/vo/post-id';
import type { CreatePostInput } from '../dto/graphql/create-post.input';
import type { UpdatePostInput } from '../dto/graphql/update-post.input';

/**
 * Input GraphQL → command (protocolo → aplicação). O salto é pequeno, mas é um lugar só: o resolver
 * não monta command, e o command não conhece o `@InputType`.
 *
 * `PostId.parse` é a única validação que acontece aqui — um id que não é UUID nem chega ao command.
 */
@Injectable()
export class PostInputMapper {
  toCreateCommand(input: CreatePostInput): CreatePostCommand.CreatePost {
    return new CreatePostCommand.CreatePost(newPostId(), input.title, input.content, input.author);
  }

  toUpdateCommand(input: UpdatePostInput): UpdatePostCommand.UpdatePost {
    return new UpdatePostCommand.UpdatePost(PostId.parse(input.id), input.title, input.content);
  }
}
