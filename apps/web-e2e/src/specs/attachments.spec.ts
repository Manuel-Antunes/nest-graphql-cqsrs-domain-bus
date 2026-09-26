import { expect, test } from '../fixtures/test';
import { Storage } from '../infrastructure/storage/storage';
import { Png } from '../model/post';

const RED_PIXEL = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGO4o6EBAAMQAS0ujiXaAAAAAElFTkSuQmCC',
  'base64',
);

const BLUE_PIXEL = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGPQCLgDAAH4AVXSujU3AAAAAElFTkSuQmCC',
  'base64',
);

const ATTACHED_KEY = new RegExp(
  `^${Storage.ATTACHMENTS_PREFIX}[0-9a-f-]{36}\\.png$`,
);

test.describe
  .serial('a post carries its file from the browser to the bucket', () => {
    let postId: string;
    let firstKey: string;
    let secondKey: string;

    test('creating a post with a file keeps the file under the post, and nothing in staging', async ({
      app,
      accounts,
      authentication,
      publishing,
      postRecords,
      storage,
    }) => {
      await authentication.signIn(accounts.author);

      postId = await publishing.publishInTheForm({
        title: 'Post com anexo',
        content: 'um pixel vermelho',
        attachment: Png.named('red.png', RED_PIXEL),
      });

      await expect(app.newPost.answeredVersion(1)).toBeVisible();
      const stored = await postRecords.attachmentOf(postId);
      expect(stored?.asset).toMatchObject({
        extname: 'png',
        mimeType: 'image/png',
        size: RED_PIXEL.length,
        persisted: true,
      });
      firstKey = stored?.asset?.name as string;
      expect(firstKey).toMatch(ATTACHED_KEY);
      expect(await storage.read(firstKey)).toEqual(RED_PIXEL);
      expect(await storage.keys(Storage.STAGING_PREFIX)).toEqual([]);

      expect(
        await postRecords.whenVersion(postId, 2, 30_000),
        'the saga completes the post before anything else touches it',
      ).toBeDefined();
    });

    test('the post page shows the file, served from the bucket', async ({
      app,
    }) => {
      const post = app.post(postId);

      await post.open();

      await expect(post.attachment).toBeVisible();
      const source = await post.attachmentSource();
      expect(source).toContain(firstKey);

      const served = await app.fetch(source);
      expect(served.status()).toBe(200);
      expect(await served.body()).toEqual(RED_PIXEL);
    });

    test('replacing the file keeps the new one and deletes the old one', async ({
      app,
      accounts,
      authentication,
      postRecords,
      storage,
    }) => {
      await authentication.signIn(accounts.author);
      const post = app.post(postId);
      await post.open();

      await post.replaceAttachment(Png.named('blue.png', BLUE_PIXEL));

      const stored = await postRecords.attachmentOf(postId);
      secondKey = stored?.asset?.name as string;
      expect(secondKey).toMatch(ATTACHED_KEY);
      expect(secondKey).not.toBe(firstKey);
      expect(await storage.read(secondKey)).toEqual(BLUE_PIXEL);
      await expect.poll(() => storage.exists(firstKey)).toBe(false);
      expect(await storage.keys(Storage.STAGING_PREFIX)).toEqual([]);

      await expect(post.attachment).toHaveAttribute(
        'src',
        new RegExp(secondKey),
      );
    });

    test('deleting the post deletes its file', async ({
      app,
      accounts,
      authentication,
      postRecords,
      storage,
    }) => {
      await authentication.signIn(accounts.author);
      const post = app.post(postId);
      await post.open();

      await post.delete();

      const stored = await postRecords.attachmentOf(postId);
      expect(
        stored?.deleted_at,
        'the row stays, deleted logically',
      ).not.toBeNull();
      expect(stored?.asset).toBeNull();
      await expect.poll(() => storage.exists(secondKey)).toBe(false);
      expect(await storage.keys(Storage.ATTACHMENTS_PREFIX)).not.toContain(
        secondKey,
      );
    });
  });
