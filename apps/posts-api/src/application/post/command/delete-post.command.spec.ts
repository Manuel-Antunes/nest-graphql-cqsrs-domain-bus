import { CommandBus } from '@nestjs/cqrs';
import type { TestingModule } from '@nestjs/testing';
import type { TestStorage } from '@nestposts/asset/infrastructure/testing/test-storage';
import { setupTestStorage } from '@nestposts/asset/infrastructure/testing/test-storage';
import { ACTIVE_FILTER } from '@nestposts/platform/infrastructure/persistence/soft-delete/soft-delete-orm.entity';
import { PostDeletedEvent } from '@nestposts/posts/domain/post/event/post-deleted.event';
import { PostNotFoundException } from '@nestposts/posts/domain/post/exception/post-not-found.exception';
import { Post } from '@nestposts/posts/domain/post/post.entity';
import { PostId } from '@nestposts/posts/domain/post/vo/post-id';

import {
  attachmentsOn,
  givenAnUpload,
  storedIn,
} from '../../../../test/support/attachments';
import {
  createCqrsTestingModule,
  freshEm,
  inRequestContext,
  RecordingEvents,
} from '../../../../test/support/cqrs-testing-module';
import {
  givenAnAuthor,
  givenAPost,
} from '../../../../test/support/post-fixtures';
import { UploadArea } from '../../asset/upload-area';
import { PostRequest } from '../../shared/post-request';
import { DeletePostCommand } from './delete-post.command';

describe('DeletePostCommand.Handler', () => {
  let storage: TestStorage;
  let module: TestingModule;
  let events: RecordingEvents;

  const execute = (command: DeletePostCommand.DeletePost) =>
    inRequestContext(module, () =>
      module.get(CommandBus).execute(command, new PostRequest(command.postId)),
    );

  const deletedRow = (id: PostId) =>
    freshEm(module).findOneOrFail(
      Post,
      { id },
      { filters: { [ACTIVE_FILTER]: false } },
    );

  beforeAll(async () => {
    storage = await setupTestStorage();
  });

  afterAll(() => storage?.stop());

  beforeEach(async () => {
    module = await createCqrsTestingModule(
      [DeletePostCommand.Handler],
      attachmentsOn(storage),
    );
    events = new RecordingEvents(module);
  });

  afterEach(() => module.close());

  it('deletes the post logically and publishes PostDeleted', async () => {
    const post = await givenAPost(module);

    await execute(new DeletePostCommand.DeletePost(post.id));

    expect(await freshEm(module).findOne(Post, { id: post.id })).toBeNull();
    expect((await deletedRow(post.id)).isDeleted()).toBe(true);
    expect(events.events).toEqual([
      new PostDeletedEvent(post.id.value, 2, expect.any(Date)),
    ]);
  });

  it('deletes the attached file for good', async () => {
    const author = await givenAnAuthor(module);
    const upload = await givenAnUpload(module, author.id);
    const post = await givenAPost(module, {
      author,
      asset: UploadArea.stage(upload, author.id),
    });
    const stored = post.asset?.name as string;
    await expect(storedIn(module, stored)).resolves.toBe(true);

    await execute(new DeletePostCommand.DeletePost(post.id));

    expect((await deletedRow(post.id)).asset).toBeNull();
    await expect(storedIn(module, stored)).resolves.toBe(false);
  });

  it('answers not found for a post that does not exist', async () => {
    await expect(
      execute(new DeletePostCommand.DeletePost(PostId.generate())),
    ).rejects.toThrow(PostNotFoundException);
  });
});
